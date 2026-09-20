import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { classifyPublisher, extractPublisherMediaCandidates, pickBestPublisherMediaCandidate, primaryArticleUrlForDoi, publisherFromUrl as publisherFromAdapter, publisherHostMatches as publisherHostMatchesAdapter } from './publisher-adapters.mjs';

// This module is imported only after the startup window has rendered.
// All Electron objects, filesystem operations and background work are deferred.
export async function initializeBackground({ window, stage = 'collector', mark = () => {}, reportError = () => {} }) {
const { app, BrowserWindow, Tray, Menu, dialog, Notification, shell, nativeImage, session, ipcMain } = await import('electron');
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
  localScanDelayMs: 5000,
  localInteractiveSettleMs: 12000,
  localAuthWaitMinutes: 8,
  publisherTimeoutSeconds: 35,
  headlessWaitMs: 5000,
};

let config = { ...DEFAULT_CONFIG };
let state = { cooldowns: {}, nextReminderAt: 0, muteDate: '', pauseUntil: 0, lastSummary: null, browserbase: { contexts: {}, lastRequestByPublisher: {}, status: {}, lastSuccessDoi: {}, acceptance: {}, manual: {}, batch: null } };
let tray = null;
let dashboard = window;
let quitting = false;
let cycleRunning = false;
let liveScan = {
  running: false,
  total: 0,
  current: 0,
  currentDoi: '',
  saved: 0,
  noOfficial: 0,
  failed: 0,
  pdfDownloaded: 0,
  other: 0,
  startedAt: 0,
  finishedAt: 0,
  recent: [],
};
let vpnWatchTimer = null;
let pollTimer = null;
let lastQueue = [];
let configWatcher = null;
let configReloadTimer = null;
let configReloadedAt = 0;
let configReloadMessage = '尚未读取';
const publisherPartition = 'toc-publisher-scan';
let publisherSession = null;
const localPublisherSessions = new Map();
const localPublisherWindows = new Map();
const manualBrowserbaseSessions = new Map();
const diagnosticArg = process.argv.find(arg => arg.startsWith('--diagnose-publishers='));
const diagnosticDoiArgs = process.argv.filter(arg => arg.startsWith('--diagnose-doi='));
const diagnosticRequested = Boolean(diagnosticArg) || diagnosticDoiArgs.length > 0;
const requestedDiagnosticPublishers = (diagnosticArg?.split('=')[1] || '')
  .split(',')
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);
const validPublisherNames = ['nature', 'wiley', 'acs', 'rsc', 'elsevier', 'science', 'ccs', 'other'];
const invalidDiagnosticPublishers = requestedDiagnosticPublishers.filter(value => !validPublisherNames.includes(value));
const diagnosticPublishers = requestedDiagnosticPublishers.filter(value => validPublisherNames.includes(value));
const requestedDiagnosticDois = diagnosticDoiArgs.map(arg => arg.slice('--diagnose-doi='.length).trim().toLowerCase()).filter(Boolean);
const invalidDiagnosticDois = requestedDiagnosticDois.filter(doi => !/^10\.\d{4,9}\/\S+$/.test(doi));
const forceBrowserFallback = process.argv.includes('--force-browser-fallback');
const localOnlyMode = process.argv.includes('--local-only');
const scanAllMode = process.argv.includes('--scan-all');
const officialOnlyMode = process.argv.includes('--official-only');
const showBrowserMode = process.argv.includes('--show-browser');
const diagnoseMissesMode = process.argv.includes('--diagnose-misses');
const doiFileArg = process.argv.find(arg => arg.startsWith('--doi-file='));
const doiFilePath = doiFileArg ? path.resolve(doiFileArg.slice('--doi-file='.length)) : '';
// This only exists for the explicit, read-only Browserbase acceptance test. It
// never changes the normal resolver order used by the Collector.
const forceBrowserbaseDiagnostic = process.argv.includes('--force-browserbase');

function getPublisherSession(publisher = '') {
  if (!app.isReady()) throw new Error('publisher_session_before_app_ready');
  const key = String(publisher || '').trim().toLowerCase();
  if (['acs', 'wiley', 'rsc', 'elsevier', 'nature', 'science', 'ccs'].includes(key)) {
    if (!localPublisherSessions.has(key)) {
      const partition = `persist:toc-publisher-${key}`;
      const value = session.fromPartition(partition, { cache: true });
      localPublisherSessions.set(key, value);
      mark('background.publisher-session.created', { publisher: key, partition, persistent: true });
    }
    return localPublisherSessions.get(key);
  }
  if (!publisherSession) {
    publisherSession = session.fromPartition(publisherPartition, { cache: false });
    mark('background.publisher-session.created', { partition: publisherPartition, persistent: false });
  }
  return publisherSession;
}

function publisherFromUrl(url) {
  return publisherFromAdapter(url);
}

function publisherHostMatches(publisher, url) {
  return publisherHostMatchesAdapter(publisher, url);
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
function localCaptureDir() { return path.join(dataDir(), 'local-toc-capture'); }
function diagnosticDir() { return path.join(dataDir(), 'toc-diagnostics'); }
function diagnosticJsonlPath() { return path.join(diagnosticDir(), 'diagnostics.jsonl'); }
function retryQueuePath() { return path.join(diagnosticDir(), 'retry-dois.txt'); }
function upgradeQueuePath() { return path.join(diagnosticDir(), 'official-upgrade-dois.txt'); }

function sanitizedPageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(value || '').replace(/[?#].*$/, '').slice(0, 1200);
  }
}

function diagnosisReason(result = {}) {
  const d = result?.diagnostic || {};
  const status = String(result?.status || '');
  const error = String(result?.reason || d.error || '');

  if (status === 'saved_local') return 'official_toc_saved';
  if (status === 'saved_local_figure1') return 'figure1_fallback_saved';
  if (/window_closed_during_auth/i.test(error)) return 'window_closed_during_auth';
  if (/publisher_window_closed/i.test(error)) return 'window_closed_before_capture';
  if (/captcha_or_challenge|captcha|challenge/i.test(error) || d.challenge) return 'captcha_or_challenge';
  if (/auth_not_completed/i.test(error) || d.authPage) return 'auth_not_completed';
  if (/publisher_timeout|timeout/i.test(error)) return 'publisher_timeout';
  if (/image_download_failed|image_/i.test(error)) return 'image_download_failed';
  if (d.hostOk === false) return 'wrong_domain_or_idp';
  if (Number(d.semanticMarkerCount || 0) > 0 && Number(d.candidateCount || 0) === 0) return 'media_marker_found_but_image_url_missing';
  if (Number(d.figure1MarkerCount || 0) > 0 && Number(d.candidateCount || 0) === 0) return 'figure1_marker_found_but_image_url_missing';
  if (d.articleSignal && Number(d.candidateCount || 0) === 0) return 'article_loaded_no_recognized_visual';
  if (status === 'no_candidate' || status === 'no_official_toc') return 'semantic_media_not_found';
  return error || status || 'unknown';
}

async function appendDiagnostic(result = {}, index = 0, total = 0) {
  if (!diagnoseMissesMode) return;
  const doi = String(result?.doi || '').toLowerCase();
  if (!doi) return;
  await fsp.mkdir(diagnosticDir(), { recursive: true });
  const d = result?.diagnostic || {};
  const row = {
    at: new Date().toISOString(),
    index,
    total,
    doi,
    publisher: classify(doi),
    status: String(result?.status || 'unknown'),
    reason: diagnosisReason(result),
    method: String(result?.source || d.method || ''),
    proxy: String(d.proxy || ''),
    requestedUrl: sanitizedPageUrl(d.requestedUrl || articleUrl(doi)),
    finalUrl: sanitizedPageUrl(d.finalUrl || ''),
    title: String(d.title || '').slice(0, 240),
    challenge: Boolean(d.challenge),
    authPage: Boolean(d.authPage),
    hostOk: d.hostOk === undefined ? null : Boolean(d.hostOk),
    doiOk: d.doiOk === undefined ? null : Boolean(d.doiOk),
    articleSignal: Boolean(d.articleSignal),
    institutionalAccessSignal: Boolean(d.institutionalAccessSignal),
    imageCount: Number(d.imageCount || 0),
    figureCount: Number(d.figureCount || 0),
    semanticMarkerCount: Number(d.semanticMarkerCount || 0),
    figure1MarkerCount: Number(d.figure1MarkerCount || 0),
    candidateCount: Number(d.candidateCount || 0),
    adapterCandidateCount: Number(d.adapterCandidateCount || 0),
    topCandidates: Array.isArray(d.topCandidates) ? d.topCandidates.slice(0, 5) : [],
    waitState: String(d.waitState || ''),
    error: String(result?.reason || d.error || '').slice(0, 500),
    localPath: String(result?.localPath || ''),
  };
  await fsp.appendFile(diagnosticJsonlPath(), JSON.stringify(row) + '\n');
}

async function finalizeDiagnosticRun(selected = [], results = []) {
  if (!diagnoseMissesMode) return;
  await fsp.mkdir(diagnosticDir(), { recursive: true });
  const unresolved = [];
  const upgrades = [];
  const rows = [];
  for (let i = 0; i < selected.length; i += 1) {
    const doi = String(selected[i]?.doi || '').toLowerCase();
    const result = results[i] || { doi, status: 'missing_result', reason: 'missing_result' };
    const status = String(result.status || '');
    const reason = diagnosisReason(result);
    rows.push({
      doi,
      publisher: classify(doi),
      status,
      reason,
      source: String(result?.source || ''),
      localPath: String(result?.localPath || ''),
      diagnostic: result?.diagnostic || {},
    });
    if (status === 'saved_local_figure1') upgrades.push(doi);
    else if (!['saved_local','official','figure1'].includes(status)) unresolved.push(doi);
  }
  await fsp.writeFile(retryQueuePath(), [...new Set(unresolved)].join('\n') + (unresolved.length ? '\n' : ''));
  await fsp.writeFile(upgradeQueuePath(), [...new Set(upgrades)].join('\n') + (upgrades.length ? '\n' : ''));
  const summary = {
    generatedAt: new Date().toISOString(),
    total: selected.length,
    officialSaved: rows.filter(x => x.status === 'saved_local' || x.status === 'official').length,
    figure1Saved: rows.filter(x => x.status === 'saved_local_figure1' || x.status === 'figure1').length,
    retry: unresolved.length,
    officialUpgrade: upgrades.length,
    byReason: Object.fromEntries([...new Set(rows.map(x => x.reason))].sort().map(reason => [reason, rows.filter(x => x.reason === reason).length])),
    rows,
  };
  await fsp.writeFile(path.join(diagnosticDir(), 'latest-summary.json'), JSON.stringify(summary, null, 2));
  await log('diagnostic_run_complete', summary);
}

function parseDoiList(text) {
  const found = String(text || '').match(/10\.\d{4,9}\/[^\s,;"'<>]+/gi) || [];
  return [...new Set(found.map(x => x.trim().toLowerCase().replace(/[).,;]+$/, '')).filter(x => /^10\.\d{4,9}\/\S+$/.test(x)))];
}

async function loadLocalDoiQueue() {
  if (!doiFilePath) return null;
  const text = await fsp.readFile(doiFilePath, 'utf8');
  const dois = parseDoiList(text);
  if (!dois.length) throw new Error(`No DOI found in local input file: ${doiFilePath}`);
  await log('local_doi_queue_loaded', { path: doiFilePath, count: dois.length, localOnlyMode, scanAllMode, officialOnlyMode });
  return dois.map(doi => ({ doi, tocMissing: true, suspiciousToc: false, localInput: true }));
}

async function saveLocalTocCapture(doi, candidate, dataUrl, articleUrl) {
  if (!candidate || !['official','figure1'].includes(candidate.kind) || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  let mime = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 200) return null;
  const headText = bytes.subarray(0, Math.min(bytes.length, 1024)).toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase();
  if (headText.startsWith('<?xml') || headText.startsWith('<svg') || headText.includes('<svg ')) mime = 'image/svg+xml';
  else if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) mime = 'image/png';
  else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = 'image/jpeg';
  const ext = mime.includes('svg') ? 'svg' : mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : mime.includes('webp') ? 'webp' : 'jpg';
  await fsp.mkdir(localCaptureDir(), { recursive: true });
  const key = String(doi).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const file = path.join(localCaptureDir(), `${key}__${candidate.kind}.${ext}`);
  await fsp.writeFile(file, bytes);
  const manifestFile = path.join(localCaptureDir(), 'manifest.jsonl');
  const row = {
    capturedAt: new Date().toISOString(),
    doi: String(doi).toLowerCase(),
    kind: candidate.kind,
    text: String(candidate.text || '').slice(0, 500),
    articleUrl: String(articleUrl || ''),
    sourceUrl: String(candidate.src || ''),
    mime,
    bytes: bytes.length,
    path: file,
  };
  await fsp.appendFile(manifestFile, JSON.stringify(row) + '\n');
  await log('local_toc_saved', { doi: row.doi, bytes: row.bytes, path: file, sourceUrl: row.sourceUrl });
  return row;
}

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
  state.browserbase.acceptance = state.browserbase.acceptance && typeof state.browserbase.acceptance === 'object' ? state.browserbase.acceptance : {};
  state.browserbase.manual = state.browserbase.manual && typeof state.browserbase.manual === 'object' ? state.browserbase.manual : {};
  state.localPublisher = state.localPublisher && typeof state.localPublisher === 'object' ? state.localPublisher : {};
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
  // Keep the raw object long enough to distinguish an old 0.1.6 config from a
  // config that already has deliberately blank Browserbase fields. loadJson()
  // merges defaults, so it cannot provide that distinction by itself.
  let onDiskConfig = {};
  try { onDiskConfig = JSON.parse(await fsp.readFile(configPath(), 'utf8')); }
  catch { /* ensureConfig creates a valid file before the first reload */ }
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
  for (const key of ['browserbaseApiKey', 'browserbaseProjectId']) {
    if (!Object.prototype.hasOwnProperty.call(onDiskConfig, key)) {
      config[key] = '';
      configChanged = true;
    }
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

function credentialText(value, limit) {
  if (typeof value !== 'string') throw new Error('credential_value_invalid');
  const text = value.trim();
  if (text.length > limit) throw new Error('credential_value_too_long');
  return text;
}

async function saveBrowserbaseCredentials({ apiKey, projectId } = {}) {
  // This is the only persistence path used by the GUI. Never log either value.
  config.browserbaseApiKey = credentialText(apiKey, 2048);
  config.browserbaseProjectId = credentialText(projectId, 512);
  await saveConfig('browserbase-gui-save');
  stageStatus = browserbaseDiagnostic().configured ? 'Browserbase 凭据已保存并生效，无需重启。' : 'Browserbase API Key 为空，设置未配置。';
  rebuildTrayMenu();
  await refreshDashboard();
  return { configured: browserbaseDiagnostic().configured, projectConfigured: browserbaseDiagnostic().projectConfigured };
}

async function clearBrowserbaseCredentials() {
  config.browserbaseApiKey = '';
  config.browserbaseProjectId = '';
  await saveConfig('browserbase-gui-clear');
  stageStatus = 'Browserbase 凭据已从当前设置清除。';
  rebuildTrayMenu();
  await refreshDashboard();
  return { configured: false, projectConfigured: false };
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
  return classifyPublisher(doi);
}
function articleUrl(doi) {
  return primaryArticleUrlForDoi(doi);
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
  const localQueue = await loadLocalDoiQueue();
  if (localQueue) {
    lastQueue = localQueue;
    return lastQueue;
  }
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
  const [acsProbe, wileyProbe] = await Promise.all([
    probeUrl('https://pubs.acs.org/'),
    probeUrl('https://onlinelibrary.wiley.com/'),
  ]);
  const acsVerified = localPublisherReady('acs');
  const wileyVerified = localPublisherReady('wiley');
  return {
    acs: acsVerified || acsProbe,
    wiley: wileyVerified || wileyProbe,
    acsSource: acsVerified ? 'verified_local_session' : (acsProbe ? 'direct_probe' : 'unavailable'),
    wileySource: wileyVerified ? 'verified_local_session' : (wileyProbe ? 'direct_probe' : 'unavailable'),
  };
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

function htmlCandidate(html, pageUrl, doi = '') {
  return pickBestPublisherMediaCandidate(html, pageUrl, { doi, publisher: classify(doi) !== 'other' ? classify(doi) : publisherFromUrl(pageUrl) });
}
function browserbasePublisher(doi) {
  const publisher = classify(doi);
  return ['acs', 'wiley', 'rsc', 'elsevier', 'nature', 'science'].includes(publisher) ? publisher : '';
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
    domainMatches = publisherHostMatches(publisher, pageUrl);
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

function localPublisherReady(publisher) {
  const local = state.localPublisher?.[publisher] || {};
  return ['verified_article_access', 'verified_pdf_access'].includes(String(local.status || ''))
    || ['verified_article_access', 'verified_pdf_access'].includes(String(local.lastVerifiedStatus || ''));
}

async function closeLocalPublisherBrowser(publisher) {
  const active = localPublisherWindows.get(publisher);
  if (!active) return;
  localPublisherWindows.delete(publisher);
  try {
    if (active.win && !active.win.isDestroyed()) active.win.destroy();
  } catch {}
}

async function clearPublisherCooldowns(publisher) {
  let cleared = 0;
  for (const doi of Object.keys(state.cooldowns || {})) {
    if (classify(doi) !== publisher) continue;
    delete state.cooldowns[doi];
    cleared += 1;
  }
  if (cleared) {
    await saveState();
    await log('publisher_cooldowns_cleared', { publisher, cleared });
  }
  return cleared;
}

async function releaseVerifiedPublisherCooldowns() {
  let changed = false;
  for (const publisher of ['acs', 'wiley', 'rsc', 'elsevier', 'nature', 'science']) {
    if (!localPublisherReady(publisher)) continue;
    let cleared = 0;
    for (const doi of Object.keys(state.cooldowns || {})) {
      if (classify(doi) !== publisher) continue;
      delete state.cooldowns[doi];
      cleared += 1;
    }
    if (cleared) {
      changed = true;
      await log('publisher_cooldowns_cleared', { publisher, cleared, reason: 'verified_local_session' });
    }
  }
  if (changed) await saveState();
}

async function startLocalPublisherVerification(publisher) {
  publisher = String(publisher || '').trim().toLowerCase();
  if (!['acs', 'wiley', 'rsc', 'elsevier', 'nature', 'science'].includes(publisher)) throw new Error('local_publisher_unsupported');

  const existing = localPublisherWindows.get(publisher);
  if (existing?.win && !existing.win.isDestroyed()) {
    existing.win.show();
    existing.win.focus();
    return { publisher, status: 'open', doi: existing.doi || '', url: existing.win.webContents.getURL() };
  }

  const target = manualPublisherTarget(publisher);
  const publisherSession = getPublisherSession(publisher);
  const win = new BrowserWindow({
    width: 1380,
    height: 960,
    show: true,
    title: `Collector · ${manualPublisherLabel(publisher)} · 本机/VPN 验证`,
    webPreferences: {
      session: publisherSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      images: true,
    },
  });
  localPublisherWindows.set(publisher, { win, doi: target.doi || '', targetUrl: target.url, startedAt: Date.now() });
  win.on('closed', () => {
    const current = localPublisherWindows.get(publisher);
    if (current?.win === win) localPublisherWindows.delete(publisher);
  });
  win.webContents.on('did-fail-load', (_event, code, description, validatedUrl, isMainFrame) => {
    if (!isMainFrame && Number(code) === -3 && String(validatedUrl || '') === 'about:srcdoc') return;
    void log('local_publisher_load_failed', { publisher, doi: target.doi || '', code, description, url: validatedUrl, isMainFrame: Boolean(isMainFrame) });
  });

  {
    const previous = state.localPublisher[publisher] || {};
    const preserveVerified = localPublisherReady(publisher);
    state.localPublisher[publisher] = {
      ...previous,
      status: preserveVerified ? previous.status : 'opening',
      windowStatus: 'opening',
      doi: target.doi || '',
      partition: `persist:toc-publisher-${publisher}`,
      openedAt: Date.now(),
    };
  }
  await saveState();
  await log('local_publisher_window_opened', { publisher, doi: target.doi || '', url: target.url, partition: `persist:toc-publisher-${publisher}` });

  await win.loadURL(target.url, {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  }).catch(async error => {
    await log('local_publisher_load_error', { publisher, doi: target.doi || '', reason: safeError(error, 240) });
  });

  {
    const previous = state.localPublisher[publisher] || {};
    const preserveVerified = localPublisherReady(publisher);
    state.localPublisher[publisher] = {
      ...previous,
      status: preserveVerified ? previous.status : 'open',
      windowStatus: 'open',
      currentUrl: win.webContents.getURL(),
      openedAt: Date.now(),
    };
  }
  await saveState();
  stageStatus = `${manualPublisherLabel(publisher)} 已在本机持久浏览器会话打开。该会话直接使用 Windows 网络；若学校 VPN 是系统级隧道，它会沿用学校 VPN。完成验证并进入论文页后点击“检查本机权限”。`;
  refreshDashboard();
  return { publisher, status: 'open', doi: target.doi || '', url: win.webContents.getURL() };
}

async function finishLocalPublisherVerification(publisher) {
  publisher = String(publisher || '').trim().toLowerCase();
  const active = localPublisherWindows.get(publisher);
  if (!active?.win || active.win.isDestroyed()) throw new Error('local_publisher_window_not_open');

  const details = await active.win.webContents.executeJavaScript(`(() => {
    const abs = value => { try { return new URL(value, location.href).href } catch { return '' } };
    const text = String(document.body?.innerText || '').slice(0, 220000);
    const pdfLinks = [...document.querySelectorAll('a[href]')]
      .map(a => ({ href: abs(a.getAttribute('href') || ''), text: String(a.textContent || '').trim() }))
      .filter(item => item.href && (/\\bpdf\\b|download/i.test(item.text + ' ' + item.href)))
      .slice(0, 30);
    return { href: location.href, title: document.title, text, pdfLinks };
  })()`);

  const pageUrl = String(details?.href || active.win.webContents.getURL() || '');
  const body = String(details?.text || '');
  const challenged = browserbaseManualRequired(body, pageUrl);
  const hostOk = publisherHostMatches(publisher, pageUrl);
  const normalizedDoi = String(active.doi || '').toLowerCase();
  const doiSuffix = normalizedDoi.split('/').at(-1) || normalizedDoi;
  const doiOk = !normalizedDoi || body.toLowerCase().includes(normalizedDoi) || pageUrl.toLowerCase().includes(doiSuffix.toLowerCase());

  // Browser-level PDF/ePDF viewers are valid entitlement evidence even when a
  // separate fetch() is rejected by publisher anti-bot middleware.
  const browserPdfViewer =
    (publisher === 'wiley' && /\/doi\/(?:e?pdf)\//i.test(pageUrl)) ||
    (publisher === 'acs' && /\/doi\/(?:e?pdf|pdf)\//i.test(pageUrl)) ||
    /\.pdf(?:[?#]|$)/i.test(pageUrl);

  let pdfAccess = browserPdfViewer;
  let pdfStatus = browserPdfViewer ? 200 : 0;
  let pdfContentType = browserPdfViewer ? 'browser/pdf-viewer' : '';
  let pdfUrl = browserPdfViewer ? pageUrl : '';
  let pdfEvidence = browserPdfViewer ? 'browser_viewer' : '';

  if (!challenged && hostOk && !pdfAccess) {
    const publisherSession = getPublisherSession(publisher);
    for (const item of Array.isArray(details?.pdfLinks) ? details.pdfLinks : []) {
      try {
        const response = await publisherSession.fetch(item.href, {
          method: 'GET',
          redirect: 'follow',
          headers: { Referer: pageUrl, Accept: 'application/pdf,*/*;q=0.8' },
          signal: AbortSignal.timeout(20000),
        });
        pdfStatus = Number(response.status || 0);
        pdfContentType = String(response.headers.get('content-type') || '').toLowerCase();
        pdfUrl = String(response.url || item.href);
        if (response.ok && (pdfContentType.includes('application/pdf') || /\.pdf(?:[?#]|$)/i.test(pdfUrl))) {
          pdfAccess = true;
          pdfEvidence = 'direct_fetch';
          try { await response.body?.cancel(); } catch {}
          break;
        }
        try { await response.body?.cancel(); } catch {}
      } catch (error) {
        await log('local_publisher_pdf_probe_failed', { publisher, doi: normalizedDoi, reason: safeError(error, 180) });
      }
    }
  }

  const status = challenged
    ? 'still_challenged'
    : !hostOk
      ? 'wrong_domain'
      : !doiOk
        ? 'doi_not_verified'
        : pdfAccess
          ? 'verified_pdf_access'
          : 'verified_article_access';

  state.localPublisher[publisher] = {
    ...(state.localPublisher[publisher] || {}),
    status,
    doi: normalizedDoi,
    currentUrl: pageUrl,
    pdfAccess,
    pdfStatus,
    pdfContentType,
    pdfUrl: pdfAccess ? pdfUrl : '',
    pdfEvidence,
    windowStatus: 'checked',
    lastVerifiedStatus: ['verified_article_access', 'verified_pdf_access'].includes(status)
      ? status
      : state.localPublisher?.[publisher]?.lastVerifiedStatus || '',
    lastVerifiedAt: ['verified_article_access', 'verified_pdf_access'].includes(status)
      ? Date.now()
      : state.localPublisher?.[publisher]?.lastVerifiedAt || 0,
    checkedAt: Date.now(),
  };

  if (status === 'verified_pdf_access' || status === 'verified_article_access') {
    let cleared = 0;
    for (const doi of Object.keys(state.cooldowns || {})) {
      if (classify(doi) !== publisher) continue;
      delete state.cooldowns[doi];
      cleared += 1;
    }
    await log('local_publisher_verification_checked', {
      publisher,
      doi: normalizedDoi,
      status,
      pdfAccess,
      pdfStatus,
      pdfContentType,
      pdfEvidence,
      clearedCooldowns: cleared,
      url: pageUrl,
    });
    await saveState();
    active.win.close();
    stageStatus = pdfAccess
      ? `${manualPublisherLabel(publisher)} 本机/VPN 权限已确认：浏览器级 PDF/ePDF 权限成立；已清除该出版社旧 cooldown，可立即重新处理。`
      : `${manualPublisherLabel(publisher)} 文章权限已确认；已清除该出版社旧 cooldown。PDF 将继续通过浏览器会话而不是独立 HTTP 探针解析。`;
  } else {
    await saveState();
    await log('local_publisher_verification_checked', {
      publisher,
      doi: normalizedDoi,
      status,
      pdfAccess,
      pdfStatus,
      pdfContentType,
      pdfEvidence,
      url: pageUrl,
    });
    if (status === 'still_challenged') {
      stageStatus = `${manualPublisherLabel(publisher)} 仍处在验证/挑战页面，请在本机窗口完成后再次点击“检查本机权限”。`;
    } else {
      stageStatus = `${manualPublisherLabel(publisher)} 尚未完成权限确认（${status}），请保持本机窗口打开并进入目标论文页。`;
    }
  }

  refreshDashboard();
  return { publisher, status, doi: normalizedDoi, url: pageUrl, pdfAccess, pdfStatus, pdfContentType, pdfEvidence };
}

function manualPublisherLabel(publisher) {
  return publisher === 'acs' ? 'ACS'
    : publisher === 'wiley' ? 'Wiley'
      : publisher === 'rsc' ? 'RSC'
        : publisher === 'elsevier' ? 'Elsevier / ScienceDirect'
          : publisher === 'nature' ? 'Springer Nature'
            : publisher === 'science' ? 'AAAS / Science'
              : publisher;
}

function manualPublisherTarget(publisher) {
  const queued = lastQueue.find(item => classify(item?.doi) === publisher && item?.doi);
  if (queued?.doi) return { doi: String(queued.doi).toLowerCase(), url: articleUrl(String(queued.doi).toLowerCase()) };
  if (publisher === 'acs') return { doi: '10.1021/acs.orglett.6c03622', url: articleUrl('10.1021/acs.orglett.6c03622') };
  if (publisher === 'wiley') return { doi: '10.1002/anie.1537547', url: articleUrl('10.1002/anie.1537547') };
  if (publisher === 'rsc') return { doi: '', url: 'https://pubs.rsc.org/' };
  if (publisher === 'elsevier') return { doi: '', url: 'https://www.sciencedirect.com/' };
  if (publisher === 'nature') return { doi: '10.1038/s44160-026-01158-6', url: articleUrl('10.1038/s44160-026-01158-6') };
  if (publisher === 'science') return { doi: '', url: 'https://www.science.org/' };
  throw new Error('manual_publisher_unsupported');
}

async function startManualBrowserbase(publisher) {
  publisher = String(publisher || '').trim().toLowerCase();
  if (!['acs', 'wiley', 'rsc', 'elsevier', 'nature', 'science'].includes(publisher)) throw new Error('manual_publisher_unsupported');
  if (!browserbaseDiagnostic().configured) throw new Error('browserbase_missing_credentials');

  const active = manualBrowserbaseSessions.get(publisher);
  if (active?.sessionId) {
    const debug = await browserbaseApi(`/sessions/${encodeURIComponent(active.sessionId)}/debug`, { method: 'GET' });
    const liveUrl = String(debug?.debuggerFullscreenUrl || debug?.debuggerUrl || '').trim();
    if (liveUrl) await shell.openExternal(liveUrl);
    return { configured: true, publisher, status: 'active', sessionId: active.sessionId, contextId: active.contextId, doi: active.doi || '' };
  }

  await waitForBrowserbaseSlot(publisher);
  const contextId = await browserbaseContext(publisher);
  const { projectId } = browserbaseCredentials();
  const payload = {
    keepAlive: true,
    browserSettings: { context: { id: contextId, persist: true } },
  };
  if (projectId) payload.projectId = projectId;

  const sessionInfo = await browserbaseApi('/sessions', { method: 'POST', body: JSON.stringify(payload) });
  if (!sessionInfo?.id || !sessionInfo?.connectUrl) throw new Error('browserbase_session_missing_connect_url');

  const { chromium } = await import('playwright-core');
  const browser = await chromium.connectOverCDP(sessionInfo.connectUrl);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  const target = manualPublisherTarget(publisher);
  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: Math.max(30000, Number(config.publisherTimeoutSeconds || 35) * 1000) }).catch(() => {});
  await page.waitForTimeout(1200).catch(() => {});

  const debug = await browserbaseApi(`/sessions/${encodeURIComponent(String(sessionInfo.id))}/debug`, { method: 'GET' });
  const liveUrl = String(debug?.debuggerFullscreenUrl || debug?.debuggerUrl || '').trim();
  if (!liveUrl) {
    await browser.close().catch(() => {});
    throw new Error('browserbase_live_url_missing');
  }

  const sessionId = String(sessionInfo.id);
  manualBrowserbaseSessions.set(publisher, { browser, page, sessionId, contextId, doi: target.doi, url: target.url, startedAt: Date.now() });
  state.browserbase.manual[publisher] = {
    status: 'active',
    sessionId,
    contextId,
    doi: target.doi,
    startedAt: Date.now(),
  };
  state.browserbase.status[publisher] = 'manual_active';
  await saveState();
  await log('browserbase_manual_session_started', { publisher, doi: target.doi, sessionId, contextId });
  await shell.openExternal(liveUrl);
  stageStatus = `${manualPublisherLabel(publisher)} 人工验证窗口已打开；完成后回到 Collector 点击“完成验证”。`;
  refreshDashboard();
  return { configured: true, publisher, status: 'active', sessionId, contextId, doi: target.doi };
}

async function finishManualBrowserbase(publisher) {
  publisher = String(publisher || '').trim().toLowerCase();
  const active = manualBrowserbaseSessions.get(publisher);
  if (!active) throw new Error('manual_session_not_active');

  let pageUrl = '';
  let html = '';
  try {
    pageUrl = active.page.url();
    html = await active.page.content();
  } catch {}
  if (browserbaseManualRequired(html, pageUrl)) {
    state.browserbase.manual[publisher] = {
      ...(state.browserbase.manual[publisher] || {}),
      status: 'still_challenged',
      checkedAt: Date.now(),
    };
    state.browserbase.status[publisher] = 'manual_required';
    await saveState();
    stageStatus = `${manualPublisherLabel(publisher)} 仍处在验证/挑战页面；继续在 Live Session 完成验证，然后再次点击“继续当前任务”。`;
    refreshDashboard();
    return { configured: true, publisher, status: 'still_challenged', sessionId: active.sessionId, contextId: active.contextId, doi: active.doi || '' };
  }

  if (active.doi && !browserbaseOwnsDoi(active.doi, pageUrl, html)) {
    state.browserbase.manual[publisher] = {
      ...(state.browserbase.manual[publisher] || {}),
      status: 'doi_not_verified',
      checkedAt: Date.now(),
    };
    await saveState();
    stageStatus = `${manualPublisherLabel(publisher)} 已离开挑战页，但当前页面尚未确认目标 DOI；请在同一 Live Session 打开目标论文，再点击“继续当前任务”。`;
    refreshDashboard();
    return { configured: true, publisher, status: 'doi_not_verified', sessionId: active.sessionId, contextId: active.contextId, doi: active.doi || '' };
  }

  const candidate = htmlCandidate(html, pageUrl, active.doi);
  if (!candidate) {
    state.browserbase.manual[publisher] = {
      ...(state.browserbase.manual[publisher] || {}),
      status: 'verified_no_candidate',
      checkedAt: Date.now(),
    };
    state.browserbase.status[publisher] = 'manual_verified_no_candidate';
    await saveState();
    stageStatus = `${manualPublisherLabel(publisher)} 权限已通过，但当前页面未找到可信 Primary Visual；session 保持打开，可继续检查文章/PDF。`;
    refreshDashboard();
    return { configured: true, publisher, status: 'verified_no_candidate', sessionId: active.sessionId, contextId: active.contextId, doi: active.doi || '' };
  }

  const image = await verifyBrowserbaseImage(active.page, candidate, {
    publisher,
    doi: active.doi,
    sessionId: active.sessionId,
  });

  if (!config.writeToken) throw new Error('write_token_missing');
  if (candidate.kind === 'official') {
    await api('/api/toc/import', {
      method: 'POST',
      body: JSON.stringify({
        doi: active.doi,
        articleUrl: pageUrl,
        imageData: image.imageData,
        replace: false,
      }),
    });
    await report(active.doi, 'upload', 'complete', 'collector_official_toc_manual_resume', pageUrl);
  } else {
    await api('/api/article-figures/import', {
      method: 'POST',
      body: JSON.stringify({
        doi: active.doi,
        articleUrl: pageUrl,
        id: 'figure-1',
        label: 'Figure 1',
        caption: candidate.text?.slice(0, 500) || 'Figure 1',
        imageData: image.imageData,
        order: 0,
      }),
    });
    await report(active.doi, 'upload', 'partial', 'collector_figure1_manual_resume', pageUrl);
  }

  await clearCooldown(active.doi);
  await log('browserbase_manual_resume_upload_success', {
    publisher,
    doi: active.doi,
    kind: candidate.kind,
    sessionId: active.sessionId,
    contextId: active.contextId,
  });

  await active.browser.close().catch(() => {});
  manualBrowserbaseSessions.delete(publisher);
  state.browserbase.manual[publisher] = {
    status: 'verified',
    sessionId: active.sessionId,
    contextId: active.contextId,
    doi: active.doi || '',
    verifiedAt: Date.now(),
    resumedSameSession: true,
    resolvedKind: candidate.kind,
  };
  state.browserbase.status[publisher] = 'manual_verified';
  if (active.doi) state.browserbase.lastSuccessDoi[publisher] = active.doi;
  await saveState();
  stageStatus = `${manualPublisherLabel(publisher)} 人工验证完成；已在同一 Browserbase Session 继续并上传当前 DOI，persistent Context 已保存供后续论文复用。`;
  refreshDashboard();
  return {
    configured: true,
    publisher,
    status: 'verified',
    sessionId: active.sessionId,
    contextId: active.contextId,
    doi: active.doi || '',
    resumedSameSession: true,
    resolvedKind: candidate.kind,
  };
}

async function verifyBrowserbaseImage(page, candidate, { publisher, doi, sessionId }) {
  const response = await page.request.get(candidate.src, { timeout: 20000 });
  const contentType = String(response.headers()['content-type'] || '').toLowerCase();
  const body = await response.body();
  const bytes = body.length;
  if (!response.ok()) throw new Error(`browserbase_image_http_${response.status()}`);
  if (!contentType.startsWith('image/') || bytes < 1024) throw new Error('browserbase_image_unreadable');
  const mime = contentType.split(';')[0];
  await log('browserbase_image_readable', { publisher, doi, kind: candidate.kind, bytes, sessionId });
  return { contentType: mime, bytes, imageData: `data:${mime};base64,${body.toString('base64')}` };
}


function springerNatureMediaCandidates(doi) {
  const normalized = String(doi || '').trim().toLowerCase();
  if (!normalized.startsWith('10.1038/')) return [];
  const articleId = normalized.split('/')[1] || '';
  const match = /^s(\d+)-(\d{3})-(\d+)-[a-z0-9]+$/i.exec(articleId);
  if (!match) return [];
  const journalCode = match[1];
  const year = 2000 + Number(match[2]);
  const articleNumber = String(Number(match[3]));
  if (!Number.isFinite(year) || !articleNumber || articleNumber === 'NaN') return [];
  const stem = `${journalCode}_${year}_${articleNumber}`;
  const encodedArticle = encodeURIComponent(articleId);
  const base = `https://media.springernature.com/full/springer-static/image/art%3A10.1038%2F${encodedArticle}/MediaObjects/`;
  return [
    {
      src: `${base}${stem}_Figa_HTML.png`,
      kind: 'official',
      text: 'Graphical Abstract / Visual Abstract',
      ownershipToken: `${articleId}/MediaObjects/${stem}_Figa_HTML.png`,
      source: 'springer_nature_mediaobjects',
      confidence: 99,
    },
    {
      src: `${base}${stem}_Fig1_HTML.png`,
      kind: 'figure1',
      text: 'Figure 1',
      ownershipToken: `${articleId}/MediaObjects/${stem}_Fig1_HTML.png`,
      source: 'springer_nature_mediaobjects',
      confidence: 96,
    },
  ];
}

async function verifySpringerNatureCandidate(doi, candidate) {
  const normalized = String(doi || '').trim().toLowerCase();
  const articleId = normalized.split('/')[1] || '';
  let decoded = '';
  try { decoded = decodeURIComponent(candidate.src); } catch { decoded = candidate.src; }
  if (!articleId || !decoded.includes(`10.1038/${articleId}/MediaObjects/`)) {
    throw new Error('springer_nature_doi_ownership_mismatch');
  }
  const response = await globalThis.fetch(candidate.src, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: articleUrl(normalized),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    await log('springer_nature_candidate_rejected', { doi: normalized, kind: candidate.kind, status: response.status, reason: 'http' });
    return null;
  }
  const contentType = String(response.headers.get('content-type') || '').toLowerCase().split(';')[0];
  if (!contentType.startsWith('image/')) {
    await log('springer_nature_candidate_rejected', { doi: normalized, kind: candidate.kind, reason: 'content_type', contentType });
    return null;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 4096 || buffer.length > 8_000_000) {
    await log('springer_nature_candidate_rejected', { doi: normalized, kind: candidate.kind, reason: 'size', bytes: buffer.length });
    return null;
  }
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) {
    await log('springer_nature_candidate_rejected', { doi: normalized, kind: candidate.kind, reason: 'decode' });
    return null;
  }
  const size = image.getSize();
  if (size.width < 240 || size.height < 120) {
    await log('springer_nature_candidate_rejected', { doi: normalized, kind: candidate.kind, reason: 'dimensions', width: size.width, height: size.height });
    return null;
  }
  const ratio = size.width / Math.max(1, size.height);
  if (ratio > 8 || ratio < 0.12) {
    await log('springer_nature_candidate_rejected', { doi: normalized, kind: candidate.kind, reason: 'logo_like_aspect', width: size.width, height: size.height });
    return null;
  }
  const mime = ['image/png','image/jpeg','image/gif','image/webp'].includes(contentType) ? contentType : 'image/png';
  const verified = {
    ...candidate,
    width: size.width,
    height: size.height,
    imageData: `data:${mime};base64,${buffer.toString('base64')}`,
  };
  await log('springer_nature_candidate_verified', {
    doi: normalized,
    kind: candidate.kind,
    source: candidate.source,
    confidence: candidate.confidence,
    width: size.width,
    height: size.height,
    bytes: buffer.length,
  });
  return verified;
}

async function inspectSpringerNatureStructured(doi) {
  const normalized = String(doi || '').trim().toLowerCase();
  if (classify(normalized) !== 'nature') return null;
  const target = articleUrl(normalized);

  try {
    const response = await publisherFetch(target, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    }, 'springer_nature_metadata_fetch_fallback');
    if (response.ok) {
      const html = await response.text();
      const finalUrl = response.url || target;
      const challenged = browserbaseManualRequired(html, finalUrl);
      const ownsDoi = html.toLowerCase().includes(normalized) || finalUrl.toLowerCase().includes(normalized.split('/')[1]);
      if (!challenged && ownsDoi) {
        const metadataCandidate = htmlCandidate(html, finalUrl, normalized);
        if (metadataCandidate && ['official','figure1'].includes(metadataCandidate.kind)) {
          const responseImage = await globalThis.fetch(metadataCandidate.src, {
            headers: { Accept: 'image/*,*/*;q=0.8', Referer: finalUrl },
            signal: AbortSignal.timeout(20000),
          });
          if (responseImage.ok) {
            const contentType = String(responseImage.headers.get('content-type') || '').split(';')[0].toLowerCase();
            const buffer = Buffer.from(await responseImage.arrayBuffer());
            const image = nativeImage.createFromBuffer(buffer);
            if (contentType.startsWith('image/') && buffer.length >= 4096 && !image.isEmpty()) {
              const size = image.getSize();
              if (size.width >= 240 && size.height >= 120) {
                await log('springer_nature_metadata_candidate_verified', { doi: normalized, kind: metadataCandidate.kind, width: size.width, height: size.height, url: finalUrl });
                return {
                  url: finalUrl,
                  method: 'springer_nature_metadata',
                  candidate: {
                    ...metadataCandidate,
                    width: size.width,
                    height: size.height,
                    imageData: `data:${contentType};base64,${buffer.toString('base64')}`,
                    source: 'springer_nature_metadata',
                    confidence: metadataCandidate.kind === 'official' ? 100 : 97,
                  },
                };
              }
            }
          }
        }
      }
      await log('springer_nature_metadata_no_candidate', { doi: normalized, challenged, ownsDoi, url: finalUrl });
    }
  } catch (error) {
    await log('springer_nature_metadata_failed', { doi: normalized, reason: safeError(error, 240) });
  }

  for (const candidate of springerNatureMediaCandidates(normalized)) {
    try {
      const verified = await verifySpringerNatureCandidate(normalized, candidate);
      if (verified) {
        return {
          url: target,
          method: candidate.kind === 'official' ? 'springer_nature_official_visual' : 'springer_nature_figure1',
          candidate: verified,
        };
      }
    } catch (error) {
      await log('springer_nature_candidate_failed', { doi: normalized, kind: candidate.kind, reason: safeError(error, 240) });
    }
  }
  return null;
}

async function inspectArticleBrowserbase(doi, url, localReason = '', { verifyImage = false } = {}) {
  const publisher = browserbasePublisher(doi);
  if (!publisher) return null;
  const activeManual = manualBrowserbaseSessions.get(publisher);
  if (activeManual?.sessionId) {
    state.browserbase.status[publisher] = 'manual_required';
    await saveState();
    await log('browserbase_manual_session_reused_waiting', { publisher, doi, sessionId: activeManual.sessionId, activeDoi: activeManual.doi || '' });
    throw new Error('manual_required');
  }
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
    await log('browserbase_session_created', { publisher, doi, sessionId: String(sessionInfo.id || '') });
    const { chromium } = await import('playwright-core');
    browser = await chromium.connectOverCDP(sessionInfo.connectUrl);
    await log('browserbase_cdp_connected', { publisher, doi, sessionId: String(sessionInfo.id || '') });
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.max(15000, Number(config.publisherTimeoutSeconds || 35) * 1000) });
    await page.waitForTimeout(Math.min(5000, Math.max(500, Number(config.headlessWaitMs || 1500))));
    const pageUrl = page.url();
    const html = await page.content();
    if (browserbaseManualRequired(html, pageUrl)) {
      const sessionId = String(sessionInfo.id || '');
      const debug = sessionId
        ? await browserbaseApi(`/sessions/${encodeURIComponent(sessionId)}/debug`, { method: 'GET' }).catch(() => null)
        : null;
      const contextId = String(state.browserbase.contexts?.[publisher] || '');
      manualBrowserbaseSessions.set(publisher, {
        browser,
        page,
        sessionId,
        contextId,
        doi,
        url,
        startedAt: Date.now(),
      });
      browser = null;
      state.browserbase.manual[publisher] = {
        status: 'manual_required',
        sessionId,
        contextId,
        doi,
        startedAt: Date.now(),
        liveAvailable: Boolean(debug?.debuggerFullscreenUrl || debug?.debuggerUrl),
      };
      state.browserbase.status[publisher] = 'manual_required';
      await saveState();
      await log('browserbase_manual_required', { publisher, doi, url: pageUrl, sessionId, contextId });
      stageStatus = `${manualPublisherLabel(publisher)} 需要人工验证；当前 Session 已保活，没有创建新 Session。请点击“打开 Live Session”，验证后点击“继续当前任务”。`;
      refreshDashboard();
      throw new Error('manual_required');
    }
    if (!browserbaseOwnsDoi(doi, pageUrl, html)) throw new Error('browserbase_doi_mismatch');
    await log('browserbase_doi_verified', { publisher, doi, url: pageUrl, sessionId: String(sessionInfo.id || '') });
    const candidate = htmlCandidate(html, pageUrl, doi);
    if (!candidate) throw new Error('browserbase_no_candidate');
    const image = verifyImage ? await verifyBrowserbaseImage(page, candidate, { publisher, doi, sessionId: String(sessionInfo.id || '') }) : null;
    state.browserbase.status[publisher] = 'connected';
    state.browserbase.lastSuccessDoi[publisher] = doi;
    await saveState();
    await log('browserbase_success', { publisher, doi, kind: candidate.kind, url: pageUrl, sessionId: String(sessionInfo.id || '') });
    return { url: pageUrl, candidate, method: 'browserbase', sessionId: String(sessionInfo.id || ''), image };
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
    const publisher = publisherFromUrl(url);
    return await getPublisherSession(publisher).fetch(url, options);
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
    const candidate = htmlCandidate(html, finalUrl, doi);
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

async function downloadPdfFromPublisherBrowser({ doi, publisher, webContents, pdfUrl }) {
  if (!pdfUrl || !webContents || webContents.isDestroyed()) return null;
  const cacheDir = path.join(dataDir(), 'pdf-cache');
  await fsp.mkdir(cacheDir, { recursive: true });
  const key = createHash('sha256').update(String(doi).toLowerCase()).digest('hex').slice(0, 24);
  const target = path.join(cacheDir, `${key}.pdf`);
  try {
    const stat = await fsp.stat(target);
    if (stat.size > 10000) {
      await log('local_pdf_cache_hit', { doi, publisher, bytes: stat.size, path: target });
      return { path: target, bytes: stat.size, source: 'cache' };
    }
  } catch {}

  const publisherSession = getPublisherSession(publisher);
  return await new Promise(resolve => {
    let settled = false;
    let timer = null;
    const finish = result => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      publisherSession.removeListener('will-download', onDownload);
      resolve(result);
    };
    const onDownload = (_event, item, sourceWebContents) => {
      if (sourceWebContents && sourceWebContents.id !== webContents.id) return;
      item.setSavePath(target);
      item.once('done', async (_doneEvent, stateName) => {
        if (stateName !== 'completed') {
          await log('local_pdf_download_failed', { doi, publisher, state: stateName, url: pdfUrl });
          finish(null);
          return;
        }
        try {
          const stat = await fsp.stat(target);
          if (stat.size < 10000) {
            await fsp.rm(target, { force: true }).catch(() => {});
            await log('local_pdf_download_failed', { doi, publisher, state: 'too_small', bytes: stat.size, url: pdfUrl });
            finish(null);
            return;
          }
          await log('local_pdf_downloaded', { doi, publisher, bytes: stat.size, path: target, url: pdfUrl });
          finish({ path: target, bytes: stat.size, source: 'browser_download' });
        } catch (error) {
          await log('local_pdf_download_failed', { doi, publisher, state: 'stat_failed', reason: safeError(error, 180), url: pdfUrl });
          finish(null);
        }
      });
    };
    publisherSession.on('will-download', onDownload);
    timer = setTimeout(() => finish(null), 45000);
    try {
      webContents.downloadURL(pdfUrl);
    } catch (error) {
      void log('local_pdf_download_failed', { doi, publisher, state: 'download_url_failed', reason: safeError(error, 180), url: pdfUrl });
      finish(null);
    }
  });
}
async function waitForLocalInteractiveArticle(win, childWindows, doi, publisher) {
  const liveWindows = () => [win, ...(Array.isArray(childWindows) ? childWindows : [])]
    .filter((item, index, all) => item && !item.isDestroyed() && all.indexOf(item) === index);
  if (!localOnlyMode || !showBrowserMode || liveWindows().length === 0) {
    await new Promise(resolve => setTimeout(resolve, Number(config.headlessWaitMs) || 5000));
    return { waitState: 'headless_settle', windowId: win && !win.isDestroyed() ? win.id : 0 };
  }

  const settleMs = Math.max(5000, Number(config.localInteractiveSettleMs || 12000));
  const authWaitMs = Math.max(60_000, Number(config.localAuthWaitMinutes || 8) * 60_000);
  const startedAt = Date.now();
  let lastStatus = '';
  let lastDetails = null;

  while (true) {
    const windows = liveWindows();
    if (!windows.length) break;
    const activeWin = windows.find(item => publisherHostMatches(publisher, item.webContents.getURL()))
      || windows.find(item => item.isVisible())
      || windows[0];
    let details = null;
    try {
      details = await activeWin.webContents.executeJavaScript(`(() => {
        const text = String(document.body?.innerText || '').slice(0, 160000);
        const href = location.href;
        const title = document.title;
        const citationDoi = String(document.querySelector('meta[name="citation_doi"]')?.content || document.querySelector('meta[name="dc.identifier"]')?.content || '').toLowerCase();
        const canonical = String(document.querySelector('link[rel="canonical"]')?.href || '').toLowerCase();
        const challenge = /captcha|verify you are human|security check|access denied|challenge-platform|just a moment|unusual traffic|checking your browser/i.test(title + '\\n' + text);
        const authPage = /(?:login|signin|sign-in|shibboleth|saml|institution|federated|wayf|idp|openathens)/i.test(href)
          || /select (?:your )?institution|sign in via (?:your )?institution|log in via (?:your )?institution|access through (?:your )?institution|institutional login/i.test(title + '\\n' + text);
        const articleSignal = /\\babstract\\b|\\breferences\\b|\\bsupporting information\\b|\\barticle\\b/i.test(text) && text.length > 2500;
        const institutionalAccessSignal = /access provided by|institutional access|access through your institution|signed in through|authenticated by/i.test(text);
        return { href, title, textLength: text.length, citationDoi, canonical, challenge, authPage, articleSignal, institutionalAccessSignal };
      })()`);
      lastDetails = details;
    } catch (error) {
      if (activeWin.isDestroyed()) {
        await log('local_interactive_window_handoff', { doi, publisher, remainingWindows: liveWindows().length });
        if (liveWindows().length === 0) {
          if (lastDetails?.challenge || lastDetails?.authPage) throw new Error('window_closed_during_auth');
          throw new Error('publisher_window_closed_before_capture');
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      await log('local_interactive_probe_failed', { doi, publisher, reason: safeError(error, 180) });
    }

    if (details) {
      const normalized = String(doi || '').toLowerCase();
      const suffix = normalized.split('/').at(-1) || normalized;
      const href = String(details.href || '');
      const hostOk = publisherHostMatches(publisher, href);
      const doiOk = String(details.citationDoi || '').includes(normalized)
        || String(details.canonical || '').includes(normalized)
        || href.toLowerCase().includes(suffix.toLowerCase());
      const articleReady = hostOk && (doiOk || details.articleSignal) && !details.challenge && !details.authPage;
      const elapsed = Date.now() - startedAt;

      if (articleReady && elapsed >= settleMs) {
        if (lastStatus !== 'ready') await log('local_interactive_article_ready', { doi, publisher, url: href });
        return { ...details, hostOk, doiOk, waitState: 'article_ready', elapsedMs: elapsed, windowId: activeWin.id };
      }

      const waitingForUser = details.challenge || details.authPage || !hostOk;
      const nextStatus = waitingForUser ? 'waiting_for_user' : 'settling';
      if (nextStatus !== lastStatus) {
        lastStatus = nextStatus;
        if (waitingForUser) {
          stageStatus = `等待你完成 ${manualPublisherLabel(publisher)} 登录/学校验证：${doi}。窗口会保持，最长等待 ${Math.round(authWaitMs/60000)} 分钟。`;
          await log('local_interactive_waiting_for_user', { doi, publisher, url: href, challenge: Boolean(details.challenge), authPage: Boolean(details.authPage), hostOk });
        } else {
          stageStatus = `等待页面完整加载：${doi}`;
        }
        await refreshDashboard();
      }

      if (waitingForUser && elapsed >= authWaitMs) {
        if (details.challenge) throw new Error('captcha_or_challenge_not_completed');
        if (details.authPage || !hostOk) throw new Error('auth_not_completed');
      }

      if (!waitingForUser && elapsed >= settleMs * 3) {
        return { ...details, hostOk, doiOk, waitState: 'page_settled_unverified', elapsedMs: elapsed, windowId: activeWin.id };
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  if (lastDetails?.challenge || lastDetails?.authPage) throw new Error('window_closed_during_auth');
  throw new Error('publisher_window_closed_before_capture');
}

async function captureRenderedVisual(win, candidate, doi, publisher) {
  if (!win || win.isDestroyed() || !candidate?.src) return null;
  try {
    const target = await win.webContents.executeJavaScript(`(() => {
      const wanted = ${JSON.stringify(String(candidate?.src || ''))};
      const wantedKind = ${JSON.stringify(String(candidate?.kind || ''))};
      const semanticRe = /visual\s*abstract|graphical\s*abstract|abstract\s*(?:image|graphic)|toc\s*(?:graphic|image|entry)|table\s*of\s*contents(?:\s*(?:graphic|image|entry))?|graphical\s+synopsis/i;
      const figureOneRe = /(?:^|\b)(?:fig(?:ure)?\.?\s*1)(?:\b|[:.)])/i;
      const rejectRe = /logo|icon|avatar|journal\s*cover|issue\s*cover|advert|banner|cookie/i;
      const clean = value => {
        try {
          const u = new URL(String(value || ''), location.href);
          u.hash = '';
          return u.href;
        } catch { return String(value || ''); }
      };
      const wantedClean = clean(wanted);
      const wantedPath = (() => {
        try { return new URL(wantedClean).pathname; } catch { return ''; }
      })();
      let best = null;
      for (const img of document.images) {
        const urls = [
          img.currentSrc,
          img.src,
          img.getAttribute('data-src'),
          img.getAttribute('data-original'),
          img.getAttribute('data-lazy-src'),
          img.getAttribute('data-image-src'),
          img.getAttribute('data-lg-src'),
          img.getAttribute('data-hi-res-src'),
          img.getAttribute('data-full-src'),
        ].filter(Boolean).map(clean);
        const matched = urls.some(value => value === wantedClean)
          || (wantedPath && urls.some(value => {
            try { return new URL(value).pathname === wantedPath; } catch { return false; }
          }));
        const semanticRoot = img.closest('figure,[class*="visual"],[class*="graphical"],[class*="toc"],[id*="visual"],[id*="graphical"],[id*="toc"]') || img.parentElement;
        const marker = [
          img.alt,
          img.title,
          img.id,
          img.className,
          img.getAttribute('aria-label'),
          String(semanticRoot?.innerText || '').slice(0, 1800),
        ].filter(Boolean).join(' ');
        const semanticMatched = wantedKind === 'official' && semanticRe.test(marker) && !rejectRe.test(marker);
        const figureMatched = wantedKind === 'figure1' && figureOneRe.test(marker) && !rejectRe.test(marker);
        if (!matched && !semanticMatched && !figureMatched) continue;
        const rect = img.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 50) continue;
        best = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          naturalWidth: img.naturalWidth || 0,
          naturalHeight: img.naturalHeight || 0,
          matchMode: matched ? 'url' : semanticMatched ? 'semantic_official' : 'semantic_figure1',
        };
        img.scrollIntoView({ block: 'center', inline: 'center' });
        break;
      }
      return best;
    })()`);
    if (!target) return null;
    await new Promise(resolve => setTimeout(resolve, 500));

    const refreshed = await win.webContents.executeJavaScript(`(() => {
      const wanted = ${JSON.stringify(String(candidate?.src || ''))};
      const wantedKind = ${JSON.stringify(String(candidate?.kind || ''))};
      const semanticRe = /visual\s*abstract|graphical\s*abstract|abstract\s*(?:image|graphic)|toc\s*(?:graphic|image|entry)|table\s*of\s*contents(?:\s*(?:graphic|image|entry))?|graphical\s+synopsis/i;
      const figureOneRe = /(?:^|\b)(?:fig(?:ure)?\.?\s*1)(?:\b|[:.)])/i;
      const rejectRe = /logo|icon|avatar|journal\s*cover|issue\s*cover|advert|banner|cookie/i;
      const wantedPath = (() => { try { return new URL(wanted, location.href).pathname; } catch { return ''; } })();
      for (const img of document.images) {
        const urls = [img.currentSrc,img.src,img.getAttribute('data-src'),img.getAttribute('data-original'),img.getAttribute('data-lg-src'),img.getAttribute('data-hi-res-src')].filter(Boolean);
        const matched = urls.some(value => value === wanted) || (wantedPath && urls.some(value => { try { return new URL(value, location.href).pathname === wantedPath; } catch { return false; } }));
        const semanticRoot = img.closest('figure,[class*="visual"],[class*="graphical"],[class*="toc"],[id*="visual"],[id*="graphical"],[id*="toc"]') || img.parentElement;
        const marker = [img.alt,img.title,img.id,img.className,img.getAttribute('aria-label'),String(semanticRoot?.innerText || '').slice(0,1800)].filter(Boolean).join(' ');
        const semanticMatched = wantedKind === 'official' && semanticRe.test(marker) && !rejectRe.test(marker);
        const figureMatched = wantedKind === 'figure1' && figureOneRe.test(marker) && !rejectRe.test(marker);
        if (!matched && !semanticMatched && !figureMatched) continue;
        const rect = img.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 50) continue;
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      }
      return null;
    })()`);
    if (!refreshed) return null;

    const bounds = {
      x: Math.max(0, Math.floor(refreshed.left)),
      y: Math.max(0, Math.floor(refreshed.top)),
      width: Math.max(80, Math.ceil(refreshed.width)),
      height: Math.max(50, Math.ceil(refreshed.height)),
    };
    const bitmap = await win.webContents.capturePage(bounds);
    if (!bitmap || bitmap.isEmpty()) return null;

    let finalImage = bitmap;
    const size = bitmap.getSize();
    if (size.width < 700 && target.naturalWidth > size.width) {
      const scale = Math.min(2.5, Math.max(1, target.naturalWidth / Math.max(1, size.width)));
      finalImage = bitmap.resize({
        width: Math.min(2200, Math.round(size.width * scale)),
        height: Math.min(1600, Math.round(size.height * scale)),
      });
    }
    const buffer = finalImage.toPNG();
    if (buffer.length < 500) return null;

    await log('browser_rendered_visual_capture', {
      doi,
      publisher,
      kind: candidate.kind || '',
      bytes: buffer.length,
      width: finalImage.getSize().width,
      height: finalImage.getSize().height,
      matchMode: target.matchMode || '',
    });
    return {
      imageData: `data:image/png;base64,${buffer.toString('base64')}`,
      bytes: buffer.length,
      source: 'rendered_article_element',
    };
  } catch (error) {
    await log('browser_rendered_visual_capture_failed', { doi, publisher, reason: safeError(error, 250) });
    return null;
  }
}

async function inspectArticle(doi, { forceBrowserbase = forceBrowserbaseDiagnostic, verifyBrowserbaseImage = false } = {}) {
  const url = articleUrl(doi);
  if (!forceBrowserbase && classify(doi) === 'nature') {
    const structured = await inspectSpringerNatureStructured(doi);
    if (structured?.candidate) return structured;
  }
  let win = null;
  let publisherTimer;
  const childWindows = [];
  try {
    const publisher = classify(doi);
    const publisherSession = getPublisherSession(publisher);
    let resolvedProxy = '';
    try {
      resolvedProxy = await publisherSession.resolveProxy(url);
      await log('publisher_proxy_resolution', { doi, publisher, proxy: resolvedProxy || 'UNKNOWN', url: sanitizedPageUrl(url) });
    } catch (error) {
      resolvedProxy = 'RESOLVE_PROXY_FAILED';
      await log('publisher_proxy_resolution_failed', { doi, publisher, reason: safeError(error, 180) });
    }
    win = new BrowserWindow({
      show: showBrowserMode,
      webPreferences: {
        session: publisherSession,
        sandbox: true,
        contextIsolation: true,
        images: true,
      },
    });
    win.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        show: true,
        parent: win,
        webPreferences: {
          session: publisherSession,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          images: true,
        },
      },
    }));
    const registerChildWindow = child => {
      if (!child || childWindows.includes(child)) return;
      childWindows.push(child);
      try {
        child.webContents.setWindowOpenHandler(() => ({
          action: 'allow',
          overrideBrowserWindowOptions: {
            show: true,
            parent: child,
            webPreferences: {
              session: publisherSession,
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              images: true,
            },
          },
        }));
        child.webContents.on('did-create-window', registerChildWindow);
      } catch {}
      void log('local_auth_popup_opened', { doi, publisher, windowId: child.id, url: child.webContents.getURL() || '' });
    };
    win.webContents.on('did-create-window', registerChildWindow);
    if (forceBrowserFallback || forceBrowserbase) {
      throw new Error(forceBrowserbase ? 'browserbase_diagnostic_forced' : 'net::ERR_BLOCKED_BY_CLIENT (diagnostic injection)');
    }
    await Promise.race([
      win.loadURL(url, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36' }),
      new Promise((_, reject) => { publisherTimer = setTimeout(() => reject(new Error('publisher_timeout')), Math.max(1, Number(config.publisherTimeoutSeconds) || 35) * 1000); }),
    ]);
    clearTimeout(publisherTimer);
    publisherTimer = null;
    const waitDetails = await waitForLocalInteractiveArticle(win, childWindows, doi, publisher);
    const articleWin = [win, ...childWindows].find(item => item && !item.isDestroyed() && item.id === Number(waitDetails?.windowId || 0))
      || [win, ...childWindows].find(item => item && !item.isDestroyed() && publisherHostMatches(publisher, item.webContents.getURL()))
      || win;
    if (!articleWin || articleWin.isDestroyed()) throw new Error('publisher_window_closed_before_capture');
    if (articleWin !== win) {
      await log('local_interactive_article_window_handoff', { doi, publisher, fromWindowId: win?.id || 0, toWindowId: articleWin.id, url: articleWin.webContents.getURL() || '' });
    }
    const result = await articleWin.webContents.executeJavaScript(`(() => {
      const abs = u => { try { const value = new URL(u, location.href); return ['http:','https:'].includes(value.protocol) ? value.href : '' } catch { return '' } };
      const rows = [];
      for (const m of document.querySelectorAll('meta')) {
        const key = (m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('itemprop') || '').toLowerCase();
        if (['citation_graphical_abstract','citation_toc_graphic','citation_abstract_image'].includes(key)) {
          const src = abs(m.content || ''); if (src) rows.push({ src, text: key, width: 0, height: 0, kind: 'official' });
        }
      }
      const semanticRe = /visual\\s*abstract|graphical\\s*abstract|abstract\\s*(?:image|graphic)|toc\\s*(?:graphic|image|entry)|table\\s*of\\s*contents(?:\\s*(?:graphic|image|entry))?|first\\s+page\\s+image|graphical\\s+synopsis/i;
      for (const img of document.images) {
        const srcset = (img.getAttribute('srcset') || '').split(',').map(x => x.trim().split(/\\s+/)[0]).filter(Boolean).reverse();
        const sources = [img.getAttribute('data-lg-src'), img.getAttribute('data-hi-res-src'), img.getAttribute('data-src-large'), img.getAttribute('data-full-src'), img.getAttribute('data-src'), img.getAttribute('data-original'), img.getAttribute('data-lazy-src'), img.getAttribute('data-image-src'), img.currentSrc, ...srcset, img.src];
        const src = sources.map(abs).find(Boolean) || '';
        if (!src) continue;
        let root = img.closest('figure,section,article,div,aside') || img.parentElement;
        let context = '';
        for (let depth = 0; root && depth < 4; depth += 1, root = root.parentElement) context += ' ' + String(root?.innerText || '').slice(0,1200);
        const text = [img.alt, img.title, img.id, img.className, img.getAttribute('aria-label'), context].filter(Boolean).join(' ');
        const low = text.toLowerCase();
        if (/logo|icon|avatar|journal\\s*cover|issue\\s*cover|advert|banner|cookie/.test(low)) continue;
        const official = semanticRe.test(text);
        const fig1 = /(^|\\b)(fig(?:ure)?\\.?\\s*1)(\\b|[:.)])/i.test(text);
        if (official || fig1) rows.push({ src, text, width: img.naturalWidth || 0, height: img.naturalHeight || 0, kind: official ? 'official' : 'figure1' });
      }
      for (const heading of document.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,dt,[role="heading"]')) {
        const label = String(heading.textContent || '').trim();
        if (!semanticRe.test(label)) continue;
        let scope = heading.closest('section,figure,article,div') || heading.parentElement;
        for (let depth = 0; scope && depth < 4; depth += 1, scope = scope.parentElement) {
          const media = scope.querySelector('picture img,img,source[srcset]');
          if (!media) continue;
          const raw = media.currentSrc || media.src || media.getAttribute('data-src') || media.getAttribute('data-original') || media.getAttribute('srcset')?.split(',').at(-1)?.trim().split(/\\s+/)[0] || '';
          const src = abs(raw);
          if (src) rows.push({ src, text: label, width: media.naturalWidth || 0, height: media.naturalHeight || 0, kind: 'official' });
          break;
        }
      }
      for (const el of document.querySelectorAll('[style*="background-image"],[class*="graphical"],[class*="toc"],[id*="graphical"],[id*="toc"]')) {
        const marker = [el.id, el.className, el.getAttribute?.('aria-label'), String(el.innerText || '').slice(0,700)].filter(Boolean).join(' ');
        if (!semanticRe.test(marker)) continue;
        const bg = String(getComputedStyle(el).backgroundImage || '');
        const match = /url\\(["']?([^"')]+)["']?\\)/i.exec(bg);
        const src = abs(match?.[1] || '');
        if (src) rows.push({ src, text: marker, width: el.clientWidth || 0, height: el.clientHeight || 0, kind: 'official' });
      }
      const pdfLinks = [...document.querySelectorAll('a[href]')]
        .map(a => ({ href: abs(a.getAttribute('href') || ''), text: String(a.textContent || '').trim() }))
        .filter(item => item.href && (/\\bpdf\\b|download|epdf/i.test(item.text + ' ' + item.href)))
        .slice(0, 30);
      const bodyText = String(document.body?.innerText || '').slice(0, 180000);
      const semanticNodes = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,dt,[role="heading"],[class*="graphical"],[class*="visual"],[class*="toc"],[id*="graphical"],[id*="visual"],[id*="toc"]')];
      const semanticLabels = semanticNodes.map(el => String(el.textContent || el.getAttribute?.('aria-label') || '').trim()).filter(text => semanticRe.test(text)).slice(0, 20);
      const figure1MarkerCount = (bodyText.match(/(?:figure|fig\\.)\\s*1\\b/gi) || []).length;
      return {
        title: document.title,
        href: location.href,
        rows,
        pdfLinks,
        html: String(document.documentElement?.outerHTML || '').slice(0, 2500000),
        pageDiagnostics: {
          imageCount: document.images.length,
          figureCount: document.querySelectorAll('figure').length,
          semanticMarkerCount: semanticLabels.length,
          semanticLabels,
          figure1MarkerCount,
          institutionalAccessSignal: /access provided by|institutional access|access through your institution|signed in through|authenticated by/i.test(bodyText),
        },
      };
    })()`);
    const rows = Array.isArray(result?.rows) ? [...result.rows] : [];
    const adapterRows = result?.html
      ? extractPublisherMediaCandidates(result.html, result?.href || url, { doi, publisher })
      : [];
    for (const adapterCandidate of adapterRows.slice(0, 20)) {
      if (!rows.some(item => item?.src === adapterCandidate.src)) rows.push(adapterCandidate);
    }
    if (adapterRows[0]) {
      await log('browser_adapter_candidate', {
        doi,
        kind: adapterRows[0].kind,
        assetType: adapterRows[0].assetType || '',
        source: adapterRows[0].source || '',
        score: Number(adapterRows[0].score || 0),
        candidates: adapterRows.length,
        url: result?.href || url,
      });
    }
    rows.sort((a,b) => {
      const sa = semanticScore(a.text) + (a.kind === 'official' ? 20 : 0) + Math.min(20, ((a.width||0)*(a.height||0))/100000);
      const sb = semanticScore(b.text) + (b.kind === 'official' ? 20 : 0) + Math.min(20, ((b.width||0)*(b.height||0))/100000);
      return sb - sa;
    });
    const pageUrl = result?.href || url;
    const normalized = String(doi || '').toLowerCase();
    const suffix = normalized.split('/').at(-1) || normalized;
    const hostOk = publisherHostMatches(publisher, pageUrl);
    const doiOk = String(waitDetails?.citationDoi || '').includes(normalized)
      || String(waitDetails?.canonical || '').includes(normalized)
      || String(pageUrl).toLowerCase().includes(suffix.toLowerCase());
    const diagnostic = {
      method: 'browser',
      publisher,
      proxy: resolvedProxy,
      requestedUrl: url,
      finalUrl: pageUrl,
      title: result?.title || '',
      challenge: Boolean(waitDetails?.challenge),
      authPage: Boolean(waitDetails?.authPage),
      hostOk,
      doiOk,
      articleSignal: Boolean(waitDetails?.articleSignal),
      institutionalAccessSignal: Boolean(waitDetails?.institutionalAccessSignal || result?.pageDiagnostics?.institutionalAccessSignal),
      waitState: waitDetails?.waitState || '',
      imageCount: Number(result?.pageDiagnostics?.imageCount || 0),
      figureCount: Number(result?.pageDiagnostics?.figureCount || 0),
      semanticMarkerCount: Number(result?.pageDiagnostics?.semanticMarkerCount || 0),
      semanticLabels: Array.isArray(result?.pageDiagnostics?.semanticLabels) ? result.pageDiagnostics.semanticLabels.slice(0, 20) : [],
      figure1MarkerCount: Number(result?.pageDiagnostics?.figure1MarkerCount || 0),
      candidateCount: rows.length,
      adapterCandidateCount: adapterRows.length,
      topCandidates: rows.slice(0, 5).map(item => ({
        kind: item.kind || '',
        source: item.source || '',
        assetType: item.assetType || '',
        score: Number(item.score || semanticScore(item.text) || 0),
        width: Number(item.width || 0),
        height: Number(item.height || 0),
        src: sanitizedPageUrl(item.src || ''),
      })),
    };
    if (!rows[0]) {
      const pageUrl = result?.href || url;
      const pdfLinks = Array.isArray(result?.pdfLinks) ? result.pdfLinks : [];
      const currentIsPdfViewer =
        (publisher === 'wiley' && /\/doi\/(?:e?pdf)\//i.test(pageUrl)) ||
        (publisher === 'acs' && /\/doi\/(?:e?pdf|pdf)\//i.test(pageUrl)) ||
        /\.pdf(?:[?#]|$)/i.test(pageUrl);
      const pdfUrl = currentIsPdfViewer ? pageUrl : String(pdfLinks[0]?.href || '');
      if (localOnlyMode) {
        await log('local_browser_no_visual', { doi, publisher, diagnostic });
        return {
          url: pageUrl,
          candidate: null,
          method: 'local_browser_no_candidate',
          verifiedLocalSession: localPublisherReady(publisher),
          diagnostic,
        };
      }
      if (localPublisherReady(publisher)) {
        let pdf = null;
        if (pdfUrl) {
          pdf = await downloadPdfFromPublisherBrowser({ doi, publisher, webContents: articleWin.webContents, pdfUrl });
        }
        await log('verified_local_browser_no_visual', {
          doi,
          publisher,
          url: pageUrl,
          pdfUrl: pdfUrl || '',
          pdfDownloaded: Boolean(pdf),
          pdfBytes: Number(pdf?.bytes || 0),
        });
        return {
          url: pageUrl,
          candidate: null,
          method: pdf ? 'browser_pdf_downloaded' : 'verified_local_browser',
          pdfUrl: pdfUrl || '',
          pdfPath: pdf?.path || '',
          pdfBytes: Number(pdf?.bytes || 0),
          verifiedLocalSession: true,
        };
      }
      throw new Error('browser_no_candidate');
    }
    await log('browser_success', { doi, kind: rows[0].kind, url: result?.href || url });
    const renderedImage = await captureRenderedVisual(articleWin, rows[0], doi, publisher);
    return { url: result?.href || url, candidate: rows[0], method: 'browser', diagnostic, image: renderedImage };
  } catch (error) {
    const browserError = safeError(error, 300).replace(/https?:\/\/\S+/g, '<url>');
    if (publisherTimer) clearTimeout(publisherTimer);
    publisherTimer = null;
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
    await log('browser_blocked_fallback', { doi, browserError, blockedByClient: /ERR_BLOCKED_BY_CLIENT/i.test(browserError) });
    let htmlResult = null;
    if (!forceBrowserbase) {
      try { htmlResult = await inspectArticleHtml(doi, url, browserError); }
      catch (htmlError) {
        await log('publisher_html_fallback_failed', { doi, reason: safeError(htmlError, 300) });
      }
    } else {
      await log('browserbase_diagnostic_forced', { doi });
    }
    if (htmlResult?.candidate) return htmlResult;
    const publisher = classify(doi);
    if (!forceBrowserbase && localPublisherReady(publisher)) {
      await log('browserbase_skipped_verified_local_session', { doi, publisher, browserError });
      return htmlResult || { url, candidate: null, method: 'verified_local_no_candidate', verifiedLocalSession: true };
    }
    if (localOnlyMode) {
      await log('browserbase_skipped_local_only', { doi, publisher, browserError });
      if (htmlResult) {
        htmlResult.diagnostic = { ...(htmlResult.diagnostic || {}), publisher, requestedUrl: url, error: browserError, method: htmlResult.method || 'html_fallback' };
        return htmlResult;
      }
      return {
        url,
        candidate: null,
        method: 'local_only_no_candidate',
        verifiedLocalSession: localPublisherReady(publisher),
        diagnostic: {
          publisher,
          requestedUrl: url,
          finalUrl: '',
          error: browserError,
          waitState: /auth_not_completed/.test(browserError) ? 'auth_timeout' : /window_closed_during_auth/.test(browserError) ? 'window_closed_during_auth' : '',
          challenge: /captcha|challenge/i.test(browserError),
          authPage: /auth_not_completed|window_closed_during_auth/i.test(browserError),
          hostOk: null,
          doiOk: null,
          candidateCount: 0,
          adapterCandidateCount: 0,
        },
      };
    }
    const browserbaseResult = await inspectArticleBrowserbase(doi, url, browserError, { verifyImage: verifyBrowserbaseImage });
    if (browserbaseResult?.candidate) return browserbaseResult;
    // PDF is deliberately a later, independent resolver. Reaching this marker
    // means local browser, direct HTML, and Browserbase produced no visual.
    await log('pdf_fallback_next', { doi, localCandidate: Boolean(htmlResult?.candidate), browserbaseConfigured: browserbaseDiagnostic().configured });
    return htmlResult || { url, candidate: null, method: 'no_candidate' };
  } finally {
    if (publisherTimer) clearTimeout(publisherTimer);
    for (const child of childWindows) {
      try { if (child && !child.isDestroyed()) child.destroy(); } catch {}
    }
    if (win && !win.isDestroyed()) win.destroy();
  }
}

async function imageData(url, referer) {
  const assetPublisher = publisherFromUrl(url);
  const refererPublisher = publisherFromUrl(referer);
  const publisher = assetPublisher || refererPublisher || '';
  const headers = {
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    Referer: referer,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  let res;
  try {
    res = publisher
      ? await getPublisherSession(publisher).fetch(url, { headers, signal: AbortSignal.timeout(30000) })
      : await publisherFetch(url, { headers, signal: AbortSignal.timeout(30000) }, 'publisher_image_node_fallback');
  } catch (error) {
    await log('publisher_image_session_fetch_failed', { publisher, url: sanitizedPageUrl(url), reason: safeError(error, 220) });
    throw error;
  }
  if (!res.ok) throw new Error(`image_http_${res.status}`);
  let buffer = Buffer.from(await res.arrayBuffer());
  const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].toLowerCase();
  if (!type.startsWith('image/')) throw new Error(`image_content_type_${type || 'missing'}`);

  if (type === 'image/svg+xml') {
    const svgImage = nativeImage.createFromBuffer(buffer);
    if (!svgImage.isEmpty()) {
      const size = svgImage.getSize();
      const width = Math.max(800, Math.min(2800, Number(size.width || 1600)));
      const height = Math.max(400, Math.min(2000, Number(size.height || 900)));
      buffer = svgImage.resize({ width, height }).toPNG();
      return `data:image/png;base64,${buffer.toString('base64')}`;
    }
    return `data:image/svg+xml;base64,${buffer.toString('base64')}`;
  }

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
  if (localOnlyMode || !config.writeToken) return;
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
      if (inspected.pdfPath) {
        if (!inspectOnly) {
          await setCooldown(doi, 'pdf_downloaded_visual_extraction_pending', 6 * 60 * 60 * 1000);
          await report(doi, 'extract', 'partial', 'pdf_downloaded_visual_extraction_pending', inspected.pdfUrl || inspected.url);
        }
        await log('pdf_visual_extraction_pending', {
          doi,
          publisher: classify(doi),
          path: inspected.pdfPath,
          bytes: Number(inspected.pdfBytes || 0),
        });
        return { doi, status: 'pdf_downloaded', source: inspected.method || '', pdfPath: inspected.pdfPath, pdfBytes: Number(inspected.pdfBytes || 0), diagnostic: inspected.diagnostic || {} };
      }
      if (!inspectOnly && !localOnlyMode) {
        const reason = inspected.verifiedLocalSession ? 'verified_local_no_visual' : 'semantic_media_not_found';
        const waitMs = inspected.verifiedLocalSession ? 6 * 60 * 60 * 1000 : 72 * 60 * 60 * 1000;
        await setCooldown(doi, reason, waitMs);
        await report(doi, 'extract', 'partial', reason, inspected.url);
      }
      return { doi, status: 'no_candidate', source: inspected.method || '', reason: diagnosisReason({ status: 'no_candidate', diagnostic: inspected.diagnostic || {} }), diagnostic: inspected.diagnostic || {} };
    }
    if (officialOnlyMode && c.kind !== 'official' && !localOnlyMode) {
      await log('local_official_only_skip_fallback', { doi, kind: c.kind, source: inspected.method || '' });
      return { doi, status: 'no_official_toc', source: inspected.method || '', diagnostic: inspected.diagnostic || {} };
    }
    let data;
    try {
      data = inspected?.image?.imageData || c.imageData || await imageData(c.src, inspected.url);
    } catch (error) {
      const imageError = safeError(error, 300);
      await log('image_download_failed', { doi, kind: c.kind, reason: imageError, candidate: sanitizedPageUrl(c.src || '') });
      return {
        doi,
        status: 'failed',
        reason: 'image_download_failed',
        source: inspected.method || '',
        diagnostic: {
          ...(inspected.diagnostic || {}),
          publisher: classify(doi),
          requestedUrl: articleUrl(doi),
          finalUrl: inspected.url || '',
          error: imageError,
          candidateCount: Math.max(1, Number(inspected.diagnostic?.candidateCount || 0)),
          topCandidates: inspected.diagnostic?.topCandidates || [{
            kind: c.kind || '',
            source: c.source || '',
            assetType: c.assetType || '',
            score: Number(c.score || 0),
            src: sanitizedPageUrl(c.src || ''),
          }],
        },
      };
    }
    const localCapture = ['official','figure1'].includes(c.kind) ? await saveLocalTocCapture(doi, c, data, inspected.url) : null;
    if (localOnlyMode) {
      if (localCapture) return { doi, status: c.kind === 'official' ? 'saved_local' : 'saved_local_figure1', kind: c.kind, source: inspected.method, localPath: localCapture.path, diagnostic: inspected.diagnostic || {} };
      return { doi, status: 'local_only_candidate_not_saved', kind: c.kind, source: inspected.method, diagnostic: inspected.diagnostic || {} };
    }
    if (inspectOnly) {
      await log('upload_failed', { doi, kind: c.kind, reason: 'write_token_missing_inspection_only' });
      return { doi, status: localCapture ? 'saved_local' : 'inspection_only', reason: 'write_token_missing', kind: c.kind, source: inspected.method, localPath: localCapture?.path || '' };
    }
    if (!config.writeToken) {
      if (localCapture) return { doi, status: 'saved_local', kind: c.kind, source: inspected.method, localPath: localCapture.path };
      throw new Error('write_token_missing');
    }
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
    else if (/window_closed_during_auth/i.test(msg)) { reason = 'window_closed_during_auth'; ms = 10*60*1000; }
    else if (/publisher_window_closed_before_capture/i.test(msg)) { reason = 'window_closed_before_capture'; ms = 10*60*1000; }
    else if (/auth_not_completed/i.test(msg)) { reason = 'auth_not_completed'; ms = 10*60*1000; }
    else if (/captcha_or_challenge/i.test(msg)) { reason = 'captcha_or_challenge'; ms = 10*60*1000; }
    else if (/timeout/i.test(msg)) { reason = 'publisher_timeout'; ms = 8*60*60*1000; }
    else if (/ERR_BLOCKED_BY_CLIENT/i.test(msg)) { reason = 'publisher_client_blocked'; ms = 30*60*1000; }
    if (!inspectOnly && !localOnlyMode) {
      await setCooldown(doi, reason, ms);
      await report(doi, 'process', 'failed', reason, articleUrl(doi));
    }
    await log('paper failed', { doi, reason, msg });
    return { doi, status: 'failed', reason, diagnostic: { publisher: classify(doi), requestedUrl: articleUrl(doi), error: msg, candidateCount: 0, adapterCandidateCount: 0 } };
  }
}

async function processBatch(items) {
  const eligible = items.filter(x => localOnlyMode || !cooldownActive(String(x.doi||'')));
  const selected = scanAllMode ? eligible : eligible.slice(0, Math.max(1, Number(config.maxPerCycle)||12));
  const results = [];
  const delayMs = localOnlyMode ? Math.max(1500, Number(config.localScanDelayMs || 5000)) : 0;

  liveScan = {
    running: true,
    total: selected.length,
    current: 0,
    currentDoi: '',
    saved: 0,
    noOfficial: 0,
    failed: 0,
    pdfDownloaded: 0,
    other: 0,
    startedAt: Date.now(),
    finishedAt: 0,
    recent: [],
  };
  stageStatus = localOnlyMode ? '本机/VPN TOC 扫描正在进行…' : 'TOC 扫描正在进行…';
  await refreshDashboard();

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    const doi = String(item.doi || '');
    liveScan.current = index + 1;
    liveScan.currentDoi = doi;
    stageStatus = `正在处理 ${index + 1}/${selected.length}：${doi}`;
    await refreshDashboard();

    const result = await processItem(item, { ignoreCooldown: localOnlyMode });
    results.push(result);

    const status = result?.status || 'unknown';
    if (['official','saved_local'].includes(status)) liveScan.saved += 1;
    else if (status === 'saved_local_figure1') { liveScan.noOfficial += 1; liveScan.other += 1; }
    else if (['no_candidate','no_official_toc'].includes(status)) liveScan.noOfficial += 1;
    else if (status === 'failed') liveScan.failed += 1;
    else if (status === 'pdf_downloaded') liveScan.pdfDownloaded += 1;
    else liveScan.other += 1;

    liveScan.recent.unshift({
      doi,
      publisher: classify(doi),
      status,
      reason: result?.reason || '',
      localPath: result?.localPath || '',
      at: Date.now(),
    });
    liveScan.recent = liveScan.recent.slice(0, 12);

    await log('local_scan_progress', { current: index + 1, total: selected.length, doi, status, reason: diagnosisReason(result) });
    await appendDiagnostic({ ...result, doi }, index + 1, selected.length);
    await refreshDashboard();
    if (delayMs && index + 1 < selected.length) await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  liveScan.running = false;
  liveScan.currentDoi = '';
  liveScan.finishedAt = Date.now();
  stageStatus = `扫描完成：已保存 ${liveScan.saved}，未发现官方 TOC ${liveScan.noOfficial}，失败 ${liveScan.failed}`;
  await finalizeDiagnosticRun(selected, results);
  await refreshDashboard();
  return results;
}

async function runBrowserbaseAcceptanceTarget(doi) {
  const publisher = classify(doi);
  try {
    const inspected = await inspectArticle(doi, { forceBrowserbase: true, verifyBrowserbaseImage: true });
    if (inspected.method !== 'browserbase' || !inspected.candidate || !inspected.image) throw new Error('browserbase_acceptance_no_verified_visual');
    const result = {
      doi,
      publisher,
      status: 'verified',
      kind: inspected.candidate.kind,
      sessionId: inspected.sessionId || '',
      imageBytes: inspected.image.bytes,
    };
    state.browserbase.acceptance[publisher] = result;
    await saveState();
    return result;
  } catch (error) {
    const message = safeError(error, 300);
    const result = { doi, publisher, status: /manual_required/.test(message) ? 'manual_required' : 'failed', reason: message };
    state.browserbase.acceptance[publisher] = result;
    await saveState();
    return result;
  }
}

async function runBrowserbaseBatchTest(limit = 12) {
  const acceptance = state.browserbase.acceptance || {};
  if (acceptance.acs?.status !== 'verified' || acceptance.wiley?.status !== 'verified') {
    throw new Error('browserbase_acceptance_required_before_batch');
  }
  const items = lastQueue.filter(item => ['acs', 'wiley'].includes(classify(item.doi))).slice(0, limit);
  let resolved = 0;
  const results = [];
  for (const item of items) {
    const result = await runBrowserbaseAcceptanceTarget(String(item.doi || '').toLowerCase());
    results.push({ doi: result.doi, status: result.status, kind: result.kind || '' });
    if (result.status === 'verified') resolved += 1;
  }
  state.browserbase.batch = { requested: items.length, resolved, at: Date.now(), results };
  await saveState();
  await log('browserbase_batch_completed', { requested: items.length, resolved });
  return state.browserbase.batch;
}

async function runBrowserbaseAcceptance() {
  if (!browserbaseDiagnostic().configured) {
    stageStatus = 'Browserbase API Key 缺失；未发起远端测试。';
    await refreshDashboard();
    return { configured: false };
  }
  stageStatus = '正在进行 Browserbase 只读验收：ACS 与 Wiley…';
  await refreshDashboard();
  const acs = await runBrowserbaseAcceptanceTarget('10.1021/acs.orglett.6c03622');
  const wiley = await runBrowserbaseAcceptanceTarget('10.1002/anie.1537547');
  let batch = null;
  if (acs.status === 'verified' && wiley.status === 'verified') batch = await runBrowserbaseBatchTest(12);
  stageStatus = batch
    ? `Browserbase 验收完成；12 条只读测试解析 ${batch.resolved}/${batch.requested}。`
    : `Browserbase 验收完成：ACS ${acs.status}；Wiley ${wiley.status}。`;
  await refreshDashboard();
  return { configured: true, acs, wiley, batch };
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
    await releaseVerifiedPublisherCooldowns();
    if (!String(config.writeToken || '').trim() && !localOnlyMode) {
      stageStatus = '等待配置 writeToken；尚未开始采集或上传';
      await log('collector waiting for writeToken; no collection performed');
      mark('background.collector.waiting-for-token');
      refreshDashboard();
      return;
    }
    if (!String(config.writeToken || '').trim() && localOnlyMode) {
      stageStatus = '本机/VPN 扫描模式：未配置 writeToken，抓到的官方 TOC 仅保存本机，不上传。';
      await log('local_only_without_write_token', { captureDir: localCaptureDir() });
    }
    const queue = await fetchQueue();
    const net = await networkState();
    network = net;
    const open = queue.filter(x => ['nature','science','other','rsc','elsevier'].includes(classify(x.doi)));
    const restricted = queue.filter(x => ['acs','wiley'].includes(classify(x.doi)));
    const runnableRestricted = localOnlyMode
      ? restricted
      : restricted.filter(x => (classify(x.doi)==='acs' ? net.acs : net.wiley));
    const runnable = localOnlyMode && doiFilePath ? queue : [...open, ...runnableRestricted];
    const results = await processBatch(runnable);
    const success = results.filter(x => ['official','figure1','pdf_downloaded','saved_local','saved_local_figure1'].includes(x?.status)).length;
    const failed = results.filter(x => x?.status === 'failed').length;
    state.lastSummary = { at: Date.now(), queue: queue.length, processed: results.length, success, failed, net, localOnlyMode, scanAllMode, officialOnlyMode, showBrowserMode, doiFilePath, localCaptureDir: localCaptureDir() };
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
    await refreshDashboard();
    if (localOnlyMode && scanAllMode && doiFilePath) {
      stageStatus = '本机队列扫描完成，正在退出并同步 captures / diagnostics 到 R2…';
      await log('local_one_shot_complete_auto_exit', { queue: queue.length, processed: results.length, success, failed, doiFilePath });
      await refreshDashboard();
      const timer = setTimeout(() => {
        try { app.quit(); } catch {}
      }, 1200);
      timer.unref?.();
    }
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
  const scan = liveScan || {};
  const scanPercent = Number(scan.total || 0) > 0 ? Math.round((Number(scan.current || 0) / Number(scan.total || 1)) * 100) : 0;
  const scanRows = (scan.recent || []).map(item => {
    const label = item.status === 'saved_local' || item.status === 'official'
      ? '已抓到官方 TOC'
      : item.status === 'saved_local_figure1'
        ? '已保存 Figure 1 fallback'
        : item.status === 'no_candidate' || item.status === 'no_official_toc'
        ? '未发现官方 TOC'
        : item.status === 'failed'
          ? '失败'
          : item.status === 'pdf_downloaded'
            ? '已下载 PDF'
            : item.status;
    const cls = item.status === 'saved_local' || item.status === 'official' ? 'ok' : item.status === 'failed' ? 'bad' : '';
    return `<tr><td>${escapeHtml(item.doi)}</td><td>${escapeHtml(String(item.publisher || '').toUpperCase())}</td><td class="${cls}">${escapeHtml(label)}</td><td>${escapeHtml(item.reason || '')}</td></tr>`;
  }).join('');
  const net = Object.keys(network).length ? network : (summary.net || {});
  const restricted = lastQueue.filter(x => ['acs','wiley'].includes(classify(x.doi))).length;
  const rows = lastQueue.slice(0, 12).map(x => `<tr><td>${escapeHtml(x.doi)}</td><td>${escapeHtml(classify(x.doi).toUpperCase())}</td></tr>`).join('');
  const configInfo = configDiagnostic();
  const browserbaseInfo = browserbaseDiagnostic();
  const browserbaseBatch = state.browserbase?.batch;
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
    .scanbox{background:#fff;border:1px solid #d8dadd;border-radius:12px;padding:16px;margin:14px 0}.scanhead{display:flex;justify-content:space-between;gap:12px;align-items:center}.progress{height:12px;background:#e6e8eb;border-radius:999px;overflow:hidden;margin:12px 0}.bar{height:100%;background:#188038;width:${scanPercent}%}.current-doi{font-family:Consolas,monospace;font-size:13px;overflow-wrap:anywhere;background:#f6f7f9;border-radius:7px;padding:8px;margin-top:8px}.scan-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.scan-metric{background:#f8f9fa;border-radius:8px;padding:10px}.scan-metric .n{font-size:22px;font-weight:600}.scan-metric .l{font-size:11px;color:#666}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden}td,th{padding:8px 10px;border-bottom:1px solid #eee;text-align:left;font-size:13px}
    .note{font-size:12px;color:#666;margin-top:12px;line-height:1.5}.errors{background:#fff1f0;border:1px solid #d77;border-radius:8px;padding:12px;margin:12px 0;overflow-wrap:anywhere}.status{padding:10px 0;color:#174d32}.credentials{background:#fff;border:1px solid #ddd;border-radius:10px;padding:14px;margin:14px 0}.credentials label{display:block;font-size:13px;margin:10px 0 4px}.credentials input{box-sizing:border-box;width:100%;padding:9px;border:1px solid #bbb;border-radius:6px}.credentials button{margin:10px 8px 0 0;padding:8px 12px;border:1px solid #777;border-radius:7px;background:#fff}.credentials .primary{background:#174d32;color:#fff;border-color:#174d32}
  </style></head><body><div class="wrap"><h1>Organic Synthesis Gallery · TOC Collector</h1><div class="sub">程序已启动 · TOC Collector ${escapeHtml(app.getVersion())} started successfully<br>${closeHint}</div>
  <div class="status">${escapeHtml(stageStatus)}</div>${errors ? `<div class="errors" role="alert">后台错误（主窗口继续运行）${errors}</div>` : ''}
  <section class="scanbox">
    <div class="scanhead"><strong>本机 TOC 抓取进度</strong><span>${scan.running ? `运行中 · ${scanPercent}%` : scan.finishedAt ? '已完成' : '待开始'}</span></div>
    <div class="progress"><div class="bar"></div></div>
    <div class="scan-grid">
      <div class="scan-metric"><div class="n">${Number(scan.current || 0)}/${Number(scan.total || 0)}</div><div class="l">已处理 / 总数</div></div>
      <div class="scan-metric"><div class="n ok">${Number(scan.saved || 0)}</div><div class="l">已抓到官方 TOC</div></div>
      <div class="scan-metric"><div class="n">${Number(scan.noOfficial || 0)}</div><div class="l">未发现官方 TOC</div></div>
      <div class="scan-metric"><div class="n bad">${Number(scan.failed || 0)}</div><div class="l">失败</div></div>
    </div>
    <div class="current-doi">${scan.currentDoi ? `当前：${escapeHtml(scan.currentDoi)}` : scan.finishedAt ? '当前扫描已结束' : '尚未开始处理 DOI'}</div>
    <div class="note">官方 TOC 本地目录：<code>${escapeHtml(localCaptureDir())}</code></div>
    <div class="buttons"><a href="collector:captures">打开 TOC 保存目录</a><a href="collector:log">查看详细日志</a></div>
    <table><thead><tr><th>最近 DOI</th><th>来源</th><th>结果</th><th>原因</th></tr></thead><tbody>${scanRows || '<tr><td colspan="4">暂无处理结果</td></tr>'}</tbody></table>
  </section>
  <div class="grid">
    <div class="card"><div class="k">当前队列</div><div class="v">${lastQueue.length}</div></div>
    <div class="card"><div class="k">ACS / Wiley 待处理</div><div class="v">${restricted}</div></div>
    <div class="card"><div class="k">ACS 网络 / 权限</div><div class="v ${net.acs ? 'ok':'bad'}">${net.acs === true ? '可使用' : net.acs === false ? '不可用' : '待检测'}${net.acsSource ? `<br><small>${escapeHtml(net.acsSource)}</small>` : ''}</div></div>
    <div class="card"><div class="k">Wiley 网络 / 权限</div><div class="v ${net.wiley ? 'ok':'bad'}">${net.wiley === true ? '可使用' : net.wiley === false ? '不可用' : '待检测'}${net.wileySource ? `<br><small>${escapeHtml(net.wileySource)}</small>` : ''}</div></div>
    <div class="card"><div class="k">写入密钥</div><div class="v" style="font-size:14px">${escapeHtml(tokenState)}</div></div>
    <div class="card"><div class="k">Browserbase</div><div class="v" style="font-size:14px">${browserbaseInfo.configured ? '已配置' : '缺失'} · ACS ${escapeHtml(state.browserbase?.status?.acs || browserbaseInfo.acs)}<br>Wiley ${escapeHtml(state.browserbase?.status?.wiley || browserbaseInfo.wiley)} · Nature ${escapeHtml(state.browserbase?.status?.nature || 'standby')} · Science ${escapeHtml(state.browserbase?.status?.science || 'standby')}${browserbaseBatch ? `<br>12 条测试：${Number(browserbaseBatch.resolved || 0)}/${Number(browserbaseBatch.requested || 0)}` : ''}</div></div>
    <div class="card"><div class="k">上次处理</div><div class="v" style="font-size:14px">${summary.at ? `成功 ${Number(summary.success||0)} · 失败 ${Number(summary.failed||0)}` : '尚未采集'}</div></div>
  </div>
  <div class="buttons">${stageResults.collector === 'ok' && !diagnosticRequested ? '<a href="collector:check">现在检查一次</a>' : ''}<a href="collector:config">打开当前设置</a><a href="collector:reload-config">重新加载设置</a><a href="collector:log">查看日志</a>${validTray() ? '<a href="collector:hide">隐藏到托盘</a>' : ''}<a href="collector:quit">退出程序</a></div>
  <section class="credentials"><strong>本机 / 学校 VPN 出版社权限</strong><div class="note">这里使用 Collector 本机持久浏览器会话，不使用 Browserbase。会话直接走 Windows 网络，因此系统级学校 VPN 会生效；ACS/Wiley 已验证状态会直接参与后台调度。</div><div class="buttons" id="local-publisher-actions">${['acs','wiley','nature','science'].map(publisher => { const label = manualPublisherLabel(publisher); const local = state.localPublisher?.[publisher] || {}; return `<span><button type="button" data-local-start="${publisher}">本机打开 ${escapeHtml(label)}</button><button type="button" data-local-finish="${publisher}">检查本机权限</button><small style="display:block;color:#666;margin-top:3px">${escapeHtml(local.status || '未验证')}${local.pdfAccess ? ' · PDF 可访问' : ''}</small></span>`; }).join('')}</div></section>
  <section class="credentials"><strong>Browserbase 本机凭据</strong><div class="note">密钥只保存到当前进程的 config.json；界面、日志和控制台都不会显示密钥。</div><form id="browserbase-form"><label for="browserbase-api-key">Browserbase API Key</label><input id="browserbase-api-key" type="password" autocomplete="off" maxlength="2048" placeholder="粘贴 API Key"><label for="browserbase-project-id">Browserbase Project ID（可选）</label><input id="browserbase-project-id" type="text" autocomplete="off" maxlength="512" placeholder="可留空"><button class="primary" type="submit">保存</button><button id="browserbase-clear" type="button">清除凭据</button>${browserbaseInfo.configured ? '<button id="browserbase-test" type="button">Browserbase 验收</button>' : ''}<span class="note" id="browserbase-action-status"></span></form>${browserbaseInfo.configured ? `<div class="note" style="margin-top:14px"><strong>人工验证 / 权限初始化</strong><br>点击后会打开 Browserbase Live View。完成出版社验证后回到此窗口点击对应“完成验证”。验证状态会保存在该出版社的 persistent Context 中。</div><div class="buttons" id="manual-publisher-actions">${['acs','wiley','nature','science'].map(publisher => { const label = manualPublisherLabel(publisher); const manual = state.browserbase?.manual?.[publisher] || {}; return `<span><button type="button" data-manual-start="${publisher}">${manual.sessionId ? '打开 Live Session' : `人工处理 ${escapeHtml(label)}`}</button><button type="button" data-manual-finish="${publisher}">继续当前任务</button><small style="display:block;color:#666;margin-top:3px">${escapeHtml(manual.status || '未初始化')}${manual.sessionId ? ` · Session ${escapeHtml(manual.sessionId)}` : ''}${manual.contextId ? ` · Context ${escapeHtml(manual.contextId)}` : ''}</small></span>`; }).join('')}</div>` : ''}</section>
  <table><thead><tr><th>最近待处理 DOI</th><th>来源</th></tr></thead><tbody>${rows || '<tr><td colspan="2">当前无待处理项目</td></tr>'}</tbody></table>
  <div class="note">实际 userData：<code>${escapeHtml(configInfo.userData)}</code><br>实际 config.json：<code>${escapeHtml(configInfo.configPath)}</code><br>设置状态：${escapeHtml(configInfo.message)}${configInfo.reloadedAt ? `（${escapeHtml(new Date(configInfo.reloadedAt).toLocaleString())}）` : ''}<br>VPN 程序：${vpnState}<br>自动检查间隔：${Number(config.pollMinutes||10)} 分钟；提醒间隔：${Number(config.reminderHours||6)} 小时。</div>
  </div><script>(() => {
    const bridge = window.tocCollector;
    const form = document.getElementById('browserbase-form');
    const status = document.getElementById('browserbase-action-status');
    if (!form) return;
    const show = text => { status.textContent = text; };
    form.addEventListener('submit', event => event.preventDefault());
    if (!bridge) {
      show('设置接口加载失败，请使用修复后的程序。');
      for (const button of form.querySelectorAll('button')) button.disabled = true;
      return;
    }
    let busy = false;
    const run = async (message, action) => {
      if (busy) return;
      busy = true;
      show(message);
      for (const button of form.querySelectorAll('button')) button.disabled = true;
      try {
        const result = await action();
        if (result.error) { show('操作失败：' + result.error); return; }
        show(result.configured ? '已生效。' : '当前未配置。');
      } catch {
        // IPC errors may contain arguments: never display or log the raw error.
        show('操作未完成，请重新加载设置后重试。');
      } finally {
        busy = false;
        for (const button of form.querySelectorAll('button')) button.disabled = false;
      }
    };
    form.addEventListener('submit', () => {
      void run('正在保存…', async () => {
        const apiKey = document.getElementById('browserbase-api-key').value;
        const projectId = document.getElementById('browserbase-project-id').value;
        document.getElementById('browserbase-api-key').value = '';
        return bridge.saveBrowserbase({ apiKey, projectId });
      });
    });
    document.getElementById('browserbase-clear').addEventListener('click', () => {
      void run('正在清除…', () => bridge.clearBrowserbase());
    });
    document.getElementById('browserbase-test')?.addEventListener('click', () => {
      void run('正在进行只读验收…', () => bridge.testBrowserbase());
    });
    document.querySelectorAll('[data-local-start]').forEach(button => button.addEventListener('click', () => {
      const publisher = button.getAttribute('data-local-start');
      void run('正在打开本机/VPN 出版社窗口…', () => bridge.startLocalPublisher(publisher));
    }));
    document.querySelectorAll('[data-local-finish]').forEach(button => button.addEventListener('click', () => {
      const publisher = button.getAttribute('data-local-finish');
      void run('正在检查文章页与 PDF 权限…', () => bridge.finishLocalPublisher(publisher));
    }));
    document.querySelectorAll('[data-manual-start]').forEach(button => button.addEventListener('click', () => {
      const publisher = button.getAttribute('data-manual-start');
      void run('正在创建人工验证会话…', () => bridge.startManualBrowserbase(publisher));
    }));
    document.querySelectorAll('[data-manual-finish]').forEach(button => button.addEventListener('click', () => {
      const publisher = button.getAttribute('data-manual-finish');
      void run('正在确认验证状态并保存 Context…', () => bridge.finishManualBrowserbase(publisher));
    }));
  })();</script></body></html>`;
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
    if (action === 'captures') { await fsp.mkdir(localCaptureDir(), { recursive: true }); await shell.openPath(localCaptureDir()); }
    if (action === 'hide' && validTray()) dashboard.hide();
    if (action === 'quit') app.quit();
  })();
}

async function dispose() {
  disposed = true;
  quitting = true;
  if (firstCycleTimer) clearTimeout(firstCycleTimer);
  if (pollTimer) clearInterval(pollTimer);
  if (vpnWatchTimer) clearInterval(vpnWatchTimer);
  if (configReloadTimer) clearTimeout(configReloadTimer);
  if (configWatcher) configWatcher.close();
  for (const [publisher] of localPublisherWindows) {
    await closeLocalPublisherBrowser(publisher).catch(() => {});
  }
  localPublisherWindows.clear();
  for (const active of manualBrowserbaseSessions.values()) {
    active.browser?.close?.().catch?.(() => {});
  }
  manualBrowserbaseSessions.clear();
  ipcMain.removeHandler('toc-collector:browserbase-save');
  ipcMain.removeHandler('toc-collector:browserbase-clear');
  ipcMain.removeHandler('toc-collector:browserbase-acceptance');
  ipcMain.removeHandler('toc-collector:browserbase-manual-start');
  ipcMain.removeHandler('toc-collector:browserbase-manual-finish');
  ipcMain.removeHandler('toc-collector:local-publisher-start');
  ipcMain.removeHandler('toc-collector:local-publisher-finish');
  if (validTray()) tray.destroy();
}

if (!dashboard || dashboard.isDestroyed()) throw new Error('Startup window is unavailable');
dashboard.on('close', onClose);
dashboard.webContents.on('will-navigate', onNavigate);
// Credentials cross the process boundary only through these three narrow IPC
// methods. The page receives status flags, never the saved key or project id.
ipcMain.removeHandler('toc-collector:browserbase-save');
ipcMain.removeHandler('toc-collector:browserbase-clear');
ipcMain.removeHandler('toc-collector:browserbase-acceptance');
ipcMain.removeHandler('toc-collector:browserbase-manual-start');
ipcMain.removeHandler('toc-collector:browserbase-manual-finish');
ipcMain.removeHandler('toc-collector:local-publisher-start');
ipcMain.removeHandler('toc-collector:local-publisher-finish');
ipcMain.handle('toc-collector:browserbase-save', async (_event, payload) => {
  try { return await saveBrowserbaseCredentials(payload); }
  catch (error) { return { configured: browserbaseDiagnostic().configured, error: safeError(error, 120) }; }
});
ipcMain.handle('toc-collector:browserbase-clear', async () => {
  try { return await clearBrowserbaseCredentials(); }
  catch (error) { return { configured: browserbaseDiagnostic().configured, error: safeError(error, 120) }; }
});
ipcMain.handle('toc-collector:browserbase-acceptance', async () => {
  try { return await runBrowserbaseAcceptance(); }
  catch (error) { return { configured: browserbaseDiagnostic().configured, error: safeError(error, 120) }; }
});
ipcMain.handle('toc-collector:local-publisher-start', async (_event, publisher) => {
  try { return await startLocalPublisherVerification(publisher); }
  catch (error) { return { error: safeError(error, 160) }; }
});
ipcMain.handle('toc-collector:local-publisher-finish', async (_event, publisher) => {
  try { return await finishLocalPublisherVerification(publisher); }
  catch (error) { return { error: safeError(error, 160) }; }
});
ipcMain.handle('toc-collector:browserbase-manual-start', async (_event, publisher) => {
  try { return await startManualBrowserbase(publisher); }
  catch (error) { return { configured: browserbaseDiagnostic().configured, error: safeError(error, 160) }; }
});
ipcMain.handle('toc-collector:browserbase-manual-finish', async (_event, publisher) => {
  try { return await finishManualBrowserbase(publisher); }
  catch (error) { return { configured: browserbaseDiagnostic().configured, error: safeError(error, 160) }; }
});
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
    } else if (!String(config.writeToken || '').trim() && !localOnlyMode) {
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
