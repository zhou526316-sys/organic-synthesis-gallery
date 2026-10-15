import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {verifyAuthorOnlyDelta,authorizeExistingAuthorCorrection,AUTHOR_CORRECTION_DOI,AUTHOR_CORRECTION_NAMES} from './lib/author-metadata-correction.mjs';
import { PROTECTED_FILES, validateProtectedInputs, validateFormalPartition, canReuseReceiptBackedLegacyBaseline } from './validate-pages-literature-authorization.mjs';

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

run('exact_receipt_backed_retired_evening_baseline_can_be_reused_for_unchanged_ui_deploy', () => {
  const markerCommit = 'a'.repeat(40);
  const legacyMarker = {
    schemaVersion: 2,
    mode: 'slot-release',
    publicationSlot: '2026-10-04T18:00:00+08:00',
    productionCards: 786,
  };
  const baseline = {
    ok: true,
    receiptBackedBaseline: true,
    legacyMarkerAuthorized: true,
    publicationSlot: legacyMarker.publicationSlot,
    productionCards: legacyMarker.productionCards,
    markerCommitSha: markerCommit,
  };
  assert.equal(canReuseReceiptBackedLegacyBaseline(legacyMarker, baseline, [], markerCommit), true);
  assert.equal(canReuseReceiptBackedLegacyBaseline(legacyMarker, baseline, ['unauthorized_literature_change:x'], markerCommit), false);
  assert.equal(canReuseReceiptBackedLegacyBaseline(
    { ...legacyMarker, publicationSlot: '2026-10-05T18:00:00+08:00' },
    { ...baseline, publicationSlot: '2026-10-05T18:00:00+08:00' }, [], markerCommit,
  ), false);
  assert.equal(canReuseReceiptBackedLegacyBaseline(legacyMarker, { ...baseline, legacyMarkerAuthorized: false }, [], markerCommit), false);
  assert.equal(canReuseReceiptBackedLegacyBaseline({ ...legacyMarker, schemaVersion: 1 }, baseline, [], markerCommit), false);
  assert.equal(canReuseReceiptBackedLegacyBaseline(legacyMarker, baseline, [], 'b'.repeat(40)), false);
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
  evidenceNeeded: 'Abstract or full-text proof of products and general preparative substrate scope.', nextReviewSlot: '2026-09-24T08:00:00+08:00' }] };
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
  const retiredEveningRetry = structuredClone(queue);
  retiredEveningRetry.items[0].nextReviewSlot = '2026-09-24T18:00:00+08:00';
  assert.ok(validateFormalPartition(staging, formal, marker, retiredEveningRetry).some(x => x.startsWith('pending_retry_evidence_missing:')));
});
run('normal_formal_rows_need_no_internal_decision_field', () => {
  assert.equal(included._decision, undefined);
  assert.deepEqual(validateFormalPartition(staging, formal, marker, queue), []);
});
run('mismatched_challenge_is_blocked', () => {
  const bad = structuredClone(formal); bad.accepted[0].challengeDecision = 'exclude';
  assert.ok(validateFormalPartition(staging, bad, marker, queue).some(x => x.startsWith('formal_challenge_invalid:')));
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

const historical = JSON.parse(await readFile(new URL('../audit/historical-reviewed/approved-admissions.json', import.meta.url),'utf8'));
const historicDoi=historical.accepted[0].doi;
const markerWithHistory={
  ...marker,
  historicalReviewFile:'audit/historical-reviewed/approved-admissions.json',
  historicalReviewBlobSha:'a'.repeat(40),
  historicalAdmittedDois:[historicDoi],
  dailyPublishableDois:[included.doi],
  publishableDois:[included.doi,historicDoi]
};
run('one independently reviewed historical DOI may join daily release only with frozen marker',()=>{
  assert.deepEqual(validateFormalPartition(staging,formal,markerWithHistory,queue,historical),[]);
});
run('historic marker cannot distort or omit the separate frozen daily DOI subset',()=>{
  const noDaily={...markerWithHistory,dailyPublishableDois:[]};
  assert.ok(validateFormalPartition(staging,formal,noDaily,queue,historical)
    .includes('release_daily_allowlist_mismatch'));
  const noKey={...markerWithHistory};
  delete noKey.dailyPublishableDois;
  assert.ok(validateFormalPartition(staging,formal,noKey,queue,historical)
    .includes('historical_release_daily_allowlist_missing'));
});
run('history marker alone without review proof cannot bypass publisher scope checks',()=>{
  assert.ok(validateFormalPartition(staging,formal,markerWithHistory,queue,null)
    .some(x=>x.startsWith('historical_review_invalid:')));
});
run('historic DOI not approved by its separate two-pass review is rejected',()=>{
  const wrong={...markerWithHistory,historicalAdmittedDois:['10.5555/unapproved'],
    publishableDois:[included.doi,'10.5555/unapproved']};
  assert.ok(validateFormalPartition(staging,formal,wrong,queue,historical)
    .includes('historical_review_not_in_approved_manifest'));
});
run('historical candidate cannot overlap daily accepted/rejected/pending snapshot',()=>{
  for(const doi of [included.doi,excluded.doi,pending.doi]){
    const wrong={...markerWithHistory,historicalAdmittedDois:[doi],
      publishableDois:[included.doi,doi]};
    assert.ok(validateFormalPartition(staging,formal,wrong,queue,historical)
      .includes('historical_review_doi_overlaps_formal'));
  }
});
run('historic manifest cannot be silently stripped from bound marker',()=>{
  const x={...markerWithHistory,historicalAdmittedDois:[],publishableDois:[included.doi]};
  assert.ok(validateFormalPartition(staging,formal,x,queue,historical)
    .includes('historical_review_unreferenced_manifest'));
});
run('historic DOI must be a member of the combined atomic release allowlist',()=>{
  const x={...markerWithHistory,publishableDois:[included.doi]};
  assert.ok(validateFormalPartition(staging,formal,x,queue,historical)
    .includes('release_allowlist_mismatch:publishableDois'));
});

// A second, explicit user approval ratifies an already-landed six-author
// completion only. No new DOI, non-author field or publisher date is allowed.
const authorBase=JSON.parse(execFileSync('git',['show',
  'aed08cccbe4b0135e7677e2c9d862afe70a2dd05:public/rolling-supplement.json'],
  {encoding:'utf8',maxBuffer:16*1024*1024}));
const authorLive=JSON.parse(readFileSync('public/rolling-supplement.json','utf8'));
const authorMarker=JSON.parse(readFileSync('audit/publication-release-state.json','utf8'));
run('exact_Nature_author_completion_has_immutable_review_and_no_doi_change',()=>{
  const result=verifyAuthorOnlyDelta(authorBase,authorLive);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.addedDois,0);
  assert.equal(result.changedDates,0);
  const attestation=authorizeExistingAuthorCorrection(process.cwd(),authorMarker,
    '28f3238f45b380855f68fc7ab79da03ba4c9f181');
  assert.equal(attestation.ok,true,JSON.stringify(attestation));
  assert.equal(attestation.originalMarkerUnchanged,true);
});
run('author_amendment_wrong_blob_or_marker_is_fail_closed',()=>{
  assert.equal(authorizeExistingAuthorCorrection(process.cwd(),authorMarker,'9'.repeat(40)).ok,false);
  assert.equal(authorizeExistingAuthorCorrection(process.cwd(),
    {...authorMarker,publicationSlot:'2026-10-15T18:00:00+08:00'},
    '28f3238f45b380855f68fc7ab79da03ba4c9f181').ok,false);
});
run('author_amendment_cannot_change_title_date_doi_or_unrelated_authors',()=>{
  const changes=[
    x=>{x.papers.find(p=>p.doi===AUTHOR_CORRECTION_DOI).title='Unauthorized title';},
    x=>{x.papers.find(p=>p.doi===AUTHOR_CORRECTION_DOI).date='2026-10-13';},
    x=>{x.papers.find(p=>p.doi===AUTHOR_CORRECTION_DOI).authors.reverse();},
    x=>{x.papers[0].authors=['Unauthorized author'];},
    x=>{x.papers.push({...x.papers[0],doi:'10.5555/unauthorized-new-doi'});},
  ];
  for(const mutate of changes){
    const altered=structuredClone(authorLive);
    mutate(altered);
    assert.equal(verifyAuthorOnlyDelta(authorBase,altered).ok,false);
  }
});
run('author_amendment_not_a_generic_metadata_change_whitelist',()=>{
  const modified=structuredClone(authorBase);
  const target=modified.papers.find(p=>p.doi===AUTHOR_CORRECTION_DOI);
  assert.deepEqual(target.authors,[]);
  target.authors=[...AUTHOR_CORRECTION_NAMES];
  assert.equal(verifyAuthorOnlyDelta(authorBase,modified,AUTHOR_CORRECTION_DOI,AUTHOR_CORRECTION_NAMES).ok,true);
  assert.equal(verifyAuthorOnlyDelta(authorBase,modified,'10.1021/jacs.6c08713').ok,false);
});

const workflow = await readFile(new URL('../.github/workflows/github-pages.yml', import.meta.url), 'utf8');
run('pages_build_and_deploy_depend_on_real_gate', () => {
  const job = name => {
    const block = workflow.match(new RegExp(`^  ${name}:\\s*\\n([\\s\\S]*?)(?=^  [A-Za-z_][A-Za-z0-9_-]*:|$(?![\\s\\S]))`, 'm'));
    assert.ok(block, `required job missing: ${name}`);
    return block[1];
  };
  const authorization = job('literature_authorization');
  assert.match(authorization, /^    runs-on:\s*ubuntu-latest\s*$/m);
  assert.match(authorization, /node scripts\/validate-pages-literature-authorization\.mjs/);
  assert.match(authorization, /fetch-depth: 0/);
  assert.ok(!authorization.includes('continue-on-error: true'));
  assert.match(job('build'), /^    needs: literature_authorization\s*$/m);
  assert.match(job('deploy'), /^    needs: \[literature_authorization, build\]\s*$/m);
  assert.ok(!workflow.includes('if: ${{ false }}'));
  assert.ok(!workflow.includes('Recovery deployment scope'));
});
console.log(JSON.stringify({ ok: true, cases, testCount: cases.length, productionWrites: false, networkRequests: false }, null, 2));
