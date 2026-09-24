import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const REQUEST = process.argv[2] || 'audit/automation-triggers/literature-release-failure-request.json';
const readJson = async file => JSON.parse(await readFile(path.resolve(ROOT, file), 'utf8'));
const pretty = value => JSON.stringify(value, null, 2) + '\n';
const norm = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && new Set(b).size === b.length
  && a.every(x => b.includes(x));
const nowBeijing = () => new Date(Date.now() + 8 * 3600_000).toISOString().replace('Z', '+08:00');
const assert = (ok, message) => { if (!ok) throw new Error(message); };

const request = await readJson(REQUEST);
const state = await readJson('audit/literature-update-state.json');
const marker = await readJson('audit/publication-release-state.json');
const compact = await readJson('audit/unresolved-latest.json');
const toc = await readJson('public/toc-demand-live.json');

assert(request.mode === 'post-release-quality-failure', 'unsupported failure mode');
assert(marker.mode === 'slot-release' && marker.schemaVersion === 2, 'slot-release marker missing');
assert(marker.publicationSlot === request.publicationSlot, 'publication slot mismatch');
assert(marker.productionCards === request.productionCards, 'production card count mismatch');
assert(compact.generatedAt === request.postReleaseAuditGeneratedAt, 'post-release audit generation mismatch');
assert(compact.summary?.galleryDois === marker.productionCards, 'post-release gallery count mismatch');
assert(compact.summary?.unresolved === compact.unresolved?.length, 'compact unresolved count mismatch');
assert(Number.isSafeInteger(compact.summary?.criticalSourceFailures) && compact.summary.criticalSourceFailures === 0, 'critical source failure');
assert(Number.isSafeInteger(compact.summary?.sourceFamilyGaps) && compact.summary.sourceFamilyGaps === 0, 'source family gap');
assert(Number.isSafeInteger(compact.summary?.historicalCoverageLosses) && compact.summary.historicalCoverageLosses === 0, 'historical coverage loss');
assert(Number.isSafeInteger(compact.summary?.sourceCoverageAnomalies), 'source coverage anomaly count missing');
assert(Number.isSafeInteger(compact.summary?.closureCoverageAnomalies), 'closure coverage anomaly count missing');
if (Number.isSafeInteger(request.observedSourceCoverageAnomalies)) {
  assert(compact.summary.sourceCoverageAnomalies === request.observedSourceCoverageAnomalies, 'source coverage anomaly count mismatch');
}
if (Number.isSafeInteger(request.observedClosureCoverageAnomalies)) {
  assert(compact.summary.closureCoverageAnomalies === request.observedClosureCoverageAnomalies, 'closure coverage anomaly count mismatch');
}
if (Number.isSafeInteger(request.expectedPostReleaseUnresolved)) {
  assert(compact.summary.unresolved === request.expectedPostReleaseUnresolved, 'post-release unresolved count mismatch');
}

const unresolved = (compact.unresolved || []).map(row => norm(row.doi));
const deferred = (marker.deferredDois || []).map(norm);
const carryForward = unresolved.filter(doi => !deferred.includes(doi));
if (Array.isArray(request.carryForwardUnreviewedDois) && request.carryForwardUnreviewedDois.length) {
  assert(sameSet(carryForward, request.carryForwardUnreviewedDois.map(norm)), 'carry-forward DOI set mismatch');
}
if (Number.isSafeInteger(request.expectedCarryForwardCount)) {
  assert(carryForward.length === request.expectedCarryForwardCount, 'carry-forward DOI count mismatch');
}
assert(carryForward.length > 0 || compact.summary.sourceCoverageAnomalies > 0, 'failure recorder requires a real post-release incompleteness condition');
assert(request.qualityGateConclusion === 'failure', 'quality gate failure evidence missing');

const published = new Set((marker.publishableDois || []).map(norm));
const stripPublishedCarryover = values => Array.isArray(values) ? values.filter(doi => !published.has(norm(doi))) : values;
if (Array.isArray(state.nextSlotPublicationDois)) state.nextSlotPublicationDois = stripPublishedCarryover(state.nextSlotPublicationDois);
if (Array.isArray(state.lastWebsiteSync?.verification?.nextSlotPublicationDois)) {
  state.lastWebsiteSync.verification.nextSlotPublicationDois = stripPublishedCarryover(state.lastWebsiteSync.verification.nextSlotPublicationDois);
}

state.phase = 'sync_failed';
state.publicationChecksPassed = false;
state.reviewComplete = false;
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
  status: 'post_release_incomplete_quality_closure',
  runId: request.postReleaseAuditRunId,
  runConclusion: 'success',
  note: 'Post-release DOI-union audit found unresolved work beyond the exact frozen deferred set and/or source coverage anomalies. No new DOI is silently treated as pending/excluded and no off-slot admission is authorized.'
};
state.lastQualityGate = {
  runId: request.qualityGateRunId,
  conclusion: 'failure',
  publicationSlot: request.publicationSlot,
  triggerCommit: request.qualityGateTriggerCommit,
  verifiedAt: nowBeijing(),
  failures: request.qualityGateFailures,
};
state.lastPublicationAttempt = {
  publicationSlot: request.publicationSlot,
  status: 'deployed_but_not_quality_finalized',
  publicationCommit: request.publicationCommit,
  deploymentTriggerCommit: request.deploymentTriggerCommit,
  pagesRun: request.pagesRunId,
  pagesConclusion: 'success',
  tocRefreshRun: request.tocRefreshRunId,
  tocDemandCommit: request.tocDemandCommit,
  postReleaseAuditRun: request.postReleaseAuditRunId,
  postReleaseAuditGeneratedAt: request.postReleaseAuditGeneratedAt,
  qualityGateRun: request.qualityGateRunId,
  qualityGateConclusion: 'failure',
  productionCards: marker.productionCards,
  releasedDois: marker.publishableDois,
  frozenDeferredDois: marker.deferredDois,
  postReleaseUnresolvedDois: unresolved,
  carryForwardUnreviewedDois: carryForward,
  carryForwardCount: carryForward.length,
  sourceCoverageAnomalies: compact.summary?.sourceCoverageAnomalies ?? null,
  closureCoverageAnomalies: compact.summary?.closureCoverageAnomalies ?? null,
  nextPublicationSlot: request.nextPublicationSlot,
  finalizationAllowed: false,
  reason: 'The real post-release literature-quality-gate failed. Production/deployed DOI sets match, but post-release unresolved work exceeds the exact frozen deferred set and source coverage anomalies remain. No off-slot admission is authorized; unresolved work carries to the next fixed slot.',
  recordedAt: nowBeijing(),
};
if (state.prepublishStaging?.publicationSlot === request.publicationSlot) {
  state.prepublishStaging.status = 'deployed_quality_failed';
  state.prepublishStaging.phase = 'sync_failed';
  state.prepublishStaging.productionDataModified = true;
  state.prepublishStaging.pagesDeploymentRequested = true;
  state.prepublishStaging.publicationCommit = request.publicationCommit;
  state.prepublishStaging.pagesRun = request.pagesRunId;
  state.prepublishStaging.postReleaseAuditRun = request.postReleaseAuditRunId;
  state.prepublishStaging.qualityGateRun = request.qualityGateRunId;
  state.prepublishStaging.publicationChecksPassed = false;
  state.prepublishStaging.postReleaseCarryForwardDois = carryForward;
}
if (state.prepublish?.publicationSlot === request.publicationSlot) {
  state.prepublish.status = 'deployed_quality_failed';
  state.prepublish.phase = 'sync_failed';
  state.prepublish.productionMutation = true;
  state.prepublish.publicationCommit = request.publicationCommit;
  state.prepublish.pagesRun = request.pagesRunId;
  state.prepublish.postReleaseAuditRun = request.postReleaseAuditRunId;
  state.prepublish.qualityGateRun = request.qualityGateRunId;
  state.prepublish.publicationChecksPassed = false;
  state.prepublish.remainingDois = carryForward;
}

await writeFile(path.resolve(ROOT, 'audit/literature-update-state.json'), pretty(state));
const result = {
  ok: true,
  phase: state.phase,
  publicationSlot: request.publicationSlot,
  publicationCommit: request.publicationCommit,
  pagesRun: request.pagesRunId,
  pagesConclusion: 'success',
  qualityGateRun: request.qualityGateRunId,
  qualityGateConclusion: 'failure',
  postReleaseAuditRun: request.postReleaseAuditRunId,
  postReleaseAuditGeneratedAt: compact.generatedAt,
  productionCards: marker.productionCards,
  frozenPublished: marker.publishableDois.length,
  frozenRejected: marker.rejectedDois?.length ?? null,
  frozenDeferred: marker.deferredDois.length,
  postReleaseUnresolved: unresolved.length,
  carryForwardUnreviewed: carryForward.length,
  carryForwardUnreviewedDois: carryForward,
  sourceCoverageAnomalies: compact.summary?.sourceCoverageAnomalies ?? null,
  closureCoverageAnomalies: compact.summary?.closureCoverageAnomalies ?? null,
  tocWebpageDoiCount: toc.webpageDoiCount ?? null,
  nextPublicationSlot: request.nextPublicationSlot,
};
await writeFile(path.resolve(ROOT, 'audit/release-finalization-result.json'), pretty(result));
console.log(JSON.stringify(result));
