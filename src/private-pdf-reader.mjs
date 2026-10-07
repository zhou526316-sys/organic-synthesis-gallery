import { AnnotationMode, GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

const SESSION_KEY = 'organic-gallery-session-v1';
const API_BASE = 'https://api.gczhouwld.com';
const ASSET_BASE = '/pdf-vault-assets/6.4.299/';
const MAX_PDF_BYTES = 60 * 1024 * 1024;
GlobalWorkerOptions.workerSrc = workerUrl;

const params = new URLSearchParams(location.search);
const doi = String(params.get('doi') || '').trim().toLowerCase();
const fallback = params.get('fallback') || '';
const canvas = document.querySelector('#pdf-canvas');
const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const zoomOut = document.querySelector('#zoom-out');
const zoomIn = document.querySelector('#zoom-in');
const zoomLabel = document.querySelector('#zoom');
const pageCount = document.querySelector('#page-count');
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
  if (/^open_http_\d+$/.test(message)) return message;
  if (['pdf_source_invalid','pdf_page_tree'].includes(message)) return message;
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
    disableAutoFetch: false,
    disableRange: false,
    disableStream: true,
    rangeChunkSize: 64 * 1024,
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
  const task = page.render({ canvas, viewport, annotationMode: AnnotationMode.ENABLE });
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
async function getPdfSource(sessionToken) {
  const openUrl = new URL('/api/user-ui/private-pdf/open', API_BASE);
  openUrl.searchParams.set('doi', doi);
  const opened = await fetch(openUrl, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + sessionToken },
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
  if (url.origin !== API_BASE || url.pathname !== '/api/user-ui/private-pdf/file') throw new Error('pdf_source_invalid');
  return url.toString();
}
async function start() {
  if (!/^10\.\d{4,9}\/.+/.test(doi)) { fallbackView('DOI 无效。'); return; }
  const sessionToken = token();
  if (!sessionToken) { fallbackView('请先在 Gallery 登录后再读取私有 PDF。'); return; }
  try {
    setPhase('authorize', '正在确认 PDF 权限…');
    sourceUrl = await getPdfSource(sessionToken);
    if (destroyed) return;
    setPhase('range-load', '正在建立分段读取…');
    download.href = sourceUrl;
    download.removeAttribute('download');
    download.target = '_blank';
    download.rel = 'noopener noreferrer';
    download.hidden = false;
    loadingTask = getDocument(options({ url: sourceUrl }));
    setPhase('parse', '正在读取 PDF 目录…');
    loadingTask.onProgress = progress => {
      if (destroyed || status.hidden) return;
      const loaded = Number(progress?.loaded || 0);
      const total = Number(progress?.total || 0);
      status.textContent = total > 0
        ? `正在读取 PDF… ${Math.min(99, Math.round(loaded / total * 100))}%`
        : '正在读取 PDF…';
    };
    pdf = await loadingTask.promise;
    if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1) throw new Error('pdf_page_tree');
    controls();
    await render();
  } catch (error) {
    if (destroyed) return;
    const code = safeErrorCode(error);
    document.documentElement.dataset.privatePdfError = code;
    const message = error?.notAvailable
      ? '该论文尚无已验证的私有 PDF。'
      : error?.name === 'PasswordException'
        ? '这份 PDF 需要密码，暂时无法在网页内阅读。'
        : /^open_http_401|^open_http_403/.test(code)
          ? '登录状态已失效，请返回 Gallery 重新登录后读取。'
          : 'PDF 读取失败，请重试。';
    fallbackView(message, code);
  }
}
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
