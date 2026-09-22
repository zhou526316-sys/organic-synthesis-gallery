import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PROTECTED_FILES, validateProtectedInputs, validateFormalPartition } from './validate-pages-literature-authorization.mjs';

// Isolated data fixtures only. No production writes, Git commits, or network calls.
const cases = [];
const run = (name, fn) => { fn(); cases.push(name); };
const hash = '1'.repeat(40);
const blobs = Object.fromEntries(PROTECTED_FILES.map(file => [file, hash]));
run('unchanged_literature_permits_ui_media_deployment', () => assert.deepEqual(validateProtectedInputs({ protectedBlobs: blobs }, blobs), []));
run('changed_literature_without_marker_is_blocked', () => {
  const actual = { ...blobs, [PROTECTED_FILES[0]]: '2'.repeat(40) };
  assert.ok(validateProtectedInputs({ protectedBlobs: blobs }, actual).some(x => x.startsWith('unauthorized_literature_change:')));
});
run('omitting_protected_file_is_not_a_bypass', () => {
  const bad = { ...blobs }; delete bad[PROTECTED_FILES[0]]; bad['public/unrelated.json'] = hash;
  assert.ok(validateProtectedInputs({ protectedBlobs: bad }, blobs).includes('protected_file_set_mismatch'));
});
run('missing_sha_never_means_unchanged', () => {
  const bad = { ...blobs, [PROTECTED_FILES[0]]: null };
  assert.ok(validateProtectedInputs({ protectedBlobs: bad }, bad).some(x => x.startsWith('missing_or_invalid_protected_sha:')));
});

const slot = '2026-09-23T08:00:00+08:00';
const generation = '2026-09-22T23:05:00.000Z';
const item = (doi, decision) => ({ doi, title: 'Isolated release authorization fixture', decision,
  reason: 'Synthetic fixture validates the exact decision partition without touching real papers.',
  evidenceBasis: 'Isolated fixture evidence demonstrates a broadly applicable preparative organic transformation.',
  challengeDecision: decision,
  challengeReason: 'The isolated challenge fixture explicitly agrees with the assigned decision.',
});
const included = item('10.5555/included', 'include');
const excluded = item('10.5555/excluded', 'exclude');
const pending = item('10.5555/pending', 'pending');
const staging = { publicationSlot: slot, handoffGeneratedAt: generation, decisions: [included, excluded, pending] };
const formal = { publicationSlot: slot, handoffGeneratedAt: generation,
  accepted: [included], rejected: [excluded], pending: [pending],
  summary: { reviewed: 3, accepted: 1, rejected: 1, pending: 1 },
  qualityControl: { secondPassCompleted: true, unresolvedDisagreements: 0 },
};
const marker = { publicationSlot: slot, handoffGeneratedAt: generation, releasePolicy: 'per-doi',
  publishableDois: [included.doi], rejectedDois: [excluded.doi], deferredDois: [pending.doi],
};
const queue = { items: [{ doi: pending.doi, reason: 'No complete article evidence yet, retain pending rather than excluding.',
  evidenceNeeded: 'Abstract or full-text proof of products and general preparative substrate scope.', nextReviewSlot: '2026-09-23T18:00:00+08:00' }] };
run('one_pending_does_not_block_verified_release_subset', () => assert.deepEqual(validateFormalPartition(staging, formal, marker, queue), []));
run('pending_cannot_enter_publication_allowlist', () => {
  assert.ok(validateFormalPartition(staging, formal, { ...marker, publishableDois: [included.doi, pending.doi] }, queue).includes('release_allowlist_mismatch:publishableDois'));
});
run('pending_cannot_silently_become_excluded', () => {
  const bad = structuredClone(formal); bad.pending = []; bad.rejected.push(pending);
  assert.ok(validateFormalPartition(staging, bad, marker, queue).includes('formal_partition_mismatch:rejected'));
});
run('deferred_evidence_and_retry_cannot_be_dropped', () => {
  assert.ok(validateFormalPartition(staging, formal, marker, null).includes('pending_queue_doi_set_mismatch'));
  const bad = structuredClone(queue); delete bad.items[0].nextReviewSlot;
  assert.ok(validateFormalPartition(staging, formal, marker, bad).some(x => x.startsWith('pending_retry_evidence_missing:')));
});
run('normal_formal_rows_need_no_internal_decision_field', () => {
  assert.equal(included._decision, undefined);
  assert.deepEqual(validateFormalPartition(staging, formal, marker, queue), []);
});
run('mismatched_challenge_is_blocked', () => {
  const bad = structuredClone(formal); bad.accepted[0].challengeDecision = 'exclude';
  assert.ok(validateFormalPartition(staging, bad, marker, queue).some(x => x.startsWith('formal_evidence_or_challenge_invalid:')));
});
run('formal_counts_and_required_reason_are_enforced', () => {
  const bad = structuredClone(formal); bad.summary.accepted = 2; delete bad.accepted[0].reason;
  const failures = validateFormalPartition(staging, bad, marker, queue);
  assert.ok(failures.includes('formal_count_mismatch:accepted'));
  assert.ok(failures.some(x => x.startsWith('formal_reason_or_title_missing:')));
});
run('missing_explicit_second_pass_fields_are_not_zero', () => {
  const bad = structuredClone(formal); delete bad.qualityControl.unresolvedDisagreements;
  assert.ok(validateFormalPartition(staging, bad, marker, queue).includes('formal_second_pass_not_verified'));
});
run('different_snapshot_or_slot_is_blocked', () => {
  const bad = structuredClone(formal); bad.handoffGeneratedAt = '2026-09-22T13:37:57.398Z'; bad.publicationSlot = '2026-09-23T18:00:00+08:00';
  const failures = validateFormalPartition(staging, bad, marker, queue);
  assert.ok(failures.includes('formal_slot_mismatch'));
  assert.ok(failures.includes('formal_handoff_generation_mismatch'));
});
const workflow = await readFile(new URL('../.github/workflows/github-pages.yml', import.meta.url), 'utf8');
run('pages_build_and_deploy_depend_on_real_gate', () => {
  assert.match(workflow, /literature_authorization:\s*\n\s+runs-on:/);
  assert.match(workflow, /build:\s*\n\s+needs: literature_authorization/);
  assert.match(workflow, /needs: \[literature_authorization, build\]/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.ok(!workflow.includes('if: ${{ false }}'));
  assert.ok(!workflow.includes('Recovery deployment scope'));
});
console.log(JSON.stringify({ ok: true, cases, testCount: cases.length, productionWrites: false, networkRequests: false }, null, 2));
