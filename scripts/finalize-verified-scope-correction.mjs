import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { authorizeScopeCorrection, CORRECTION_FILES, MARKER_FILE, doiKey, decodeDataset, collectDois } from './lib/immediate-scope-correction.mjs';

const pretty = value => JSON.stringify(value, null, 2) + '\n';
const statePath = 'audit/literature-update-state.json';
const marker = JSON.parse(await readFile(MARKER_FILE, 'utf8'));
const originalState = await readFile(statePath, 'utf8');
const state = JSON.parse(originalState);
if (marker.mode !== 'scope-correction' || (state.lastScopeCorrection?.id === marker.correctionId && state.lastScopeCorrection?.status === 'verified')) {
  console.log(JSON.stringify({ ok:true, skipped:true, reason:'No unverified scope correction', productionDataModified:false }));
  process.exit(0);
}
assert(!state.activeRun, 'Concurrent literature run: leave coordination state untouched');
assert.equal(state.lastScopeCorrection?.id, marker.correctionId, 'Correction state/marker mismatch');
const proof = await authorizeScopeCorrection();
assert(proof.ok, 'Scope correction authorization failed: ' + proof.failures.join('; '));
const repoValues = await Promise.all(CORRECTION_FILES.filter(file => !file.endsWith('.js')).map(async file => decodeDataset(file, await readFile(file, 'utf8'))));
const expected = collectDois(repoValues);
assert.equal(expected.size, marker.productionCards);
const site = 'https://zhou526316-sys.github.io/organic-synthesis-gallery';
const files = ['papers.gz.b64','total-synthesis.json','manual-supplement.json','final-audit-supplement.json','curated-supplement.json','automation-supplement.json','rolling-supplement.json','literature-supplement.json'];
const actual = new Set();
const add = row => { const doi = doiKey(row?.doi || row?.url); if (doi.startsWith('10.')) actual.add(doi); };
const checkedAt = new Date().toISOString();
await Promise.all(files.map(async file => {
  const response = await fetch(`${site}/${file}?scope-verify=${Date.now()}`, { signal:AbortSignal.timeout(30000), cache:'no-store' });
  assert(response.ok, `Required deployed file unavailable: ${file} HTTP ${response.status}`);
  const raw = await response.text();
  const payload = file.endsWith('.gz.b64') ? JSON.parse(gunzipSync(Buffer.from(raw.trim(),'base64')).toString('utf8')) : JSON.parse(raw);
  const rows = Array.isArray(payload) ? payload : payload.papers;
  assert(Array.isArray(rows), `Invalid deployed dataset: ${file}`);
  rows.forEach(add);
}));
const missing = [...expected].filter(doi => !actual.has(doi));
const extra = [...actual].filter(doi => !expected.has(doi));
assert.equal(missing.length, 0, 'Retained papers missing online: ' + missing.join(', '));
assert.equal(extra.length, 0, 'Unexpected or removed papers still online: ' + extra.join(', '));
for (const doi of marker.removedDois) assert(!actual.has(doi), 'Corrected DOI remains online: ' + doi);
assert.equal(await readFile(statePath, 'utf8'), originalState, 'Coordination state changed during verification');
const outputPath = `audit/scope-rechecks/${marker.correctionId}-live-verified.json`;
const output = {schemaVersion:1,ok:true,context:'Post-deployment scope-correction reconciliation',checkedAt,finishedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),markerCommit:proof.markerCommit,correctionId:marker.correctionId,site,repositoryDois:expected.size,deployedDois:actual.size,exactDoiSetMatch:true,removedDoisAbsent:marker.removedDois,retainedDoisVerified:expected.size,requiredDeployedFiles:files,verificationRun:process.env.GITHUB_RUN_ID||null,upstreamPagesRun:process.env.UPSTREAM_PAGES_RUN||null,productionDataModified:false,semanticReviewReperformed:false,mediaFetched:false};
state.lastAdmissionWebsiteSync ??= structuredClone(state.lastWebsiteSync);
state.lastScopeCorrection = {...state.lastScopeCorrection,status:'verified',deploymentVerifiedAt:output.finishedAt,verificationFile:outputPath,verificationRun:output.verificationRun,repositoryDois:expected.size,deployedDois:actual.size,exactDoiSetMatch:true};
state.lastWebsiteSync = {finishedAt:output.finishedAt,dataCommitSha:proof.markerCommit,capabilityFingerprint:state.lastWebsiteSync?.capabilityFingerprint||null,deployment:'success-live-verified',syncType:'scope-correction',verification:{productionGitHubPages:'success',totalGalleryCards:actual.size,galleryDois:actual.size,exactDoiSetMatch:true,removedDoisAbsent:marker.removedDois,retainedDoisVerified:expected.size,verificationRun:output.verificationRun,verificationFile:outputPath},tocVerification:state.lastWebsiteSync?.tocVerification||null};
// Existing semantic backlog and verifiedThrough are not changed by a deletion check.
state.phase = Array.isArray(state.pendingReviewBacklog) && state.pendingReviewBacklog.length ? 'synced_with_pending' : state.phase;
await writeFile(outputPath, pretty(output));
await writeFile(statePath, pretty(state));
await writeFile('/tmp/scope-correction-state-finalized.json', pretty({...output,stateFile:statePath,evidenceFile:outputPath}));
console.log(pretty(output));
