import { EventBus, PDFViewer, SimpleLinkService } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';

/**
 * The PDF.js continuous document viewer owns its own lazy rendering queue:
 * off-screen pages retain layout placeholders instead of live canvases.
 * Keep PDF.js link/annotation/form/script execution disabled for user files.
 *
 * Caller owns the PDF document and its signed Range transport, if any.
 */
export function createContinuousPdfViewer({
  container,
  viewer,
  pdf,
  onPageChange = () => {},
  onPageRendered = () => {},
  onError = () => {},
}) {
  if (!container || !viewer || !pdf || pdf.numPages < 1) {
    throw new Error('pdf_continuous_invalid_arguments');
  }
  let closed = false;
  let zoom = 1;
  let baseScale = 1;
  const eventBus = new EventBus();
  const linkService = new SimpleLinkService();
  const reader = new PDFViewer({
    container, viewer, eventBus, linkService,
    textLayerMode: 0,
    annotationMode: 0,
    enablePermissions: false,
    removePageBorders: false,
    maxCanvasPixels: 14_000_000,
    useOnlyCssZoom: false,
  });

  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const notifyChange = ({ pageNumber }) => {
    if (!closed && Number.isInteger(pageNumber)) onPageChange(pageNumber);
  };
  const notifyRender = ({ pageNumber, error }) => {
    if (closed) return;
    if (error) { onError(error); return; }
    const page = viewer.querySelector(`.page[data-page-number="${pageNumber}"]`);
    const canvas = page?.querySelector('canvas') || null;
    if (canvas) {
      canvas.dataset.renderedPage = String(pageNumber);
      canvas.setAttribute('aria-label', `PDF 第 ${pageNumber} 页`);
      onPageRendered(pageNumber, canvas, page);
    }
  };
  const notifyReady = () => {
    if (closed) return;
    // 'page-width' is only a display transform: each PDF remains loaded by
    // the existing secure PDF.js transport and is not copied to another host.
    reader.currentScaleValue = 'page-width';
    baseScale = reader.currentScale;
    onPageChange(reader.currentPageNumber);
    readyResolve();
  };
  eventBus.on('pagechanging', notifyChange);
  eventBus.on('pagerendered', notifyRender);
  eventBus.on('pagesinit', notifyReady);
  reader.setDocument(pdf);

  return {
    ready,
    get pageNumber() { return reader.currentPageNumber; },
    get zoom() { return zoom; },
    get canvasCount() { return viewer.querySelectorAll('.page canvas').length; },
    getCanvas(pageNumber) {
      return viewer.querySelector(`.page[data-page-number="${pageNumber}"] canvas`);
    },
    goto(pageNumber) {
      if (closed) return;
      const page = Math.max(1, Math.min(pdf.numPages, Number(pageNumber) || 1));
      reader.scrollPageIntoView({ pageNumber: page });
      onPageChange(page);
    },
    setZoom(value) {
      if (closed) return;
      zoom = Math.max(0.5, Math.min(3, Number(value) || 1));
      reader.currentScaleValue = String(baseScale * zoom);
    },
    resize() {
      if (closed) return;
      reader.currentScaleValue = 'page-width';
      baseScale = reader.currentScale;
      if (zoom !== 1) reader.currentScaleValue = String(baseScale * zoom);
    },
    destroy() {
      if (closed) return;
      closed = true;
      eventBus.off('pagechanging', notifyChange);
      eventBus.off('pagerendered', notifyRender);
      eventBus.off('pagesinit', notifyReady);
      try { reader.setDocument(null); } catch { /* page teardown only */ }
      viewer.replaceChildren();
      readyResolve();
    },
  };
}
