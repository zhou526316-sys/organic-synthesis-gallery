import './media-enhancements.css';

const MIN_SCALE = 0.2;
const MAX_SCALE = 6;
const ZOOM_FACTOR = 1.25;
const MEDIA_CONTAINER = '.toc-link, .figure-thumb:not(.generated-thumb)';
const CLICKABLE_MEDIA = `${MEDIA_CONTAINER}, .toc-slot img, .figure-strip img`;

interface ViewerStrings {
  close: string;
  zoomOut: string;
  zoomIn: string;
  fit: string;
  actual: string;
  openSource: string;
  sourceSize: string;
  previous: string;
  next: string;
}

function strings(): ViewerStrings {
  const zh = document.documentElement.lang.toLowerCase().startsWith('zh');
  return zh
    ? {
        close: '关闭',
        zoomOut: '缩小',
        zoomIn: '放大',
        fit: '适应窗口',
        actual: '1:1 原始像素',
        openSource: '打开原图',
        sourceSize: '源图',
        previous: '上一张',
        next: '下一张',
      }
    : {
        close: 'Close',
        zoomOut: 'Zoom out',
        zoomIn: 'Zoom in',
        fit: 'Fit to window',
        actual: '1:1 actual pixels',
        openSource: 'Open source image',
        sourceSize: 'Source',
        previous: 'Previous image',
        next: 'Next image',
      };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mediaLabel(button: HTMLElement, image: HTMLImageElement): string {
  const explicit = button.querySelector<HTMLElement>('.toc-label')?.textContent?.trim();
  if (explicit) return explicit;
  const thumbLabel = button.querySelector<HTMLElement>('span')?.textContent?.trim();
  if (thumbLabel) return thumbLabel;
  return image.alt || 'Image';
}

function normalizeMediaHost(candidate: HTMLElement): HTMLElement {
  if (candidate instanceof HTMLImageElement) {
    return candidate.closest<HTMLElement>(MEDIA_CONTAINER) || candidate;
  }
  return candidate;
}

function mediaImage(host: HTMLElement): HTMLImageElement | null {
  return host instanceof HTMLImageElement ? host : host.querySelector<HTMLImageElement>('img');
}

function absoluteUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { return new URL(value, window.location.href).toString(); } catch { return value; }
}

function bestSrcsetUrl(image: HTMLImageElement): string | undefined {
  const value = image.srcset?.trim();
  if (!value || value.startsWith('data:')) return undefined;
  const candidates = value.split(',').map(entry => {
    const parts = entry.trim().split(/\s+/);
    const url = parts[0];
    const descriptor = parts[1] || '1x';
    const score = descriptor.endsWith('w')
      ? Number.parseFloat(descriptor)
      : descriptor.endsWith('x')
        ? Number.parseFloat(descriptor) * 10000
        : 1;
    return { url, score: Number.isFinite(score) ? score : 1 };
  }).filter(item => item.url);
  candidates.sort((a, b) => b.score - a.score);
  return absoluteUrl(candidates[0]?.url);
}

function likelyImageHref(host: HTMLElement): string | undefined {
  const anchor = host instanceof HTMLAnchorElement ? host : host.closest<HTMLAnchorElement>('a[href]');
  const href = anchor?.href;
  return href && /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(href) ? href : undefined;
}

function preferredSource(host: HTMLElement, image: HTMLImageElement): string {
  return absoluteUrl(host.dataset.masterSrc)
    || absoluteUrl(image.dataset.masterSrc)
    || bestSrcsetUrl(image)
    || likelyImageHref(host)
    || image.currentSrc
    || image.src;
}

interface ViewerItem {
  image: HTMLImageElement;
  label: string;
  sourceUrl: string;
  fallbackUrl: string;
}

function collectMediaItems(scope: HTMLElement | null, sourceImage: HTMLImageElement, label: string, sourceUrl?: string): ViewerItem[] {
  if (!scope) {
    return [{
      image: sourceImage,
      label,
      sourceUrl: absoluteUrl(sourceUrl) || preferredSource(sourceImage, sourceImage),
      fallbackUrl: sourceImage.currentSrc || sourceImage.src,
    }];
  }
  const items = new Map<HTMLImageElement, ViewerItem>();
  scope.querySelectorAll<HTMLElement>(CLICKABLE_MEDIA).forEach(candidate => {
    const host = normalizeMediaHost(candidate);
    if (host.classList.contains('generated-thumb')) return;
    const image = mediaImage(host);
    if (!image?.src || items.has(image)) return;
    items.set(image, {
      image,
      label: mediaLabel(host, image),
      sourceUrl: preferredSource(host, image),
      fallbackUrl: image.currentSrc || image.src,
    });
  });
  if (!items.has(sourceImage)) {
    const host = normalizeMediaHost(sourceImage);
    items.set(sourceImage, {
      image: sourceImage,
      label,
      sourceUrl: absoluteUrl(sourceUrl) || preferredSource(host, sourceImage),
      fallbackUrl: sourceImage.currentSrc || sourceImage.src,
    });
  }
  const result = [...items.values()];
  const selected = result.find(item => item.image === sourceImage);
  if (selected && sourceUrl) selected.sourceUrl = absoluteUrl(sourceUrl) || selected.sourceUrl;
  return result;
}

function removeLegacyLightbox(): void {
  document.querySelector('.image-lightbox')?.remove();
}

function openViewer(sourceImage: HTMLImageElement, label: string, sourceUrl?: string): void {
  document.querySelector('.media-viewer')?.remove();
  removeLegacyLightbox();

  const text = strings();
  const overlay = document.createElement('div');
  overlay.className = 'media-viewer';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', label);

  const panel = document.createElement('div');
  panel.className = 'media-viewer__panel';

  const toolbar = document.createElement('div');
  toolbar.className = 'media-viewer__toolbar';

  const info = document.createElement('div');
  info.className = 'media-viewer__info';
  const title = document.createElement('strong');
  title.textContent = label;
  const dimensions = document.createElement('span');
  dimensions.textContent = text.sourceSize;
  info.append(title, dimensions);

  const controls = document.createElement('div');
  controls.className = 'media-viewer__controls';

  const makeButton = (action: string, titleText: string, visibleText: string): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.title = titleText;
    button.setAttribute('aria-label', titleText);
    button.textContent = visibleText;
    return button;
  };

  const previous = makeButton('previous', text.previous, '‹');
  const next = makeButton('next', text.next, '›');
  const navPrevious = makeButton('previous', text.previous, '‹');
  navPrevious.classList.add('media-viewer__nav', 'media-viewer__nav--previous');
  const navNext = makeButton('next', text.next, '›');
  navNext.classList.add('media-viewer__nav', 'media-viewer__nav--next');
  const zoomOut = makeButton('zoom-out', text.zoomOut, '−');
  const fit = makeButton('fit', text.fit, 'Fit');
  const actual = makeButton('actual', text.actual, '1:1');
  const zoomIn = makeButton('zoom-in', text.zoomIn, '+');
  const openSource = makeButton('open-source', text.openSource, '↗');
  const close = makeButton('close', text.close, '×');
  close.classList.add('media-viewer__close');
  controls.append(previous, next, zoomOut, fit, actual, zoomIn, openSource, close);
  toolbar.append(info, controls);

  const viewport = document.createElement('div');
  viewport.className = 'media-viewer__viewport';
  viewport.tabIndex = 0;

  const stage = document.createElement('div');
  stage.className = 'media-viewer__stage';

  const image = new Image();
  image.className = 'media-viewer__image';
  const initialHost = normalizeMediaHost(sourceImage);
  const initialPreferredSource = absoluteUrl(sourceUrl) || preferredSource(initialHost, sourceImage);
  image.src = initialPreferredSource;
  image.dataset.fallbackSrc = sourceImage.currentSrc || sourceImage.src;
  image.dataset.fallbackTried = '0';
  image.alt = sourceImage.alt || label;
  image.decoding = 'async';
  image.draggable = false;
  try {
    image.fetchPriority = 'high';
  } catch {
    // Older browsers may not expose fetchPriority.
  }

  stage.appendChild(image);
  viewport.appendChild(stage);
  panel.append(toolbar, viewport, navPrevious, navNext);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const scope = sourceImage.closest<HTMLElement>('.card');
  const mediaItems = collectMediaItems(scope, sourceImage, label, sourceUrl);
  let currentIndex = Math.max(0, mediaItems.findIndex(item => item.image === sourceImage));
  const syncNavigation = (): void => {
    const disabled = mediaItems.length <= 1;
    previous.disabled = disabled;
    next.disabled = disabled;
    navPrevious.disabled = disabled;
    navNext.disabled = disabled;
    navPrevious.hidden = disabled;
    navNext.hidden = disabled;
  };
  syncNavigation();

  let naturalWidth = 0;
  let naturalHeight = 0;
  let fitScale = 1;
  let scale = 1;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let scrollStartLeft = 0;
  let scrollStartTop = 0;

  const syncStage = (recenter = false): void => {
    if (!naturalWidth || !naturalHeight) return;
    const renderedWidth = Math.max(1, Math.round(naturalWidth * scale));
    const renderedHeight = Math.max(1, Math.round(naturalHeight * scale));
    image.style.width = `${renderedWidth}px`;
    image.style.height = `${renderedHeight}px`;
    stage.style.width = `${Math.max(viewport.clientWidth, renderedWidth)}px`;
    stage.style.height = `${Math.max(viewport.clientHeight, renderedHeight)}px`;
    if (recenter) {
      viewport.scrollLeft = Math.max(0, (stage.scrollWidth - viewport.clientWidth) / 2);
      viewport.scrollTop = Math.max(0, (stage.scrollHeight - viewport.clientHeight) / 2);
    }
  };

  const computeFit = (): number => {
    if (!naturalWidth || !naturalHeight) return 1;
    const horizontal = Math.max(120, viewport.clientWidth - 36) / naturalWidth;
    const vertical = Math.max(120, viewport.clientHeight - 36) / naturalHeight;
    return clamp(Math.min(horizontal, vertical, 1), MIN_SCALE, 1);
  };

  const setScale = (next: number, recenter = true): void => {
    scale = clamp(next, MIN_SCALE, MAX_SCALE);
    syncStage(recenter);
    actual.classList.toggle('active', Math.abs(scale - 1) < 0.01);
    fit.classList.toggle('active', Math.abs(scale - fitScale) < 0.01);
    zoomOut.disabled = scale <= MIN_SCALE + 0.001;
    zoomIn.disabled = scale >= MAX_SCALE - 0.001;
  };

  const navigationSuffix = (): string => mediaItems.length > 1 ? ` · ${currentIndex + 1}/${mediaItems.length}` : '';

  const navigate = (delta: number): void => {
    if (mediaItems.length <= 1) return;
    currentIndex = (currentIndex + delta + mediaItems.length) % mediaItems.length;
    const item = mediaItems[currentIndex];
    title.textContent = item.label;
    overlay.setAttribute('aria-label', item.label);
    naturalWidth = 0;
    naturalHeight = 0;
    image.style.width = '';
    image.style.height = '';
    stage.style.width = '';
    stage.style.height = '';
    dimensions.textContent = `${text.sourceSize}${navigationSuffix()}`;
    image.alt = item.image.alt || item.label;
    image.dataset.fallbackSrc = item.fallbackUrl;
    image.dataset.fallbackTried = '0';
    image.src = item.sourceUrl;
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  };

  const dismiss = (): void => {
    document.body.style.overflow = previousOverflow;
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onResize);
    overlay.remove();
  };

  const onResize = (): void => {
    fitScale = computeFit();
    setScale(Math.min(scale, Math.max(1, fitScale)), false);
    syncStage(false);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!overlay.isConnected) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      navigate(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      navigate(1);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setScale(scale * ZOOM_FACTOR);
    } else if (event.key === '-') {
      event.preventDefault();
      setScale(scale / ZOOM_FACTOR);
    } else if (event.key === '0') {
      event.preventDefault();
      setScale(fitScale);
    } else if (event.key === '1') {
      event.preventDefault();
      setScale(1);
    }
  };

  const handleAction = (action: string): void => {
    if (action === 'previous') navigate(-1);
    if (action === 'next') navigate(1);
    if (action === 'zoom-out') setScale(scale / ZOOM_FACTOR);
    if (action === 'zoom-in') setScale(scale * ZOOM_FACTOR);
    if (action === 'fit') setScale(fitScale);
    if (action === 'actual') setScale(1);
    if (action === 'open-source') window.open(image.src, '_blank', 'noopener,noreferrer');
    if (action === 'close') dismiss();
  };

  controls.addEventListener('click', event => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')?.dataset.action;
    if (action) handleAction(action);
  });
  navPrevious.addEventListener('click', () => handleAction('previous'));
  navNext.addEventListener('click', () => handleAction('next'));

  overlay.addEventListener('click', event => {
    if (event.target === overlay) dismiss();
  });

  viewport.addEventListener('dblclick', event => {
    event.preventDefault();
    setScale(Math.abs(scale - 1) < 0.05 ? fitScale : 1);
  });

  viewport.addEventListener('wheel', event => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : (1 / 1.12);
    setScale(scale * factor, false);
  }, { passive: false });

  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || (stage.scrollWidth <= viewport.clientWidth && stage.scrollHeight <= viewport.clientHeight)) return;
    dragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    scrollStartLeft = viewport.scrollLeft;
    scrollStartTop = viewport.scrollTop;
    viewport.classList.add('dragging');
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener('pointermove', event => {
    if (!dragging) return;
    viewport.scrollLeft = scrollStartLeft - (event.clientX - dragStartX);
    viewport.scrollTop = scrollStartTop - (event.clientY - dragStartY);
  });

  const stopDragging = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove('dragging');
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener('pointerup', stopDragging);
  viewport.addEventListener('pointercancel', stopDragging);

  image.addEventListener('error', () => {
    const fallback = image.dataset.fallbackSrc || '';
    if (fallback && image.dataset.fallbackTried !== '1' && image.src !== fallback) {
      image.dataset.fallbackTried = '1';
      image.src = fallback;
    }
  });

  image.addEventListener('load', () => {
    naturalWidth = image.naturalWidth;
    naturalHeight = image.naturalHeight;
    dimensions.textContent = naturalWidth && naturalHeight
      ? `${text.sourceSize} ${naturalWidth} × ${naturalHeight}px${navigationSuffix()}`
      : `${text.sourceSize}${navigationSuffix()}`;
    fitScale = computeFit();
    setScale(fitScale);
    viewport.focus({ preventScroll: true });
  });

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize);
}

document.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const candidate = target.closest<HTMLElement>(CLICKABLE_MEDIA);
  if (!candidate) return;
  const host = normalizeMediaHost(candidate);
  const image = mediaImage(host);
  if (!image?.src) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  openViewer(image, mediaLabel(host, image), preferredSource(host, image));
}, true);

export {};
