import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { authorizeScopeCorrection } from './lib/immediate-scope-correction.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

// This gate authorizes repository inputs. It never fetches papers, uploads media,
// mutates production data, or treats an old deployed page as pre-deploy evidence.
export const PROTECTED_FILES = Object.freeze([
  'public/papers.gz.b64', 'public/total-synthesis.json', 'public/manual-supplement.json',
  'public/final-audit-supplement.json', 'public/curated-supplement.json',
  'public/automation-supplement.json', 'public/rolling-supplement.json',
  'shared/literature-policy.js',
]);
const markerPath = 'audit/publication-release-state.json';
const shaPattern = /^[a-f0-9]{40}$/;
const normalize = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length
  && new Set(b).size === b.length && a.every(value => b.includes(value));
const list = value => Array.isArray(value) ? value : [];
const auditPath = value => typeof value === 'string' && /^audit\/[A-Za-z0-9_./-]+\.json$/.test(value)
  && !value.split('/').includes('..');

export function validateProtectedInputs(marker, actual) {
  const failures = [];
  const expected = marker?.protectedBlobs;
  if (!expected || !sameSet(Object.keys(expected), [...PROTECTED_FILES])) {
    failures.push('protected_file_set_mismatch');
  }
  for (const file of PROTECTED_FILES) {
    if (!shaPattern.test(String(expected?.[file] || ''))) failures.push(`missing_or_invalid_protected_sha:${file}`);
    if (actual?.[file] !== expected?.[file]) failures.push(`unauthorized_literature_change:${file}`);
  }
  return failures;
}

export function validateFormalPartition(staging, formal, marker, pendingQueue = null) {
  const failures = [];
  const decisions = list(staging?.decisions);
  if (!Array.isArray(staging?.decisions)) failures.push('staging_decisions_missing');
  const allDois = decisions.map(row => normalize(row.doi));
  if (allDois.some(doi => !/^10\.\d{4,9}\/\S+$/.test(doi)) || new Set(allDois).size !== allDois.length) failures.push('invalid_staging_doi_set');
  if (decisions.some(row => !['include', 'exclude', 'pending'].includes(row.decision))) failures.push('invalid_staging_decision');
  const expected = Object.fromEntries(['include', 'exclude', 'pending'].map(kind => [kind, decisions.filter(row => row.decision === kind).map(row => normalize(row.doi))]));
  const keys = { include: 'accepted', exclude: 'rejected', pending: 'pending' };
  for (const [decision, key] of Object.entries(keys)) {
    if (!Array.isArray(formal?.[key])) failures.push(`formal_array_missing:${key}`);
    const rows = list(formal?.[key]);
    if (!sameSet(rows.map(row => normalize(row.doi)), expected[decision])) failures.push(`formal_partition_mismatch:${key}`);
    if (formal?.summary?.[key] !== rows.length) failures.push(`formal_count_mismatch:${key}`);
    for (const row of rows) {
      const detailedEvidenceRequired = decision === 'include' || decision === 'pending'
        || (decision === 'exclude' && row.reviewPriority === 'high');
      if (!String(row.title || '').trim() || String(row.reason || '').trim().length < 4) failures.push(`formal_reason_or_title_missing:${row.doi}`);
      if (decision !== 'pending' && row.challengeDecision !== decision) failures.push(`formal_challenge_invalid:${row.doi}`);
      if (detailedEvidenceRequired && (String(row.evidenceBasis || '').trim().length < 40
        || String(row.challengeReason || '').trim().length < 30)) failures.push(`formal_evidence_or_challenge_invalid:${row.doi}`);
    }
  }
  if (formal?.summary?.reviewed !== decisions.length) failures.push('formal_reviewed_count_mismatch');
  if (formal?.qualityControl?.secondPassCompleted !== true || formal?.qualityControl?.unresolvedDisagreements !== 0) failures.push('formal_second_pass_not_verified');
  if (staging?.publicationSlot !== marker?.publicationSlot || formal?.publicationSlot !== marker?.publicationSlot) failures.push('formal_slot_mismatch');
  if (staging?.handoffGeneratedAt !== marker?.handoffGeneratedAt || formal?.handoffGeneratedAt !== marker?.handoffGeneratedAt) failures.push('formal_handoff_generation_mismatch');
  if (!['per-doi', 'full-review-closure'].includes(marker?.releasePolicy)) failures.push('release_policy_missing');
  for (const [field, kind] of [['publishableDois', 'include'], ['rejectedDois', 'exclude'], ['deferredDois', 'pending']]) {
    if (!Array.isArray(marker?.[field]) || !sameSet(marker[field].map(normalize), expected[kind])) failures.push(`release_allowlist_mismatch:${field}`);
  }
  if (expected.pending.length) {
    if (marker?.releasePolicy !== 'per-doi') failures.push('pending_requires_explicit_per_doi_release');
    if (!expected.include.length) failures.push('pending_without_includes_is_not_final_zero');
    const rows = list(pendingQueue?.items);
    if (!sameSet(rows.map(row => normalize(row.doi)), expected.pending)) failures.push('pending_queue_doi_set_mismatch');
    for (const row of rows) {
      if (String(row.reason || '').trim().length < 24 || String(row.evidenceNeeded || '').trim().length < 24
        || !/^\d{4}-\d{2}-\d{2}T(?:08|18):00:00\+08:00$/.test(String(row.nextReviewSlot || ''))
        || !(Date.parse(row.nextReviewSlot) > Date.parse(marker.publicationSlot))) failures.push(`pending_retry_evidence_missing:${row.doi}`);
    }
  }
  return failures;
}

export async function authorize(root = process.cwd()) {
  const failures = [];
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  const marker = JSON.parse(await readFile(path.join(root, markerPath), 'utf8'));
  if (marker.mode === 'scope-correction') return authorizeScopeCorrection(root);
  const actual = {};
  for (const file of PROTECTED_FILES) {
    try { actual[file] = git(['hash-object', '--', file]); } catch { actual[file] = null; }
  }
  failures.push(...validateProtectedInputs(marker, actual));
  if (git(['rev-parse', '--is-shallow-repository']) !== 'false') failures.push('full_release_history_required');
  const base = spawnSync(process.execPath, [fileURLToPath(new URL('./validate-production-literature-release-slot.mjs', import.meta.url))], {
    cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
  });
  let baseline = {};
  try { baseline = JSON.parse(base.stdout || '{}'); } catch { failures.push('invalid_baseline_gate_output'); }
  if (base.status !== 0 || baseline.ok !== true) failures.push(...(baseline.failures || ['baseline_release_gate_failed']));
  const markerCommit = git(['log', '-1', '--format=%H', '--', markerPath]);
  let frozenValidation = null;
  let formal = null;
  if (!failures.length && marker.mode === 'slot-release') {
    if (marker.schemaVersion !== 2) failures.push('release_marker_schema_v2_required');
    const changed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', markerCommit]).split('\n');
    const previous = JSON.parse(git(['show', `${markerCommit}^:${markerPath}`]));
    for (const file of PROTECTED_FILES) {
      if (previous.protectedBlobs?.[file] !== marker.protectedBlobs[file] && !changed.includes(file)) failures.push(`non_atomic_data_and_marker:${file}`);
      if (git(['rev-parse', `${markerCommit}:${file}`]) !== marker.protectedBlobs[file]) failures.push(`marker_commit_data_mismatch:${file}`);
    }
    if (!changed.includes(markerPath) || !changed.includes(marker.reviewFile)) failures.push('formal_review_and_marker_not_in_one_commit');
    const frozen = {};
    const references = [
      ['reviewFile', 'reviewBlobSha', 'formal'], ['stagingReviewFile', 'stagingReviewBlobSha', 'staging'],
      ['handoffFile', 'handoffBlobSha', 'handoff'], ['auditFile', 'auditBlobSha', 'audit'],
    ];
    if (list(marker.deferredDois).length) references.push(['pendingQueueFile', 'pendingQueueBlobSha', 'queue']);
    for (const [fileKey, shaKey, key] of references) {
      const file = marker[fileKey];
      if (!auditPath(file) || !shaPattern.test(String(marker[shaKey] || ''))) { failures.push(`frozen_reference_missing:${fileKey}`); continue; }
      if (git(['rev-parse', `${markerCommit}:${file}`]) !== marker[shaKey]) { failures.push(`frozen_reference_mismatch:${fileKey}`); continue; }
      frozen[key] = JSON.parse(git(['show', `${markerCommit}:${file}`]));
    }
    if (!failures.length) {
      formal = frozen.formal;
      failures.push(...validateFormalPartition(frozen.staging, frozen.formal, marker, frozen.queue));
      const dir = await mkdtemp(path.join(tmpdir(), 'gallery-frozen-release-'));
      try {
        await mkdir(path.join(dir, 'audit'));
        for (const [file, payload] of [['staging.json', frozen.staging], ['audit/latest.json', frozen.audit], ['audit/unresolved-latest.json', frozen.handoff]]) {
          await writeFile(path.join(dir, file), JSON.stringify(payload));
        }
        const child = spawnSync(process.execPath, [fileURLToPath(new URL('./check-prepublish-readiness.mjs', import.meta.url)), 'staging.json', '--require-ready', ...(marker.releasePolicy === 'per-doi' ? ['--allow-deferred'] : [])], {
          cwd: dir, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
        });
        try { frozenValidation = JSON.parse(child.stdout || '{}'); } catch { failures.push('frozen_validator_output_invalid'); }
        if (child.status !== 0 || frozenValidation?.publicationReady !== true) failures.push('frozen_review_not_publishable');
      } finally { await rm(dir, { recursive: true, force: true }); }
    }
  }
  return {
    schemaVersion: 1, ok: failures.length === 0, gate: 'pages-literature-authorization',
    deploymentCommit: git(['rev-parse', 'HEAD']), markerCommit, mode: marker.mode,
    publicationSlot: marker.publicationSlot || null, productionCards: marker.productionCards,
    protectedFiles: PROTECTED_FILES.length, protectedInputsMatch: validateProtectedInputs(marker, actual).length === 0,
    baselineAuthorization: baseline, frozenValidation,
    reviewComplete: formal ? formal.pending.length === 0 : null,
    failures, productionDataModified: false,
    note: 'An unchanged authorized literature snapshot permits UI/media deployment. A new snapshot requires a fixed-slot atomic marker, formal decision partition, and immutable prepublish evidence. Publication authorization is not post-deploy verification.',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await authorize();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, gate: 'pages-literature-authorization', failures: ['authorization_unverifiable'], error: error.message, productionDataModified: false }, null, 2));
    process.exitCode = 1;
  }
}
