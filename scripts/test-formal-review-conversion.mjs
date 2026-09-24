import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';
import { convertPrepublishReview, serialize, gitBlobSha, nextPublicationSlot } from './convert-prepublish-review.mjs';
import { validateFormalPartition } from './validate-pages-literature-authorization.mjs';

// Only isolated synthetic data and loopback-free child processes. No production writes/network.
const script = fileURLToPath(new URL('./convert-prepublish-review.mjs', import.meta.url));
const options = { generatedAt: '2026-09-22T14:42:00.000Z' };
const metrics = { criticalSourceFailures: 0, sourceFamilyGaps: 0, sourceCoverageAnomalies: 0, historicalCoverageLosses: 0 };
const evidence = 'Synthetic fixture evidence describes a preparative scope or a documented evidence gap; it is not a real research finding.';
const challenge = 'Synthetic challenge records the same outcome using the fixture evidence only.';
function fixture() {
  const input = [
    { doi: '10.99999/converter-include', journal: 'JACS', date: '2026-09-22', title: 'Synthetic general organic methodology', reviewPriority: 'high', authors: ['Synthetic Author'], abstract: evidence },
    { doi: '10.99999/converter-exclude', journal: 'Angew', date: '2026-09-22', title: 'Synthetic material characterization article', reviewPriority: 'normal', authors: ['Synthetic Author B'] },
    { doi: '10.99999/converter-pending', journal: 'CCS Chemistry', date: '2026-09-22', title: 'Synthetic ambiguous paired electrochemistry article', reviewPriority: 'high', abstract: '' },
  ];
  const active = TARGET_JOURNALS.filter(row => row.activeFrom <= '2026-09-22');
  const handoff = { generatedAt: '2026-09-22T09:35:00.000Z', endDate: '2026-09-22',
    summary: { unresolved: 3, ...metrics }, discoveryGate: metrics,
    activeJournals: active.map(row => ({ name: row.name })), unresolved: input };
  const decisions = input.map((row, i) => ({ doi: row.doi, title: row.title,
    decision: ['include', 'exclude', 'pending'][i], firstPassDecision: ['include', 'exclude', 'pending'][i],
    challengeDecision: ['include', 'exclude', 'pending'][i], evidenceBasis: evidence, challengeReason: challenge }));
  Object.assign(decisions[2], { evidenceNeeded: 'Obtain the missing synthetic product and substrate scope evidence from the fixture publisher.',
    attemptedEvidencePages: ['https://example.invalid/fixture-paper'], nextAction: 'Recheck the missing preparative scope evidence at the next fixed review slot.' });
  const staging = {
    publicationSlot: '2026-09-22T18:00:00+08:00', handoffGeneratedAt: handoff.generatedAt,
    updatedAt: '2026-09-22T09:40:00.000Z', status: 'incomplete_review', readyToPublish: false,
    reviewed: 3, acceptedCount: 1, rejectedCount: 1, pendingCount: 1,
    summary: { reviewed: 3, accepted: 1, rejected: 1, pending: 1 }, decisions,
    qualityControl: { secondPassCompleted: true, unresolvedDisagreements: 0,
      allHandoffCandidatesReviewed: true, allHandoffCandidatesFinalized: false, openEvidenceGaps: 1 },
    sourceChecks: active.map(row => ({ journal: row.name, status: 'checked', candidateCount: 1, syntheticTitleCount: 1,
      sourceType: 'publisher-fixture-list', sourcePage: 'https://example.invalid/synthetic-list' })),
  };
  return { staging, handoff, latest: { generatedAt: handoff.generatedAt, endDate: handoff.endDate, summary: handoff.summary } };
}
const passed = [];
function test(name, fn) { fn(); passed.push(name); }
function rejected(name, mutate, pattern) {
  test(name, () => { const data = fixture(); mutate(data); assert.throws(() => convertPrepublishReview(data.staging, data.handoff, options), pattern); });
}
let data = fixture();
test('exact_partition_reason_mapping_and_source_metadata_preserved', () => {
  const saved = serialize(data), out = convertPrepublishReview(data.staging, data.handoff, options);
  assert.equal(serialize(data), saved);
  assert.deepEqual(out.formalReview.summary, data.staging.summary);
  assert.equal(out.formalReview.accepted[0].reason, evidence);
  assert.equal(out.formalReview.accepted[0].reasonDerivedFrom, 'evidenceBasis');
  assert.deepEqual(out.formalReview.accepted[0].authors, ['Synthetic Author']);
  assert.equal(out.formalReview.accepted[0].reviewPriority, 'high');
  assert.equal(out.formalReview.pending[0].date, '2026-09-22');
  assert.equal(out.formalReview.reviewComplete, false);
  assert.deepEqual(out.formalReview.sourceChecks, data.staging.sourceChecks);
  assert.deepEqual(out.markerFields.publishableDois, ['10.99999/converter-include']);
  assert.deepEqual(out.markerFields.deferredDois, ['10.99999/converter-pending']);
  assert.equal(out.pendingQueue.items[0].nextReviewSlot, '2026-09-23T08:00:00+08:00');
  assert.deepEqual(validateFormalPartition(data.staging, out.formalReview, out.markerFields, out.pendingQueue), []);
});
test('same_inputs_and_explicit_time_produce_identical_bytes', () => {
  assert.equal(serialize(convertPrepublishReview(data.staging, data.handoff, options)), serialize(convertPrepublishReview(data.staging, data.handoff, options)));
});
test('supplied_reason_and_unknown_publisher_counts_are_not_overwritten', () => {
  const f = fixture(); f.staging.decisions[0].reason = 'An explicit reviewer reason that must survive conversion unchanged.';
  f.staging.sourceChecks[0] = { journal: 'Nature', status: 'blocked', candidateCount: null, syntheticTitleCount: null,
    sourceType: 'publisher-fixture-list', reason: 'Synthetic source access is blocked; its counts are unknown.' };
  const out = convertPrepublishReview(f.staging, f.handoff, options);
  assert.equal(out.formalReview.accepted[0].reason, f.staging.decisions[0].reason);
  assert.equal(out.formalReview.sourceChecks[0].candidateCount, null);
});
test('obvious_normal_priority_exclude_can_use_concise_reason_without_detailed_evidence', () => {
  const f = fixture();
  f.staging.decisions[1].reason = 'Out of scope';
  f.staging.decisions[1].evidenceBasis = '';
  f.staging.decisions[1].challengeReason = '';
  const out = convertPrepublishReview(f.staging, f.handoff, options);
  assert.equal(out.formalReview.rejected[0].reason, 'Out of scope');
  assert.deepEqual(validateFormalPartition(f.staging, out.formalReview, out.markerFields, out.pendingQueue), []);
});
test('doi_normalization_does_not_drop_a_partition', () => {
  const f = fixture(); f.staging.decisions[0].doi = 'https://doi.org/10.99999/CONVERTER-INCLUDE';
  assert.equal(convertPrepublishReview(f.staging, f.handoff, options).formalReview.accepted[0].doi, '10.99999/converter-include');
});
test('formal_challenge_needs_no_private_decision_property', () => {
  const out = convertPrepublishReview(data.staging, data.handoff, options);
  assert.equal(out.formalReview.accepted[0]._decision, undefined);
  assert.equal(out.formalReview.accepted[0].challengeDecision, 'include');
  assert.deepEqual(validateFormalPartition(data.staging, out.formalReview, out.markerFields, out.pendingQueue), []);
});
test('bundle_blob_hash_matches_git_hash_object_for_exact_utf8_bytes', () => {
  const out = convertPrepublishReview(data.staging, data.handoff, options);
  const serialized = serialize(out.formalReview);
  const git = spawnSync('git', ['hash-object', '--stdin'], { input: serialized, encoding: 'utf8', timeout: 5000 });
  assert.equal(git.status, 0); assert.equal(out.markerFields.reviewBlobSha, git.stdout.trim());
  assert.equal(gitBlobSha(serialize(out.pendingQueue)), out.markerFields.pendingQueueBlobSha);
});
test('next_fixed_slot_handles_morning_and_year_rollover', () => {
  assert.equal(nextPublicationSlot('2026-09-23T08:00:00+08:00'), '2026-09-23T18:00:00+08:00');
  assert.equal(nextPublicationSlot('2026-12-31T18:00:00+08:00'), '2027-01-01T08:00:00+08:00');
  assert.throws(() => nextPublicationSlot('2026-02-30T08:00:00+08:00'), /invalid_publication_slot/);
});
rejected('missing_candidate_is_not_a_deferral', f => f.staging.decisions.pop(), /complete_candidate_partition_required/);
rejected('duplicate_candidate_rejected', f => { f.handoff.unresolved[1].doi = f.handoff.unresolved[0].doi; }, /duplicate_candidate/);
rejected('duplicate_decision_rejected', f => { f.staging.decisions[1].doi = f.staging.decisions[0].doi; }, /complete_candidate_partition_required/);
rejected('generation_mismatch_rejected', f => { f.staging.handoffGeneratedAt = '2026-09-22T09:30:00Z'; }, /generation_mismatch/);
rejected('staging_summary_mismatch_rejected', f => { f.staging.summary.pending = 0; }, /count_mismatch/);
rejected('staging_allowlist_cannot_hide_pending', f => { f.staging.pendingDois = []; }, /decision_allowlist_mismatch/);
rejected('final_challenge_disagreement_rejected', f => { f.staging.decisions[0].challengeDecision = 'exclude'; }, /final_decision_not_confirmed/);
rejected('missing_first_pass_not_invented', f => { delete f.staging.decisions[0].firstPassDecision; }, /two_pass_outcomes_missing/);
rejected('missing_evidence_not_invented', f => { delete f.staging.decisions[0].evidenceBasis; }, /reason_missing/);
test('short_supplied_reason_is_preserved_when_detailed_evidence_is_present', () => {
  const f = fixture(); f.staging.decisions[0].reason = 'short';
  const out = convertPrepublishReview(f.staging, f.handoff, options);
  assert.equal(out.formalReview.accepted[0].reason, 'short');
});
rejected('pending_requires_specific_missing_evidence', f => { delete f.staging.decisions[2].evidenceNeeded; }, /pending_evidence_needed_missing/);
rejected('pending_requires_attempted_sources', f => { delete f.staging.decisions[2].attemptedEvidencePages; }, /pending_attempted_sources_missing/);
rejected('date_changes_require_reconciliation', f => { f.staging.decisions[0].date = '2026-09-21'; }, /date_changed_without_reconciliation/);
rejected('missing_gap_metric_is_not_zero', f => { delete f.staging.qualityControl.openEvidenceGaps; }, /evidence_gap_count_missing/);
rejected('unaccounted_gaps_rejected', f => { f.staging.qualityControl.openEvidenceGaps = 2; }, /unaccounted_evidence_gaps/);
rejected('missing_disagreement_metric_is_not_zero', f => { delete f.staging.qualityControl.unresolvedDisagreements; }, /disagreement_count_missing/);
rejected('conversion_timestamp_cannot_predate_evidence', f => { f.staging.updatedAt = '2026-09-23T09:00:00Z'; }, /conversion_time_predates_input/);
rejected('unread_candidates_not_invented_as_reviewed', f => { delete f.staging.qualityControl.allHandoffCandidatesReviewed; }, /all_candidates_reviewed_flag_required/);
rejected('global_source_block_not_ignored', f => { f.staging.status = 'source_gap'; }, /global_review_block/);
test('full_finalized_batch_has_empty_deferred_queue', () => {
  const f = fixture(); f.staging.decisions[2].decision = f.staging.decisions[2].firstPassDecision = f.staging.decisions[2].challengeDecision = 'exclude';
  f.staging.summary.rejected = f.staging.rejectedCount = 2; f.staging.summary.pending = f.staging.pendingCount = 0;
  f.staging.qualityControl.openEvidenceGaps = 0; f.staging.qualityControl.allHandoffCandidatesFinalized = true;
  const out = convertPrepublishReview(f.staging, f.handoff, options);
  assert.equal(out.formalReview.reviewComplete, true); assert.deepEqual(out.pendingQueue.items, []);
});

const root = await mkdtemp(path.join(tmpdir(), 'gallery-conversion-test-'));
const inputPath = 'audit/prepublish-review-2026-09-22-1800.json';
async function cli(f, strict) {
  await mkdir(path.join(root, 'audit'), { recursive: true });
  const inputs = [[inputPath, f.staging], ['audit/unresolved-latest.json', f.handoff], ['audit/latest.json', f.latest]];
  for (const [file, value] of inputs) await writeFile(path.join(root, file), serialize(value));
  const before = await readdir(path.join(root, 'audit'));
  const child = spawnSync(process.execPath, [script, inputPath, ...(strict ? ['--require-ready'] : [])], {
    cwd: root, encoding: 'utf8', timeout: 65000, maxBuffer: 4 * 1024 * 1024,
  });
  if (child.error) throw child.error;
  assert.deepEqual(await readdir(path.join(root, 'audit')), before);
  for (const [file, value] of inputs) assert.equal(await readFile(path.join(root, file), 'utf8'), serialize(value));
  return { exit: child.status, body: JSON.parse(child.stdout) };
}
try {
  let result = await cli(fixture(), false);
  assert.equal(result.exit, 0, JSON.stringify(result.body));
  assert.equal(result.body.conversionValid, true); assert.equal(result.body.publicationReady, false);
  assert.equal(result.body.mode, 'preview-only'); assert.equal(result.body.productionDataModified, false);
  passed.push('cli_preview_preserves_input_bytes_and_never_claims_publication');
  result = await cli(fixture(), true);
  assert.equal(result.exit, 0, JSON.stringify(result.body)); assert.equal(result.body.publicationReady, true);
  assert.equal(result.body.formalReview.pending.length, 1);
  passed.push('cli_target_slot_preflight_supports_documented_per_doi_release');
  const stale = fixture(); stale.staging.publicationSlot = '2026-09-23T08:00:00+08:00';
  result = await cli(stale, true);
  assert.equal(result.exit, 1); assert.equal(result.body.conversionValid, false);
  assert.match(result.body.error, /preflight_failed/);
  assert.equal(result.body.formalReview, undefined);
  passed.push('cli_stale_snapshot_cannot_produce_strict_release_bundle');
  console.log(serialize({ ok: true, tests: passed.length, passed, productionDataModified: false, networkRequests: false,
    note: 'Strict CLI validates eligibility for the fixture target slot, not permission for an off-slot commit. No real article or publication is changed.' }));
} finally { await rm(root, { recursive: true, force: true }); }
