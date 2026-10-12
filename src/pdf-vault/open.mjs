import { createLocalPdfVault, LocalPdfVaultError } from './local-vault.mjs';
import { getPdfVaultDeviceIdentity } from '../../shared/pdf-vault-device.mjs';
import { normalizeDoi } from '../../shared/pdf-vault-v1.mjs';
import { recordVerifiedPdfSession, readVerifiedPdfSession, clearPdfSessionReceipt } from '../../shared/pdf-vault-session-receipt.mjs';
import { discoverDownloadedPdf, suppressDownloadedNames, unsuppressDownloadedDoi } from './download-discovery.mjs';

// PDF contents and FileSystemHandles remain strictly local. The URL contains
// the DOI only, while the session receipt is a bounded UX hint, not a read grant.
const SESSION_KEY = 'organic-gallery-session-v1';
const API_SESSION = 'https://api.gczhouwld.com/api/user-ui/auth/session';
const DOI = normalizeDoi(new URLSearchParams(location.search).get('doi') || '');
const BACKGROUND_RECHECK_AFTER_MS = 60_000;
const $ = id => document.getElementById(id);
const status = $('native-status');
const scanReport = $('native-scan-report');
const shell = $('native-shell');
const viewer = $('native-viewer');
const frame = $('native-frame');
const linkButton = $('link-file');
const retryButton = $('retry-open');
const restoreButton = $('restore-file');
const downloadButton = $('download-folder');
const downloadRestoreButton = $('download-folder-restore');
const downloadScanButton = $('download-folder-scan');
const publisherLink = $('publisher-link');
const managerLink = $('manager-link');
const signInLink = $('sign-in-link');
const tools = $('native-tools');
const toolsToggle = $('native-tools-toggle');
const toolsPanel = $('native-tools-panel');
const toolsNotice = $('native-tools-message');

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
function scopeFor(context, info) {
  return { userId: context.userId, deviceId: context.deviceId, directoryId: info?.id || '' };
}
function setState(state, message) {
  document.documentElement.dataset.nativePdfState = state;
  status.textContent = message;
}
function hideActions() {
  for (const item of [linkButton, retryButton, restoreButton, signInLink,
    downloadButton, downloadRestoreButton, downloadScanButton]) item.hidden = true;
}
function clearPdf() {
  viewer.hidden = true;
  shell.hidden = false;
  tools.hidden = true;
  toolsPanel.hidden = true;
  toolsToggle.setAttribute('aria-expanded', 'false');
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
function fileIdentityError(error) {
  return /^pdf_doi_(?:mismatch|unknown|ambiguous|supporting)$/.test(error?.code || '');
}
function messageFor(error) {
  if (error?.code === 'permission_required') return '文件或下载目录的读取权限已失效。请恢复读取权限，或重新选择下载目录。';
  if (error?.code === 'file_missing' || error?.code === 'file_changed') return '原 PDF 已移动、重命名或内容改变。请重新选择正确文件。';
  if (error?.code === 'pdf_doi_mismatch') return '这不是当前文献的 PDF：文件首页或元数据 DOI 与卡片 DOI 不一致，未建立关联。';
  if (error?.code === 'pdf_doi_supporting') return '选中的是补充信息（SI），而非论文正文。请选正文 PDF。';
  if (error?.code === 'pdf_doi_ambiguous') return '该 PDF 首页含有多个 DOI，无法安全确定对应文献；请换一份出版社正式 PDF。';
  if (error?.code === 'pdf_doi_unknown') return '没有在 PDF 首页或元数据中找到可核验的 DOI，未自动绑定，以防打开错误文献。';
  if (error?.code === 'invalid_pdf') return '所选文件不是可完整解析的 PDF，请重新选择。';
  if (error?.code === 'pdf_too_large') return '此文件超出当前单篇 50 MB 的本地文件限制。';
  if (error?.code === 'storage_unavailable' || error?.code === 'storage_timeout') return '浏览器本地索引暂不可用。请关闭其他 Gallery 标签页并重试，不要删除网站数据。';
  if (error?.code === 'pdf_identity_timeout') return 'PDF DOI 解析超时。请重试或更换文件。';
  if (error?.code === 'account_changed') return '账号已切换或退出，不能继续读取之前账号的本地 PDF。';
  if (error?.name === 'AbortError' || error?.code === 'operation_cancelled') return '本次文件或文件夹选择已取消。';
  return '暂时无法读取此 PDF。可重试、重新授权下载目录或更换 PDF；原文件不会被删除。';
}
function showScanDetails(result) {
  if (!result?.stats) { scanReport.textContent = ''; return; }
  const s = result.stats;
  const messages = ['本轮检查 PDF ' + (s.checked || 0) + ' 份',
    '发现 PDF ' + (s.pdfCandidates || 0) + ' 份',
    'DOI 不同 ' + (s.differentDoi || 0),
    '未提取 DOI ' + (s.unrecognized || 0),
    'DOI 歧义 ' + (s.ambiguous || 0),
    '补充信息 ' + (s.supporting || 0),
    '解析失败 ' + (s.parseErrors || 0),
    '解析超时 ' + (s.timeouts || 0)];
  if (s.cachedNegative) messages.push('此前识别结果待重试 ' + s.cachedNegative);
  if (s.pendingFiles || s.remainingDirectories) {
    messages.push('待继续文件 ' + (s.pendingFiles || 0) +
      ' / 待检目录 ' + (s.remainingDirectories || 0));
  }
  if (s.deepDirectories) messages.push('超过扫描深度的目录 ' + s.deepDirectories);
  if (!s.checked && !s.pdfCandidates && !s.entriesVisited) {
    messages.push('未读到可检索 PDF，请核对浏览器实际保存文件夹及文件夹授权');
  }
  scanReport.textContent = messages.join('；') + '。仅在本机统计，不上传文件或路径。';
}

async function updateFolderActions(context) {
  if (!context || context !== account || viewer.hidden === false) return;
  const supported = typeof window.showDirectoryPicker === 'function';
  downloadButton.hidden = !supported;
  downloadButton.textContent = '第一步：选择 PDF 保存文件夹';
  downloadRestoreButton.hidden = true;
  downloadScanButton.hidden = true;
  try {
    const info = await context.vault.downloadDirectoryInfo();
    assertCurrent(context);
    if (!viewer.hidden) return;
    // Publisher-controlled downloads cannot be redirected to arbitrary
    // folders by a regular webpage. The browser's save dialog must use the
    // same folder that the user grants for local discovery.
    publisherLink.hidden = supported && !info.selected;
    publisherLink.textContent = '第二步：去期刊下载正文 PDF（如有权限）';
    if (!info.selected && supported &&
        document.documentElement.dataset.nativePdfState === 'unlinked') {
      setState('unlinked', '首次使用请先选择 PDF 保存文件夹；之后到出版社下载正文并保存进该目录。再次点击本地 PDF 即可检索和打开。');
    }
    if (info.selected) {
      downloadButton.textContent = '更换下载目录';
      if (info.permission === 'granted') downloadScanButton.hidden = false;
      else downloadRestoreButton.hidden = false;
    }
  } catch { /* Local index errors are shown by the main workflow. */ }
}
function showMissing(message = '未找到已核验的正文 PDF。已下载的文件会在授权目录里自动检索，也可以手动选择。') {
  clearPdf();
  hideActions();
  linkButton.hidden = typeof window.showOpenFilePicker !== 'function';
  retryButton.hidden = false;
  $('native-help').textContent = '仅检索已授权文件夹。若 PDF 由出版社网页下载，请在浏览器另存为时选择该文件夹；Gallery 不能替出版社改变下载位置。保存后再点本地 PDF 即可识别。';
  setState('unlinked', message);
  if (account) void updateFolderActions(account);
}
function showFileError(error) {
  showMissing(messageFor(error));
  restoreButton.hidden = !(lastCopyId && error?.code === 'permission_required');
  setState('file-error', messageFor(error));
}
function showToolsError(error) {
  if (!viewer.hidden && account) {
    tools.hidden = false;
    toolsPanel.hidden = false;
    toolsToggle.setAttribute('aria-expanded', 'true');
    toolsNotice.textContent = messageFor(error);
  } else showFileError(error);
}

// All of fetch AND its JSON body have a deadline even if an edge gateway does
// not propagate abort. An unavailable server is not evidence of session expiry.
async function loadSession(initialToken, abort) {
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
        timer = setTimeout(() => {
          timedOut = true;
          abort.abort();
          reject(new LocalPdfVaultError('session_timeout'));
        }, 10000);
      }),
    ]);
  } catch (error) {
    if (timedOut) throw new LocalPdfVaultError('session_timeout');
    throw error;
  } finally { clearTimeout(timer); }
}
function showNativePdf(file, context) {
  assertCurrent(context);
  clearPdf();
  const url = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }));
  try {
    assertCurrent(context);
    pdfUrl = url;
    frame.src = url;
    shell.hidden = true;
    viewer.hidden = false;
    tools.hidden = false;
    toolsNotice.textContent = '';
    setState('reading', '使用浏览器原生 PDF 阅读器');
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
async function disableWrongCopy(copyId, context) {
  try {
    const disabled = await context.vault.disableCopy(copyId);
    const directory = await context.vault.downloadDirectoryInfo();
    assertCurrent(context);
    if (directory.selected && directory.id && disabled.fileName) {
      suppressDownloadedNames(scopeFor(context, directory), DOI, [disabled.fileName]);
    }
  } catch (error) {
    if (error?.code === 'account_changed') throw error;
  }
}
async function openCopy(copyId, context) {
  assertCurrent(context);
  const result = await context.vault.openPdf(copyId);
  assertCurrent(context);
  const reader = await import('./reader.mjs');
  assertCurrent(context);
  try {
    // Older saved files were never matched to the DOI. Check them once again
    // before display; the vault also independently checks the SHA-256 bytes.
    await reader.validateLocalPdf(result.file, {
      bytes: result.bytes, expectedDoi: DOI, assertCurrent: () => assertCurrent(context),
    });
  } catch (error) {
    if (fileIdentityError(error)) await disableWrongCopy(copyId, context);
    throw error;
  }
  assertCurrent(context);
  lastCopyId = copyId;
  showNativePdf(result.file, context);
}
async function scanDownloads(context, { preserveReader = false, forceRetry = false } = {}) {
  assertCurrent(context);
  const info = await context.vault.downloadDirectoryInfo();
  assertCurrent(context);
  if (!info.selected) return { status: 'no_directory' };
  if (info.permission !== 'granted') return { status: 'permission_required' };
  if (!preserveReader || viewer.hidden) {
    setState('scanning', '正在搜索已授权目录，并核对 PDF 正文 DOI…');
  } else toolsNotice.textContent = '正在检查授权目录中的新下载…';
  const result = await discoverDownloadedPdf({
    vault: context.vault, doi: DOI, scope: scopeFor(context, info),
    assertCurrent: () => assertCurrent(context),
    forceRetry, onProgress: progress => {
      if (context === account && viewer.hidden) {
        setState('scanning', '正在按 DOI 核查本地 PDF：已处理 ' + progress.processed + ' / ' + progress.total + '…');
      }
    },
  });
  assertCurrent(context);
  showScanDetails(result);
  if (result.status === 'matched') {
    await openCopy(result.copyId, context);
  }
  return result;
}
async function inspectSaved(context) {
  assertCurrent(context);
  setState('loading-library', '正在查找本机已关联的 PDF…');
  scanReport.textContent = '';
  let timeout;
  let snapshot;
  try {
    snapshot = await Promise.race([
      context.vault.describeCards({ dois: [DOI] }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new LocalPdfVaultError('storage_timeout')), 8000);
      }),
    ]);
  } finally { clearTimeout(timeout); }
  assertCurrent(context);
  const candidates = snapshot.copies.filter(copy =>
    copy.doi === DOI && copy.state === 'available')
    .sort((a, b) => (b.acquired_at || 0) - (a.acquired_at || 0));
  let lastError = null;
  for (const copy of candidates) {
    lastCopyId = copy.id;
    try {
      await openCopy(copy.id, context);
      return;
    } catch (error) {
      if (error?.code === 'account_changed') throw error;
      lastError = error;
    }
  }
  // A PDF downloaded after enabling this directory is found without visiting
  // the picker or importing it once. New/changed files are inspected first.
  let found;
  try {
    found = await scanDownloads(context);
  } catch (error) {
    if (error?.code === 'account_changed') throw error;
    lastError ||= error;
  }
  if (found?.status === 'matched') return;
  if (found?.status === 'permission_required') {
    showMissing('下载目录已授权过，但浏览器当前要求恢复读取权限。');
    return;
  }
  if (found?.status === 'partial') {
    showMissing('本轮目录扫描尚未完成，可点击“重新搜索已下载 PDF”继续上次进度，不会反复从头开始。');
    return;
  }
  if (lastError && fileIdentityError(lastError)) {
    showMissing('此前关联的 PDF 与当前 DOI 不符，已禁用错误关联。可扫描已授权下载目录或选择正确正文。');
    return;
  }
  if (lastError) { showFileError(lastError); return; }
  showMissing(found?.status === 'not_found'
    ? '本轮授权目录扫描已完成，但尚未确认这篇 DOI 的正文 PDF；下方列出实际扫描及识别失败统计。'
    : undefined);
}
async function initializeAccount(user, initialToken, stamp) {
  if (stamp !== generation || initialToken !== token()) return;
  const identity = getPdfVaultDeviceIdentity();
  if (!identity.device_id || identity.persistence !== 'persistent') {
    throw new LocalPdfVaultError('storage_unavailable');
  }
  const context = {
    userId: user.id, token: initialToken, deviceId: identity.device_id,
    generation: stamp, vault: null,
  };
  context.vault = createLocalPdfVault({
    userId: context.userId, deviceId: context.deviceId,
    assertCurrent: () => assertCurrent(context),
  });
  account = context;
  if (!context.vault.capabilities().indexedDB) throw new LocalPdfVaultError('storage_unavailable');
  await inspectSaved(context);
}
async function revalidateCachedAccount(context) {
  const controller = new AbortController();
  pendingAuth = controller;
  try {
    const user = await loadSession(context.token, controller);
    if (context !== account || !assertCurrent(context)) return;
    if (!user || user.id !== context.userId) {
      clearPdfSessionReceipt();
      revoke();
      setState('signed-out', 'Gallery 登录状态已改变。请返回主站重新登录后读取本地 PDF。');
      signInLink.hidden = false;
      return;
    }
    void recordVerifiedPdfSession(context.token, user.id);
  } catch {
    // Transport and timeouts do not prove sign-out. The cached identity is
    // short-lived; a later new tab must revalidate if the hint expires.
  } finally {
    if (pendingAuth === controller) pendingAuth = null;
  }
}
async function start() {
  revoke();
  const stamp = generation;
  if (!DOI) {
    setState('invalid-doi', '文献 DOI 无效，不能自动关联本地 PDF。');
    return;
  }
  const originalToken = token();
  if (!originalToken) {
    setState('signed-out', '请先在 Gallery 主站登录，再打开这篇文献。');
    signInLink.hidden = false;
    return;
  }
  setState('checking', '正在读取本机 PDF 文献索引…');
  let initialAuthController = null;
  try {
    // A fresh receipt was written after a real server validation in the main
    // tab. Opening another DOI now need not synchronously wait for the API.
    const cached = await readVerifiedPdfSession(originalToken);
    if (stamp !== generation || originalToken !== token()) return;
    if (cached) {
      const init = initializeAccount(cached, originalToken, stamp);
      if (account && Date.now() - cached.verifiedAt >= BACKGROUND_RECHECK_AFTER_MS) {
        void revalidateCachedAccount(account);
      }
      await init;
      return;
    }
    setState('checking', '首次打开正在静默确认 Gallery 登录…');
    const controller = new AbortController();
    initialAuthController = controller;
    pendingAuth = controller;
    const user = await loadSession(originalToken, controller);
    if (stamp !== generation || originalToken !== token()) return;
    if (!user) {
      clearPdfSessionReceipt();
      setState('signed-out', '登录已失效，请返回 Gallery 主站重新登录。');
      signInLink.hidden = false;
      return;
    }
    void recordVerifiedPdfSession(originalToken, user.id);
    await initializeAccount(user, originalToken, stamp);
  } catch (error) {
    if (stamp !== generation || originalToken !== token()) return;
    if (account) {
      if (error?.code !== 'account_changed') showFileError(error);
    } else {
      setState('auth-error', error?.code === 'session_timeout' || error?.name === 'AbortError'
        ? '登录检查超时，未清除本地文件或登录令牌；请检查网络后重试。'
        : '当前无法确认账号，这不代表登录失效；已保留本地文件和登录记录，请检查网络后重试。');
      retryButton.hidden = false;
    }
  } finally { if (stamp === generation && pendingAuth === initialAuthController) pendingAuth = null; }
}

// Invoke native pickers synchronously in each user click before awaiting any
// storage/API work; browsers reject pickers after transient activation expires.
function pickCorrectPdf() {
  const context = account;
  if (!context || busy || typeof window.showOpenFilePicker !== 'function') return;
  let picked;
  try {
    picked = window.showOpenFilePicker({
      id: 'gallery-existing-pdf', multiple: false,
      types: [{ description: 'PDF 文件', accept: { 'application/pdf': ['.pdf'] } }],
    });
  } catch (error) { showToolsError(error); return; }
  const hadReader = !viewer.hidden;
  busy = true;
  linkButton.disabled = true;
  $('native-replace').disabled = true;
  if (hadReader) toolsNotice.textContent = '正在核验所选 PDF 的真实 DOI…';
  else setState('linking', '正在核验 PDF 正文 DOI，核验后关联原文件…');
  void (async () => {
    try {
      const handles = await picked;
      assertCurrent(context);
      const handle = handles?.[0];
      if (!handle || handle.kind !== 'file') throw new LocalPdfVaultError('invalid_pdf');
      const file = await handle.getFile();
      assertCurrent(context);
      const reader = await import('./reader.mjs');
      assertCurrent(context);
      await reader.validateLocalPdf(file, { expectedDoi: DOI, assertCurrent: () => assertCurrent(context) });
      assertCurrent(context);
      const saved = await context.vault.linkPdfHandle({ doi: DOI, handle });
      assertCurrent(context);
      const info = await context.vault.downloadDirectoryInfo();
      if (info.selected) unsuppressDownloadedDoi(scopeFor(context, info), DOI);
      await openCopy(saved.copy.id, context);
    } catch (error) {
      if (error?.code !== 'account_changed') showToolsError(error);
    } finally {
      busy = false;
      linkButton.disabled = false;
      $('native-replace').disabled = false;
    }
  })();
}

linkButton.addEventListener('click', pickCorrectPdf);
$('native-replace').addEventListener('click', pickCorrectPdf);
downloadButton.addEventListener('click', () => {
  const context = account;
  if (!context || busy) return;
  // selectDownloadDirectory invokes showDirectoryPicker BEFORE its first await.
  const selected = context.vault.selectDownloadDirectory();
  busy = true;
  downloadButton.disabled = true;
  void (async () => {
    try {
      await selected;
      assertCurrent(context);
      await inspectSaved(context);
    } catch (error) {
      if (error?.code !== 'account_changed') showFileError(error);
    } finally { busy = false; downloadButton.disabled = false; }
  })();
});
downloadRestoreButton.addEventListener('click', () => {
  const context = account;
  if (!context || busy) return;
  const restored = context.vault.restoreDownloadPermission();
  busy = true;
  void (async () => {
    try {
      await restored;
      assertCurrent(context);
      await inspectSaved(context);
    } catch (error) {
      if (error?.code !== 'account_changed') showFileError(error);
    } finally { busy = false; }
  })();
});
async function manuallyScan() {
  const context = account;
  if (!context || busy) return;
  busy = true;
  try {
    const keep = !viewer.hidden;
    const found = await scanDownloads(context, { preserveReader: keep, forceRetry: true });
    if (!keep && found.status !== 'matched') {
      showMissing(found.status === 'partial'
        ? '目录较大，已扫描一批文献；再次点击可继续扫描。'
        : '尚未在授权目录找到当前 DOI 对应的正文 PDF。');
    } else if (keep && found.status !== 'matched') {
      toolsNotice.textContent = '下载目录没有发现更新的正文 PDF，当前阅读未改变。';
    }
  } catch (error) {
    if (error?.code !== 'account_changed') showToolsError(error);
  } finally { busy = false; }
}
downloadScanButton.addEventListener('click', () => { void manuallyScan(); });
$('native-rescan').addEventListener('click', () => { void manuallyScan(); });
$('native-unlink').addEventListener('click', () => {
  const context = account;
  if (!context || busy) return;
  busy = true;
  void (async () => {
    try {
      const details = await context.vault.unlinkDoiExternal(DOI);
      assertCurrent(context);
      const info = await context.vault.downloadDirectoryInfo();
      assertCurrent(context);
      if (info.selected) suppressDownloadedNames(scopeFor(context, info), DOI, details.names);
      lastCopyId = '';
      showMissing('已取消当前 DOI 的本机关联。电脑上的 PDF 文件没有被删除；可重新选择正确正文。');
    } catch (error) {
      if (error?.code !== 'account_changed') showToolsError(error);
    } finally { busy = false; }
  })();
});
restoreButton.addEventListener('click', () => {
  const context = account;
  if (!context || !lastCopyId || busy) return;
  busy = true;
  void (async () => {
    try {
      await context.vault.restorePermission(lastCopyId);
      assertCurrent(context);
      await openCopy(lastCopyId, context);
    } catch (error) {
      if (error?.code !== 'account_changed') showToolsError(error);
    } finally { busy = false; }
  })();
});
toolsToggle.addEventListener('click', () => {
  toolsPanel.hidden = !toolsPanel.hidden;
  toolsToggle.setAttribute('aria-expanded', String(!toolsPanel.hidden));
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
