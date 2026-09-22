import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';

const ROOT = process.cwd();
const reviewFile = process.argv[2] || process.env.PREPUBLISH_FILE;
const requireReady = process.argv.includes('--require-ready') || process.env.PREPUBLISH_REQUIRE_READY === '1';
if (!reviewFile) {
  console.error('Usage: node scripts/validate-prepublish-review.mjs <audit/prepublish-review-...json> [--require-ready]');
  process.exit(2);
}

const normalizeDoi = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
  .replace(/^doi:\s*/i, '')
  .replace(/[?#].*$/, '');

const readJson = async file => JSON.parse(await readFile(path.resolve(ROOT, file), 'utf8'));
const [review, handoff, latest] = await Promise.all([
  readJson(reviewFile),
  readJson('audit/unresolved-latest.json'),
  readJson('audit/latest.json'),
]);

const failures = [];
const warnings = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

check(Boolean(review?.handoffGeneratedAt), 'handoff: review.handoffGeneratedAt missing');
check(review?.handoffGeneratedAt === handoff?.generatedAt,
  `handoff: review generation ${review?.handoffGeneratedAt || '-'} != compact handoff ${handoff?.generatedAt || '-'}`);
check(Boolean(handoff?.generatedAt) && latest?.generatedAt === handoff.generatedAt,
  'handoff: latest diagnostic and compact generation mismatch');

const unresolved = Array.isArray(handoff?.unresolved) ? handoff.unresolved : [];
check(Array.isArray(handoff?.unresolved), 'handoff: unresolved array missing');
check(Number.isSafeInteger(handoff?.summary?.unresolved) && handoff.summary.unresolved === unresolved.length,
  `handoff: summary.unresolved ${handoff?.summary?.unresolved} != unresolved[] length ${unresolved.length}`);
check(Number.isSafeInteger(latest?.summary?.unresolved) && latest.summary.unresolved === unresolved.length,
  'handoff: latest diagnostic unresolved count differs from compact candidate array');

for (const key of ['criticalSourceFailures','sourceFamilyGaps','sourceCoverageAnomalies','historicalCoverageLosses']) {
  check(Number.isSafeInteger(handoff?.discoveryGate?.[key]) && handoff.discoveryGate[key] === 0,
    `discovery: ${key} must be an explicit integer zero, not missing or unhealthy`);
  check(Number.isSafeInteger(latest?.summary?.[key]) && latest.summary[key] === handoff?.discoveryGate?.[key],
    `discovery: diagnostic/compact ${key} mismatch`);
}

const expectedByDoi = new Map(unresolved.map(item => [normalizeDoi(item?.doi), item]));
check(!expectedByDoi.has('') && expectedByDoi.size === unresolved.length, 'handoff: empty or duplicate candidate DOI');
const decisions = Array.isArray(review?.decisions) ? review.decisions : [];
const decisionDois = decisions.map(item => normalizeDoi(item?.doi)).filter(Boolean);
check(decisions.length === unresolved.length,
  `semantic: decisions ${decisions.length} != unresolved candidates ${unresolved.length}`);
check(new Set(decisionDois).size === decisionDois.length, 'semantic: duplicate DOI decision');
for (const doi of expectedByDoi.keys()) {
  check(decisionDois.includes(doi), `semantic: missing decision for ${doi}`);
}
for (const doi of decisionDois) {
  check(expectedByDoi.has(doi), `semantic: decision DOI not present in current handoff: ${doi}`);
}

let includeCount = 0;
let excludeCount = 0;
let pendingCount = 0;
for (const item of decisions) {
  const doi = normalizeDoi(item?.doi);
  const decision = String(item?.decision || '').toLowerCase();
  const candidate = expectedByDoi.get(doi);
  check(['include','exclude','pending'].includes(decision), `semantic: invalid decision for ${doi}`);
  check(Boolean(String(item?.title || candidate?.title || '').trim()), `semantic: title missing for ${doi}`);
  if (decision === 'include') includeCount += 1;
  if (decision === 'exclude') excludeCount += 1;
  if (decision === 'pending') pendingCount += 1;

  const needsChallenge = decision === 'include' || (decision === 'exclude' && candidate?.reviewPriority === 'high');
  if (needsChallenge) {
    check(String(item?.evidenceBasis || '').trim().length >= 40, `semantic: evidenceBasis missing/too short for ${doi}`);
    check(String(item?.challengeReason || '').trim().length >= 30, `semantic: challengeReason missing/too short for ${doi}`);
    check(String(item?.challengeDecision || '').toLowerCase() === decision,
      `semantic: challenge decision does not confirm final decision for ${doi}`);
  }
}

check(review?.qualityControl?.secondPassCompleted === true, 'semantic: secondPassCompleted != true');
check(Number(review?.qualityControl?.unresolvedDisagreements ?? 0) === 0,
  'semantic: unresolvedDisagreements != 0');
check(review?.qualityControl?.allHandoffCandidatesReviewed !== false,
  'semantic: allHandoffCandidatesReviewed explicitly false');

if (Number.isFinite(review?.reviewed)) check(review.reviewed === decisions.length, 'semantic: reviewed count mismatch');
if (Number.isFinite(review?.acceptedCount)) check(review.acceptedCount === includeCount, 'semantic: acceptedCount mismatch');
if (Number.isFinite(review?.rejectedCount)) check(review.rejectedCount === excludeCount, 'semantic: rejectedCount mismatch');
if (Number.isFinite(review?.pendingCount)) check(review.pendingCount === pendingCount, 'semantic: pendingCount mismatch');

const endDate = String(handoff?.endDate || '').trim();
const activeNames = TARGET_JOURNALS
  .filter(journal => !journal.activeFrom || !endDate || journal.activeFrom <= endDate)
  .map(journal => journal.name);
const handoffActiveNames = (handoff?.activeJournals || []).map(row => String(row?.name || '')).filter(Boolean);
check(activeNames.length === handoffActiveNames.length &&
  activeNames.every(name => handoffActiveNames.includes(name)),
  'discovery: compact handoff active journal set differs from canonical registry');

const sourceChecks = Array.isArray(review?.sourceChecks) ? review.sourceChecks : [];
const sourceMap = new Map(sourceChecks.map(row => [String(row?.journal || ''), row]));
for (const journal of activeNames) {
  const row = sourceMap.get(journal);
  check(Boolean(row), `discovery: missing publisher sourceChecks row for ${journal}`);
  if (!row) continue;
  const status = String(row.status || '').toLowerCase();
  check(['checked','blocked','unavailable'].includes(status),
    `discovery: invalid sourceChecks status for ${journal}: ${row.status || '-'}`);
  check(String(row.sourceType || '').trim().length >= 3,
    `discovery: sourceType missing for ${journal}`);
  if (status === 'checked') {
    check(Number.isFinite(row.candidateCount) && row.candidateCount >= 0,
      `discovery: checked publisher candidateCount invalid for ${journal}`);
    check(Number.isFinite(row.syntheticTitleCount) && row.syntheticTitleCount >= 0,
      `discovery: checked publisher syntheticTitleCount invalid for ${journal}`);
    check(/^https?:\/\//i.test(String(row.sourcePage || '').trim()),
      `discovery: checked publisher sourcePage missing/invalid for ${journal}`);
    check(!/crossref|openalex/i.test(String(row.sourceType || '')),
      `discovery: machine metadata source mislabeled as publisher live check for ${journal}`);
  } else {
    const countValid = row.candidateCount == null || (Number.isFinite(row.candidateCount) && row.candidateCount >= 0);
    const synthValid = row.syntheticTitleCount == null || (Number.isFinite(row.syntheticTitleCount) && row.syntheticTitleCount >= 0);
    check(countValid, `discovery: invalid blocked/unavailable candidateCount for ${journal}`);
    check(synthValid, `discovery: invalid blocked/unavailable syntheticTitleCount for ${journal}`);
    check(String(row.reason || '').trim().length >= 16,
      `discovery: blocked/unavailable reason missing for ${journal}`);
    warnings.push(`publisher live source ${status}: ${journal}`);
  }
}

check(sourceMap.size >= activeNames.length, 'discovery: sourceChecks does not cover all active journals');

// A well-formed pending review is valid staging, but is never a release-ready review.
const claimsReady = review?.readyToPublish === true || review?.status === 'ready_to_publish' || review?.phase === 'ready_to_publish';
const openEvidenceGaps = review?.qualityControl?.openEvidenceGaps;
const hasOpenEvidenceGaps = openEvidenceGaps != null && (!Number.isSafeInteger(openEvidenceGaps) || openEvidenceGaps !== 0);
const finalized = includeCount + excludeCount === unresolved.length;
if (claimsReady) {
  check(pendingCount === 0, 'readiness: review claims ready_to_publish while pending decisions remain');
  check(!hasOpenEvidenceGaps, 'readiness: review claims ready_to_publish with open/invalid evidence gaps');
  check(review?.qualityControl?.allHandoffCandidatesFinalized !== false && finalized,
    'readiness: review claims ready_to_publish without finalized handoff decisions');
  check(review?.readyToPublish !== false, 'readiness: contradictory ready status and readyToPublish=false');
}
const validationOk = failures.length === 0;
const readinessBlockers = [];
if (!validationOk) readinessBlockers.push('validation_failed');
if (pendingCount > 0) readinessBlockers.push('pending_evidence');
if (hasOpenEvidenceGaps) readinessBlockers.push('open_evidence_gaps');
if (!finalized || review?.qualityControl?.allHandoffCandidatesFinalized === false) readinessBlockers.push('unfinalized_candidates');
if (!claimsReady || review?.readyToPublish === false) readinessBlockers.push('staging_not_marked_ready');
const readyToPublish = validationOk && readinessBlockers.length === 0;

const result = {
  ok: validationOk && (!requireReady || readyToPublish),
  validationOk,
  readyToPublish,
  validationMode: requireReady ? 'require-ready' : 'staging',
  readinessBlockers,
  reviewFile,
  publicationSlot: review?.publicationSlot || null,
  handoffGeneratedAt: handoff?.generatedAt || null,
  unresolvedCandidates: unresolved.length,
  decisions: decisions.length,
  includeCount,
  excludeCount,
  pendingCount,
  activeJournals: activeNames.length,
  failures,
  warnings,
  note: 'Review readiness alone does not authorize an off-slot publication or prove deployment success; the fixed-slot release and production checks remain mandatory.',
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
