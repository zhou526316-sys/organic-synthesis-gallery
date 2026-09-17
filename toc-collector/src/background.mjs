import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

// This module is imported only after the startup window has rendered.
// All Electron objects, filesystem operations and background work are deferred.
export async function initializeBackground({ window, stage = 'collector', mark = () => {}, reportError = () => {} }) {
const { app, BrowserWindow, Tray, Menu, dialog, Notification, shell, nativeImage, session } = await import('electron');
const stageNames = ['logging', 'config', 'tray', 'network', 'api', 'collector'];
const stageResults = {};
const backgroundErrors = [];
let currentStage = 'logging';
let stageStatus = '后台功能准备中';
let network = {};
let firstCycleTimer = null;
let disposed = false;
let renderPending = false;
let renderPromise = null;
const failStage = process.argv.find(arg => arg.startsWith('--fail-stage='))?.split('=')[1];
const DEFAULT_CONFIG = {
  apiBase: 'https://organic-synthesis-gallery-public.pages.dev',
  writeToken: '',
  vpnExecutable: '',
  autoStart: false,
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
let dashboard = window;
let quitting = false;
let cycleRunning = false;
let vpnWatchTimer = null;
let pollTimer = null;
let lastQueue = [];


function dataDir() { return path.join(app.getPath('userData')); }
function configPath() { return path.join(dataDir(), 'config.json'); }
function statePath() { return path.join(dataDir(), 'state.json'); }
function logPath() { return path.join(dataDir(), 'collector.log'); }

async function log(message, extra = '') {
  const line = `[${new Date().toISOString()}] ${message}${extra ? ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}\n`;
  await fsp.mkdir(dataDir(), { recursive: true });
  await fsp.appendFile(logPath(), line);
  console.log(line.trim());
}

async function loadJson(file, fallback) {
  try {
    const value = JSON.parse(await fsp.readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid JSON object: ${file}`);
    return { ...fallback, ...value };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...fallback };
    throw error;
  }
}

async function saveState() {
  await fsp.mkdir(dataDir(), { recursive: true });
  await fsp.writeFile(statePath(), JSON.stringify(state, null, 2));
}

async function ensureConfig() {
  await fsp.mkdir(dataDir(), { recursive: true });
  if (!fs.existsSync(configPath())) await fsp.writeFile(configPath(), JSON.stringify(DEFAULT_CONFIG, null, 2));
  config = await loadJson(configPath(), DEFAULT_CONFIG);
  state = await loadJson(statePath(), state);
  state.cooldowns = state.cooldowns && typeof state.cooldowns === 'object' ? state.cooldowns : {};
  await saveState();
  // Login settings change only after the user explicitly toggles the tray option.
}

function todayKey() { return new Date().toISOString().slice(0, 10); }
function classify(doi = '') {
  const d = String(doi).toLowerCase();
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
  if (config.writeToken) headers.Authorization = `Bearer ${String(config.writeToken).trim()}`;
  const res = await session.defaultSession.fetch(`${String(config.apiBase).replace(/\/$/, '')}${pathname}`, { ...options, headers, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { text }; }
  if (!res.ok) throw new Error(`API ${res.status}: ${body.error || text.slice(0, 160)}`);
  return body;
}

async function fetchQueue() {
  const payload = await api('/api/media/bridge-queue');
  if (!Array.isArray(payload.items)) throw new Error('Queue API returned no items array');
  lastQueue = payload.items.filter(item => item && typeof item === 'object' && typeof item.doi === 'string');
  return lastQueue;
}

async function probeUrl(url) {
  try {
    const res = await session.defaultSession.fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000) });
    return res.status >= 200 && res.status < 400;
  } catch (error) {
    mark('background.network.probe.error', { url, message: String(error?.message || error) });
    return false;
  }
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
  let publisherTimer;
  try {
    await Promise.race([
      win.loadURL(url, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36' }),
      new Promise((_, reject) => { publisherTimer = setTimeout(() => reject(new Error('publisher_timeout')), Math.max(1, Number(config.publisherTimeoutSeconds) || 35) * 1000); }),
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
  } finally {
    if (publisherTimer) clearTimeout(publisherTimer);
    if (!win.isDestroyed()) win.destroy();
  }
}

async function imageData(url, referer) {
  const res = await session.defaultSession.fetch(url, { headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', Referer: referer }, signal: AbortSignal.timeout(30000) });
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
  try { await api('/api/media/attempt', { method: 'POST', body: JSON.stringify({ doi, source: 'windows-toc-collector', stage, outcome, rootCause, url }) }); }
  catch (error) { await handleFailure('attempt-report', error); }
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
      try {
        const vpn = spawn(config.vpnExecutable, [], { detached: true, stdio: 'ignore', windowsHide: true });
        vpn.once('error', guard('vpn-launch', async error => { throw error; }));
        vpn.unref();
      } catch (error) { await handleFailure('vpn-launch', error); }
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
  if (vpnWatchTimer || disposed) return;
  vpnWatchTimer = setInterval(guard('vpn-watch', async () => {
    const net = await networkState();
    if (net.acs || net.wiley) {
      clearInterval(vpnWatchTimer); vpnWatchTimer = null;
      await log('VPN/network became usable', net);
      await runCycle(true);
    }
  }), 30000);
}

async function runCycle(manual = false) {
  if (cycleRunning || disposed || stageResults.collector !== 'ok') return;
  cycleRunning = true;
  try {
    config = await loadJson(configPath(), DEFAULT_CONFIG);
    if (!String(config.writeToken || '').trim()) {
      stageStatus = '等待配置 writeToken；尚未开始采集或上传';
      await log('collector waiting for writeToken; no collection performed');
      mark('background.collector.waiting-for-token');
      refreshDashboard();
      return;
    }
    const queue = await fetchQueue();
    const net = await networkState();
    network = net;
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
      if (Notification.isSupported()) {
        try { new Notification({ title: 'TOC Collector', body: `本次补充 ${success} 篇，${failed} 篇等待下次重试。`, silent: true }).show(); }
        catch (error) { await handleFailure('notification', error); }
      }
    }
    rebuildTrayMenu();
    refreshDashboard();
  } catch (error) {
    await handleFailure('collector-cycle', error);
  } finally { cycleRunning = false; }
}


function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function dashboardHtml() {
  const summary = state.lastSummary || {};
  const net = Object.keys(network).length ? network : (summary.net || {});
  const restricted = lastQueue.filter(x => ['acs','wiley'].includes(classify(x.doi))).length;
  const rows = lastQueue.slice(0, 12).map(x => `<tr><td>${escapeHtml(x.doi)}</td><td>${escapeHtml(classify(x.doi).toUpperCase())}</td></tr>`).join('');
  const tokenState = config.writeToken ? '已配置' : '未配置（只能检查，不能上传）';
  const vpnState = config.vpnExecutable ? escapeHtml(config.vpnExecutable) : '未设置';
  const errors = backgroundErrors.map(item => `<div><strong>${escapeHtml(item.stage)}</strong>: ${escapeHtml(item.message)}</div>`).join('');
  const closeHint = validTray() ? '关闭窗口可隐藏到托盘。' : '关闭窗口将退出程序。';
  return `<!doctype html><html><head><meta charset="utf-8"><title>TOC Collector</title><style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#f6f7f9;color:#202124}.wrap{max-width:720px;margin:auto;padding:24px}
    h1{font-size:23px;margin:0 0 6px}.sub{color:#666;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:14px 0}
    .card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:14px}.k{font-size:12px;color:#777}.v{font-size:19px;margin-top:4px}
    .ok{color:#188038}.bad{color:#b3261e}.buttons{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.buttons a{background:#fff;border:1px solid #bbb;border-radius:8px;padding:9px 13px;text-decoration:none;color:#202124}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden}td,th{padding:8px 10px;border-bottom:1px solid #eee;text-align:left;font-size:13px}
    .note{font-size:12px;color:#666;margin-top:12px;line-height:1.5}.errors{background:#fff1f0;border:1px solid #d77;border-radius:8px;padding:12px;margin:12px 0;overflow-wrap:anywhere}.status{padding:10px 0;color:#174d32}
  </style></head><body><div class="wrap"><h1>Organic Synthesis Gallery · TOC Collector</h1><div class="sub">程序已启动 · TOC Collector 0.1.4 started successfully<br>${closeHint}</div>
  <div class="status">${escapeHtml(stageStatus)}</div>${errors ? `<div class="errors" role="alert">后台错误（主窗口继续运行）${errors}</div>` : ''}
  <div class="grid">
    <div class="card"><div class="k">当前队列</div><div class="v">${lastQueue.length}</div></div>
    <div class="card"><div class="k">ACS / Wiley 待处理</div><div class="v">${restricted}</div></div>
    <div class="card"><div class="k">ACS 网络</div><div class="v ${net.acs ? 'ok':'bad'}">${net.acs === true ? '可访问' : net.acs === false ? '不可访问' : '待检测'}</div></div>
    <div class="card"><div class="k">Wiley 网络</div><div class="v ${net.wiley ? 'ok':'bad'}">${net.wiley === true ? '可访问' : net.wiley === false ? '不可访问' : '待检测'}</div></div>
    <div class="card"><div class="k">写入密钥</div><div class="v" style="font-size:14px">${escapeHtml(tokenState)}</div></div>
    <div class="card"><div class="k">上次处理</div><div class="v" style="font-size:14px">${summary.at ? `成功 ${Number(summary.success||0)} · 失败 ${Number(summary.failed||0)}` : '尚未采集'}</div></div>
  </div>
  <div class="buttons">${stageResults.collector === 'ok' ? '<a href="collector:check">现在检查一次</a>' : ''}<a href="collector:config">打开设置</a><a href="collector:log">查看日志</a>${validTray() ? '<a href="collector:hide">隐藏到托盘</a>' : ''}<a href="collector:quit">退出程序</a></div>
  <table><thead><tr><th>最近待处理 DOI</th><th>来源</th></tr></thead><tbody>${rows || '<tr><td colspan="2">当前无待处理项目</td></tr>'}</tbody></table>
  <div class="note">VPN 程序：${vpnState}<br>自动检查间隔：${Number(config.pollMinutes||10)} 分钟；提醒间隔：${Number(config.reminderHours||6)} 小时。</div>
  </div></body></html>`;
}

function refreshDashboard() {
  if (!dashboard || dashboard.isDestroyed() || disposed) return Promise.resolve();
  renderPending = true;
  if (renderPromise) return renderPromise;
  // Serialize loads so rapidly completing stages cannot abort one another.
  renderPromise = (async () => {
    while (renderPending && !disposed && !dashboard.isDestroyed()) {
      renderPending = false;
      try { await dashboard.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(dashboardHtml())}`); }
      catch (error) {
        if (disposed || dashboard.isDestroyed() || error.code === 'ERR_ABORTED') continue;
        mark('background.dashboard.render.error', { message: String(error?.message || error) });
        reportError('dashboard-render', error);
      }
    }
  })().finally(() => { renderPromise = null; });
  return renderPromise;
}

function showDashboard() {
  if (!dashboard || dashboard.isDestroyed()) return;
  refreshDashboard();
  dashboard.show();
  dashboard.focus();
}

function validTray() { return Boolean(tray && !tray.isDestroyed()); }

function trayIcon() {
  // Electron nativeImage does not decode SVG. A BGRA bitmap works on Windows.
  const pixels = Buffer.alloc(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const offset = (y * 16 + x) * 4;
    const light = x >= 4 && x < (y >= 10 ? 10 : 12) && [4, 5, 7, 8, 10, 11].includes(y);
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = light ? 255 : 38;
    pixels[offset + 3] = 255;
  }
  const icon = nativeImage.createFromBitmap(pixels, { width: 16, height: 16, scaleFactor: 1 });
  if (icon.isEmpty()) throw new Error('Tray icon bitmap is empty');
  mark('background.tray.icon', { empty: icon.isEmpty(), size: icon.getSize() });
  return icon;
}

function rebuildTrayMenu() {
  if (!validTray()) return;
  const summary = state.lastSummary;
  const status = summary ? `队列 ${summary.queue} · 上次成功 ${summary.success}` : '尚未检查';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `TOC Collector · ${status}`, enabled: false },
    { label: '打开状态面板', click: () => showDashboard() },
    { type: 'separator' },
    { label: cycleRunning ? '正在检查…' : '现在检查一次', enabled: !cycleRunning && stageResults.collector === 'ok', click: guard('manual-cycle', () => runCycle(true)) },
    { label: `查看当前队列 (${lastQueue.length})`, click: guard('queue-dialog', () => dialog.showMessageBox(dashboard, { title: '当前 TOC 队列', message: lastQueue.slice(0,60).map(x => `${x.doi}  [${classify(x.doi)}]`).join('\n') || '当前无待处理项目' })) },
    { label: '打开设置文件', click: guard('open-config', () => shell.openPath(configPath())) },
    { label: '查看日志', click: guard('open-log', () => shell.openPath(logPath())) },
    { type: 'separator' },
    { label: '今天不再提醒', type: 'checkbox', checked: state.muteDate === todayKey(), click: guard('mute-reminders', async item => { state.muteDate = item.checked ? todayKey() : ''; await saveState(); }) },
    { label: '开机自动运行', type: 'checkbox', checked: Boolean(config.autoStart), click: guard('login-setting', async item => { app.setLoginItemSettings({ openAtLogin: item.checked, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: ['--background'] }); config.autoStart = item.checked; await fsp.writeFile(configPath(), JSON.stringify(config, null, 2)); }) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
}

async function handleFailure(failedStage, error) {
  const message = String(error?.message || error);
  backgroundErrors.push({ stage: failedStage, message });
  mark(`background.${failedStage}.error`, { message, stack: String(error?.stack || error) });
  try { await log(`${failedStage} failed`, String(error?.stack || error)); } catch {}
  reportError(failedStage, error);
  refreshDashboard();
}

function guard(name, action) {
  return (...args) => Promise.resolve().then(() => action(...args)).catch(error => handleFailure(name, error));
}

async function runStage(name, action) {
  currentStage = name;
  stageStatus = `正在初始化：${name}`;
  mark(`background.${name}.begin`);
  refreshDashboard();
  try {
    if (failStage === name) throw new Error(`Injected startup failure: ${name}`);
    await action();
    stageResults[name] = 'ok';
    mark(`background.${name}.ok`);
  } catch (error) {
    stageResults[name] = 'error';
    await handleFailure(name, error);
  }
}

function onClose(event) {
  if (quitting) return;
  if (validTray()) {
    event.preventDefault();
    dashboard.hide();
  } else {
    quitting = true;
    app.quit();
  }
}

function onNavigate(event, url) {
  if (!url.startsWith('collector:')) return;
  event.preventDefault();
  const action = url.slice('collector:'.length);
  void guard(`dashboard-${action}`, async () => {
    if (action === 'check') await runCycle(true);
    if (action === 'config') await shell.openPath(configPath());
    if (action === 'log') await shell.openPath(logPath());
    if (action === 'hide' && validTray()) dashboard.hide();
    if (action === 'quit') app.quit();
  })();
}

function dispose() {
  disposed = true;
  quitting = true;
  if (firstCycleTimer) clearTimeout(firstCycleTimer);
  if (pollTimer) clearInterval(pollTimer);
  if (vpnWatchTimer) clearInterval(vpnWatchTimer);
  if (validTray()) tray.destroy();
}

if (!dashboard || dashboard.isDestroyed()) throw new Error('Startup window is unavailable');
dashboard.on('close', onClose);
dashboard.webContents.on('will-navigate', onNavigate);
app.once('before-quit', dispose);
const steps = {
  logging: async () => {
    await log('collector background initialization', { version: app.getVersion(), configPath: configPath() });
  },
  config: ensureConfig,
  tray: async () => {
    tray = new Tray(trayIcon());
    tray.setToolTip('Organic Synthesis Gallery TOC Collector');
    tray.on('click', showDashboard);
    tray.on('double-click', showDashboard);
    rebuildTrayMenu();
  },
  network: async () => {
    network = await networkState();
    mark('background.network.result', network);
    await log('network probe complete', network);
  },
  api: async () => {
    if (stageResults.config !== 'ok') throw new Error('API initialization requires a valid config.json');
    await fetchQueue();
    mark('background.api.queue', { count: lastQueue.length });
    await log('read-only queue loaded', { count: lastQueue.length });
  },
  collector: async () => {
    if (stageResults.config !== 'ok') throw new Error('Collector requires a valid config.json');
    if (!String(config.writeToken || '').trim()) {
      await log('collector waiting for writeToken; no collection performed');
      mark('background.collector.waiting-for-token');
    } else {
      firstCycleTimer = setTimeout(guard('first-cycle', () => runCycle(false)), 2500);
    }
    pollTimer = setInterval(guard('scheduled-cycle', () => runCycle(false)), Math.max(3, Number(config.pollMinutes) || 10) * 60 * 1000);
  },
};
const lastStage = stageNames.indexOf(stage);
if (lastStage === -1) throw new Error(`Unknown background startup stage: ${stage}`);
for (const name of stageNames.slice(0, lastStage + 1)) {
  if (disposed) break;
  await runStage(name, steps[name]);
}
stageStatus = stage === 'collector'
  ? (!String(config.writeToken || '').trim() ? '等待配置 writeToken；尚未开始采集或上传' : '后台初始化完成，等待首次采集')
  : `启动诊断已完成至 ${currentStage}；后续功能未启动`;
if (backgroundErrors.length) stageStatus += `；${backgroundErrors.length} 个后台错误，详见下方`;
try { rebuildTrayMenu(); } catch (error) { await handleFailure('tray-menu', error); }
await refreshDashboard();
return { stageResults, dispose, showDashboard };
}
