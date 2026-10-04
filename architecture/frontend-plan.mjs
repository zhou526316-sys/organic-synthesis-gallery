import { normalizeDoi } from '../shared/literature-identity.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const clone = value => structuredClone(value);

function uniqueRecords(records) {
  const seen = new Set(), out = [];
  for (const row of records || []) {
    const doi = normalizeDoi(row?.doi || row?.record?.doi || row?.paper?.doi);
    if (!doi || seen.has(doi)) continue;
    seen.add(doi); out.push(row);
  }
  return out;
}

/**
 * Read-plan only. It never mutates user state, DOM, membership or production data.
 * The caller decides how to render the returned canonical records.
 */
export async function loadLandingPlan(reader, { asOfDate, sharedDoi, signal } = {}) {
  assert(reader && typeof reader.hot === 'function' && typeof reader.get === 'function', 'frontend_reader_required');
  assert(typeof asOfDate === 'string', 'frontend_as_of_required');
  const hot = await reader.hot(asOfDate, signal);
  if (!hot || hot.status !== 'ready') {
    return { status: hot?.status || 'verification-unavailable', complete: false, records: [], shared: null,
      catalogUpdateRequired: Boolean(hot?.catalogUpdateRequired) };
  }
  let records = [...(hot.records || [])], shared = null;
  const doi = normalizeDoi(sharedDoi);
  if (doi) {
    const existing = records.find(row => normalizeDoi(row.doi) === doi);
    if (existing) {
      shared = { status: 'published', lifecycle: 'hot', record: existing };
    } else {
      const result = await reader.get(doi, asOfDate, signal);
      shared = result;
      if (result?.status === 'published' && result.record) records.unshift(result.record);
    }
  }
  return {
    status: 'ready',
    complete: Boolean(hot.complete && (!doi || shared?.status === 'published' || shared?.status === 'withdrawn' || shared?.status === 'absent')),
    records: uniqueRecords(records),
    shared: shared ? clone(shared) : null,
    hotCount: (hot.records || []).length,
    catalogUpdateRequired: Boolean(hot.catalogUpdateRequired || shared?.status === 'catalog-update-required' || shared?.status === 'record-update-required'),
  };
}

export async function resolveDoisPlan(reader, doiValues, { asOfDate, signal, concurrency = 6 } = {}) {
  assert(reader && typeof reader.get === 'function', 'frontend_reader_required');
  assert(typeof asOfDate === 'string', 'frontend_as_of_required');
  assert(Array.isArray(doiValues) && Number.isSafeInteger(concurrency) && concurrency >= 1 && concurrency <= 20, 'frontend_resolve_options_invalid');
  const dois = [...new Set(doiValues.map(normalizeDoi).filter(Boolean))];
  const results = new Array(dois.length); let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= dois.length) return;
      results[index] = await reader.get(dois[index], asOfDate, signal);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, dois.length)) }, worker));
  const records = [], unavailable = [], withdrawn = [], absent = [], updateRequired = [];
  results.forEach((result, index) => {
    const doi = dois[index];
    if (result?.status === 'published' && result.record) records.push(result.record);
    else if (result?.status === 'withdrawn') withdrawn.push(doi);
    else if (result?.status === 'absent') absent.push(doi);
    else if (result?.status === 'catalog-update-required' || result?.status === 'record-update-required') updateRequired.push(doi);
    else unavailable.push(doi);
  });
  return { status: unavailable.length ? 'partial' : 'ready', complete: unavailable.length === 0 && updateRequired.length === 0,
    records: uniqueRecords(records), withdrawn, absent, updateRequired, unavailable };
}

export async function globalSearchPlan(reader, query, { asOfDate, limit = 100, signal, onProgress } = {}) {
  assert(reader && typeof reader.search === 'function', 'frontend_reader_required');
  const result = await reader.search(query, { asOfDate, scope: 'all', limit, signal, onProgress });
  return {
    ...clone(result),
    // Never let partial shard failure become a global negative answer.
    definitive: Boolean(result?.complete),
    noMatches: Boolean(result?.complete && Number(result.matched || 0) === 0),
  };
}
