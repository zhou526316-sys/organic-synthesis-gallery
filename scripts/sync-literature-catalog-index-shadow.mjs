import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { stable, digest } from '../architecture/catalog.mjs';
import { normalizeDoi } from '../shared/literature-identity.mjs';

const SITE = new URL(process.env.SITE_URL || 'https://gallery.gczhouwld.com/');
const WORKER = new URL(process.env.WORKER_URL || 'https://organic-synthesis-gallery.zhou526316.workers.dev/');
const IMPORT_BATCH_SIZE = 8;
const TOKEN = String(process.env.BRIDGE_WRITE_TOKEN || '').trim();
const REPORT = process.env.LITERATURE_INDEX_SHADOW_REPORT || '/tmp/literature-catalog-index-shadow-report.json';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const safePath = value => typeof value === 'string' && /^[A-Za-z0-9_./-]+$/.test(value)
  && !value.startsWith('/') && !value.split('/').includes('..');
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const jsonText = value => JSON.stringify(value, null, 2) + '\n';
const TRANSIENT_API_STATUS = new Set([429,500,502,503,504]);
const RETRY_DELAYS_MS = [300,900,1800];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchBytes(url, { maxBytes = 8 * 1024 * 1024 } = {}) {
  const target = new URL(url);
  target.searchParams.set('literature-index-shadow', String(Date.now()));
  const response = await fetch(target, {
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}:${target.pathname}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length <= maxBytes, `response_over_budget:${target.pathname}`);
  return bytes;
}
async function fetchJson(url, options) {
  const bytes = await fetchBytes(url, options);
  try { return { bytes, body: JSON.parse(bytes.toString('utf8')) }; }
  catch { throw new Error(`invalid_json:${new URL(url).pathname}`); }
}
async function api(path, { method = 'GET', body, allowError = false, retryTransient = true } = {}) {
  assert(TOKEN, 'BRIDGE_WRITE_TOKEN_required');
  const attempts = retryTransient ? RETRY_DELAYS_MS.length + 1 : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(new URL(path, WORKER), {
        method,
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'cache-control': 'no-cache',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30000),
      });
      const text = await response.text();
      let parsed = {};
      try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text.slice(0, 500) }; }
      if (response.ok || allowError) return { status: response.status, body: parsed, attempt };
      const error = new Error(`${path}:HTTP_${response.status}:${text.slice(0, 500)}`);
      if (!retryTransient || !TRANSIENT_API_STATUS.has(response.status) || attempt === attempts) throw error;
      lastError = error;
    } catch (error) {
      if (!retryTransient || attempt === attempts) throw error;
      lastError = error;
    }
    await sleep(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]);
  }
  throw lastError || new Error(`${path}:retry_exhausted`);
}
function exactRef(ref, objectMap, delivery) {
  assert(ref && safePath(ref.path) && validHash(ref.sha256) && Number.isSafeInteger(ref.bytes) && ref.bytes > 0,
    'invalid_architecture_ref');
  const listed = objectMap.get(ref.path);
  assert(listed && listed.sha256 === ref.sha256 && listed.bytes === ref.bytes, `release_object_ref_mismatch:${ref.path}`);
  assert(delivery.architectureObjects?.[`architecture-v1/${ref.path}`] === ref.sha256,
    `delivery_object_ref_mismatch:${ref.path}`);
}
async function readObject(ref, objectMap, delivery) {
  exactRef(ref, objectMap, delivery);
  const { bytes, body } = await fetchJson(new URL(`architecture-v1/${ref.path}`, SITE), {
    maxBytes: Math.min(8 * 1024 * 1024, Math.max(ref.bytes, 1)),
  });
  assert(bytes.length === ref.bytes && sha256(bytes) === ref.sha256, `architecture_object_hash_mismatch:${ref.path}`);
  return body;
}
function paperProjection(record) {
  const paper = record?.paper || {};
  const authors = Array.isArray(paper.authors) ? paper.authors.map(value => String(value ?? '')) : [];
  const firstOnlineDate = typeof record?.firstOnlineDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.firstOnlineDate)
    ? record.firstOnlineDate : null;
  // Historical acquisitions may happen on the same day as a public release.
  // The D1 indexed "Only new" filter must not infer newness from that timestamp.
  const retrospective = paper.ingestionChannel === 'historical_backfill';
  const julySepLate = firstOnlineDate >= '2026-07-01' && firstOnlineDate <= '2026-09-30'
    && typeof record?.addedDate === 'string' && record.addedDate >= '2026-10-01';
  const addedDate = !retrospective && !julySepLate
    && typeof record?.addedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.addedDate)
      ? record.addedDate : null;
  const synthesisType = ['methodology','total','formal'].includes(String(paper.synthesisType || ''))
    ? String(paper.synthesisType) : null;
  return {
    doi: normalizeDoi(record?.doi),
    revision: String(record?.revision || ''),
    title: String(paper.title ?? paper.titleEn ?? ''),
    titleZh: String(paper.titleZh ?? ''),
    authors,
    journal: String(paper.journal ?? ''),
    firstOnlineDate,
    datePrecision: ['day','unknown'].includes(String(record?.datePrecision || ''))
      ? String(record.datePrecision) : 'unknown',
    addedDate,
    synthesisType,
  };
}
function searchProjection(record) {
  const row = paperProjection(record);
  return {
    doi: row.doi, title: row.title, titleZh: row.titleZh, authors: row.authors,
    journal: row.journal, date: row.firstOnlineDate, synthesisType: row.synthesisType,
    revision: row.revision,
  };
}
function searchable(row) {
  return [row.doi,row.title,row.titleZh,...(row.authors || []),row.journal,row.date,row.synthesisType]
    .join(' ').toLowerCase();
}
function frontendNeedleMatch(row,needle){
  if(!needle) return true;
  return [
    row.title||'',row.titleZh||'',row.doi||'',row.journal||'',
    (row.authors||[]).join(' '),row.firstOnlineDate||row.date||'',
  ].some(value=>String(value).toLowerCase().includes(needle));
}
function normalizeComparable(row) {
  return {
    doi: String(row.doi || ''),
    revision: String(row.revision || ''),
    title: String(row.title || ''),
    titleZh: String(row.titleZh || ''),
    authors: Array.isArray(row.authors) ? row.authors.map(String) : [],
    journal: String(row.journal || ''),
    firstOnlineDate: row.firstOnlineDate || null,
    datePrecision: String(row.datePrecision || 'unknown'),
    addedDate: row.addedDate || null,
    synthesisType: row.synthesisType || null,
  };
}
function probeQueries(searchRows) {
  const queries = new Set(['nickel','photoredox','methodology','JACS','Angew']);
  const positions = [...new Set([0, Math.floor(searchRows.length / 4), Math.floor(searchRows.length / 2),
    Math.floor(searchRows.length * 3 / 4), Math.max(0, searchRows.length - 1)])];
  for (const index of positions) {
    const row = searchRows[index];
    if (!row) continue;
    if ([...row.doi].length >= 3) queries.add(row.doi);
    if (row.date) queries.add(row.date);
    for (const text of [row.title, row.titleZh, ...(row.authors || []), row.journal]) {
      const value = String(text || '').trim();
      if ([...value].length < 3) continue;
      const words = value.split(/\s+/).filter(word => [...word].length >= 4);
      if (words[0]) queries.add(words[0]);
      else queries.add([...value].slice(0, 5).join(''));
    }
  }
  return [...queries].filter(query => [...query.trim()].length >= 3).slice(0, 40);
}
async function collectD1Query(catalogId, query) {
  let cursor = '', matched = null;
  const dois = [];
  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({ catalogId, q: query, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const response = await api(`/api/admin/literature-catalog-index/query?${params}`);
    assert(response.body.readPathActive === false, 'shadow_query_read_path_must_remain_inactive');
    if (matched === null) matched = Number(response.body.matched || 0);
    else assert(matched === Number(response.body.matched || 0), `shadow_query_match_count_changed:${query}`);
    for (const item of response.body.items || []) dois.push(String(item.doi || ''));
    if (!response.body.hasMore) return { matched, dois: [...new Set(dois)].sort() };
    assert(typeof response.body.nextCursor === 'string' && response.body.nextCursor, `shadow_query_cursor_missing:${query}`);
    cursor = response.body.nextCursor;
  }
  throw new Error(`shadow_query_page_limit:${query}`);
}
async function collectD1View(catalogId,view) {
  let cursor='',matched=null;
  const items=[];
  for(let page=0;page<100;page+=1){
    const response=await api('/api/admin/literature-catalog-index/view',{
      method:'POST',body:{catalogId,...view,limit:100,...(cursor?{cursor}:{})},
    });
    assert(response.body.readPathActive===false,'shadow_view_read_path_must_remain_inactive');
    if(matched===null) matched=Number(response.body.matched||0);
    else assert(matched===Number(response.body.matched||0),`shadow_view_match_count_changed:${view.name||'unnamed'}`);
    items.push(...(response.body.items||[]));
    if(!response.body.hasMore) return {matched,items};
    assert(typeof response.body.nextCursor==='string'&&response.body.nextCursor,
      `shadow_view_cursor_missing:${view.name||'unnamed'}`);
    cursor=response.body.nextCursor;
  }
  throw new Error(`shadow_view_page_limit:${view.name||'unnamed'}`);
}
function expectedStaticView(records,searchRows,view){
  const needle=String(view.query||'').trim().toLowerCase();
  const candidateDois=needle
    ? new Set(searchRows.filter(row=>searchable(row).includes(needle)).map(row=>row.doi))
    : null;
  const selected=new Set(view.selectedJournals||[]);
  const excluded=new Set(view.excludedJournals||[]);
  const projected=records.map(paperProjection).filter(row=>{
    if(candidateDois&&!candidateDois.has(row.doi)) return false;
    if(excluded.has(row.journal)) return false;
    if(selected.size&&!selected.has(row.journal)) return false;
    if(view.dateFrom&&String(row.firstOnlineDate||'')<view.dateFrom) return false;
    if(view.dateTo&&String(row.firstOnlineDate||'')>view.dateTo) return false;
    if(view.addedDate&&row.addedDate!==view.addedDate) return false;
    return frontendNeedleMatch(row,needle);
  });
  projected.sort((a,b)=>{
    const cmp=String(a.firstOnlineDate||'').localeCompare(String(b.firstOnlineDate||''));
    if(cmp) return view.sort==='oldest'?cmp:-cmp;
    return a.doi.localeCompare(b.doi);
  });
  return projected;
}
function viewParityScenarios(records,searchRows){
  const projected=records.map(paperProjection);
  const journals=[...new Set(projected.map(row=>row.journal).filter(Boolean))].sort();
  const dates=projected.map(row=>row.firstOnlineDate).filter(Boolean).sort();
  const added=projected.map(row=>row.addedDate).filter(Boolean).sort();
  const q1=dates[Math.floor(dates.length/4)]||'';
  const q3=dates[Math.floor(dates.length*3/4)]||'';
  const latestAdded=added.at(-1)||'';
  const scenarios=[
    {name:'all-newest',sort:'newest'},
    {name:'all-oldest',sort:'oldest'},
    {name:'first-journal',sort:'newest',selectedJournals:journals.slice(0,1)},
    {name:'exclude-first-journal',sort:'newest',excludedJournals:journals.slice(0,1)},
    {name:'include-two-exclude-one',sort:'newest',selectedJournals:journals.slice(0,2),excludedJournals:journals.slice(0,1)},
    {name:'middle-date-range',sort:'oldest',dateFrom:q1,dateTo:q3},
    {name:'latest-added-date',sort:'newest',addedDate:latestAdded},
    {name:'nickel-query',sort:'newest',query:'nickel'},
    {name:'photoredox-query-oldest',sort:'oldest',query:'photoredox'},
    {name:'wang-query',sort:'newest',query:'Wang'},
  ];
  const doiProbe=searchRows.find(row=>row?.doi)?.doi;
  if(doiProbe) scenarios.push({name:'doi-query',sort:'newest',query:doiProbe});
  const chinese=searchRows.map(row=>String(row?.titleZh||'').trim()).find(value=>/[\u3400-\u9fff]/u.test(value)&&[...value].length>=3);
  if(chinese) scenarios.push({name:'chinese-title-query',sort:'newest',query:[...chinese].slice(0,6).join('')});
  if(journals.length&&q1&&q3) scenarios.push({
    name:'journal-and-date',sort:'oldest',selectedJournals:[journals.at(-1)],dateFrom:q1,dateTo:q3,
  });
  return scenarios.filter(view=>!(view.addedDate===''));
}

async function collectD1Rows(catalogId) {
  let afterDoi = '';
  const rows = [];
  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({ catalogId, limit: '200' });
    if (afterDoi) params.set('afterDoi', afterDoi);
    const response = await api(`/api/admin/literature-catalog-index/rows?${params}`);
    assert(response.body.readPathActive === false, 'shadow_rows_read_path_must_remain_inactive');
    rows.push(...(response.body.items || []));
    if (!response.body.hasMore) return rows;
    assert(typeof response.body.nextAfterDoi === 'string' && response.body.nextAfterDoi,
      'shadow_rows_cursor_missing');
    afterDoi = response.body.nextAfterDoi;
  }
  throw new Error('shadow_rows_page_limit');
}

async function main() {
  const report = {
    schemaVersion: 1,
    phase: 'P1-literature-catalog-index-live-shadow',
    ok: false,
    site: SITE.origin,
    worker: WORKER.origin,
    startedAt: new Date().toISOString(),
    readConfigured: null,
    readPathActive: null,
  };
  try {
    const deliveryRead = await fetchJson(new URL('release-delivery.json', SITE), { maxBytes: 4 * 1024 * 1024 });
    const delivery = deliveryRead.body;
    assert(Number(delivery.schemaVersion) >= 2 && validSha(delivery.sourceCommit), 'delivery_v2_required');
    assert(Array.isArray(delivery.dois) && delivery.productionCards === delivery.dois.length, 'delivery_membership_invalid');
    assert(validHash(delivery.datasetSha256) && validHash(delivery.architectureCatalogId), 'delivery_architecture_identity_missing');
    const releaseDigest = delivery.files?.['architecture-v1/release.json'];
    assert(validHash(releaseDigest), 'delivery_release_hash_missing');

    const releaseRead = await fetchJson(new URL('architecture-v1/release.json', SITE), { maxBytes: 4 * 1024 * 1024 });
    assert(sha256(releaseRead.bytes) === releaseDigest, 'release_hash_mismatch');
    const release = releaseRead.body;
    assert(release?.schema === 'gallery-architecture-public-v1' && release.productionActivation === false
      && release.frontendReadActivation === true, 'release_activation_invalid');
    assert(release.sourceCommit === delivery.sourceCommit
      && release.markerBlobSha === delivery.markerBlobSha
      && release.publicationSlot === delivery.publicationSlot
      && release.recordCount === delivery.productionCards
      && release.datasetSha256 === delivery.datasetSha256
      && release.catalogId === delivery.architectureCatalogId, 'release_delivery_generation_mismatch');
    assert(validHash(release.doiSetHash) && Array.isArray(release.objects), 'release_catalog_identity_invalid');

    const objectMap = new Map(release.objects.map(row => [row.path, row]));
    assert(objectMap.size === release.objects.length, 'duplicate_release_object_path');
    const current = await readObject(release.catalogCurrent, objectMap, delivery);
    exactRef(current.catalog, objectMap, delivery);
    const catalog = await readObject(current.catalog, objectMap, delivery);
    assert(catalog.recordSetHash === release.catalogId && catalog.doiSetHash === release.doiSetHash
      && catalog.recordCount === release.recordCount, 'catalog_release_identity_mismatch');
    assert(Array.isArray(catalog.shards) && Array.isArray(catalog.search), 'catalog_segments_missing');

    const shardPayloads = await Promise.all(catalog.shards.map(ref => readObject(ref, objectMap, delivery)));
    const records = shardPayloads.flatMap(payload => payload.records || []).sort((a,b) => String(a.doi).localeCompare(String(b.doi)));
    assert(records.length === release.recordCount, 'record_count_mismatch');
    const dois = records.map(row => normalizeDoi(row.doi));
    assert(dois.every(Boolean) && new Set(dois).size === dois.length, 'record_doi_set_invalid');
    const deliveredDois = delivery.dois.map(normalizeDoi).sort();
    assert(JSON.stringify(deliveredDois) === JSON.stringify(dois), 'delivery_record_doi_set_mismatch');
    assert(digest(stable(records)) === release.catalogId && digest(stable(dois)) === release.doiSetHash,
      'record_content_hash_mismatch');

    const membership = await readObject(release.membership, objectMap, delivery);
    assert(membership?.schema === 'gallery-published-membership-v1' && membership.scope === 'all-time'
      && membership.complete === true && membership.catalogId === release.catalogId
      && membership.doiSetHash === release.doiSetHash && membership.count === records.length,
      'membership_generation_mismatch');
    for (const record of records) {
      assert(membership.members?.[record.doi] === record.revision, `membership_revision_mismatch:${record.doi}`);
      assert(digest(stable(record.paper)) === record.revision, `record_revision_mismatch:${record.doi}`);
    }

    const searchPayloads = await Promise.all(catalog.search.map(ref => readObject(ref, objectMap, delivery)));
    const searchRows = searchPayloads.flatMap(payload => payload.entries || [])
      .sort((a,b) => String(a.doi).localeCompare(String(b.doi)));
    assert(searchRows.length === records.length, 'search_row_count_mismatch');
    const projectedSearch = records.map(searchProjection).sort((a,b) => a.doi.localeCompare(b.doi));
    for (let i = 0; i < searchRows.length; i += 1) {
      const actual = searchRows[i], expected = projectedSearch[i];
      assert(actual.doi === expected.doi && actual.revision === expected.revision
        && actual.title === expected.title && actual.titleZh === expected.titleZh
        && JSON.stringify(actual.authors || []) === JSON.stringify(expected.authors)
        && actual.journal === expected.journal && (actual.date || null) === expected.date
        && (actual.synthesisType || null) === expected.synthesisType,
        `search_projection_mismatch:${expected.doi}`);
    }

    const generation = {
      catalogId: release.catalogId,
      doiSetHash: release.doiSetHash,
      publicationSlot: release.publicationSlot,
      sourceCommit: release.sourceCommit,
      markerBlobSha: release.markerBlobSha,
      recordCount: release.recordCount,
    };
    Object.assign(report, {
      catalogId: generation.catalogId,
      doiSetHash: generation.doiSetHash,
      publicationSlot: generation.publicationSlot,
      sourceCommit: generation.sourceCommit,
      markerBlobSha: generation.markerBlobSha,
      recordCount: generation.recordCount,
      importBatchSize: IMPORT_BATCH_SIZE,
      importProgress: { importedBatches: 0, importedRows: 0, totalRows: generation.recordCount },
    });
    await writeFile(REPORT, jsonText(report));

    const statusBefore = await api('/api/admin/literature-catalog-index/status');
    Object.assign(report, {
      readConfiguredBefore: statusBefore.body.readConfigured,
      readConfigured: statusBefore.body.readConfigured,
      readPathActiveBefore: statusBefore.body.readPathActive,
      readPathActive: statusBefore.body.readPathActive,
    });
    assert(statusBefore.body.enabled === true && typeof statusBefore.body.readConfigured === 'boolean'
      && Array.isArray(statusBefore.body.generations)
      && statusBefore.body.readPathActive === (statusBefore.body.readConfigured
        && statusBefore.body.generations.some(row => row.ready === true)), 'shadow_runtime_configuration_invalid');

    const begin = await api('/api/admin/literature-catalog-index/begin', { method: 'POST', body: generation });
    let importedBatches = 0;
    if (begin.body.ready !== true) {
      const rows = records.map(paperProjection);
      for (let offset = 0; offset < rows.length; offset += IMPORT_BATCH_SIZE) {
        const batch = rows.slice(offset, offset + IMPORT_BATCH_SIZE);
        const imported = await api('/api/admin/literature-catalog-index/import', {
          method: 'POST', body: { generation, rows: batch },
        });
        assert(imported.body.batchRows === batch.length
          && imported.body.writeStatements === batch.length * 3, 'shadow_import_batch_contract_mismatch');
        assert(imported.body.importedRows <= generation.recordCount, 'shadow_import_overflow');
        importedBatches += 1;
        report.importProgress = {
          importedBatches,
          importedRows: Number(imported.body.importedRows || 0),
          totalRows: generation.recordCount,
          lastBatchAttempts: Number(imported.attempt || 1),
        };
        await writeFile(REPORT, jsonText(report));
      }
      const finalized = await api('/api/admin/literature-catalog-index/finalize', {
        method: 'POST', body: { catalogId: generation.catalogId },
      });
      assert(finalized.body.ready === true && finalized.body.indexedRows === generation.recordCount
        && finalized.body.ftsRows === generation.recordCount
        && finalized.body.ftsDistinctDois === generation.recordCount
        && finalized.body.missingFtsRows === 0
        && finalized.body.orphanFtsRows === 0, 'shadow_finalize_incomplete');
    }

    const expectedRows = records.map(paperProjection).map(normalizeComparable)
      .sort((a,b) => a.doi.localeCompare(b.doi));
    const actualRows = (await collectD1Rows(generation.catalogId)).map(normalizeComparable)
      .sort((a,b) => a.doi.localeCompare(b.doi));
    assert(actualRows.length === expectedRows.length, 'shadow_row_parity_count_mismatch');
    for (let i = 0; i < expectedRows.length; i += 1) {
      assert(JSON.stringify(actualRows[i]) === JSON.stringify(expectedRows[i]),
        `shadow_row_parity_mismatch:${expectedRows[i].doi}`);
    }

    const queryParity = [];
    for (const query of probeQueries(searchRows)) {
      const needle = query.trim().toLowerCase();
      const expected = searchRows.filter(row => searchable(row).includes(needle)).map(row => row.doi).sort();
      const actual = await collectD1Query(generation.catalogId, query);
      assert(actual.matched === expected.length, `shadow_query_count_mismatch:${query}`);
      assert(JSON.stringify(actual.dois) === JSON.stringify(expected), `shadow_query_set_mismatch:${query}`);
      queryParity.push({ query, matched: expected.length });
    }
    const viewParity=[];
    for(const scenario of viewParityScenarios(records,searchRows)){
      const expected=expectedStaticView(records,searchRows,scenario);
      const actual=await collectD1View(generation.catalogId,scenario);
      assert(actual.matched===expected.length,`shadow_view_count_mismatch:${scenario.name}`);
      const actualDois=actual.items.map(row=>row.doi);
      const expectedDois=expected.map(row=>row.doi);
      assert(JSON.stringify(actualDois)===JSON.stringify(expectedDois),
        `shadow_view_order_mismatch:${scenario.name}`);
      viewParity.push({name:scenario.name,matched:expected.length});
    }

    const shortProbe = await api(`/api/admin/literature-catalog-index/query?${new URLSearchParams({
      catalogId: generation.catalogId, q: 'Ni', limit: '60',
    })}`, { allowError: true });
    assert(shortProbe.status === 422
      && shortProbe.body.error === 'literature_catalog_short_query_requires_compatibility',
      'short_query_compatibility_missing');
    const shortViewProbe=await api('/api/admin/literature-catalog-index/view',{
      method:'POST',body:{catalogId:generation.catalogId,query:'Ni',sort:'newest'},allowError:true,
    });
    assert(shortViewProbe.status===422
      && shortViewProbe.body.error==='literature_catalog_short_query_requires_compatibility',
      'short_view_query_compatibility_missing');
    const readersProbe=await api('/api/admin/literature-catalog-index/view',{
      method:'POST',body:{catalogId:generation.catalogId,sort:'readers'},allowError:true,
    });
    assert(readersProbe.status===422
      && readersProbe.body.error==='literature_catalog_reader_sort_requires_compatibility',
      'reader_sort_compatibility_missing');

    const statusAfter = await api('/api/admin/literature-catalog-index/status');
    Object.assign(report, {
      readConfigured: statusAfter.body.readConfigured,
      readPathActive: statusAfter.body.readPathActive,
      readConfigurationUnchanged: statusAfter.body.enabled === true
        && statusAfter.body.readConfigured === statusBefore.body.readConfigured,
    });
    const ready = (statusAfter.body.generations || []).find(row => row.catalogId === generation.catalogId);
    assert(ready?.ready === true && ready.recordCount === generation.recordCount
      && ready.importedRows === generation.recordCount, 'shadow_status_not_ready');
    assert(report.readConfigurationUnchanged, 'shadow_read_configuration_changed');
    // The first ready generation may activate an already configured read path.
    assert(statusAfter.body.readPathActive === statusAfter.body.readConfigured,
      'shadow_read_path_state_invalid');

    Object.assign(report, {
      ok: true,
      completedAt: new Date().toISOString(),
      catalogId: generation.catalogId,
      doiSetHash: generation.doiSetHash,
      publicationSlot: generation.publicationSlot,
      sourceCommit: generation.sourceCommit,
      markerBlobSha: generation.markerBlobSha,
      recordCount: generation.recordCount,
      importedBatches,
      importBatchSize: IMPORT_BATCH_SIZE,
      contentReused: begin.body.contentReused === true,
      alreadyReady: begin.body.ready === true,
      rowParity: { checked: expectedRows.length, mismatched: 0 },
      searchParity: { probes: queryParity.length, mismatched: 0, queries: queryParity },
      viewParity: { scenarios:viewParity.length,mismatched:0,views:viewParity },
      shortQueryCompatibility: true,
      readerSortCompatibility: true,
      readConfigured: statusAfter.body.readConfigured,
      readPathActive: statusAfter.body.readPathActive,
    });
    await writeFile(REPORT, jsonText(report));
    console.log('LITERATURE_CATALOG_INDEX_SHADOW_READY ' + JSON.stringify(report));
  } catch (error) {
    report.failedAt = new Date().toISOString();
    report.error = error instanceof Error ? error.message : String(error);
    await writeFile(REPORT, jsonText(report));
    throw error;
  }
}

await main();
