import { store } from './user-ui/shared';

interface TranslationItem {
  title?: unknown;
  zh?: unknown;
}

interface StaticFigure {
  label?: string;
  caption?: string;
  imageUrl?: string;
}

interface StaticMediaItem {
  toc?: {
    available?: boolean;
    imageUrl?: string;
    reason?: string;
  };
  figures?: {
    available?: boolean;
    figures?: StaticFigure[];
  };
}

interface StaticMediaManifest {
  items?: Record<string, StaticMediaItem>;
}

const translations = new Map<string, string>();
let mediaManifestPromise: Promise<StaticMediaManifest> | null = null;
let scanTimer: number | null = null;

function assetUrl(path: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  return new URL(path.replace(/^\/+/, ''), document.baseURI).toString();
}

function normalizeTitleKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDoi(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function isChineseUi(): boolean {
  return document.documentElement.lang.toLowerCase().startsWith('zh');
}

async function loadTranslations(): Promise<void> {
  try {
    const response = await fetch(assetUrl('title-translations-zh.json'), {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return;
    const payload = await response.json() as { translations?: TranslationItem[] };
    const exactCache: Record<string, string> = {};
    try {
      const existing = JSON.parse(localStorage.getItem('organic-gallery-zh-title-cache-v2') || '{}') as Record<string, unknown>;
      for (const [key, value] of Object.entries(existing)) {
        if (typeof value === 'string' && value.trim()) exactCache[key] = value.trim();
      }
    } catch {
      // Browser storage is optional.
    }
    for (const item of payload.translations || []) {
      if (typeof item.title !== 'string' || typeof item.zh !== 'string') continue;
      const title = item.title.trim();
      const zh = item.zh.trim();
      if (!title || !zh) continue;
      translations.set(normalizeTitleKey(title), zh);
      exactCache[title] = zh;
    }
    try {
      localStorage.setItem('organic-gallery-zh-title-cache-v2', JSON.stringify(exactCache));
    } catch {
      // Browser storage is optional.
    }
  } catch {
    // The main Gallery remains usable in English if the snapshot is unavailable.
  }
}

async function loadMediaManifest(): Promise<StaticMediaManifest> {
  if (!mediaManifestPromise) {
    mediaManifestPromise = fetch(assetUrl('media-index.json'), {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(response => response.ok ? response.json() as Promise<StaticMediaManifest> : { items: {} })
      .catch(() => ({ items: {} }));
  }
  return mediaManifestPromise;
}

function cardEnglishTitle(card: HTMLElement): string {
  const remembered = card.dataset.runtimeEnglishTitle?.trim();
  if (remembered) return remembered;
  const slotTitle = card.querySelector<HTMLElement>('.toc-slot[data-title]')?.dataset.title?.trim();
  const heading = card.querySelector<HTMLElement>('h2.title')?.textContent?.trim();
  const candidate = slotTitle || heading || '';
  if (candidate) card.dataset.runtimeEnglishTitle = candidate;
  return candidate;
}

function patchChineseTitles(): void {
  if (!isChineseUi() || translations.size === 0) return;
  for (const card of document.querySelectorAll<HTMLElement>('.card')) {
    const source = cardEnglishTitle(card);
    if (!source) continue;
    const zh = translations.get(normalizeTitleKey(source));
    if (!zh) continue;
    const heading = card.querySelector<HTMLElement>('h2.title');
    if (heading && heading.textContent !== zh) heading.textContent = zh;
    for (const generated of card.querySelectorAll<HTMLElement>('.generated-graphic-title')) {
      if (generated.textContent !== zh) generated.textContent = zh;
    }
  }
}

function mediaLabel(item: StaticMediaItem): string {
  const reason = item.toc?.reason || '';
  if (reason === 'figure1_fallback') return 'Figure 1';
  if (reason.startsWith('figure_fallback:')) return reason.slice('figure_fallback:'.length) || 'Figure 1';
  return isChineseUi() ? '文章图 / TOC' : 'Article graphic / TOC';
}

function restoreToc(slot: HTMLElement, item: StaticMediaItem): void {
  if (slot.querySelector('img.toc-image')) return;
  const path = item.toc?.available && item.toc.imageUrl
    ? item.toc.imageUrl
    : item.figures?.figures?.find(figure => typeof figure.imageUrl === 'string')?.imageUrl;
  if (!path) return;
  const url = assetUrl(path);
  if (slot.dataset.runtimeMediaUrl === url) return;
  slot.dataset.runtimeMediaUrl = url;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toc-link';
  const image = new Image();
  image.className = 'toc-image';
  image.loading = 'eager';
  image.decoding = 'async';
  image.alt = mediaLabel(item);
  const label = document.createElement('span');
  label.className = 'toc-label';
  label.textContent = mediaLabel(item);
  button.append(image, label);
  image.addEventListener('load', () => {
    if (!image.naturalWidth) return;
    slot.replaceChildren(button);
    slot.classList.remove('generated', 'pending');
    slot.classList.add('loaded');
    slot.dataset.state = 'done';
  }, { once: true });
  image.addEventListener('error', () => {
    delete slot.dataset.runtimeMediaUrl;
  }, { once: true });
  image.src = url;
  if (image.complete && image.naturalWidth) {
    queueMicrotask(() => image.dispatchEvent(new Event('load')));
  }
}

function restoreFigures(slot: HTMLElement, item: StaticMediaItem): void {
  if (slot.querySelector('.figure-thumb:not(.generated-thumb) img')) return;
  const figures = (item.figures?.figures || []).filter(figure => typeof figure.imageUrl === 'string' && figure.imageUrl);
  if (!figures.length) return;

  const heading = document.createElement('div');
  heading.className = 'figure-strip-heading';
  heading.textContent = isChineseUi() ? '正文图片' : 'Article figures';
  const strip = document.createElement('div');
  strip.className = 'figure-strip';
  let committed = false;

  for (const figure of figures.slice(0, 10)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'figure-thumb';
    const image = new Image();
    image.loading = 'lazy';
    image.decoding = 'async';
    image.alt = figure.label || 'Figure';
    const label = document.createElement('span');
    label.textContent = figure.label || 'Figure';
    button.append(image, label);
    strip.appendChild(button);
    image.addEventListener('load', () => {
      if (!committed && image.naturalWidth) {
        committed = true;
        slot.replaceChildren(heading, strip);
        slot.classList.remove('generated');
        slot.classList.add('loaded');
        slot.dataset.state = 'done';
      }
    }, { once: true });
    image.addEventListener('error', () => button.remove(), { once: true });
    image.src = assetUrl(figure.imageUrl!);
  }
}

async function patchMedia(): Promise<void> {
  const manifest = await loadMediaManifest();
  const items = manifest.items || {};
  for (const card of document.querySelectorAll<HTMLElement>('.card')) {
    const tocSlot = card.querySelector<HTMLElement>('.toc-slot[data-doi]');
    const doi = normalizeDoi(tocSlot?.dataset.doi);
    if (!doi) continue;
    const item = items[doi];
    if (!item) continue;
    if (tocSlot) restoreToc(tocSlot, item);
    const figureSlot = card.querySelector<HTMLElement>('.figure-strip-slot[data-figure-doi]');
    if (figureSlot) restoreFigures(figureSlot, item);
  }
}

function patchStatusClearButtons(): void {
  for (const host of document.querySelectorAll<HTMLElement>('gallery-paper-actions')) {
    const root = host.shadowRoot;
    if (!root || root.querySelector('[data-runtime-clear-status]')) continue;
    const selected = root.querySelector<HTMLElement>('.choice.selected');
    const stack = selected?.closest<HTMLElement>('.stack');
    if (!selected || !stack) continue;
    const paperId = host.dataset.paperId || '';
    if (!paperId) continue;

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'choice danger';
    clear.dataset.runtimeClearStatus = 'true';
    clear.textContent = isChineseUi() ? '取消阅读状态' : 'Clear reading status';
    clear.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      store.updatePaper(paperId, paper => {
        delete paper.statusId;
      });
    });
    stack.appendChild(clear);
  }
}

function runScan(): void {
  patchChineseTitles();
  patchStatusClearButtons();
  void patchMedia();
}

function scheduleScan(delay = 0): void {
  if (scanTimer !== null) clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    runScan();
  }, delay);
}

const observer = new MutationObserver(() => scheduleScan(20));
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['lang'] });

document.addEventListener('click', () => scheduleScan(0), true);
window.addEventListener('pageshow', () => scheduleScan(0));
window.addEventListener('scroll', () => scheduleScan(60), { passive: true });
window.addEventListener('gallery-assets-updated', () => {
  mediaManifestPromise = null;
  scheduleScan(0);
});
store.addEventListener('change', () => scheduleScan(0));

void Promise.all([loadTranslations(), loadMediaManifest()]).finally(() => scheduleScan(0));

export {};
