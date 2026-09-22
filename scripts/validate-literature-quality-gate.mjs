import { readFile, readdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';

const ROOT = process.cwd();
const SITE = (process.env.GALLERY_SITE || 'https://zhou526316-sys.github.io/organic-synthesis-gallery').replace(/\/$/, '');
const DOUBLE_PASS_EFFECTIVE_AT = Date.parse('2026-09-22T18:00:00+08:00');

const normalizeDoi = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
  .replace(/^doi:\s*/i, '')
  .replace(/[?#].*$/, '');

async function readJson(file) {
  return JSON.parse(await readFile(path.resolve(ROOT, file), 'utf8'));
}

async function loadRepositoryDois() {
  const dois = new Set();
  const add = paper => {
    const doi = normalizeDoi(paper?.doi || paper?.url);
    if (doi.startsWith('10.')) dois.add(doi);
  };
  try {
    const encoded = (await readFile(path.resolve(ROOT, 'public/papers.gz.b64'), 'utf8')).trim();
    JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')).forEach(add);
  } catch {}
  for (const file of [
    'total-synthesis.json','manual-supplement.json','final-audit-supplement.json',
    'curated-supplement.json','automation-supplement.json','rolling-supplement.json',
    'literature-supplement.json'
  ]) {
    try {
      const payload = await readJson(path.join('public', file));
      (payload?.papers || []).forEach(add);
    } catch {}
  }
  return dois;
}

async function loadDeployedDois() {
  const dois = new Set();
  const add = paper => {
    const doi = normalizeDoi(paper?.doi || paper?.url);
    if (doi.startsWith('10.')) dois.add(doi);
  };
  const fetchBytes = async file => {
    const response = await fetch(`${SITE}/${file}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${file} HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  try {
    const encoded = Buffer.from(await fetchBytes('papers.gz.b64')).toString('utf8').trim();
    JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')).forEach(add);
  } catch {}
  for (const file of [
    'total-synthesis.json','manual-supplement.json','final-audit-supplement.json',
    'curated-supplement.json','automation-supplement.json','rolling-supplement.json',
    'literature-supplement.json'
  ]) {
    try {
      const payload = JSON.parse(Buffer.from(await fetchBytes(file)).toString('utf8'));
      (payload?.papers || []).forEach(add);
    } catch {}
  }
  return dois;
}

async function latestReview() {
  const files = (await readdir(path.resolve(ROOT, 'audit')))
    .filter(name => /^review-.*\.json$/i.test(name));
  const rows = [];
  for (const file of files) {
    try {
      const payload = await readJson(path.join('audit', file));
      rows.push({ file, payload, time: Date.parse(payload.generatedAt || '') || 0 });
    } catch {}
  }
  rows.sort((a, b) => b.time - a.time || b.file.localeCompare(a.file));
  if (!rows[0]) throw new Error('No review file found');
  return rows[0];
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const [audit, state, repositoryDois, deployedDois, reviewRow] = await Promise.all([
  readJson('audit/latest.json'),
  readJson('audit/literature-update-state.json'),
  loadRepositoryDois(),
  loadDeployedDois(),
  latestReview(),
]);

const review = reviewRow.payload;
const accepted = review.accepted || [];
const rejected = review.rejected || [];
const pending = review.pending || [];
const all = [...accepted.map(x => ({...x, _decision:'include'})),
  ...rejected.map(x => ({...x, _decision:'exclude'})),
  ...pending.map(x => ({...x, _decision:'pending'}))];
const failures = [];
const warnings = [];

const doiList = all.map(x => normalizeDoi(x.doi)).filter(Boolean);
assert(new Set(doiList).size === doiList.length, 'semantic: duplicate DOI exists in latest review', failures);
assert((review.summary?.reviewed ?? all.length) === all.length, 'semantic: review.summary.reviewed does not equal decision rows', failures);
assert((review.summary?.accepted ?? accepted.length) === accepted.length, 'semantic: accepted count mismatch', failures);
assert((review.summary?.rejected ?? rejected.length) === rejected.length, 'semantic: rejected count mismatch', failures);
assert((review.summary?.pending ?? pending.length) === pending.length, 'semantic: pending count mismatch', failures);

for (const item of all) {
  assert(Boolean(normalizeDoi(item.doi)), `semantic: missing DOI in ${item.title || 'untitled'}`, failures);
  assert(Boolean(String(item.title || '').trim()), `semantic: missing title for ${item.doi}`, failures);
  assert(String(item.reason || '').trim().length >= 24, `semantic: insufficient reason for ${item.doi}`, failures);
}
for (const item of accepted) {
  const doi = normalizeDoi(item.doi);
  assert(repositoryDois.has(doi), `publication: accepted DOI absent from repository data: ${doi}`, failures);
  assert(deployedDois.has(doi), `publication: accepted DOI absent from deployed data: ${doi}`, failures);
}
for (const item of rejected) {
  const doi = normalizeDoi(item.doi);
  assert(!repositoryDois.has(doi), `precision: rejected DOI still present in repository data: ${doi}`, failures);
  assert(!deployedDois.has(doi), `precision: rejected DOI still present in deployed data: ${doi}`, failures);
}

const reviewTime = Date.parse(review.generatedAt || '') || 0;
if (reviewTime >= DOUBLE_PASS_EFFECTIVE_AT) {
  const reviewDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(reviewTime));
  const activeJournals = TARGET_JOURNALS.filter(j => !j.activeFrom || j.activeFrom <= reviewDate).map(j => j.name);
  const sourceChecks = Array.isArray(review.sourceChecks) ? review.sourceChecks : [];
  const sourceCheckMap = new Map(sourceChecks.map(row => [String(row?.journal || ''), row]));
  for (const journal of activeJournals) {
    const row = sourceCheckMap.get(journal);
    assert(Boolean(row), `discovery: missing publisher live-source check for ${journal}`, failures);
    if (!row) continue;
    const status = String(row.status || '').toLowerCase();
    assert(['checked','blocked','unavailable'].includes(status),
      `discovery: invalid publisher source-check status for ${journal}`, failures);
    assert(Number.isFinite(row.candidateCount) && row.candidateCount >= 0,
      `discovery: candidateCount missing for publisher check ${journal}`, failures);
    assert(Number.isFinite(row.syntheticTitleCount) && row.syntheticTitleCount >= 0,
      `discovery: syntheticTitleCount missing for publisher check ${journal}`, failures);
    if (status !== 'checked') {
      assert(String(row.reason || '').trim().length >= 16,
        `discovery: blocked/unavailable publisher check lacks reason for ${journal}`, failures);
      warnings.push(`publisher live source ${status}: ${journal}`);
    }
  }
  assert(review.qualityControl?.secondPassCompleted === true, 'semantic: second-pass challenge review not completed', failures);
  assert((review.qualityControl?.unresolvedDisagreements ?? 0) === 0, 'semantic: unresolved first/second-pass disagreements exist', failures);
  for (const item of [...accepted, ...rejected.filter(x => x.reviewPriority === 'high')]) {
    assert(String(item.evidenceBasis || '').trim().length >= 40, `semantic: evidenceBasis missing/too short for ${item.doi}`, failures);
    assert(['include','exclude'].includes(String(item.challengeDecision || '').toLowerCase()),
      `semantic: challengeDecision missing for ${item.doi}`, failures);
    assert(String(item.challengeReason || '').trim().length >= 30,
      `semantic: challengeReason missing/too short for ${item.doi}`, failures);
    assert(String(item.challengeDecision || '').toLowerCase() === item._decision,
      `semantic: first/final decision not confirmed by challenge pass for ${item.doi}`, failures);
  }
}

assert((audit.summary?.criticalSourceFailures ?? 0) === 0, 'discovery: criticalSourceFailures > 0', failures);
assert((audit.summary?.sourceFamilyGaps ?? 0) === 0, 'discovery: sourceFamilyGaps > 0', failures);
assert((audit.summary?.sourceCoverageAnomalies ?? 0) === 0, 'discovery: sourceCoverageAnomalies > 0', failures);
assert((audit.summary?.historicalCoverageLosses ?? 0) === 0, 'regression: historicalCoverageLosses > 0', failures);
assert((audit.summary?.missingFromGallery ?? 0) === 0, 'discovery/semantic: missingFromGallery > 0', failures);
assert((audit.summary?.unresolved ?? 0) === 0, 'discovery/semantic: unresolved > 0', failures);

if ((audit.summary?.closureCoverageAnomalies ?? 0) > 0) {
  warnings.push(`closure source lag remains: ${audit.summary.closureCoverageAnomalies}`);
  const verified = String(state.verifiedThrough || '');
  const closureDate = String(audit.closureDate || audit.closure?.date || '');
  assert(!verified || !closureDate || verified < closureDate,
    'closure: verifiedThrough advanced despite closureCoverageAnomalies', failures);
}
if (pending.length > 0) {
  assert(state.phase !== 'synced', 'semantic: pending decisions exist while phase=synced', failures);
}

const expectedGallery = state.lastWebsiteSync?.verification?.galleryDois
  ?? state.lastWebsiteSync?.verification?.totalGalleryCards;
if (state.phase === 'synced' && Number.isFinite(expectedGallery)) {
  assert(deployedDois.size === expectedGallery,
    `publication: deployed DOI count ${deployedDois.size} != state expected ${expectedGallery}`, failures);
}

const result = {
  ok: failures.length === 0,
  reviewFile: reviewRow.file,
  reviewGeneratedAt: review.generatedAt || null,
  auditGeneratedAt: audit.generatedAt || null,
  repositoryDois: repositoryDois.size,
  deployedDois: deployedDois.size,
  discovery: {
    criticalSourceFailures: audit.summary?.criticalSourceFailures ?? null,
    sourceFamilyGaps: audit.summary?.sourceFamilyGaps ?? null,
    sourceCoverageAnomalies: audit.summary?.sourceCoverageAnomalies ?? null,
    closureCoverageAnomalies: audit.summary?.closureCoverageAnomalies ?? null,
    historicalCoverageLosses: audit.summary?.historicalCoverageLosses ?? null,
    unresolved: audit.summary?.unresolved ?? null,
  },
  semantic: { reviewed: all.length, accepted: accepted.length, rejected: rejected.length, pending: pending.length },
  failures,
  warnings,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
