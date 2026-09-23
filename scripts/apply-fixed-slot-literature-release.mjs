import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { isExcludedDoi } from '../shared/literature-policy.js';

const ROOT = process.cwd();
const REQUEST = process.argv[2] || 'audit/automation-triggers/literature-release-request.json';
const PROTECTED_FILES = [
  'public/papers.gz.b64','public/total-synthesis.json','public/manual-supplement.json',
  'public/final-audit-supplement.json','public/curated-supplement.json',
  'public/automation-supplement.json','public/rolling-supplement.json','shared/literature-policy.js',
];
const OPTIONAL_SUPPLEMENTS = [
  'public/total-synthesis.json','public/manual-supplement.json','public/final-audit-supplement.json',
  'public/curated-supplement.json','public/automation-supplement.json','public/rolling-supplement.json',
  'public/literature-supplement.json',
];
const normalizeDoi = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
const pretty = value => JSON.stringify(value, null, 2) + '\n';
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const readJson = async file => JSON.parse(await readFile(path.resolve(ROOT, file), 'utf8'));
const beijingIso = () => new Date(Date.now() + 8 * 3600_000).toISOString().replace('Z', '+08:00');
const beijingDate = () => beijingIso().slice(0, 10);
function assert(ok, message) { if (!ok) throw new Error(message); }

async function loadProductionDois() {
  const dois = new Set();
  const add = paper => {
    const doi = normalizeDoi(paper?.doi || paper?.url);
    if (doi.startsWith('10.') && !isExcludedDoi(doi)) dois.add(doi);
  };
  const encoded = (await readFile(path.resolve(ROOT, 'public/papers.gz.b64'), 'utf8')).trim();
  JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')).forEach(add);
  for (const file of OPTIONAL_SUPPLEMENTS) {
    try { const payload = await readJson(file); (payload?.papers || []).forEach(add); } catch {}
  }
  return dois;
}

const request = await readJson(REQUEST);
const slot = String(request.publicationSlot || '');
const stagingFile = String(request.stagingReviewFile || '');
assert(/^\d{4}-\d{2}-\d{2}T(?:08|18):00:00\+08:00$/.test(slot), 'invalid publicationSlot');
assert(/^audit\/prepublish-review-\d{4}-\d{2}-\d{2}-(?:0800|1800)\.json$/.test(stagingFile), 'invalid stagingReviewFile');
const deltaMinutes = (Date.now() - Date.parse(slot)) / 60000;
assert(deltaMinutes >= 0 && deltaMinutes <= 20, `release request outside fixed-slot execution window: ${deltaMinutes.toFixed(2)} min`);
assert(beijingDate() === slot.slice(0, 10), 'release request Beijing date mismatch');

const stagingBlob = git(['hash-object', '--', stagingFile]);
const handoffBlob = git(['hash-object', '--', 'audit/unresolved-latest.json']);
const auditBlob = git(['hash-object', '--', 'audit/latest.json']);
if (request.stagingReviewBlobSha) assert(stagingBlob === request.stagingReviewBlobSha, 'staging blob changed after request');
if (request.handoffBlobSha) assert(handoffBlob === request.handoffBlobSha, 'compact handoff changed after request');
if (request.auditBlobSha) assert(auditBlob === request.auditBlobSha, 'full audit changed after request');

execFileSync(process.execPath, ['scripts/validate-prepublish-review.mjs', stagingFile, '--allow-deferred', '--require-ready'], { cwd: ROOT, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/check-prepublish-readiness.mjs', stagingFile, '--allow-deferred', '--require-ready'], { cwd: ROOT, stdio: 'inherit' });
const bundle = JSON.parse(execFileSync(process.execPath, ['scripts/convert-prepublish-review.mjs', stagingFile, '--require-ready'], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}));
assert(bundle.mode === 'release-preflight' && bundle.conversionValid === true && bundle.publicationReady === true, 'strict release bundle is not publishable');
assert(bundle.markerFields?.publicationSlot === slot, 'strict bundle slot mismatch');
assert(bundle.markerFields?.stagingReviewBlobSha === stagingBlob, 'strict bundle staging SHA mismatch');
assert(bundle.markerFields?.handoffBlobSha === handoffBlob, 'strict bundle handoff SHA mismatch');
assert(bundle.markerFields?.auditBlobSha === auditBlob, 'strict bundle audit SHA mismatch');

const formalPath = bundle.markerFields.reviewFile;
const queuePath = bundle.markerFields.pendingQueueFile;
await writeFile(path.resolve(ROOT, formalPath), pretty(bundle.formalReview));
await writeFile(path.resolve(ROOT, queuePath), pretty(bundle.pendingQueue));
assert(git(['hash-object', '--', formalPath]) === bundle.markerFields.reviewBlobSha, 'formal review byte SHA mismatch');
assert(git(['hash-object', '--', queuePath]) === bundle.markerFields.pendingQueueBlobSha, 'pending queue byte SHA mismatch');

const rollingPath = 'public/rolling-supplement.json';
const rolling = await readJson(rollingPath);
const byDoi = new Map();
for (const paper of Array.isArray(rolling.papers) ? rolling.papers : []) {
  const doi = normalizeDoi(paper?.doi || paper?.url);
  if (doi) byDoi.set(doi, paper);
}
for (const row of bundle.formalReview.accepted || []) {
  const doi = normalizeDoi(row.doi);
  const card = {
    journal: row.journal, title: row.title, doi, date: row.date, url: `https://doi.org/${doi}`,
    new: true, authors: Array.isArray(row.authors) ? row.authors : [], addedDate: slot.slice(0, 10),
  };
  const old = byDoi.get(doi);
  if (old?.titleZh) card.titleZh = old.titleZh;
  if (row.totalSynthesis === true) { card.totalSynthesis = true; card.cardLabel = row.cardLabel || 'Total Synthesis'; }
  byDoi.set(doi, card);
}
const forbidden = new Set([...(bundle.markerFields.rejectedDois || []), ...(bundle.markerFields.deferredDois || [])].map(normalizeDoi));
for (const doi of forbidden) byDoi.delete(doi);
const rollingOut = {
  generatedAt: beijingIso(),
  auditWindow: { start: bundle.formalReview?.windowAccounting?.mainWindowStart || '2026-09-21', end: slot.slice(0, 10) },
  papers: [...byDoi.values()],
  policyFilteredAt: slot.slice(0, 10),
};
await writeFile(path.resolve(ROOT, rollingPath), pretty(rollingOut));

const productionDois = await loadProductionDois();
for (const doi of bundle.markerFields.publishableDois || []) assert(productionDois.has(normalizeDoi(doi)), `publishable DOI absent after production write: ${doi}`);
for (const doi of bundle.markerFields.rejectedDois || []) assert(!productionDois.has(normalizeDoi(doi)), `rejected DOI present in production: ${doi}`);
for (const doi of bundle.markerFields.deferredDois || []) assert(!productionDois.has(normalizeDoi(doi)), `deferred DOI leaked into production: ${doi}`);

const protectedBlobs = {};
for (const file of PROTECTED_FILES) protectedBlobs[file] = git(['hash-object', '--', file]);
const marker = {
  schemaVersion: 2, mode: 'slot-release', releasePolicy: 'per-doi', publicationSlot: slot,
  generatedAt: beijingIso(), productionCards: productionDois.size,
  handoffGeneratedAt: bundle.markerFields.handoffGeneratedAt, protectedBlobs,
  reviewFile: formalPath, reviewBlobSha: bundle.markerFields.reviewBlobSha,
  stagingReviewFile: bundle.markerFields.stagingReviewFile, stagingReviewBlobSha: bundle.markerFields.stagingReviewBlobSha,
  handoffFile: bundle.markerFields.handoffFile, handoffBlobSha: bundle.markerFields.handoffBlobSha,
  auditFile: bundle.markerFields.auditFile, auditBlobSha: bundle.markerFields.auditBlobSha,
  publishableDois: bundle.markerFields.publishableDois,
  rejectedDois: bundle.markerFields.rejectedDois,
  deferredDois: bundle.markerFields.deferredDois,
  pendingQueueFile: queuePath, pendingQueueBlobSha: bundle.markerFields.pendingQueueBlobSha,
  note: 'Fixed-slot per-DOI release: verified include subset is published while evidence-scoped deferred DOI(s) remain outside production and in the durable review backlog.',
};
await writeFile(path.resolve(ROOT, 'audit/publication-release-state.json'), pretty(marker));

const result = {
  ok: true, publicationSlot: slot,
  reviewed: bundle.formalReview.summary.reviewed, accepted: bundle.formalReview.summary.accepted,
  rejected: bundle.formalReview.summary.rejected, pending: bundle.formalReview.summary.pending,
  productionCards: productionDois.size, publishableDois: bundle.markerFields.publishableDois,
  deferredDois: bundle.markerFields.deferredDois, formalReviewFile: formalPath,
  formalReviewBlobSha: bundle.markerFields.reviewBlobSha, pendingQueueFile: queuePath,
  pendingQueueBlobSha: bundle.markerFields.pendingQueueBlobSha,
  rollingBlobSha: protectedBlobs[rollingPath], stagingReviewBlobSha: stagingBlob,
  handoffBlobSha: handoffBlob, auditBlobSha: auditBlob,
};
await writeFile(path.resolve(ROOT, 'audit/release-execution-result.json'), pretty(result));
console.log('RELEASE_PREPARED ' + JSON.stringify(result));
