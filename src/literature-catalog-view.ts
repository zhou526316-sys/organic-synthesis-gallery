import { api } from './platform-api';

export interface LiteratureCatalogHealth {
  literatureCatalogIndexShadowEnabled?: boolean;
  literatureCatalogIndexReadEnabled?: boolean;
  literatureCatalogIndexReadPathConfigured?: boolean;
  literatureCatalogIndexReadPathActive?: boolean;
  literatureCatalogIndexDb?: boolean;
}

export interface LiteratureCatalogViewRequest {
  catalogId: string;
  query?: string;
  selectedJournals?: string[];
  excludedJournals?: string[];
  dateFrom?: string;
  dateTo?: string;
  addedDate?: string;
  sort?: 'newest' | 'oldest';
  limit?: number;
  cursor?: string;
}

export interface LiteratureCatalogViewItem {
  doi: string;
  revision: string;
  title: string;
  titleZh: string;
  authors: string[];
  journal: string;
  firstOnlineDate: string | null;
  datePrecision: 'day' | 'unknown';
  addedDate: string | null;
  synthesisType: 'methodology' | 'total' | 'formal' | null;
}

export interface LiteratureCatalogViewResponse {
  version: number;
  schemaVersion: string;
  enabled: true;
  readPathActive: true;
  catalogId: string;
  matched: number;
  count: number;
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  sort: 'newest' | 'oldest';
  items: LiteratureCatalogViewItem[];
}

const HASH64 = /^[a-f0-9]{64}$/;
const DOI = /^10\.\d{4,9}\/\S+$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function validNullableDate(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && DATE.test(value));
}

function validateItem(value: unknown): LiteratureCatalogViewItem {
  assert(value && typeof value === 'object', 'literature_catalog_view_item_invalid');
  const row = value as Record<string, unknown>;
  assert(typeof row.doi === 'string' && DOI.test(row.doi), 'literature_catalog_view_item_doi_invalid');
  assert(typeof row.revision === 'string' && HASH64.test(row.revision), 'literature_catalog_view_item_revision_invalid');
  assert(typeof row.title === 'string' && typeof row.titleZh === 'string', 'literature_catalog_view_item_title_invalid');
  assert(Array.isArray(row.authors) && row.authors.every(author => typeof author === 'string'),
    'literature_catalog_view_item_authors_invalid');
  assert(typeof row.journal === 'string', 'literature_catalog_view_item_journal_invalid');
  assert(validNullableDate(row.firstOnlineDate), 'literature_catalog_view_item_date_invalid');
  assert(row.datePrecision === 'day' || row.datePrecision === 'unknown', 'literature_catalog_view_item_precision_invalid');
  assert(validNullableDate(row.addedDate), 'literature_catalog_view_item_added_date_invalid');
  assert(row.synthesisType === null || row.synthesisType === 'methodology'
    || row.synthesisType === 'total' || row.synthesisType === 'formal',
    'literature_catalog_view_item_synthesis_type_invalid');
  return row as unknown as LiteratureCatalogViewItem;
}

export function validateLiteratureCatalogViewResponse(
  value: unknown,
  request: LiteratureCatalogViewRequest,
): LiteratureCatalogViewResponse {
  assert(value && typeof value === 'object', 'literature_catalog_view_response_invalid');
  const body = value as Record<string, unknown>;
  assert(body.readPathActive === true, 'literature_catalog_view_read_inactive');
  assert(body.enabled === true, 'literature_catalog_view_not_enabled');
  assert(typeof body.catalogId === 'string' && HASH64.test(body.catalogId), 'literature_catalog_view_catalog_invalid');
  assert(body.catalogId === request.catalogId, 'literature_catalog_view_generation_mismatch');
  assert(Number.isSafeInteger(body.matched) && Number(body.matched) >= 0, 'literature_catalog_view_matched_invalid');
  assert(Number.isSafeInteger(body.count) && Number(body.count) >= 0, 'literature_catalog_view_count_invalid');
  assert(Number.isSafeInteger(body.limit) && Number(body.limit) >= 1 && Number(body.limit) <= 100,
    'literature_catalog_view_limit_invalid');
  assert(typeof body.hasMore === 'boolean', 'literature_catalog_view_has_more_invalid');
  assert(body.nextCursor === null || typeof body.nextCursor === 'string', 'literature_catalog_view_cursor_invalid');
  assert(body.sort === 'newest' || body.sort === 'oldest', 'literature_catalog_view_sort_invalid');
  assert(body.sort === (request.sort || 'newest'), 'literature_catalog_view_sort_mismatch');
  assert(Array.isArray(body.items), 'literature_catalog_view_items_invalid');
  const items = body.items.map(validateItem);
  assert(Number(body.count) === items.length, 'literature_catalog_view_count_mismatch');
  assert(items.length <= Number(body.limit), 'literature_catalog_view_page_overflow');
  assert(Number(body.matched) >= items.length, 'literature_catalog_view_total_underflow');
  if (body.hasMore) assert(typeof body.nextCursor === 'string' && body.nextCursor.length > 0,
    'literature_catalog_view_next_cursor_missing');
  return { ...(body as unknown as LiteratureCatalogViewResponse), items };
}

export async function literatureCatalogIndexedReadActive(): Promise<boolean> {
  try {
    const response = await api.get<LiteratureCatalogHealth>('/api/_healthcheck');
    const health = response.data || {};
    return health.literatureCatalogIndexShadowEnabled === true
      && health.literatureCatalogIndexReadEnabled === true
      && health.literatureCatalogIndexReadPathConfigured === true
      && health.literatureCatalogIndexReadPathActive === true
      && health.literatureCatalogIndexDb === true;
  } catch {
    return false;
  }
}

const SEARCH_CACHE_TTL_MS = 30_000;
const SEARCH_CACHE_MAX = 32;
const validatedSearchCache = new Map<string, { until: number; result: LiteratureCatalogViewResponse }>();

export async function fetchLiteratureCatalogView(
  request: LiteratureCatalogViewRequest,
  signal?: AbortSignal,
): Promise<LiteratureCatalogViewResponse> {
  assert(HASH64.test(request.catalogId), 'literature_catalog_view_request_catalog_invalid');
  if (signal?.aborted) throw new DOMException('Search superseded', 'AbortError');
  // The generation and every filter/cursor are part of the key. Repeated
  // identical searches can reuse an already validated answer for 30 seconds;
  // errors, partial responses, and cancelled requests are never cached.
  const key = JSON.stringify(request);
  const existing = validatedSearchCache.get(key);
  if (existing && existing.until > Date.now()) return existing.result;
  if (existing) validatedSearchCache.delete(key);
  const response = await api.catalogView<unknown>(request, signal);
  if (signal?.aborted) throw new DOMException('Search superseded', 'AbortError');
  const result = validateLiteratureCatalogViewResponse(response.data, request);
  if (validatedSearchCache.size >= SEARCH_CACHE_MAX)
    validatedSearchCache.delete(validatedSearchCache.keys().next().value!);
  validatedSearchCache.set(key, { until: Date.now() + SEARCH_CACHE_TTL_MS, result });
  return result;
}
