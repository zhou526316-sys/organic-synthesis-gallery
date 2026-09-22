import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';

// Synthetic fixtures only: no real paper, production file or network request.
const script = fileURLToPath(new URL('./check-prepublish-readiness.mjs', import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), 'gallery-slot-readiness-'));
const reviewPath = 'audit/prepublish-review-2026-09-23-0800.json';
const freshAt = '2026-09-22T23:35:00.000Z';
const doi = '10.99999/synthetic-readiness-fixture';
const metrics = { criticalSourceFailures: 0, sourceFamilyGaps: 0, sourceCoverageAnomalies: 0, historicalCoverageLosses: 0 };
const names = TARGET_JOURNALS.filter(row => row.activeFrom <= '2026-09-23').map(row => row.name);
function fixture() {
  const handoff = {
    generatedAt: freshAt, endDate: '2026-09-23', summary: { unresolved: 1, ...metrics }, discoveryGate: { ...metrics },
    activeJournals: names.map(name => ({ name })),
    unresolved: [{ doi, title: 'Synthetic preparative methodology fixture', journal: 'JACS', reviewPriority: 'high' }],
  };
  const review = {
    publicationSlot: '2026-09-23T08:00:00+08:00', handoffGeneratedAt: freshAt,
    status: 'ready_to_publish', readyToPublish: true,
    qualityControl: { secondPassCompleted: true, unresolvedDisagreements: 0, allHandoffCandidatesFinalized: true, openEvidenceGaps: 0 },
    decisions: [{ doi, title: handoff.unresolved[0].title, decision: 'include', challengeDecision: 'include',
      evidenceBasis: 'Synthetic fixture only: the mock abstract describes a general preparative organic reaction, not a real research finding.',
      challengeReason: 'Synthetic challenge confirms the mock method scope for regression testing only.' }],
    sourceChecks: names.map(journal => ({ journal, status: 'checked', candidateCount: 1, syntheticTitleCount: 1,
      sourceType: 'publisher-latest-list', sourcePage: 'https://example.invalid/synthetic-fixture' })),
  };
  return { review, handoff, latest: { generatedAt: freshAt, endDate: '2026-09-23', summary: { ...handoff.summary } } };
}
async function run(data, strict = true) {
  await mkdir(path.join(temp, 'audit'), { recursive: true });
  for (const [file, value] of [[reviewPath, data.review], ['audit/unresolved-latest.json', data.handoff], ['audit/latest.json', data.latest]]) {
    await writeFile(path.join(temp, file), JSON.stringify(value));
  }
  const child = spawnSync(process.execPath, [script, reviewPath, ...(strict ? ['--require-ready'] : [])], {
    cwd: temp, encoding: 'utf8', timeout: 45000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, PREPUBLISH_REQUIRE_READY: '0' },
  });
  if (child.error) throw child.error;
  return { exit: child.status, body: JSON.parse(child.stdout) };
}
const passed = [];
try {
  let data = fixture();
  let result = await run(data);
  assert.equal(result.exit, 0);
  assert.equal(result.body.publicationReady, true);
  passed.push('fresh_complete_staging_is_ready');

  data = fixture();
  data.review.decisions[0].decision = data.review.decisions[0].challengeDecision = 'pending';
  data.review.readyToPublish = false;
  data.review.status = 'incomplete_review';
  result = await run(data, false);
  assert.equal(result.exit, 0);
  assert.equal(result.body.recordValidationPassed, true);
  assert.equal(result.body.publicationReady, false);
  result = await run(data);
  assert.equal(result.exit, 1);
  passed.push('record_success_is_not_pending_release_permission');

  data = fixture();
  data.review.handoffGeneratedAt = data.handoff.generatedAt = data.latest.generatedAt = '2026-09-22T13:37:57.398Z';
  data.handoff.endDate = data.latest.endDate = '2026-09-22';
  result = await run(data);
  assert.equal(result.exit, 1);
  assert.equal(result.body.snapshotFreshForSlot, false);
  passed.push('previous_evening_is_not_next_morning_audit');

  data = fixture();
  data.review.handoffGeneratedAt = data.handoff.generatedAt = data.latest.generatedAt = '2026-09-23T00:05:00.000Z';
  result = await run(data);
  assert.equal(result.exit, 1);
  assert.equal(result.body.snapshotFreshForSlot, false);
  passed.push('after_slot_discovery_cannot_be_backdated');

  data = fixture();
  data.review.publicationSlot = '2026-09-23T08:05:00+08:00';
  result = await run(data);
  assert.equal(result.exit, 1);
  assert.ok(result.body.blockers.includes('invalid_publication_slot'));
  passed.push('only_0800_and_1800_slots');

  data = fixture();
  data.review.decisions[0].decision = data.review.decisions[0].challengeDecision = 'exclude';
  data.review.sourceChecks[0] = { journal: names[0], status: 'blocked', candidateCount: null, syntheticTitleCount: null,
    sourceType: 'publisher-latest-list', reason: 'Synthetic access failure; complete publisher source evidence is unavailable.' };
  result = await run(data);
  assert.equal(result.exit, 1);
  assert.ok(result.body.blockers.includes('zero_new_requires_complete_publisher_source_proof'));
  passed.push('zero_new_requires_real_publisher_proof');

  console.log(JSON.stringify({ ok: true, syntheticFixtureTests: passed.length, passed, productionDataModified: false }, null, 2));
} finally {
  await rm(temp, { recursive: true, force: true });
}
