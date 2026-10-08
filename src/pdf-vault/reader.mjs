import { AnnotationMode, GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

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
    // PDF.js can transfer ownership of its input to the worker. Give it a
    // separate copy so the validated original remains available to the local
    // write/hash stage; it is never uploaded or retained in a manifest.
    task = getDocument(options(data.slice()));
    const pdf = await task.promise;
    check();
    if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1) throw pdfError('invalid_pdf');
    const page = await pdf.getPage(1);
    check();
    const viewport = page.getViewport({ scale: 1 });
    if (!(viewport.width > 0 && viewport.height > 0 && Number.isFinite(viewport.width) && Number.isFinite(viewport.height))) throw pdfError('invalid_pdf');
    return { pageCount: pdf.numPages, bytes: data };
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
export function createLocalPdfReader({ dialog, assertCurrent = () => true, signal, onExport = () => {}, onClose = () => {} }) {
  const find = name => dialog.querySelector(`[data-testid="pdf-vault-reader-${name}"]`);
  const canvas = find('canvas');
  const status = find('status');
  const pageCount = find('pagecount');
  const previous = find('previous');
  const next = find('next');
  const zoomIn = find('zoom-in');
  const zoomOut = find('zoom-out');
  const exportButton = find('export');
  const zoomLabel = dialog.querySelector('#reader-zoom-value');
  const stage = dialog.querySelector('.reader-stage');
  const listeners = [];
  let task = null;
  let pdf = null;
  let renderTask = null;
  let renderSequence = 0;
  let closed = false;
  let loading = false;
  let rendering = false;
  let pageNumber = 1;
  let zoom = 1;

  function check() {
    if (closed) throw pdfError('operation_cancelled');
    if (signal?.aborted || assertCurrent() === false) throw pdfError('account_changed');
  }

  function controls() {
    const pending = closed || loading || rendering || !pdf;
    previous.disabled = pending || pageNumber <= 1;
    next.disabled = pending || pageNumber >= (pdf?.numPages || 0);
    zoomOut.disabled = pending || zoom <= 0.5;
    zoomIn.disabled = pending || zoom >= 3;
    exportButton.disabled = closed || loading;
    pageCount.textContent = pdf ? `第 ${pageNumber} / ${pdf.numPages} 页` : '正在载入…';
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  function readerStatus(message, state = 'idle') {
    status.textContent = message;
    status.dataset.status = state;
  }

  function displayError(error) {
    if (closed || signal?.aborted || error?.code === 'account_changed' || error?.code === 'operation_cancelled' || error?.name === 'RenderingCancelledException') return;
    canvas.width = 0;
    canvas.height = 0;
    canvas.dataset.renderedPage = '';
    const message = error?.name === 'PasswordException'
      ? '这份 PDF 需要密码。请导出后使用本地阅读器打开。'
      : '这份 PDF 暂时无法在页面中完整绘制。可以导出原文件，使用本地阅读器继续阅读。';
    readerStatus(message, 'error');
  }

  async function renderPage() {
    check();
    if (!pdf) return;
    const sequence = ++renderSequence;
    const pageToRender = pageNumber;
    rendering = true;
    canvas.dataset.renderedPage = '';
    controls();
    readerStatus('正在绘制页面…', 'busy');
    const oldRender = renderTask;
    oldRender?.cancel();
    try {
      if (oldRender) await oldRender.promise.catch(() => {});
      check();
      if (sequence !== renderSequence) return;
      const page = await pdf.getPage(pageToRender);
      check();
      if (sequence !== renderSequence) return;
      const base = page.getViewport({ scale: 1 });
      if (!(base.width > 0 && base.height > 0 && Number.isFinite(base.width) && Number.isFinite(base.height))) throw pdfError('invalid_pdf');
      const computed = getComputedStyle(stage);
      const availableWidth = Math.max(120, stage.clientWidth - parseFloat(computed.paddingLeft) - parseFloat(computed.paddingRight));
      const scale = Math.min(1.5, availableWidth / base.width) * zoom;
      const cssWidth = base.width * scale;
      const cssHeight = base.height * scale;
      const outputScale = Math.min(devicePixelRatio || 1, 2, Math.sqrt(12_000_000 / (cssWidth * cssHeight)), 8192 / Math.max(cssWidth, cssHeight));
      const viewport = page.getViewport({ scale: scale * outputScale });
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      canvas.style.width = `${Math.round(cssWidth)}px`;
      canvas.style.height = `${Math.round(cssHeight)}px`;
      canvas.setAttribute('aria-label', `PDF 第 ${pageToRender} 页`);
      // Appearance data is drawn to the canvas; no active annotation controls
      // or link/attachment actions are created in the DOM.
      const renderingTask = page.render({ canvas, viewport, annotationMode: AnnotationMode.ENABLE });
      renderTask = renderingTask;
      await renderingTask.promise;
      check();
      if (sequence !== renderSequence) return;
      canvas.dataset.renderedPage = String(pageToRender);
      readerStatus('', 'success');
      stage.scrollTop = 0;
    } catch (error) {
      if (sequence === renderSequence) displayError(error);
      if (error?.code === 'operation_cancelled' || error?.code === 'account_changed') throw error;
    } finally {
      if (sequence === renderSequence && !closed) {
        rendering = false;
        renderTask = null;
        controls();
      }
    }
  }

  function listen(element, type, callback) {
    element.addEventListener(type, callback);
    listeners.push(() => element.removeEventListener(type, callback));
  }

  function update(change) {
    try { check(); } catch { close(); return; }
    if (loading || rendering || !pdf) return;
    change();
    void renderPage().catch(() => {});
  }

  listen(previous, 'click', () => update(() => { pageNumber = Math.max(1, pageNumber - 1); }));
  listen(next, 'click', () => update(() => { pageNumber = Math.min(pdf.numPages, pageNumber + 1); }));
  listen(zoomOut, 'click', () => update(() => { zoom = Math.max(0.5, zoom - 0.25); }));
  listen(zoomIn, 'click', () => update(() => { zoom = Math.min(3, zoom + 0.25); }));
  listen(exportButton, 'click', () => {
    try { check(); } catch { close(); return; }
    if (!loading) onExport();
  });
  signal?.addEventListener('abort', close, { once: true });

  function close() {
    if (closed) return;
    closed = true;
    renderSequence += 1;
    renderTask?.cancel();
    renderTask = null;
    canvas.width = 0;
    canvas.height = 0;
    canvas.dataset.renderedPage = '';
    canvas.style.width = '';
    canvas.style.height = '';
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
          ? validatedBytes
          : new Uint8Array(await file.arrayBuffer());
        check();
        task = getDocument(options(data));
        pdf = await task.promise;
        check();
        if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1) throw pdfError('invalid_pdf');
        loading = false;
        await renderPage();
      } catch (error) {
        displayError(error);
        if (error?.code === 'operation_cancelled' || error?.code === 'account_changed') throw error;
      } finally {
        if (!closed) { loading = false; controls(); }
      }
    },
    close,
  };
}
