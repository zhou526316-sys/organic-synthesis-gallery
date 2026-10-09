import { createLocalPdfVault, LocalPdfVaultError } from './local-vault.mjs';
import { getPdfVaultDeviceIdentity } from '../../shared/pdf-vault-device.mjs';
import { normalizeDoi, resolvePdfCardState, PDF_PROBE_MAX_AGE_MS } from '../../shared/pdf-vault-v1.mjs';
import { mountPdfQueuePanel } from './queue-panel.mjs';

const SESSION_KEY = 'organic-gallery-session-v1';
const SESSION_PATH = '/api/user-ui/auth/session';
const SESSION_ENDPOINT = `https://api.gczhouwld.com${SESSION_PATH}`;
const TOKEN_WATCH_MS = 800;
const $ = selector => document.querySelector(selector);
const byTestId = name => $(`[data-testid="pdf-vault-${name}"]`);
const workspace = $('#vault-workspace');
const status = byTestId('status');
const accountLabel = byTestId('account');
const doiInput = byTestId('doi');
const fileInput = byTestId('file');
const versionInput = byTestId('version');
const sessionRefresh = byTestId('session-refresh');
const list = byTestId('list');
const readerDialog = byTestId('reader');
const initialParams = new URLSearchParams(location.search);
const initialDoi = normalizeDoi(initialParams.get('doi')) || '';
const quickOpenRequested = initialParams.get('open') === '1';
const versionNames = { unknown: '版本待确认', publisher: '出版社正式版', accepted_manuscript: '作者接受稿', preprint: '预印本' };

let generation = 0;
let observedToken = null;
let active = null;
let busy = false;
let verifying = false;
let authController = null;
let reader = null;
let visibleCopies = 30;
let lastVerified = 0;
let quickOpenHandled = false;
let probeExpiryTimer = null;
let queuePanel = null;
let snapshot = { destination: null, copies: [], probes: [] };
const downloadUrls = new Set();

function sessionToken() {
  try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}

function showStatus(message, state = 'idle') {
  status.dataset.status = state;
  status.textContent = message;
}

function clearReader() {
  const previous = reader;
  reader = null;
  // Hide content synchronously; worker/task teardown can then finish safely.
  // Multiple lazily rendered PDF pages may be visible. Synchronously
  // invalidate every canvas on logout/account change before teardown.
  for (const canvas of readerDialog.querySelectorAll('.reader-scroll-container canvas')) {
    canvas.width = 0;
    canvas.height = 0;
  }
  byTestId('reader-pagecount').textContent = '';
  $('#reader-title').textContent = 'PDF 阅读器';
  byTestId('reader-status').textContent = '';
  if (readerDialog.open) readerDialog.close();
  previous?.close();
}

function clearDownloads() {
  for (const url of downloadUrls) URL.revokeObjectURL(url);
  downloadUrls.clear();
}

function revokeCurrent() {
  generation += 1;
  queuePanel?.close();
  queuePanel = null;
  authController?.abort();
  authController = null;
  active?.abortController.abort();
  active?.vault.close();
  active = null;
  busy = false;
  clearReader();
  clearDownloads();
  snapshot = { destination: null, copies: [], probes: [] };
  clearTimeout(probeExpiryTimer);
  probeExpiryTimer = null;
  visibleCopies = 30;
  list.replaceChildren();
  fileInput.value = '';
  doiInput.value = initialDoi;
  versionInput.value = 'unknown';
  workspace.hidden = true;
  accountLabel.textContent = '正在验证登录账号…';
  byTestId('destination').textContent = '尚未选择保存位置';
  for (const option of document.querySelectorAll('[data-destination]')) option.dataset.selected = 'false';
  showStatus('');
}

function requireCurrent(context = active) {
  if (!context || context !== active || context.generation !== generation || context.token !== sessionToken()) {
    if (sessionToken() !== observedToken) void verifySession();
    throw new LocalPdfVaultError('account_changed');
  }
  return context;
}

function current(context) {
  return Boolean(context && context === active && context.generation === generation && context.token === sessionToken());
}

function setControlState() {
  const available = Boolean(active && current(active));
  const cap = active?.capabilities;
  for (const control of workspace.querySelectorAll('button,input,select')) control.disabled = !available || busy;
  byTestId('directory').disabled = !available || busy || !cap?.directoryPicker;
  byTestId('opfs').disabled = !available || busy || !cap?.opfs;
  byTestId('import').disabled = !available || busy || !snapshot.destination?.kind || !fileInput.files?.[0] || !doiInput.value.trim();
  sessionRefresh.disabled = verifying;
  $('#import-hint').textContent = snapshot.destination?.kind
    ? '文件会先经过完整性检查，再保存在所选位置。'
    : '先选择保存位置，再选择 PDF 文件。';
}

function errorMessage(error) {
  const messages = {
    invalid_doi: '请填写有效的文献 DOI，并核对它与所选 PDF 一致。',
    invalid_pdf: '这份文件无法作为完整 PDF 解析，未保存。请检查下载是否完整后重试。',
    pdf_password: '这份 PDF 需要密码，当前无法导入。请先用本地阅读器处理后重试。',
    pdf_too_large: '文件超过当前允许的大小，请选择不超过 50 MB 的 PDF。',
    permission_required: '文件夹权限尚未授予或已失效。请点击“恢复文件夹权限”后再试。',
    file_missing: '找不到保存的文件。它可能已被移动或删除，请重新导入 PDF。',
    file_changed: '这份文件的内容与保存记录不一致，已停止打开。请核对文件后重新导入。',
    quota_exceeded: '浏览器可用存储空间不足，未完成保存。可以选择真实文件夹后重试。',
    storage_unavailable: '此浏览器无法打开本地文献记录，请检查站点存储权限后重试。',
    storage_failed: '本地保存未完成。请检查文件夹权限和可用空间后重试。',
    persistence_failed: '浏览器未能持久保存文献记录，不能确认导入完成。请检查站点存储权限。',
    crypto_unavailable: '此浏览器无法安全校验文件，请使用更新后的 Edge 或 Chrome。',
    destination_required: '请先选择真实文献文件夹或浏览器内存储。',
    file_name_collision: '目标文件名发生冲突，未覆盖现有文件。请重试导入。',
    copy_not_found: '这份文献记录当前不可用，请刷新列表后重试。',
    invalid_version: '请选择有效的文献版本。',
  };
  return messages[error?.code] || '本次操作未完成，请重试。已有文献不会因此自动删除。';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function addText(parent, tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function copyButton(container, action, label, copyId, secondary = false) {
  const button = addText(container, 'button', label, secondary ? 'quiet-button' : 'secondary');
  button.type = 'button';
  button.dataset.testid = `pdf-vault-${action}`;
  button.dataset.copyAction = action;
  button.dataset.copyId = copyId;
  return button;
}

function renderList() {
  list.replaceChildren();
  const context = requireCurrent();
  const copies = snapshot.copies.slice().sort((a, b) => b.created_at - a.created_at);
  if (!copies.length) {
    const empty = addText(list, 'div', '', 'empty-library');
    addText(empty, 'strong', '这里还没有本地 PDF');
    addText(empty, 'p', '选择保存位置并导入第一篇文献，它会出现在这里。');
  }
  for (const copy of copies.slice(0, visibleCopies)) {
    const article = document.createElement('article');
    article.className = 'copy-row';
    article.dataset.copyId = copy.id;
    article.dataset.copyState = copy.state;
    addText(article, 'div', 'PDF', 'copy-icon').setAttribute('aria-hidden', 'true');
    const body = addText(article, 'div', '', 'copy-body');
    addText(body, 'h3', copy.doi);
    const meta = addText(body, 'div', '', 'copy-meta');
    addText(meta, 'span', copy.storage_kind === 'local_folder' ? '真实文件夹' : '浏览器内');
    addText(meta, 'span', versionNames[copy.version_kind] || '版本待确认');
    addText(meta, 'span', formatBytes(copy.byte_length));
    const resolved = resolvePdfCardState({ user_id: context.user.id, device_id: context.deviceId, doi: copy.doi, now: Date.now(), copies: [copy], probes: snapshot.probes || [] });
    const newestProbe = (snapshot.probes || []).filter(probe => probe.copy_id === copy.id).sort((a, b) => b.checked_at - a.checked_at)[0];
    const readable = resolved.state === 'local';
    const problem = ['missing', 'revoked', 'deleted'].includes(copy.state) || (newestProbe && newestProbe.status !== 'readable');
    let label = readable ? 'PDF · 本机' : '待检查';
    if (copy.state === 'missing' || newestProbe?.status === 'missing') label = '文件缺失';
    else if (newestProbe?.status === 'permission_required') label = '需恢复权限';
    else if (newestProbe?.status === 'unavailable') label = '文件需重新核对';
    else if (copy.state === 'revoked' || copy.state === 'deleted') label = '不可用';
    const badge = addText(meta, 'span', label, 'copy-state');
    badge.dataset.readable = String(readable);
    badge.dataset.problem = String(Boolean(problem));
    const actions = addText(article, 'div', '', 'copy-actions');
    copyButton(actions, 'open', '打开阅读', copy.id);
    copyButton(actions, 'export', '导出', copy.id, true);
    if (copy.storage_kind === 'local_folder') copyButton(actions, 'restore-copy', '恢复权限', copy.id, true);
    list.append(article);
  }
  $('#load-more').hidden = copies.length <= visibleCopies;
  $('#load-more').textContent = `显示更多文献（已显示 ${Math.min(visibleCopies, copies.length)} / ${copies.length}）`;
  clearTimeout(probeExpiryTimer);
  const now = Date.now();
  const expirations = (snapshot.probes || []).map(probe => probe.checked_at + PDF_PROBE_MAX_AGE_MS + 1).filter(time => time > now);
  if (expirations.length) {
    probeExpiryTimer = window.setTimeout(() => {
      if (current(context) && !workspace.hidden) { renderList(); setControlState(); }
    }, Math.max(1, expirations.reduce((earliest, value) => Math.min(earliest, value), Infinity) - now));
  }
}

function renderDestination() {
  const destination = snapshot.destination;
  const kind = destination?.kind;
  byTestId('destination').textContent = kind === 'local_folder'
    ? `后续导入保存到：${destination.name || '已选择的文献文件夹'}`
    : kind === 'opfs'
      ? '后续导入保存到：此浏览器内。请定期导出 PDF 备份。'
      : '尚未选择保存位置';
  byTestId('restore').hidden = kind !== 'local_folder';
  for (const option of document.querySelectorAll('[data-destination]')) option.dataset.selected = String(option.dataset.destination === kind);
}

async function refreshSnapshot(context) {
  const result = await context.vault.describe();
  requireCurrent(context);
  snapshot = { destination: result.destination, copies: result.copies || [], probes: result.probes || [] };
  renderDestination();
  renderList();
  setControlState();
}

async function action(message, operation, success = '') {
  let context;
  try { context = requireCurrent(); } catch { return; }
  if (busy) return;
  busy = true;
  setControlState();
  showStatus(message, 'busy');
  try {
    // Invoke synchronously in the user's click, before an await, so directory
    // selection and explicit permission restoration retain browser activation.
    await operation(context);
    requireCurrent(context);
    await refreshSnapshot(context);
    requireCurrent(context);
    showStatus(success, success ? 'success' : 'idle');
  } catch (error) {
    if (!current(context) || error?.code === 'account_changed') return;
    if (error?.code === 'operation_cancelled' || error?.name === 'AbortError') {
      showStatus('已取消本次操作。');
    } else {
      showStatus(errorMessage(error), 'error');
    }
    try { await refreshSnapshot(context); } catch { /* Keep the meaningful operation error. */ }
  } finally {
    if (current(context)) { busy = false; setControlState(); }
  }
}

function exportDownload(file, copy, context) {
  requireCurrent(context);
  const url = URL.createObjectURL(file);
  downloadUrls.add(url);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${copy.doi.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150)}.pdf`;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    requireCurrent(context);
    anchor.click();
  } finally { anchor.remove(); }
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    downloadUrls.delete(url);
  }, 30_000);
}

function copyAction(name, copyId) {
  if (name === 'restore-copy') {
    return action('正在恢复文件夹权限…', context => context.vault.restorePermission(copyId), '权限已恢复。再次打开时会重新检查文件。');
  }
  if (name === 'export') {
    return action('正在检查并准备导出…', async context => {
      const result = await context.vault.exportFile(copyId);
      requireCurrent(context);
      exportDownload(result.file, result.copy, context);
    }, '已发起 PDF 导出，请查看浏览器下载。');
  }
  if (name !== 'open') return;
  return action('正在检查本地 PDF…', async context => {
    const result = await context.vault.openPdf(copyId);
    requireCurrent(context);
    const module = await import('./reader.mjs');
    requireCurrent(context);
    clearReader();
    reader = module.createLocalPdfReader({
      dialog: readerDialog,
      assertCurrent: () => requireCurrent(context),
      signal: context.abortController.signal,
      onExport: () => { if (current(context)) void copyAction('export', copyId); },
      onClose: () => { /* The reader owns synchronous canvas clearing. */ },
    });
    // The vault has just hashed these exact bytes. Reuse them for PDF.js
    // instead of reading the same PDF into memory a second time.
    await reader.open(result.file, result.copy.doi, result.bytes);
    requireCurrent(context);
  });
}

function openRequestedCopy(context) {
  if (!quickOpenRequested || quickOpenHandled || !current(context) || workspace.hidden) return;
  quickOpenHandled = true;
  const available = snapshot.copies.filter(copy => copy.doi === initialDoi && copy.state === 'available');
  available.sort((a, b) => b.created_at - a.created_at);
  if (available.length) {
    void copyAction('open', available[0].id);
  } else {
    showStatus('本机没有这篇文献的可用副本。可以在下方导入已下载的 PDF。', 'idle');
  }
}

async function readSession(token, controller) {
  if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  // The public frontend is static. Use its existing account API directly;
  // probing /api on GitHub Pages would always create an avoidable 404.
  const response = await fetch(SESSION_ENDPOINT, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('session_unavailable');
  const data = await response.json();
  if (data?.authenticated !== true) return null;
  if (typeof data?.user?.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.user.id)) throw new Error('session_unavailable');
  return data.user;
}

// Revalidate the *same* session without destroying an open local document.
 // Token changes and explicit logout still use verifySession's immediate
 // revocation path. Temporary network outages are not evidence of logout.
async function revalidateCurrentSession() {
  const context = active;
  if (!context || !current(context) || verifying) return;
  const stamp = generation;
  verifying = true;
  sessionRefresh.disabled = true;
  const controller = new AbortController();
  authController = controller;
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const user = await readSession(context.token, controller);
    if (!current(context) || stamp !== generation) return;
    if (!user || user.id !== context.user.id) {
      void verifySession();
      return;
    }
    context.user = user;
    lastVerified = Date.now();
    accountLabel.textContent = `${user.displayName || user.email || 'Gallery 用户'} · 账号已验证`;
  } catch {
    if (current(context) && stamp === generation) {
      $('#account-help').textContent = '网络暂时无法重新确认账号，现有本地阅读不受影响；账号切换时仍会立即关闭。';
    }
  } finally {
    clearTimeout(timeout);
    if (stamp === generation) {
      verifying = false;
      authController = null;
      setControlState();
    }
  }
}

async function verifySession() {
  const token = sessionToken();
  observedToken = token;
  revokeCurrent();
  const checkGeneration = generation;
  verifying = true;
  sessionRefresh.disabled = true;
  $('#sign-in-link').hidden = true;
  document.documentElement.dataset.pdfVaultAuth = 'checking';
  $('#account-help').textContent = '验证完成后，可查看此账号在当前浏览器保存的文献。';
  if (!token) {
    verifying = false;
    document.documentElement.dataset.pdfVaultAuth = 'signed-out';
    accountLabel.textContent = '请先登录 Gallery 账号';
    $('#account-help').textContent = '在主站登录后返回本页。退出账号时，本页会立即关闭文献并隐藏记录。';
    $('#sign-in-link').hidden = false;
    setControlState();
    return;
  }
  const controller = new AbortController();
  authController = controller;
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const user = await readSession(token, controller);
    if (checkGeneration !== generation || token !== sessionToken()) return;
    if (!user) {
      document.documentElement.dataset.pdfVaultAuth = 'signed-out';
      accountLabel.textContent = '登录已失效，请重新登录';
      $('#account-help').textContent = '请返回主站完成登录，再重新验证账号。';
      $('#sign-in-link').hidden = false;
      return;
    }
    queuePanel = mountPdfQueuePanel({
      userId: user.id, token, initialDoi: doiInput.value,
      assertCurrent: () => {
        if (checkGeneration !== generation || token !== sessionToken()) throw new LocalPdfVaultError('account_changed');
        return true;
      },
      onImport: doi => {
        doiInput.value = doi;
        setControlState();
        if (workspace.hidden) { showStatus('此设备的本地存储暂不可用。请在支持的电脑浏览器中导入 PDF。', 'error'); return; }
        doiInput.focus();
        $('#import-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    });
    const identity = getPdfVaultDeviceIdentity();
    if (!identity.device_id || identity.persistence !== 'persistent') {
      throw new LocalPdfVaultError('persistence_failed');
    }
    const context = { user, deviceId: identity.device_id, token, generation: checkGeneration, vault: null, capabilities: null, abortController: new AbortController() };
    context.vault = createLocalPdfVault({ userId: user.id, deviceId: context.deviceId, assertCurrent: () => requireCurrent(context) });
    active = context;
    context.capabilities = context.vault.capabilities();
    if (!context.capabilities.indexedDB || !context.capabilities.crypto) throw new LocalPdfVaultError('storage_unavailable');
    accountLabel.textContent = `${user.displayName || user.email || 'Gallery 用户'} · 账号已验证`;
    $('#account-help').textContent = '本地 PDF 保存在此设备；待电脑获取队列同步到同一账号。切换账号后会重新验证。';
    $('#directory-support').textContent = context.capabilities.directoryPicker ? '' : '此浏览器暂不支持选择真实目录，可明确选择浏览器内存储。';
    $('#opfs-support').textContent = context.capabilities.opfs ? '' : '此浏览器不支持浏览器内文件存储。';
    $('#file-limit').textContent = `每次导入一份 PDF，最大 ${Math.floor(context.capabilities.maxBytes / 1024 / 1024)} MB。`;
    await refreshSnapshot(context);
    requireCurrent(context);
    lastVerified = Date.now();
    workspace.hidden = false;
    document.documentElement.dataset.pdfVaultAuth = 'authenticated';
    showStatus('');
    openRequestedCopy(context);
  } catch (error) {
    if (checkGeneration !== generation || token !== sessionToken()) return;
    active?.abortController.abort();
    active?.vault.close();
    active = null;
    list.replaceChildren();
    workspace.hidden = true;
    document.documentElement.dataset.pdfVaultAuth = 'error';
    accountLabel.textContent = queuePanel ? '账号已验证 · 本地存储暂不可用' : '暂时无法打开本地文献库';
    $('#account-help').textContent = queuePanel ? '仍可使用待电脑获取队列。已有磁盘文件不受影响，请在支持的浏览器中导入和阅读。' : '已有磁盘文件不受影响，请检查网络或浏览器设置后重试。';
    showStatus(error instanceof LocalPdfVaultError ? errorMessage(error) : '账号验证未完成。请检查网络后点击“重新验证账号”。', 'error');
  } finally {
    clearTimeout(timeout);
    if (checkGeneration === generation) {
      verifying = false;
      authController = null;
      setControlState();
    }
    if (sessionToken() !== observedToken) void verifySession();
  }
}

doiInput.value = initialDoi;
sessionRefresh.addEventListener('click', () => void verifySession());
byTestId('directory').addEventListener('click', () => void action('请选择文献文件夹…', context => context.vault.selectDirectory(), '已选择真实文献文件夹。现在可以导入 PDF。'));
byTestId('opfs').addEventListener('click', () => void action('正在准备浏览器内存储…', context => context.vault.useOpfs(), '已选择浏览器内存储。清除网站数据可能丢失文件，请及时导出备份。'));
byTestId('restore').addEventListener('click', () => void action('正在恢复文件夹权限…', context => context.vault.restorePermission(), '权限已恢复。打开文献时仍会重新检查文件。'));
byTestId('refresh').addEventListener('click', () => void action('正在刷新文献记录…', async () => {}, '文献列表已刷新。'));
doiInput.addEventListener('input', () => { setControlState(); queuePanel?.setDoi(doiInput.value); });
fileInput.addEventListener('change', setControlState);
$('#import-form').addEventListener('submit', event => {
  event.preventDefault();
  const file = fileInput.files?.[0];
  const doi = normalizeDoi(doiInput.value);
  const versionKind = versionInput.value;
  void action('正在校验并保存 PDF…', async context => {
    if (!doi) throw new LocalPdfVaultError('invalid_doi');
    if (!file) throw new LocalPdfVaultError('invalid_pdf');
    if (file.size > context.capabilities.maxBytes) throw new LocalPdfVaultError('pdf_too_large');
    const module = await import('./reader.mjs');
    requireCurrent(context);
    await module.validateLocalPdf(file, { assertCurrent: () => requireCurrent(context), signal: context.abortController.signal });
    requireCurrent(context);
    await context.vault.importPdf({ doi, file, versionKind });
    requireCurrent(context);
    fileInput.value = '';
    doiInput.value = doi;
  }, 'PDF 已保存在所选位置。可以在下方打开阅读或导出。');
});
list.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest('button[data-copy-action]') : null;
  if (!button || !list.contains(button)) return;
  void copyAction(button.dataset.copyAction, button.dataset.copyId);
});
$('#load-more').addEventListener('click', () => {
  try { requireCurrent(); visibleCopies += 30; renderList(); setControlState(); } catch { /* Session fence already refreshed. */ }
});
byTestId('reader-close').addEventListener('click', clearReader);
readerDialog.addEventListener('cancel', event => { event.preventDefault(); clearReader(); });
window.addEventListener('storage', event => {
  if (event.key === SESSION_KEY || event.key === null) void verifySession();
});
window.addEventListener('gallery-auth-session-changed', () => void verifySession());
window.setInterval(() => {
  if (sessionToken() !== observedToken) void verifySession();
}, TOKEN_WATCH_MS);
window.addEventListener('focus', () => {
  if (active && current(active) && !workspace.hidden) { renderList(); setControlState(); }
  if (sessionToken() !== observedToken) void verifySession();
  else if (!verifying && Date.now() - lastVerified > 5 * 60_000) void revalidateCurrentSession();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && active && current(active) && !workspace.hidden) { renderList(); setControlState(); }
});
window.addEventListener('pagehide', () => {
  revokeCurrent();
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  if (active && current(active)) void revalidateCurrentSession();
  else void verifySession();
});
void verifySession();
