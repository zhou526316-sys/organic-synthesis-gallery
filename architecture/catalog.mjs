import { normalizeDoi } from '../shared/literature-identity.mjs';
export { normalizeDoi } from '../shared/literature-identity.mjs';
import { createHash } from 'node:crypto';
import { cutoffFor, classifyDate, acquisitionEligibility, LIFECYCLE_RULE, parseDate } from '../shared/literature-lifecycle.mjs';
export const SCHEMA = 'gallery-shadow-catalog-v1';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const safePaper = paper => {
  assert(paper && typeof paper === 'object' && !Array.isArray(paper), 'invalid_paper');
  const out = JSON.parse(JSON.stringify(paper));
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      assert(!/^(?:cookie|cookies|authorization|password|token|access_token|api_key|sessionToken|fulltext|rawFulltext|evidenceText)$/i.test(key), `private_field_in_public_paper:${key}`);
      inspect(v);
    }
  };
  inspect(out);
  return out;
};
export function buildCatalog(papers, { asOfDate, source, withdrawn = [], grants = [], obligations = {}, maxShardBytes = 262144 } = {}) {
  cutoffFor(asOfDate);
  assert(source && /^[a-f0-9]{40}$/.test(source.commit || '') && /^[a-f0-9]{64}$/.test(source.datasetSha256 || ''), 'source_identity_required');
  assert(Number.isSafeInteger(maxShardBytes) && maxShardBytes >= 1024, 'invalid_shard_budget');
  assert(Array.isArray(papers) && Array.isArray(withdrawn), 'invalid_catalog_input');
  const withdrawnDois = withdrawn.map(value => normalizeDoi(typeof value === 'string' ? value : value.doi));
  assert(withdrawnDois.every(Boolean) && new Set(withdrawnDois).size === withdrawnDois.length, 'invalid_withdrawal_registry');
  const blocked = new Set(withdrawnDois), seen = new Set();
  const records = papers.map(input => {
    const paper = safePaper(input), doi = normalizeDoi(paper.doi || paper.url);
    assert(doi, 'unresolved_identity');
    assert(!seen.has(doi), `duplicate_doi:${doi}`);
    assert(!blocked.has(doi), `withdrawn_doi_in_input:${doi}`);
    seen.add(doi);
    const firstOnlineDate = paper.firstOnlineDate ?? paper.date ?? null;
    const datePrecision = paper.datePrecision ?? (typeof firstOnlineDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(firstOnlineDate) ? 'day' : 'unknown');
    return { doi, firstOnlineDate, datePrecision, addedDate: paper.addedDate ?? null,
      revision: digest(stable(paper)), paper };
  }).sort((a, b) => compare(a.doi, b.doi));
  const files = {}, refs = [], locator = {}, groups = new Map(), search = [];
  const put = (prefix, value) => {
    const text = stable(value) + '\n', sha256 = digest(text), file = `${prefix}.${sha256}.json`;
    files[file] = text;
    return { path: file, sha256, bytes: Buffer.byteLength(text) };
  };
  for (const r of records) {
    const month = parseDate(r.firstOnlineDate) && r.datePrecision === 'day' ? r.firstOnlineDate.slice(0, 7) : 'undated';
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(r);
  }
  for (const [month, rows] of [...groups].sort(([a], [b]) => compare(a, b))) {
    let chunk = [];
    const flush = () => {
      if (!chunk.length) return;
      const ref = put(`shards/${month}`, { schema: SCHEMA, records: chunk });
      refs.push({ ...ref, month, count: chunk.length });
      for (const r of chunk) locator[r.doi] = { shard: ref.path, revision: r.revision, status: 'published' };
      const entries = chunk.map(r => ({ doi: r.doi, title: r.paper.title ?? r.paper.titleEn ?? '', titleZh: r.paper.titleZh ?? '',
        authors: r.paper.authors ?? [], journal: r.paper.journal ?? '', date: r.firstOnlineDate,
        synthesisType: r.paper.synthesisType ?? null, shard: ref.path, revision: r.revision }));
      search.push({ ...put(`search/${month}`, { schema: SCHEMA, entries }), count: entries.length, month });
      chunk = [];
    };
    for (const r of rows) {
      const single = Buffer.byteLength(stable({ schema: SCHEMA, records: [r] }) + '\n');
      assert(single <= maxShardBytes, `single_record_over_budget:${r.doi}`);
      if (chunk.length && Buffer.byteLength(stable({ schema: SCHEMA, records: [...chunk, r] }) + '\n') > maxShardBytes) flush();
      chunk.push(r);
    }
    flush();
  }
  const membership = put('membership/all-time', { schema: SCHEMA, scope: 'all-time', complete: true,
    count: records.length, dois: records.map(r => r.doi), withdrawn: [...blocked].sort() });
  const locatorRefs = {};
  for (let i = 0; i < 16; i++) {
    const bucket = i.toString(16), entries = {};
    for (const [doi, entry] of Object.entries(locator)) if (digest(doi)[0] === bucket) entries[doi] = entry;
    for (const doi of blocked) if (digest(doi)[0] === bucket) entries[doi] = { status: 'withdrawn' };
    locatorRefs[bucket] = put(`locator/${bucket}`, { schema: SCHEMA, entries });
  }
  const catalog = { schema: SCHEMA, source, recordCount: records.length,
    doiSetHash: digest(stable(records.map(r => r.doi))), recordSetHash: digest(stable(records)),
    shards: refs, locator: locatorRefs, membership, search };
  const catalogRef = put('releases/catalog', catalog);
  const partitions = { hot: [], archive: [], date_unknown: [], date_invalid: [], future: [] };
  const active = [], reconcile = [];
  for (const r of records) {
    partitions[classifyDate(r.firstOnlineDate, asOfDate, r.datePrecision)].push(r.doi);
    const permission = acquisitionEligibility(r, asOfDate, grants);
    if (!permission.eligible) continue;
    const layers = obligations[r.doi] || {}, needs = [], unknown = [];
    for (const layer of ['toc', 'figures', 'evidence']) {
      const state = layers[layer] ?? 'unknown';
      assert(['complete', 'missing', 'incomplete', 'unknown', 'not_provided'].includes(state), `invalid_obligation:${r.doi}:${layer}`);
      if (state === 'missing' || state === 'incomplete') needs.push(layer);
      if (state === 'unknown') unknown.push(layer);
    }
    const item = { doi: r.doi, reason: permission.reason, lifecycle: permission.lifecycle, needs, unknown };
    if (needs.length) active.push(item);
    if (unknown.length) reconcile.push(item);
  }
  const lifecycle = put('lifecycle/snapshot', { schema: SCHEMA, ruleVersion: LIFECYCLE_RULE, asOfDate, cutoff: cutoffFor(asOfDate),
    catalog: catalogRef.path, partitions, counts: Object.fromEntries(Object.entries(partitions).map(([k, v]) => [k, v.length])) });
  const work = put('work/preview', { schema: SCHEMA, scope: 'active-work-preview', complete: true, dispatchEnabled: false,
    catalog: catalogRef.path, asOfDate, membershipRef: membership.path, acquire: active, reconcile });
  files['current.json'] = stable({ schema: SCHEMA, mode: 'shadow', productionActivation: false, catalog: catalogRef, lifecycle, work }) + '\n';
  return { files, catalog, partitions, records };
}
export function verifyCatalog(files, expectedPapers) {
  const read = path => {
    assert(Object.hasOwn(files, path), `missing_reference:${path}`);
    const match = path.match(/\.([a-f0-9]{64})\.json$/);
    if (match) assert(digest(files[path]) === match[1], `hash_mismatch:${path}`);
    return JSON.parse(files[path]);
  };
  const pointer = read('current.json');
  assert(pointer.productionActivation === false && pointer.mode === 'shadow', 'unexpected_activation');
  const catalog = read(pointer.catalog.path), membership = read(catalog.membership.path), life = read(pointer.lifecycle.path), work = read(pointer.work.path);
  assert(life.catalog === pointer.catalog.path && work.catalog === pointer.catalog.path, 'mixed_generation');
  assert(work.dispatchEnabled === false && work.scope === 'active-work-preview', 'unexpected_dispatch');
  const records = catalog.shards.flatMap(ref => {
    assert(Buffer.byteLength(files[ref.path]) === ref.bytes, 'shard_byte_mismatch');
    const rows = read(ref.path).records;
    assert(rows.length === ref.count, 'shard_count_mismatch');
    return rows;
  }).sort((a, b) => compare(a.doi, b.doi));
  const dois = records.map(r => r.doi);
  assert(new Set(dois).size === dois.length && records.length === catalog.recordCount, 'record_set_mismatch');
  assert(digest(stable(records)) === catalog.recordSetHash && digest(stable(dois)) === catalog.doiSetHash, 'catalog_digest_mismatch');
  assert(membership.scope === 'all-time' && membership.complete === true && stable(membership.dois) === stable(dois), 'membership_mismatch');
  const locations = {};
  for (const ref of Object.values(catalog.locator)) Object.assign(locations, read(ref.path).entries);
  for (const r of records) {
    const location = locations[r.doi];
    assert(location?.status === 'published' && location.revision === r.revision, `locator_mismatch:${r.doi}`);
    const found = read(location.shard).records.find(v => v.doi === r.doi);
    assert(found && stable(found) === stable(r) && digest(stable(r.paper)) === r.revision, `record_revision_mismatch:${r.doi}`);
    assert(life.partitions[classifyDate(r.firstOnlineDate, life.asOfDate, r.datePrecision)].includes(r.doi), `lifecycle_mismatch:${r.doi}`);
  }
  assert(stable(Object.values(life.partitions).flat().sort()) === stable(dois), 'lifecycle_partition_mismatch');
  const search = catalog.search.flatMap(ref => read(ref.path).entries);
  assert(stable(search.map(r => r.doi).sort()) === stable(dois), 'search_set_mismatch');
  for (const row of search) assert(row.shard === locations[row.doi].shard && row.revision === locations[row.doi].revision, 'search_locator_mismatch');
  assert(work.acquire.every(row => membership.dois.includes(row.doi)), 'active_not_member');
  assert(!work.acquire.some(row => membership.withdrawn.includes(row.doi)), 'withdrawn_active');
  if (expectedPapers) {
    const expected = new Map(expectedPapers.map(p => [normalizeDoi(p.doi || p.url), p]));
    assert(expected.size === records.length && expectedPapers.length === records.length, 'roundtrip_count_mismatch');
    for (const r of records) assert(stable(expected.get(r.doi)) === stable(r.paper), `field_loss:${r.doi}`);
  }
  return { ok: true, records: records.length, shards: catalog.shards.length, files: Object.keys(files).length,
    lifecycle: life.counts, acquire: work.acquire.length, reconcile: work.reconcile.length,
    totalBytes: Object.values(files).reduce((n, s) => n + Buffer.byteLength(s), 0),
    largestShardBytes: Math.max(0, ...catalog.shards.map(s => s.bytes)) };
}
/** Never infer withdrawal from an Active Work or DOM subset. */
export function membershipStatus(registry, doiValue) {
  const doi = normalizeDoi(doiValue);
  if (!doi || registry?.scope !== 'all-time' || registry.complete !== true
      || !Array.isArray(registry.dois) || !Array.isArray(registry.withdrawn)
      || registry.count !== registry.dois.length || new Set(registry.dois).size !== registry.dois.length) return 'unknown';
  if (registry.withdrawn.includes(doi)) return 'withdrawn';
  return registry.dois.includes(doi) ? 'present' : 'absent';
}
