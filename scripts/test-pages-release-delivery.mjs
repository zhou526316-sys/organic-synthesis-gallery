import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { collectPapers, sameSet, normalizeDoi, assertPartition, trustedReleaseEvent, isDirectReleaseHandoff, compareProtected, mergeDeliveryState } from './pages-release-delivery.mjs';
const a = '10.1021/jacs.test1', b = '10.1021/jacs.test2', c = '10.1021/jacs.test3';
const marker = { mode: 'slot-release', publicationSlot: '2026-09-29T08:00:00+08:00', productionCards: 1, publishableDois: [a], rejectedDois: [b], deferredDois: [c] };
const evidence = { schemaVersion: 2, ok: true, chineseTitlesVerified: true, architectureVerified: true, publicationSlot: marker.publicationSlot, productionCards: 1,
  publishableDois: [a], rejectedDois: [b], deferredDois: [c], verifiedAt: '2026-09-29T15:40:00Z', markerCommit: 'm', sourceCommit: 's', runId: 1 };
test('DOI normalization', () => assert.equal(normalizeDoi('https://doi.org/10.1021/JACS.test1?x=1'), a));
test('exact set comparison rejects equal counts with different DOI', () => assert.equal(sameSet([a], [b]), false));
test('exact set comparison rejects duplicates', () => assert.equal(sameSet([a, a], [a, b]), false));
test('compressed baseline plus supplement retains Chinese title', () => {
  const papers = collectPapers({ 'papers.gz.b64': gzipSync(JSON.stringify([{ doi: a, title: 'One' }])).toString('base64'),
    'rolling-supplement.json': JSON.stringify({ papers: [{ doi: a, titleZh: '测试标题' }, { doi: b }] }) }, doi => doi === b);
  assert.equal(papers.size, 1); assert.equal(papers.get(a).titleZh, '测试标题');
});
test('malformed data never silently becomes zero papers', () => assert.throws(() => collectPapers({ 'x.json': '{}' }), /paper_array_missing/));
test('pending never enters live collection', () => assert.throws(() => assertPartition({ ...marker, productionCards: 2 }, [a, c]), /nonpublishable_present/));
test('missing accepted DOI fails even at the same count', () => assert.throws(() => assertPartition(marker, [b]), /accepted_missing/));
test('protected input SHA changes block stale deployment', () => assert.throws(() => compareProtected({ a: 'one' }, { a: 'two' }), /superseded/));
test('protected file set cannot shrink', () => assert.throws(() => compareProtected({ a: 'one' }, {}), /file_set/));
const event = { workflow_run: { name: 'Fixed-slot literature release writer', path: '.github/workflows/literature-fixed-slot-release.yml',
  conclusion: 'success', event: 'push', head_branch: 'automation/release-20260929-0800', head_sha: 'a'.repeat(40), head_repository: { full_name: 'owner/repo' } } };
test('completed trusted writer may hand off to main deployment', () => assert.equal(trustedReleaseEvent(event, 'owner/repo').conclusion, 'success'));
test('fork cannot enter privileged deployment handoff', () => assert.throws(() => trustedReleaseEvent(event, 'other/repo'), /repository_mismatch/));
test('failed writer cannot admit production', () => assert.throws(() => trustedReleaseEvent({ workflow_run: { ...event.workflow_run, conclusion: 'failure' } }, 'owner/repo'), /not_successful/));
test('delivery preserves historical pending and closure', () => {
  const previous = { verifiedThrough: '2026-09-20', reviewComplete: false, pendingReviewBacklog: [{ doi: c, originalDate: '2026-09-22' }], activeRun: null, prepublishStaging: { publicationSlot: marker.publicationSlot } };
  const next = mergeDeliveryState(previous, evidence, marker);
  assert.equal(next.phase, 'synced_with_pending'); assert.deepEqual(next.pendingReviewBacklog, previous.pendingReviewBacklog);
  assert.equal(next.verifiedThrough, previous.verifiedThrough); assert.equal(next.reviewComplete, false); assert.equal(previous.phase, undefined);
});
test('newer review cannot be overwritten by older delivery', () => {
  const state = { phase: 'preparing', prepublishStaging: { publicationSlot: '2026-09-30T08:00:00+08:00' } };
  assert.equal(mergeDeliveryState(state, evidence, marker).phase, 'preparing');
});
test('active lock cannot be overwritten', () => assert.equal(mergeDeliveryState({ phase: 'fetching', activeRun: { id: 1 } }, evidence, marker).phase, 'fetching'));
test('failed or mismatched evidence never updates sync success', () => {
  assert.throws(() => mergeDeliveryState({}, { ...evidence, ok: false }, marker), /not_verified/);
  assert.throws(() => mergeDeliveryState({}, { ...evidence, architectureVerified: false }, marker), /not_verified/);
  assert.throws(() => mergeDeliveryState({}, { ...evidence, publishableDois: [b] }, marker), /partition_mismatch/);
});
test('writer no longer calls Pages with automation branch identity', () => {
  const writer = readFileSync('.github/workflows/literature-fixed-slot-release.yml', 'utf8');
  assert.ok(!writer.includes('uses: ./.github/workflows/github-pages.yml'));
});
test('Pages delivery uses event handoff, no added timers, exact snapshot, live verification', () => {
  const workflow = readFileSync('.github/workflows/github-pages.yml', 'utf8');
  assert.ok(workflow.includes('Fixed-slot literature release writer'));
  assert.ok(workflow.includes('workflow_run:')); assert.ok(!/^\s+schedule:/m.test(workflow));
  assert.ok(workflow.includes('needs.literature_authorization.outputs.deployment_ref'));
  assert.ok(workflow.includes('pages-release-delivery.mjs guard'));
  assert.ok(workflow.includes('pages-release-delivery.mjs verify'));
  assert.ok(workflow.includes('cancel-in-progress: false'));
});

test('main media reuse retains caller event without misclassifying it as a writer handoff', () => {
  assert.equal(isDirectReleaseHandoff('workflow_run', 'Deploy GitHub Pages frontend'), true);
  assert.equal(isDirectReleaseHandoff('workflow_run', 'Publish validated new body figures'), false);
  assert.equal(isDirectReleaseHandoff('push', 'Deploy GitHub Pages frontend'), false);
  assert.equal(isDirectReleaseHandoff('schedule', 'Publish validated new body figures'), false);
});
