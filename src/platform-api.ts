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
  width?: number;
  height?: number;
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

let mediaManifestPromise: Promise<StaticMediaManifest> | null = null;
let translationsPromise: Promise<StaticTranslations> | null = null;
let resolutionsPromise: Promise<StaticResolutions> | null = null;

function assetUrl(path: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  if (typeof document !== 'undefined') return new URL(path.replace(/^\//, ''), document.baseURI).toString();
  return path;
}

function workerAssetUrl(path: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  return new URL(path, `${WORKER_ORIGIN}/`).toString();
}

function staticFrontendOnly(): boolean {
  if (typeof location === 'undefined') return false;
  return location.hostname.endsWith('.github.io') || location.protocol === 'file:';
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

// tm620-live-figure-union: a static Figure 1 must not hide later verified body figures.
function mergeMediaItem(local: StaticMediaItem | undefined, dynamic: StaticMediaItem | undefined): StaticMediaItem | undefined {
  if (!local) return dynamic;
  if (!dynamic) return local;
  const official = (t: StaticToc) => Boolean(t?.available && t.imageUrl && !/fallback/i.test(t.reason || ''));
  const toc = official(local.toc) ? local.toc : official(dynamic.toc) ? dynamic.toc : mediaItemHasToc(local) ? local.toc : dynamic.toc;
  const figuresByLabel = new Map<string, StaticFigure>();
  for (const figure of [...(local.figures?.figures || []), ...(dynamic.figures?.figures || [])]) {
    const key = String(figure.label || figure.id).toLowerCase().replace(/^fig(?:\.\s*|\s+)/, 'figure ').replace(/[^a-z0-9]+/g, '-');
    const old = figuresByLabel.get(key);
    const pixels = (f: StaticFigure) => Number(f.width || 0) * Number(f.height || 0);
    if (!old || (pixels(old) > 0 && pixels(figure) > pixels(old))) figuresByLabel.set(key, figure);
  }
  const collection = [...figuresByLabel.values()].sort((a,b) => Number(a.order || 0)-Number(b.order || 0) || a.label.localeCompare(b.label,undefined,{numeric:true}));
  return {
    ...dynamic, ...local, toc,
    figures: { ...local.figures, available: collection.length > 0, doi: local.doi, figures: collection },
    inventory: {
      ...(dynamic.inventory || {}), ...(local.inventory || {}),
      status: toc?.available && collection.length ? 'complete' : toc?.available ? 'large_only' : collection.length ? 'figures_only' : 'missing',
      largeSource: official(toc) ? 'toc' : collection.length ? 'figure' : 'none',
      figureCount: collection.length,
    },
  };
}

function loadMediaManifest(): Promise<StaticMediaManifest> {
  if (!mediaManifestPromise) {
    mediaManifestPromise = fetchStaticJson<StaticMediaManifest>('media-index.json', { version: 1, generatedAt: 0, items: {} }, 'no-cache')
      .then(payload => payload && typeof payload === 'object'
        ? { version: payload.version || 1, generatedAt: payload.generatedAt || 0, items: payload.items || {} }
        : { version: 1, generatedAt: 0, items: {} });
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

async function staticAwarePost<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  const requested = body && typeof body === 'object' && Array.isArray((body as { dois?: unknown }).dois)
    ? (body as { dois: unknown[] }).dois.map(normalizeDoi).filter((doi): doi is string => Boolean(doi))
    : [];

  if (path === '/api/media/inventory' && requested.length) {
    const manifest = await loadMediaManifest();
    const localByDoi = new Map(requested.map(doi => [doi, localInventory(manifest.items?.[doi], doi)]));
    const incomplete = requested.filter(doi => localByDoi.get(doi)?.status !== 'complete');

    if (staticFrontendOnly() && incomplete.length) {
      try {
        const dynamic = await workerRequest<{ generatedAt?: number; items?: InventoryItem[] }>('POST', path, { dois: incomplete, readOnly: true });
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
      } catch {
        // Keep the complete static snapshot usable if the Worker is unavailable.
      }
    }

    return {
      data: { generatedAt: manifest.generatedAt || Date.now(), items: requested.map(doi => localByDoi.get(doi)!) } as T,
      status: 200,
      headers: new Headers({ 'x-gallery-media-source': 'static-manifest' }),
    };
  }

  if (path === '/api/media/batch' && requested.length) {
    const manifest = await loadMediaManifest();
    const localByDoi = new Map<string, StaticMediaItem>();
    for (const doi of requested) {
      const item = manifest.items?.[doi];
      if (item) localByDoi.set(doi, normalizeMediaItem(item, 'static'));
    }

    // Individual static images do not prove a complete collection; query the current batch once.
    const incomplete = requested;

    if (incomplete.length) {
      try {
        const dynamic = staticFrontendOnly()
          ? await workerRequest<{ generatedAt?: number; items?: StaticMediaItem[] }>('POST', path, { dois: incomplete })
          : await rawRequest<{ generatedAt?: number; items?: StaticMediaItem[] }>('POST', path, { dois: incomplete, readOnly: true });
        const dynamicByDoi = new Map<string, StaticMediaItem>();
        for (const item of dynamic.data?.items || []) {
          const doi = normalizeDoi(item?.doi);
          if (!doi) continue;
          dynamicByDoi.set(doi, normalizeMediaItem(item, staticFrontendOnly() ? 'worker' : 'static'));
        }
        const items = requested.flatMap(doi => {
          const merged = mergeMediaItem(localByDoi.get(doi), dynamicByDoi.get(doi));
          return merged ? [merged] : [];
        });
        return {
          data: { generatedAt: dynamic.data?.generatedAt || manifest.generatedAt || Date.now(), items } as T,
          status: 200,
          headers: new Headers({ 'x-gallery-media-source': localByDoi.size ? 'static+dynamic' : 'dynamic' }),
        };
      } catch {
        // Preserve all static media if the Worker cannot fill the gaps.
      }
    }

    return {
      data: { generatedAt: manifest.generatedAt || Date.now(), items: requested.flatMap(doi => localByDoi.get(doi) ? [localByDoi.get(doi)!] : []) } as T,
      status: 200,
      headers: new Headers({ 'x-gallery-media-source': incomplete.length ? 'static-fallback' : 'static-manifest' }),
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
