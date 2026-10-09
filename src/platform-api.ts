export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  headers: Headers;
}

interface StaticToc {
  available: boolean;
  imageUrl?: string;
  articleUrl?: string;
  contentHash?: string;
  reason?: string;
}

interface StaticFigure {
  id: string;
  label: string;
  caption?: string;
  imageUrl: string;
  order: number;
}

interface StaticMediaItem {
  doi: string;
  toc: StaticToc;
  figures: {
    available: boolean;
    doi: string;
    articleUrl?: string;
    figures: StaticFigure[];
  };
  inventory?: {
    status?: 'complete' | 'large_only' | 'figures_only' | 'missing';
    largeSource?: 'toc' | 'figure1' | 'figure' | 'none';
    fallbackLabel?: string;
    suspiciousToc?: boolean;
    figureCount?: number;
  };
}

interface StaticMediaManifest {
  version?: number;
  generatedAt?: number;
  items?: Record<string, StaticMediaItem>;
}

interface StaticTranslations {
  translations?: Array<{ title?: string; zh?: string }>;
}

interface StaticResolutions {
  byDoi?: Record<string, { title?: string; doi?: string }>;
  byTitle?: Record<string, { title?: string; doi?: string }>;
  byUrl?: Record<string, { title?: string; doi?: string }>;
}

interface InventoryItem {
  doi: string;
  status: 'complete' | 'large_only' | 'figures_only' | 'missing';
  largeSource: 'toc' | 'figure1' | 'figure' | 'none';
  fallbackLabel?: string;
  suspiciousToc?: boolean;
  figureCount?: number;
}

const WORKER_ORIGIN = 'https://organic-synthesis-gallery.zhou526316.workers.dev';
// Canonical browser-readable API. The Gallery custom domain is hosted on static Pages,
// not on the Worker, so media POSTs must not go to its same-origin /api path.
const MEDIA_API_ORIGIN = 'https://api.gczhouwld.com';

let mediaManifestPromise: Promise<StaticMediaManifest> | null = null;
let mediaManifestFetchedAt = 0;
let lastKnownMediaManifest: StaticMediaManifest | null = null;
// Media is published independently of the 08:00 article batch. An open browser
// tab must not retain a stale manifest indefinitely after a new Pages delivery.
// Five minutes bounds network traffic for visitors in mainland China.
const MEDIA_MANIFEST_MAX_AGE_MS = 5 * 60 * 1000;
let translationsPromise: Promise<StaticTranslations> | null = null;
let resolutionsPromise: Promise<StaticResolutions> | null = null;

function assetUrl(path: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  if (typeof document !== 'undefined') return new URL(path.replace(/^\//, ''), document.baseURI).toString();
  return path;
}

function workerAssetUrl(path: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  return new URL(path, `${MEDIA_API_ORIGIN}/`).toString();
}

function staticFrontendOnly(): boolean {
  if (typeof location === 'undefined') return false;
  return location.hostname.endsWith('.github.io') || location.protocol === 'file:';
}

function publicStaticMediaFrontend(): boolean {
  if (typeof location === 'undefined') return false;
  const host = location.hostname.toLowerCase();
  return host === 'gallery.gczhouwld.com'
    || host === 'organic-synthesis-gallery-public.pages.dev'
    || staticFrontendOnly();
}

function localDevelopmentHost(): boolean {
  if (typeof location === 'undefined') return false;
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

function normalizeDoi(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function normalizeTitle(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

async function fetchStaticJson<T>(path: string, fallback: T, cache: RequestCache = 'force-cache'): Promise<T> {
  try {
    const response = await fetch(assetUrl(path), { credentials: 'same-origin', cache });
    if (!response.ok) return fallback;
    return await response.json() as T;
  } catch {
    return fallback;
  }
}

function normalizeMediaItem(item: StaticMediaItem, source: 'static' | 'worker'): StaticMediaItem {
  const resolve = source === 'static' ? assetUrl : workerAssetUrl;
  return {
    ...item,
    toc: {
      ...item.toc,
      ...(item.toc?.imageUrl ? { imageUrl: resolve(item.toc.imageUrl) } : {}),
    },
    figures: {
      ...item.figures,
      figures: (item.figures?.figures || []).map(figure => ({
        ...figure,
        imageUrl: resolve(figure.imageUrl),
      })),
    },
  };
}

function mediaItemHasToc(item: StaticMediaItem | undefined): boolean {
  return Boolean(item?.toc?.available && item.toc.imageUrl);
}

function mediaItemHasFigures(item: StaticMediaItem | undefined): boolean {
  return Boolean(item?.figures?.available && item.figures.figures?.length);
}

function mergeMediaItem(local: StaticMediaItem | undefined, dynamic: StaticMediaItem | undefined): StaticMediaItem | undefined {
  if (!local) return dynamic;
  if (!dynamic) return local;
  // A live, DOI-bound available TOC is newer authority than the Pages snapshot:
  // the latter may predate an exact-hash correction or a new owner capture.
  // Preserve verified static TOCs if the Worker genuinely has no image yet.
  const toc = mediaItemHasToc(dynamic) ? dynamic.toc : mediaItemHasToc(local) ? local.toc : dynamic.toc;
  // Published numbered figures have their own static integrity gate. Do not
  // replace a verified Pages figure list with an empty D1 staging response.
  const figures = mediaItemHasFigures(local) ? local.figures : dynamic.figures;
  return {
    ...dynamic,
    ...local,
    toc,
    figures,
    inventory: {
      ...(dynamic.inventory || {}),
      ...(local.inventory || {}),
    },
  };
}

// This previously accepted publisher illustration is a verified *substrate
// scope* grid, not the paper's actual graphical abstract. The one-off D1
// correction does not retroactively rewrite older published Pages snapshots.
const VERIFIED_WRONG_TOC_DOI = '10.1002/anie.4335022';
const VERIFIED_WRONG_TOC_HASH = '35f10c5321cd43179a4c71c73e388da8';

function excludeConfirmedWrongToc(item: StaticMediaItem): StaticMediaItem {
  if (normalizeDoi(item.doi) !== VERIFIED_WRONG_TOC_DOI
      || item.toc?.contentHash !== VERIFIED_WRONG_TOC_HASH) return item;
  const hasFigures = mediaItemHasFigures(item);
  return {
    ...item,
    toc: { ...item.toc, available: false, imageUrl: undefined, reason: 'verified_wrong_toc_excluded' },
    inventory: {
      ...(item.inventory || {}),
      status: hasFigures ? 'figures_only' : 'missing',
      largeSource: 'none',
      suspiciousToc: true,
    },
  };
}

function sanitizeManifest(manifest: StaticMediaManifest): StaticMediaManifest {
  const item = manifest.items?.[VERIFIED_WRONG_TOC_DOI];
  if (!item || item.toc?.contentHash !== VERIFIED_WRONG_TOC_HASH) return manifest;
  return {
    ...manifest,
    items: { ...manifest.items, [VERIFIED_WRONG_TOC_DOI]: excludeConfirmedWrongToc(item) },
  };
}

// The visible DOI API and post-first-paint recovery share exactly one bounded
// snapshot promise. A media change can explicitly invalidate it without an
// unconditional second no-store download of the multi-megabyte index.
export function loadMediaManifest(forceRefresh = false): Promise<StaticMediaManifest> {
  const now = Date.now();
  if (forceRefresh) mediaManifestPromise = null;
  if (!mediaManifestPromise || now - mediaManifestFetchedAt >= MEDIA_MANIFEST_MAX_AGE_MS) {
    mediaManifestFetchedAt = now;
    // A transient 503 or offline moment must never erase a previously verified
    // static TOC or body-figure record from an active user's tab.
    const fallback: StaticMediaManifest = lastKnownMediaManifest || { version: 1, generatedAt: 0, items: {} };
    mediaManifestPromise = fetchStaticJson<StaticMediaManifest>('media-index.json', fallback, forceRefresh ? 'reload' : 'no-cache')
      .then(payload => {
        const next: StaticMediaManifest = sanitizeManifest(payload && typeof payload === 'object'
          ? { version: payload.version || 1, generatedAt: payload.generatedAt || 0, items: payload.items || {} }
          : fallback);
        // Older CDN edges may briefly serve an earlier Pages generation.
        if (lastKnownMediaManifest && Number(next.generatedAt || 0) < Number(lastKnownMediaManifest.generatedAt || 0)) {
          return lastKnownMediaManifest;
        }
        lastKnownMediaManifest = next;
        return next;
      });
  }
  return mediaManifestPromise;
}

function loadTranslations(): Promise<StaticTranslations> {
  if (!translationsPromise) translationsPromise = fetchStaticJson<StaticTranslations>('title-translations-zh.json', { translations: [] });
  return translationsPromise;
}

function loadResolutions(): Promise<StaticResolutions> {
  if (!resolutionsPromise) resolutionsPromise = fetchStaticJson<StaticResolutions>('paper-title-resolutions.json', { byDoi: {}, byTitle: {}, byUrl: {} });
  return resolutionsPromise;
}

function localInventory(item: StaticMediaItem | undefined, doi: string): InventoryItem {
  if (!item) {
    return {
      doi,
      status: 'missing',
      largeSource: 'none',
      suspiciousToc: false,
      figureCount: 0,
    };
  }
  const figureCount = item.figures?.figures?.length || 0;
  const hasToc = Boolean(item.toc?.available && item.toc?.imageUrl);
  const hasFigures = figureCount > 0;
  const fallback = !hasToc && hasFigures ? item.figures.figures[0] : undefined;
  return {
    doi,
    status: item.inventory?.status || (hasToc && hasFigures ? 'complete' : hasToc ? 'large_only' : hasFigures ? 'figures_only' : 'missing'),
    largeSource: item.inventory?.largeSource || (hasToc ? 'toc' : fallback ? (/^figure\s*1$/i.test(fallback.label) ? 'figure1' : 'figure') : 'none'),
    fallbackLabel: item.inventory?.fallbackLabel || fallback?.label,
    suspiciousToc: Boolean(item.inventory?.suspiciousToc),
    figureCount: item.inventory?.figureCount ?? figureCount,
  };
}

function inventoryRank(status: InventoryItem['status']): number {
  if (status === 'complete') return 3;
  if (status === 'large_only' || status === 'figures_only') return 2;
  return 0;
}

async function rawRequest<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const absolute = /^https?:\/\//i.test(path);
  const response = await fetch(path, {
    method,
    credentials: absolute ? 'omit' : 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const detail = typeof data === 'object' && data && 'error' in data
      ? String((data as { error?: unknown }).error || response.statusText)
      : response.statusText || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return {
    data: data as T,
    status: response.status,
    headers: response.headers,
  };
}

function workerRequest<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  return rawRequest<T>(method, `${WORKER_ORIGIN}${path}`, body);
}

function canonicalMediaRequest<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  return rawRequest<T>('POST', `${MEDIA_API_ORIGIN}${path}`, body);
}

async function staticAwarePost<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  if (!localDevelopmentHost() && path === '/api/literature/catalog-view') {
    return workerRequest<T>('POST', path, body);
  }

  const requested = body && typeof body === 'object' && Array.isArray((body as { dois?: unknown }).dois)
    ? (body as { dois: unknown[] }).dois.map(normalizeDoi).filter((doi): doi is string => Boolean(doi))
    : [];

  if (path === '/api/media/inventory' && requested.length) {
    const manifest = await loadMediaManifest();
    const localByDoi = new Map(requested.map(doi => [doi, localInventory(manifest.items?.[doi], doi)]));
    const incomplete = requested.filter(doi => localByDoi.get(doi)?.status !== 'complete');

    if (publicStaticMediaFrontend() && incomplete.length) {
      try {
        const dynamic = await canonicalMediaRequest<{ generatedAt?: number; items?: InventoryItem[] }>(path, { dois: incomplete, readOnly: true });
        for (const item of dynamic.data?.items || []) {
          const doi = normalizeDoi(item?.doi);
          if (!doi) continue;
          const local = localByDoi.get(doi);
          if (!local || inventoryRank(item.status) > inventoryRank(local.status)) localByDoi.set(doi, item);
        }
        return {
          data: { generatedAt: dynamic.data?.generatedAt || manifest.generatedAt || Date.now(), items: requested.map(doi => localByDoi.get(doi)!) } as T,
          status: 200,
          headers: new Headers({ 'x-gallery-media-source': 'static+worker-inventory' }),
        };
      } catch (error) {
        // An unreadable remote inventory is not proof that a missing item is complete.
        console.warn('[Gallery media] live inventory unavailable; preserving static snapshot', error);
      }
    }

    return {
      data: { generatedAt: manifest.generatedAt || Date.now(), items: requested.map(doi => localByDoi.get(doi)!) } as T,
      status: 200,
      headers: new Headers({ 'x-gallery-media-source': 'static-manifest' }),
    };
  }

  if (path === '/api/media/batch' && requested.length) {
    // Prefer the small current-DUI batch for visible cards. Loading the entire
    // Pages media index first delayed fresh TOCs and let stale statics win.
    const liveByDoi = new Map<string, StaticMediaItem>();
    let liveGeneratedAt = 0;
    let liveError = false;
    try {
      const fromCanonical = publicStaticMediaFrontend();
      const live = fromCanonical
        ? await canonicalMediaRequest<{ generatedAt?: number; items?: StaticMediaItem[] }>(path, { dois: requested })
        : await rawRequest<{ generatedAt?: number; items?: StaticMediaItem[] }>('POST', path, { dois: requested });
      if (!Array.isArray(live.data?.items)) throw new Error('live_media_response_invalid');
      liveGeneratedAt = Number(live.data.generatedAt || 0);
      const requestedSet = new Set(requested);
      for (const item of live.data.items) {
        const doi = normalizeDoi(item?.doi);
        if (!doi || !requestedSet.has(doi)) continue;
        liveByDoi.set(doi, excludeConfirmedWrongToc(normalizeMediaItem(item, fromCanonical ? 'worker' : 'static')));
      }
      // Deliver the live TOC immediately to the already-mounted visible cards;
      // the API response still merges any separately published static figures.
      if (typeof window !== 'undefined' && liveByDoi.size) {
        window.dispatchEvent(new CustomEvent('gallery-media-live-batch', {
          detail: { items: requested.flatMap(doi => liveByDoi.get(doi) ? [liveByDoi.get(doi)!] : []) },
        }));
      }
    } catch (error) {
      liveError = true;
      console.warn('[Gallery media] live batch unavailable; preserving verified static snapshot', error);
    }

    const manifest = await loadMediaManifest();
    const hasStaticForRequest = requested.some(doi => Boolean(manifest.items?.[doi]));
    const items = requested.flatMap(doi => {
      const raw = manifest.items?.[doi];
      const local = raw ? normalizeMediaItem(excludeConfirmedWrongToc(raw), 'static') : undefined;
      const merged = mergeMediaItem(local, liveByDoi.get(doi));
      return merged ? [merged] : [];
    });
    return {
      data: { generatedAt: liveGeneratedAt || manifest.generatedAt || Date.now(), items } as T,
      status: 200,
      headers: new Headers({
        'x-gallery-media-source': liveError ? 'static-fallback' : liveByDoi.size ? (hasStaticForRequest ? 'static+dynamic' : 'dynamic') : 'static-manifest',
      }),
    };
  }

  if (staticFrontendOnly() && path === '/api/title-translations/zh') {
    const titles = body && typeof body === 'object' && Array.isArray((body as { titles?: unknown }).titles)
      ? (body as { titles: unknown[] }).titles.filter((value): value is string => typeof value === 'string')
      : [];
    const payload = await loadTranslations();
    const map = new Map((payload.translations || [])
      .filter(item => typeof item.title === 'string' && typeof item.zh === 'string')
      .map(item => [normalizeTitle(item.title), item]));
    const translations = titles.flatMap(title => {
      const hit = map.get(normalizeTitle(title));
      return hit ? [{ title, zh: hit.zh }] : [];
    });
    return {
      data: { translations } as T,
      status: 200,
      headers: new Headers({ 'x-gallery-metadata-source': 'static-translations' }),
    };
  }

  if (staticFrontendOnly() && path === '/api/paper-titles/resolve') {
    const papers = body && typeof body === 'object' && Array.isArray((body as { papers?: unknown }).papers)
      ? (body as { papers: Array<Record<string, unknown>> }).papers
      : [];
    const payload = await loadResolutions();
    const results = papers.flatMap(item => {
      const doi = normalizeDoi(item.doi);
      const titleKey = normalizeTitle(item.title);
      const urlKey = typeof item.url === 'string' ? item.url.trim() : '';
      const hit = (doi ? payload.byDoi?.[doi] : undefined)
        || (titleKey ? payload.byTitle?.[titleKey] : undefined)
        || (urlKey ? payload.byUrl?.[urlKey] : undefined);
      if (!hit?.title) return [];
      return [{ key: item.key, title: hit.title, doi: hit.doi }];
    });
    return {
      data: { papers: results } as T,
      status: 200,
      headers: new Headers({ 'x-gallery-metadata-source': 'static-resolutions' }),
    };
  }

  return rawRequest<T>('POST', path, body);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  if (method === 'GET' && !localDevelopmentHost() && path === '/api/_healthcheck') {
    return workerRequest<T>('GET', path);
  }
  if (method === 'GET' && staticFrontendOnly() && path === '/api/literature/supplement') {
    const data = await fetchStaticJson<unknown>('literature-supplement.json', { papers: [] }, 'no-cache');
    return {
      data: data as T,
      status: 200,
      headers: new Headers({ 'x-gallery-metadata-source': 'static-supplement' }),
    };
  }
  if (method === 'POST') return staticAwarePost<T>(path, body);
  return rawRequest<T>(method, path, body);
}

export const api = {
  get<T = unknown>(path: string): Promise<ApiResponse<T>> {
    return request<T>('GET', path);
  },
  post<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>('POST', path, body);
  },
  put<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>('PUT', path, body);
  },
  delete<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>('DELETE', path, body);
  },
};
