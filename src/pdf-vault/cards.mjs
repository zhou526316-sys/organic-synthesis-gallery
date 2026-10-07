import { createLocalPdfVault, PDF_VAULT_LOCAL_CHANGE_KEY } from './local-vault.mjs';
import { createPdfQueueClient, PDF_QUEUE_CHANGE_KEY } from './queue-client.mjs';
import { getPdfVaultDeviceIdentity } from '../../shared/pdf-vault-device.mjs';
import { normalizeDoi, resolvePdfCardState, PDF_PROBE_MAX_AGE_MS } from '../../shared/pdf-vault-v1.mjs';

const SESSION_KEY = 'organic-gallery-session-v1';
let root = null, language = 'zh', generation = 0, revision = 0;
let observedToken = null, active = null, authenticating = null, authController = null;
let running = false, queued = false, expiry = null, installed = false;
const readToken = () => { try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } };
const anchors = () => root ? [...root.querySelectorAll('a.local-pdf-button')] : [];

function setLabel(anchor, state, zh, en, titleZh, titleEn) {
  const text = language === 'zh' ? zh : en;
  anchor.textContent = text; anchor.dataset.pdfVaultState = state;
  anchor.title = language === 'zh' ? titleZh : titleEn;
  anchor.setAttribute('aria-label', `${text}: ${anchor.closest('.card')?.querySelector('.title')?.textContent || ''}`);
}
function resetLabels() {
  for (const anchor of anchors()) setLabel(anchor, 'none', '本地 PDF', 'Local PDF', '打开本地 PDF 文献库', 'Open your local PDF library');
}
function revoke() {
  generation += 1; authController?.abort(); authController = null; authenticating = null;
  active?.vault?.close(); active?.queue.close(); active = null;
  clearTimeout(expiry); expiry = null; resetLabels();
}
function isCurrent(context) { return Boolean(context && context === active && context.generation === generation && context.token === readToken()); }
function requireCurrent(context) { if (!isCurrent(context)) throw new Error('account_changed'); return true; }
async function account() {
  const token = readToken();
  if (active && active.token === token) return active;
  if (authenticating && token === observedToken) return authenticating;
  revoke(); observedToken = token;
  if (!token) return null;
  const stamp = generation, controller = new AbortController(); authController = controller;
  const timeout = setTimeout(() => controller.abort(), 7000);
  const promise = (async () => {
    try {
      const response = await fetch('https://api.gczhouwld.com/api/user-ui/auth/session', {
        headers: { authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      if (stamp !== generation || token !== readToken() || !response.ok) return null;
      const data = await response.json();
      if (stamp !== generation || token !== readToken() || data?.authenticated !== true || !/^[A-Za-z0-9_-]{1,128}$/.test(data?.user?.id || '')) return null;
      const identity = getPdfVaultDeviceIdentity();
      const context = { userId: data.user.id, deviceId: identity.device_id, token, generation: stamp, vault: null, queue: null, queueItems: new Map(), queueChecked: new Map() };
      active = context;
      if (identity.persistence === 'persistent') {
        try { context.vault = createLocalPdfVault({ userId: context.userId, deviceId: identity.device_id, assertCurrent: () => requireCurrent(context) }); } catch { /* Queue can work without local file APIs. */ }
      }
      context.queue = createPdfQueueClient({ userId: context.userId, token, assertCurrent: () => requireCurrent(context) });
      return context;
    } catch { return null; }
    finally { clearTimeout(timeout); if (stamp === generation) { authenticating = null; authController = null; } }
  })();
  authenticating = promise;
  return promise;
}

function present(context, snapshot) {
  if (!isCurrent(context)) { resetLabels(); return; }
  clearTimeout(expiry); expiry = null;
  const now = Date.now(), expirations = [];
  for (const anchor of anchors()) {
    const doi = normalizeDoi(anchor.closest('.card')?.dataset.doi || '');
    const copies = snapshot.copies.filter(copy => copy.doi === doi);
    const probes = snapshot.probes.filter(probe => probe.doi === doi);
    const result = resolvePdfCardState({ user_id: context.userId, device_id: context.deviceId, doi, now, copies, probes });
    if (result.state === 'local') {
      setLabel(anchor, 'local', 'PDF · 本机', 'PDF · This device', '最近已检查本机文件；打开时会再次核对', 'Recently checked on this device; opening verifies it again');
      for (const probe of probes) if (probe.status === 'readable' && probe.checked_at + PDF_PROBE_MAX_AGE_MS + 1 > now) expirations.push(probe.checked_at + PDF_PROBE_MAX_AGE_MS + 1);
    } else if (copies.length) {
      setLabel(anchor, 'check', 'PDF · 待检查', 'PDF · Check copy', '此设备有保存记录，请打开文献库检查文件或恢复权限', 'A local record exists; check the file or restore its permission');
    } else if (context.queueItems.get(doi)?.state === 'pending' && now - (context.queueChecked.get(doi) || 0) <= 30_000) {
      setLabel(anchor, 'queue', 'PDF · 待电脑', 'PDF · Queued', '已加入此账号的待电脑获取队列', 'In this account’s desktop acquisition queue');
      expirations.push(context.queueChecked.get(doi) + 30_001);
    } else setLabel(anchor, 'none', '本地 PDF', 'Local PDF', '打开本地 PDF 文献库', 'Open your local PDF library');
  }
  const displayRevision = revision;
  if (expirations.length) expiry = setTimeout(() => { if (displayRevision === revision) present(context, snapshot); }, Math.max(1, Math.min(...expirations) - now));
}

async function refresh() {
  if (running) { queued = true; return; }
  running = true; const version = revision;
  try {
    const context = await account();
    if (!context || !isCurrent(context)) { resetLabels(); return; }
    const dois = [...new Set(anchors().map(anchor => normalizeDoi(anchor.closest('.card')?.dataset.doi || '')).filter(Boolean))].slice(0, 24);
    let snapshot = { copies: [], probes: [] };
    if (context.vault) {
      try { snapshot = await context.vault.describeCards({ dois }); } catch { /* No file success is inferred from inaccessible records. */ }
    }
    if (!isCurrent(context) || version !== revision) return;
    present(context, snapshot);
    const stale = dois.filter(doi => Date.now() - (context.queueChecked.get(doi) || 0) > 30_000);
    if (stale.length) {
      try {
        const items = await context.queue.states(stale);
        requireCurrent(context);
        if (version !== revision) return;
        const now = Date.now();
        for (const doi of stale) { context.queueItems.delete(doi); context.queueChecked.set(doi, now); }
        for (const item of items) context.queueItems.set(item.doi, item);
        if (context.queueChecked.size > 256) {
          for (const doi of context.queueChecked.keys()) if (!dois.includes(doi)) { context.queueChecked.delete(doi); context.queueItems.delete(doi); }
        }
      } catch (error) {
        if (error?.code === 'not_authenticated' && isCurrent(context)) { revoke(); return; }
        // Queue failure leaves the independently verified local state usable.
      }
      if (isCurrent(context) && version === revision) present(context, snapshot);
    }
  } finally {
    running = false;
    if (queued || version !== revision) { queued = false; schedule(); }
  }
}
function schedule(clearQueue = false) {
  if (clearQueue && active) active.queueChecked.clear();
  if (readToken() !== observedToken) { revoke(); observedToken = readToken(); }
  void refresh();
}
function invalidate(clearQueue = false) {
  revision += 1;
  clearTimeout(expiry); expiry = null;
  resetLabels();
  schedule(clearQueue);
}
function install() {
  if (installed) return; installed = true;
  window.addEventListener('gallery-auth-session-changed', () => { revoke(); observedToken = null; schedule(); });
  window.addEventListener('gallery-pdf-vault-local-changed', () => invalidate());
  window.addEventListener('gallery-pdf-vault-queue-changed', () => invalidate(true));
  window.addEventListener('storage', event => {
    if (event.key === SESSION_KEY || event.key === null) { revoke(); observedToken = null; schedule(); }
    else if (event.key === PDF_VAULT_LOCAL_CHANGE_KEY) invalidate();
    else if (event.key === PDF_QUEUE_CHANGE_KEY) invalidate(true);
  });
  window.addEventListener('focus', () => invalidate(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') invalidate(true); });
  for (const event of ['click', 'auxclick']) document.addEventListener(event, () => { if (readToken() !== observedToken) { revoke(); schedule(); } }, true);
  setInterval(() => { if (readToken() !== observedToken) schedule(); }, 800);
  window.addEventListener('pagehide', revoke);
  window.addEventListener('pageshow', event => { if (event.persisted) schedule(true); });
}

/** Called once after each 24/12-card render. It reads only those DOI records,
 * never scans files or imports PDF.js, and uses at most one queue batch read. */
export function refreshPdfVaultCards(container, lang = 'zh') {
  root = container; language = lang; revision += 1;
  install(); resetLabels(); schedule();
}
