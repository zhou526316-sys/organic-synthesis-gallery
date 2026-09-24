import { createHash } from 'node:crypto';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';
import { validateFormalPartition } from './validate-pages-literature-authorization.mjs';

// Conversion is not semantic review, a Git write, or publication authorization.
// The CLI prints a bundle to stdout only. Callers commit it atomically with data/marker.
export const CONVERTER_VERSION = '1.0.0';
export const normalizeDoi = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
export const serialize = value => JSON.stringify(value, null, 2) + '\n';
export function gitBlobSha(text) {
  const bytes = Buffer.from(text, 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
const text = value => typeof value === 'string' ? value.trim() : '';
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length
  && new Set(a).size === a.length && new Set(b).size === b.length && a.every(x => b.includes(x));
const slotPattern = /^\d{4}-\d{2}-\d{2}T(?:08|18):00:00\+08:00$/;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
function validSlot(slot) {
  return slotPattern.test(String(slot || '')) && Number.isFinite(Date.parse(slot))
    && new Date(Date.parse(slot) + 8 * 3600000).toISOString().slice(0, 19) === slot.slice(0, 19);
}
export function nextPublicationSlot(slot) {
  requireValue(validSlot(slot), 'invalid_publication_slot');
  if (slot.slice(11, 13) === '08') return `${slot.slice(0, 10)}T18:00:00+08:00`;
  const nextDay = new Date(Date.parse(slot) + 24 * 3600000 + 8 * 3600000).toISOString().slice(0, 10);
  return `${nextDay}T08:00:00+08:00`;
}
function checkOptionalCount(value, expected, name) {
  if (value !== undefined) requireValue(Number.isSafeInteger(value) && value === expected, `count_mismatch:${name}`);
}

export function convertPrepublishReview(staging, handoff, { generatedAt, sourceSnapshot = null } = {}) {
  requireValue(validSlot(staging?.publicationSlot), 'invalid_publication_slot');
  requireValue(typeof generatedAt === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(generatedAt)
    && Number.isFinite(Date.parse(generatedAt)), 'explicit_conversion_time_required');
  requireValue(Boolean(handoff?.generatedAt) && Number.isFinite(Date.parse(handoff.generatedAt))
    && staging.handoffGeneratedAt === handoff.generatedAt, 'handoff_generation_mismatch');
  for (const time of [handoff.generatedAt, staging.updatedAt, staging.createdAt].filter(Boolean)) {
    requireValue(Number.isFinite(Date.parse(time)) && Date.parse(generatedAt) >= Date.parse(time), 'conversion_time_predates_input');
  }
  requireValue(Array.isArray(staging.decisions) && Array.isArray(handoff.unresolved), 'candidate_or_decision_array_missing');
  requireValue(Number.isSafeInteger(handoff.summary?.unresolved) && handoff.summary.unresolved === handoff.unresolved.length,
    'handoff_candidate_count_mismatch');
  const candidates = new Map(handoff.unresolved.map(row => [normalizeDoi(row?.doi), row]));
  const decisionDois = staging.decisions.map(row => normalizeDoi(row?.doi));
  requireValue([...candidates.keys()].every(doi => /^10\.\d{4,9}\/\S+$/.test(doi))
    && candidates.size === handoff.unresolved.length, 'invalid_or_duplicate_candidate_doi');
  requireValue(sameSet(decisionDois, [...candidates.keys()]), 'complete_candidate_partition_required');
  requireValue(staging.qualityControl?.secondPassCompleted === true, 'second_pass_incomplete');
  requireValue(staging.qualityControl?.allHandoffCandidatesReviewed === true, 'all_candidates_reviewed_flag_required');
  requireValue(Number.isSafeInteger(staging.qualityControl?.unresolvedDisagreements)
    && staging.qualityControl.unresolvedDisagreements >= 0, 'disagreement_count_missing_or_invalid');
  requireValue(Number.isSafeInteger(staging.qualityControl?.openEvidenceGaps)
    && staging.qualityControl.openEvidenceGaps >= 0, 'evidence_gap_count_missing_or_invalid');
  requireValue(Array.isArray(staging.sourceChecks), 'source_checks_missing');
  requireValue(!staging.globalBlockers || (Array.isArray(staging.globalBlockers) && staging.globalBlockers.length === 0), 'global_blockers');
  requireValue(!['needs_approval', 'blocked_by_concurrent_change', 'source_gap'].some(x => [staging.phase, staging.status].includes(x)), 'global_review_block');

  const accepted = [], rejected = [], pending = [];
  const registry = new Map(TARGET_JOURNALS.map(row => [row.name, row]));
  for (const original of staging.decisions) {
    const doi = normalizeDoi(original.doi), candidate = candidates.get(doi);
    requireValue(['include', 'exclude', 'pending'].includes(original.decision), `invalid_decision:${doi}`);
    const row = { ...structuredClone(candidate), ...structuredClone(original), doi };
    for (const key of ['title', 'journal', 'date']) row[key] = text(original[key]) || text(candidate[key]);
    requireValue(row.title && row.journal && /^\d{4}-\d{2}-\d{2}$/.test(row.date), `bibliographic_fields_missing:${doi}`);
    requireValue(!text(candidate.journal) || row.journal === candidate.journal, `journal_changed_without_reconciliation:${doi}`);
    requireValue(!text(candidate.date) || row.date === candidate.date, `date_changed_without_reconciliation:${doi}`);
    const journal = registry.get(row.journal);
    requireValue(journal && (!journal.activeFrom || row.date >= journal.activeFrom), `journal_or_activation_invalid:${doi}`);
    if (candidate.reviewPriority === 'high') row.reviewPriority = 'high';
    row.reason = text(original.reason) || text(original.evidenceBasis);
    const requiresDetailedEvidence = row.decision === 'include' || row.decision === 'pending'
      || (row.decision === 'exclude' && row.reviewPriority === 'high');
    requireValue(row.reason.length >= (requiresDetailedEvidence ? 24 : 4), `reason_missing_or_too_short:${doi}`);
    if (!text(original.reason)) row.reasonDerivedFrom = 'evidenceBasis';
    if (requiresDetailedEvidence) {
      requireValue(text(row.evidenceBasis).length >= 40 && text(row.challengeReason).length >= 30,
        `evidence_or_challenge_missing:${doi}`);
    }
    requireValue(['include', 'exclude', 'pending'].includes(row.firstPassDecision)
      && ['include', 'exclude', 'pending'].includes(row.challengeDecision), `two_pass_outcomes_missing:${doi}`);
    if (row.decision === 'pending') {
      requireValue(text(row.evidenceNeeded).length >= 24, `pending_evidence_needed_missing:${doi}`);
      const attempted = row.attemptedEvidencePages || row.evidencePages;
      requireValue(Array.isArray(attempted) && attempted.some(url => /^https?:\/\//i.test(String(url))), `pending_attempted_sources_missing:${doi}`);
      row.attemptedEvidencePages = structuredClone(attempted);
      row.nextAction = text(row.nextAction) || row.evidenceNeeded;
      pending.push(row);
    } else {
      requireValue(row.firstPassDecision === row.decision && row.challengeDecision === row.decision, `final_decision_not_confirmed:${doi}`);
      (row.decision === 'include' ? accepted : rejected).push(row);
    }
  }
  const summary = { reviewed: staging.decisions.length, accepted: accepted.length, rejected: rejected.length, pending: pending.length };
  for (const key of Object.keys(summary)) checkOptionalCount(staging.summary?.[key], summary[key], `summary.${key}`);
  for (const [key, value] of [['reviewed', summary.reviewed], ['acceptedCount', accepted.length], ['rejectedCount', rejected.length], ['pendingCount', pending.length]]) {
    checkOptionalCount(staging[key], value, key);
  }
  for (const [key, rows] of [['acceptedDois', accepted], ['rejectedDois', rejected], ['pendingDois', pending], ['remainingDois', pending], ['remainingUnresolved', pending]]) {
    if (staging[key] !== undefined) requireValue(Array.isArray(staging[key]) && sameSet(staging[key].map(normalizeDoi), rows.map(row => row.doi)), `decision_allowlist_mismatch:${key}`);
  }
  requireValue(staging.qualityControl.openEvidenceGaps <= pending.length, 'unaccounted_evidence_gaps');
  const slot = staging.publicationSlot, suffix = `${slot.slice(0, 10)}-${slot.slice(11, 13)}00`;
  const formalReviewFile = `audit/review-${suffix}.json`, pendingQueueFile = `audit/pending-review-${suffix}.json`;
  const formalReview = {
    schemaVersion: 3, reviewType: 'formal_slot_review', generatedAt, publicationSlot: slot,
    handoffGeneratedAt: handoff.generatedAt, releasePolicy: { mode: 'per-doi' },
    converterVersion: CONVERTER_VERSION, sourceSnapshot: sourceSnapshot ? structuredClone(sourceSnapshot) : null,
    status: pending.length ? 'reviewed_with_deferrals' : 'reviewed', reviewComplete: pending.length === 0,
    summary, accepted, rejected, pending, sourceChecks: structuredClone(staging.sourceChecks),
    qualityControl: { ...structuredClone(staging.qualityControl), allHandoffCandidatesFinalized: pending.length === 0 },
  };
  for (const key of ['windowAccounting', 'decisionEvidencePolicy', 'sourceAudit']) {
    if (staging[key] !== undefined) formalReview[key] = structuredClone(staging[key]);
  }
  const pendingQueue = {
    schemaVersion: 1, publicationSlot: slot, generatedAt, handoffGeneratedAt: handoff.generatedAt,
    sourceReviewFile: formalReviewFile,
    items: pending.map(row => ({ ...structuredClone(row), sourceReviewFile: formalReviewFile,
      nextReviewSlot: nextPublicationSlot(slot) })),
    note: 'Per-release deferrals only. Merge with the existing durable backlog; do not replace or drop older pending records.',
  };
  const markerFields = {
    releasePolicy: 'per-doi', publicationSlot: slot, handoffGeneratedAt: handoff.generatedAt,
    reviewFile: formalReviewFile, reviewBlobSha: gitBlobSha(serialize(formalReview)),
    publishableDois: accepted.map(row => row.doi), rejectedDois: rejected.map(row => row.doi), deferredDois: pending.map(row => row.doi),
    ...(pending.length ? { pendingQueueFile, pendingQueueBlobSha: gitBlobSha(serialize(pendingQueue)) } : {}),
  };
  const partitionFailures = validateFormalPartition(staging, formalReview, markerFields, pendingQueue);
  requireValue(partitionFailures.length === 0, `formal_partition_rejected:${partitionFailures.join(';')}`);
  return { formalReviewFile, pendingQueueFile, formalReview, pendingQueue, markerFields };
}

async function main() {
  const args = process.argv.slice(2), requireReady = args.includes('--require-ready');
  const names = args.filter(arg => !arg.startsWith('--'));
  requireValue(names.length === 1 && args.every(arg => !arg.startsWith('--') || arg === '--require-ready'),
    'Usage: node scripts/convert-prepublish-review.mjs <audit/prepublish-review-...json> [--require-ready]');
  const sourceFile = names[0].replace(/\\/g, '/');
  requireValue(/^audit\/prepublish-review-[A-Za-z0-9_-]+\.json$/.test(sourceFile), 'invalid_staging_path');
  const files = [sourceFile, 'audit/unresolved-latest.json', 'audit/latest.json'];
  const raw = await Promise.all(files.map(file => readFile(file, 'utf8')));
  const [staging, handoff, latest] = raw.map(value => JSON.parse(value));
  requireValue(handoff.generatedAt === latest.generatedAt, 'paired_generation_mismatch');
  const dir = await mkdtemp(path.join(tmpdir(), 'gallery-conversion-'));
  let preflight;
  try {
    await mkdir(path.join(dir, 'audit'));
    for (let i = 0; i < files.length; i += 1) await writeFile(path.join(dir, files[i]), raw[i]);
    const script = requireReady ? 'check-prepublish-readiness.mjs' : 'validate-prepublish-review.mjs';
    const child = spawnSync(process.execPath, [fileURLToPath(new URL(`./${script}`, import.meta.url)), sourceFile,
      '--allow-deferred', ...(requireReady ? ['--require-ready'] : [])], {
      cwd: dir, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PREPUBLISH_REQUIRE_READY: '0' },
    });
    try { preflight = JSON.parse(child.stdout || '{}'); } catch { throw new Error('preflight_output_unreadable'); }
    requireValue(!child.error && child.status === 0 && preflight.ok !== false
      && (requireReady ? preflight.publicationReady === true : preflight.validationOk === true),
    `preflight_failed:${JSON.stringify(preflight.blockers || preflight.failures || child.error?.message || [])}`);
  } finally { await rm(dir, { recursive: true, force: true }); }
  const sourceSnapshot = {
    stagingReviewFile: sourceFile, stagingReviewBlobSha: gitBlobSha(raw[0]),
    handoffFile: files[1], handoffBlobSha: gitBlobSha(raw[1]), auditFile: files[2], auditBlobSha: gitBlobSha(raw[2]),
  };
  const bundle = convertPrepublishReview(staging, handoff, { generatedAt: new Date().toISOString(), sourceSnapshot });
  // Re-read after validation so a concurrent source replacement cannot go unnoticed.
  const finalRaw = await Promise.all(files.map(file => readFile(file, 'utf8')));
  requireValue(finalRaw.every((value, index) => value === raw[index]), 'source_changed_during_conversion');
  Object.assign(bundle.markerFields, sourceSnapshot);
  console.log(serialize({ schemaVersion: 1, converterVersion: CONVERTER_VERSION,
    conversionValid: true, publicationReady: requireReady && preflight.publicationReady === true,
    mode: requireReady ? 'release-preflight' : 'preview-only', productionDataModified: false,
    preflight, ...bundle,
    note: 'Exact serialization of formalReview/pendingQueue is JSON.stringify(value,null,2)+newline. This stdout bundle does not write or authorize production; fixed-slot atomic marker/data commit and Pages authorization are still required.',
  }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.log(serialize({ conversionValid: false, publicationReady: false, productionDataModified: false, error: error.message }));
    process.exitCode = 1;
  });
}
