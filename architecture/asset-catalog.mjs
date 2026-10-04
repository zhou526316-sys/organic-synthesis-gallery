import { createHash } from 'node:crypto';
import { normalizeDoi } from '../shared/literature-identity.mjs';

export const ASSET_SCHEMA = 'gallery-unified-asset-shadow-v1';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
export function assetStable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(assetStable).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + assetStable(value[key])).join(',') + '}';
}
export const assetDigest = value => createHash('sha256').update(typeof value === 'string' ? value : assetStable(value)).digest('hex');

function canonicalMembership(values) {
  assert(Array.isArray(values), 'asset_membership_not_array');
  const dois = values.map(normalizeDoi);
  assert(dois.every(Boolean), 'asset_membership_invalid_doi');
  assert(new Set(dois).size === dois.length, 'asset_membership_duplicate_doi');
  return [...dois].sort();
}
function exactRows(items, membership, label) {
  assert(Array.isArray(items), label + '_items_missing');
  const map = new Map();
  for (const row of items) {
    const doi = normalizeDoi(row?.doi);
    assert(doi && !map.has(doi), label + '_duplicate_or_invalid_doi');
    map.set(doi, row);
  }
  assert(map.size === membership.length && membership.every(doi => map.has(doi)), label + '_membership_mismatch');
  return map;
}
function safeHash(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{16,128}$/.test(text) ? text : '';
}
function classifyDisplay(item) {
  if (!item || typeof item !== 'object') return { presence:'unknown', kind:'unknown', contentHash:'' };
  if (!(item?.toc?.available && item?.toc?.imageUrl)) return { presence:'absent', kind:'none', contentHash:'' };
  const reason = String(item.toc.reason || '').toLowerCase();
  const kind = reason.includes('figure1') ? 'figure1'
    : reason.includes('fallback') || reason.includes('figure_') || reason.includes('figure-') ? 'figure'
    : 'official';
  return { presence:'present', kind, contentHash:safeHash(item.toc.contentHash) };
}
function latestKinds(rows) {
  const out = { official:null, figure1:null };
  for (const row of rows || []) {
    const kind = String(row?.kind || '').toLowerCase();
    if (!(kind in out)) continue;
    if (!out[kind] || Number(row.updatedAt || 0) > Number(out[kind].updatedAt || 0)) out[kind] = row;
  }
  return out;
}
function stagedFigures(row) {
  const figures = row?.figures && typeof row.figures === 'object' && !Array.isArray(row.figures)
    ? Object.values(row.figures) : [];
  return figures.map(item => ({
    label:String(item?.label || '').trim().slice(0,120),
    contentHash:safeHash(item?.contentHash),
    width:Math.max(0, Number(item?.width || 0)),
    height:Math.max(0, Number(item?.height || 0)),
    quality:String(item?.quality || 'unknown').slice(0,32),
    updatedAt:Math.max(0, Number(item?.updatedAt || 0)),
  })).filter(item => item.label && item.contentHash);
}
function publicFigures(row) {
  return (Array.isArray(row?.capturedFigures) ? row.capturedFigures : []).map(item => ({
    label:String(item?.label || '').trim().slice(0,120),
    contentHash:safeHash(item?.contentHash),
    width:Math.max(0, Number(item?.width || 0)),
    height:Math.max(0, Number(item?.height || 0)),
    quality:String(item?.quality || 'unknown').slice(0,32),
  })).filter(item => item.label && item.contentHash);
}
function summaryMap(summaryIndex, membership) {
  const items = summaryIndex?.items && typeof summaryIndex.items === 'object' && !Array.isArray(summaryIndex.items)
    ? summaryIndex.items : {};
  const result = new Map(), foreign = [];
  for (const [rawDoi, row] of Object.entries(items)) {
    const doi = normalizeDoi(rawDoi || row?.doi);
    if (!doi) continue;
    if (!membership.includes(doi)) { foreign.push(doi); continue; }
    assert(!result.has(doi), 'summary_duplicate_doi:' + doi);
    result.set(doi, row);
  }
  return { result, foreign:[...new Set(foreign)].sort() };
}

export function buildUnifiedAssetCatalog({
  membershipDois,
  workerInventory,
  localCaptureIndex,
  stagedFigureInventory,
  staticMediaIndex,
  summaryIndex,
  source = {},
} = {}) {
  const membership = canonicalMembership(membershipDois);
  assert(workerInventory && Array.isArray(workerInventory.items), 'worker_inventory_missing');
  const worker = exactRows(workerInventory.items, membership, 'worker_inventory');

  assert(localCaptureIndex && Array.isArray(localCaptureIndex.items)
    && Number(localCaptureIndex.count) === localCaptureIndex.items.length, 'local_capture_inventory_incomplete');
  const local = new Map(), foreignLocal = [];
  for (const row of localCaptureIndex.items) {
    const doi = normalizeDoi(row?.doi);
    if (!doi) continue;
    if (!worker.has(doi)) { foreignLocal.push(doi); continue; }
    const rows = local.get(doi) || []; rows.push(row); local.set(doi, rows);
  }

  assert(stagedFigureInventory?.schemaVersion === 'capture-inventory-v1'
    && stagedFigureInventory.complete === true
    && Array.isArray(stagedFigureInventory.items)
    && Number(stagedFigureInventory.count) === stagedFigureInventory.items.length,
    'staged_figure_inventory_incomplete');
  const staged = new Map(), foreignStaged = [];
  for (const row of stagedFigureInventory.items) {
    const doi = normalizeDoi(row?.doi);
    if (!doi) continue;
    if (!worker.has(doi)) { foreignStaged.push(doi); continue; }
    assert(!staged.has(doi), 'staged_figure_duplicate_doi:' + doi);
    staged.set(doi, row);
  }

  const displayItems = staticMediaIndex?.items && typeof staticMediaIndex.items === 'object' && !Array.isArray(staticMediaIndex.items)
    ? staticMediaIndex.items : {};
  const foreignDisplay = [];
  for (const rawDoi of Object.keys(displayItems)) {
    const doi = normalizeDoi(rawDoi);
    if (doi && !worker.has(doi)) foreignDisplay.push(doi);
  }
  const summaries = summaryMap(summaryIndex, membership);

  const rows = [];
  const summary = {
    total:membership.length,
    officialTocPublished:0, officialTocCaptured:0, displayVisualPresent:0,
    figurePublishedPresent:0, figureCapturedPresent:0,
    figureComplete:0, figureIncomplete:0, figureCompletenessUnknown:0,
    capturedTocNotPublished:0, capturedFiguresNotPublished:0,
    suspiciousPublishedToc:0, reviewedSummaryPresent:0,
    evidenceReferencedBySummary:0, evidenceUnknown:0,
  };
  const reconciliation = {
    capturedTocNotPublished:[], capturedFiguresNotPublished:[],
    displayVisualWithoutPublishedVisual:[], publishedFiguresWithoutCompletenessProof:[],
    suspiciousPublishedToc:[],
  };

  for (const doi of membership) {
    const w = worker.get(doi) || {};
    const localKinds = latestKinds(local.get(doi) || []);
    const stage = staged.get(doi);
    const display = classifyDisplay(displayItems[doi]);
    const reviewed = summaries.result.get(doi);

    const officialPublished = Boolean(w.tocStored);
    const publishedLargeSource = String(w.largeSource || 'none').toLowerCase();
    const fallbackPublished = !officialPublished && Boolean(
      w.figureOneStored || ['figure1','article_figure','pdf_primary'].includes(String(w.primaryKind || '').toLowerCase())
      || !['none','toc',''].includes(publishedLargeSource)
    );
    const officialCaptured = Boolean(localKinds.official);
    const fallbackCaptured = Boolean(localKinds.figure1);
    if (officialPublished) summary.officialTocPublished++;
    if (officialCaptured) summary.officialTocCaptured++;
    if (display.presence === 'present') summary.displayVisualPresent++;
    if (w.suspiciousToc) { summary.suspiciousPublishedToc++; reconciliation.suspiciousPublishedToc.push(doi); }
    if (!officialPublished && officialCaptured) {
      summary.capturedTocNotPublished++; reconciliation.capturedTocNotPublished.push(doi);
    }
    if (display.presence === 'present' && !(officialPublished || fallbackPublished)) {
      reconciliation.displayVisualWithoutPublishedVisual.push(doi);
    }

    const publishedCount = Math.max(0, Number(w.figureCount || 0));
    const publishedFigures = publicFigures(w);
    const capturedFigures = stagedFigures(stage);
    const capturedCount = capturedFigures.length;
    const expectedRaw = Number(stage?.expectedFigureCount || 0);
    const expectedCount = Number.isSafeInteger(expectedRaw) && expectedRaw > 0 ? expectedRaw : null;
    const completeness = expectedCount === null ? 'unknown'
      : capturedCount >= expectedCount ? 'complete' : 'incomplete';
    if (publishedCount > 0) summary.figurePublishedPresent++;
    if (capturedCount > 0) summary.figureCapturedPresent++;
    if (capturedCount > 0 && publishedCount === 0) {
      summary.capturedFiguresNotPublished++; reconciliation.capturedFiguresNotPublished.push(doi);
    }
    if (publishedCount > 0 && expectedCount === null) reconciliation.publishedFiguresWithoutCompletenessProof.push(doi);
    if (completeness === 'complete') summary.figureComplete++;
    else if (completeness === 'incomplete') summary.figureIncomplete++;
    else summary.figureCompletenessUnknown++;

    const summaryPresent = Boolean(reviewed && reviewed.status === 'approved');
    const evidencePacketHash = summaryPresent ? safeHash(reviewed.evidencePacketHash) : '';
    if (summaryPresent) summary.reviewedSummaryPresent++;
    if (evidencePacketHash) summary.evidenceReferencedBySummary++;
    else summary.evidenceUnknown++;

    rows.push({
      doi,
      toc:{
        published:{ official:officialPublished, fallback:fallbackPublished, suspicious:Boolean(w.suspiciousToc),
          reason:String(w.tocReason || ''), largeSource:String(w.largeSource || 'none') },
        captured:{ official:officialCaptured, fallback:fallbackCaptured,
          officialContentHash:safeHash(localKinds.official?.contentHash),
          fallbackContentHash:safeHash(localKinds.figure1?.contentHash) },
        display,
      },
      figures:{
        published:{ presence:publishedCount > 0 ? 'present':'absent', count:publishedCount, sample:publishedFigures },
        captured:{ presence:capturedCount > 0 ? 'present':'absent', count:capturedCount, expectedCount,
          completeness, observedAt:Math.max(0, Number(stage?.observedAt || 0)), items:capturedFigures },
      },
      summary:summaryPresent ? {
        presence:'present', status:'approved', sourceHash:safeHash(reviewed.sourceHash),
        evidencePacketHash, evidenceLevel:String(reviewed.evidenceLevel || 'unknown').slice(0,40),
        reviewedAt:Math.max(0, Number(reviewed.reviewedAt || 0)),
      } : { presence:'absent' },
      evidence:evidencePacketHash
        ? { presence:'referenced_by_reviewed_summary', evidencePacketHash }
        : { presence:'unknown' },
    });
  }

  const catalog = {
    schema:ASSET_SCHEMA,
    mode:'shadow',
    productionActivation:false,
    dispatchEnabled:false,
    source:{
      ...source,
      workerGeneratedAt:Math.max(0, Number(workerInventory.generatedAt || 0)),
      localCaptureUpdatedAt:Math.max(0, Number(localCaptureIndex.updatedAt || 0)),
      stagedFigureGeneratedAt:Math.max(0, Number(stagedFigureInventory.generatedAt || 0)),
      staticMediaGeneratedAt:Math.max(0, Number(staticMediaIndex?.generatedAt || 0)),
      summaryGeneratedAt:Math.max(0, Number(summaryIndex?.generatedAt || 0)),
      crossSourceAtomic:false,
    },
    count:rows.length,
    doiSetHash:assetDigest(membership),
    rows,
    summary,
    reconciliation:Object.fromEntries(Object.entries(reconciliation).map(([key,value]) => [key,[...value].sort()])),
    foreign:{
      localCapture:[...new Set(foreignLocal)].sort(),
      stagedFigures:[...new Set(foreignStaged)].sort(),
      staticMedia:[...new Set(foreignDisplay)].sort(),
      summaries:summaries.foreign,
    },
  };
  catalog.catalogHash = assetDigest(catalog);
  return catalog;
}

export function verifyUnifiedAssetCatalog(catalog, membershipDois) {
  assert(catalog?.schema === ASSET_SCHEMA && catalog.mode === 'shadow'
    && catalog.productionActivation === false && catalog.dispatchEnabled === false, 'asset_catalog_mode_invalid');
  const membership = canonicalMembership(membershipDois);
  assert(catalog.count === membership.length && Array.isArray(catalog.rows) && catalog.rows.length === membership.length,
    'asset_catalog_count_mismatch');
  const dois = catalog.rows.map(row => normalizeDoi(row?.doi));
  assert(dois.every(Boolean) && new Set(dois).size === dois.length && assetStable([...dois].sort()) === assetStable(membership),
    'asset_catalog_membership_mismatch');
  assert(catalog.doiSetHash === assetDigest(membership), 'asset_catalog_doi_hash_mismatch');
  for (const row of catalog.rows) {
    assert(['complete','incomplete','unknown'].includes(row.figures?.captured?.completeness), 'asset_completeness_invalid');
    const expected = row.figures?.captured?.expectedCount;
    if (expected == null) assert(row.figures.captured.completeness === 'unknown', 'asset_unknown_expected_must_remain_unknown');
    else {
      assert(Number.isSafeInteger(expected) && expected > 0, 'asset_expected_count_invalid');
      const count = Number(row.figures.captured.count || 0);
      assert(row.figures.captured.completeness === (count >= expected ? 'complete':'incomplete'), 'asset_completeness_mismatch');
    }
    if (row.evidence?.presence === 'referenced_by_reviewed_summary') {
      assert(row.summary?.presence === 'present' && safeHash(row.evidence.evidencePacketHash), 'asset_evidence_reference_without_summary');
    }
    const serialized = assetStable(row);
    assert(!/(?:sourceUrl|articleUrl|authorization|cookie|token|fulltext|rawFulltext)/i.test(serialized), 'asset_catalog_private_or_signed_field_leak');
  }
  const copy={...catalog};delete copy.catalogHash;
  assert(catalog.catalogHash === assetDigest(copy), 'asset_catalog_hash_mismatch');
  return {
    ok:true,count:catalog.count,doiSetHash:catalog.doiSetHash,catalogHash:catalog.catalogHash,
    summary:structuredClone(catalog.summary),
    reconciliationCounts:Object.fromEntries(Object.entries(catalog.reconciliation).map(([k,v])=>[k,v.length])),
    foreignCounts:Object.fromEntries(Object.entries(catalog.foreign).map(([k,v])=>[k,v.length])),
  };
}
