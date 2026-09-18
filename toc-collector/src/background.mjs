import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

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
  const PRIMARY_API_BASE = 'https://api.gczhouwld.com';
  const FALLBACK_API_BASE = 'https://organic-synthesis-gallery.zhou526316.workers.dev';
  const LEGACY_PAGES_API_BASE = 'https://organic-synthesis-gallery-public.pages.dev';
  const DEFAULT_CONFIG = {
  apiBase: PRIMARY_API_BASE,
  apiFallbackBase: FALLBACK_API_BASE,
  writeToken: '',
  browserbaseApiKey: '',
  browserbaseProjectId: '',
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
let state = { cooldowns: {}, nextReminderAt: 0, muteDate: '', pauseUntil: 0, lastSummary: null, browserbase: { contexts: {}, lastRequestByPublisher: {}, status: {}, lastSuccessDoi: {} } };
let tray = null;
let dashboard = window;
let quitting = false;
let cycleRunning = false;
let vpnWatchTimer = null;
let pollTimer = null;
let lastQueue = [];
let configWatcher = null;
let configReloadTimer = null;
let configReloadedAt = 0;
let configReloadMessage = '尚未读取';
const publisherPartition = 'toc-publisher-scan';
let publisherSession = null;
const diagnosticArg = process.argv.find(arg => arg.startsWith('--diagnose-publishers='));
const diagnosticDoiArgs = process.argv.filter(arg => arg.startsWith('--diagnose-doi='));
const diagnosticRequested = Boolean(diagnosticArg) || diagnosticDoiArgs.length > 0;
const requestedDiagnosticPublishers = (diagnosticArg?.split('=')[1] || '')
  .split(',')
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);
const validPublisherNames = ['nature', 'wiley', 'acs', 'science', 'other'];
const invalidDiagnosticPublishers = requestedDiagnosticPublishers.filter(value => !validPublisherNames.includes(value));
const diagnosticPublishers = requestedDiagnosticPublishers.filter(value => validPublisherNames.includes(value));
const requestedDiagnosticDois = diagnosticDoiArgs.map(arg => arg.slice('--diagnose-doi='.length).trim().toLowerCase()).filter(Boolean);
const invalidDiagnosticDois = requestedDiagnosticDois.filter(doi => !/^10\.\d{4,9}\/\S+$/.test(doi));
const forceBrowserFallback = process.argv.includes('--force-browser-fallback');

function getPublisherSession() {
  if (!app.isReady()) throw new Error('publisher_session_before_app_ready');
  if (!publisherSession) {
    publisherSession = session.fromPartition(publisherPartition, { cache: false });
    mark('background.publisher-session.created', { partition: publisherPartition });
  }
  return publisherSession;
}

function safeError(error, limit = 1200) {
  let value = String(error?.message || error || 'unknown_error');
  for (const secret of [config?.writeToken, config?.browserbaseApiKey, process.env.BROWSERBASE_API_KEY]) {
    const token = String(secret || '').trim();
    if (token) value = value.split(token).join('[REDACTED]');
  }
  value = value
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|key|auth|authorization)=)[^&#\s]+/gi, '$1[REDACTED]');
  return value.slice(0, limit);
}


function dataDir() { return path.join(app.getPath('userData')); }
function configPath() { return path.join(dataDir(), 'config.json'); }
function statePath() { return path.join(dataDir(), 'state.json'); }
function logPath() { return path.join(dataDir(), 'collector.log'); }

// This is deliberately an identity check, never a secret display. It makes it
// possible to distinguish two configured profiles without putting a credential
// in the dashboard, bootstrap log, or collector.log.
function tokenIdentity() {
  const token = String(config?.writeToken || '').trim();
  return {
    configured: Boolean(token),
    length: token.length,
    sha256Prefix: token ? createHash('sha256').update(token).digest('hex').slice(0, 8) : '',
  };
}

function configDiagnostic() {
  return {
    userData: dataDir(),
    configPath: configPath(),
    ...tokenIdentity(),
    reloadedAt: configReloadedAt,
    message: configReloadMessage,
  };
}

function browserbaseCredentials() {
  return {
    apiKey: String(process.env.BROWSERBASE_API_KEY || config.browserbaseApiKey || '').trim(),
    projectId: String(process.env.BROWSERBASE_PROJECT_ID || config.browserbaseProjectId || '').trim(),
  };
}

function browserbaseDiagnostic() {
  const credentials = browserbaseCredentials();
  const info = state.browserbase || {};
  return {
    configured: Boolean(credentials.apiKey),
    projectConfigured: Boolean(credentials.projectId),
    acs: info.status?.acs || '尚未尝试',
    wiley: info.status?.wiley || '尚未尝试',
    lastSuccessDoi: info.lastSuccessDoi?.acs || info.lastSuccessDoi?.wiley || '',
  };
}

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
  await reloadConfig({ source: 'startup' });
  state = await loadJson(statePath(), state);
  state.cooldowns = state.cooldowns && typeof state.cooldowns === 'object' ? state.cooldowns : {};
  state.browserbase = state.browserbase && typeof state.browserbase === 'object' ? state.browserbase : {};
  state.browserbase.contexts = state.browserbase.contexts && typeof state.browserbase.contexts === 'object' ? state.browserbase.contexts : {};
  state.browserbase.lastRequestByPublisher = state.browserbase.lastRequestByPublisher && typeof state.browserbase.lastRequestByPublisher === 'object' ? state.browserbase.lastRequestByPublisher : {};
  state.browserbase.status = state.browserbase.status && typeof state.browserbase.status === 'object' ? state.browserbase.status : {};
  state.browserbase.lastSuccessDoi = state.browserbase.lastSuccessDoi && typeof state.browserbase.lastSuccessDoi === 'object' ? state.browserbase.lastSuccessDoi : {};
  // Retry only generic failures from older collectors; keep all specific cooldowns.
  if (state.collectorRecoveryVersion !== '0.1.6') {
    state.cooldowns = Object.fromEntries(Object.entries(state.cooldowns).filter(([, value]) => value?.reason !== 'collector_failed'));
    state.collectorRecoveryVersion = '0.1.6';
  }
  await saveState();
  startConfigWatch();
  // Login settings change only after the user explicitly toggles the tray option.
}

async function reloadConfig({ source = 'manual' } = {}) {
  const previous = tokenIdentity();
  config = await loadJson(configPath(), DEFAULT_CONFIG);
  let configChanged = false;
  if (!String(config.apiBase || '').trim() || String(config.apiBase).replace(/\/$/, '') === LEGACY_PAGES_API_BASE) {
    config.apiBase = PRIMARY_API_BASE;
    configChanged = true;
  }
  if (!String(config.apiFallbackBase || '').trim()) {
    config.apiFallbackBase = FALLBACK_API_BASE;
    configChanged = true;
  }
  if (configChanged) await fsp.writeFile(configPath(), JSON.stringify(config, null, 2));
  const current = tokenIdentity();
  configReloadedAt = Date.now();
  configReloadMessage = `已从 ${source === 'watch' ? '磁盘保存事件' : source} 重新加载`;
  await log('config_reloaded', {
    source,
    userData: dataDir(),
    configPath: configPath(),
    configured: current.configured,
    tokenLength: current.length,
    tokenSha256Prefix: current.sha256Prefix,
    changed: previous.sha256Prefix !== current.sha256Prefix || previous.length !== current.length,
  });
  mark('background.config.reloaded', configDiagnostic());
  return current;
}

async function saveConfig(source = 'collector') {
  await fsp.mkdir(dataDir(), { recursive: true });
  await fsp.writeFile(configPath(), JSON.stringify(config, null, 2));
  await reloadConfig({ source });
  refreshDashboard();
}

function startConfigWatch() {
  if (configWatcher) return;
  try {
    configWatcher = fs.watch(dataDir(), { persistent: false }, (_event, filename) => {
      if (String(filename || '').toLowerCase() !== 'config.json') return;
      if (configReloadTimer) clearTimeout(configReloadTimer);
      configReloadTimer = setTimeout(() => {
        configReloadTimer = null;
        void guard('config-reload', async () => {
          await reloadConfig({ source: 'watch' });
          stageStatus = '设置已保存并生效，无需重启。';
          rebuildTrayMenu();
          await refreshDashboard();
        });
      }, 150);
    });
  } catch (error) {
    mark('background.config.watch.error', safeError(error));
  }
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

function transportDetails(error) {
  const messages = [];
  const codes = [];
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current.message) messages.push(String(current.message));
    if (current.code) codes.push(String(current.code));
    current = current.cause;
  }
  const combined = `${codes.join(' ')} ${messages.join(' ')}`;
  const kind = /abort|timeout|timed out/i.test(combined) ? 'timeout'
    : /ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED|dns/i.test(combined) ? 'dns'
      : /CERT|TLS|SSL|handshake/i.test(combined) ? 'tls'
        : 'network';
  return { kind, code: codes[0] || '', message: safeError(messages.join(' <- ') || error, 500) };
}

async function logApiEvent(event, detail) {
  mark(`background.${event}`, detail);
  try { await log(event, detail); } catch {}
}

async function api(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const readOnly = method === 'GET' || method === 'HEAD';
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (!readOnly && config.writeToken) headers.Authorization = `Bearer ${String(config.writeToken).trim()}`;
  const bases = [...new Set([
    String(config.apiBase || PRIMARY_API_BASE).replace(/\/$/, ''),
    String(config.apiFallbackBase || FALLBACK_API_BASE).replace(/\/$/, ''),
  ].filter(Boolean))];
  let lastError = null;
  for (let index = 0; index < bases.length; index += 1) {
    const requestedUrl = `${bases[index]}${pathname}`;
    const startedAt = Date.now();
    try {
      // Node's fetch honors the user's HTTP(S)_PROXY environment on Windows. Chromium's
      // session fetch can close workers.dev connections on the same machine even when
      // the endpoint is healthy, so API traffic uses the Node transport explicitly.
      const res = await globalThis.fetch(requestedUrl, { ...options, method, headers, signal: AbortSignal.timeout(30000) });
      const finalUrl = res.url || requestedUrl;
      const text = await res.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch { body = { text }; }
      const detail = { method, transport: 'node-fetch', attempt: index + 1, fallback: index > 0, status: res.status, elapsedMs: Date.now() - startedAt, requestedUrl, finalUrl };
      if (res.ok) {
        await logApiEvent('api_request_success', detail);
        return body;
      }
      const message = safeError(body.error || text.slice(0, 160), 300);
      lastError = new Error(`API ${res.status}: ${message}; finalUrl=${finalUrl}`);
      await logApiEvent('api_request_http_error', { ...detail, message });
      if (res.status < 500 || index === bases.length - 1) throw lastError;
    } catch (error) {
      if (error === lastError) throw error;
      const transport = transportDetails(error);
      lastError = new Error(`API ${transport.kind}: ${transport.message}; requestedUrl=${requestedUrl}`);
      await logApiEvent('api_request_transport_error', { method, transport: 'node-fetch', attempt: index + 1, fallback: index > 0, elapsedMs: Date.now() - startedAt, requestedUrl, finalUrl: requestedUrl, ...transport });
      if (index === bases.length - 1) throw lastError;
    }
  }
  throw lastError || new Error(`API request failed: ${method} ${pathname}`);
}

async function fetchQueue() {
  const payload = await api('/api/media/bridge-queue');
  if (!Array.isArray(payload.items)) throw new Error('Queue API returned no items array');
  lastQueue = payload.items.filter(item => item && typeof item === 'object' && typeof item.doi === 'string');
  await log('api_get_queue_success', { count: lastQueue.length });
  return lastQueue;
}

async function probeUrl(url) {
  try {
    const res = await getPublisherSession().fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000) });
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

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function tagAttributes(tag) {
  const attrs = {};
  for (const match of String(tag || '').matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attrs[String(match[1] || '').toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function stripHtml(value) {
  return decodeHtml(String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function absoluteMediaUrl(value, pageUrl) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim(), pageUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function sourceFromAttrs(attrs, pageUrl) {
  for (const key of ['data-src', 'data-original', 'data-lazy-src', 'data-image-src']) {
    const candidate = absoluteMediaUrl(attrs[key], pageUrl);
    if (candidate) return candidate;
  }
  if (attrs.srcset) {
    const options = attrs.srcset.split(',').map((part, index) => {
      const [url, descriptor = ''] = part.trim().split(/\s+/, 2);
      const score = descriptor.endsWith('w') ? Number.parseFloat(descriptor) : descriptor.endsWith('x') ? Number.parseFloat(descriptor) * 10000 : index;
      return { url, score: Number.isFinite(score) ? score : index };
    }).filter(option => option.url).sort((a, b) => b.score - a.score);
    for (const option of options) {
      const candidate = absoluteMediaUrl(option.url, pageUrl);
      if (candidate) return candidate;
    }
  }
  return absoluteMediaUrl(attrs.src, pageUrl);
}

function htmlCandidate(html, pageUrl) {
  const rows = [];
  const add = (src, text, kind, width = 0, height = 0) => {
    const absolute = absoluteMediaUrl(src, pageUrl);
    if (!absolute) return;
    if (/logo|icon|avatar|cover|advert|banner/i.test(String(text || ''))) return;
    rows.push({ src: absolute, text: String(text || ''), kind, width: Number(width) || 0, height: Number(height) || 0 });
  };

  for (const match of String(html || '').matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    const key = String(attrs.name || attrs.property || attrs.itemprop || '').toLowerCase();
    if (['citation_graphical_abstract', 'citation_toc_graphic', 'citation_abstract_image'].includes(key)) {
      add(attrs.content, key, 'official');
    }
  }

  let figures = 0;
  for (const match of String(html || '').matchAll(/<figure\b[\s\S]*?<\/figure>/gi)) {
    if (++figures > 80) break;
    const block = match[0];
    const img = block.match(/<img\b[^>]*>/i)?.[0];
    if (!img) continue;
    const attrs = tagAttributes(img);
    const text = [attrs.alt, attrs.title, attrs.id, attrs.class, stripHtml(block).slice(0, 1400)].filter(Boolean).join(' ');
    const official = /visual\s*abstract|graphical\s*abstract|abstract\s*image|toc\s*(graphic|image)|table\s*of\s*contents/i.test(text);
    const fig1 = /(^|\b)(fig(?:ure)?\.?\s*1)(\b|[:.])/i.test(text);
    if (official || fig1) add(sourceFromAttrs(attrs, pageUrl), text, official ? 'official' : 'figure1', attrs.width, attrs.height);
  }

  let images = 0;
  for (const match of String(html || '').matchAll(/<img\b[^>]*>/gi)) {
    if (++images > 500) break;
    const attrs = tagAttributes(match[0]);
    const text = [attrs.alt, attrs.title, attrs.id, attrs.class].filter(Boolean).join(' ');
    const official = /visual\s*abstract|graphical\s*abstract|abstract\s*image|toc\s*(graphic|image)|table\s*of\s*contents/i.test(text);
    const fig1 = /(^|\b)(fig(?:ure)?\.?\s*1)(\b|[:.])/i.test(text);
    if (official || fig1) add(sourceFromAttrs(attrs, pageUrl), text, official ? 'official' : 'figure1', attrs.width, attrs.height);
  }

  rows.sort((a,b) => {
    const sa = semanticScore(a.text) + (a.kind === 'official' ? 20 : 0) + Math.min(20, ((a.width||0)*(a.height||0))/100000);
    const sb = semanticScore(b.text) + (b.kind === 'official' ? 20 : 0) + Math.min(20, ((b.width||0)*(b.height||0))/100000);
    return sb - sa;
  });
  return rows[0] || null;
}

function browserbasePublisher(doi) {
  const publisher = classify(doi);
  return ['acs', 'wiley'].includes(publisher) ? publisher : '';
}

function browserbaseManualRequired(html, pageUrl = '') {
  const signal = `${pageUrl}\n${String(html || '').slice(0, 250000)}`;
  return /captcha|verify you are human|security check|access denied|challenge-platform|just a moment|enable javascript|unusual traffic/i.test(signal);
}

function browserbaseOwnsDoi(doi, pageUrl, html) {
  const normalized = String(doi || '').trim().toLowerCase();
  if (!normalized) return false;
  const publisher = browserbasePublisher(normalized);
  let domainMatches = false;
  try {
    const hostname = new URL(pageUrl).hostname.toLowerCase();
    domainMatches = publisher === 'acs' ? hostname.endsWith('pubs.acs.org') : hostname.endsWith('onlinelibrary.wiley.com');
  } catch {}
  const encoded = normalized.replace('/', '%2f');
  const bodyHasDoi = String(html || '').toLowerCase().includes(normalized) || String(html || '').toLowerCase().includes(encoded);
  return domainMatches && bodyHasDoi;
}

function browserbaseHeaders(apiKey) {
  return { 'X-BB-API-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };
}

async function browserbaseApi(pathname, options = {}) {
  const { apiKey } = browserbaseCredentials();
  if (!apiKey) throw new Error('browserbase_missing_credentials');
  const response = await globalThis.fetch(`https://api.browserbase.com/v1${pathname}`, {
    ...options,
    headers: { ...browserbaseHeaders(apiKey), ...(options.headers || {}) },
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { text }; }
  if (!response.ok) throw new Error(`browserbase_http_${response.status}:${safeError(body.message || body.error || text, 240)}`);
  return body;
}

async function waitForBrowserbaseSlot(publisher) {
  const last = Number(state.browserbase?.lastRequestByPublisher?.[publisher] || 0);
  const delay = Math.max(0, 1800 - (Date.now() - last));
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  state.browserbase.lastRequestByPublisher[publisher] = Date.now();
  await saveState();
}

async function browserbaseContext(publisher) {
  const existing = String(state.browserbase.contexts?.[publisher] || '').trim();
  if (existing) return existing;
  const { projectId } = browserbaseCredentials();
  const payload = { name: `organic-synthesis-gallery-${publisher}` };
  if (projectId) payload.projectId = projectId;
  const created = await browserbaseApi('/contexts', { method: 'POST', body: JSON.stringify(payload) });
  if (!created?.id) throw new Error('browserbase_context_missing_id');
  state.browserbase.contexts[publisher] = String(created.id);
  await saveState();
  await log('browserbase_context_created', { publisher, contextId: String(created.id) });
  return String(created.id);
}

async function inspectArticleBrowserbase(doi, url, localReason = '') {
  const publisher = browserbasePublisher(doi);
  if (!publisher) return null;
  const credentials = browserbaseCredentials();
  if (!credentials.apiKey) {
    state.browserbase.status[publisher] = 'missing';
    await saveState();
    await log('browserbase_missing', { publisher, doi, localReason });
    return null;
  }
  let browser;
  try {
    await waitForBrowserbaseSlot(publisher);
    const contextId = await browserbaseContext(publisher);
    const payload = {
      keepAlive: false,
      browserSettings: { context: { id: contextId, persist: true } },
    };
    if (credentials.projectId) payload.projectId = credentials.projectId;
    const sessionInfo = await browserbaseApi('/sessions', { method: 'POST', body: JSON.stringify(payload) });
    if (!sessionInfo?.connectUrl) throw new Error('browserbase_session_missing_connect_url');
    const { chromium } = await import('playwright-core');
    browser = await chromium.connectOverCDP(sessionInfo.connectUrl);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.max(15000, Number(config.publisherTimeoutSeconds || 35) * 1000) });
    await page.waitForTimeout(Math.min(5000, Math.max(500, Number(config.headlessWaitMs || 1500))));
    const pageUrl = page.url();
    const html = await page.content();
    if (browserbaseManualRequired(html, pageUrl)) {
      state.browserbase.status[publisher] = 'manual_required';
      await saveState();
      await log('browserbase_manual_required', { publisher, doi, url: pageUrl, sessionId: String(sessionInfo.id || '') });
      throw new Error('manual_required');
    }
    if (!browserbaseOwnsDoi(doi, pageUrl, html)) throw new Error('browserbase_doi_mismatch');
    const candidate = htmlCandidate(html, pageUrl);
    if (!candidate) throw new Error('browserbase_no_candidate');
    state.browserbase.status[publisher] = 'connected';
    state.browserbase.lastSuccessDoi[publisher] = doi;
    await saveState();
    await log('browserbase_success', { publisher, doi, kind: candidate.kind, url: pageUrl, sessionId: String(sessionInfo.id || '') });
    return { url: pageUrl, candidate, method: 'browserbase' };
  } catch (error) {
    const reason = safeError(error, 300);
    if (reason !== 'manual_required') state.browserbase.status[publisher] = `failed: ${reason}`;
    await saveState();
    await log('browserbase_failed', { publisher, doi, reason, localReason });
    if (reason === 'manual_required') throw error;
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
    refreshDashboard();
  }
}

async function publisherFetch(url, options, fallbackEvent) {
  try {
    return await getPublisherSession().fetch(url, options);
  } catch (error) {
    const reason = safeError(error, 300);
    if (!/ERR_BLOCKED_BY_CLIENT|ERR_CONNECTION_CLOSED/i.test(reason)) throw error;
    await log(fallbackEvent, { url, reason, transport: 'node-fetch' });
    return globalThis.fetch(url, options);
  }
}

async function inspectArticleHtml(doi, url, browserError = '') {
  try {
    const res = await publisherFetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(Math.max(15000, Number(config.publisherTimeoutSeconds || 35) * 1000)),
    }, 'publisher_html_node_fallback');
    if (!res.ok) throw new Error(`publisher_http_${res.status}`);
    const html = await res.text();
    const finalUrl = res.url || url;
    const candidate = htmlCandidate(html, finalUrl);
    if (candidate) {
      await log('html_fallback_success', { doi, kind: candidate.kind, url: finalUrl, browserError });
      return { url: finalUrl, candidate, method: 'html' };
    }
    let challengeUrl = false;
    try {
      const parsed = new URL(finalUrl);
      challengeUrl = parsed.hostname === 'idp.nature.com' && parsed.pathname.startsWith('/transit');
    } catch {}
    const challenge = challengeUrl || /captcha|verify you are human|access denied|challenge-platform|client challenge|just a moment|enable javascript/i.test(html.slice(0, 250000));
    await log('html_fallback_no_candidate', { doi, url: finalUrl, challenge, browserError });
    if (challenge) throw new Error('publisher_access_challenge');
    return { url: finalUrl, candidate: null, method: 'html' };
  } catch (error) {
    if (!/publisher_access_challenge/.test(String(error?.message || error))) {
      await log('html_fallback_no_candidate', { doi, reason: safeError(error, 300).replace(/https?:\/\/\S+/g, '<url>'), browserError });
    }
    throw error;
  }
}

async function inspectArticle(doi) {
  const url = articleUrl(doi);
  let win = null;
  let publisherTimer;
  try {
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        session: getPublisherSession(),
        sandbox: true,
        contextIsolation: true,
        images: true,
      },
    });
    if (forceBrowserFallback) throw new Error('net::ERR_BLOCKED_BY_CLIENT (diagnostic injection)');
    await Promise.race([
      win.loadURL(url, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36' }),
      new Promise((_, reject) => { publisherTimer = setTimeout(() => reject(new Error('publisher_timeout')), Math.max(1, Number(config.publisherTimeoutSeconds) || 35) * 1000); }),
    ]);
    clearTimeout(publisherTimer);
    publisherTimer = null;
    await new Promise(r => setTimeout(r, Number(config.headlessWaitMs) || 5000));
    const result = await win.webContents.executeJavaScript(`(() => {
      const abs = u => { try { const value = new URL(u, location.href); return ['http:','https:'].includes(value.protocol) ? value.href : '' } catch { return '' } };
      const rows = [];
      for (const m of document.querySelectorAll('meta')) {
        const key = (m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('itemprop') || '').toLowerCase();
        if (['citation_graphical_abstract','citation_toc_graphic','citation_abstract_image'].includes(key)) {
          const src = abs(m.content || ''); if (src) rows.push({ src, text: key, width: 0, height: 0, kind: 'official' });
        }
      }
      for (const img of document.images) {
        const srcset = (img.getAttribute('srcset') || '').split(',').map(x => x.trim().split(/\\s+/)[0]).filter(Boolean).reverse();
        const sources = [img.getAttribute('data-src'), img.getAttribute('data-original'), img.getAttribute('data-lazy-src'), img.getAttribute('data-image-src'), img.currentSrc, ...srcset, img.src];
        const src = sources.map(abs).find(Boolean) || '';
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
    if (!rows[0]) throw new Error('browser_no_candidate');
    await log('browser_success', { doi, kind: rows[0].kind, url: result?.href || url });
    return { url: result?.href || url, candidate: rows[0], method: 'browser' };
  } catch (error) {
    const browserError = safeError(error, 300).replace(/https?:\/\/\S+/g, '<url>');
    if (publisherTimer) clearTimeout(publisherTimer);
    publisherTimer = null;
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
    await log('browser_blocked_fallback', { doi, browserError, blockedByClient: /ERR_BLOCKED_BY_CLIENT/i.test(browserError) });
    let htmlResult = null;
    try { htmlResult = await inspectArticleHtml(doi, url, browserError); }
    catch (htmlError) {
      await log('publisher_html_fallback_failed', { doi, reason: safeError(htmlError, 300) });
    }
    if (htmlResult?.candidate) return htmlResult;
    const browserbaseResult = await inspectArticleBrowserbase(doi, url, browserError);
    if (browserbaseResult?.candidate) return browserbaseResult;
    // PDF is deliberately a later, independent resolver. Reaching this marker
    // means local browser, direct HTML, and Browserbase produced no visual.
    await log('pdf_fallback_next', { doi, localCandidate: Boolean(htmlResult?.candidate), browserbaseConfigured: browserbaseDiagnostic().configured });
    return htmlResult || { url, candidate: null, method: 'no_candidate' };
  } finally {
    if (publisherTimer) clearTimeout(publisherTimer);
    if (win && !win.isDestroyed()) win.destroy();
  }
}

async function imageData(url, referer) {
  const res = await publisherFetch(url, { headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', Referer: referer }, signal: AbortSignal.timeout(30000) }, 'publisher_image_node_fallback');
  if (!res.ok) throw new Error(`image_http_${res.status}`);
  let buffer = Buffer.from(await res.arrayBuffer());
  const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].toLowerCase();
  if (!type.startsWith('image/')) throw new Error(`image_content_type_${type || 'missing'}`);
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

async function processItem(item, { ignoreCooldown = false, inspectOnly = false } = {}) {
  const doi = String(item.doi || '').toLowerCase();
  if (!doi || (!ignoreCooldown && cooldownActive(doi))) return { doi, status: 'skipped' };
  try {
    const inspected = await inspectArticle(doi);
    const c = inspected.candidate;
    if (!c) {
      if (!inspectOnly) {
        await setCooldown(doi, 'semantic_media_not_found', 72 * 60 * 60 * 1000);
        await report(doi, 'extract', 'partial', 'semantic_media_not_found', inspected.url);
      }
      return { doi, status: 'no_candidate' };
    }
    let data;
    try {
      data = await imageData(c.src, inspected.url);
    } catch (error) {
      await log('image_download_failed', { doi, kind: c.kind, reason: safeError(error, 300) });
      throw error;
    }
    if (inspectOnly) {
      await log('upload_failed', { doi, kind: c.kind, reason: 'write_token_missing_inspection_only' });
      return { doi, status: 'inspection_only', reason: 'write_token_missing', kind: c.kind, source: inspected.method };
    }
    if (!config.writeToken) throw new Error('write_token_missing');
    try {
      if (c.kind === 'official') {
        await api('/api/toc/import', { method: 'POST', body: JSON.stringify({ doi, articleUrl: inspected.url, imageData: data, replace: Boolean(item.suspiciousToc) }) });
        await report(doi, 'upload', 'complete', 'collector_official_toc', inspected.url);
      } else {
        await api('/api/article-figures/import', { method: 'POST', body: JSON.stringify({ doi, articleUrl: inspected.url, id: 'figure-1', label: 'Figure 1', caption: c.text?.slice(0,500) || 'Figure 1', imageData: data, order: 0 }) });
        await report(doi, 'upload', 'partial', 'collector_figure1_fallback', inspected.url);
      }
      await log('upload_success', { doi, kind: c.kind, source: inspected.method });
    } catch (error) {
      await log('upload_failed', { doi, kind: c.kind, reason: safeError(error, 300) });
      throw error;
    }
    await clearCooldown(doi);
    return { doi, status: c.kind };
  } catch (error) {
    const msg = safeError(error, 1000);
    let reason = 'collector_failed', ms = 6 * 60 * 60 * 1000;
    if (/write_token_missing|^API (401|403)/.test(msg)) { reason = 'collector_auth'; ms = 30*60*1000; }
    else if (/^API /.test(msg)) { reason = 'upload_failed'; ms = 60*60*1000; }
    else if (/^image_/.test(msg)) { reason = 'image_download_failed'; ms = 8*60*60*1000; }
    else if (/manual_required/.test(msg)) { reason = 'manual_required'; ms = 24*60*60*1000; }
    else if (/403|access|captcha|challenge/i.test(msg)) { reason = 'publisher_access_blocked'; ms = 24*60*60*1000; }
    else if (/429|rate/i.test(msg)) { reason = 'publisher_rate_limited'; ms = 24*60*60*1000; }
    else if (/timeout/i.test(msg)) { reason = 'publisher_timeout'; ms = 8*60*60*1000; }
    else if (/ERR_BLOCKED_BY_CLIENT/i.test(msg)) { reason = 'publisher_client_blocked'; ms = 30*60*1000; }
    if (!inspectOnly) {
      await setCooldown(doi, reason, ms);
      await report(doi, 'process', 'failed', reason, articleUrl(doi));
    }
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

async function runPublisherDiagnostics() {
  const publishers = [...new Set(diagnosticPublishers)];
  const requestedDois = [...new Set(requestedDiagnosticDois)];
  if (!publishers.length && !requestedDois.length) return null;
  const inspectOnly = !String(config.writeToken || '').trim();
  await log('publisher_diagnostic_write_mode', { writeEnabled: !inspectOnly });
  const results = [];
  const missing = [];
  const targets = requestedDois.length
    ? requestedDois.map(doi => ({ selector: doi, publisher: classify(doi), item: lastQueue.find(entry => String(entry.doi || '').toLowerCase() === doi) }))
    : publishers.map(publisher => ({ selector: publisher, publisher, item: lastQueue.find(entry => classify(entry.doi) === publisher) }));
  for (const target of targets) {
    const { publisher, item, selector } = target;
    if (!item) {
      missing.push(selector);
      await log('publisher_diagnostic_no_queue_item', { publisher, selector });
      continue;
    }
    const doi = String(item.doi || '').toLowerCase();
    await log('publisher_diagnostic_selected', { publisher, doi });
    const result = await processItem(item, { ignoreCooldown: true, inspectOnly });
    results.push({ publisher, doi, status: result?.status || 'unknown', reason: result?.reason || '' });
    await log('publisher_diagnostic_result', results.at(-1));
  }
  const summary = { mode: requestedDois.length ? 'doi' : 'publisher', requested: requestedDois.length ? requestedDois : publishers, completed: results.length, missing, writeEnabled: !inspectOnly, results };
  state.lastPublisherDiagnostic = { at: Date.now(), ...summary };
  await saveState();
  await log('publisher_diagnostic_complete', summary);
  return summary;
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
  if (diagnosticRequested) {
    await log('publisher_diagnostic_normal_cycle_blocked', { manual });
    return;
  }
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
  const configInfo = configDiagnostic();
  const browserbaseInfo = browserbaseDiagnostic();
  const tokenState = configInfo.configured
    ? `已配置 · 长度 ${configInfo.length} · SHA-256 ${configInfo.sha256Prefix}`
    : '缺失 · 长度 0';
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
  </style></head><body><div class="wrap"><h1>Organic Synthesis Gallery · TOC Collector</h1><div class="sub">程序已启动 · TOC Collector ${escapeHtml(app.getVersion())} started successfully<br>${closeHint}</div>
  <div class="status">${escapeHtml(stageStatus)}</div>${errors ? `<div class="errors" role="alert">后台错误（主窗口继续运行）${errors}</div>` : ''}
  <div class="grid">
    <div class="card"><div class="k">当前队列</div><div class="v">${lastQueue.length}</div></div>
    <div class="card"><div class="k">ACS / Wiley 待处理</div><div class="v">${restricted}</div></div>
    <div class="card"><div class="k">ACS 网络</div><div class="v ${net.acs ? 'ok':'bad'}">${net.acs === true ? '可访问' : net.acs === false ? '不可访问' : '待检测'}</div></div>
    <div class="card"><div class="k">Wiley 网络</div><div class="v ${net.wiley ? 'ok':'bad'}">${net.wiley === true ? '可访问' : net.wiley === false ? '不可访问' : '待检测'}</div></div>
    <div class="card"><div class="k">写入密钥</div><div class="v" style="font-size:14px">${escapeHtml(tokenState)}</div></div>
    <div class="card"><div class="k">Browserbase</div><div class="v" style="font-size:14px">${browserbaseInfo.configured ? '已配置' : '缺失'} · ACS ${escapeHtml(browserbaseInfo.acs)} · Wiley ${escapeHtml(browserbaseInfo.wiley)}${browserbaseInfo.lastSuccessDoi ? `<br>最近成功：${escapeHtml(browserbaseInfo.lastSuccessDoi)}` : ''}</div></div>
    <div class="card"><div class="k">上次处理</div><div class="v" style="font-size:14px">${summary.at ? `成功 ${Number(summary.success||0)} · 失败 ${Number(summary.failed||0)}` : '尚未采集'}</div></div>
  </div>
  <div class="buttons">${stageResults.collector === 'ok' && !diagnosticRequested ? '<a href="collector:check">现在检查一次</a>' : ''}<a href="collector:config">打开当前设置</a><a href="collector:reload-config">重新加载设置</a><a href="collector:log">查看日志</a>${validTray() ? '<a href="collector:hide">隐藏到托盘</a>' : ''}<a href="collector:quit">退出程序</a></div>
  <table><thead><tr><th>最近待处理 DOI</th><th>来源</th></tr></thead><tbody>${rows || '<tr><td colspan="2">当前无待处理项目</td></tr>'}</tbody></table>
  <div class="note">实际 userData：<code>${escapeHtml(configInfo.userData)}</code><br>实际 config.json：<code>${escapeHtml(configInfo.configPath)}</code><br>设置状态：${escapeHtml(configInfo.message)}${configInfo.reloadedAt ? `（${escapeHtml(new Date(configInfo.reloadedAt).toLocaleString())}）` : ''}<br>VPN 程序：${vpnState}<br>自动检查间隔：${Number(config.pollMinutes||10)} 分钟；提醒间隔：${Number(config.reminderHours||6)} 小时。</div>
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
    { label: diagnosticRequested ? '发布商诊断模式' : cycleRunning ? '正在检查…' : '现在检查一次', enabled: !diagnosticRequested && !cycleRunning && stageResults.collector === 'ok', click: guard('manual-cycle', () => runCycle(true)) },
    { label: `查看当前队列 (${lastQueue.length})`, click: guard('queue-dialog', () => dialog.showMessageBox(dashboard, { title: '当前 TOC 队列', message: lastQueue.slice(0,60).map(x => `${x.doi}  [${classify(x.doi)}]`).join('\n') || '当前无待处理项目' })) },
    { label: '打开当前进程设置文件', click: guard('open-config', () => shell.openPath(configPath())) },
    { label: '重新加载设置（无需重启）', click: guard('reload-config', async () => { await reloadConfig({ source: 'tray' }); stageStatus = '设置已重新加载并生效，无需重启。'; rebuildTrayMenu(); await refreshDashboard(); }) },
    { label: '查看日志', click: guard('open-log', () => shell.openPath(logPath())) },
    { type: 'separator' },
    { label: '今天不再提醒', type: 'checkbox', checked: state.muteDate === todayKey(), click: guard('mute-reminders', async item => { state.muteDate = item.checked ? todayKey() : ''; await saveState(); }) },
    { label: '开机自动运行', type: 'checkbox', checked: Boolean(config.autoStart), click: guard('login-setting', async item => { app.setLoginItemSettings({ openAtLogin: item.checked, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: ['--background'] }); config.autoStart = item.checked; await saveConfig('tray-login-setting'); rebuildTrayMenu(); }) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
}

async function handleFailure(failedStage, error) {
  const message = safeError(error);
  backgroundErrors.push({ stage: failedStage, message });
  mark(`background.${failedStage}.error`, { message });
  try { await log(`${failedStage} failed`, message); } catch {}
  reportError(failedStage, new Error(message));
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
    if (action === 'reload-config') { await reloadConfig({ source: 'dashboard' }); stageStatus = '设置已重新加载并生效，无需重启。'; rebuildTrayMenu(); await refreshDashboard(); }
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
  if (configReloadTimer) clearTimeout(configReloadTimer);
  if (configWatcher) configWatcher.close();
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
    if (diagnosticRequested && ((!diagnosticPublishers.length && !requestedDiagnosticDois.length) || invalidDiagnosticPublishers.length || invalidDiagnosticDois.length)) {
      throw new Error(`invalid_publisher_diagnostic_args:${[...invalidDiagnosticPublishers, ...invalidDiagnosticDois].join(',') || 'empty'}`);
    }
    if (diagnosticRequested) {
      await log('publisher diagnostic mode enabled', { publishers: [...new Set(diagnosticPublishers)], dois: [...new Set(requestedDiagnosticDois)] });
    } else if (!String(config.writeToken || '').trim()) {
      await log('collector waiting for writeToken; no collection performed');
      mark('background.collector.waiting-for-token');
    } else {
      firstCycleTimer = setTimeout(guard('first-cycle', () => runCycle(false)), 2500);
    }
    if (!diagnosticRequested) {
      pollTimer = setInterval(guard('scheduled-cycle', () => runCycle(false)), Math.max(3, Number(config.pollMinutes) || 10) * 60 * 1000);
    }
  },
};
const lastStage = stageNames.indexOf(stage);
if (lastStage === -1) throw new Error(`Unknown background startup stage: ${stage}`);
for (const name of stageNames.slice(0, lastStage + 1)) {
  if (disposed) break;
  await runStage(name, steps[name]);
}
let publisherDiagnostic = null;
if (stage === 'collector' && stageResults.collector === 'ok' && diagnosticRequested) {
  publisherDiagnostic = await runPublisherDiagnostics();
}
stageStatus = stage === 'collector'
  ? diagnosticRequested
    ? `发布商诊断完成 ${Number(publisherDiagnostic?.completed || 0)} 项；${Number(publisherDiagnostic?.missing?.length || 0)} 类队列缺项`
    : (!String(config.writeToken || '').trim() ? '等待配置 writeToken；尚未开始采集或上传' : '后台初始化完成，等待首次采集')
  : `启动诊断已完成至 ${currentStage}；后续功能未启动`;
if (backgroundErrors.length) stageStatus += `；${backgroundErrors.length} 个后台错误，详见下方`;
try { rebuildTrayMenu(); } catch (error) { await handleFailure('tray-menu', error); }
await refreshDashboard();
return { stageResults, dispose, showDashboard };
}
