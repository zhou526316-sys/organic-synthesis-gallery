import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const REQUEST = process.argv[2] || 'audit/automation-triggers/literature-finalize-request.json';
const readJson = async file => JSON.parse(await readFile(path.resolve(ROOT, file), 'utf8'));
const pretty = value => JSON.stringify(value, null, 2) + '\n';
const norm = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && new Set(b).size === b.length
  && a.every(x => b.includes(x));
const beijingIso = () => new Date(Date.now() + 8 * 3600_000).toISOString().replace('Z', '+08:00');
function assert(ok, message) { if (!ok) throw new Error(message); }

const request = await readJson(REQUEST);
const state = await readJson('audit/literature-update-state.json');
const marker = await readJson('audit/publication-release-state.json');
const formal = await readJson(marker.reviewFile);
const latest = await readJson('audit/latest.json');
const compact = await readJson('audit/unresolved-latest.json');
const toc = await readJson('public/toc-demand-live.json');

assert(marker.mode === 'slot-release' && marker.schemaVersion === 2, 'slot-release marker missing');
assert(marker.publicationSlot === request.publicationSlot, 'publication slot mismatch');
assert(marker.productionCards === request.productionCards, 'production card count mismatch');
assert(Number.isSafeInteger(request.qualityGateRunId) && request.qualityGateRunId > 0, 'quality gate run id missing');
assert(toc.webpageDoiCount === marker.productionCards, 'TOC demand count differs from release marker');
assert(latest.generatedAt === compact.generatedAt, 'post-release paired audit generation mismatch');
assert(compact.summary?.galleryDois === marker.productionCards, 'post-release audit gallery count mismatch');
assert(compact.summary?.unresolved === compact.unresolved?.length, 'post-release compact unresolved count mismatch');
assert(Number.isSafeInteger(compact.summary?.criticalSourceFailures) && compact.summary.criticalSourceFailures === 0, 'critical source failure after release');
assert(Number.isSafeInteger(compact.summary?.sourceFamilyGaps) && compact.summary.sourceFamilyGaps === 0, 'source family gap after release');
assert(Number.isSafeInteger(compact.summary?.sourceCoverageAnomalies) && compact.summary.sourceCoverageAnomalies >= 0, 'source coverage anomaly metric missing after release');
assert(Number.isSafeInteger(compact.summary?.historicalCoverageLosses) && compact.summary.historicalCoverageLosses === 0, 'historical coverage loss after release');
const unresolvedDois = (compact.unresolved || []).map(x => norm(x.doi));
const deferredDois = (marker.deferredDois || []).map(norm);
const carryoverRows = Array.isArray(state.nextSlotPublicationBacklog) ? state.nextSlotPublicationBacklog : [];
const carryoverDois = carryoverRows.map(x => norm(x.doi));
const expectedUnresolvedDois = [...deferredDois, ...carryoverDois];
assert(new Set(expectedUnresolvedDois).size === expectedUnresolvedDois.length,
  'post-release pending/carryover DOI sets overlap or contain duplicates');
assert(sameSet(unresolvedDois, expectedUnresolvedDois),
  'post-release unresolved DOI set differs from exact pending plus reviewed next-slot carryover set');
for (const row of carryoverRows) {
  const doi = norm(row.doi);
  assert(row.decision === 'include' && row.status === 'ready_for_next_slot', `invalid next-slot carryover status: ${doi}`);
  assert(/^\d{4}-\d{2}-\d{2}T(?:08|18):00:00\+08:00$/.test(String(row.nextPublicationSlot || ''))
    && Date.parse(row.nextPublicationSlot) > Date.parse(marker.publicationSlot), `invalid next-slot carryover time: ${doi}`);
}
assert(formal.summary?.accepted === marker.publishableDois.length, 'formal accepted count mismatch');
assert(formal.summary?.pending === marker.deferredDois.length, 'formal pending count mismatch');

state.phase = deferredDois.length ? 'synced_with_pending' : (carryoverDois.length ? 'synced_with_carryover' : 'synced');
state.publicationChecksPassed = true;
state.reviewComplete = deferredDois.length === 0 && carryoverDois.length === 0;
state.nextPublicationSlot = request.nextPublicationSlot;
state.latestMachineAudit = {
  generatedAt: compact.generatedAt,
  sourceRecords: compact.summary?.sourceRecords ?? null,
  galleryDois: compact.summary?.galleryDois ?? null,
  missingFromGallery: compact.summary?.missingFromGallery ?? null,
  unresolved: compact.summary?.unresolved ?? null,
  potentialGaps: compact.summary?.potentialGaps ?? null,
  criticalSourceFailures: compact.summary?.criticalSourceFailures ?? null,
  sourceFamilyGaps: compact.summary?.sourceFamilyGaps ?? null,
  sourceCoverageAnomalies: compact.summary?.sourceCoverageAnomalies ?? null,
  closureCoverageAnomalies: compact.summary?.closureCoverageAnomalies ?? null,
  historicalCoverageLosses: compact.summary?.historicalCoverageLosses ?? null,
  closureDate: compact.closureDate || null,
  status: deferredDois.length
    ? (compact.summary?.sourceCoverageAnomalies > 0 ? 'post_release_verified_with_pending_and_coverage_warning' : 'post_release_verified_with_pending')
    : carryoverDois.length
      ? (compact.summary?.sourceCoverageAnomalies > 0 ? 'post_release_verified_with_carryover_and_coverage_warning' : 'post_release_verified_with_carryover')
      : (compact.summary?.sourceCoverageAnomalies > 0 ? 'post_release_verified_with_coverage_warning' : 'post_release_verified'),
  compactHandoffSha: request.postReleaseCompactBlobSha,
  latestBlobSha: request.postReleaseAuditBlobSha,
  runId: request.postReleaseAuditRunId,
  runConclusion: 'success',
  semanticReviewed: formal.summary?.reviewed ?? null,
  semanticFinalized: (formal.summary?.accepted || 0) + (formal.summary?.rejected || 0),
  semanticPending: formal.summary?.pending ?? 0,
  nextSlotPublicationCarryover: carryoverDois.length,
  note: 'Fresh post-release audit was recomputed against the deployed/repository production snapshot. Any remaining unresolved DOI set must equal the union of durable formal pending DOI(s) and separately reviewed next-slot include carryovers. Healthy sourceCoverageAnomalies may remain as closure warnings and do not invalidate an otherwise verified fixed-slot publication.'
};
state.lastQualityGate = {
  runId: request.qualityGateRunId,
  conclusion: 'success',
  publicationSlot: request.publicationSlot,
  triggerCommit: request.qualityGateTriggerCommit || null,
  verifiedAt: beijingIso()
};
state.lastPublication = {
  publicationSlot: request.publicationSlot,
  publicationCommit: request.publicationCommit,
  deploymentTriggerCommit: request.deploymentTriggerCommit,
  reviewFile: marker.reviewFile,
  reviewBlobSha: marker.reviewBlobSha,
  stagingReviewFile: marker.stagingReviewFile,
  stagingReviewBlobSha: marker.stagingReviewBlobSha,
  handoffGeneratedAt: marker.handoffGeneratedAt,
  prepublishGateRun: request.prepublishGateRunId,
  releaseWriterRun: request.releaseWriterRunId,
  preReleaseAuditRun: request.preReleaseAuditRunId,
  postReleaseAuditRun: request.postReleaseAuditRunId,
  qualityGateRun: request.qualityGateRunId,
  pagesRun: request.pagesRunId,
  tocRefreshRun: request.tocRefreshRunId,
  tocDemandCommit: request.tocDemandCommit,
  productionCards: marker.productionCards,
  publishedDois: marker.publishableDois,
  deferredDois: marker.deferredDois,
  nextSlotPublicationDois: carryoverDois,
  rejectedDois: marker.rejectedDois,
  publicationChecksPassed: true,
  reviewComplete: deferredDois.length === 0,
  publishedAt: request.publishedAt,
  finalizedAt: beijingIso()
};
state.lastWebsiteSync = {
  finishedAt: request.publishedAt,
  dataCommitSha: request.publicationCommit,
  capabilityFingerprint: state.currentStableCapabilityFingerprint || state.lastWebsiteSync?.capabilityFingerprint || null,
  deployment: 'success-live-verified',
  verification: {
    productionGitHubPages: 'success',
    pagesRun: request.pagesRunId,
    qualityGateRun: request.qualityGateRunId,
    deploymentTriggerCommit: request.deploymentTriggerCommit,
    newlyAcceptedDoisPresent: marker.publishableDois,
    rejectedDoisAbsent: marker.rejectedDois,
    deferredDoisAbsent: marker.deferredDois,
    totalGalleryCards: marker.productionCards,
    galleryDois: marker.productionCards,
    nextSlotPublicationDois: carryoverDois,
    note: 'Pages authorization/build/deploy and post-release quality gate succeeded; post-release DOI-union audit reports the same repository/deployed gallery count. Remaining unresolved DOI(s), if any, are exactly durable evidence-pending records plus reviewed next-slot include carryovers.'
  },
  tocVerification: {
    liveQueueCommitSha: request.tocDemandCommit,
    tocRefreshRun: request.tocRefreshRunId,
    visibleGapTotal: toc.visibleGapTotal ?? null,
    missingOfficialTotal: toc.missingOfficialTotal ?? null,
    officialUpgradeTotal: toc.officialUpgradeTotal ?? null,
    figureGapTotal: toc.figureGapTotal ?? null,
    note: 'TOC/Graphical Abstract/Figure1/body figures remain delegated to Tampermonkey/VPN Bridge; media gaps do not block literature cards.'
  }
};
if (state.prepublishStaging?.publicationSlot === request.publicationSlot) {
  state.prepublishStaging.status = deferredDois.length ? 'published_with_pending' : 'published';
  state.prepublishStaging.phase = state.phase;
  state.prepublishStaging.productionDataModified = true;
  state.prepublishStaging.pagesDeploymentRequested = true;
  state.prepublishStaging.publicationCommit = request.publicationCommit;
  state.prepublishStaging.pagesRun = request.pagesRunId;
  state.prepublishStaging.postReleaseAuditRun = request.postReleaseAuditRunId;
  state.prepublishStaging.qualityGateRun = request.qualityGateRunId;
}
if (state.prepublish?.publicationSlot === request.publicationSlot) {
  state.prepublish.status = deferredDois.length ? 'published_with_pending' : 'published';
  state.prepublish.phase = state.phase;
  state.prepublish.productionMutation = true;
  state.prepublish.publicationCommit = request.publicationCommit;
  state.prepublish.pagesRun = request.pagesRunId;
  state.prepublish.postReleaseAuditRun = request.postReleaseAuditRunId;
  state.prepublish.qualityGateRun = request.qualityGateRunId;
  state.prepublish.publicationChecksPassed = true;
}
const backlog = Array.isArray(state.pendingReviewBacklog) ? state.pendingReviewBacklog : [];
const byDoi = new Map(backlog.map(x => [norm(x.doi), x]));
for (const row of formal.pending || []) {
  const doi = norm(row.doi);
  const old = byDoi.get(doi) || {};
  byDoi.set(doi, {
    ...old,
    doi,
    journal: row.journal,
    title: row.title,
    originalDate: row.date || old.originalDate,
    lastReviewedAt: formal.generatedAt,
    publicationSlot: request.publicationSlot,
    evidenceGap: row.evidenceNeeded || row.reason || old.evidenceGap,
    evidenceNeeded: row.evidenceNeeded || old.evidenceNeeded,
    attemptedEvidencePages: row.attemptedEvidencePages || row.evidencePages || old.attemptedEvidencePages || [],
    sourceReview: marker.reviewFile,
    sourceReviewFile: marker.reviewFile,
    nextAction: row.nextAction || old.nextAction,
    status: 'pending',
    carryForward: true,
  });
}
state.pendingReviewBacklog = [...byDoi.values()].filter(x => deferredDois.includes(norm(x.doi)) || x.status === 'pending');

await writeFile(path.resolve(ROOT, 'audit/literature-update-state.json'), pretty(state));
const result = {
  ok: true,
  phase: state.phase,
  publicationSlot: request.publicationSlot,
  publicationCommit: request.publicationCommit,
  pagesRun: request.pagesRunId,
  qualityGateRun: request.qualityGateRunId,
  postReleaseAuditRun: request.postReleaseAuditRunId,
  postReleaseAuditGeneratedAt: compact.generatedAt,
  productionCards: marker.productionCards,
  published: marker.publishableDois.length,
  deferred: marker.deferredDois.length,
  nextSlotCarryover: carryoverDois.length,
  tocDemandCommit: request.tocDemandCommit,
  visibleGapTotal: toc.visibleGapTotal,
  missingOfficialTotal: toc.missingOfficialTotal,
  verifiedThrough: state.verifiedThrough,
};
await writeFile(path.resolve(ROOT, 'audit/release-finalization-result.json'), pretty(result));
console.log(JSON.stringify(result));
