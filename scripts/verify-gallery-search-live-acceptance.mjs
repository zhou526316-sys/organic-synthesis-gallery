// Read-only end-to-end acceptance for the deployed Gallery literature search.
// This script never writes to production, publishes literature, or reads PDFs.
import { writeFile } from 'node:fs/promises';

const SITE = new URL(process.env.GALLERY_SITE_URL || 'https://gallery.gczhouwld.com/');
const WORKER = new URL(process.env.GALLERY_API_URL || 'https://organic-synthesis-gallery.zhou526316.workers.dev/');
const REPORT = process.env.SEARCH_LIVE_REPORT || '/tmp/gallery-search-live-acceptance.json';
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), ok: false, target: SITE.origin };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const doiKey = value => String(value || '').trim().toLowerCase();
const digest = values => [...new Set(values)].sort();
const fetchJson = async (url, { method = 'GET', body, tries = 2 } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetch(new URL(url, method === 'GET' && !String(url).startsWith('http') ? SITE : WORKER), {
        method,
        headers: {
          'accept': 'application/json',
          'cache-control': 'no-cache',
          ...(method === 'POST' ? {
            'content-type': 'application/json',
            'origin': SITE.origin,
          } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(20000),
      });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 300) }; }
      if (!response.ok) throw new Error('HTTP_' + response.status + ':' + String(data.error || raw).slice(0, 220));
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < tries) await new Promise(resolve => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastError;
};
const search = async (catalogId, query, extra = {}) => {
  const request = { catalogId, query, sort: 'newest', limit: 100, ...extra };
  const data = await fetchJson(new URL('/api/literature/catalog-view', WORKER), {
    method: 'POST', body: request,
  });
  assert(data.readPathActive === true && data.enabled === true, 'public_search_index_inactive');
  assert(data.catalogId === catalogId, 'public_search_catalog_generation_mismatch');
  assert(Number.isSafeInteger(data.matched) && Array.isArray(data.items), 'public_search_response_invalid');
  assert(Number(data.count) === data.items.length && data.items.length <= request.limit,
    'public_search_count_or_window_invalid');
  assert(Boolean(data.hasMore) === (data.nextCursor !== null), 'public_search_cursor_flag_invalid');
  return data;
};

try {
  const delivery = await fetchJson(new URL('release-delivery.json', SITE));
  assert(typeof delivery.architectureCatalogId === 'string'
    && /^[a-f0-9]{64}$/.test(delivery.architectureCatalogId), 'pages_generation_missing');
  assert(Array.isArray(delivery.dois)
    && delivery.dois.length === Number(delivery.productionCards), 'pages_published_membership_invalid');
  const catalogId = delivery.architectureCatalogId, memberDois = new Set(delivery.dois.map(doiKey));
  const health = await fetchJson(new URL('/api/_healthcheck', WORKER));
  assert(health.literatureCatalogIndexReadPathActive === true
    && health.literatureCatalogIndexDb === true, 'production_literature_index_not_active');
  report.catalogId = catalogId;
  report.totalPublished = memberDois.size;
  report.pagesPublicationSlot = delivery.publicationSlot || null;
  report.indexHealthActive = true;

  const all = await search(catalogId, '', { limit: 1 });
  assert(all.matched === memberDois.size, 'all_time_membership_count_mismatch');

  const lmct = await search(catalogId, 'LMCT');
  const english = await search(catalogId, 'ligand-to-metal charge transfer');
  const chinese = await search(catalogId, '配体到金属电荷转移');
  const phosphoric = await search(catalogId, '手性磷酸');
  const atropisomeric = await search(catalogId, '轴手性');
  const impossible = await search(catalogId, 'zzzznoorganicmethodology000000');
  assert(impossible.matched === 0 && impossible.items.length === 0,
    'nonexistent_query_false_positive');
  assert(lmct.matched > 4, 'lmct_recall_still_at_most_four:' + lmct.matched);
  assert(lmct.matched >= lmct.items.length, 'lmct_result_count_mismatch');
  assert(english.matched > 0 && chinese.matched > 0, 'bilingual_lmct_expansion_missing');
  assert(phosphoric.matched > 0 && atropisomeric.matched > 0,
    'bilingual_chemical_synonym_index_missing');

  const verified = {};
  for (const [label, response] of [['LMCT', lmct], ['enLMCT', english],
    ['zhLMCT', chinese], ['chiralPhosphoricAcid', phosphoric], ['axialChirality', atropisomeric]]) {
    const dois = response.items.map(x => doiKey(x.doi));
    assert(new Set(dois).size === dois.length, 'duplicate_results:' + label);
    assert(dois.every(doi => memberDois.has(doi)), 'unpublished_doi_leaked:' + label);
    verified[label] = { matched: response.matched, count: response.count, hasMore: response.hasMore,
      dois: label === 'LMCT' ? dois : dois.slice(0, 8) };
  }
  const titleMatches = lmct.items.filter(item => /lmct|ligand.to.metal charge.transfer/i.test(
    [item.title, item.titleZh].join(' ')));
  assert(titleMatches.length < lmct.items.length, 'abstract_only_recall_not_demonstrated');

  if (lmct.items.length) {
    const selected = lmct.items[0].journal;
    const journalResult = await search(catalogId, 'LMCT', { selectedJournals: [selected], limit: 24 });
    assert(journalResult.matched > 0 && journalResult.matched <= lmct.matched,
      'journal_filter_result_invalid');
    assert(journalResult.items.every(item => item.journal === selected), 'journal_filter_leak');
    const firstDoi = lmct.items[0].doi;
    const abstract = await fetchJson(new URL('/api/literature/abstract?' + new URLSearchParams({
      catalogId, doi: firstDoi,
    }), WORKER));
    assert(abstract.doi === firstDoi && abstract.sourceSeparation === true,
      'original_abstract_and_review_provenance_missing');
    report.abstractSample = {
      doi: firstDoi, source: abstract.abstractSource,
      available: abstract.abstractAvailable, reviewed: Boolean(
        abstract.reviewedSummaryZh || abstract.reviewedSummaryEn),
      originalArticleUrl: abstract.originalArticleUrl,
    };
    report.journalFilter = { journal: selected, matched: journalResult.matched };
  }
  const bounded = await search(catalogId, 'LMCT', { limit: 12 });
  if (bounded.hasMore) {
    const page2 = await search(catalogId, 'LMCT', { limit: 12, cursor: bounded.nextCursor });
    assert(bounded.matched === page2.matched, 'search_cursor_total_mismatch');
    const overlap = bounded.items.some(x => page2.items.some(y => x.doi === y.doi));
    assert(!overlap, 'search_cursor_duplicate_doi');
  }

  report.queries = verified;
  report.abstractOnlyDiscoveryVerified = true;
  report.fetchedAndCheckedDois = lmct.items.length;
  report.ok = true;
  report.completedAt = new Date().toISOString();
} catch (error) {
  report.error = String(error?.message || error);
  report.failedAt = new Date().toISOString();
} finally {
  await writeFile(REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log('GALLERY_SEARCH_LIVE_ACCEPTANCE ' + JSON.stringify(report));
}
if (!report.ok) process.exitCode = 1;
