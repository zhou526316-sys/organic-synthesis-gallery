interface StaticTocEntry {
  available?: boolean;
  imageUrl?: string;
  reason?: string;
}

interface StaticMediaEntry {
  doi?: string;
  toc?: StaticTocEntry;
}

interface StaticMediaManifest {
  items?: Record<string, StaticMediaEntry>;
}

const TOC_SELECTOR = '.toc-slot[data-doi]';
const FIGURE_IMAGE_SELECTOR = '.figure-strip-slot img';
const STYLE_ID = 'gallery-performance-style';
const hydratedUrls = new Set<string>();
let manifestPromise: Promise<StaticMediaManifest> | null = null;
let hydrationFrame = 0;
let scrollTimer: number | null = null;

function assetUrl(path: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  return new URL(path.replace(/^\//, ''), document.baseURI).toString();
}

function mediaManifest(): Promise<StaticMediaManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(new URL('./media-index.json', document.baseURI), {
      cache: 'default',
      credentials: 'same-origin',
    })
      .then(response => response.ok ? response.json() as Promise<StaticMediaManifest> : { items: {} })
      .catch(() => ({ items: {} }));
  }
  return manifestPromise;
}

function installPerformanceStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .gallery .card:not(.bridge-staging-card) {
      content-visibility: auto;
      contain-intrinsic-size: auto 500px;
    }
    .gallery .figure-strip-slot {
      content-visibility: auto;
      contain-intrinsic-size: auto 100px;
    }
    html.gallery-scrolling .gallery .card {
      transition: none !important;
    }
    html.gallery-scrolling .gallery .card:hover {
      transform: none !important;
    }
  `;
  document.head.appendChild(style);
}

function tocLabel(reason: string | undefined): string {
  if (reason === 'figure1_fallback') return 'Figure 1';
  if (reason?.startsWith('figure_fallback:')) return reason.slice('figure_fallback:'.length).trim() || 'Figure';
  return document.documentElement.lang.toLowerCase().startsWith('zh') ? '文章图 / TOC' : 'Article graphic / TOC';
}

function openLightbox(imageUrl: string, label: string): void {
  document.querySelector('.image-lightbox')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'image-lightbox';
  const panel = document.createElement('div');
  panel.className = 'image-lightbox-panel';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'image-lightbox-close';
  close.textContent = '×';
  close.setAttribute('aria-label', document.documentElement.lang.toLowerCase().startsWith('zh') ? '关闭大图' : 'Close enlarged image');
  const image = new Image();
  image.className = 'image-lightbox-image';
  image.alt = label;
  image.decoding = 'async';
  image.src = imageUrl;
  panel.append(close, image);
  overlay.appendChild(panel);
  const dismiss = (): void => overlay.remove();
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) dismiss();
  });
  document.body.appendChild(overlay);
}

function isNearViewport(slot: HTMLElement): boolean {
  const card = slot.closest<HTMLElement>('.card');
  if (!card) return false;
  const rect = card.getBoundingClientRect();
  return rect.bottom >= -320 && rect.top <= window.innerHeight + 900;
}

function renderStaticToc(slot: HTMLElement, toc: StaticTocEntry): void {
  if (!toc.available || !toc.imageUrl) return;
  const imageUrl = assetUrl(toc.imageUrl);
  const current = slot.querySelector<HTMLImageElement>('.toc-image');
  if (current?.src === imageUrl && current.complete) return;
  if (slot.dataset.fastTocUrl === imageUrl && slot.dataset.fastTocState === 'loading') return;

  slot.dataset.fastTocUrl = imageUrl;
  slot.dataset.fastTocState = 'loading';
  const labelText = tocLabel(toc.reason);
  const image = new Image();
  image.alt = labelText;
  image.className = 'toc-image';
  image.loading = 'eager';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.fetchPriority = isNearViewport(slot) ? 'high' : 'auto';

  image.addEventListener('load', () => {
    if (!slot.isConnected || slot.dataset.fastTocUrl !== imageUrl) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toc-link';
    button.setAttribute('aria-label', labelText);
    const label = document.createElement('span');
    label.className = 'toc-label';
    label.textContent = labelText;
    button.append(image, label);
    button.addEventListener('click', () => openLightbox(imageUrl, labelText));
    slot.replaceChildren(button);
    slot.classList.remove('generated', 'pending', 'preparing', 'unavailable');
    slot.classList.add('loaded');
    slot.dataset.state = 'done';
    slot.dataset.fastTocState = 'done';
  }, { once: true });

  image.addEventListener('error', () => {
    if (slot.dataset.fastTocUrl === imageUrl) slot.dataset.fastTocState = 'error';
  }, { once: true });

  image.src = imageUrl;
  hydratedUrls.add(imageUrl);
}

function tuneFigureImages(root: ParentNode = document): void {
  root.querySelectorAll<HTMLImageElement>(FIGURE_IMAGE_SELECTOR).forEach(image => {
    image.loading = 'lazy';
    image.decoding = 'async';
    image.fetchPriority = 'low';
  });
}

async function hydrateAllStaticTocs(): Promise<void> {
  const manifest = await mediaManifest();
  const items = manifest.items || {};
  const slots = [...document.querySelectorAll<HTMLElement>(TOC_SELECTOR)];
  if (!slots.length) return;

  const near: HTMLElement[] = [];
  const rest: HTMLElement[] = [];
  for (const slot of slots) (isNearViewport(slot) ? near : rest).push(slot);

  for (const slot of [...near, ...rest]) {
    const doi = (slot.dataset.doi || '').trim().toLowerCase();
    if (!doi) continue;
    const toc = items[doi]?.toc;
    if (!toc?.available || !toc.imageUrl) continue;
    renderStaticToc(slot, toc);
  }
  tuneFigureImages();
}

function queueHydration(): void {
  if (hydrationFrame) return;
  hydrationFrame = window.requestAnimationFrame(() => {
    hydrationFrame = 0;
    void hydrateAllStaticTocs();
  });
}

function installMutationObserver(): void {
  const observer = new MutationObserver(records => {
    let cardsChanged = false;
    for (const record of records) {
      if (record.type !== 'childList' || record.addedNodes.length === 0) continue;
      cardsChanged = true;
      for (const node of record.addedNodes) {
        if (node instanceof Element) tuneFigureImages(node);
      }
    }
    if (cardsChanged) queueHydration();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function installScrollMode(): void {
  window.addEventListener('scroll', () => {
    document.documentElement.classList.add('gallery-scrolling');
    if (scrollTimer !== null) window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      document.documentElement.classList.remove('gallery-scrolling');
      scrollTimer = null;
    }, 120);
  }, { passive: true });
}

installPerformanceStyles();
installMutationObserver();
installScrollMode();
void mediaManifest().then(() => queueHydration());

export {};
