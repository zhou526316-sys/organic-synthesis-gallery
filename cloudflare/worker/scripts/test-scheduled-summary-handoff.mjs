import assert from 'node:assert/strict';
import {
  backfillScheduledEvidenceHandoffs,
  getScheduledEvidenceHandoff,
  getScheduledEvidenceHandoffPart,
  getScheduledSummaryCoverageStatus,
  getScheduledSummaryForEvidence,
  persistScheduledEvidenceHandoff,
  readScheduledSummaryAsset,
  SCHEDULED_HANDOFF_ALGORITHM,
  SCHEDULED_HANDOFF_KEY_ID,
  SCHEDULED_HANDOFF_SCHEMA_VERSION,
  SCHEDULED_REVIEWED_SUMMARY_SCHEMA_VERSION,
} from '../src/scheduled-summary-handoff.js';

class MemoryObject {
  constructor(value, options = {}) {
    this.value = typeof value === 'string' ? value : new TextDecoder().decode(value);
    this.customMetadata = options.customMetadata || {};
    this.httpMetadata = options.httpMetadata || {};
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
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function idForDoi(doi) {
  return (await sha256Hex(doi)).slice(0, 32);
}
async function putEvidence(MEDIA, row) {
  const id = await idForDoi(row.doi);
  await MEDIA.put('private/article-evidence-v2/' + id + '.json', JSON.stringify(row), {
    customMetadata: {
      doi: row.doi,
      evidencePacketHash: row.evidencePacketHash,
      sourceHash: row.sourceHash,
      evidenceLevel: row.evidenceLevel,
      capturedAt: row.capturedAt,
      textProcessingPolicy: row.textProcessingPolicy,
    },
  });
  return id;
}

const repeatedText = (
  'PRIVATE_PUBLISHER_TEXT_MARKER catalytic reaction gives 82% yield and 95% ee. ' +
  'Mechanistic control experiments are distinguished from the authors proposed catalytic cycle. '
).repeat(160);

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
    text: repeatedText,
    order: 0,
    hash: 'c'.repeat(64),
  }],
  captions: [],
  tables: [],
  chars: repeatedText.length,
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
await putEvidence(MEDIA, evidence);

const envelope = await persistScheduledEvidenceHandoff(env, evidence);
assert.ok(envelope);
assert.equal(envelope.schemaVersion, SCHEDULED_HANDOFF_SCHEMA_VERSION);
assert.equal(envelope.keyId, SCHEDULED_HANDOFF_KEY_ID);
assert.equal(envelope.algorithm, SCHEDULED_HANDOFF_ALGORITHM);
assert.equal(envelope.algorithm, 'RSA-OAEP-256+A256GCM+GZIP');
assert.equal(envelope.compression, 'gzip');
assert.equal(envelope.plaintextEncoding, 'utf-8-json');
assert.equal(envelope.doi, evidence.doi);
assert.ok(envelope.encryptedKey.length > 300);
assert.ok(envelope.ciphertext.length > 100);
assert.ok(envelope.compressedBytes > 0);
assert.ok(envelope.uncompressedBytes > envelope.compressedBytes);
assert.ok(!JSON.stringify(envelope).includes('PRIVATE_PUBLISHER_TEXT_MARKER'));

const manifest = await getScheduledEvidenceHandoff(env, 40, { manifestOnly: true });
assert.equal(manifest.status, 200);
assert.equal(manifest.body.version, 2);
assert.equal(manifest.body.count, 1);
assert.equal(manifest.body.manifestOnly, true);
assert.equal(manifest.body.items[0].doi, evidence.doi);
assert.equal(manifest.body.items[0].keyId, SCHEDULED_HANDOFF_KEY_ID);
assert.equal(manifest.body.items[0].algorithm, SCHEDULED_HANDOFF_ALGORITHM);
assert.equal(manifest.body.items[0].compression, 'gzip');
assert.equal(typeof manifest.body.items[0].ciphertextLength, 'number');
assert.equal('ciphertext' in manifest.body.items[0], false);
assert.equal('encryptedKey' in manifest.body.items[0], false);
assert.ok(!JSON.stringify(manifest.body).includes('PRIVATE_PUBLISHER_TEXT_MARKER'));

const chunks = [];
let cryptoMeta = null;
for (let part = 0; ; part += 1) {
  const response = await getScheduledEvidenceHandoffPart(env, evidence.doi, part, 1024);
  assert.equal(response.status, 200);
  assert.equal(response.body.keyId, SCHEDULED_HANDOFF_KEY_ID);
  assert.equal(response.body.algorithm, SCHEDULED_HANDOFF_ALGORITHM);
  assert.equal(response.body.compression, 'gzip');
  assert.ok(response.body.ciphertextPart.length <= 1024);
  chunks.push(response.body.ciphertextPart);
  cryptoMeta ||= {
    encryptedKey: response.body.encryptedKey,
    iv: response.body.iv,
    partCount: response.body.partCount,
  };
  if (part + 1 >= response.body.partCount) break;
}
assert.equal(chunks.length, cryptoMeta.partCount);
assert.equal(chunks.join(''), envelope.ciphertext);
assert.equal(cryptoMeta.encryptedKey, envelope.encryptedKey);
assert.equal(cryptoMeta.iv, envelope.iv);
assert.ok(!chunks.join('').includes('PRIVATE_PUBLISHER_TEXT_MARKER'));

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

const excluded = await getScheduledEvidenceHandoff({ MEDIA, ASSETS: approvedAssets }, 40, { manifestOnly: true });
assert.equal(excluded.body.count, 0);

const coverage = await getScheduledSummaryCoverageStatus({ MEDIA, ASSETS: approvedAssets });
assert.equal(coverage.status, 200);
assert.equal(coverage.body.evidenceCount, 1);
assert.deepEqual(coverage.body.evidenceByLevel, { complete: 1, partial: 0, abstract_only: 0, unknown: 0 });
assert.equal(coverage.body.scheduledStaticCount, 1);
assert.equal(coverage.body.matchingPublishedCount, 1);
assert.equal(coverage.body.pendingHandoffCount, 0);
assert.equal(coverage.body.pendingHandoffMayHaveMore, false);

// A legacy/foreign-key envelope is automatically rotated from private Evidence.
const rotateEvidence = {
  ...evidence,
  doi: '10.1021/jacs.6c77779',
  sourceHash: 'e'.repeat(64),
  evidencePacketHash: 'f'.repeat(64),
  capturedAt: '2026-09-24T03:00:00Z',
};
const rotateId = await putEvidence(MEDIA, rotateEvidence);
await MEDIA.put('private/article-summary-handoff-v1/' + rotateId + '.json', JSON.stringify({
  schemaVersion: SCHEDULED_HANDOFF_SCHEMA_VERSION,
  keyId: 'retired-key',
  algorithm: 'RSA-OAEP-256+A256GCM',
  doi: rotateEvidence.doi,
  evidencePacketHash: rotateEvidence.evidencePacketHash,
  sourceHash: rotateEvidence.sourceHash,
  evidenceLevel: rotateEvidence.evidenceLevel,
  capturedAt: rotateEvidence.capturedAt,
  encryptedKey: 'retired',
  iv: 'retired',
  ciphertext: 'retired',
}), {
  customMetadata: {
    doi: rotateEvidence.doi,
    evidencePacketHash: rotateEvidence.evidencePacketHash,
    sourceHash: rotateEvidence.sourceHash,
    evidenceLevel: rotateEvidence.evidenceLevel,
    capturedAt: rotateEvidence.capturedAt,
    keyId: 'retired-key',
  },
});
const rotatedPart = await getScheduledEvidenceHandoffPart({ MEDIA, ASSETS: emptyAssets }, rotateEvidence.doi, 0, 2048);
assert.equal(rotatedPart.status, 200);
assert.equal(rotatedPart.body.keyId, SCHEDULED_HANDOFF_KEY_ID);
assert.equal(rotatedPart.body.algorithm, SCHEDULED_HANDOFF_ALGORITHM);
assert.equal(rotatedPart.body.compression, 'gzip');
const rotatedStored = JSON.parse(await (await MEDIA.get('private/article-summary-handoff-v1/' + rotateId + '.json')).text());
assert.equal(rotatedStored.keyId, SCHEDULED_HANDOFF_KEY_ID);
assert.equal(rotatedStored.algorithm, SCHEDULED_HANDOFF_ALGORITHM);
assert.equal(rotatedStored.compression, 'gzip');
assert.notEqual(rotatedStored.ciphertext, 'retired');

// Missing handoff objects are populated by the deployment backfill.
const backfillEvidence = {
  ...evidence,
  doi: '10.1021/jacs.6c77780',
  sourceHash: '1'.repeat(64),
  evidencePacketHash: '2'.repeat(64),
  capturedAt: '2026-09-23T03:00:00Z',
};
await putEvidence(MEDIA, backfillEvidence);
const backfill = await backfillScheduledEvidenceHandoffs({ MEDIA, ASSETS: approvedAssets }, 4);
assert.equal(backfill.status, 200);
assert.ok(backfill.body.created >= 1);
assert.equal(backfill.body.keyId, SCHEDULED_HANDOFF_KEY_ID);
assert.equal(backfill.body.algorithm, SCHEDULED_HANDOFF_ALGORITHM);
const postBackfill = await getScheduledEvidenceHandoff({ MEDIA, ASSETS: approvedAssets }, 40, { manifestOnly: true });
assert.ok(postBackfill.body.items.some(item => item.doi === backfillEvidence.doi));
assert.ok(!JSON.stringify(postBackfill.body).includes('PRIVATE_PUBLISHER_TEXT_MARKER'));

const outOfRange = await getScheduledEvidenceHandoffPart(env, evidence.doi, 9999, 1024);
assert.equal(outOfRange.status, 416);
assert.equal(outOfRange.body.error, 'handoff_part_out_of_range');

console.log(JSON.stringify({
  encryptedHandoff: true,
  gzipBeforeEncryption: true,
  chunkedCiphertextTransport: true,
  manifestOmitsCiphertext: true,
  plaintextNotExposed: true,
  publicKeyId: SCHEDULED_HANDOFF_KEY_ID,
  algorithm: SCHEDULED_HANDOFF_ALGORITHM,
  staticSummaryHashBound: true,
  noExternalAiBlocked: true,
  automaticKeyRotation: true,
  legacyEvidenceBackfill: true,
  publicationMode: 'daily_1200_asia_shanghai',
}));
