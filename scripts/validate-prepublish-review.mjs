import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';

const ROOT = process.cwd();
const reviewFile = process.argv[2] || process.env.PREPUBLISH_FILE;
if (!reviewFile) {
  console.error('Usage: node scripts/validate-prepublish-review.mjs <audit/prepublish-review-...json>');
  process.exit(2);
}

const normalizeDoi = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
  .replace(/^doi:\s*/i, '')
  .replace(/[?#].*$/, '');

const readJson = async file => JSON.parse(await readFile(path.resolve(ROOT, file), 'utf8'));
const [review, handoff] = await Promise.all([
  readJson(reviewFile),
  readJson('audit/unresolved-latest.json'),
]);

const failures = [];
const warnings = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

check(Boolean(review?.handoffGeneratedAt), 'handoff: review.handoffGeneratedAt missing');
check(review?.handoffGeneratedAt === handoff?.generatedAt,
  `handoff: review generation ${review?.handoffGeneratedAt || '-'} != compact handoff ${handoff?.generatedAt || '-'}`);

const unresolved = Array.isArray(handoff?.unresolved) ? handoff.unresolved : [];
check(Number(handoff?.summary?.unresolved) === unresolved.length,
  `handoff: summary.unresolved ${handoff?.summary?.unresolved} != unresolved[] length ${unresolved.length}`);

for (const key of ['criticalSourceFailures','sourceFamilyGaps','sourceCoverageAnomalies','historicalCoverageLosses']) {
  check(Number(handoff?.discoveryGate?.[key] ?? 0) === 0, `discovery: ${key} > 0`);
}

const expectedByDoi = new Map(unresolved.map(item => [normalizeDoi(item?.doi), item]));
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

const result = {
  ok: failures.length === 0,
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
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
