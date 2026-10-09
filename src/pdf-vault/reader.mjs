import { AnnotationMode, GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { createContinuousPdfViewer } from '../pdf-continuous-viewer.mjs';

// All parser support assets are a pinned part of the same Gallery release.
// No URL, credentials, PDF hash, file path or bytes are sent to a remote viewer.
const ASSET_BASE = '/pdf-vault-assets/6.4.299/';
GlobalWorkerOptions.workerSrc = workerUrl;

function pdfError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function options(data) {
  return {
    data,
    cMapUrl: `${ASSET_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    wasmUrl: `${ASSET_BASE}wasm/`,
    iccUrl: `${ASSET_BASE}iccs/`,
    useWorkerFetch: false,
    useSystemFonts: true,
    // Current PDF.js no longer exposes an eval branch; also keep this false
    // for compatible implementations. The page CSP disallows JavaScript eval.
    isEvalSupported: false,
    enableXfa: false,
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
    // Some otherwise readable publisher PDFs contain recoverable malformed
    // objects. Do not reject an intact, renderable page for those warnings.
    stopAtErrors: false,
    canvasMaxAreaInBytes: 32 * 1024 * 1024,
    verbosity: 0,
  };
}

function discard(task) {
  if (!task) return Promise.resolve();
  try { return Promise.resolve(task.destroy()).catch(() => {}); }
  catch { return Promise.resolve(); }
}

/** Parse a real local PDF before retaining a successful import record. This
 * validates a page tree/page, not the publication's DOI or copyright licence. */
export async function validateLocalPdf(file, { assertCurrent = () => true, signal } = {}) {
  let task = null;
  let disposed = false;
  const check = () => {
    if (signal?.aborted || disposed) throw pdfError('account_changed');
    if (assertCurrent() === false) throw pdfError('account_changed');
  };
  const abort = () => { disposed = true; void discard(task); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    check();
    if (!file || typeof file.arrayBuffer !== 'function' || file.size < 8) throw pdfError('invalid_pdf');
    const data = new Uint8Array(await file.arrayBuffer());
    check();
    task = getDocument(options(data));
    const pdf = await task.promise;
    check();
    if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1) throw pdfError('invalid_pdf');
    const page = await pdf.getPage(1);
    check();
    const viewport = page.getViewport({ scale: 1 });
    if (!(viewport.width > 0 && viewport.height > 0 && Number.isFinite(viewport.width) && Number.isFinite(viewport.height))) throw pdfError('invalid_pdf');
    return { pageCount: pdf.numPages };
  } catch (error) {
    check();
    if (error?.name === 'PasswordException') throw pdfError('pdf_password');
    if (error?.code === 'account_changed') throw error;
    throw pdfError('invalid_pdf');
  } finally {
    signal?.removeEventListener('abort', abort);
    await discard(task);
    task = null;
  }
}

/** Canvas-only reader: it does not instantiate annotation/link layers, PDF
 * scripting, forms, attachment download handlers or external document URLs. */
/** Local owner PDF rendering is entirely browser-side: no API or PDF bytes
 * leave this device. PDF.js owns continuous page scrolling and bounded canvas
 * rendering, rather than placing every page into RAM at once. */
export function createLocalPdfReader({
  dialog, assertCurrent = () => true, signal,
  onExport = () => {}, onClose = () => {},
}) {
  const find = name => dialog.querySelector(`[data-testid="pdf-vault-reader-${name}"]`);
  const status = find('status');
  const pageCount = find('pagecount');
  const zoomIn = find('zoom-in');
  const zoomOut = find('zoom-out');
  const exportButton = find('export');
  const zoomLabel = dialog.querySelector('#reader-zoom-value');
  const stage = dialog.querySelector('.reader-stage');
  const pages = dialog.querySelector('#local-pdf-continuous');
  const listeners = [];
  let task = null;
  let pdf = null;
  let continuous = null;
  let closed = false;
  let loading = false;
  let zoom = 1;

  function check() {
    if (closed) throw pdfError('operation_cancelled');
    if (signal?.aborted || assertCurrent() === false) throw pdfError('account_changed');
  }

  function controls() {
    const pending = closed || loading || !pdf;
    zoomOut.disabled = pending || zoom <= 0.5;
    zoomIn.disabled = pending || zoom >= 3;
    exportButton.disabled = closed || loading;
    pageCount.textContent = pdf
      ? `第 ${continuous?.pageNumber || 1} / ${pdf.numPages} 页` : '正在载入…';
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  function readerStatus(message, state = 'idle') {
    status.textContent = message;
    status.dataset.status = state;
  }

  function displayError(error) {
    if (closed || signal?.aborted || error?.code === 'account_changed' ||
        error?.code === 'operation_cancelled' ||
        error?.name === 'RenderingCancelledException') return;
    readerStatus(error?.name === 'PasswordException'
      ? '这份 PDF 需要密码。请导出后使用本地阅读器打开。'
      : '这份 PDF 暂时无法在页面中完整绘制。可以导出原文件继续阅读。', 'error');
  }

  function listen(element, type, callback) {
    element.addEventListener(type, callback);
    listeners.push(() => element.removeEventListener(type, callback));
  }

  function activeCanvas(number) {
    // Preserve a single active canvas test/automation hook, but keep the
    // other rendered PDF pages in the real continuous document.
    for (const existing of pages.querySelectorAll('[data-testid="pdf-vault-reader-canvas"]')) {
      existing.removeAttribute('data-testid');
    }
    const canvas = continuous?.getCanvas(number);
    if (canvas) canvas.dataset.testid = 'pdf-vault-reader-canvas';
  }

  listen(zoomOut, 'click', () => {
    try { check(); } catch { close(); return; }
    if (!continuous || loading) return;
    zoom = Math.max(0.5, zoom - 0.25);
    continuous.setZoom(zoom);
    controls();
  });
  listen(zoomIn, 'click', () => {
    try { check(); } catch { close(); return; }
    if (!continuous || loading) return;
    zoom = Math.min(3, zoom + 0.25);
    continuous.setZoom(zoom);
    controls();
  });
  listen(exportButton, 'click', () => {
    try { check(); } catch { close(); return; }
    if (!loading) onExport();
  });
  listen(window, 'resize', () => { if (continuous && !closed) continuous.resize(); });
  signal?.addEventListener('abort', close, { once: true });

  function close() {
    if (closed) return;
    closed = true;
    continuous?.destroy();
    continuous = null;
    pageCount.textContent = '';
    readerStatus('');
    if (dialog.open) dialog.close();
    for (const remove of listeners) remove();
    signal?.removeEventListener('abort', close);
    void discard(task);
    task = null;
    pdf = null;
    onClose();
  }

  return {
    async open(file, title, validatedBytes = null) {
      check();
      loading = true;
      controls();
      dialog.querySelector('#reader-title').textContent = title || 'PDF 阅读器';
      readerStatus('正在打开本地 PDF…', 'busy');
      if (!dialog.open) dialog.showModal();
      try {
        const data = validatedBytes instanceof Uint8Array && validatedBytes.byteLength === file.size
          ? validatedBytes : new Uint8Array(await file.arrayBuffer());
        check();
        task = getDocument(options(data));
        pdf = await task.promise;
        check();
        if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1) {
          throw pdfError('invalid_pdf');
        }
        loading = false;
        stage.scrollTop = 0;
        let firstPageResolve;
        const firstPage = new Promise(resolve => { firstPageResolve = resolve; });
        continuous = await createContinuousPdfViewer({
          container: stage, viewer: pages, pdf,
          onPageChange: page => { controls(); activeCanvas(page); },
          onPageRendered: (page, canvas) => {
            if (closed || !pdf || !canvas) return;
            if (page === (continuous?.pageNumber || 1)) activeCanvas(page);
            if (page === 1 && firstPageResolve) {
              firstPageResolve(); firstPageResolve = null;
              readerStatus('', 'success');
            }
          },
          onError: displayError,
        });
        await continuous.ready;
        check();
        await firstPage;
        controls();
      } catch (error) {
        displayError(error);
        if (error?.code === 'operation_cancelled' || error?.code === 'account_changed') {
          throw error;
        }
      } finally {
        if (!closed) { loading = false; controls(); }
      }
    },
    close,
  };
}
