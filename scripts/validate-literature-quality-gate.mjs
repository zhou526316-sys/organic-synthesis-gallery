import { readFile, readdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';

const ROOT = process.cwd();
const SITE = (process.env.GALLERY_SITE || 'https://zhou526316-sys.github.io/organic-synthesis-gallery').replace(/\/$/, '');
const DOUBLE_PASS_EFFECTIVE_AT = Date.parse('2026-09-22T18:00:00+08:00');
const normalizeDoi = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
const sources = ['total-synthesis.json','manual-supplement.json','final-audit-supplement.json',
  'curated-supplement.json','automation-supplement.json','rolling-supplement.json','literature-supplement.json'];
async function readJson(file) { return JSON.parse(await readFile(path.resolve(ROOT, file), 'utf8')); }
async function loadRepositoryDois() {
  const dois = new Set();
  const add = paper => { const doi = normalizeDoi(paper?.doi || paper?.url); if (doi.startsWith('10.')) dois.add(doi); };
  try {
    const encoded = (await readFile(path.resolve(ROOT, 'public/papers.gz.b64'), 'utf8')).trim();
    JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')).forEach(add);
  } catch {}
  for (const file of sources) { try { ((await readJson(path.join('public', file)))?.papers || []).forEach(add); } catch {} }
  return dois;
}
async function loadDeployedDois() {
  const dois = new Set();
  const add = paper => { const doi = normalizeDoi(paper?.doi || paper?.url); if (doi.startsWith('10.')) dois.add(doi); };
  const fetchBytes = async file => {
    const response = await fetch(`${SITE}/${file}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${file} HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  try {
    const encoded = Buffer.from(await fetchBytes('papers.gz.b64')).toString('utf8').trim();
    JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')).forEach(add);
  } catch {}
  for (const file of sources) { try { (JSON.parse(Buffer.from(await fetchBytes(file)).toString('utf8'))?.papers || []).forEach(add); } catch {} }
  return dois;
}
async function latestReview() {
  const files = (await readdir(path.resolve(ROOT, 'audit'))).filter(name => /^review-.*\.json$/i.test(name));
  const rows = [];
  for (const file of files) {
    try { const payload = await readJson(path.join('audit', file)); rows.push({ file, payload, time: Date.parse(payload.generatedAt || '') || 0 }); } catch {}
  }
  rows.sort((a, b) => b.time - a.time || b.file.localeCompare(a.file));
  if (!rows[0]) throw new Error('No review file found');
  return rows[0];
}
async function publicationReview() {
  try {
    const marker = await readJson('audit/publication-release-state.json');
    const file = String(marker?.reviewFile || '').replace(/^audit\//, '');
    if (marker?.mode === 'slot-release' && /^review-.*\.json$/i.test(file)) {
      return { file, payload: await readJson(path.join('audit', file)), time: Date.parse(marker.generatedAt || '') || 0 };
    }
  } catch {}
  return latestReview();
}
const [audit, state, repositoryDois, deployedDois, reviewRow, releaseMarker] = await Promise.all([
  readJson('audit/latest.json'), readJson('audit/literature-update-state.json'),
  loadRepositoryDois(), loadDeployedDois(), publicationReview(),
  readJson('audit/publication-release-state.json').catch(() => null),
]);
let appliedRemovalDois = new Set();
try {
  if (releaseMarker?.mode === 'scope-correction') {
    const { authorizeScopeCorrection } = await import('./lib/immediate-scope-correction.mjs');
    const proof = await authorizeScopeCorrection(ROOT);
    if (!proof.ok) throw new Error('Invalid scope correction: ' + proof.failures.join('; '));
    appliedRemovalDois = new Set(proof.effectiveRemovedDois || proof.removedDois);
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const review = reviewRow.payload;
const accepted = review.accepted || [], rejected = review.rejected || [], pending = review.pending || [];
const all = [...accepted.map(x => ({ ...x, _decision: 'include' })), ...rejected.map(x => ({ ...x, _decision: 'exclude' })), ...pending.map(x => ({ ...x, _decision: 'pending' }))];
const failures = [], warnings = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const perDoi = review.releasePolicy?.mode === 'per-doi';
const doiList = all.map(x => normalizeDoi(x.doi)).filter(Boolean);
assert(new Set(doiList).size === all.length, 'semantic: duplicate or empty DOI in latest review');
for (const [field, actual] of [['reviewed', all.length], ['accepted', accepted.length], ['rejected', rejected.length], ['pending', pending.length]]) {
  assert((review.summary?.[field] ?? actual) === actual, `semantic: ${field} count mismatch`);
}
for (const item of all) {
  assert(Boolean(normalizeDoi(item.doi)), `semantic: missing DOI in ${item.title || 'untitled'}`);
  assert(Boolean(String(item.title || '').trim()), `semantic: missing title for ${item.doi}`);
  assert(String(item.reason || '').trim().length >= 24, `semantic: insufficient reason for ${item.doi}`);
}
for (const item of accepted) {
  const doi = normalizeDoi(item.doi);
  if (appliedRemovalDois.has(doi)) {
    assert(!repositoryDois.has(doi) && !deployedDois.has(doi), `precision: corrected old include remains visible: ${doi}`);
    continue;
  }
  assert(repositoryDois.has(doi), `publication: accepted DOI absent from repository data: ${doi}`);
  assert(deployedDois.has(doi), `publication: accepted DOI absent from deployed data: ${doi}`);
}
for (const item of rejected) {
  const doi = normalizeDoi(item.doi);
  assert(!repositoryDois.has(doi), `precision: rejected DOI still present in repository data: ${doi}`);
  assert(!deployedDois.has(doi), `precision: rejected DOI still present in deployed data: ${doi}`);
}
const reviewTime = Date.parse(review.generatedAt || '') || 0;
if (reviewTime >= DOUBLE_PASS_EFFECTIVE_AT) {
  const reviewDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(reviewTime));
  const activeJournals = TARGET_JOURNALS.filter(j => !j.activeFrom || j.activeFrom <= reviewDate).map(j => j.name);
  const sourceChecks = Array.isArray(review.sourceChecks) ? review.sourceChecks : [];
  const sourceCheckMap = new Map(sourceChecks.map(row => [String(row?.journal || ''), row]));
  for (const journal of activeJournals) {
    const row = sourceCheckMap.get(journal);
    assert(Boolean(row), `discovery: missing publisher live-source check for ${journal}`);
    if (!row) continue;
    const status = String(row.status || '').toLowerCase();
    assert(['checked','blocked','unavailable'].includes(status), `discovery: invalid publisher check status for ${journal}`);
    assert(String(row.sourceType || '').trim().length >= 3, `discovery: sourceType missing for ${journal}`);
    if (status === 'checked') {
      assert(Number.isFinite(row.candidateCount) && row.candidateCount >= 0, `discovery: candidateCount missing for ${journal}`);
      assert(Number.isFinite(row.syntheticTitleCount) && row.syntheticTitleCount >= 0, `discovery: syntheticTitleCount missing for ${journal}`);
      assert(/^https?:\/\//i.test(String(row.sourcePage || '')), `discovery: sourcePage invalid for ${journal}`);
      assert(!/crossref|openalex/i.test(String(row.sourceType || '')), `discovery: machine source mislabeled as publisher check for ${journal}`);
    } else {
      assert(row.candidateCount == null || (Number.isFinite(row.candidateCount) && row.candidateCount >= 0), `discovery: invalid candidateCount for ${journal}`);
      assert(row.syntheticTitleCount == null || (Number.isFinite(row.syntheticTitleCount) && row.syntheticTitleCount >= 0), `discovery: invalid syntheticTitleCount for ${journal}`);
      assert(String(row.reason || '').trim().length >= 16, `discovery: publisher check lacks reason for ${journal}`);
      warnings.push(`publisher live source ${status}: ${journal}`);
    }
  }
  assert(review.qualityControl?.secondPassCompleted === true, 'semantic: second-pass challenge review not completed');
  const scopedDisagreements = perDoi ? pending.filter(item => item.firstPassDecision && item.challengeDecision && item.firstPassDecision !== item.challengeDecision).length : 0;
  assert(review.qualityControl?.unresolvedDisagreements === scopedDisagreements, 'semantic: unaccounted first/second-pass disagreements exist');
  // Use annotated rows, not the original accepted/rejected objects without _decision.
  for (const item of all.filter(x => x._decision === 'include' || (x._decision === 'exclude' && x.reviewPriority === 'high'))) {
    assert(String(item.evidenceBasis || '').trim().length >= 40, `semantic: evidenceBasis missing/too short for ${item.doi}`);
    assert(String(item.challengeReason || '').trim().length >= 30, `semantic: challengeReason missing/too short for ${item.doi}`);
    assert(String(item.challengeDecision || '').toLowerCase() === item._decision, `semantic: first/final decision not confirmed by challenge pass for ${item.doi}`);
  }
}
for (const key of ['criticalSourceFailures','sourceFamilyGaps','historicalCoverageLosses']) {
  assert(Number.isSafeInteger(audit.summary?.[key]) && audit.summary[key] === 0, `discovery: ${key} missing or nonzero`);
}
const sourceCoverageAnomalyCount = audit.summary?.sourceCoverageAnomalies;
assert(Number.isSafeInteger(sourceCoverageAnomalyCount) && sourceCoverageAnomalyCount >= 0,
  'discovery: sourceCoverageAnomalies missing or invalid');
if (!perDoi) assert(sourceCoverageAnomalyCount === 0, 'discovery: sourceCoverageAnomalies block full-review closure');
else if (sourceCoverageAnomalyCount > 0) warnings.push(
  `discovery: ${sourceCoverageAnomalyCount} healthy cross-source coverage warning(s) retained; publication may pass but closure/verifiedThrough must remain held`);
const pendingDois = new Set(pending.map(row => normalizeDoi(row.doi)));
if (perDoi) {
  // The exception is an exact, persisted DOI set, never a numerical tolerance for unknown omissions.
  const backlog = Array.isArray(state.pendingReviewBacklog) ? state.pendingReviewBacklog : [];
  const backlogDois = new Set(backlog.map(row => normalizeDoi(row.doi)));
  assert(backlogDois.size === backlog.length && backlogDois.size === pendingDois.size
    && [...pendingDois].every(doi => backlogDois.has(doi)), 'deferred: state backlog does not equal formal pending decisions');
  const carryover = Array.isArray(state.nextSlotPublicationBacklog) ? state.nextSlotPublicationBacklog : [];
  const carryoverDois = new Set(carryover.map(row => normalizeDoi(row.doi)));
  assert(carryoverDois.size === carryover.length, 'carryover: duplicate or empty DOI in next-slot backlog');
  const markerSlot = String(releaseMarker?.publicationSlot || review.publicationSlot || '');
  for (const row of carryover) {
    const doi = normalizeDoi(row.doi);
    assert(row.decision === 'include' && row.status === 'ready_for_next_slot',
      `carryover: reviewed include status missing for ${doi}`);
    assert(String(row.evidenceBasis || '').trim().length >= 40 && String(row.challengeReason || '').trim().length >= 30
      && row.firstPassDecision === 'include' && row.challengeDecision === 'include',
      `carryover: two-pass include evidence missing for ${doi}`);
    assert(/^\d{4}-\d{2}-\d{2}T(?:08|18):00:00\+08:00$/.test(String(row.nextPublicationSlot || ''))
      && (!markerSlot || Date.parse(row.nextPublicationSlot) > Date.parse(markerSlot)),
      `carryover: invalid next publication slot for ${doi}`);
    assert(!repositoryDois.has(doi) && !deployedDois.has(doi),
      `carryover: off-slot DOI leaked into production: ${doi}`);
    assert(Boolean(row.sourceReviewFile), `carryover: source review missing for ${doi}`);
  }
  const missing = Array.isArray(audit.missingCandidates) ? audit.missingCandidates : [];
  const missingDois = missing.map(row => normalizeDoi(row.doi));
  assert(Number.isSafeInteger(audit.summary?.unresolved) && audit.summary.unresolved === missing.length
    && audit.summary?.missingFromGallery === missing.length && new Set(missingDois).size === missing.length,
  'discovery: unresolved diagnostics are incomplete or inconsistent');
  assert(missingDois.every(doi => (pendingDois.has(doi) && backlogDois.has(doi)) || carryoverDois.has(doi)),
    'discovery: unresolved DOI is neither formal pending nor reviewed next-slot carryover');
  assert([...carryoverDois].every(doi => missingDois.includes(doi)),
    'carryover: next-slot backlog contains DOI no longer unresolved');
  for (const item of pending) {
    const doi = normalizeDoi(item.doi);
    const entry = backlog.find(row => normalizeDoi(row.doi) === doi);
    assert(!repositoryDois.has(doi) && !deployedDois.has(doi), `precision: deferred DOI leaked into production: ${doi}`);
    assert(String(item.evidenceBasis || '').trim().length >= 40 && String(item.challengeReason || '').trim().length >= 30,
      `deferred: two-pass evidence record missing for ${doi}`);
    assert(String(item.evidenceNeeded || item.nextAction || '').trim().length >= 16,
      `deferred: evidence-needed detail missing for ${doi}`);
    assert(String(entry?.nextAction || '').trim().length >= 16 && Boolean(entry?.sourceReviewFile),
      `deferred: durable retry instruction or source review missing for ${doi}`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '')),
      `deferred: original publication date missing for ${doi}`);
    assert(!state.verifiedThrough || String(state.verifiedThrough) < String(item.date || ''),
      `closure: verifiedThrough advanced across a pending DOI: ${doi}`);
  }
  if (pending.length) {
    assert(['ready_with_pending', 'synced_with_pending'].includes(state.phase),
      'deferred: partial publication state must be ready_with_pending before finalization or synced_with_pending after it');
    warnings.push(`Publication subset verified; ${pending.length} DOI(s) remain pending. This is not full semantic closure.`);
  }
} else {
  assert((audit.summary?.missingFromGallery ?? 0) === 0, 'discovery/semantic: missingFromGallery > 0');
  assert((audit.summary?.unresolved ?? 0) === 0, 'discovery/semantic: unresolved > 0');
}
if ((audit.summary?.closureCoverageAnomalies ?? 0) > 0) {
  warnings.push(`closure source lag remains: ${audit.summary.closureCoverageAnomalies}`);
  const verified = String(state.verifiedThrough || ''), closureDate = String(audit.closureDate || audit.closure?.date || '');
  assert(!verified || !closureDate || verified < closureDate, 'closure: verifiedThrough advanced despite closureCoverageAnomalies');
}
if (pending.length > 0) assert(state.phase !== 'synced', 'semantic: pending decisions exist while phase=synced');
const expectedGallery = releaseMarker?.mode === 'slot-release'
  ? releaseMarker.productionCards
  : (state.lastWebsiteSync?.verification?.galleryDois ?? state.lastWebsiteSync?.verification?.totalGalleryCards);
if (releaseMarker?.mode === 'slot-release' || ['synced', 'synced_with_pending', 'synced_with_carryover'].includes(state.phase)) {
  assert(Number.isSafeInteger(expectedGallery), 'publication: expected card count missing');
  assert(deployedDois.size === expectedGallery,
    `publication: deployed DOI count ${deployedDois.size} != expected ${expectedGallery}`);
  assert(repositoryDois.size === deployedDois.size && [...repositoryDois].every(doi => deployedDois.has(doi)),
    'publication: repository and deployed DOI sets differ');
}
const result = {
  ok: failures.length === 0, publicationChecksPassed: failures.length === 0,
  reviewComplete: failures.length === 0 && pending.length === 0,
  releasePolicy: perDoi ? 'per-doi' : 'full-review-closure',
  reviewFile: reviewRow.file, reviewGeneratedAt: review.generatedAt || null, auditGeneratedAt: audit.generatedAt || null,
  repositoryDois: repositoryDois.size, deployedDois: deployedDois.size,
  discovery: Object.fromEntries(['criticalSourceFailures','sourceFamilyGaps','sourceCoverageAnomalies','closureCoverageAnomalies','historicalCoverageLosses','unresolved'].map(key => [key, audit.summary?.[key] ?? null])),
  semantic: { reviewed: all.length, accepted: accepted.length, rejected: rejected.length, pending: pending.length },
  deferredDois: [...pendingDois], nextSlotPublicationDois: (state.nextSlotPublicationBacklog || []).map(row => normalizeDoi(row.doi)), failures, warnings,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
