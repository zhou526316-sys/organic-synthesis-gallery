import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';

// All synthetic fixtures are isolated in a temporary directory. No production writes or network requests.
const script = fileURLToPath(new URL('./validate-prepublish-review.mjs', import.meta.url));
const root = await mkdtemp(path.join(tmpdir(), 'gallery-prepublish-readiness-'));
const reviewFile = 'audit/prepublish-review-2026-09-23-0800.json';
const generatedAt = '2026-09-22T13:37:57.398Z';
const active = TARGET_JOURNALS.filter(journal => !journal.activeFrom || journal.activeFrom <= '2026-09-22');
const doi = '10.5555/gallery-readiness-fixture';
const discoveryGate = Object.fromEntries(['criticalSourceFailures', 'sourceFamilyGaps', 'sourceCoverageAnomalies', 'historicalCoverageLosses'].map(key => [key, 0]));
const handoff = {
  generatedAt, endDate: '2026-09-22', summary: { unresolved: 1, ...discoveryGate }, discoveryGate,
  activeJournals: active.map(journal => ({ name: journal.name })),
  unresolved: [{ doi, title: 'Synthetic isolated test fixture', journal: active[0].name, reviewPriority: 'high' }],
};
const latest = { generatedAt, summary: { unresolved: 1, ...discoveryGate } };
const pending = {
  publicationSlot: '2026-09-23T08:00:00+08:00', handoffGeneratedAt: generatedAt,
  phase: 'preparing', status: 'incomplete_review', readyToPublish: false,
  reviewed: 1, acceptedCount: 0, rejectedCount: 0, pendingCount: 1,
  decisions: [{ doi, title: 'Synthetic isolated test fixture', decision: 'pending', reason: 'Synthetic fixture lacks sufficient evidence and must remain pending.' }],
  qualityControl: { secondPassCompleted: true, unresolvedDisagreements: 0, allHandoffCandidatesReviewed: true, allHandoffCandidatesFinalized: false, openEvidenceGaps: 1 },
  sourceChecks: active.map(journal => ({ journal: journal.name, status: 'checked', candidateCount: 1, syntheticTitleCount: 1, sourceType: 'publisher-list-fixture', sourcePage: 'https://example.invalid/fixture' })),
};
async function run(review, compact = handoff, diagnostic = latest, strict = false) {
  await mkdir(path.join(root, 'audit'), { recursive: true });
  for (const [file, data] of [[reviewFile, review], ['audit/unresolved-latest.json', compact], ['audit/latest.json', diagnostic]]) {
    await writeFile(path.join(root, file), JSON.stringify(data));
  }
  const child = spawnSync(process.execPath, [script, reviewFile, ...(strict ? ['--require-ready'] : [])], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, PREPUBLISH_REQUIRE_READY: '0' },
  });
  if (child.error) throw child.error;
  assert.ok(child.stdout.trim().startsWith('{'), `Expected JSON result, got ${child.stderr || child.stdout}`);
  return { status: child.status, result: JSON.parse(child.stdout) };
}
const cases = [];
try {
  let row = await run(pending);
  assert.equal(row.status, 0);
  assert.equal(row.result.validationOk, true);
  assert.equal(row.result.readyToPublish, false);
  assert.ok(row.result.readinessBlockers.includes('pending_evidence'));
  cases.push('valid_pending_staging_is_not_ready');

  row = await run(pending, handoff, latest, true);
  assert.equal(row.status, 1);
  assert.equal(row.result.ok, false);
  assert.equal(row.result.validationOk, true);
  assert.equal(row.result.readyToPublish, false);
  cases.push('strict_mode_rejects_pending');

  const forged = { ...pending, phase: 'ready_to_publish', status: 'ready_to_publish', readyToPublish: true };
  row = await run(forged);
  assert.equal(row.status, 1);
  assert.equal(row.result.validationOk, false);
  cases.push('forged_ready_flag_with_pending_fails');

  const complete = structuredClone(forged);
  complete.acceptedCount = 1;
  complete.pendingCount = 0;
  complete.decisions[0] = { doi, title: 'Synthetic isolated test fixture', decision: 'include', evidenceBasis: 'Synthetic regression evidence establishes a general preparative method; this is not a real article.', challengeDecision: 'include', challengeReason: 'Synthetic challenge confirms inclusion for this isolated regression fixture only.' };
  complete.qualityControl.allHandoffCandidatesFinalized = true;
  complete.qualityControl.openEvidenceGaps = 0;
  row = await run(complete, handoff, latest, true);
  assert.equal(row.status, 0);
  assert.equal(row.result.readyToPublish, true);
  cases.push('fully_finalized_fixture_passes_strict_mode');

  row = await run(complete, handoff, { ...latest, generatedAt: '2026-09-22T14:00:00.000Z' }, true);
  assert.equal(row.status, 1);
  assert.equal(row.result.readyToPublish, false);
  cases.push('mismatched_latest_generation_fails');

  const missingHealth = structuredClone(handoff);
  delete missingHealth.discoveryGate.sourceFamilyGaps;
  row = await run(complete, missingHealth, latest, true);
  assert.equal(row.status, 1);
  cases.push('missing_discovery_health_is_not_zero');

  row = await run(complete, handoff, { ...latest, summary: { ...latest.summary, unresolved: 2 } }, true);
  assert.equal(row.status, 1);
  cases.push('diagnostic_compact_count_mismatch_fails');

  console.log(JSON.stringify({ ok: true, cases, productionWrites: false, networkRequests: false }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
