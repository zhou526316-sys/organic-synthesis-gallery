import { createLocalPdfVault, LocalPdfVaultError } from './local-vault.mjs';
import { getPdfVaultDeviceIdentity } from '../../shared/pdf-vault-device.mjs';
import { normalizeDoi } from '../../shared/pdf-vault-v1.mjs';

// This page occupies the new tab opened directly by the paper card. The
// original FileSystemFileHandle is read on this device and in this browser;
// no filesystem path, PDF bytes, file name or hash is sent to any backend.
const SESSION_KEY = 'organic-gallery-session-v1';
const API_SESSION = 'https://api.gczhouwld.com/api/user-ui/auth/session';
const DOI = normalizeDoi(new URLSearchParams(location.search).get('doi') || '');
const $ = id => document.getElementById(id);
const status = $('native-status');
const shell = $('native-shell');
const viewer = $('native-viewer');
const frame = $('native-frame');
const linkButton = $('link-file');
const retryButton = $('retry-open');
const restoreButton = $('restore-file');
const publisherLink = $('publisher-link');
const managerLink = $('manager-link');
const signInLink = $('sign-in-link');

let generation = 0;
let account = null;
let pendingAuth = null;
let pdfUrl = null;
let lastCopyId = '';
let busy = false;

function token() {
  try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}

function assertCurrent(context) {
  if (!context || context !== account || context.generation !== generation ||
      !context.token || context.token !== token()) {
    throw new LocalPdfVaultError('account_changed');
  }
  return true;
}

function setState(state, message) {
  document.documentElement.dataset.nativePdfState = state;
  status.textContent = message;
}

function hideActions() {
  linkButton.hidden = true;
  retryButton.hidden = true;
  restoreButton.hidden = true;
  signInLink.hidden = true;
}

function clearPdf() {
  viewer.hidden = true;
  shell.hidden = false;
  frame.removeAttribute('src');
  if (pdfUrl) {
    URL.revokeObjectURL(pdfUrl);
    pdfUrl = null;
  }
}

function revoke() {
  generation += 1;
  pendingAuth?.abort();
  pendingAuth = null;
  account?.vault.close();
  account = null;
  lastCopyId = '';
  busy = false;
  clearPdf();
  hideActions();
}

function messageFor(error) {
  if (error?.code === 'permission_required') {
    return '浏览器已取消原文件的读取权限，请点击“恢复原文件权限”，或重新选择这个 PDF。';
  }
  if (error?.code === 'file_missing' || error?.code === 'file_changed') {
    return '原 PDF 可能已移动、重命名或被修改。请重新选择该文件，文件不需要搬进 Gallery 文件夹。';
  }
  if (error?.code === 'invalid_pdf') return '所选文件不是可正常读取的完整 PDF，请重新选择。';
  if (error?.code === 'pdf_too_large') return '此文件超出目前单篇 50 MB 的本地校验限制。';
  if (error?.code === 'storage_unavailable' || error?.code === 'storage_timeout') {
    return '浏览器本地文件索引不可用。请关闭其他 Gallery 标签页后重试，不要删除网站数据。';
  }
  if (error?.code === 'account_changed') return '登录账号已变化。请刷新或重新登录后重试。';
  if (error?.name === 'AbortError') return '本次文件选择已取消。';
  return '暂时无法读取此 PDF。请重试或重新选择文件；原件没有被删除。';
}

function showMissing(message = '未找到这篇文献已经关联的本地 PDF。若已经下载，请选择任意文件夹里的原始 PDF。') {
  clearPdf();
  hideActions();
  linkButton.hidden = typeof window.showOpenFilePicker !== 'function';
  retryButton.hidden = false;
  setState('unlinked', message);
  $('native-help').textContent = linkButton.hidden
    ? '当前浏览器不能持久关联任意路径的文件。请使用新版 Edge 或 Chrome，或进入原有文献库导入。'
    : '首次选择 PDF 后，仅在此浏览器保存 DOI 与该文件的访问句柄，不复制 PDF；以后再点卡片即可直接阅读。若移动文件或权限失效，需重新关联。';
}

function showFileError(error) {
  showMissing(messageFor(error));
  restoreButton.hidden = !(lastCopyId && error?.code === 'permission_required');
  setState('file-error', messageFor(error));
}

async function loadSession(initialToken, abort) {
  // A network stack or proxy may ignore AbortController, including while
  // response.json() waits for an incomplete HTTP-200 body. Bound the entire
  // verification stage independently, and never treat a timeout as logout.
  const request = (async () => {
    const response = await fetch(API_SESSION, {
      headers: { authorization: 'Bearer ' + initialToken },
      cache: 'no-store', redirect: 'error', credentials: 'omit', signal: abort.signal,
    });
    if (!response.ok) throw new Error('account_api_http_' + response.status);
    const data = await response.json();
    if (data?.authenticated === false && data?.user === null) return null;
    if (data?.authenticated !== true ||
        typeof data.user?.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(data.user.id)) {
      throw new Error('account_response_invalid');
    }
    return data.user;
  })();
  let timer, timedOut = false;
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timer = window.setTimeout(() => {
          timedOut = true;
          abort.abort();
          reject(new LocalPdfVaultError('session_timeout'));
        }, 10000);
      }),
    ]);
  } catch (error) {
    // An abort-aware fetch can reject before the timeout promise does.
    if (timedOut) throw new LocalPdfVaultError('session_timeout');
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function showNativePdf(file, context) {
  assertCurrent(context);
  clearPdf();
  const typedPdf = new Blob([file], { type: 'application/pdf' });
  const url = URL.createObjectURL(typedPdf);
  try {
    assertCurrent(context);
    pdfUrl = url;
    frame.src = url;
    shell.hidden = true;
    viewer.hidden = false;
    setState('reading', '使用浏览器内置 PDF 阅读器');
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function openCopy(copyId, context) {
  assertCurrent(context);
  const result = await context.vault.openPdf(copyId);
  assertCurrent(context);
  lastCopyId = copyId;
  showNativePdf(result.file, context);
}

async function inspectSaved(context) {
  assertCurrent(context);
  setState('loading-library', '账号已验证，正在查找本机已关联的 PDF…');
  const pending = context.vault.describeCards({ dois: [DOI] });
  let timeout;
  let snapshot;
  try {
    snapshot = await Promise.race([
      pending,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new LocalPdfVaultError('storage_timeout')), 8000);
      }),
    ]);
  } finally { clearTimeout(timeout); }
  assertCurrent(context);
  const candidates = snapshot.copies
    .filter(copy => copy.doi === DOI && copy.state === 'available')
    .sort((a, b) => (b.acquired_at || 0) - (a.acquired_at || 0));
  if (!candidates.length) {
    showMissing();
    return;
  }
  let lastError = null;
  for (const copy of candidates) {
    lastCopyId = copy.id;
    try {
      await openCopy(copy.id, context);
      return;
    } catch (error) {
      if (error?.code === 'account_changed') throw error;
      lastError = error;
      // If permission was revoked, the user must explicitly restore it or
      // associate the file again; never request filesystem privileges silently.
      if (error?.code === 'permission_required') break;
    }
  }
  showFileError(lastError);
}

async function start() {
  revoke();
  const stamp = generation;
  if (!DOI) {
    setState('invalid-doi', '文献 DOI 无效，无法自动关联本地 PDF。');
    return;
  }
  const originalToken = token();
  if (!originalToken) {
    setState('signed-out', '请先在 Gallery 主站登录，再点击这篇文献的本地 PDF。');
    signInLink.hidden = false;
    return;
  }
  setState('checking', '正在确认 Gallery 账号…');
  const controller = new AbortController();
  pendingAuth = controller;
  try {
    const user = await loadSession(originalToken, controller);
    if (stamp !== generation || originalToken !== token()) return;
    if (!user) {
      setState('signed-out', '当前会话已失效，请返回 Gallery 主站重新登录。');
      signInLink.hidden = false;
      return;
    }
    const identity = getPdfVaultDeviceIdentity();
    if (!identity.device_id || identity.persistence !== 'persistent') {
      throw new LocalPdfVaultError('storage_unavailable');
    }
    const context = {
      userId: user.id, token: originalToken, deviceId: identity.device_id,
      generation: stamp, vault: null,
    };
    context.vault = createLocalPdfVault({
      userId: context.userId, deviceId: context.deviceId,
      assertCurrent: () => assertCurrent(context),
    });
    account = context;
    if (!context.vault.capabilities().indexedDB) throw new LocalPdfVaultError('storage_unavailable');
    await inspectSaved(context);
  } catch (error) {
    if (stamp !== generation || originalToken !== token()) return;
    if (account) {
      if (error?.code === 'account_changed') return;
      showFileError(error);
    } else {
      setState('auth-error', error?.code === 'session_timeout' || error?.name === 'AbortError'
        ? '账号验证超时。登录令牌及本地 PDF 未清除，请检查网络后点击重试。'
        : '账号接口暂时无法确认当前会话，这不代表登录失效；请检查网络后重试。');
      retryButton.hidden = false;
    }
  } finally {
    if (stamp === generation) pendingAuth = null;
  }
}

linkButton.addEventListener('click', async () => {
  const context = account;
  if (!context || busy || typeof window.showOpenFilePicker !== 'function') return;
  // Native picker must be invoked synchronously from the click: otherwise
  // a browser may reject it because the user's activation has expired.
  let selection;
  try {
    selection = window.showOpenFilePicker({
      id: 'gallery-existing-pdf', multiple: false,
      types: [{ description: 'PDF 文件', accept: { 'application/pdf': ['.pdf'] } }],
    });
  } catch (error) {
    setState('file-error', messageFor(error));
    return;
  }
  busy = true;
  linkButton.disabled = true;
  try {
    const handles = await selection;
    assertCurrent(context);
    const handle = handles?.[0];
    if (!handle || handle.kind !== 'file') throw new LocalPdfVaultError('invalid_pdf');
    setState('linking', '正在校验 PDF 并保存该文件与 DOI 的本机关联…');
    const file = await handle.getFile();
    assertCurrent(context);
    // Verify that the PDF can actually be parsed before storing a handle.
    const reader = await import('./reader.mjs');
    assertCurrent(context);
    await reader.validateLocalPdf(file, { assertCurrent: () => assertCurrent(context) });
    assertCurrent(context);
    const result = await context.vault.linkPdfHandle({ doi: DOI, handle });
    assertCurrent(context);
    lastCopyId = result.copy.id;
    await openCopy(result.copy.id, context);
  } catch (error) {
    if (error?.code !== 'account_changed') showFileError(error);
  } finally {
    busy = false;
    linkButton.disabled = false;
  }
});

restoreButton.addEventListener('click', async () => {
  const context = account;
  if (!context || !lastCopyId || busy) return;
  busy = true;
  restoreButton.disabled = true;
  try {
    assertCurrent(context);
    await context.vault.restorePermission(lastCopyId);
    assertCurrent(context);
    await openCopy(lastCopyId, context);
  } catch (error) {
    if (error?.code !== 'account_changed') showFileError(error);
  } finally {
    busy = false;
    restoreButton.disabled = false;
  }
});

retryButton.addEventListener('click', () => { if (!busy) void start(); });
window.addEventListener('storage', event => {
  if (event.key === SESSION_KEY || event.key === null) void start();
});
window.addEventListener('gallery-auth-session-changed', () => void start());
const observer = setInterval(() => {
  if (account && account.token !== token()) void start();
}, 800);
window.addEventListener('pagehide', () => {
  clearInterval(observer);
  revoke();
});
window.addEventListener('pageshow', event => { if (event.persisted) void start(); });

if (DOI) {
  $('native-doi').textContent = DOI;
  publisherLink.href = 'https://doi.org/' + DOI.split('/').map(encodeURIComponent).join('/');
  publisherLink.hidden = false;
  managerLink.href = '/pdf-vault/?doi=' + encodeURIComponent(DOI);
  managerLink.hidden = false;
} else {
  $('native-doi').textContent = '无法识别文献 DOI';
  publisherLink.hidden = true;
  managerLink.href = '/pdf-vault/';
  managerLink.hidden = false;
}
void start();
