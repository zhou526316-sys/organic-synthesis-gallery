import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Read-only. --allow-deferred changes the unit of publication, never source/freshness gates.
const args = process.argv.slice(2);
const requireReady = args.includes('--require-ready');
const allowDeferred = args.includes('--allow-deferred');
const reviewFile = args.find(arg => !arg.startsWith('--')) || process.env.PREPUBLISH_FILE;
const readJson = async file => JSON.parse(await readFile(path.resolve(file), 'utf8'));
const norm = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
const count = value => Number.isSafeInteger(value) && value >= 0;

async function evaluate() {
  if (!reviewFile) throw new Error('Usage: node scripts/check-prepublish-readiness.mjs <review.json> [--require-ready] [--allow-deferred]');
  const [review, handoff, latest] = await Promise.all([
    readJson(reviewFile), readJson('audit/unresolved-latest.json'), readJson('audit/latest.json'),
  ]);
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./validate-prepublish-review.mjs', import.meta.url)), path.resolve(reviewFile), ...(allowDeferred ? ['--allow-deferred'] : [])], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, PREPUBLISH_REQUIRE_READY: '0' },
  });
  let record = {};
  try { record = JSON.parse(child.stdout || '{}'); } catch { /* Fail closed below. */ }
  const blockers = [];
  const block = (condition, message) => { if (!condition) blockers.push(message); };
  const recordValidationPassed = child.status === 0 && record.validationOk === true;
  block(recordValidationPassed, 'staging_record_validation_failed');
  const candidates = Array.isArray(handoff.unresolved) ? handoff.unresolved : [];
  const decisions = Array.isArray(review.decisions) ? review.decisions : [];
  const candidateDois = candidates.map(row => norm(row.doi));
  const decisionDois = decisions.map(row => norm(row.doi));
  block(Array.isArray(handoff.unresolved) && Array.isArray(review.decisions), 'candidate_or_decision_array_missing');
  block(candidateDois.every(doi => /^10\.\d{4,9}\/\S+$/.test(doi)) && new Set(candidateDois).size === candidateDois.length, 'invalid_or_duplicate_handoff_doi');
  block(new Set(decisionDois).size === decisions.length && decisions.length === candidates.length
    && candidateDois.every(doi => decisionDois.includes(doi)), 'decision_set_does_not_equal_handoff');
  block(count(handoff.summary?.unresolved) && handoff.summary.unresolved === candidates.length
    && latest.summary?.unresolved === candidates.length, 'paired_snapshot_candidate_count_mismatch');
  block(Boolean(handoff.generatedAt) && handoff.generatedAt === latest.generatedAt
    && review.handoffGeneratedAt === handoff.generatedAt, 'paired_snapshot_generation_mismatch');
  for (const key of ['criticalSourceFailures', 'sourceFamilyGaps', 'sourceCoverageAnomalies', 'historicalCoverageLosses']) {
    block(count(handoff.discoveryGate?.[key]) && handoff.discoveryGate[key] === 0
      && handoff.summary?.[key] === 0 && latest.summary?.[key] === 0,
    `discovery_metric_missing_nonzero_or_inconsistent:${key}`);
  }
  const pendingDois = decisions.filter(row => row.decision === 'pending').map(row => norm(row.doi));
  const includeDois = decisions.filter(row => row.decision === 'include').map(row => norm(row.doi));
  const excludeDois = decisions.filter(row => row.decision === 'exclude').map(row => norm(row.doi));
  const includeCount = includeDois.length, excludeCount = excludeDois.length;
  block(decisions.every(row => ['include', 'exclude', 'pending'].includes(row.decision)), 'invalid_decision');
  block(record.readyToPublish === true, 'reviewed_release_subset_not_ready');
  if (!allowDeferred) {
    block(pendingDois.length === 0, `pending_evidence:${pendingDois.length}`);
    block(review.qualityControl?.allHandoffCandidatesFinalized !== false, 'not_all_candidates_finalized');
    block(review.qualityControl?.openEvidenceGaps == null || review.qualityControl.openEvidenceGaps === 0, 'open_evidence_gaps');
    block(review.readyToPublish !== false && review.status === 'ready_to_publish', 'staging_status_not_ready_to_publish');
    for (const key of ['remainingUnresolved', 'remainingDois', 'pendingDois']) {
      block(review[key] == null || (Array.isArray(review[key]) && review[key].length === 0), `staging_remaining_items:${key}`);
    }
  } else {
    // Base validation requires the exact complete candidate set, evidence-backed deferrals,
    // and matching per-DOI challenge outcomes for all publishable records.
    block(includeCount > 0 || pendingDois.length === 0, 'pending_without_publishable_includes_is_not_final_zero');
    block(Array.isArray(record.publishableDois) && record.publishableDois.length === includeCount
      && includeDois.every(doi => record.publishableDois.includes(doi))
      && pendingDois.every(doi => !record.publishableDois.includes(doi)), 'release_allowlist_mismatch');
  }

  // Morning and evening use the same 65-minute snapshot window, with no backdating.
  const slot = String(review.publicationSlot || '');
  const slotValid = /^\d{4}-\d{2}-\d{2}T(?:08|18):00:00\+08:00$/.test(slot) && Number.isFinite(Date.parse(slot));
  const generated = Date.parse(handoff.generatedAt || '');
  const slotTime = Date.parse(slot);
  const snapshotFreshForSlot = slotValid && Number.isFinite(generated)
    && generated >= slotTime - 65 * 60 * 1000 && generated <= slotTime
    && handoff.endDate === slot.slice(0, 10) && latest.endDate === slot.slice(0, 10);
  block(slotValid, 'invalid_publication_slot');
  block(snapshotFreshForSlot, 'snapshot_not_from_target_slot_prerelease_window');
  const sourceChecks = Array.isArray(review.sourceChecks) ? review.sourceChecks : [];
  const publisherCoverageFullyVerified = sourceChecks.length > 0 && sourceChecks.every(row => row.status === 'checked');
  if (includeCount === 0) block(publisherCoverageFullyVerified, 'zero_new_requires_complete_publisher_source_proof');
  const semanticReady = recordValidationPassed && record.readyToPublish === true;
  const publicationReady = blockers.length === 0;
  return {
    schemaVersion: 2, mode: requireReady ? 'require-ready' : 'inspect',
    releasePolicy: allowDeferred ? 'per-doi' : 'full-review-closure',
    recordValidationPassed, semanticReady, snapshotFreshForSlot, publicationReady,
    reviewComplete: recordValidationPassed && pendingDois.length === 0,
    releaseStatus: publicationReady ? (pendingDois.length ? 'ready_with_pending' : 'ready_to_publish') : 'blocked',
    publicationSlot: slot || null, reviewFile, handoffGeneratedAt: handoff.generatedAt || null,
    reviewed: decisions.length, includeCount, excludeCount, pendingCount: pendingDois.length, pendingDois,
    publishableDois: semanticReady ? includeDois : [], rejectedDois: semanticReady ? excludeDois : [], deferredDois: pendingDois,
    publisherCoverageFullyVerified, blockers, recordFailures: record.failures || [],
    semanticBlockers: record.readinessBlockers || [], warnings: record.warnings || [],
    productionDataModified: false,
    note: 'Publish only publishableDois at the fixed slot. Persist deferredDois with evidence/retry details, keep them out of production, and do not advance closure across pending dates. This preflight performs no deployment.',
  };
}
try {
  const result = await evaluate();
  console.log(JSON.stringify(result, null, 2));
  if (!result.recordValidationPassed || (requireReady && !result.publicationReady)) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ schemaVersion: 2, recordValidationPassed: false, semanticReady: false,
    snapshotFreshForSlot: false, publicationReady: false, blockers: ['readiness_evaluation_failed'],
    error: error?.message || String(error), productionDataModified: false }, null, 2));
  process.exitCode = 1;
}
