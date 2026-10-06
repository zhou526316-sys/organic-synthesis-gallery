import { api } from './platform-api';
import { RESULT_WINDOW_SIZE } from '../shared/result-window.js';

export type IndexedLiteratureSort = 'newest' | 'oldest';

export interface IndexedLiteratureViewRequest {
  catalogId: string;
  query?: string;
  selectedJournals?: string[];
  excludedJournals?: string[];
  dateFrom?: string;
  dateTo?: string;
  addedDate?: string;
  sort: IndexedLiteratureSort;
  cursor?: string;
}

export interface IndexedLiteratureViewItem {
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

export interface IndexedLiteratureViewPage {
  catalogId: string;
  matched: number;
  count: number;
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  sort: IndexedLiteratureSort;
  items: IndexedLiteratureViewItem[];
}

const HASH64 = /^[a-f0-9]{64}$/;
const DOI = /^10\.\d{4,9}\/\S+$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDoi(value: unknown): string {
  if (typeof value !== 'string') return '';
  const doi = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return DOI.test(doi) ? doi : '';
}

function nullableDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' && DATE.test(value) ? value : null;
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(item => typeof item === 'string' ? item : null);
  return items.every(item => item !== null) ? items as string[] : null;
}

function validateItem(value: unknown): IndexedLiteratureViewItem {
  if (!value || typeof value !== 'object') throw new Error('literature_index_item_invalid');
  const row = value as Record<string, unknown>;
  const doi = normalizeDoi(row.doi);
  const revision = typeof row.revision === 'string' ? row.revision.toLowerCase() : '';
  const authors = stringList(row.authors);
  const firstOnlineDate = nullableDate(row.firstOnlineDate);
  const addedDate = nullableDate(row.addedDate);
  const datePrecision = row.datePrecision === 'day' || row.datePrecision === 'unknown'
    ? row.datePrecision
    : null;
  const synthesisType = row.synthesisType === null || row.synthesisType === undefined
    ? null
    : ['methodology', 'total', 'formal'].includes(String(row.synthesisType))
      ? row.synthesisType as 'methodology' | 'total' | 'formal'
      : undefined;
  if (!doi || !HASH64.test(revision) || !authors || !datePrecision || synthesisType === undefined) {
    throw new Error('literature_index_item_invalid');
  }
  if ((row.firstOnlineDate !== null && row.firstOnlineDate !== undefined && !firstOnlineDate)
    || (row.addedDate !== null && row.addedDate !== undefined && !addedDate)) {
    throw new Error('literature_index_item_date_invalid');
  }
  return {
    doi,
    revision,
    title: typeof row.title === 'string' ? row.title : '',
    titleZh: typeof row.titleZh === 'string' ? row.titleZh : '',
    authors,
    journal: typeof row.journal === 'string' ? row.journal : '',
    firstOnlineDate,
    datePrecision,
    addedDate,
    synthesisType,
  };
}

function validCatalogId(value: string): boolean {
  return HASH64.test(value.toLowerCase());
}

export function indexedLiteratureViewScopeKey(request: IndexedLiteratureViewRequest): string {
  return JSON.stringify({
    catalogId: request.catalogId.toLowerCase(),
    query: String(request.query || '').trim(),
    selectedJournals: [...(request.selectedJournals || [])].sort(),
    excludedJournals: [...(request.excludedJournals || [])].sort(),
    dateFrom: request.dateFrom || '',
    dateTo: request.dateTo || '',
    addedDate: request.addedDate || '',
    sort: request.sort,
  });
}

export async function fetchIndexedLiteratureView(
  request: IndexedLiteratureViewRequest,
): Promise<IndexedLiteratureViewPage> {
  const catalogId = request.catalogId.toLowerCase();
  if (!validCatalogId(catalogId)) throw new Error('literature_index_catalog_id_invalid');
  const response = await api.post('/api/literature/catalog-view', {
    catalogId,
    query: String(request.query || ''),
    selectedJournals: [...(request.selectedJournals || [])],
    excludedJournals: [...(request.excludedJournals || [])],
    dateFrom: request.dateFrom || '',
    dateTo: request.dateTo || '',
    addedDate: request.addedDate || '',
    sort: request.sort,
    limit: RESULT_WINDOW_SIZE,
    ...(request.cursor ? { cursor: request.cursor } : {}),
  });
  const body = response.data as Record<string, unknown>;
  if (body.readPathActive !== true) throw new Error('literature_index_read_not_active');
  if (body.catalogId !== catalogId) throw new Error('literature_index_generation_mismatch');
  if (body.sort !== request.sort) throw new Error('literature_index_sort_mismatch');
  const matched = Number(body.matched);
  const count = Number(body.count);
  const limit = Number(body.limit);
  if (!Number.isSafeInteger(matched) || matched < 0
    || !Number.isSafeInteger(count) || count < 0
    || !Number.isSafeInteger(limit) || limit < 1 || limit > RESULT_WINDOW_SIZE) {
    throw new Error('literature_index_window_invalid');
  }
  if (!Array.isArray(body.items) || body.items.length !== count || count > limit || matched < count) {
    throw new Error('literature_index_count_mismatch');
  }
  const items = body.items.map(validateItem);
  if (new Set(items.map(item => item.doi)).size !== items.length) {
    throw new Error('literature_index_duplicate_doi');
  }
  const hasMore = body.hasMore === true;
  const nextCursor = typeof body.nextCursor === 'string' && body.nextCursor ? body.nextCursor : null;
  if (hasMore !== Boolean(nextCursor)) throw new Error('literature_index_cursor_mismatch');
  if (matched === 0 && (count !== 0 || hasMore)) throw new Error('literature_index_empty_mismatch');
  return {
    catalogId,
    matched,
    count,
    limit,
    hasMore,
    nextCursor,
    sort: request.sort,
    items,
  };
}

export function indexedReadDefinitelyDisabled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /literature_catalog_index_read_disabled|literature_index_read_not_active/.test(message);
}
