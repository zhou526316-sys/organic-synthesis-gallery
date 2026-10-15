// Strict, single-use ratification of one already-landed, publisher-proven author
// completion. It is NOT a new release marker, DOI admission, or generic bypass.
// The immutable fixed-slot marker remains authoritative for all other fields.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import path from 'node:path';

export const AUTHOR_CORRECTION_PATH = 'audit/author-metadata-correction-2026-10-15.json';
export const AUTHOR_CORRECTION_ROLLING = 'public/rolling-supplement.json';
const ORIGINAL_MARKER_PATH = 'audit/publication-release-state.json';
const SOURCE_EVIDENCE_PATH = 'audit/wechat-working/2026-10-15-r1-nature-science/author-metadata-source-correction.json';
const ORIGINAL_SLOT = '2026-10-15T08:00:00+08:00';
const ORIGINAL_MARKER_BLOB = 'cd56d8ecbda84df374603d1e8b455160ab8921a5';
const ORIGINAL_RELEASE_COMMIT = 'aed08cccbe4b0135e7677e2c9d862afe70a2dd05';
const ORIGINAL_ROLLING_BLOB = 'f0e4b18a3be71e52fb07e84e291f51f652cd03ae';
const CORRECTED_ROLLING_BLOB = '28f3238f45b380855f68fc7ab79da03ba4c9f181';
const FIRST_APPLIED_COMMIT = '17ca9862a1d397c98d6e8890e9defd1899c66833';
const SOURCE_EVIDENCE_BLOB = '4c2ec9d9243f2fad4fe60a65463fa5943c7e81fe';
export const AUTHOR_CORRECTION_DOI = '10.1038/s41586-026-11242-8';
export const AUTHOR_CORRECTION_NAMES = Object.freeze([
  'Hayato Fujimoto', 'Masayuki Mizutani', 'Kazuya Imachi',
  'Teruki Nishioka', 'Reona Ikeda', 'Mamoru Tobisu',
]);

const normalize = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '');
const valid = (condition, error) => {if(!condition)throw new Error(error);};
const git = (root, ...args) => execFileSync('git', args, {
  cwd: root, encoding:'utf8', maxBuffer:16*1024*1024, timeout:12000
}).trimEnd();

export function verifyAuthorOnlyDelta(original, current, doi = AUTHOR_CORRECTION_DOI, names = AUTHOR_CORRECTION_NAMES) {
  if(!original || !current || !Array.isArray(original.papers) || !Array.isArray(current.papers)
    || original.papers.length !== current.papers.length) return {ok:false, reason:'doi_count_or_dataset_shape_changed'};
  const hits = original.papers.map((p,i)=>normalize(p && p.doi)===doi ? i : -1).filter(i=>i>=0);
  const currentHits = current.papers.filter(p=>normalize(p && p.doi)===doi);
  if(hits.length!==1 || currentHits.length!==1)return {ok:false,reason:'target_doi_not_unique'};
  const index = hits[0], before = original.papers[index], after = current.papers[index];
  if(!Array.isArray(before.authors) || before.authors.length!==0
    || !Array.isArray(after.authors) || !isDeepStrictEqual(after.authors,[...names]))
    return {ok:false,reason:'target_authors_not_exact_completion'};
  const expected = structuredClone(original);
  expected.papers[index].authors=[...names];
  if(!isDeepStrictEqual(expected,current))return {ok:false,reason:'non_author_dataset_change'};
  return {ok:true, doi, updatedCount:1, addedDois:0, changedDates:0};
}

export function authorizeExistingAuthorCorrection(root, marker, currentRollingSha) {
  try {
    valid(marker?.mode==='slot-release' && marker?.schemaVersion===2
      && marker?.publicationSlot===ORIGINAL_SLOT && Number(marker?.productionCards)===1151,
      'frozen_release_marker_contract_changed');
    valid(marker?.protectedBlobs?.[AUTHOR_CORRECTION_ROLLING]===ORIGINAL_ROLLING_BLOB,
      'not_original_author_bound_snapshot');
    valid(currentRollingSha===CORRECTED_ROLLING_BLOB, 'not_exact_author_correction_blob');
    valid(git(root,'hash-object','--',ORIGINAL_MARKER_PATH)===ORIGINAL_MARKER_BLOB,
      'original_release_marker_was_modified');
    valid(git(root,'rev-parse',ORIGINAL_RELEASE_COMMIT+':'+ORIGINAL_MARKER_PATH)===ORIGINAL_MARKER_BLOB,
      'original_release_marker_provenance_changed');
    valid(git(root,'rev-parse',ORIGINAL_RELEASE_COMMIT+':'+AUTHOR_CORRECTION_ROLLING)===ORIGINAL_ROLLING_BLOB,
      'frozen_release_data_provenance_changed');
    valid(git(root,'rev-parse',FIRST_APPLIED_COMMIT+':'+AUTHOR_CORRECTION_ROLLING)===CORRECTED_ROLLING_BLOB,
      'first_correction_commit_did_not_contain_exact_authors');
    git(root,'merge-base','--is-ancestor',ORIGINAL_RELEASE_COMMIT,'HEAD');
    git(root,'merge-base','--is-ancestor',FIRST_APPLIED_COMMIT,'HEAD');

    const audit = JSON.parse(readFileSync(path.join(root,AUTHOR_CORRECTION_PATH),'utf8'));
    valid(audit?.schemaVersion===1 && audit?.kind==='owner-approved-postslot-author-only-reconciliation'
      && audit?.scope==='one-existing-doi-authors-only'
      && audit?.doi===AUTHOR_CORRECTION_DOI
      && audit?.publicationSlot===ORIGINAL_SLOT
      && audit?.originalMarkerBlobSha===ORIGINAL_MARKER_BLOB
      && audit?.originalRollingBlobSha===ORIGINAL_ROLLING_BLOB
      && audit?.correctedRollingBlobSha===CORRECTED_ROLLING_BLOB
      && audit?.firstAppliedCommit===FIRST_APPLIED_COMMIT
      && audit?.publisherEvidencePath===SOURCE_EVIDENCE_PATH
      && audit?.publisherEvidenceBlobSha===SOURCE_EVIDENCE_BLOB,
      'owner_metadata_authority_or_sha_mismatch');
    valid(audit?.ownerApproval?.instruction==='批准'
      && audit?.ownerApproval?.date==='2026-10-15'
      && audit?.ownerApproval?.scope==='author-only-metadata-correction-and-tm-pr684-release',
      'exact_owner_approval_not_recorded');
    valid(isDeepStrictEqual(audit.authors,[...AUTHOR_CORRECTION_NAMES])
      && audit.newDoisAdded===0 && audit.publicationDatesChanged===false,
      'authorized_author_set_or_scope_changed');

    valid(git(root,'hash-object','--',SOURCE_EVIDENCE_PATH)===SOURCE_EVIDENCE_BLOB,
      'publisher_evidence_bytes_changed');
    const evidence=JSON.parse(readFileSync(path.join(root,SOURCE_EVIDENCE_PATH),'utf8'));
    valid(evidence.doi===AUTHOR_CORRECTION_DOI
      && evidence.onlyChangedField==='authors'
      && evidence.newDOIsAdded===0 && evidence.publicationDatesChanged===false
      && isDeepStrictEqual(evidence.authors,[...AUTHOR_CORRECTION_NAMES])
      && isDeepStrictEqual(evidence.changedPaths,[AUTHOR_CORRECTION_ROLLING])
      && /User-supplied Nature Accelerated Article Preview, PDF page 2/.test(String(evidence.source||'')),
      'publisher_source_does_not_match_approval');

    const released=JSON.parse(git(root,'show',ORIGINAL_RELEASE_COMMIT+':'+AUTHOR_CORRECTION_ROLLING));
    const corrected=JSON.parse(readFileSync(path.join(root,AUTHOR_CORRECTION_ROLLING),'utf8'));
    const delta=verifyAuthorOnlyDelta(released,corrected);
    valid(delta.ok, 'source_doi_only_delta_invalid:'+delta.reason);

    // The original release snapshot and author correction stay separately
    // auditable. This attestation ratifies the already-landed, exact authors
    // after explicit owner approval, rather than pretending the source edit
    // was atomically committed with the 08:00 release marker.
    return {ok:true,kind:audit.kind,doi:AUTHOR_CORRECTION_DOI,
      originalRollingBlobSha:ORIGINAL_ROLLING_BLOB,
      correctedRollingBlobSha:CORRECTED_ROLLING_BLOB,
      originalMarkerUnchanged:true,addedDois:0,changedDates:0};
  } catch(error) {
    return {ok:false,reason:String(error?.message||error).slice(0,220)};
  }
}
