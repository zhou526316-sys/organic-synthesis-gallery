import { app, BrowserWindow, Tray, Menu, dialog, Notification, shell, nativeImage, session } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_CONFIG = {
  apiBase: 'https://organic-synthesis-gallery-public.pages.dev',
  writeToken: '',
  vpnExecutable: '',
  autoStart: true,
  pollMinutes: 10,
  reminderHours: 6,
  minRestrictedBacklog: 1,
  maxPerCycle: 12,
  publisherTimeoutSeconds: 35,
  headlessWaitMs: 5000,
};

let config = { ...DEFAULT_CONFIG };
let state = { cooldowns: {}, nextReminderAt: 0, muteDate: '', pauseUntil: 0, lastSummary: null };
let tray = null;
let cycleRunning = false;
let vpnWatchTimer = null;
let pollTimer = null;
let lastQueue = [];

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => tray?.popUpContextMenu());

function dataDir() { return path.join(app.getPath('userData')); }
function configPath() { return path.join(dataDir(), 'config.json'); }
function statePath() { return path.join(dataDir(), 'state.json'); }
function logPath() { return path.join(dataDir(), 'collector.log'); }

async function log(message, extra = '') {
  const line = `[${new Date().toISOString()}] ${message}${extra ? ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}\n`;
  try { await fsp.mkdir(dataDir(), { recursive: true }); await fsp.appendFile(logPath(), line); } catch {}
  console.log(line.trim());
}

async function loadJson(file, fallback) {
  try { return { ...fallback, ...JSON.parse(await fsp.readFile(file, 'utf8')) }; } catch { return { ...fallback }; }
}

async function saveState() {
  try { await fsp.mkdir(dataDir(), { recursive: true }); await fsp.writeFile(statePath(), JSON.stringify(state, null, 2)); } catch {}
}

async function ensureConfig() {
  await fsp.mkdir(dataDir(), { recursive: true });
  if (!fs.existsSync(configPath())) await fsp.writeFile(configPath(), JSON.stringify(DEFAULT_CONFIG, null, 2));
  config = await loadJson(configPath(), DEFAULT_CONFIG);
  state = await loadJson(statePath(), state);
  app.setLoginItemSettings({ openAtLogin: Boolean(config.autoStart), path: process.execPath });
}

function todayKey() { return new Date().toISOString().slice(0, 10); }
function classify(doi = '') {
  const d = doi.toLowerCase();
  if (d.startsWith('10.1021/')) return 'acs';
  if (d.startsWith('10.1002/')) return 'wiley';
  if (d.startsWith('10.1038/')) return 'nature';
  if (d.startsWith('10.1126/')) return 'science';
  return 'other';
}
function articleUrl(doi) {
  const p = classify(doi);
  if (p === 'acs') return `https://pubs.acs.org/doi/${doi}`;
  if (p === 'wiley') return `https://onlinelibrary.wiley.com/doi/${doi}`;
  if (p === 'nature') return `https://www.nature.com/articles/${doi.split('/')[1]}`;
  if (p === 'science') return `https://www.science.org/doi/${doi}`;
  return `https://doi.org/${doi}`;
}

async function api(pathname, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (config.writeToken) headers.Authorization = `Bearer ${config.writeToken.trim()}`;
  const res = await fetch(`${String(config.apiBase).replace(/\/$/, '')}${pathname}`, { ...options, headers, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { text }; }
  if (!res.ok) throw new Error(`API ${res.status}: ${body.error || text.slice(0, 160)}`);
  return body;
}

async function fetchQueue() {
  const payload = await api('/api/media/bridge-queue');
  lastQueue = Array.isArray(payload.items) ? payload.items : [];
  return lastQueue;
}

async function probeUrl(url) {
  try {
    const res = await session.defaultSession.fetch(url, { method: 'GET', redirect: 'follow' });
    return res.status >= 200 && res.status < 400;
  } catch { return false; }
}

async function networkState() {
  const [acs, wiley] = await Promise.all([
    probeUrl('https://pubs.acs.org/'),
    probeUrl('https://onlinelibrary.wiley.com/'),
  ]);
  return { acs, wiley };
}

function cooldownActive(doi) {
  const item = state.cooldowns?.[doi.toLowerCase()];
  return item && Number(item.until || 0) > Date.now();
}
async function setCooldown(doi, reason, ms) {
  state.cooldowns[doi.toLowerCase()] = { reason, until: Date.now() + ms };
  const entries = Object.entries(state.cooldowns).sort((a,b) => Number(b[1]?.until||0)-Number(a[1]?.until||0)).slice(0, 800);
  state.cooldowns = Object.fromEntries(entries);
  await saveState();
}
async function clearCooldown(doi) { delete state.cooldowns[doi.toLowerCase()]; await saveState(); }

function semanticScore(text) {
  const t = String(text || '').toLowerCase();
  if (/abstract\s*image/.test(t)) return 100;
  if (/graphical\s*abstract|visual\s*abstract/.test(t)) return 95;
  if (/toc\s*(graphic|image)|table\s*of\s*contents/.test(t)) return 90;
  return 0;
}

async function inspectArticle(doi) {
  const url = articleUrl(doi);
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, images: true } });
  try {
    await Promise.race([
      win.loadURL(url, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('publisher_timeout')), Number(config.publisherTimeoutSeconds) * 1000)),
    ]);
    await new Promise(r => setTimeout(r, Number(config.headlessWaitMs) || 5000));
    const result = await win.webContents.executeJavaScript(`(() => {
      const abs = u => { try { return new URL(u, location.href).href } catch { return '' } };
      const rows = [];
      for (const m of document.querySelectorAll('meta')) {
        const key = (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase();
        if (['citation_graphical_abstract','citation_toc_graphic','citation_abstract_image'].includes(key)) {
          const src = abs(m.content || ''); if (src) rows.push({ src, text: key, width: 0, height: 0, kind: 'official' });
        }
      }
      for (const img of document.images) {
        const src = abs(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '');
        if (!src) continue;
        const root = img.closest('figure,section,div,aside') || img.parentElement;
        const text = [img.alt, img.title, img.id, img.className, root?.getAttribute?.('aria-label'), root?.innerText?.slice(0,500)].filter(Boolean).join(' ');
        const low = text.toLowerCase();
        if (/logo|icon|avatar|cover|advert|banner/.test(low)) continue;
        const official = /visual\\s*abstract|graphical\\s*abstract|abstract\\s*image|toc\\s*(graphic|image)|table\\s*of\\s*contents/.test(low);
        const fig1 = /(^|\\b)(fig(?:ure)?\\.?\\s*1)(\\b|[:.])/i.test(text);
        if (official || fig1) rows.push({ src, text, width: img.naturalWidth || 0, height: img.naturalHeight || 0, kind: official ? 'official' : 'figure1' });
      }
      return { title: document.title, href: location.href, rows };
    })()`);
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    rows.sort((a,b) => {
      const sa = semanticScore(a.text) + (a.kind === 'official' ? 20 : 0) + Math.min(20, ((a.width||0)*(a.height||0))/100000);
      const sb = semanticScore(b.text) + (b.kind === 'official' ? 20 : 0) + Math.min(20, ((b.width||0)*(b.height||0))/100000);
      return sb - sa;
    });
    return { url: result?.href || url, candidate: rows[0] || null };
  } finally { if (!win.isDestroyed()) win.destroy(); }
}

async function imageData(url, referer) {
  const res = await session.defaultSession.fetch(url, { headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', Referer: referer } });
  if (!res.ok) throw new Error(`image_http_${res.status}`);
  let buffer = Buffer.from(await res.arrayBuffer());
  const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].toLowerCase();
  if (buffer.length > 3_800_000 || /webp|avif/.test(type)) {
    const img = nativeImage.createFromBuffer(buffer);
    if (img.isEmpty()) throw new Error('image_decode_failed');
    const size = img.getSize();
    const scale = Math.min(1, 2800 / Math.max(1,size.width), 2000 / Math.max(1,size.height));
    const resized = scale < 1 ? img.resize({ width: Math.max(1, Math.round(size.width*scale)), height: Math.max(1, Math.round(size.height*scale)) }) : img;
    buffer = resized.toJPEG(84);
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  }
  const mime = ['image/png','image/jpeg','image/gif','image/webp'].includes(type) ? type : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function report(doi, stage, outcome, rootCause, url = '') {
  if (!config.writeToken) return;
  try { await api('/api/media/attempt', { method: 'POST', body: JSON.stringify({ doi, source: 'windows-toc-collector', stage, outcome, rootCause, url }) }); } catch {}
}

async function processItem(item) {
  const doi = String(item.doi || '').toLowerCase();
  if (!doi || cooldownActive(doi)) return { skipped: true };
  try {
    const inspected = await inspectArticle(doi);
    const c = inspected.candidate;
    if (!c) {
      await setCooldown(doi, 'semantic_media_not_found', 72 * 60 * 60 * 1000);
      await report(doi, 'extract', 'partial', 'semantic_media_not_found', inspected.url);
      return { doi, status: 'no_candidate' };
    }
    const data = await imageData(c.src, inspected.url);
    if (!config.writeToken) throw new Error('write_token_missing');
    if (c.kind === 'official') {
      await api('/api/toc/import', { method: 'POST', body: JSON.stringify({ doi, articleUrl: inspected.url, imageData: data, replace: Boolean(item.suspiciousToc) }) });
      await report(doi, 'upload', 'complete', 'collector_official_toc', inspected.url);
    } else {
      await api('/api/article-figures/import', { method: 'POST', body: JSON.stringify({ doi, articleUrl: inspected.url, id: 'figure-1', label: 'Figure 1', caption: c.text?.slice(0,500) || 'Figure 1', imageData: data, order: 0 }) });
      await report(doi, 'upload', 'partial', 'collector_figure1_fallback', inspected.url);
    }
    await clearCooldown(doi);
    return { doi, status: c.kind };
  } catch (error) {
    const msg = String(error?.message || error);
    let reason = 'collector_failed', ms = 6 * 60 * 60 * 1000;
    if (/403|access|captcha|challenge/i.test(msg)) { reason = 'publisher_access_blocked'; ms = 24*60*60*1000; }
    else if (/429|rate/i.test(msg)) { reason = 'publisher_rate_limited'; ms = 24*60*60*1000; }
    else if (/timeout/i.test(msg)) { reason = 'publisher_timeout'; ms = 8*60*60*1000; }
    else if (/write_token_missing|401/.test(msg)) { reason = 'collector_auth'; ms = 30*60*1000; }
    await setCooldown(doi, reason, ms);
    await report(doi, 'process', 'failed', reason, articleUrl(doi));
    await log('paper failed', { doi, reason, msg });
    return { doi, status: 'failed', reason };
  }
}

async function processBatch(items) {
  const selected = items.filter(x => !cooldownActive(String(x.doi||''))).slice(0, Math.max(1, Number(config.maxPerCycle)||12));
  const results = [];
  for (const item of selected) results.push(await processItem(item));
  return results;
}

async function maybeNotifyRestricted(restrictedCount) {
  if (restrictedCount < Number(config.minRestrictedBacklog || 1)) return;
  if (Date.now() < Number(state.pauseUntil || 0)) return;
  if (state.muteDate === todayKey()) return;
  if (Date.now() < Number(state.nextReminderAt || 0)) return;

  const choice = await dialog.showMessageBox({
    type: 'info',
    title: 'TOC Collector',
    message: `有 ${restrictedCount} 篇文献等待通过 VPN 补充 TOC`,
    detail: '当前 ACS / Wiley 访问不可用。',
    buttons: ['立即处理', '6小时后提醒', '今天不再提醒', '更多选项'],
    defaultId: 0,
    cancelId: 1,
  });
  if (choice.response === 0) {
    if (config.vpnExecutable && fs.existsSync(config.vpnExecutable)) {
      try { spawn(config.vpnExecutable, [], { detached: true, stdio: 'ignore' }).unref(); } catch {}
    }
    startVpnWatch();
  } else if (choice.response === 1) {
    state.nextReminderAt = Date.now() + Number(config.reminderHours || 6) * 60 * 60 * 1000;
  } else if (choice.response === 2) {
    state.muteDate = todayKey();
  } else {
    const more = await dialog.showMessageBox({
      title: 'TOC Collector · 更多选项',
      message: '选择暂停提醒时间；后台仍继续检测 VPN。',
      buttons: ['暂停3天', '暂停7天', '打开设置文件', '查看日志', '取消'],
      cancelId: 4,
    });
    if (more.response === 0) state.pauseUntil = Date.now() + 3*24*60*60*1000;
    if (more.response === 1) state.pauseUntil = Date.now() + 7*24*60*60*1000;
    if (more.response === 2) await shell.openPath(configPath());
    if (more.response === 3) await shell.openPath(logPath());
  }
  await saveState();
}

function startVpnWatch() {
  if (vpnWatchTimer) return;
  vpnWatchTimer = setInterval(async () => {
    const net = await networkState();
    if (net.acs || net.wiley) {
      clearInterval(vpnWatchTimer); vpnWatchTimer = null;
      await log('VPN/network became usable', net);
      void runCycle(true);
    }
  }, 30000);
}

async function runCycle(manual = false) {
  if (cycleRunning) return;
  cycleRunning = true;
  try {
    config = await loadJson(configPath(), DEFAULT_CONFIG);
    const queue = await fetchQueue();
    const net = await networkState();
    const open = queue.filter(x => ['nature','science','other'].includes(classify(x.doi)));
    const restricted = queue.filter(x => ['acs','wiley'].includes(classify(x.doi)));
    const runnableRestricted = restricted.filter(x => (classify(x.doi)==='acs' ? net.acs : net.wiley));
    const runnable = [...open, ...runnableRestricted];
    const results = await processBatch(runnable);
    const success = results.filter(x => ['official','figure1'].includes(x?.status)).length;
    const failed = results.filter(x => x?.status === 'failed').length;
    state.lastSummary = { at: Date.now(), queue: queue.length, processed: results.length, success, failed, net };
    await saveState();
    await log('cycle complete', state.lastSummary);
    if (!net.acs || !net.wiley) {
      const waiting = restricted.filter(x => (classify(x.doi)==='acs' ? !net.acs : !net.wiley)).length;
      if (waiting > 0) {
        startVpnWatch();
        if (!manual) await maybeNotifyRestricted(waiting);
      }
    }
    if (manual || success > 0 || failed > 0) {
      new Notification({ title: 'TOC Collector', body: `本次补充 ${success} 篇，${failed} 篇等待下次重试。`, silent: true }).show();
    }
    rebuildTrayMenu();
  } catch (error) {
    await log('cycle failed', String(error?.stack || error));
    if (manual) dialog.showErrorBox('TOC Collector', String(error?.message || error));
  } finally { cycleRunning = false; }
}

function trayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect rx="7" width="32" height="32" fill="#222"/><path d="M8 9h16v3H8zm0 6h16v3H8zm0 6h11v3H8z" fill="#fff"/></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`).resize({ width: 16, height: 16 });
}

function rebuildTrayMenu() {
  if (!tray) return;
  const summary = state.lastSummary;
  const status = summary ? `队列 ${summary.queue} · 上次成功 ${summary.success}` : '尚未检查';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `TOC Collector · ${status}`, enabled: false },
    { type: 'separator' },
    { label: cycleRunning ? '正在检查…' : '现在检查一次', enabled: !cycleRunning, click: () => void runCycle(true) },
    { label: `查看当前队列 (${lastQueue.length})`, click: async () => dialog.showMessageBox({ title: '当前 TOC 队列', message: lastQueue.slice(0,60).map(x => `${x.doi}  [${classify(x.doi)}]`).join('\n') || '当前无待处理项目' }) },
    { label: '打开设置文件', click: () => void shell.openPath(configPath()) },
    { label: '查看日志', click: () => void shell.openPath(logPath()) },
    { type: 'separator' },
    { label: '今天不再提醒', type: 'checkbox', checked: state.muteDate === todayKey(), click: async item => { state.muteDate = item.checked ? todayKey() : ''; await saveState(); } },
    { label: '开机自动运行', type: 'checkbox', checked: Boolean(config.autoStart), click: async item => { config.autoStart = item.checked; await fsp.writeFile(configPath(), JSON.stringify(config, null, 2)); app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath }); } },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
}

app.whenReady().then(async () => {
  await ensureConfig();
  tray = new Tray(trayIcon());
  tray.setToolTip('Organic Synthesis Gallery TOC Collector');
  rebuildTrayMenu();
  await log('collector started', { version: app.getVersion(), configPath: configPath() });
  setTimeout(() => void runCycle(false), 2500);
  pollTimer = setInterval(() => void runCycle(false), Math.max(3, Number(config.pollMinutes)||10) * 60 * 1000);
});

app.on('window-all-closed', event => event.preventDefault?.());
app.on('before-quit', () => { if (pollTimer) clearInterval(pollTimer); if (vpnWatchTimer) clearInterval(vpnWatchTimer); });
