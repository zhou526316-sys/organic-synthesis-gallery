let pdfEngine = null;
async function loadPdfEngine() {
  if (pdfEngine) return pdfEngine;
  const [engine, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  engine.GlobalWorkerOptions.workerSrc = worker.default;
  pdfEngine = engine;
  return engine;
}

const SESSION_KEY = 'organic-gallery-session-v1';
const API_BASE = 'https://api.gczhouwld.com';
const ASSET_BASE = '/pdf-vault-assets/6.4.299/';
const MAX_PDF_BYTES = 60 * 1024 * 1024;


const params = new URLSearchParams(location.search);
const doi = String(params.get('doi') || '').trim().toLowerCase();
const fallback = params.get('fallback') || '';
const compatibilityMode = params.get('compat') === '1';
const downloadOnOpen = params.get('mode') === 'download';
const canvas = document.querySelector('#pdf-canvas');
const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const zoomOut = document.querySelector('#zoom-out');
const zoomIn = document.querySelector('#zoom-in');
const zoomLabel = document.querySelector('#zoom');
const pageCount = document.querySelector('#page-count');
const compatibility = document.querySelector('#compatibility');
const browserOpen = document.querySelector('#browser-open');
const download = document.querySelector('#download');
document.querySelector('#doi').textContent = doi;

let loadingTask = null;
let pdf = null;
let renderTask = null;
let pageNumber = 1;
let zoom = 1;
let renderSequence = 0;
let sourceUrl = '';
let destroyed = false;
let phase = 'init';
const startedAt = performance.now();

function token() {
  try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}
function safeFallback() {
  try {
    const url = new URL(fallback, location.origin);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function compatibilityHref() {
  const url = new URL(location.href);
  url.searchParams.set('compat', '1');
  url.searchParams.delete('mode');
  return url.toString();
}
function browserHref() {
  const url = new URL(location.href);
  url.searchParams.delete('compat');
  url.searchParams.delete('mode');
  return url.toString();
}
function controls() {
  const ready = Boolean(pdf) && !destroyed;
  previous.disabled = !ready || pageNumber <= 1;
  next.disabled = !ready || pageNumber >= (pdf?.numPages || 0);
  zoomOut.disabled = !ready || zoom <= 0.5;
  zoomIn.disabled = !ready || zoom >= 3;
  pageCount.textContent = pdf ? `第 ${pageNumber} / ${pdf.numPages} 页` : '—';
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}
function setPhase(next, message = '') {
  phase = next;
  document.documentElement.dataset.privatePdfPhase = next;
  if (message && !status.hidden) status.textContent = message;
}
function safeErrorCode(error) {
  if (error?.notAvailable) return 'not_available';
  const name = String(error?.name || '');
  if (['PasswordException','InvalidPDFException','MissingPDFException','UnexpectedResponseException','UnknownErrorException'].includes(name)) return name;
  const message = String(error?.message || '');
  if (/^(?:open|file)_http_\d+$/.test(message)) return message;
  if (['pdf_source_invalid','pdf_page_tree','pdf_invalid_bytes','pdf_wrong_content_type','pdf_range_unavailable'].includes(message)) return message;
  return 'reader_error';
}
function fallbackView(message = '该论文暂时无法读取私有 PDF。', detail = '') {
  const url = safeFallback();
  status.replaceChildren();
  const text = document.createElement('div');
  text.textContent = message;
  status.appendChild(text);
  const elapsed = Math.max(0, performance.now() - startedAt);
  const diagnostic = document.createElement('small');
  diagnostic.id = 'pdf-diagnostic';
  diagnostic.textContent = `阶段：${phase} · ${detail || 'unknown'} · ${(elapsed / 1000).toFixed(1)}s`;
  status.appendChild(diagnostic);
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = '重新读取';
  retry.addEventListener('click', () => location.reload());
  status.appendChild(retry);
  if (url) {
    const link = document.createElement('a');
    link.id = 'publisher-fallback';
    link.href = url;
    link.rel = 'noopener noreferrer';
    link.textContent = '打开出版社原文 ↗';
    status.appendChild(link);
  }
  status.className = 'bad';
  status.hidden = false;
  document.documentElement.dataset.privatePdfViewer = 'error';
}
function options(source) {
  return {
    ...source,
    cMapUrl: `${ASSET_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    wasmUrl: `${ASSET_BASE}wasm/`,
    iccUrl: `${ASSET_BASE}iccs/`,
    useWorkerFetch: false,
    useSystemFonts: true,
    isEvalSupported: false,
    enableXfa: false,
    // Prioritize time-to-first-page. Fetch only ranges that PDF.js actually
    // needs instead of filling the rest of a multi-megabyte article in the
    // background before the user can read anything.
    disableAutoFetch: true,
    disableRange: false,
    disableStream: true,
    rangeChunkSize: 512 * 1024,
    stopAtErrors: false,
    canvasMaxAreaInBytes: 32 * 1024 * 1024,
    verbosity: 0,
  };
}
async function render() {
  if (!pdf || destroyed) return;
  const seq = ++renderSequence;
  const old = renderTask;
  old?.cancel();
  if (old) await old.promise.catch(() => {});
  if (seq !== renderSequence || destroyed) return;
  setPhase('render', pageNumber === 1 ? '正在绘制第一页…' : `正在绘制第 ${pageNumber} 页…`);
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const available = Math.max(180, stage.clientWidth - 12);
  const displayScale = Math.min(1.6, available / base.width) * zoom;
  const cssWidth = base.width * displayScale;
  const cssHeight = base.height * displayScale;
  const outputScale = Math.min(devicePixelRatio || 1, 2, Math.sqrt(14_000_000 / Math.max(1, cssWidth * cssHeight)), 8192 / Math.max(cssWidth, cssHeight));
  const viewport = page.getViewport({ scale: displayScale * outputScale });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  canvas.style.width = `${Math.round(cssWidth)}px`;
  canvas.style.height = `${Math.round(cssHeight)}px`;
  const task = page.render({ canvas, viewport, annotationMode: pdfEngine.AnnotationMode.ENABLE });
  renderTask = task;
  try {
    await task.promise;
  } finally {
    if (renderTask === task) renderTask = null;
  }
  if (seq !== renderSequence || destroyed) return;
  canvas.dataset.renderedPage = String(pageNumber);
  status.hidden = true;
  document.documentElement.dataset.privatePdfViewer = 'ready';
  document.documentElement.dataset.privatePdfReadyMs = String(Math.round(performance.now() - startedAt));
  setPhase('ready');
  stage.parentElement.scrollTop = 0;
  controls();
}

async function getPdfSource(sessionToken, mode = 'view') {
  const openUrl = new URL('/api/user-ui/private-pdf/open', API_BASE);
  openUrl.searchParams.set('doi', doi);
  openUrl.searchParams.set('mode', mode);
  const opened = await fetch(openUrl, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + sessionToken },
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!opened.ok) throw new Error('open_http_' + opened.status);
  const data = await opened.json();
  if (!data || data.available !== true || typeof data.url !== 'string') {
    const error = new Error('not_available');
    error.notAvailable = true;
    throw error;
  }
  const url = new URL(data.url, API_BASE);
  if (url.origin !== API_BASE || url.pathname !== '/api/user-ui/private-pdf/file' ||
      (mode === 'download') !== (url.searchParams.get('download') === '1')) {
    throw new Error('pdf_source_invalid');
  }
  return url.toString();
}
async function checkPdfHeader(fileUrl) {
  // Check the actual PDF bytes rather than treating an iframe DOM node or a
  // header-only 200 as evidence of a readable document. Credentialed fetch
  // also establishes a secure, HttpOnly native-reading continuation cookie.
  const response = await fetch(fileUrl, {
    method: 'GET',
    headers: { range: 'bytes=0-15' },
    credentials: 'include',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('file_http_' + response.status);
  if (response.status !== 206) {
    await response.body?.cancel().catch(() => {});
    throw new Error('pdf_range_unavailable');
  }
  if (!/^application\/pdf(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
    await response.body?.cancel().catch(() => {});
    throw new Error('pdf_wrong_content_type');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const head = new TextDecoder().decode(bytes.subarray(0, 5));
  if (head !== '%PDF-') throw new Error('pdf_invalid_bytes');
}
async function verifiedPdfSource(sessionToken, mode = 'view') {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const fileUrl = await getPdfSource(sessionToken, mode);
    try {
      setPhase('preflight', mode === 'download' ? '正在确认下载文件…' : '正在确认 PDF 文件响应…');
      await checkPdfHeader(fileUrl);
      return fileUrl;
    } catch (error) {
      lastError = error;
      // Refresh a rejected short-lived ticket once, but never loop on 404,
      // invalid bytes or broken Range support. No raw URL is logged or shown.
      if (attempt === 0 && /^file_http_(401|403)$/.test(String(error?.message))) continue;
      throw error;
    }
  }
  throw lastError;
}
function showReaderError(error, prefix = 'PDF 读取失败') {
  if (destroyed) return;
  const code = safeErrorCode(error);
  document.documentElement.dataset.privatePdfError = code;
  let message = prefix + '，请重试。';
  if (error?.notAvailable) message = '该论文暂无可读取的私有 PDF，请返回 Gallery 或打开出版社原文。';
  else if (/^open_http_401$|^file_http_401$/.test(code)) message = 'PDF 临时授权失败或已过期，请重新读取。';
  else if (/^open_http_403$|^file_http_403$/.test(code)) message = '当前账号没有此 PDF 的访问权限，请返回 Gallery 重新验证。';
  else if (code === 'pdf_invalid_bytes' || code === 'pdf_wrong_content_type') message = '文件响应并非有效 PDF，已阻止打开错误页面。';
  else if (code === 'pdf_range_unavailable') message = 'PDF 文件服务不支持分段读取，暂时无法可靠打开。';
  else if (code === 'file_http_404') message = '私有 PDF 文件未找到，下载记录可能需要修复。';
  fallbackView(message, code);
}
let downloadBusy = false;
async function beginDownload() {
  if (downloadBusy || destroyed) return;
  const sessionToken = token();
  if (!sessionToken) { fallbackView('请先登录 Gallery 账号后下载 PDF。', 'signed_out'); return; }
  downloadBusy = true;
  download.disabled = true;
  download.textContent = '正在准备下载…';
  try {
    const downloadUrl = await verifiedPdfSource(sessionToken, 'download');
    if (destroyed || sessionToken !== token()) return;
    document.documentElement.dataset.privatePdfDownload = 'started';
    // The endpoint now sends Content-Disposition: attachment. Navigate rather
    // than opening an empty target=_blank tab and calling inline PDF "download".
    location.assign(downloadUrl);
  } catch (error) {
    showReaderError(error, 'PDF 下载失败');
  } finally {
    downloadBusy = false;
    download.disabled = false;
    download.textContent = '下载 PDF';
  }
}
async function start() {
  if (!/^10\.\d{4,9}\/.+/.test(doi)) { fallbackView('DOI 无效。'); return; }
  const sessionToken = token();
  if (!sessionToken) { fallbackView('请先在 Gallery 登录后再读取私有 PDF。'); return; }
  compatibility.href = compatibilityHref();
  compatibility.hidden = compatibilityMode || downloadOnOpen;
  browserOpen.href = browserHref();
  browserOpen.hidden = !compatibilityMode;
  download.hidden = false;
  if (downloadOnOpen) { await beginDownload(); return; }
  try {
    setPhase('authorize', '正在确认 PDF 权限…');
    sourceUrl = await verifiedPdfSource(sessionToken, 'view');
    if (destroyed || token() !== sessionToken) return;
    if (!compatibilityMode) {
      document.documentElement.dataset.privatePdfMode = 'native';
      document.documentElement.dataset.privatePdfViewer = 'handoff';
      setPhase('native-handoff', '正在打开浏览器 PDF 阅读器…');
      // Replace the shell in the SAME tab. The cross-origin PDF iframe was
      // blocked by some browsers even when the file URL was authorized.
      location.replace(sourceUrl + '#page=1&zoom=page-width');
      return;
    }
    document.documentElement.dataset.privatePdfMode = 'compat';
    const engine = await loadPdfEngine();
    if (destroyed || token() !== sessionToken) return;
    loadingTask = engine.getDocument(options({ url: sourceUrl, withCredentials: true }));
    setPhase('parse', '兼容模式：正在读取 PDF 目录…');
    loadingTask.onProgress = progress => {
      if (destroyed || status.hidden) return;
      const loaded = Number(progress?.loaded || 0);
      const loadedMb = loaded > 0 ? (loaded / 1024 / 1024).toFixed(1) : '0.0';
      status.textContent = `正在准备第一页… 已按需读取 ${loadedMb} MB`;
    };
    pdf = await loadingTask.promise;
    if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1) throw new Error('pdf_page_tree');
    controls();
    await render();
  } catch (error) {
    showReaderError(error);
  }
}
download.addEventListener('click', () => { void beginDownload(); });
function update(change) {
  if (!pdf || renderTask || destroyed) return;
  change();
  void render().catch(error => fallbackView('PDF 页面绘制失败，请稍后重试。', safeErrorCode(error)));
}
previous.addEventListener('click', () => update(() => { pageNumber = Math.max(1, pageNumber - 1); }));
next.addEventListener('click', () => update(() => { pageNumber = Math.min(pdf.numPages, pageNumber + 1); }));
zoomOut.addEventListener('click', () => update(() => { zoom = Math.max(0.5, zoom - 0.25); }));
zoomIn.addEventListener('click', () => update(() => { zoom = Math.min(3, zoom + 0.25); }));
function destroy() {
  if (destroyed) return;
  destroyed = true;
  renderSequence += 1;
  renderTask?.cancel();
  renderTask = null;
  canvas.width = 0;
  canvas.height = 0;
  sourceUrl = '';
  try { loadingTask?.destroy(); } catch {}
  loadingTask = null;
  pdf = null;
}
window.addEventListener('pagehide', destroy, { once: true });
window.addEventListener('beforeunload', destroy, { once: true });
controls();
void start();
