import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';

// Isolated synthetic fixtures. Never modify public data, real review records, or contact a publisher.
const temp = await mkdtemp(path.join(tmpdir(), 'gallery-per-doi-'));
const reviewFile = 'audit/prepublish-review-2026-09-23-0800.json';
const metrics = { criticalSourceFailures: 0, sourceFamilyGaps: 0, sourceCoverageAnomalies: 0, historicalCoverageLosses: 0 };
const active = TARGET_JOURNALS.filter(row => row.activeFrom <= '2026-09-23');
const pd = '10.5555/per-doi-pending-fixture';
function fixture() {
  const decisions = Array.from({ length: 25 }, (_, i) => {
    const decision = i < 9 ? 'include' : 'exclude';
    return { doi: `10.5555/per-doi-fixture-${i}`, title: `Isolated synthetic test ${i}`, journal: 'JACS', date: '2026-09-23',
      firstPassDecision: decision, decision, challengeDecision: decision,
      evidenceBasis: 'Synthetic fixture evidence only: preparative methodology for the included items and unrelated applications for the excluded items.',
      challengeReason: 'The separate synthetic challenge confirms the fixture decision; this is not a real literature finding.' };
  });
  decisions.push({ doi: pd, title: 'Isolated evidence-gap fixture', journal: 'CCS Chemistry', date: '2026-09-23',
    firstPassDecision: 'pending', decision: 'pending', challengeDecision: 'pending',
    evidenceBasis: 'Only DOI-matched metadata is available in this synthetic fixture; attempted publisher access did not establish preparative scope.',
    challengeReason: 'Both possible final outcomes remain unsupported, so the isolated fixture remains pending rather than being guessed.',
    evidenceNeeded: 'Obtain the DOI-matched publisher abstract and preparative substrate-scope evidence.',
    attemptedEvidencePages: ['https://example.invalid/pending-fixture'], publicationBlocked: true });
  const handoff = { generatedAt: '2026-09-22T23:35:00.000Z', endDate: '2026-09-23',
    summary: { unresolved: 26, ...metrics }, discoveryGate: { ...metrics },
    activeJournals: active.map(row => ({ name: row.name })),
    unresolved: decisions.map(row => ({ doi: row.doi, title: row.title, journal: row.journal, reviewPriority: 'high' })) };
  const review = { publicationSlot: '2026-09-23T08:00:00+08:00', handoffGeneratedAt: handoff.generatedAt,
    phase: 'preparing', status: 'incomplete_review', readyToPublish: false,
    reviewed: 26, acceptedCount: 9, rejectedCount: 16, pendingCount: 1,
    decisions, pendingDois: [pd], remainingDois: [pd], remainingUnresolved: [pd],
    qualityControl: { secondPassCompleted: true, unresolvedDisagreements: 0,
      allHandoffCandidatesReviewed: true, allHandoffCandidatesFinalized: false, openEvidenceGaps: 1 },
    sourceChecks: active.map(row => ({ journal: row.name, status: 'checked', candidateCount: 1, syntheticTitleCount: 1,
      sourceType: 'publisher-synthetic-fixture', sourcePage: 'https://example.invalid/fixture' })) };
  return { review, handoff, latest: { generatedAt: handoff.generatedAt, endDate: handoff.endDate, summary: { ...handoff.summary } } };
}
async function run(data, script = 'check-prepublish-readiness.mjs', allow = true) {
  await mkdir(path.join(temp, 'audit'), { recursive: true });
  for (const [file, value] of [[reviewFile, data.review], ['audit/unresolved-latest.json', data.handoff], ['audit/latest.json', data.latest]]) {
    await writeFile(path.join(temp, file), JSON.stringify(value));
  }
  const child = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), reviewFile, '--require-ready', ...(allow ? ['--allow-deferred'] : [])], {
    cwd: temp, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, PREPUBLISH_REQUIRE_READY: '0' },
  });
  if (child.error) throw child.error;
  return { exit: child.status, body: JSON.parse(child.stdout || '{}') };
}
const passed = [];
try {
  let data = fixture(), result = await run(data);
  assert.equal(result.exit, 0);
  assert.equal(result.body.publicationReady, true);
  assert.equal(result.body.reviewComplete, false);
  assert.equal(result.body.releaseStatus, 'ready_with_pending');
  assert.equal(result.body.publishableDois.length, 9);
  assert.deepEqual(result.body.deferredDois, [pd]);
  assert.ok(!result.body.publishableDois.includes(pd));
  passed.push('nine_includes_release_one_pending_is_quarantined');

  result = await run(fixture(), 'validate-prepublish-review.mjs');
  assert.equal(result.exit, 0);
  assert.equal(result.body.readyToPublish, true);
  passed.push('per_doi_semantic_readiness_passes');
  result = await run(fixture(), 'validate-prepublish-review.mjs', false);
  assert.equal(result.exit, 1);
  passed.push('full_review_closure_still_incomplete');

  data = fixture(); data.review.decisions.pop(); data.review.reviewed--;
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('omitted_candidate_still_blocks');

  data = fixture(); delete data.review.decisions[25].evidenceNeeded;
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('unexplained_pending_cannot_hide_unreviewed_work');

  data = fixture(); data.review.remainingUnresolved = [];
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('pending_backlog_cannot_be_silently_cleared');

  data = fixture(); data.review.decisions[0].challengeDecision = 'exclude';
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('unconfirmed_include_never_enters_allowlist');

  data = fixture();
  data.handoff.discoveryGate.criticalSourceFailures = data.handoff.summary.criticalSourceFailures = data.latest.summary.criticalSourceFailures = 1;
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('global_source_failure_still_blocks');

  data = fixture();
  data.handoff.discoveryGate.sourceCoverageAnomalies = data.handoff.summary.sourceCoverageAnomalies = data.latest.summary.sourceCoverageAnomalies = 1;
  const warnedJournal = data.handoff.activeJournals.find(row => row.name === 'JACS');
  warnedJournal.sourceHealth = { coverageWarning: true, crossrefHealthy: true, openAlexHealthy: true };
  result = await run(data); assert.equal(result.exit, 0);
  assert.equal(result.body.publicationReady, true); assert.equal(result.body.publishableDois.length, 9);
  assert.equal(result.body.sourceCoverageAnomalies, 1);
  passed.push('healthy_cross_source_coverage_warning_does_not_block_reviewed_dois');

  data = fixture(); data.latest.generatedAt = '2026-09-22T23:36:00Z';
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('snapshot_generation_mismatch_still_blocks');

  data = fixture();
  data.review.handoffGeneratedAt = data.handoff.generatedAt = data.latest.generatedAt = '2026-09-22T13:37:57.398Z';
  data.handoff.endDate = data.latest.endDate = '2026-09-22';
  result = await run(data);
  assert.equal(result.exit, 1); assert.equal(result.body.semanticReady, true); assert.equal(result.body.snapshotFreshForSlot, false);
  passed.push('old_snapshot_only_fails_freshness_not_single_pending');

  data = fixture(); data.review.publicationSlot = '2026-09-23T08:05:00+08:00';
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('off_slot_remains_forbidden');

  data = fixture(); data.review.publicationSlot = '2026-09-23T18:00:00+08:00';
  data.review.handoffGeneratedAt = data.handoff.generatedAt = data.latest.generatedAt = '2026-09-23T09:35:00.000Z';
  result = await run(data); assert.equal(result.exit, 0);
  passed.push('evening_has_identical_per_doi_rules');

  data = fixture();
  data.review.decisions = [data.review.decisions[25]]; data.handoff.unresolved = [data.handoff.unresolved[25]];
  data.review.reviewed = data.handoff.summary.unresolved = data.latest.summary.unresolved = 1;
  data.review.acceptedCount = data.review.rejectedCount = 0;
  result = await run(data); assert.equal(result.exit, 1); assert.equal(result.body.reviewComplete, false);
  passed.push('only_pending_is_not_final_zero');

  data = fixture(); data.review.globalBlockers = ['write_authorization_missing'];
  result = await run(data); assert.equal(result.exit, 1);
  passed.push('explicit_global_blocker_is_not_ignored');

  console.log(JSON.stringify({ ok: true, passed, tests: passed.length, productionDataModified: false, networkRequests: false }, null, 2));
} finally { await rm(temp, { recursive: true, force: true }); }
