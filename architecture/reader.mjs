import { normalizeDoi } from '../shared/literature-identity.mjs';
import { cutoffFor, classifyDate } from '../shared/literature-lifecycle.mjs';
import { isHotLandingEligible } from '../shared/literature-landing.mjs';
const SCHEMA = 'gallery-shadow-catalog-v1';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
async function hash(bytes) {
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buffer)].map(v => v.toString(16).padStart(2, '0')).join('');
}
/** Opt-in read-only adapter. Not imported by the production frontend in phase A. */
export class CatalogReader {
  constructor(baseUrl, { fetcher = globalThis.fetch, cacheEntries = 12, maxObjectBytes = 4194304, currentRef = 'current.json' } = {}) {
    this.base = new URL(baseUrl);
    assert(this.base.pathname.endsWith('/'), 'catalog_base_requires_trailing_slash');
    assert(Number.isSafeInteger(cacheEntries) && cacheEntries > 0, 'invalid_cache_limit');
    this.fetcher = fetcher; this.cacheEntries = cacheEntries; this.maxObjectBytes = maxObjectBytes; this.currentRef = currentRef;
    this.cache = new Map(); this.catalog = null;
  }
  async read(ref, signal) {
    const pathname = typeof ref === 'string' ? ref : ref.path;
    assert(typeof pathname === 'string' && /^[a-zA-Z0-9/_\.\-]+$/.test(pathname) && !pathname.startsWith('/') && !pathname.includes('..'), 'unsafe_catalog_path');
    if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
    if (this.cache.has(pathname)) {
      const cached = this.cache.get(pathname); this.cache.delete(pathname); this.cache.set(pathname, cached); return cached;
    }
    const url = new URL(pathname, this.base);
    const response = await this.fetcher(url, { cache: pathname === 'current.json' ? 'no-cache' : 'default', signal, credentials: 'omit' });
    assert(response.ok, `catalog_http_${response.status}:${pathname}`);
    const limit = typeof ref === 'object' ? Math.min(ref.bytes, this.maxObjectBytes) : this.maxObjectBytes;
    assert(Number.isSafeInteger(limit) && limit > 0, 'invalid_object_size');
    const chunks = [], reader = response.body.getReader(); let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new Error(`catalog_object_over_budget:${pathname}`); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (typeof ref === 'object') {
      assert(size === ref.bytes && await hash(bytes) === ref.sha256, `catalog_hash_mismatch:${pathname}`);
    }
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    assert(parsed.schema === SCHEMA, 'unsupported_catalog_schema');
    this.cache.set(pathname, parsed);
    while (this.cache.size > this.cacheEntries) this.cache.delete(this.cache.keys().next().value);
    return parsed;
  }
  async open(signal) {
    if (this.catalog) return this.catalog;
    const root = await this.read(this.currentRef, signal);
    assert(root.mode === 'shadow' && root.productionActivation === false, 'unsupported_catalog_mode');
    const catalog = await this.read(root.catalog, signal);
    this.catalog = catalog; this.root = root;
    return catalog;
  }
  async get(doiValue, asOfDate, signal) {
    const doi = normalizeDoi(doiValue);
    assert(doi, 'invalid_doi');
    cutoffFor(asOfDate);
    const c = await this.open(signal), bucket = (await hash(new TextEncoder().encode(doi)))[0];
    const location = (await this.read(c.locator[bucket], signal)).entries[doi];
    if (!location) return { status: 'absent', doi };
    if (location.status === 'withdrawn') return { status: 'withdrawn', doi };
    const ref = c.shards.find(v => v.path === location.shard);
    assert(ref, 'locator_points_outside_generation');
    const row = (await this.read(ref, signal)).records.find(r => r.doi === doi);
    assert(row && row.revision === location.revision, 'locator_record_mismatch');
    return { status: 'published', lifecycle: classifyDate(row.firstOnlineDate, asOfDate, row.datePrecision), record: structuredClone(row) };
  }
  async hot(asOfDate, signal) {
    const cutoff = cutoffFor(asOfDate), c = await this.open(signal), result = [];
    const cutoffMonth = cutoff.slice(0, 7), currentMonth = asOfDate.slice(0, 7);
    // The all-time catalog retains date-unknown records in an 'undated' shard.
    // Recently admitted reviewed papers from that shard (or future issue-dated
    // shards) must stay visible on the Hot landing without inventing online dates.
    for (const ref of c.shards.filter(v =>
      (v.month >= cutoffMonth && v.month <= currentMonth)
      || v.month === 'undated' || v.month > currentMonth)) {
      const rows = (await this.read(ref, signal)).records;
      result.push(...rows.filter(row => isHotLandingEligible(row, asOfDate)));
    }
    return structuredClone(result);
  }
  async search(query, { asOfDate, scope = 'all', limit = 100, signal, onProgress } = {}) {
    assert(typeof query === 'string' && query.trim(), 'empty_search');
    assert(['all', 'hot'].includes(scope) && Number.isSafeInteger(limit) && limit > 0 && limit <= 1000, 'invalid_search_options');
    cutoffFor(asOfDate);
    const c = await this.open(signal), needle = query.trim().toLowerCase(), results = [], failures = [];
    const segments = c.search.filter(v => scope === 'all' || (v.month >= cutoffFor(asOfDate).slice(0, 7) && v.month <= asOfDate.slice(0, 7)));
    let scanned = 0, matched = 0;
    for (const ref of segments) {
      if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
      try {
        const rows = (await this.read(ref, signal)).entries;
        for (const row of rows) {
          if (scope === 'hot' && classifyDate(row.date, asOfDate) !== 'hot') continue;
          if ([row.doi, row.title, row.titleZh, ...(row.authors || []), row.journal, row.date,
            row.synthesisType, row.abstract || '', ...(row.searchTerms || [])].join(' ').toLowerCase().includes(needle)) {
            matched++; if (results.length < limit) results.push(row);
          }
        }
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') throw error;
        failures.push({ path: ref.path, error: error.message });
      }
      scanned++;
      onProgress?.({ scanned, total: segments.length, complete: scanned === segments.length && failures.length === 0 });
    }
    return { results: structuredClone(results), matched, complete: failures.length === 0, failures, scanned, total: segments.length };
  }
}
