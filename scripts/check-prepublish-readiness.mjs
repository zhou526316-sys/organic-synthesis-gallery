import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Read-only: this script never changes review, state, public data or deployment.
// --require-ready is a release preflight, not authorization to publish off-slot.
const args = process.argv.slice(2);
const requireReady = args.includes('--require-ready');
const reviewFile = args.find(arg => !arg.startsWith('--')) || process.env.PREPUBLISH_FILE;
const readJson = async file => JSON.parse(await readFile(path.resolve(file), 'utf8'));
const norm = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
const count = value => Number.isInteger(value) && value >= 0;

async function evaluate() {
  if (!reviewFile) throw new Error('Usage: node scripts/check-prepublish-readiness.mjs <staging.json> [--require-ready]');
  const [review, handoff, latest] = await Promise.all([
    readJson(reviewFile), readJson('audit/unresolved-latest.json'), readJson('audit/latest.json'),
  ]);
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./validate-prepublish-review.mjs', import.meta.url)), path.resolve(reviewFile)], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
  });
  let record = {};
  try { record = JSON.parse(child.stdout || '{}'); } catch { /* Fail closed below. */ }
  const blockers = [];
  const block = (condition, message) => { if (!condition) blockers.push(message); };
  const recordValidationPassed = child.status === 0 && record.ok === true;
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
  const includeCount = decisions.filter(row => row.decision === 'include').length;
  const excludeCount = decisions.filter(row => row.decision === 'exclude').length;
  block(pendingDois.length === 0, `pending_evidence:${pendingDois.length}`);
  block(decisions.every(row => ['include', 'exclude', 'pending'].includes(row.decision)), 'invalid_decision');
  block(review.qualityControl?.secondPassCompleted === true, 'second_pass_incomplete');
  block(review.qualityControl?.unresolvedDisagreements === 0, 'disagreements_missing_or_nonzero');
  block(review.qualityControl?.allHandoffCandidatesFinalized !== false, 'not_all_candidates_finalized');
  block(review.qualityControl?.openEvidenceGaps == null || review.qualityControl.openEvidenceGaps === 0, 'open_evidence_gaps');
  block(review.readyToPublish !== false, 'staging_explicitly_not_ready');
  block(review.status === 'ready_to_publish', 'staging_status_not_ready_to_publish');
  for (const key of ['remainingUnresolved', 'remainingDois', 'pendingDois']) {
    block(review[key] == null || (Array.isArray(review[key]) && review[key].length === 0), `staging_remaining_items:${key}`);
  }

  // The existing protocol's independent safety audit begins at 06:55/16:55.
  // A prior-evening rehearsal must not be mistaken for the next morning's scan.
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
  const publisherCoverageFullyVerified = sourceChecks.length > 0
    && sourceChecks.every(row => row.status === 'checked');
  // Ordinary nonzero releases may retain honestly documented publisher blocks.
  // Zero-new claims require the protocol's stronger publisher-source proof.
  if (includeCount === 0) block(publisherCoverageFullyVerified, 'zero_new_requires_complete_publisher_source_proof');
  const semanticReady = recordValidationPassed && pendingDois.length === 0
    && decisions.every(row => ['include', 'exclude'].includes(row.decision))
    && review.qualityControl?.secondPassCompleted === true
    && review.qualityControl?.unresolvedDisagreements === 0;
  const publicationReady = blockers.length === 0;
  return {
    schemaVersion: 1, mode: requireReady ? 'require-ready' : 'inspect',
    recordValidationPassed, semanticReady, snapshotFreshForSlot, publicationReady,
    publicationSlot: slot || null, reviewFile,
    handoffGeneratedAt: handoff.generatedAt || null,
    reviewed: decisions.length, includeCount, excludeCount, pendingCount: pendingDois.length, pendingDois,
    publisherCoverageFullyVerified, blockers,
    recordFailures: record.failures || (recordValidationPassed ? [] : [child.error?.message || child.stderr || 'validator_output_unavailable']),
    warnings: record.warnings || [],
    productionDataModified: false,
    note: 'Record validation success is not publication readiness. This read-only preflight does not trigger deployment. The release task must separately enforce 08:00/18:00, current SHA, and online verification.',
  };
}

try {
  const result = await evaluate();
  console.log(JSON.stringify(result, null, 2));
  if (!result.recordValidationPassed || (requireReady && !result.publicationReady)) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ schemaVersion: 1, recordValidationPassed: false, semanticReady: false,
    snapshotFreshForSlot: false, publicationReady: false, blockers: ['readiness_evaluation_failed'],
    error: error?.message || String(error), productionDataModified: false }, null, 2));
  process.exitCode = 1;
}
