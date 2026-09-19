interface StaticToc {
  available?: boolean;
  imageUrl?: string;
  reason?: string;
}

interface StaticFigure {
  id?: string;
  label?: string;
  caption?: string;
  imageUrl?: string;
  order?: number;
}

interface StaticMediaItem {
  doi?: string;
  toc?: StaticToc;
  figures?: {
    available?: boolean;
    figures?: StaticFigure[];
  };
}

interface StaticMediaManifest {
  items?: Record<string, StaticMediaItem>;
}

const TOC_HIGH_PRIORITY_COUNT = 24;
const FIGURE_DELAY_MS = 1900;
const FIGURE_ROOT_MARGIN = '900px 0px';
const installStartedAt = performance.now();

let manifestPromise: Promise<StaticMediaManifest> | null = null;
let scanQueued = false;
let figureObserver: IntersectionObserver | null = null;
const pendingCommits: Array<() => void> = [];
let commitFrame = 0;

function assetUrl(path: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  return new URL(path.replace(/^\//, ''), document.baseURI).toString();
}

function loadManifest(forceRefresh = false): Promise<StaticMediaManifest> {
  if (forceRefresh) manifestPromise = null;
  if (!manifestPromise) {
    const url = new URL('./media-index.json', document.baseURI);
    if (forceRefresh) url.searchParams.set('refresh', String(Date.now()));
    manifestPromise = fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then(response => response.ok ? response.json() as Promise<StaticMediaManifest> : { items: {} })
      .catch(() => ({ items: {} }));
  }
  return manifestPromise;
}

function installPerformanceCss(): void {
  if (document.getElementById('gallery-performance-css')) return;
  const style = document.createElement('style');
  style.id = 'gallery-performance-css';
  style.textContent = `
.card {
  content-visibility: auto;
  contain-intrinsic-size: auto 560px;
}
.toc-slot,
.figure-strip-slot {
  contain: layout paint style;
}
.toc-image,
.figure-thumb img {
  transform: translateZ(0);
}
@media (max-width: 680px) {
  .card { contain-intrinsic-size: auto 360px; }
}
`;
  document.head.appendChild(style);
}

function queueCommit(commit: () => void): void {
  pendingCommits.push(commit);
  if (commitFrame) return;
  commitFrame = requestAnimationFrame(flushCommits);
}

function flushCommits(): void {
  commitFrame = 0;
  const frameBudget = 18;
  for (let index = 0; index < frameBudget && pendingCommits.length; index += 1) {
    pendingCommits.shift()?.();
  }
  if (pendingCommits.length) commitFrame = requestAnimationFrame(flushCommits);
}

function openImage(imageUrl: string, alt: string, caption?: string): void {
  document.querySelector('.image-lightbox')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'image-lightbox';
  const panel = document.createElement('div');
  panel.className = 'image-lightbox-panel';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'image-lightbox-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close enlarged image');
  const image = new Image();
  image.className = 'image-lightbox-image';
  image.src = imageUrl;
  image.alt = alt;
  panel.append(close, image);
  if (caption) {
    const text = document.createElement('div');
    text.className = 'image-lightbox-caption';
    text.textContent = caption;
    panel.appendChild(text);
  }
  overlay.appendChild(panel);
  const dismiss = (): void => overlay.remove();
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) dismiss();
  });
  document.body.appendChild(overlay);
}

function tocCandidate(item: StaticMediaItem | undefined): { url: string; label: string } | null {
  if (!item) return null;
  if (item.toc?.available && item.toc.imageUrl) {
    const reason = item.toc.reason || '';
    const label = reason === 'figure1_fallback'
      ? 'Figure 1'
      : reason.startsWith('figure_fallback:')
        ? reason.slice('figure_fallback:'.length).trim() || 'Article graphic / TOC'
        : 'Article graphic / TOC';
    return { url: assetUrl(item.toc.imageUrl), label };
  }
  const fallback = item.figures?.figures?.find(figure => Boolean(figure.imageUrl));
  return fallback?.imageUrl
    ? { url: assetUrl(fallback.imageUrl), label: fallback.label || 'Article graphic' }
    : null;
}

function hydrateTocSlot(slot: HTMLElement, item: StaticMediaItem | undefined, priorityIndex: number): void {
  const candidate = tocCandidate(item);
  if (!candidate) return;
  if (slot.dataset.performanceTocUrl === candidate.url && slot.querySelector('.toc-image')) return;
  if (slot.dataset.performanceTocLoading === candidate.url) return;
  slot.dataset.performanceTocLoading = candidate.url;

  const image = new Image();
  image.alt = candidate.label;
  image.className = 'toc-image';
  image.loading = 'eager';
  image.decoding = 'async';
  image.fetchPriority = priorityIndex < TOC_HIGH_PRIORITY_COUNT ? 'high' : 'auto';
  image.referrerPolicy = 'no-referrer';

  image.addEventListener('load', () => {
    queueCommit(() => {
      if (!slot.isConnected) return;
      if (slot.dataset.performanceTocLoading !== candidate.url) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toc-link';
      const label = document.createElement('span');
      label.className = 'toc-label';
      label.textContent = candidate.label;
      button.append(image, label);
      button.addEventListener('click', () => openImage(candidate.url, candidate.label));
      slot.replaceChildren(button);
      slot.classList.remove('generated');
      slot.classList.add('loaded');
      slot.dataset.state = 'done';
      slot.dataset.performanceTocUrl = candidate.url;
      delete slot.dataset.performanceTocLoading;
    });
  }, { once: true });

  image.addEventListener('error', () => {
    if (slot.dataset.performanceTocLoading === candidate.url) delete slot.dataset.performanceTocLoading;
  }, { once: true });

  image.src = candidate.url;
}

function renderFiguresFromManifest(slot: HTMLElement, item: StaticMediaItem | undefined): void {
  if (!slot.isConnected || slot.dataset.performanceFigures === 'done') return;
  const figures = (item?.figures?.figures || []).filter(figure => Boolean(figure.imageUrl));
  if (!figures.length) return;

  const heading = document.createElement('div');
  heading.className = 'figure-strip-heading';
  heading.textContent = document.documentElement.lang.startsWith('zh') ? '正文图片' : 'Article figures';
  const strip = document.createElement('div');
  strip.className = 'figure-strip';

  for (const figure of figures.slice(0, 10)) {
    if (!figure.imageUrl) continue;
    const url = assetUrl(figure.imageUrl);
    const labelText = figure.label || 'Figure';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'figure-thumb';
    const image = new Image();
    image.src = url;
    image.alt = labelText;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.referrerPolicy = 'no-referrer';
    const label = document.createElement('span');
    label.textContent = labelText;
    button.append(image, label);
    button.addEventListener('click', () => openImage(url, labelText, figure.caption));
    strip.appendChild(button);
  }

  if (!strip.childElementCount) return;
  slot.replaceChildren(heading, strip);
  slot.classList.remove('generated');
  slot.classList.add('loaded');
  slot.dataset.state = 'done';
  slot.dataset.performanceFigures = 'done';
}

function observeFigureSlots(manifest: StaticMediaManifest): void {
  const slots = [...document.querySelectorAll<HTMLElement>('.figure-strip-slot[data-figure-doi]')]
    .filter(slot => slot.dataset.performanceObserved !== '1');
  if (!slots.length) return;

  const render = (slot: HTMLElement): void => {
    const doi = (slot.dataset.figureDoi || '').trim().toLowerCase();
    const item = manifest.items?.[doi];
    const wait = Math.max(0, FIGURE_DELAY_MS - (performance.now() - installStartedAt));
    window.setTimeout(() => renderFiguresFromManifest(slot, item), wait);
  };

  if (!('IntersectionObserver' in window)) {
    slots.slice(0, 12).forEach(render);
    return;
  }

  if (!figureObserver) {
    figureObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const slot = entry.target as HTMLElement;
        figureObserver?.unobserve(slot);
        const doi = (slot.dataset.figureDoi || '').trim().toLowerCase();
        void loadManifest().then(current => {
          const item = current.items?.[doi];
          const wait = Math.max(0, FIGURE_DELAY_MS - (performance.now() - installStartedAt));
          window.setTimeout(() => renderFiguresFromManifest(slot, item), wait);
        });
      }
    }, { rootMargin: FIGURE_ROOT_MARGIN, threshold: 0 });
  }

  for (const slot of slots) {
    slot.dataset.performanceObserved = '1';
    figureObserver.observe(slot);
  }
}

async function scanGallery(): Promise<void> {
  scanQueued = false;
  const gallery = document.querySelector<HTMLElement>('#gallery');
  if (!gallery) return;
  const manifest = await loadManifest();
  const tocSlots = [...gallery.querySelectorAll<HTMLElement>('.toc-slot[data-doi]')];
  tocSlots.forEach((slot, index) => {
    const doi = (slot.dataset.doi || '').trim().toLowerCase();
    hydrateTocSlot(slot, manifest.items?.[doi], index);
  });
  observeFigureSlots(manifest);
}

function scheduleScan(): void {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => void scanGallery());
}

function suppressLegacyScrollMediaHandlers(): () => void {
  const original = window.addEventListener.bind(window);
  const patched: typeof window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
    const source = typeof listener === 'function' ? Function.prototype.toString.call(listener) : '';
    if ((type === 'scroll' || type === 'resize') && source.includes('scheduleMediaBatch')) return;
    original(type as keyof WindowEventMap, listener as EventListener, options);
  }) as typeof window.addEventListener;
  window.addEventListener = patched;
  return () => {
    window.addEventListener = original as typeof window.addEventListener;
  };
}

export function installGalleryPerformanceRuntime(): () => void {
  installPerformanceCss();
  void loadManifest(true);
  const restoreAddEventListener = suppressLegacyScrollMediaHandlers();
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const refreshMedia = (): void => {
    manifestPromise = null;
    void loadManifest(true).then(() => scheduleScan());
  };
  window.addEventListener('pageshow', refreshMedia);
  window.addEventListener('gallery-assets-updated', refreshMedia as EventListener);

  scheduleScan();
  return () => {
    window.removeEventListener('pageshow', refreshMedia);
    window.removeEventListener('gallery-assets-updated', refreshMedia as EventListener);
    observer.disconnect();
    restoreAddEventListener();
  };
}
