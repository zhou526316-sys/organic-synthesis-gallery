import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CORRECTION_FILES = Object.freeze(['public/papers.gz.b64','public/total-synthesis.json','public/manual-supplement.json','public/final-audit-supplement.json','public/curated-supplement.json','public/automation-supplement.json','public/rolling-supplement.json','shared/literature-policy.js']);
export const MARKER_FILE = 'audit/publication-release-state.json';
export const doiKey = value => String(value || '').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '').replace(/[?#].*$/, '');
export const sameSet = (a,b) => a.length === b.length && new Set(a).size === a.length && new Set(b).size === b.length && a.every(x => b.includes(x));
export function decodeDataset(file, bytes) {
  const value = JSON.parse(file.endsWith('.gz.b64') ? gunzipSync(Buffer.from(String(bytes).trim(), 'base64')).toString('utf8') : String(bytes));
  if (!Array.isArray(file.endsWith('.gz.b64') ? value : value?.papers)) throw new Error(`Invalid literature dataset: ${file}`);
  return value;
}
export function dropOnly(file, value, removedDois) {
  const forbidden = new Set(removedDois);
  const filter = rows => rows.filter(row => !forbidden.has(doiKey(row.doi || row.url)));
  return file.endsWith('.gz.b64') ? filter(value) : { ...value, papers: filter(value.papers) };
}
export function deletionFailures(file, before, after, removedDois) {
  return isDeepStrictEqual(dropOnly(file, before, removedDois), after) ? [] : [`not_deletion_only:${file}`];
}
export function collectDois(values) {
  const out = new Set();
  for (const value of values) for (const row of (Array.isArray(value) ? value : value.papers)) {
    const doi = doiKey(row.doi || row.url); if (doi.startsWith('10.')) out.add(doi);
  }
  return out;
}

export async function authorizeScopeCorrection(root = process.cwd()) {
  const failures = [];
  const check = (ok, why) => { if (!ok) failures.push(why); };
  const git = args => execFileSync('git', args, { cwd:root, encoding:'utf8', maxBuffer:64*1024*1024 }).trim();
  const marker = JSON.parse(readFileSync(path.join(root, MARKER_FILE), 'utf8'));
  const markerCommit = git(['log','-1','--format=%H','--',MARKER_FILE]);
  const parent = git(['rev-parse',`${markerCommit}^`]);
  const prior = JSON.parse(git(['show',`${parent}:${MARKER_FILE}`]));
  const removed = marker.removedDois;
  check(marker.mode === 'scope-correction' && marker.schemaVersion === 3, 'correction_marker_schema_invalid');
  check(marker.releasePolicy === 'deletion-only' && Array.isArray(marker.publishableDois) && marker.publishableDois.length === 0, 'correction_cannot_admit_papers');
  check(Array.isArray(removed) && removed.length > 0 && sameSet(removed, removed.map(doiKey)) && removed.every(x => /^10\.\d{4,9}\/\S+$/.test(x)), 'invalid_removed_doi_set');
  if (!Array.isArray(removed)) return {ok:false, failures};
  check(marker.previousReleaseCommit === parent, 'previous_release_parent_mismatch');
  check(marker.previousMarkerBlobSha === git(['rev-parse',`${parent}:${MARKER_FILE}`]), 'previous_marker_hash_mismatch');
  check(sameSet(Object.keys(marker.protectedBlobs || {}), [...CORRECTION_FILES]), 'protected_file_set_mismatch');
  check(sameSet(Object.keys(prior.protectedBlobs || {}), [...CORRECTION_FILES]), 'previous_protected_set_mismatch');
  check(git(['rev-parse','--is-shallow-repository']) === 'false', 'full_history_required');
  check(isDeepStrictEqual(marker.deferredDois, prior.deferredDois || []), 'correction_dropped_pending_backlog');
  check(marker.pendingQueueFile === prior.pendingQueueFile && marker.pendingQueueBlobSha === prior.pendingQueueBlobSha, 'pending_reference_changed');
  const at = Date.parse(marker.correctedAt), committed = Date.parse(git(['show','-s','--format=%cI',markerCommit]));
  check(Number.isFinite(at) && at <= committed + 60000 && committed-at < 30*60*1000, 'correction_time_invalid');
  const changed = git(['diff-tree','--no-commit-id','--name-only','-r',markerCommit]).split('\n');
  check(changed.includes(MARKER_FILE) && changed.includes(marker.correctionReviewFile), 'correction_review_and_data_not_atomic');
  const frozen = {};
  for (const [fileKey,shaKey,key] of [['correctionRegistryFile','correctionRegistryBlobSha','registry'],['correctionReviewFile','correctionReviewBlobSha','review'],['authorityFile','authorityBlobSha','authority']]) {
    const file = marker[fileKey];
    if (!/^audit\/[a-zA-Z0-9_./-]+\.json$/.test(file || '') || file.includes('..') || !/^[a-f0-9]{40}$/.test(marker[shaKey] || '')) { failures.push(`invalid_evidence_ref:${fileKey}`); continue; }
    check(git(['rev-parse',`${markerCommit}:${file}`]) === marker[shaKey], `evidence_hash_mismatch:${fileKey}`);
    frozen[key] = JSON.parse(git(['show',`${markerCommit}:${file}`]));
  }
  const authority = frozen.authority;
  check(authority?.schemaVersion === 1 && authority?.allowImmediateConfirmedRemoval === true && authority?.allowOffSlotAdmissions === false && authority?.userInstruction === '继续排查，确定不属于范围内的可以直接移除，不必非等到18：00', 'explicit_removal_authority_missing');
  const review = frozen.review;
  check(review?.mode === 'scope-correction' && review?.qualityControl?.secondPassCompleted === true && review?.qualityControl?.unresolvedDisagreements === 0, 'correction_review_not_final');
  check(Array.isArray(review?.accepted) && review.accepted.length === 0 && Array.isArray(review?.pending) && review.pending.length === 0, 'correction_cannot_publish_or_discard_pending');
  check(sameSet((review?.rejected || []).map(row => doiKey(row.doi)), removed), 'correction_review_partition_mismatch');
  const registry = new Map((frozen.registry?.items || []).map(row => [doiKey(row.doi), row]));
  for (const row of review?.rejected || []) {
    check(row.decision === 'exclude' && row.firstPassDecision === 'exclude' && row.challengeDecision === 'exclude', `not_final_exclusion:${row.doi}`);
    check(String(row.reason || '').length >= 24 && String(row.evidenceBasis || '').length >= 40 && String(row.challengeReason || '').length >= 30, `exclusion_evidence_missing:${row.doi}`);
    check(registry.get(doiKey(row.doi))?.decision === 'exclude' && isDeepStrictEqual(registry.get(doiKey(row.doi)), row), `unregistered_or_altered_exclusion:${row.doi}`);
  }
  const before = [], after = [];
  for (const file of CORRECTION_FILES) {
    const previousSha = git(['rev-parse',`${parent}:${file}`]);
    check(previousSha === prior.protectedBlobs?.[file], `previous_snapshot_unauthorized:${file}`);
    check(git(['hash-object','--',file]) === marker.protectedBlobs?.[file] && git(['rev-parse',`${markerCommit}:${file}`]) === marker.protectedBlobs?.[file], `unauthorized_current_snapshot:${file}`);
    if (file.endsWith('.js')) { check(previousSha === marker.protectedBlobs[file], 'correction_cannot_change_scope_policy_code'); continue; }
    const a = decodeDataset(file, git(['show',`${parent}:${file}`]));
    const b = decodeDataset(file, git(['show',`${markerCommit}:${file}`]));
    failures.push(...deletionFailures(file,a,b,removed)); before.push(a); after.push(b);
    if (previousSha !== marker.protectedBlobs[file]) check(changed.includes(file), `non_atomic_correction:${file}`);
  }
  const oldDois = collectDois(before), newDois = collectDois(after);
  check(sameSet([...oldDois].filter(x => !newDois.has(x)), removed), 'actual_removed_set_mismatch');
  check([...newDois].every(x => oldDois.has(x)), 'correction_added_doi');
  check(marker.productionCards === newDois.size && prior.productionCards === oldDois.size && oldDois.size-newDois.size === removed.length, 'correction_count_mismatch');
  let priorAuthorization = null;
  if (!failures.length) {
    const depth = Number(process.env.GALLERY_CORRECTION_AUTH_DEPTH || 0);
    check(depth < 32, 'correction_chain_too_deep');
    if (depth < 32) {
      const dir = mkdtempSync(path.join(tmpdir(),'gallery-prior-auth-'));
      try {
        git(['worktree','add','--detach',dir,parent]);
        const child = spawnSync(process.execPath,[fileURLToPath(new URL('../validate-pages-literature-authorization.mjs', import.meta.url))],{cwd:dir,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,env:{...process.env,GALLERY_CORRECTION_AUTH_DEPTH:String(depth+1)}});
        try { priorAuthorization = JSON.parse(child.stdout); } catch { failures.push('previous_authorization_unreadable'); }
        check(child.status === 0 && priorAuthorization?.ok === true, 'previous_release_not_authorized');
      } finally { try { git(['worktree','remove','--force',dir]); } finally { rmSync(dir,{recursive:true,force:true}); } }
    }
  }
  return {schemaVersion:1,ok:failures.length === 0,gate:'pages-literature-authorization',mode:'scope-correction',releasePolicy:'deletion-only',deploymentCommit:git(['rev-parse','HEAD']),markerCommit,previousReleaseCommit:parent,productionCards:marker.productionCards,removedDois:removed,deferredDois:marker.deferredDois || [],protectedFiles:CORRECTION_FILES.length,priorAuthorization:priorAuthorization ? {ok:priorAuthorization.ok,markerCommit:priorAuthorization.markerCommit,mode:priorAuthorization.mode} : null,failures,productionDataModified:false,note:'User-authorized removal of final out-of-scope DOI(s) only. No additions, retained-row edits, or policy-code changes; new papers still require the fixed 08:00/18:00 gate.'};
}
