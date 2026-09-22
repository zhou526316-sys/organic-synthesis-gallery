import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const reviewFile = args.find(arg => !arg.startsWith('--')) || process.env.PREPUBLISH_FILE;
const requireReady = args.includes('--require-ready') || process.env.PREPUBLISH_REQUIRE_READY === '1';
// Publication uses this mode; the default strict mode remains useful for full-review closure.
const allowDeferred = args.includes('--allow-deferred');
if (!reviewFile) {
  console.error('Usage: node scripts/validate-prepublish-review.mjs <review.json> [--require-ready] [--allow-deferred]');
  process.exit(2);
}
const normalizeDoi = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
const readJson = async file => JSON.parse(await readFile(path.resolve(ROOT, file), 'utf8'));
const [review, handoff, latest] = await Promise.all([
  readJson(reviewFile), readJson('audit/unresolved-latest.json'), readJson('audit/latest.json'),
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
  'handoff: compact unresolved count differs from candidate array');
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
check(Array.isArray(review?.decisions), 'semantic: decisions array missing');
const decisionDois = decisions.map(item => normalizeDoi(item?.doi)).filter(Boolean);
check(decisions.length === unresolved.length, 'semantic: decision count differs from complete handoff');
check(new Set(decisionDois).size === decisions.length, 'semantic: duplicate or empty DOI decision');
for (const doi of expectedByDoi.keys()) check(decisionDois.includes(doi), `semantic: missing decision for ${doi}`);
for (const doi of decisionDois) check(expectedByDoi.has(doi), `semantic: DOI absent from current handoff: ${doi}`);

const included = [], excluded = [], deferred = [];
let scopedDisagreements = 0;
for (const item of decisions) {
  const doi = normalizeDoi(item?.doi);
  const decision = String(item?.decision || '').toLowerCase();
  const candidate = expectedByDoi.get(doi);
  check(['include','exclude','pending'].includes(decision), `semantic: invalid decision for ${doi}`);
  check(Boolean(String(item?.title || candidate?.title || '').trim()), `semantic: title missing for ${doi}`);
  if (decision === 'include') included.push(doi);
  if (decision === 'exclude') excluded.push(doi);
  if (decision === 'pending') deferred.push(doi);
  const needsChallenge = decision === 'include' || (decision === 'exclude' && candidate?.reviewPriority === 'high');
  if (needsChallenge) {
    check(String(item?.evidenceBasis || '').trim().length >= 40, `semantic: evidenceBasis missing/too short for ${doi}`);
    check(String(item?.challengeReason || '').trim().length >= 30, `semantic: challengeReason missing/too short for ${doi}`);
    check(String(item?.challengeDecision || '').toLowerCase() === decision,
      `semantic: challenge decision does not confirm final decision for ${doi}`);
    if (item.firstPassDecision != null) check(item.firstPassDecision === decision, `semantic: first pass not confirmed for ${doi}`);
  }
  if (allowDeferred && decision === 'pending') {
    // A skipped/unread paper cannot be disguised as a documented evidence-gap deferral.
    check(String(item.evidenceBasis || '').trim().length >= 40, `deferred: evidenceBasis missing for ${doi}`);
    check(String(item.challengeReason || '').trim().length >= 30, `deferred: challengeReason missing for ${doi}`);
    check(String(item.evidenceNeeded || item.nextAction || '').trim().length >= 16, `deferred: missing evidence/retry action for ${doi}`);
    const pages = item.attemptedEvidencePages || item.evidencePages || [];
    check(Array.isArray(pages) && pages.some(url => /^https?:\/\//i.test(String(url))), `deferred: attempted evidence source missing for ${doi}`);
    const first = String(item.firstPassDecision || '').toLowerCase();
    const second = String(item.challengeDecision || '').toLowerCase();
    check(['include','exclude','pending'].includes(first) && ['include','exclude','pending'].includes(second),
      `deferred: two-pass outcomes missing for ${doi}`);
    if (first !== second) scopedDisagreements += 1;
  }
}
const includeCount = included.length, excludeCount = excluded.length, pendingCount = deferred.length;
check(review?.qualityControl?.secondPassCompleted === true, 'semantic: secondPassCompleted != true');
const reportedDisagreements = review?.qualityControl?.unresolvedDisagreements;
check(Number.isSafeInteger(reportedDisagreements) && reportedDisagreements === (allowDeferred ? scopedDisagreements : 0),
  'semantic: disagreements must be zero or exactly accounted for by deferred DOI pairs');
check(review?.qualityControl?.allHandoffCandidatesReviewed !== false, 'semantic: unreviewed handoff candidates remain');
for (const [field, actual] of [['reviewed', decisions.length], ['acceptedCount', includeCount], ['rejectedCount', excludeCount], ['pendingCount', pendingCount]]) {
  if (review[field] != null) check(Number.isSafeInteger(review[field]) && review[field] === actual, `semantic: ${field} mismatch`);
}
if (allowDeferred) {
  for (const key of ['pendingDois', 'remainingDois', 'remainingUnresolved']) {
    if (review[key] == null) continue;
    const rows = Array.isArray(review[key]) ? review[key].map(normalizeDoi) : [];
    check(Array.isArray(review[key]) && rows.length === deferred.length && new Set(rows).size === rows.length
      && deferred.every(doi => rows.includes(doi)), `deferred: ${key} is not the exact pending DOI set`);
  }
}
const endDate = String(handoff?.endDate || '').trim();
const activeNames = TARGET_JOURNALS.filter(journal => !journal.activeFrom || !endDate || journal.activeFrom <= endDate).map(journal => journal.name);
const handoffActiveNames = (handoff?.activeJournals || []).map(row => String(row?.name || '')).filter(Boolean);
check(activeNames.length === handoffActiveNames.length && activeNames.every(name => handoffActiveNames.includes(name)),
  'discovery: compact journal set differs from canonical registry');
const sourceChecks = Array.isArray(review?.sourceChecks) ? review.sourceChecks : [];
const sourceMap = new Map(sourceChecks.map(row => [String(row?.journal || ''), row]));
check(sourceMap.size === sourceChecks.length, 'discovery: duplicate sourceChecks row');
for (const journal of activeNames) {
  const row = sourceMap.get(journal);
  check(Boolean(row), `discovery: missing publisher sourceChecks row for ${journal}`);
  if (!row) continue;
  const status = String(row.status || '').toLowerCase();
  check(['checked','blocked','unavailable'].includes(status), `discovery: invalid sourceChecks status for ${journal}`);
  check(String(row.sourceType || '').trim().length >= 3, `discovery: sourceType missing for ${journal}`);
  if (status === 'checked') {
    check(Number.isFinite(row.candidateCount) && row.candidateCount >= 0, `discovery: checked publisher candidateCount invalid for ${journal}`);
    check(Number.isFinite(row.syntheticTitleCount) && row.syntheticTitleCount >= 0, `discovery: checked publisher syntheticTitleCount invalid for ${journal}`);
    check(/^https?:\/\//i.test(String(row.sourcePage || '').trim()), `discovery: checked publisher sourcePage invalid for ${journal}`);
    check(!/crossref|openalex/i.test(String(row.sourceType || '')), `discovery: machine source mislabeled as publisher check for ${journal}`);
  } else {
    check(row.candidateCount == null || (Number.isFinite(row.candidateCount) && row.candidateCount >= 0), `discovery: invalid candidateCount for ${journal}`);
    check(row.syntheticTitleCount == null || (Number.isFinite(row.syntheticTitleCount) && row.syntheticTitleCount >= 0), `discovery: invalid syntheticTitleCount for ${journal}`);
    check(String(row.reason || '').trim().length >= 16, `discovery: blocked/unavailable reason missing for ${journal}`);
    warnings.push(`publisher live source ${status}: ${journal}`);
  }
}
check(sourceMap.size >= activeNames.length, 'discovery: sourceChecks does not cover all active journals');
const claimsReady = review?.readyToPublish === true || review?.status === 'ready_to_publish' || review?.phase === 'ready_to_publish';
const openEvidenceGaps = review?.qualityControl?.openEvidenceGaps;
const hasOpenEvidenceGaps = openEvidenceGaps != null && (!Number.isSafeInteger(openEvidenceGaps) || openEvidenceGaps < 0 || openEvidenceGaps > (allowDeferred ? pendingCount : 0));
const finalized = includeCount + excludeCount === unresolved.length;
if (claimsReady && !allowDeferred) {
  check(pendingCount === 0, 'readiness: full-review ready claim with pending decisions');
  check(!hasOpenEvidenceGaps, 'readiness: full-review ready claim with evidence gaps');
  check(review?.qualityControl?.allHandoffCandidatesFinalized !== false && finalized, 'readiness: full-review ready claim without finalized candidates');
  check(review?.readyToPublish !== false, 'readiness: contradictory ready status');
}
const validationOk = failures.length === 0;
const readinessBlockers = [];
if (!validationOk) readinessBlockers.push('validation_failed');
if (hasOpenEvidenceGaps) readinessBlockers.push('unaccounted_evidence_gaps');
if (Array.isArray(review.globalBlockers) && review.globalBlockers.length) readinessBlockers.push('global_blockers');
if (['needs_approval','blocked_by_concurrent_change','source_gap'].includes(review.status) || ['needs_approval','blocked_by_concurrent_change','source_gap'].includes(review.phase)) readinessBlockers.push('global_review_block');
if (allowDeferred) {
  if (pendingCount > 0 && includeCount === 0) readinessBlockers.push('no_publishable_includes_with_pending');
  // Legacy incomplete/false flags describe full-review closure, not the independently verified subset.
  if (pendingCount === 0 && (!claimsReady || review.readyToPublish === false)) readinessBlockers.push('staging_not_marked_ready');
  if (pendingCount > 0) warnings.push(`Deferred ${pendingCount} DOI(s); publish only the explicit publishableDois allowlist. Review closure remains incomplete.`);
} else {
  if (pendingCount > 0) readinessBlockers.push('pending_evidence');
  if (!finalized || review?.qualityControl?.allHandoffCandidatesFinalized === false) readinessBlockers.push('unfinalized_candidates');
  if (!claimsReady || review.readyToPublish === false) readinessBlockers.push('staging_not_marked_ready');
}
const readyToPublish = validationOk && readinessBlockers.length === 0;
const result = {
  ok: validationOk && (!requireReady || readyToPublish), validationOk, readyToPublish,
  releasePolicy: allowDeferred ? 'per-doi' : 'full-review-closure',
  reviewComplete: validationOk && finalized && !hasOpenEvidenceGaps,
  releaseStatus: readyToPublish ? (pendingCount ? 'ready_with_pending' : 'ready_to_publish') : 'blocked',
  publishableDois: validationOk ? included : [], rejectedDois: validationOk ? excluded : [], deferredDois: deferred,
  validationMode: requireReady ? 'require-ready' : 'staging', readinessBlockers,
  reviewFile, publicationSlot: review?.publicationSlot || null, handoffGeneratedAt: handoff?.generatedAt || null,
  unresolvedCandidates: unresolved.length, decisions: decisions.length, includeCount, excludeCount, pendingCount,
  activeJournals: activeNames.length, failures, warnings,
  note: 'Only publishableDois may be added. Deferred papers remain pending in durable review/state backlog. Fixed-slot freshness, deployment checks and honest closure reporting remain mandatory.',
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
