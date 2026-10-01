import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateGateRun, slotState, validateEvidence, compareBindings, blobSha } from './fixed-slot-release-handoff.mjs';
import { trustedReleaseEvent, writerResultTargetsMarker } from './pages-release-delivery.mjs';
const slot = '2026-10-02T08:00:00+08:00', at = Date.parse(slot), sha = 'a'.repeat(40);
const run = { id: 1, head_sha: sha, status: 'completed', conclusion: 'success', event: 'push',
  name: 'Validate prepublish literature review', path: '.github/workflows/prepublish-review-gate.yml',
  head_branch: 'main', head_repository: { full_name: 'owner/repo' } };
function fixture() {
  const scope = { scopeRulesFile: 'docs/literature-scope-contract.md', scopeRulesBlobSha: sha,
    scopeCorrectionsFile: 'audit/literature-scope-corrections.json', scopeCorrectionsBlobSha: sha };
  const assessment = Object.fromEntries(['primaryContribution', 'preparativeTransformation', 'generalityEvidence', 'sourceEvidence', 'boundaryChallenge'].map(k => [k, 'Test fixture only']));
  const formalReview = { qualityControl: { scopeContract: scope }, accepted: [{ doi: '10.1000/test', scopeAssessment: assessment }] };
  const pendingQueue = { items: [{ doi: '10.1000/pending', reason: 'Evidence needed' }] };
  const fields = { releasePolicy: 'per-doi', publicationSlot: slot, handoffGeneratedAt: '2026-10-01T23:15:00Z',
    stagingReviewFile: 'audit/prepublish-review-2026-10-02-0800.json', stagingReviewBlobSha: sha,
    handoffFile: 'audit/unresolved-latest.json', handoffBlobSha: sha, auditFile: 'audit/latest.json', auditBlobSha: sha,
    reviewBlobSha: blobSha(formalReview), pendingQueueBlobSha: blobSha(pendingQueue),
    publishableDois: ['10.1000/test'], rejectedDois: [], deferredDois: ['10.1000/pending'] };
  const partition = { publicationSlot: slot, handoffGeneratedAt: fields.handoffGeneratedAt, reviewFile: fields.stagingReviewFile,
    publishableDois: [...fields.publishableDois], rejectedDois: [], deferredDois: [...fields.deferredDois] };
  const record = { ...partition, readyToPublish: true, validationMode: 'require-ready' };
  const readiness = { ...partition, publicationReady: true, snapshotFreshForSlot: true, semanticReady: true, recordValidationPassed: true };
  const bundle = { mode: 'release-preflight', conversionValid: true, publicationReady: true,
    markerFields: fields, formalReview, pendingQueue, preflight: structuredClone(readiness) };
  return [record, readiness, bundle];
}
test('only successful main gate from this repository is trusted', () => assert.equal(validateGateRun(run, 'owner/repo'), run));
for (const patch of [{ conclusion: 'failure' }, { status: 'in_progress' }, { event: 'pull_request' },
  { head_branch: 'feature' }, { name: 'Fake gate' }, { path: '.github/workflows/other.yml' }]) {
  test(`untrusted gate rejected ${JSON.stringify(patch)}`, () => assert.throws(() => validateGateRun({ ...run, ...patch }, 'owner/repo')));
}
test('fork gate rejected', () => assert.throws(() => validateGateRun(run, 'other/repo'), /origin/));
test('65 minute pre-slot arming is read-only waiting', () => assert.equal(slotState(slot, at - 65 * 60_000), 'waiting_for_slot'));
test('one millisecond before slot never releases', () => assert.equal(slotState(slot, at - 1), 'waiting_for_slot'));
test('exact slot admits guarded execution', () => assert.equal(slotState(slot, at), 'slot_open'));
test('expired slot is not replayed', () => assert.equal(slotState(slot, at + 20 * 60_000 + 1), 'expired_slot'));
test('next-day invocation cannot backfill yesterday', () => assert.equal(slotState(slot, at + 24 * 3600_000), 'expired_slot'));
test('same slot is idempotent', () => assert.equal(slotState(slot, at, slot), 'already_published_or_superseded'));
test('newer marker is never overwritten', () => assert.equal(slotState(slot, at, '2026-10-02T18:00:00+08:00'), 'already_published_or_superseded'));
test('arbitrary slot time rejected', () => assert.throws(() => slotState('2026-10-02T09:00:00+08:00', at)));
test('early future gate cannot arm outside 65 minutes', () => assert.throws(() => slotState(slot, at - 66 * 60_000)));
test('strict reviewed subset allows evidence-scoped pending', () => assert.equal(validateEvidence(...fixture()).deferredDois.length, 1));
test('ordinary validationOk is not publication permission', () => { const f = fixture(); f[0].readyToPublish = false; f[0].validationOk = true; assert.throws(() => validateEvidence(...f), /record_gate/); });
for (const key of ['publicationReady', 'snapshotFreshForSlot', 'semanticReady', 'recordValidationPassed']) {
  test(`missing ${key} cannot release`, () => { const f = fixture(); f[1][key] = false; assert.throws(() => validateEvidence(...f), /slot_gate/); });
}
test('preview conversion cannot release', () => { const f = fixture(); f[2].mode = 'preview-only'; assert.throws(() => validateEvidence(...f), /strict_bundle/); });
test('cross-generation artifacts rejected', () => { const f = fixture(); f[0].handoffGeneratedAt = '2026-09-30T23:15:00Z'; assert.throws(() => validateEvidence(...f), /generation/); });
test('mismatched DOI partitions rejected', () => { const f = fixture(); f[1].deferredDois = []; assert.throws(() => validateEvidence(...f), /partition/); });
test('formal serialized evidence cannot be modified', () => { const f = fixture(); f[2].formalReview.accepted[0].title = 'Changed'; assert.throws(() => validateEvidence(...f), /serialization/); });
test('scope reference loss rejected even with a recomputed serialization hash', () => { const f = fixture(); delete f[2].formalReview.qualityControl.scopeContract; f[2].markerFields.reviewBlobSha = blobSha(f[2].formalReview); assert.throws(() => validateEvidence(...f), /scope_contract/); });
test('scope assessment loss rejected', () => { const f = fixture(); delete f[2].formalReview.accepted[0].scopeAssessment; f[2].markerFields.reviewBlobSha = blobSha(f[2].formalReview); assert.throws(() => validateEvidence(...f), /scope_assessment/); });
test('new metadata or rule SHA needs fresh approval', () => assert.throws(() => compareBindings({ scope: 'old', handoff: sha }, { scope: 'new', handoff: sha }), /approved_input_changed/));
test('fingerprint cannot hide a missing input', () => assert.throws(() => compareBindings({ scope: sha }, {}), /binding_paths/));
test('identical authority inputs can be reused', () => assert.doesNotThrow(() => compareBindings({ scope: sha }, { scope: sha })));
test('writer uses event handoff, not another cron or dispatch', () => {
  const yaml = readFileSync('.github/workflows/literature-fixed-slot-release.yml', 'utf8');
  assert.match(yaml, /workflow_run:/); assert.match(yaml, /Validate prepublish literature review/);
  assert.doesNotMatch(yaml, /^\s+(schedule|workflow_dispatch):/m);
  assert.match(yaml, /ref: main/); assert.match(yaml, /actions\/download-artifact@v4/);
  assert.match(yaml, /cancel-in-progress: false/); assert.match(yaml, /fixed-slot-release-handoff.mjs commit-guard/);
  assert.match(yaml, /needs.release.outputs.did_release == 'true'/);
});
const writer = { ...run, name: 'Fixed-slot literature release writer', path: '.github/workflows/literature-fixed-slot-release.yml', event: 'workflow_run' };
test('main event-driven writer can hand off to Pages', () => assert.equal(trustedReleaseEvent({ workflow_run: writer }, 'owner/repo').event, 'workflow_run'));
test('event-driven writer cannot use release-branch identity', () => assert.throws(() => trustedReleaseEvent({ workflow_run: { ...writer, head_branch: 'automation/release-test' } }, 'owner/repo'), /branch/));
test('dispatch is not an authorized release event', () => assert.throws(() => trustedReleaseEvent({ workflow_run: { ...writer, event: 'workflow_dispatch' } }, 'owner/repo'), /not_successful/));
test('expired or idempotent writer cannot claim the old deployment', () => assert.equal(writerResultTargetsMarker(writer, { writerRunId: 999 }, {}), false));
test('actual automatic writer result is bound to the marker', () => {
  const marker = { publicationSlot: slot, productionCards: 1, stagingReviewBlobSha: sha, handoffBlobSha: sha, auditBlobSha: sha, reviewBlobSha: sha };
  const result = { ...marker, ok: true, writerRunId: writer.id, formalReviewBlobSha: sha, approvedSourceCommit: sha };
  assert.equal(writerResultTargetsMarker(writer, result, marker), true);
  assert.throws(() => writerResultTargetsMarker(writer, { ...result, handoffBlobSha: 'b'.repeat(40) }, marker), /evidence_mismatch/);
});
