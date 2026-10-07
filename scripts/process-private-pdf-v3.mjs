import fs from 'node:fs';
import path from 'node:path';
import { PRIVATE_PDF_PROCESSOR_REVISION, sha256Hex, verifyPrivatePdfBytes } from './private-pdf-readable-verifier.mjs';

const API_BASE = String(process.env.PRIVATE_PDF_PROCESSING_API_BASE || 'https://api.gczhouwld.com').replace(/\/$/, '');
const token = String(process.env.BRIDGE_WRITE_TOKEN || '');
const output = process.env.PRIVATE_PDF_PROCESSING_OUTPUT || '';
const maxDocuments = Math.max(1, Math.min(240, Number(process.env.PRIVATE_PDF_PROCESS_MAX_DOCUMENTS || 200)));
const batchSize = Math.max(1, Math.min(12, Number(process.env.PRIVATE_PDF_PROCESS_BATCH_SIZE || 8)));
if (!token) throw new Error('BRIDGE_WRITE_TOKEN_required');

const report = { schemaVersion: 1, suite: 'private-pdf-readable-processing-v1', ok: false,
  processorRevision: PRIVATE_PDF_PROCESSOR_REVISION, apiBase: API_BASE, maxDocuments, batchSize,
  processed: 0, verified: 0, failed: 0, failures: {}, items: [], startedAt: new Date().toISOString() };
function save() {
  if (!output) return;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
async function api(route, init = {}) {
  const response = await fetch(API_BASE + route, { ...init,
    headers: { authorization: 'Bearer ' + token, 'cache-control': 'no-cache', ...(init.headers || {}) },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(60000) });
  const text = await response.text(); let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error('api_' + response.status + '_' + String(body?.error || 'failed'));
  return body;
}
async function fileBytes(item) {
  const route = '/api/admin/private-pdf/processing/file?id=' + encodeURIComponent(item.documentId)
    + '&hash=' + encodeURIComponent(item.contentHash);
  const response = await fetch(API_BASE + route, { headers: { authorization: 'Bearer ' + token, 'cache-control': 'no-cache' },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error('file_' + response.status);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared && declared !== item.byteLength) throw new Error('file_size_mismatch');
  if (declared > 60 * 1024 * 1024) throw new Error('file_too_large');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== item.byteLength || sha256Hex(bytes) !== item.contentHash) throw new Error('file_hash_mismatch');
  return bytes;
}
async function decide(item, decision, evidence) {
  return api('/api/admin/private-pdf/processing/decision', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ documentId: item.documentId, doi: item.doi, contentHash: item.contentHash,
      decision, processorRevision: PRIVATE_PDF_PROCESSOR_REVISION, evidence }) });
}
async function processItem(item) {
  let outcome;
  try { outcome = await verifyPrivatePdfBytes(await fileBytes(item), item); }
  catch { outcome = { decision: 'failed', evidence: { pageCount: 0, textChars: 0, doiMatch: false,
    titleScoreMilli: 0, metadataTitleScoreMilli: 0, authorMatches: 0, supplementMarker: false, reason: 'object_mismatch' } }; }
  await decide(item, outcome.decision, outcome.evidence);
  report.processed += 1;
  if (outcome.decision === 'verified') report.verified += 1;
  else { report.failed += 1; report.failures[outcome.evidence.reason] = Number(report.failures[outcome.evidence.reason] || 0) + 1; }
  report.items.push({ documentId: item.documentId, doi: item.doi, decision: outcome.decision,
    reason: outcome.evidence.reason, pageCount: outcome.evidence.pageCount, titleScoreMilli: outcome.evidence.titleScoreMilli,
    metadataTitleScoreMilli: outcome.evidence.metadataTitleScoreMilli, doiMatch: outcome.evidence.doiMatch,
    supplementMarker: outcome.evidence.supplementMarker });
  save();
}
try {
  report.before = await api('/api/admin/private-pdf/processing/status');
  while (report.processed < maxDocuments) {
    const queue = await api('/api/admin/private-pdf/processing/queue?limit=' + Math.min(batchSize, maxDocuments - report.processed));
    if (!Array.isArray(queue.items) || queue.items.length === 0) break;
    for (const item of queue.items) { await processItem(item); if (report.processed >= maxDocuments) break; }
  }
  report.after = await api('/api/admin/private-pdf/processing/status');
  report.ok = true;
} catch (error) { report.error = String(error?.message || error).slice(0, 300); }
finally { report.completedAt = new Date().toISOString(); save(); }
console.log(JSON.stringify({ suite: report.suite, ok: report.ok, processed: report.processed, verified: report.verified,
  failed: report.failed, failures: report.failures, remainingRaw: Number(report.after?.counts?.raw ?? report.before?.counts?.raw ?? -1) }));
if (!report.ok) process.exitCode = 1;
