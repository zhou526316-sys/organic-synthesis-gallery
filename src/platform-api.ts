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

let mediaManifestPromise: Promise<StaticMediaManifest> | null = null;

function normalizeDoi(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function loadMediaManifest(): Promise<StaticMediaManifest> {
  if (!mediaManifestPromise) {
    mediaManifestPromise = fetch('/media-index.json', { credentials: 'same-origin', cache: 'force-cache' })
      .then(async response => {
        if (!response.ok) return { version: 1, generatedAt: 0, items: {} };
        const payload = await response.json() as StaticMediaManifest;
        return payload && typeof payload === 'object'
          ? { version: payload.version || 1, generatedAt: payload.generatedAt || 0, items: payload.items || {} }
          : { version: 1, generatedAt: 0, items: {} };
      })
      .catch(() => ({ version: 1, generatedAt: 0, items: {} }));
  }
  return mediaManifestPromise;
}

function localInventory(item: StaticMediaItem | undefined, doi: string) {
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

async function rawRequest<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
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

async function staticAwarePost<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  const requested = body && typeof body === 'object' && Array.isArray((body as { dois?: unknown }).dois)
    ? (body as { dois: unknown[] }).dois.map(normalizeDoi).filter((doi): doi is string => Boolean(doi))
    : [];

  if (path === '/api/media/inventory' && requested.length) {
    const manifest = await loadMediaManifest();
    const items = requested.map(doi => localInventory(manifest.items?.[doi], doi));
    return {
      data: { generatedAt: manifest.generatedAt || Date.now(), items } as T,
      status: 200,
      headers: new Headers({ 'x-gallery-media-source': 'static-manifest' }),
    };
  }

  if (path === '/api/media/batch' && requested.length) {
    const manifest = await loadMediaManifest();
    const localItems = requested.flatMap(doi => {
      const item = manifest.items?.[doi];
      return item ? [item] : [];
    });
    const missing = requested.filter(doi => !manifest.items?.[doi]);

    if (!missing.length) {
      return {
        data: { generatedAt: manifest.generatedAt || Date.now(), items: localItems } as T,
        status: 200,
        headers: new Headers({ 'x-gallery-media-source': 'static-manifest' }),
      };
    }

    try {
      const dynamic = await rawRequest<{ items?: StaticMediaItem[] }>('POST', path, { dois: missing });
      return {
        data: {
          generatedAt: Date.now(),
          items: [...localItems, ...(dynamic.data?.items || [])],
        } as T,
        status: 200,
        headers: new Headers({ 'x-gallery-media-source': localItems.length ? 'static+dynamic' : 'dynamic' }),
      };
    } catch {
      return {
        data: { generatedAt: manifest.generatedAt || Date.now(), items: localItems } as T,
        status: 200,
        headers: new Headers({ 'x-gallery-media-source': 'static-fallback' }),
      };
    }
  }

  return rawRequest<T>('POST', path, body);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
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
