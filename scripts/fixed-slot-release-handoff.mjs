import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUEST = 'audit/automation-triggers/literature-release-request.json';
export const MARKER = 'audit/publication-release-state.json';
const RESULT = 'audit/release-execution-result.json';
const SHA = /^[a-f0-9]{40}$/;
const SLOT = /^\d{4}-\d{2}-\d{2}T08:00:00\+08:00$/;
const pretty = value => JSON.stringify(value, null, 2) + '\n';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
export const blobSha = value => {
  const bytes = Buffer.from(pretty(value));
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};
export function validateGateRun(run, repository) {
  assert(run?.name === 'Validate prepublish literature review'
    && run.path === '.github/workflows/prepublish-review-gate.yml', 'untrusted_gate_workflow');
  assert(run.conclusion === 'success' && run.status === 'completed' && run.event === 'push', 'gate_not_successful_push');
  assert(run.head_branch === 'main' && run.head_repository?.full_name === repository, 'untrusted_gate_origin');
  assert(Number.isSafeInteger(run.id) && run.id > 0 && SHA.test(run.head_sha), 'invalid_gate_identity');
  return run;
}
export function slotState(slot, now, publishedSlot) {
  assert(SLOT.test(slot) && Number.isFinite(Date.parse(slot)), 'invalid_publication_slot');
  assert(Number.isFinite(now), 'invalid_clock');
  if (Date.parse(publishedSlot || '') >= Date.parse(slot)) return 'already_published_or_superseded';
  const delta = now - Date.parse(slot);
  if (delta > 20 * 60_000) return 'expired_slot';
  assert(delta >= -65 * 60_000, 'slot_not_in_arming_window');
  return delta < 0 ? 'waiting_for_slot' : 'slot_open';
}
export function validateEvidence(record, readiness, bundle) {
  assert(record?.readyToPublish === true && record.validationMode === 'require-ready', 'record_gate_not_ready');
  for (const key of ['publicationReady', 'snapshotFreshForSlot', 'semanticReady', 'recordValidationPassed']) {
    assert(readiness?.[key] === true, `slot_gate_not_ready:${key}`);
  }
  assert(bundle?.mode === 'release-preflight' && bundle.conversionValid === true
    && bundle.publicationReady === true, 'strict_bundle_not_ready');
  const fields = bundle.markerFields;
  assert(fields?.releasePolicy === 'per-doi' && SLOT.test(fields.publicationSlot), 'invalid_bundle_policy_or_slot');
  const date = fields.publicationSlot.slice(0, 10), hour = fields.publicationSlot.slice(11, 13);
  assert(fields.stagingReviewFile === `audit/prepublish-review-${date}-${hour}00.json`, 'invalid_staging_path');
  assert(fields.handoffFile === 'audit/unresolved-latest.json' && fields.auditFile === 'audit/latest.json', 'invalid_evidence_paths');
  for (const key of ['stagingReviewBlobSha', 'handoffBlobSha', 'auditBlobSha', 'reviewBlobSha', 'pendingQueueBlobSha']) {
    assert(SHA.test(fields[key]), `invalid_evidence_sha:${key}`);
  }
  for (const result of [record, readiness, bundle.preflight]) {
    assert(result?.publicationSlot === fields.publicationSlot && result.reviewFile === fields.stagingReviewFile
      && result.handoffGeneratedAt === fields.handoffGeneratedAt, 'mixed_gate_generation');
    for (const key of ['publishableDois', 'rejectedDois', 'deferredDois']) {
      assert(JSON.stringify(result[key]) === JSON.stringify(fields[key]), `mixed_gate_partition:${key}`);
    }
  }
  const all = ['publishableDois', 'rejectedDois', 'deferredDois'].flatMap(key => {
    assert(Array.isArray(fields[key]), `partition_missing:${key}`); return fields[key];
  });
  assert(new Set(all).size === all.length, 'overlapping_doi_partitions');
  assert(blobSha(bundle.formalReview) === fields.reviewBlobSha
    && blobSha(bundle.pendingQueue) === fields.pendingQueueBlobSha, 'formal_serialization_mismatch');
  const scope = bundle.formalReview?.qualityControl?.scopeContract;
  assert(scope?.scopeRulesFile === 'docs/literature-scope-contract.md'
    && scope.scopeCorrectionsFile === 'audit/literature-scope-corrections.json'
    && SHA.test(scope.scopeRulesBlobSha) && SHA.test(scope.scopeCorrectionsBlobSha), 'scope_contract_missing');
  for (const row of bundle.formalReview.accepted || []) {
    for (const key of ['primaryContribution', 'preparativeTransformation', 'generalityEvidence', 'sourceEvidence', 'boundaryChallenge']) {
      assert(row.scopeAssessment?.[key], `scope_assessment_missing:${row.doi}:${key}`);
    }
  }
  return fields;
}
export function compareBindings(expected, actual) {
  assert(JSON.stringify(Object.keys(expected).sort()) === JSON.stringify(Object.keys(actual).sort()), 'binding_paths_changed');
  for (const [file, sha] of Object.entries(expected)) assert(sha === actual[file], `approved_input_changed:${file}`);
}
function output(name, value) {
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: 'a' });
}
function temp(name) {
  assert(process.env.RUNNER_TEMP, 'runner_temp_missing');
  return path.join(process.env.RUNNER_TEMP, name);
}
function status(value) {
  writeFileSync(temp('release-handoff-status.json'), pretty({ recordedAt: new Date().toISOString(), ...value }));
  console.log(pretty(value));
}
function gitJson(ref, file) { return JSON.parse(git('show', `${ref}:${file}`)); }
function bindings(ref, staging) {
  const marker = gitJson(ref, MARKER);
  const files = ['scripts', 'shared', '.github/workflows/prepublish-review-gate.yml',
    '.github/workflows/literature-fixed-slot-release.yml', 'PROJECT_RULES.md',
    'docs/literature-scope-contract.md', 'docs/literature-update-protocol.md',
    'docs/publication-release-contract.md', 'docs/formal-review-conversion.md',
    'audit/literature-scope-corrections.json', 'audit/scope-removal-authority.json',
    MARKER, staging, 'audit/unresolved-latest.json', 'audit/latest.json', ...Object.keys(marker.protectedBlobs || {})];
  assert(Object.keys(marker.protectedBlobs || {}).length === 8, 'invalid_protected_file_count');
  return Object.fromEntries([...new Set(files)].map(file => [file, git('rev-parse', `${ref}:${file}`)]));
}
function refreshMain() {
  git('fetch', '--no-tags', 'origin', 'main');
  git('reset', '--hard', 'origin/main');
  return git('rev-parse', 'HEAD');
}
function assertCoordinator(slot) {
  const state = json('audit/literature-update-state.json');
  assert(!state.activeRun, 'active_authority_lock');
  for (const key of ['prepublishStaging', 'prepublish']) {
    assert(!(Date.parse(state[key]?.publicationSlot || '') > Date.parse(slot)), 'newer_review_slot_in_progress');
  }
}
async function prepare() {
  output('prepared', 'false');
  const event = json(process.env.GITHUB_EVENT_PATH);
  const automatic = process.env.GITHUB_EVENT_NAME === 'workflow_run';
  let source, request, evidence;
  if (automatic) {
    const run = validateGateRun(event.workflow_run, process.env.GITHUB_REPOSITORY);
    assert(process.env.GITHUB_REF === 'refs/heads/main', 'automatic_writer_requires_main');
    source = run.head_sha;
    const dir = temp('approved-prepublish');
    evidence = json(path.join(dir, 'formal-release-bundle.json'));
    const fields = validateEvidence(json(path.join(dir, 'prepublish-readiness.json')),
      json(path.join(dir, 'prepublish-slot-readiness.json')), evidence);
    request = { schemaVersion: 1, requestId: `gate-${run.id}-fixed-slot-release`,
      publicationSlot: fields.publicationSlot, stagingReviewFile: fields.stagingReviewFile,
      stagingReviewBlobSha: fields.stagingReviewBlobSha, handoffBlobSha: fields.handoffBlobSha,
      auditBlobSha: fields.auditBlobSha, prepublishGateRunId: run.id,
      expectedPublishableCount: fields.publishableDois.length, expectedDeferredCount: fields.deferredDois.length };
  } else {
    assert(process.env.GITHUB_EVENT_NAME === 'push', 'unsupported_writer_event');
    assert(process.env.GITHUB_REF === 'refs/heads/main'
      || /^refs\/heads\/automation\/release-[A-Za-z0-9-]+$/.test(process.env.GITHUB_REF || ''), 'untrusted_request_branch');
    source = event.after;
    assert(SHA.test(source), 'invalid_request_commit');
    git('fetch', '--no-tags', 'origin', source);
    request = gitJson(source, REQUEST);
  }
  const slot = request.publicationSlot;
  assert(SLOT.test(slot) && request.stagingReviewFile === `audit/prepublish-review-${slot.slice(0, 10)}-${slot.slice(11, 13)}00.json`, 'invalid_request_slot_or_path');
  for (const key of ['stagingReviewBlobSha', 'handoffBlobSha', 'auditBlobSha']) assert(SHA.test(request[key]), `missing_request_sha:${key}`);
  // A successful old gate is evidence, not permission to replay a missed slot.
  refreshMain();
  let timing = slotState(slot, Date.now(), json(MARKER).publicationSlot);
  if (['expired_slot', 'already_published_or_superseded'].includes(timing)) {
    status({ ok: true, prepared: false, skipped: timing, publicationSlot: slot, productionDataModified: false }); return;
  }
  if (automatic) git('merge-base', '--is-ancestor', source, 'HEAD');
  else if (process.env.GITHUB_REF !== 'refs/heads/main') {
    const base = git('merge-base', 'HEAD', source);
    const changed = git('diff', '--name-only', base, source).split('\n').filter(Boolean);
    assert(changed.every(file => file === REQUEST), 'bridge_contains_non_request_changes');
  }
  const expected = bindings(source, request.stagingReviewFile);
  assert(expected[request.stagingReviewFile] === request.stagingReviewBlobSha
    && expected['audit/unresolved-latest.json'] === request.handoffBlobSha
    && expected['audit/latest.json'] === request.auditBlobSha, 'gate_source_sha_mismatch');
  if (evidence) {
    const scope = evidence.formalReview.qualityControl.scopeContract;
    assert(expected[scope.scopeRulesFile] === scope.scopeRulesBlobSha
      && expected[scope.scopeCorrectionsFile] === scope.scopeCorrectionsBlobSha, 'scope_source_sha_mismatch');
  }
  while (true) {
    compareBindings(expected, bindings('HEAD', request.stagingReviewFile));
    assertCoordinator(slot);
    timing = slotState(slot, Date.now(), json(MARKER).publicationSlot);
    if (timing !== 'waiting_for_slot') break;
    status({ ok: true, prepared: false, status: timing, publicationSlot: slot, prepublishGateRunId: request.prepublishGateRunId, productionDataModified: false });
    await new Promise(resolve => setTimeout(resolve, Math.min(30_000, Date.parse(slot) - Date.now())));
    refreshMain();
  }
  if (timing !== 'slot_open') {
    status({ ok: true, prepared: false, skipped: timing, publicationSlot: slot, productionDataModified: false }); return;
  }
  request.requestedAt = new Date().toISOString();
  request.approvedSourceCommit = source;
  request.writerRunId = Number(process.env.GITHUB_RUN_ID);
  const baseCommit = git('rev-parse', 'HEAD');
  writeFileSync(temp('fixed-slot-request.json'), pretty(request));
  writeFileSync(temp('fixed-slot-plan.json'), pretty({ baseCommit, request, expected }));
  // Existing validators and deterministic conversion run again on latest main.
  execFileSync(process.execPath, ['scripts/apply-fixed-slot-literature-release.mjs', temp('fixed-slot-request.json')], { stdio: 'inherit' });
  writeFileSync(REQUEST, pretty(request));
  const result = json(RESULT);
  result.writerRunId = Number(process.env.GITHUB_RUN_ID);
  result.writerEvent = process.env.GITHUB_EVENT_NAME;
  result.prepublishGateRunId = request.prepublishGateRunId;
  result.approvedSourceCommit = source;
  result.baseCommit = baseCommit;
  writeFileSync(RESULT, pretty(result));
  output('prepared', 'true');
  status({ ok: true, prepared: true, publicationSlot: slot, prepublishGateRunId: request.prepublishGateRunId,
    baseCommit, productionCards: result.productionCards, productionCommitCreated: false });
}
function commitGuard() {
  const plan = json(temp('fixed-slot-plan.json'));
  assert(slotState(plan.request.publicationSlot, Date.now()) === 'slot_open', 'commit_outside_slot');
  git('fetch', '--no-tags', 'origin', 'main');
  assert(git('rev-parse', 'origin/main') === plan.baseCommit, 'blocked_by_concurrent_change');
  compareBindings(plan.expected, bindings('origin/main', plan.request.stagingReviewFile));
  assertCoordinator(plan.request.publicationSlot);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'prepare') await prepare();
    else if (process.argv[2] === 'commit-guard') commitGuard();
    else throw new Error('Usage: fixed-slot-release-handoff.mjs prepare|commit-guard');
  } catch (error) {
    status({ ok: false, prepared: false, error: error.message, publicationCommitCreated: false });
    process.exitCode = 1;
  }
}
