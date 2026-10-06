import { CatalogReader } from './reader.mjs';
import { resolveDoisPlan, globalSearchPlan } from './frontend-plan.mjs';
import { normalizeDoi } from '../shared/literature-identity.mjs';
import { classifyDate } from '../shared/literature-lifecycle.mjs';

const RELEASE_SCHEMA = 'gallery-architecture-public-v1';
const MEMBERSHIP_SCHEMA = 'gallery-published-membership-v1';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const STATIC_ARCHIVE_MAX_RESULTS = 1000;
const STATIC_ARCHIVE_MAX_SEGMENTS = 36;

async function digest(bytes) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function sameSet(a, b) {
  return a.length === b.length && new Set(a).size === a.length && new Set(b).size === b.length
    && a.every(value => b.includes(value));
}
function ensurePath(pathname) {
  assert(typeof pathname === 'string' && /^[A-Za-z0-9_./-]+$/.test(pathname)
    && !pathname.startsWith('/') && !pathname.split('/').includes('..'), 'unsafe_architecture_path');
  return pathname;
}
function serverBeijingDate(headers) {
  const raw = headers.get('date') || '';
  const epoch = Date.parse(raw);
  assert(Number.isFinite(epoch), 'architecture_server_date_missing');
  return new Date(epoch + 8 * 3600000).toISOString().slice(0, 10);
}
async function responseBytes(response, maxBytes, label) {
  assert(response.ok, `${label}_http_${response.status}`);
  if (response.url) {
    const url = new URL(response.url);
    assert(url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1', `${label}_insecure_transport`);
  }
  const length = Number(response.headers.get('content-length') || 0);
  if (length) assert(length <= maxBytes, `${label}_over_budget`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert(bytes.byteLength > 0 && bytes.byteLength <= maxBytes, `${label}_over_budget`);
  return bytes;
}
function parseJson(bytes, label) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error(`${label}_invalid_json`); }
}
function recordPapers(records) {
  const seen = new Set(), out = [];
  for (const row of records || []) {
    const doi = normalizeDoi(row?.doi || row?.paper?.doi || row?.paper?.url);
    if (!doi || !row?.paper || seen.has(doi)) continue;
    seen.add(doi); out.push(structuredClone(row.paper));
  }
  return out;
}

export async function loadPublishedHotFallback(siteBase, { fetcher = globalThis.fetch, signal } = {}) {
  const site = new URL(siteBase);
  const architectureBase = new URL('architecture-v1/', site);
  const fetchBytes = async (url, { cache = 'no-store', maxBytes = 4 * 1024 * 1024, label = 'architecture_fallback' } = {}) => {
    const response = await fetcher(url, { cache, credentials:'omit', signal });
    return { response, bytes: await responseBytes(response, maxBytes, label) };
  };

  const deliveryUrl = new URL('release-delivery.json', site);
  const releaseUrl = new URL('release.json', architectureBase);
  const [first, releaseRead] = await Promise.all([
    fetchBytes(deliveryUrl, { maxBytes:2 * 1024 * 1024, label:'delivery' }),
    fetchBytes(releaseUrl, { maxBytes:2 * 1024 * 1024, label:'architecture_release' }),
  ]);
  const firstText = new TextDecoder().decode(first.bytes);
  const delivery = parseJson(first.bytes, 'delivery');
  const asOfDate = serverBeijingDate(first.response.headers);
  assert(delivery?.schemaVersion >= 2 && isSha(delivery.sourceCommit), 'delivery_v2_required');
  assert(Array.isArray(delivery.dois) && delivery.productionCards === delivery.dois.length, 'delivery_membership_invalid');
  assert(isHash(delivery.datasetSha256) && isHash(delivery.architectureCatalogId), 'delivery_architecture_identity_missing');
  assert(delivery.files && isHash(delivery.files['architecture-v1/release.json']), 'delivery_architecture_release_missing');
  assert(delivery.architectureObjects && typeof delivery.architectureObjects === 'object', 'delivery_architecture_objects_missing');
  assert(await digest(releaseRead.bytes) === delivery.files['architecture-v1/release.json'], 'architecture_release_hash_mismatch');
  const release = parseJson(releaseRead.bytes, 'architecture_release');
  assert(release?.schema === RELEASE_SCHEMA && release.frontendReadActivation === true, 'frontend_architecture_not_active');
  assert(release.productionActivation === false, 'frontend_activation_scope_invalid');
  assert(release.sourceCommit === delivery.sourceCommit && release.publicationSlot === delivery.publicationSlot
    && release.datasetSha256 === delivery.datasetSha256 && release.recordCount === delivery.productionCards
    && release.catalogId === delivery.architectureCatalogId, 'architecture_release_generation_mismatch');

  const fallbackRef = release.hotFallback;
  assert(fallbackRef && isHash(fallbackRef.sha256) && Number.isSafeInteger(fallbackRef.bytes) && fallbackRef.bytes > 0,
    'architecture_hot_fallback_missing');
  const fallbackPath = ensurePath(fallbackRef.path);
  assert(delivery.architectureObjects['architecture-v1/' + fallbackPath] === fallbackRef.sha256,
    'architecture_hot_fallback_unbound');
  assert(Array.isArray(release.objects) && release.objects.some(ref => ref?.path === fallbackPath && ref?.sha256 === fallbackRef.sha256),
    'architecture_hot_fallback_not_in_release');

  const fallbackRead = await fetchBytes(new URL(fallbackPath, architectureBase), {
    cache:'default', maxBytes:Math.min(4 * 1024 * 1024, fallbackRef.bytes), label:'architecture_hot_fallback',
  });
  assert(fallbackRead.bytes.byteLength === fallbackRef.bytes && await digest(fallbackRead.bytes) === fallbackRef.sha256,
    'architecture_hot_fallback_hash_mismatch');
  const fallback = parseJson(fallbackRead.bytes, 'architecture_hot_fallback');
  assert(fallback?.schema === 'gallery-hot-fallback-v1' && fallback.catalogId === release.catalogId
    && fallback.doiSetHash === release.doiSetHash && fallback.publicationSlot === release.publicationSlot
    && fallback.sourceCommit === release.sourceCommit && fallback.scope === 'hot-plus-future-candidates'
    && typeof fallback.generatedAsOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fallback.generatedAsOfDate)
    && Array.isArray(fallback.records) && fallback.count === fallback.records.length
    && fallback.count <= delivery.productionCards, 'architecture_hot_fallback_generation_mismatch');

  const deliveryDois = new Set(delivery.dois.map(value => normalizeDoi(value)).filter(Boolean));
  const seen = new Set();
  const hotRecords = [];
  for (const row of fallback.records) {
    const doi = normalizeDoi(row?.doi || row?.paper?.doi || row?.paper?.url);
    assert(doi && deliveryDois.has(doi) && row?.paper && isHash(row?.revision) && !seen.has(doi),
      'architecture_hot_fallback_record_invalid');
    seen.add(doi);
    if (classifyDate(row.firstOnlineDate, asOfDate, row.datePrecision) === 'hot') hotRecords.push(row);
  }

  const second = await fetchBytes(deliveryUrl, { maxBytes:2 * 1024 * 1024, label:'delivery_recheck' });
  assert(new TextDecoder().decode(second.bytes) === firstText, 'delivery_changed_during_architecture_fallback');
  return {
    mode:'architecture-hot-fallback',
    asOfDate,
    publicationSlot:release.publicationSlot,
    sourceCommit:release.sourceCommit,
    catalogId:release.catalogId,
    papers:recordPapers(hotRecords),
  };
}

export class PublishedCatalogClient {
  constructor(siteBase, { fetcher = globalThis.fetch } = {}) {
    this.siteBase = new URL(siteBase);
    this.architectureBase = new URL('architecture-v1/', this.siteBase);
    this.fetcher = fetcher;
    this.reader = null;
    this.delivery = null;
    this.release = null;
    this.membership = null;
    this.asOfDate = '';
    this.memberDois = [];
    this.earliestDate = '';
    this.catalogId = '';
    this.hotRecords = null;
  }

  async fetchBytes(url, { cache = 'no-store', maxBytes = 4 * 1024 * 1024, label = 'architecture' } = {}, signal) {
    const response = await this.fetcher(url, { cache, credentials: 'omit', signal });
    return { response, bytes: await responseBytes(response, maxBytes, label) };
  }

  async readRef(ref, signal) {
    assert(ref && typeof ref === 'object' && isHash(ref.sha256) && Number.isSafeInteger(ref.bytes) && ref.bytes > 0, 'architecture_ref_invalid');
    const pathname = ensurePath(ref.path);
    const { bytes } = await this.fetchBytes(new URL(pathname, this.architectureBase), {
      cache: 'default', maxBytes: Math.min(4 * 1024 * 1024, ref.bytes), label: 'architecture_object',
    }, signal);
    assert(bytes.byteLength === ref.bytes, `architecture_object_size_mismatch:${pathname}`);
    assert(await digest(bytes) === ref.sha256, `architecture_object_hash_mismatch:${pathname}`);
    return parseJson(bytes, 'architecture_object');
  }

  async open(signal) {
    const deliveryUrl = new URL('release-delivery.json', this.siteBase);
    const releaseUrl = new URL('release.json', this.architectureBase);
    const [first, releaseRead] = await Promise.all([
      this.fetchBytes(deliveryUrl, { maxBytes: 2 * 1024 * 1024, label: 'delivery' }, signal),
      this.fetchBytes(releaseUrl, { maxBytes: 2 * 1024 * 1024, label: 'architecture_release' }, signal),
    ]);
    const firstText = new TextDecoder().decode(first.bytes);
    const delivery = parseJson(first.bytes, 'delivery');
    const asOfDate = serverBeijingDate(first.response.headers);
    assert(delivery?.schemaVersion >= 2 && isSha(delivery.sourceCommit), 'delivery_v2_required');
    assert(Array.isArray(delivery.dois) && delivery.productionCards === delivery.dois.length, 'delivery_membership_invalid');
    assert(isHash(delivery.datasetSha256) && isHash(delivery.architectureCatalogId), 'delivery_architecture_identity_missing');
    assert(delivery.files && isHash(delivery.files['architecture-v1/release.json']), 'delivery_architecture_release_missing');
    assert(delivery.architectureObjects && typeof delivery.architectureObjects === 'object', 'delivery_architecture_objects_missing');
    assert(await digest(releaseRead.bytes) === delivery.files['architecture-v1/release.json'], 'architecture_release_hash_mismatch');
    const release = parseJson(releaseRead.bytes, 'architecture_release');
    assert(release?.schema === RELEASE_SCHEMA && release.frontendReadActivation === true, 'frontend_architecture_not_active');
    assert(release.productionActivation === false, 'frontend_activation_scope_invalid');
    assert(release.sourceCommit === delivery.sourceCommit && release.publicationSlot === delivery.publicationSlot
      && release.datasetSha256 === delivery.datasetSha256 && release.recordCount === delivery.productionCards
      && release.catalogId === delivery.architectureCatalogId, 'architecture_release_generation_mismatch');
    assert(Array.isArray(release.objects) && release.objects.length > 0, 'architecture_release_objects_missing');

    for (const ref of release.objects) {
      assert(ref && isHash(ref.sha256) && Number.isSafeInteger(ref.bytes) && ref.bytes > 0, 'architecture_release_object_invalid');
      const key = 'architecture-v1/' + ensurePath(ref.path);
      assert(delivery.architectureObjects[key] === ref.sha256, `architecture_delivery_object_mismatch:${ref.path}`);
    }
    for (const ref of [release.catalogCurrent, release.membership]) {
      const key = 'architecture-v1/' + ensurePath(ref.path);
      assert(delivery.architectureObjects[key] === ref.sha256, `architecture_required_object_unbound:${ref.path}`);
    }

    const fallbackRef = release.hotFallback;
    assert(fallbackRef && isHash(fallbackRef.sha256) && Number.isSafeInteger(fallbackRef.bytes) && fallbackRef.bytes > 0,
      'architecture_hot_fallback_missing');
    const fallbackPath = ensurePath(fallbackRef.path);
    assert(delivery.architectureObjects['architecture-v1/' + fallbackPath] === fallbackRef.sha256,
      'architecture_hot_fallback_unbound');
    assert(release.objects.some(ref => ref?.path === fallbackPath && ref?.sha256 === fallbackRef.sha256),
      'architecture_hot_fallback_not_in_release');

    const reader = new CatalogReader(this.architectureBase, { fetcher: this.fetcher, currentRef: release.catalogCurrent });
    const [membership, catalog, hotFallback] = await Promise.all([
      this.readRef(release.membership, signal),
      reader.open(signal),
      this.readRef(fallbackRef, signal),
    ]);

    assert(membership?.schema === MEMBERSHIP_SCHEMA && membership.scope === 'all-time' && membership.complete === true,
      'published_membership_invalid');
    const members = Object.keys(membership.members || {}).map(normalizeDoi);
    assert(members.every(Boolean) && membership.count === members.length && new Set(members).size === members.length,
      'published_membership_count_mismatch');
    const memberDois = members.map(String).sort();
    const deliveryDois = delivery.dois.map(value => normalizeDoi(value)).filter(Boolean).map(String).sort();
    assert(sameSet(memberDois, deliveryDois), 'published_membership_delivery_mismatch');
    assert(membership.catalogId === release.catalogId && membership.doiSetHash === release.doiSetHash
      && membership.publicationSlot === release.publicationSlot && membership.sourceCommit === release.sourceCommit
      && membership.markerBlobSha === release.markerBlobSha, 'published_membership_generation_mismatch');

    assert(catalog.recordCount === membership.count && catalog.recordSetHash === membership.catalogId
      && catalog.doiSetHash === membership.doiSetHash, 'catalog_membership_mismatch');

    assert(hotFallback?.schema === 'gallery-hot-fallback-v1' && hotFallback.catalogId === release.catalogId
      && hotFallback.doiSetHash === release.doiSetHash && hotFallback.publicationSlot === release.publicationSlot
      && hotFallback.sourceCommit === release.sourceCommit && hotFallback.scope === 'hot-plus-future-candidates'
      && typeof hotFallback.generatedAsOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(hotFallback.generatedAsOfDate)
      && Array.isArray(hotFallback.records) && hotFallback.count === hotFallback.records.length
      && hotFallback.count <= delivery.productionCards, 'architecture_hot_fallback_generation_mismatch');

    const deliveryDoiSet = new Set(deliveryDois);
    const hotSeen = new Set();
    const hotRecords = [];
    for (const row of hotFallback.records) {
      const doi = normalizeDoi(row?.doi || row?.paper?.doi || row?.paper?.url);
      assert(doi && deliveryDoiSet.has(doi) && row?.paper && isHash(row?.revision) && !hotSeen.has(doi),
        'architecture_hot_fallback_record_invalid');
      assert(membership.members?.[doi] === row.revision, 'architecture_hot_fallback_revision_mismatch');
      hotSeen.add(doi);
      if (classifyDate(row.firstOnlineDate, asOfDate, row.datePrecision) === 'hot') hotRecords.push(row);
    }

    const months = catalog.shards.map(row => row.month).filter(month => /^\d{4}-\d{2}$/.test(month)).sort();
    this.earliestDate = months.length ? `${months[0]}-01` : '';
    this.asOfDate = asOfDate;
    this.reader = reader;
    this.delivery = delivery;
    this.release = release;
    this.membership = membership;
    this.memberDois = memberDois;
    this.catalogId = release.catalogId;
    this.hotRecords = hotRecords;

    const second = await this.fetchBytes(deliveryUrl, { maxBytes: 2 * 1024 * 1024, label: 'delivery_recheck' }, signal);
    assert(new TextDecoder().decode(second.bytes) === firstText, 'delivery_changed_during_architecture_open');
    return this;
  }

  requireOpen() { assert(this.reader && this.asOfDate, 'published_catalog_not_open'); return this.reader; }

  async landing(sharedDoi, signal) {
    const reader = this.requireOpen();
    const records = Array.isArray(this.hotRecords)
      ? structuredClone(this.hotRecords)
      : await reader.hot(this.asOfDate, signal);
    assert(Array.isArray(records), 'landing_hot_invalid');
    const doi = normalizeDoi(sharedDoi);
    if (doi && !records.some(row => normalizeDoi(row?.doi) === doi)) {
      const result = await reader.get(doi, this.asOfDate, signal);
      if (result?.status === 'published' && result.record) records.unshift(result.record);
      else if (this.memberDois.includes(doi)) throw new Error('published_membership_catalog_mismatch');
    }
    return recordPapers(records);
  }

  async resolve(dois, signal) {
    const reader = this.requireOpen();
    const plan = await resolveDoisPlan(reader, dois, { asOfDate: this.asOfDate, signal, concurrency: 8 });
    assert(plan.complete === true && plan.unavailable.length === 0 && plan.updateRequired.length === 0, 'doi_resolution_incomplete');
    return recordPapers(plan.records);
  }

  async resolveIndexed(items, signal) {
    const reader = this.requireOpen();
    assert(Array.isArray(items), 'indexed_resolution_items_invalid');
    const expected = items.map(item => {
      const doi = normalizeDoi(item?.doi);
      const revision = typeof item?.revision === 'string' ? item.revision.toLowerCase() : '';
      assert(doi && isHash(revision), 'indexed_resolution_identity_invalid');
      return { doi, revision };
    });
    assert(new Set(expected.map(item => item.doi)).size === expected.length, 'indexed_resolution_duplicate_doi');
    for (const item of expected) {
      assert(this.membership?.members?.[item.doi] === item.revision, `indexed_membership_revision_mismatch:${item.doi}`);
    }
    const plan = await resolveDoisPlan(reader, expected.map(item => item.doi), {
      asOfDate: this.asOfDate,
      signal,
      concurrency: 8,
    });
    assert(plan.complete === true && plan.unavailable.length === 0 && plan.updateRequired.length === 0,
      'indexed_doi_resolution_incomplete');
    const byDoi = new Map(plan.records.map(record => [normalizeDoi(record?.doi), record]));
    const ordered = expected.map(item => {
      const record = byDoi.get(item.doi);
      assert(record && record.revision === item.revision, `indexed_record_revision_mismatch:${item.doi}`);
      return record;
    });
    return recordPapers(ordered);
  }

  async search(query, signal) {
    const reader = this.requireOpen();
    const catalog = await reader.open(signal);
    assert(Array.isArray(catalog.search) && catalog.search.length <= STATIC_ARCHIVE_MAX_SEGMENTS,
      'global_search_fanout_window_required');
    const search = await globalSearchPlan(reader, query, {
      asOfDate: this.asOfDate, limit: STATIC_ARCHIVE_MAX_RESULTS, signal,
    });
    assert(search.definitive === true && search.catalogUpdateRequired !== true, 'global_search_incomplete');
    assert(Number(search.matched || 0) === search.results.length, 'global_search_result_window_required');
    if (!search.results.length) return [];
    return this.resolve(search.results.map(row => row.doi), signal);
  }

  async range(fromDate, toDate, signal) {
    const reader = this.requireOpen();
    const catalog = await reader.open(signal);
    const from = typeof fromDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : '';
    const to = typeof toDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(toDate) ? toDate : this.asOfDate;
    assert(!from || from <= to, 'invalid_date_range');
    const fromMonth = from ? from.slice(0, 7) : '';
    const toMonth = to.slice(0, 7);
    const refs = catalog.search.filter(row => row.month !== 'undated'
      && (!fromMonth || row.month >= fromMonth) && row.month <= toMonth);
    assert(refs.length <= STATIC_ARCHIVE_MAX_SEGMENTS, 'date_range_fanout_window_required');
    const dois = [];
    let matched = 0;
    for (const ref of refs) {
      const segment = await reader.read(ref, signal);
      for (const row of segment.entries || []) {
        if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
        if ((!from || row.date >= from) && row.date <= to) {
          matched += 1;
          if (dois.length < STATIC_ARCHIVE_MAX_RESULTS) dois.push(row.doi);
        }
      }
    }
    assert(matched === dois.length, 'date_range_result_window_required');
    return this.resolve(dois, signal);
  }
}
