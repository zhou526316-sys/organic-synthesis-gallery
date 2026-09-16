const VIEWER_ID = 'gallery-hires-viewer';

interface ViewerState {
  naturalWidth: number;
  naturalHeight: number;
  scale: number;
  fitScale: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function installStyles(): void {
  if (document.getElementById('gallery-hires-viewer-style')) return;
  const style = document.createElement('style');
  style.id = 'gallery-hires-viewer-style';
  style.textContent = `
#${VIEWER_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: rgba(8, 13, 24, .94);
  color: #fff;
}
#${VIEWER_ID} .gallery-hires-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, .97);
  border-bottom: 1px solid rgba(255,255,255,.14);
}
#${VIEWER_ID} .gallery-hires-title {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 12px/1.4 ui-sans-serif, system-ui, sans-serif;
  color: #e5e7eb;
}
#${VIEWER_ID} .gallery-hires-size {
  flex: 0 0 auto;
  color: #aeb7c6;
  font: 500 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
}
#${VIEWER_ID} button {
  flex: 0 0 auto;
  min-width: 36px;
  height: 34px;
  padding: 0 9px;
  border: 1px solid rgba(255,255,255,.22);
  border-radius: 8px;
  background: rgba(255,255,255,.08);
  color: #fff;
  cursor: pointer;
  font: 700 12px/1 ui-sans-serif, system-ui, sans-serif;
}
#${VIEWER_ID} button:hover { background: rgba(255,255,255,.16); }
#${VIEWER_ID} .gallery-hires-close { font-size: 22px; }
#${VIEWER_ID} .gallery-hires-stage {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 24px;
  text-align: center;
  background: #111827;
}
#${VIEWER_ID} .gallery-hires-canvas {
  display: inline-grid;
  place-items: center;
  min-width: 100%;
  min-height: 100%;
}
#${VIEWER_ID} .gallery-hires-image {
  display: block;
  max-width: none !important;
  max-height: none !important;
  width: auto;
  height: auto;
  margin: auto;
  object-fit: contain;
  background: #fff;
  box-shadow: 0 12px 50px rgba(0,0,0,.42);
  transform-origin: center center;
  image-rendering: auto;
  cursor: zoom-in;
}
@media (max-width: 680px) {
  #${VIEWER_ID} .gallery-hires-toolbar { gap: 5px; padding: 7px; }
  #${VIEWER_ID} .gallery-hires-size { display: none; }
  #${VIEWER_ID} button { min-width: 32px; padding: 0 7px; }
  #${VIEWER_ID} .gallery-hires-stage { padding: 10px; }
}
`;
  document.head.appendChild(style);
}

function removeLegacyLightbox(): void {
  document.querySelector('.image-lightbox')?.remove();
}

function openViewer(src: string, alt: string): void {
  if (!src) return;
  installStyles();
  removeLegacyLightbox();
  document.getElementById(VIEWER_ID)?.remove();

  const overlay = document.createElement('div');
  overlay.id = VIEWER_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', alt || 'Image viewer');

  const toolbar = document.createElement('div');
  toolbar.className = 'gallery-hires-toolbar';
  const title = document.createElement('div');
  title.className = 'gallery-hires-title';
  title.textContent = alt || 'Article image';
  const size = document.createElement('div');
  size.className = 'gallery-hires-size';
  size.textContent = 'loading…';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.textContent = '−';
  minus.setAttribute('aria-label', 'Zoom out');
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.textContent = '+';
  plus.setAttribute('aria-label', 'Zoom in');
  const fit = document.createElement('button');
  fit.type = 'button';
  fit.textContent = 'Fit';
  fit.setAttribute('aria-label', 'Fit image to window');
  const actual = document.createElement('button');
  actual.type = 'button';
  actual.textContent = '100%';
  actual.setAttribute('aria-label', 'Show image at original pixel size');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'gallery-hires-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close image viewer');
  toolbar.append(title, size, minus, plus, fit, actual, close);

  const stage = document.createElement('div');
  stage.className = 'gallery-hires-stage';
  const canvas = document.createElement('div');
  canvas.className = 'gallery-hires-canvas';
  const image = new Image();
  image.className = 'gallery-hires-image';
  image.alt = alt || 'Article image';
  image.decoding = 'async';
  image.src = src;
  canvas.appendChild(image);
  stage.appendChild(canvas);
  overlay.append(toolbar, stage);
  document.body.appendChild(overlay);

  const state: ViewerState = { naturalWidth: 0, naturalHeight: 0, scale: 1, fitScale: 1 };
  const applyScale = (next: number): void => {
    if (!state.naturalWidth || !state.naturalHeight) return;
    state.scale = clamp(next, Math.min(.1, state.fitScale), 6);
    image.style.width = `${Math.max(1, Math.round(state.naturalWidth * state.scale))}px`;
    image.style.height = `${Math.max(1, Math.round(state.naturalHeight * state.scale))}px`;
    size.textContent = `${state.naturalWidth}×${state.naturalHeight}px · ${Math.round(state.scale * 100)}%`;
    image.style.cursor = state.scale < 6 ? 'zoom-in' : 'default';
  };
  const fitToWindow = (): void => {
    if (!state.naturalWidth || !state.naturalHeight) return;
    const availableWidth = Math.max(120, stage.clientWidth - 32);
    const availableHeight = Math.max(120, stage.clientHeight - 32);
    state.fitScale = Math.min(1, availableWidth / state.naturalWidth, availableHeight / state.naturalHeight);
    applyScale(state.fitScale);
    stage.scrollTo({ left: 0, top: 0 });
  };
  const dismiss = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown, true);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') dismiss();
    else if (event.key === '+' || event.key === '=') applyScale(state.scale * 1.25);
    else if (event.key === '-') applyScale(state.scale / 1.25);
    else if (event.key === '0') fitToWindow();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  image.addEventListener('load', fitToWindow, { once: true });
  image.addEventListener('load', () => {
    state.naturalWidth = image.naturalWidth;
    state.naturalHeight = image.naturalHeight;
    fitToWindow();
  });
  image.addEventListener('dblclick', event => {
    event.preventDefault();
    applyScale(Math.abs(state.scale - 1) < .02 ? state.fitScale : 1);
  });
  image.addEventListener('click', event => {
    if (event.detail !== 1 || !state.naturalWidth) return;
    applyScale(state.scale < 1 ? 1 : state.scale * 1.25);
  });
  stage.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    applyScale(state.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
  }, { passive: false });
  minus.addEventListener('click', () => applyScale(state.scale / 1.25));
  plus.addEventListener('click', () => applyScale(state.scale * 1.25));
  fit.addEventListener('click', fitToWindow);
  actual.addEventListener('click', () => applyScale(1));
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
  document.addEventListener('keydown', onKeyDown, true);
}

function mediaButtonFromEvent(event: Event): HTMLButtonElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const button = target.closest<HTMLButtonElement>('button.toc-link, button.figure-thumb');
  if (!button || button.classList.contains('generated-thumb')) return null;
  const image = button.querySelector<HTMLImageElement>('img');
  return image?.src ? button : null;
}

// Capture phase deliberately runs before the legacy per-button handlers. This makes
// every real TOC/Figure use one viewer and prevents a card/link handler from stealing
// the click on browsers where nested media controls were previously inconsistent.
document.addEventListener('click', event => {
  const button = mediaButtonFromEvent(event);
  if (!button) return;
  const image = button.querySelector<HTMLImageElement>('img');
  if (!image) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const label = button.querySelector('span')?.textContent?.trim() || image.alt || 'Article image';
  openViewer(image.currentSrc || image.src, label);
}, true);
