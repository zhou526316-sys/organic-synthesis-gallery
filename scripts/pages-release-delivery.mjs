import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARKER = 'audit/publication-release-state.json';
export const DATA_FILES = Object.freeze(['papers.gz.b64', 'total-synthesis.json', 'manual-supplement.json',
  'final-audit-supplement.json', 'curated-supplement.json', 'automation-supplement.json', 'rolling-supplement.json']);
export const ARCHITECTURE_RELEASE = 'architecture-v1/release.json';
export const LIVE_FILES = Object.freeze([...DATA_FILES, 'literature-supplement.json', 'title-translations-zh.json', 'index.html']);
export const DELIVERY_FILES = Object.freeze([...LIVE_FILES, ARCHITECTURE_RELEASE]);
export const SITES = Object.freeze(['https://gallery.gczhouwld.com/', 'https://zhou526316-sys.github.io/organic-synthesis-gallery/']);
const sha = value => createHash('sha256').update(value).digest('hex');
const pretty = value => JSON.stringify(value, null, 2) + '\n';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
export const normalizeDoi = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
export function markerPublicationSlot(marker) {
  const mode = String(marker?.mode || '');
  if (mode === 'slot-release') return String(marker?.publicationSlot || '');
  if (mode === 'scope-correction') {
    assert(marker?.releasePolicy === 'deletion-only', 'invalid_scope_correction_policy');
    return String(marker?.lastFixedPublicationSlot || '');
  }
  return String(marker?.publicationSlot || '');
}
export function sameSet(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && new Set(a).size === a.length
    && new Set(b).size === b.length && a.every(value => b.includes(value));
}
export function papersFrom(name, text) {
  const data = JSON.parse(name === 'papers.gz.b64' ? gunzipSync(Buffer.from(text.trim(), 'base64')).toString('utf8') : text);
  const papers = Array.isArray(data) ? data : data.papers;
  assert(Array.isArray(papers), `paper_array_missing:${name}`);
  return papers;
}
export function collectPapers(files, excluded = () => false) {
  const result = new Map();
  for (const [name, text] of Object.entries(files)) {
    for (const row of papersFrom(name, text)) {
      const doi = normalizeDoi(row.doi || row.url);
      assert(/^10\.\d{4,9}\/\S+$/.test(doi), `invalid_doi:${name}`);
      if (!excluded(doi)) result.set(doi, { ...result.get(doi), ...row, doi });
    }
  }
  return result;
}
export function assertPartition(marker, dois) {
  assert(new Set(dois).size === dois.length && marker.productionCards === dois.length, 'production_count_mismatch');
  for (const doi of marker.publishableDois || []) assert(dois.includes(normalizeDoi(doi)), `accepted_missing:${doi}`);
  for (const doi of [...(marker.rejectedDois || []), ...(marker.deferredDois || [])]) {
    assert(!dois.includes(normalizeDoi(doi)), `nonpublishable_present:${doi}`);
  }
}
export function architectureObjects(directory, marker, sourceCommit, datasetSha256) {
  const releasePath = path.join(directory, ARCHITECTURE_RELEASE);
  const release = JSON.parse(readFileSync(releasePath, 'utf8'));
  assert(release?.schema === 'gallery-architecture-public-v1' && release.productionActivation === false, 'invalid_architecture_release');
  assert(release.publicationSlot === markerPublicationSlot(marker), 'architecture_slot_mismatch');
  assert(release.sourceCommit === sourceCommit, 'architecture_source_commit_mismatch');
  assert(release.markerBlobSha === git('rev-parse', `HEAD:${MARKER}`), 'architecture_marker_mismatch');
  assert(release.recordCount === marker.productionCards && release.datasetSha256 === datasetSha256, 'architecture_dataset_mismatch');
  assert(typeof release.catalogId === 'string' && /^[a-f0-9]{64}$/.test(release.catalogId), 'architecture_catalog_id_invalid');
  assert(Array.isArray(release.objects) && release.objects.length > 0, 'architecture_objects_missing');
  const objectDigests = {};
  const seen = new Set();
  for (const row of release.objects) {
    assert(row && typeof row.path === 'string' && /^[A-Za-z0-9_./-]+$/.test(row.path)
      && !row.path.startsWith('/') && !row.path.split('/').includes('..'), 'architecture_object_path_invalid');
    assert(!seen.has(row.path), 'architecture_object_duplicate'); seen.add(row.path);
    assert(/^[a-f0-9]{64}$/.test(row.sha256) && Number.isSafeInteger(row.bytes) && row.bytes >= 0, 'architecture_object_descriptor_invalid');
    const relative = `architecture-v1/${row.path}`;
    const bytes = readFileSync(path.join(directory, relative));
    assert(bytes.length === row.bytes && sha(bytes) === row.sha256, `architecture_object_mismatch:${row.path}`);
    objectDigests[relative] = row.sha256;
  }
  for (const required of [release.catalogCurrent, release.membership, release.acquisitionBasis, release.titlePresentation, release.hotFallback]) {
    assert(required && seen.has(required.path) && objectDigests[`architecture-v1/${required.path}`] === required.sha256,
      'architecture_required_reference_missing');
  }
  return { release, objectDigests };
}
export function trustedReleaseEvent(event, repository) {
  const run = event?.workflow_run;
  assert(run?.name === 'Fixed-slot literature release writer', 'untrusted_upstream_name');
  assert(run?.path === '.github/workflows/literature-fixed-slot-release.yml', 'untrusted_upstream_path');
  assert(run?.conclusion === 'success' && ['push', 'workflow_run'].includes(run?.event), 'upstream_not_successful_writer');
  assert(run?.head_repository?.full_name === repository, 'upstream_repository_mismatch');
  assert(run.head_branch === 'main' || (run.event === 'push' && /^automation\/release-[A-Za-z0-9-]+$/.test(run.head_branch)), 'untrusted_upstream_branch');
  assert(/^[a-f0-9]{40}$/.test(run.head_sha), 'invalid_upstream_sha');
  return run;
}
export function writerResultTargetsMarker(run, result, marker) {
  // An expired/idempotent writer is successful without creating a release.
  // Its completion must never masquerade as delivery of the previous marker.
  if (result?.writerRunId !== run.id) return false;
  assert(result.ok === true && result.publicationSlot === marker.publicationSlot
    && result.productionCards === marker.productionCards, 'writer_result_marker_mismatch');
  for (const key of ['stagingReviewBlobSha', 'handoffBlobSha', 'auditBlobSha']) {
    assert(result[key] === marker[key], `writer_result_evidence_mismatch:${key}`);
  }
  assert(result.formalReviewBlobSha === marker.reviewBlobSha, 'writer_result_review_mismatch');
  assert(/^[a-f0-9]{40}$/.test(result.approvedSourceCommit), 'writer_result_source_missing');
  return true;
}
export function isDirectReleaseHandoff(eventName, workflowName) {
  // Reusable Pages calls retain the caller's workflow_run payload and workflow name.
  // Only this workflow's own completion-event trigger has a release-writer payload.
  return eventName === 'workflow_run' && workflowName === 'Deploy GitHub Pages frontend';
}
function output(name, value) {
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: 'a' });
}
function currentMarker(ref = 'HEAD') { return JSON.parse(git('show', `${ref}:${MARKER}`)); }
export function compareProtected(expected, actual) {
  assert(sameSet(Object.keys(expected || {}), Object.keys(actual || {})), 'protected_file_set_changed');
  for (const [file, blob] of Object.entries(expected)) assert(actual[file] === blob, `superseded_protected_input:${file}`);
}
function guard() {
  git('fetch', '--no-tags', 'origin', 'main');
  git('merge-base', '--is-ancestor', git('rev-parse', 'HEAD'), 'origin/main');
  assert(git('rev-parse', `HEAD:${MARKER}`) === git('rev-parse', `origin/main:${MARKER}`), 'superseded_release_marker');
  const marker = currentMarker();
  compareProtected(marker.protectedBlobs, currentMarker('origin/main').protectedBlobs);
  for (const [file, blob] of Object.entries(marker.protectedBlobs)) {
    assert(git('rev-parse', `origin/main:${file}`) === blob, `unauthorized_current_main:${file}`);
  }
  return marker;
}
async function resolve() {
  assert(process.env.GITHUB_REF === 'refs/heads/main', 'deployment_must_execute_in_main_context');
  guard();
  if (isDirectReleaseHandoff(process.env.GITHUB_EVENT_NAME, process.env.GITHUB_WORKFLOW)) {
    const run = trustedReleaseEvent(json(process.env.GITHUB_EVENT_PATH), process.env.GITHUB_REPOSITORY);
    git('merge-base', '--is-ancestor', run.head_sha, 'HEAD');
    if (run.event === 'workflow_run') {
      const resultFile = 'audit/release-execution-result.json';
      const result = JSON.parse(git('show', `HEAD:${resultFile}`));
      if (!writerResultTargetsMarker(run, result, currentMarker())) {
        output('should_deploy', 'false');
        console.log(pretty({ ok: true, skipped: 'upstream_did_not_publish_current_marker', upstreamRun: run.id }));
        return;
      }
      assert(git('log', '-1', '--format=%H', '--', resultFile) === git('log', '-1', '--format=%H', '--', MARKER), 'writer_result_not_atomic_with_marker');
    } else {
      const request = JSON.parse(git('show', `${run.head_sha}:audit/automation-triggers/literature-release-request.json`));
      if (request.publicationSlot !== currentMarker().publicationSlot) {
        output('should_deploy', 'false');
        console.log(pretty({ ok: true, skipped: 'upstream_release_superseded', upstreamRun: run.id }));
        return;
      }
    }
  }
  output('deployment_ref', git('rev-parse', 'HEAD'));
  output('should_deploy', 'true');
  console.log(pretty({ ok: true, deploymentRef: git('rev-parse', 'HEAD'), executionRef: process.env.GITHUB_REF }));
}
async function build(directory) {
  const { isExcludedDoi } = await import('../shared/literature-policy.js');
  const marker = currentMarker();
  const source = collectPapers(Object.fromEntries(DATA_FILES.map(name => [name, git('show', `HEAD:public/${name}`)])), isExcludedDoi);
  const built = collectPapers(Object.fromEntries([...DATA_FILES, 'literature-supplement.json']
    .map(name => [name, readFileSync(path.join(directory, name), 'utf8')])), isExcludedDoi);
  const dois = [...source.keys()].sort();
  assertPartition(marker, dois);
  assert(sameSet(dois, [...built.keys()]), 'built_and_repository_doi_sets_differ');
  const titles = {};
  for (const raw of marker.publishableDois || []) {
    const doi = normalizeDoi(raw);
    const expected = source.get(doi)?.titleZh;
    assert(typeof expected === 'string' && /[\u3400-\u9fff]/u.test(expected), `chinese_title_missing:${doi}`);
    assert(built.get(doi)?.titleZh === expected, `built_chinese_title_changed:${doi}`);
    titles[doi] = expected;
  }
  const sourceCommit = git('rev-parse', 'HEAD');
  const datasetSha256 = sha(pretty(dois));
  const architecture = architectureObjects(directory, marker, sourceCommit, datasetSha256);
  const result = {
    schemaVersion: 2, sourceCommit, markerCommit: git('log', '-1', '--format=%H', '--', MARKER),
    markerBlobSha: git('rev-parse', `HEAD:${MARKER}`), publicationSlot: markerPublicationSlot(marker) || null,
    productionCards: dois.length, datasetSha256, dois,
    publishableDois: marker.publishableDois || [], rejectedDois: marker.rejectedDois || [], deferredDois: marker.deferredDois || [],
    protectedBlobs: marker.protectedBlobs, titleZh: titles,
    files: Object.fromEntries(DELIVERY_FILES.map(file => [file, sha(readFileSync(path.join(directory, file)))])),
    architectureObjects: architecture.objectDigests, architectureCatalogId: architecture.release.catalogId,
  };
  writeFileSync(path.join(directory, 'release-delivery.json'), pretty(result));
  console.log(pretty({ ok: true, sourceCommit: result.sourceCommit, productionCards: dois.length, datasetSha256: result.datasetSha256 }));
}
export function validateManifest(manifest, marker, markerBlob) {
  assert([1, 2].includes(manifest.schemaVersion) && /^[a-f0-9]{40}$/.test(manifest.sourceCommit), 'invalid_delivery_manifest');
  assert(manifest.markerBlobSha === markerBlob, 'manifest_marker_mismatch');
  assert(manifest.publicationSlot === (markerPublicationSlot(marker) || null), 'manifest_slot_mismatch');
  compareProtected(manifest.protectedBlobs, marker.protectedBlobs);
  assertPartition(marker, manifest.dois);
  assert(manifest.productionCards === marker.productionCards, 'manifest_count_mismatch');
  assert(sha(pretty([...manifest.dois].sort())) === manifest.datasetSha256, 'manifest_dataset_digest_mismatch');
  const expectedFiles = manifest.schemaVersion >= 2 ? DELIVERY_FILES : LIVE_FILES;
  assert(sameSet(Object.keys(manifest.files || {}), [...expectedFiles]), 'manifest_file_set_mismatch');
  for (const digest of Object.values(manifest.files)) assert(/^[a-f0-9]{64}$/.test(digest), 'invalid_file_digest');
  if (manifest.schemaVersion >= 2) {
    assert(manifest.files?.[ARCHITECTURE_RELEASE] && manifest.architectureCatalogId && /^[a-f0-9]{64}$/.test(manifest.architectureCatalogId), 'architecture_manifest_missing');
    assert(manifest.architectureObjects && Object.keys(manifest.architectureObjects).length > 0, 'architecture_manifest_objects_missing');
    for (const [file, digest] of Object.entries(manifest.architectureObjects)) {
      assert(file.startsWith('architecture-v1/') && /^[a-f0-9]{64}$/.test(digest), 'invalid_architecture_manifest_object');
    }
  } else {
    assert(!manifest.architectureObjects && !manifest.architectureCatalogId, 'legacy_manifest_cannot_claim_architecture');
  }
}
async function get(url) {
  const target = new URL(url);
  target.searchParams.set('release-check', `${process.env.GITHUB_RUN_ID || 'manual'}-${Date.now()}`);
  const response = await fetch(target, { headers: { 'cache-control': 'no-cache', pragma: 'no-cache' }, signal: AbortSignal.timeout(25000) });
  assert(response.ok, `HTTP_${response.status}:${target.pathname}`);
  assert(['gallery.gczhouwld.com', 'zhou526316-sys.github.io'].includes(new URL(response.url).hostname), 'unexpected_production_redirect');
  return { bytes: Buffer.from(await response.arrayBuffer()), effectiveUrl: response.url };
}
async function verify(manifestFile, resultFile) {
  const manifest = json(manifestFile);
  validateManifest(manifest, currentMarker(), git('rev-parse', `HEAD:${MARKER}`));
  const evidence = { schemaVersion: manifest.schemaVersion, ok: false, runId: Number(process.env.GITHUB_RUN_ID), runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1),
    sourceCommit: manifest.sourceCommit, markerCommit: manifest.markerCommit, markerBlobSha: manifest.markerBlobSha,
    publicationSlot: manifest.publicationSlot, productionCards: manifest.productionCards, datasetSha256: manifest.datasetSha256,
    publishableDois: manifest.publishableDois, rejectedDois: manifest.rejectedDois, deferredDois: manifest.deferredDois,
    chineseTitlesVerified: false, architectureVerified: manifest.schemaVersion < 2, architectureCatalogId: manifest.architectureCatalogId || null, sites: [] };
  try {
    for (const site of SITES) {
      let last;
      let success = false;
      for (let attempt = 1; attempt <= 6; attempt++) {
        try {
          const live = await get(new URL('release-delivery.json', site));
          assert(live.bytes.equals(readFileSync(manifestFile)), 'live_delivery_manifest_mismatch');
          const checks = await Promise.all(Object.entries(manifest.files).map(async ([file, digest]) => {
            const response = await get(new URL(file, site));
            assert(sha(response.bytes) === digest, `live_file_digest_mismatch:${file}`);
            return file;
          }));
          const architectureChecks = await Promise.all(Object.entries(manifest.schemaVersion >= 2 ? (manifest.architectureObjects || {}) : {}).map(async ([file, digest]) => {
            const response = await get(new URL(file, site));
            assert(sha(response.bytes) === digest, `live_architecture_digest_mismatch:${file}`);
            return file;
          }));
          evidence.sites.push({ site, effectiveUrl: live.effectiveUrl, filesVerified: checks, architectureFilesVerified: architectureChecks, attempts: attempt });
          success = true;
          break;
        } catch (error) { last = error; if (attempt < 6) await new Promise(done => setTimeout(done, 5000)); }
      }
      if (!success) throw new Error(`${site}: ${last?.message}`);
    }
    evidence.ok = true;
    evidence.chineseTitlesVerified = true;
    if (manifest.schemaVersion >= 2) evidence.architectureVerified = true;
    evidence.verifiedAt = new Date().toISOString();
    writeFileSync(resultFile, pretty(evidence));
    console.log(pretty(evidence));
  } catch (error) {
    evidence.error = error.message;
    evidence.failedAt = new Date().toISOString();
    writeFileSync(resultFile, pretty(evidence));
    throw error;
  }
}
export function mergeDeliveryState(state, evidence, current) {
  const next = structuredClone(state);
  const architectureRequired = Number(evidence.schemaVersion || 1) >= 2;
  assert(evidence.ok === true && evidence.chineseTitlesVerified === true && (!architectureRequired || evidence.architectureVerified === true), 'delivery_not_verified');
  assert(evidence.publicationSlot === markerPublicationSlot(current) && evidence.productionCards === current.productionCards, 'receipt_is_not_current_release');
  for (const name of ['publishableDois', 'rejectedDois', 'deferredDois']) {
    assert(sameSet(evidence[name], current[name] || []), `receipt_partition_mismatch:${name}`);
  }
  next.lastDeploymentAttempt = { ...evidence, status: 'success-live-verified' };
  next.lastPublication = { ...(state.lastPublication?.publicationSlot === evidence.publicationSlot ? state.lastPublication : {}),
    publicationSlot: evidence.publicationSlot, publicationCommit: evidence.markerCommit,
    reviewFile: current.reviewFile, reviewBlobSha: current.reviewBlobSha,
    productionCards: evidence.productionCards, publishedDois: evidence.publishableDois,
    rejectedDois: evidence.rejectedDois, deferredDois: evidence.deferredDois,
    pagesRun: evidence.runId, deploymentSourceCommit: evidence.sourceCommit, deploymentVerifiedAt: evidence.verifiedAt };
  next.lastWebsiteSync = {
    ...state.lastWebsiteSync,
    finishedAt: evidence.verifiedAt, dataCommitSha: evidence.markerCommit, deployment: 'success-live-verified',
    verification: { pagesRun: evidence.runId, deploymentSourceCommit: evidence.sourceCommit, publicationSlot: evidence.publicationSlot,
      markerBlobSha: evidence.markerBlobSha, totalGalleryCards: evidence.productionCards, galleryDois: evidence.productionCards,
      newlyAcceptedDoisPresent: evidence.publishableDois, rejectedDoisAbsent: evidence.rejectedDois, deferredDoisAbsent: evidence.deferredDois,
      chineseTitlesVerified: true, datasetSha256: evidence.datasetSha256, sites: evidence.sites,
      note: 'Exact built/live bytes and complete authorized DOI union verified. This delivery receipt does not assert discovery closure or advance verifiedThrough.' },
  };
  // A completed deployment must not erase a newer review, an active lock, or durable pending history.
  const target = Math.max(Date.parse(state.prepublishStaging?.publicationSlot || '') || 0, Date.parse(state.prepublish?.publicationSlot || '') || 0);
  if (!state.activeRun && target <= Date.parse(evidence.publicationSlot)) {
    next.phase = evidence.deferredDois.length || (state.pendingReviewBacklog || []).length ? 'synced_with_pending' : 'synced';
    for (const key of ['prepublishStaging', 'prepublish']) {
      if (next[key]?.publicationSlot === evidence.publicationSlot) {
        next[key] = { ...next[key], status: evidence.deferredDois.length ? 'published_with_pending' : 'published',
          phase: next.phase, pagesRun: evidence.runId, deploymentVerifiedAt: evidence.verifiedAt };
      }
    }
  }
  return next;
}
async function record(receiptFile) {
  const event = json(process.env.GITHUB_EVENT_PATH);
  const run = event.workflow_run;
  assert(run?.name === 'Deploy GitHub Pages frontend' && run?.path === '.github/workflows/github-pages.yml', 'untrusted_pages_workflow');
  assert(run?.head_branch === 'main' && run?.head_repository?.full_name === process.env.GITHUB_REPOSITORY, 'untrusted_pages_origin');
  const receipt = json(receiptFile);
  assert(run.conclusion === 'success' && receipt.runId === run.id && receipt.runAttempt === run.run_attempt, 'receipt_run_mismatch');
  assert(/^[a-f0-9]{40}$/.test(receipt.sourceCommit), 'invalid_receipt_sha');
  git('merge-base', '--is-ancestor', receipt.sourceCommit, 'HEAD');
  if (receipt.markerBlobSha !== git('rev-parse', `HEAD:${MARKER}`)) {
    console.log(pretty({ ok: true, skipped: 'newer_release_already_on_main', pagesRun: run.id }));
    return;
  }
  if (currentMarker().mode !== 'slot-release') {
    console.log(pretty({ ok: true, skipped: 'non_slot_release_uses_its_own_finalization', pagesRun: run.id }));
    return;
  }
  const state = mergeDeliveryState(json('audit/literature-update-state.json'), receipt, currentMarker());
  const toc = json('public/toc-demand-live.json');
  assert(toc.webpageDoiCount === receipt.productionCards, 'current_toc_count_mismatch');
  state.lastWebsiteSync.tocVerification = { webpageDoiCount: toc.webpageDoiCount, verifiedAt: receipt.verifiedAt,
    note: 'Queue membership count verified; this job does not obtain or publish media.' };
  writeFileSync('audit/literature-update-state.json', pretty(state));
  writeFileSync('audit/deployment-delivery-latest.json', pretty(receipt));
  mkdirSync('audit/deployment-deliveries', { recursive: true });
  const archive = `audit/deployment-deliveries/${run.id}-${run.run_attempt}.json`;
  if (existsSync(archive)) assert(readFileSync(archive, 'utf8') === pretty(receipt), 'immutable_delivery_receipt_conflict');
  else writeFileSync(archive, pretty(receipt));
}
async function recordFailure() {
  const run = json(process.env.GITHUB_EVENT_PATH).workflow_run;
  assert(run?.name === 'Deploy GitHub Pages frontend' && run?.path === '.github/workflows/github-pages.yml', 'untrusted_pages_workflow');
  assert(run?.head_branch === 'main' && run?.head_repository?.full_name === process.env.GITHUB_REPOSITORY, 'untrusted_pages_origin');
  assert(['failure', 'cancelled', 'timed_out', 'action_required'].includes(run.conclusion), 'not_a_failed_deployment');
  assert(/^[a-f0-9]{40}$/.test(run.head_sha), 'invalid_failed_run_sha');
  const failedMarker = git('rev-parse', `${run.head_sha}:${MARKER}`);
  const state = json('audit/literature-update-state.json');
  const attempt = { schemaVersion: 1, ok: false, runId: run.id, runAttempt: run.run_attempt,
    status: run.conclusion, markerBlobSha: failedMarker, finishedAt: run.updated_at,
    message: 'Deployment did not complete with verified live literature. Last successful website sync is preserved.' };
  // Old failures must not undo an already verified recovery or a newer release.
  if (failedMarker === git('rev-parse', `HEAD:${MARKER}`)
    && (Date.parse(state.lastWebsiteSync?.finishedAt || '') || 0) < Date.parse(run.updated_at)) {
    state.lastDeploymentAttempt = attempt;
    const target = Math.max(Date.parse(state.prepublishStaging?.publicationSlot || '') || 0, Date.parse(state.prepublish?.publicationSlot || '') || 0);
    if (!state.activeRun && target <= Date.parse(markerPublicationSlot(currentMarker()) || '')) state.phase = 'sync_failed';
    writeFileSync('audit/literature-update-state.json', pretty(state));
  }
  mkdirSync('audit/deployment-deliveries', { recursive: true });
  const archive = `audit/deployment-deliveries/${run.id}-${run.run_attempt}-failure.json`;
  if (!existsSync(archive)) writeFileSync(archive, pretty(attempt));
  console.log(pretty(attempt));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, first, second] = process.argv.slice(2);
    if (mode === 'resolve') await resolve();
    else if (mode === 'guard') { guard(); console.log(pretty({ ok: true, currentRelease: true })); }
    else if (mode === 'build') await build(first || 'dist');
    else if (mode === 'verify') await verify(first, second);
    else if (mode === 'record') await record(first);
    else if (mode === 'record-failure') await recordFailure();
    else throw new Error('Usage: pages-release-delivery.mjs resolve|guard|build|verify|record');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
