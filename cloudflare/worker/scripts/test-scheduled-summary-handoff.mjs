import assert from 'node:assert/strict';
import {
  getScheduledEvidenceHandoff,
  getScheduledSummaryForEvidence,
  persistScheduledEvidenceHandoff,
  readScheduledSummaryAsset,
  SCHEDULED_HANDOFF_KEY_ID,
  SCHEDULED_HANDOFF_SCHEMA_VERSION,
  SCHEDULED_REVIEWED_SUMMARY_SCHEMA_VERSION,
} from '../src/scheduled-summary-handoff.js';

class MemoryObject {
  constructor(value, options = {}) {
    this.value = typeof value === 'string' ? value : new TextDecoder().decode(value);
    this.customMetadata = options.customMetadata || {};
    this.size = new TextEncoder().encode(this.value).length;
  }
  async text() { return this.value; }
}
class MemoryR2 {
  constructor() { this.map = new Map(); }
  async put(key, value, options = {}) { this.map.set(key, new MemoryObject(value, options)); }
  async get(key) { return this.map.get(key) || null; }
  async list({ prefix = '', limit = 1000 } = {}) {
    const objects = [...this.map.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .slice(0, limit)
      .map(([key, object]) => ({ key, size: object.size, customMetadata: object.customMetadata }));
    return { objects, truncated: false };
  }
}

const evidence = {
  schemaVersion: 'article-evidence-v2',
  doi: '10.1021/jacs.6c77777',
  title: 'Encrypted handoff fixture',
  journal: 'JACS',
  publisher: 'acs',
  articleUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c77777',
  sourceUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c77777',
  pageDoi: '10.1021/jacs.6c77777',
  captureVersion: '6.2.20',
  controllerRevision: '2.2.34',
  jobId: '12345678-1234-1234-1234-123456789012',
  queueGeneratedAt: '2026-09-25T00:00:00Z',
  capturedAt: '2026-09-25T03:00:00Z',
  fulltextStatus: 'complete',
  evidenceLevel: 'complete',
  textProcessingPolicy: 'unknown',
  sourceHash: 'a'.repeat(64),
  evidencePacketHash: 'b'.repeat(64),
  sections: [{
    sectionId: 's001',
    type: 'results',
    heading: 'Results',
    text: 'PRIVATE_PUBLISHER_TEXT_MARKER catalytic reaction gives 82% yield and 95% ee.',
    order: 0,
    hash: 'c'.repeat(64),
  }],
  captions: [],
  tables: [],
  chars: 86,
  sectionCount: 1,
  captionCount: 0,
  tableCount: 0,
  importedAt: Date.now(),
};

const MEDIA = new MemoryR2();
const emptyAssets = {
  async fetch() {
    return new Response(JSON.stringify({ version: 1, generatedAt: 0, items: {} }), {
      headers: { 'content-type': 'application/json' },
    });
  },
};
const env = { MEDIA, ASSETS: emptyAssets };

const envelope = await persistScheduledEvidenceHandoff(env, evidence);
assert.ok(envelope);
assert.equal(envelope.schemaVersion, SCHEDULED_HANDOFF_SCHEMA_VERSION);
assert.equal(envelope.keyId, SCHEDULED_HANDOFF_KEY_ID);
assert.equal(envelope.algorithm, 'RSA-OAEP-256+A256GCM');
assert.equal(envelope.doi, evidence.doi);
assert.ok(envelope.encryptedKey.length > 300);
assert.ok(envelope.ciphertext.length > 100);
assert.ok(!JSON.stringify(envelope).includes('PRIVATE_PUBLISHER_TEXT_MARKER'));

const pending = await getScheduledEvidenceHandoff(env, 40);
assert.equal(pending.status, 200);
assert.equal(pending.body.count, 1);
assert.equal(pending.body.publicationMode, 'daily_1200_asia_shanghai');
assert.ok(!JSON.stringify(pending.body).includes('PRIVATE_PUBLISHER_TEXT_MARKER'));

const blocked = await persistScheduledEvidenceHandoff(env, {
  ...evidence,
  doi: '10.1021/jacs.6c77778',
  textProcessingPolicy: 'no_external_ai',
});
assert.equal(blocked, null);

const approved = {
  schemaVersion: SCHEDULED_REVIEWED_SUMMARY_SCHEMA_VERSION,
  doi: evidence.doi,
  status: 'approved',
  sourceHash: evidence.sourceHash,
  evidencePacketHash: evidence.evidencePacketHash,
  evidenceLevel: 'complete',
  zh: '中文审核摘要。',
  en: 'Reviewed English summary.',
  generatedAt: Date.now(),
  reviewedAt: Date.now(),
  promptVersion: 'gallery-daily-summary-v1',
  auditVersion: 'gallery-daily-summary-audit-v1',
};
const approvedAssets = {
  async fetch() {
    return new Response(JSON.stringify({
      version: 1,
      generatedAt: Date.now(),
      schemaVersion: SCHEDULED_REVIEWED_SUMMARY_SCHEMA_VERSION,
      items: { [evidence.doi]: approved },
    }), { headers: { 'content-type': 'application/json' } });
  },
};
const asset = await readScheduledSummaryAsset({ ASSETS: approvedAssets });
assert.equal(asset.items[evidence.doi].zh, approved.zh);
const current = await getScheduledSummaryForEvidence({ ASSETS: approvedAssets }, evidence.doi, evidence);
assert.equal(current.en, approved.en);
const stale = await getScheduledSummaryForEvidence({ ASSETS: approvedAssets }, evidence.doi, {
  ...evidence,
  evidencePacketHash: 'd'.repeat(64),
});
assert.equal(stale, null);

const excluded = await getScheduledEvidenceHandoff({ MEDIA, ASSETS: approvedAssets }, 40);
assert.equal(excluded.body.count, 0);

console.log(JSON.stringify({
  encryptedHandoff: true,
  plaintextNotExposed: true,
  publicKeyId: SCHEDULED_HANDOFF_KEY_ID,
  staticSummaryHashBound: true,
  noExternalAiBlocked: true,
  publicationMode: 'daily_1200_asia_shanghai',
}));
