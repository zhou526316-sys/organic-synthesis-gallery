const HANDOFF_PREFIX = 'private/article-summary-handoff-v1/';
const EVIDENCE_PREFIX = 'private/article-evidence-v2/';
const LEGACY_SUMMARY_PREFIX = 'private/article-summary/';
const HANDOFF_SCHEMA_VERSION = 'scheduled-summary-handoff-v1';
const SCHEDULED_SUMMARY_SCHEMA_VERSION = 'scheduled-reviewed-summary-v1';
const SCHEDULED_SUMMARY_ASSET = '/scheduled-article-summaries.json';
const HANDOFF_KEY_ID = 'db16696f49e74d95';
const HANDOFF_ALGORITHM = 'RSA-OAEP-256+A256GCM+GZIP';
const DEFAULT_PART_SIZE = 6000;

const HANDOFF_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAlzxehz5Yia14bFNOXl3d
yM4bZF85eUl16YHD55R8lHrMw23y2F927An/18Ry1QGW9m/kfOx0Ijiwzce2HFkI
vbbp+b8Mt49MjH5yGKKFNQipYwB9z+EjonVcVDKH7NzyRuWwb3kYFGi0p9UJV+0p
3ah67motv0Icw3FVbjot8BNGoGqWf7YAHmGX0V2z6GWjsiwLhXdbOWv2apvHoQMH
QQOzQQeaPg5nIXU6xqD9UNYjnZThs8iMwM3qGI7YnUiiqleR1VxtvWqTk2NgijkH
xp50xor5DpEwO7mEmzaqObKrz9f1DZpmIMJlPZH3sfdRGMeTKa0hg0FtzhlOzjDi
FqUDkzb+kdx7l6dgt2CkkTE7QfQqtJTO3kEc6plMHUCr2BED7Od2l+/ysNJCgFj9
SVS6T5xSI1hW/xsnQjzuu4E0WQAWEoPGKdLkY9oC5qH6Vgftqx+QOZu8kkibqHXJ
KQZAsaYmmvitjqnJG4Oau701JJjpEjMf/+SS6/4NlxhdAgMBAAE=
-----END PUBLIC KEY-----`;

function normalizeDoi(value) {
  const raw = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/\S+$/.test(raw) ? raw.replace(/[).,;]+$/, '') : '';
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function idForDoi(doi) {
  return (await sha256Hex(normalizeDoi(doi))).slice(0, 32);
}

function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pemToDer(pem) {
  return base64ToBytes(String(pem || '')
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, ''));
}

let publicEncryptionKeyPromise;
function publicEncryptionKey() {
  if (!publicEncryptionKeyPromise) {
    publicEncryptionKeyPromise = crypto.subtle.importKey(
      'spki',
      pemToDer(HANDOFF_PUBLIC_KEY_PEM),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
  }
  return publicEncryptionKeyPromise;
}

function handoffAad(doi, evidencePacketHash) {
  return new TextEncoder().encode([HANDOFF_SCHEMA_VERSION, HANDOFF_KEY_ID, doi, evidencePacketHash].join('|'));
}

async function gzipBytes(bytes) {
  if (typeof CompressionStream !== 'function') throw new Error('gzip_compression_unavailable');
  const source = new Blob([bytes]).stream();
  const compressed = source.pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

function normalizePartSize(value) {
  const requested = Number(value || DEFAULT_PART_SIZE);
  const bounded = Math.max(1024, Math.min(8000, Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_PART_SIZE));
  return bounded - (bounded % 4);
}

function envelopeIsCurrent(envelope, evidencePacketHash = '', sourceHash = '') {
  return Boolean(
    envelope &&
    envelope.schemaVersion === HANDOFF_SCHEMA_VERSION &&
    envelope.keyId === HANDOFF_KEY_ID &&
    envelope.algorithm === HANDOFF_ALGORITHM &&
    envelope.compression === 'gzip' &&
    typeof envelope.ciphertext === 'string' &&
    envelope.ciphertext.length > 0 &&
    (!evidencePacketHash || envelope.evidencePacketHash === evidencePacketHash) &&
    (!sourceHash || envelope.sourceHash === sourceHash)
  );
}

export async function encryptScheduledEvidence(evidence) {
  const doi = normalizeDoi(evidence?.doi);
  const evidencePacketHash = String(evidence?.evidencePacketHash || '');
  if (!doi || !evidencePacketHash) throw new Error('invalid_scheduled_handoff_evidence');

  const plaintext = new TextEncoder().encode(JSON.stringify(evidence));
  const compressed = await gzipBytes(plaintext);
  const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: handoffAad(doi, evidencePacketHash) },
    aesKey,
    compressed,
  );
  const wrappedKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    await publicEncryptionKey(),
    rawAesKey,
  );

  return {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    keyId: HANDOFF_KEY_ID,
    algorithm: HANDOFF_ALGORITHM,
    compression: 'gzip',
    plaintextEncoding: 'utf-8-json',
    doi,
    evidencePacketHash,
    sourceHash: String(evidence?.sourceHash || ''),
    evidenceLevel: String(evidence?.evidenceLevel || evidence?.fulltextStatus || 'unknown'),
    capturedAt: String(evidence?.capturedAt || ''),
    encryptedKey: bytesToBase64(wrappedKey),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    uncompressedBytes: plaintext.byteLength,
    compressedBytes: compressed.byteLength,
    ciphertextBytes: ciphertext.byteLength,
  };
}

export async function persistScheduledEvidenceHandoff(env, evidence) {
  if (!env?.MEDIA) return null;
  if (String(env?.SCHEDULED_SUMMARY_HANDOFF_ENABLED ?? '1') !== '1') return null;
  if (String(evidence?.textProcessingPolicy || '') === 'no_external_ai') return null;

  const envelope = await encryptScheduledEvidence(evidence);
  const id = await idForDoi(envelope.doi);
  const key = HANDOFF_PREFIX + id + '.json';
  await env.MEDIA.put(key, JSON.stringify(envelope), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: {
      doi: envelope.doi,
      evidencePacketHash: envelope.evidencePacketHash,
      sourceHash: envelope.sourceHash,
      evidenceLevel: envelope.evidenceLevel,
      capturedAt: envelope.capturedAt,
      keyId: HANDOFF_KEY_ID,
      algorithm: HANDOFF_ALGORITHM,
      compression: 'gzip',
    },
  });
  return envelope;
}

async function readJsonObject(env, key) {
  const object = await env?.MEDIA?.get?.(key);
  if (!object) return null;
  try { return JSON.parse(await object.text()); } catch { return null; }
}

async function readEvidenceForDoi(env, doi) {
  const id = await idForDoi(doi);
  const evidence = await readJsonObject(env, EVIDENCE_PREFIX + id + '.json');
  if (!evidence || normalizeDoi(evidence.doi) !== normalizeDoi(doi)) return null;
  return evidence;
}

async function ensureCurrentEnvelope(env, doi, evidencePacketHash = '', sourceHash = '') {
  if (!env?.MEDIA) return null;
  const normalized = normalizeDoi(doi);
  if (!normalized) return null;
  const id = await idForDoi(normalized);
  const key = HANDOFF_PREFIX + id + '.json';
  const existing = await readJsonObject(env, key);
  if (envelopeIsCurrent(existing, evidencePacketHash, sourceHash)) return existing;

  const evidence = await readEvidenceForDoi(env, normalized);
  if (!evidence) return null;
  if (String(evidence.textProcessingPolicy || '') === 'no_external_ai') return null;
  if (evidencePacketHash && evidence.evidencePacketHash !== evidencePacketHash) return null;
  if (sourceHash && evidence.sourceHash !== sourceHash) return null;
  return persistScheduledEvidenceHandoff(env, evidence);
}

export async function readScheduledSummaryAsset(env) {
  if (!env?.ASSETS?.fetch) return { version: 1, generatedAt: 0, items: {} };
  try {
    const response = await env.ASSETS.fetch(new Request('https://gallery-assets.local' + SCHEDULED_SUMMARY_ASSET));
    if (!response?.ok) return { version: 1, generatedAt: 0, items: {} };
    const parsed = await response.json();
    return parsed && parsed.version === 1 && parsed.items && typeof parsed.items === 'object'
      ? parsed
      : { version: 1, generatedAt: 0, items: {} };
  } catch {
    return { version: 1, generatedAt: 0, items: {} };
  }
}

export async function getScheduledSummaryForEvidence(env, doiValue, evidence) {
  const doi = normalizeDoi(doiValue);
  if (!doi || !evidence) return null;
  const asset = await readScheduledSummaryAsset(env);
  const row = asset.items?.[doi];
  if (!row || row.schemaVersion !== SCHEDULED_SUMMARY_SCHEMA_VERSION || row.status !== 'approved') return null;
  if (row.sourceHash !== evidence.sourceHash || row.evidencePacketHash !== evidence.evidencePacketHash) return null;
  if (typeof row.zh !== 'string' || typeof row.en !== 'string' || !row.zh.trim() || !row.en.trim()) return null;
  return row;
}

async function currentLegacySummaryMatches(env, doi, evidencePacketHash, sourceHash) {
  if (!env?.MEDIA) return false;
  const id = await idForDoi(doi);
  const row = await readJsonObject(env, LEGACY_SUMMARY_PREFIX + id + '.json');
  return Boolean(
    row &&
    row.status === 'approved' &&
    row.evidencePacketHash === evidencePacketHash &&
    row.sourceHash === sourceHash &&
    typeof row.zh === 'string' &&
    typeof row.en === 'string'
  );
}

async function pendingHandoffObjects(env, limit) {
  const asset = await readScheduledSummaryAsset(env);
  const listed = [];
  let cursor;
  for (let pageNo = 0; pageNo < 10; pageNo += 1) {
    const page = await env.MEDIA.list({
      prefix: HANDOFF_PREFIX,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
      include: ['customMetadata'],
    });
    listed.push(...(page?.objects || []));
    if (!page?.truncated || !page?.cursor) break;
    cursor = page.cursor;
  }

  listed.sort((a, b) =>
    String(b?.customMetadata?.capturedAt || '').localeCompare(String(a?.customMetadata?.capturedAt || ''))
  );

  const rows = [];
  for (const object of listed) {
    if (rows.length >= limit) break;
    const meta = object?.customMetadata || {};
    const doi = normalizeDoi(meta.doi);
    const evidencePacketHash = String(meta.evidencePacketHash || '');
    const sourceHash = String(meta.sourceHash || '');
    if (!doi || !evidencePacketHash || !sourceHash) continue;

    const scheduled = asset.items?.[doi];
    if (scheduled &&
        scheduled.status === 'approved' &&
        scheduled.evidencePacketHash === evidencePacketHash &&
        scheduled.sourceHash === sourceHash) continue;
    if (await currentLegacySummaryMatches(env, doi, evidencePacketHash, sourceHash)) continue;

    const envelope = await ensureCurrentEnvelope(env, doi, evidencePacketHash, sourceHash);
    if (!envelope) continue;
    rows.push({ object, meta, envelope });
  }
  return rows;
}

export async function backfillScheduledEvidenceHandoffs(env, limitValue = 4) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'handoff_storage_unavailable' } };
  const limit = Math.max(1, Math.min(12, Number(limitValue || 4)));
  const asset = await readScheduledSummaryAsset(env);
  const evidenceObjects = [];
  let cursor;
  for (let pageNo = 0; pageNo < 10; pageNo += 1) {
    const page = await env.MEDIA.list({
      prefix: EVIDENCE_PREFIX,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
      include: ['customMetadata'],
    });
    evidenceObjects.push(...(page?.objects || []));
    if (!page?.truncated || !page?.cursor) break;
    cursor = page.cursor;
  }
  evidenceObjects.sort((a, b) =>
    String(b?.customMetadata?.capturedAt || '').localeCompare(String(a?.customMetadata?.capturedAt || ''))
  );

  let created = 0;
  let scanned = 0;
  let skippedCurrent = 0;
  let skippedPolicy = 0;
  for (const object of evidenceObjects) {
    if (created >= limit) break;
    scanned += 1;
    const meta = object?.customMetadata || {};
    const doi = normalizeDoi(meta.doi);
    const evidencePacketHash = String(meta.evidencePacketHash || '');
    const sourceHash = String(meta.sourceHash || '');
    if (!doi || !evidencePacketHash || !sourceHash) continue;
    if (String(meta.textProcessingPolicy || '') === 'no_external_ai') {
      skippedPolicy += 1;
      continue;
    }

    const scheduled = asset.items?.[doi];
    if (scheduled &&
        scheduled.status === 'approved' &&
        scheduled.evidencePacketHash === evidencePacketHash &&
        scheduled.sourceHash === sourceHash) {
      skippedCurrent += 1;
      continue;
    }
    if (await currentLegacySummaryMatches(env, doi, evidencePacketHash, sourceHash)) {
      skippedCurrent += 1;
      continue;
    }

    const id = await idForDoi(doi);
    const handoffKey = HANDOFF_PREFIX + id + '.json';
    const existing = await readJsonObject(env, handoffKey);
    if (envelopeIsCurrent(existing, evidencePacketHash, sourceHash)) {
      skippedCurrent += 1;
      continue;
    }

    const evidence = await readJsonObject(env, object.key);
    if (!evidence || evidence.evidencePacketHash !== evidencePacketHash || evidence.sourceHash !== sourceHash) continue;
    const envelope = await persistScheduledEvidenceHandoff(env, evidence);
    if (envelope) created += 1;
  }

  return {
    status: 200,
    body: {
      ok: true,
      created,
      scanned,
      limit,
      skippedCurrent,
      skippedPolicy,
      evidenceCount: evidenceObjects.length,
      hasMore: created >= limit,
      keyId: HANDOFF_KEY_ID,
      algorithm: HANDOFF_ALGORITHM,
    },
  };
}

export async function getScheduledEvidenceHandoff(env, limitValue = 40, options = {}) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'handoff_storage_unavailable' } };
  const limit = Math.max(1, Math.min(60, Number(limitValue || 40)));
  const manifestOnly = options?.manifestOnly === true;
  const rows = await pendingHandoffObjects(env, limit);
  const items = rows.map(({ envelope }) => manifestOnly ? {
    schemaVersion: envelope.schemaVersion,
    keyId: envelope.keyId,
    algorithm: envelope.algorithm,
    compression: envelope.compression,
    doi: envelope.doi,
    evidencePacketHash: envelope.evidencePacketHash,
    sourceHash: envelope.sourceHash,
    evidenceLevel: envelope.evidenceLevel,
    capturedAt: envelope.capturedAt,
    ciphertextLength: envelope.ciphertext.length,
    uncompressedBytes: Number(envelope.uncompressedBytes || 0),
    compressedBytes: Number(envelope.compressedBytes || 0),
  } : envelope);

  return {
    status: 200,
    body: {
      version: 2,
      schemaVersion: HANDOFF_SCHEMA_VERSION,
      keyId: HANDOFF_KEY_ID,
      algorithm: HANDOFF_ALGORITHM,
      generatedAt: new Date().toISOString(),
      publicationMode: 'daily_1200_asia_shanghai',
      manifestOnly,
      count: items.length,
      limit,
      items,
    },
  };
}

export async function getScheduledEvidenceHandoffPart(env, doiValue, partValue = 0, partSizeValue = DEFAULT_PART_SIZE) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'handoff_storage_unavailable' } };
  const doi = normalizeDoi(doiValue);
  if (!doi) return { status: 400, body: { error: 'invalid_doi' } };

  const evidence = await readEvidenceForDoi(env, doi);
  if (!evidence) return { status: 404, body: { error: 'evidence_missing', doi } };
  if (String(evidence.textProcessingPolicy || '') === 'no_external_ai') {
    return { status: 403, body: { error: 'handoff_policy_blocked', doi } };
  }

  const envelope = await ensureCurrentEnvelope(env, doi, evidence.evidencePacketHash, evidence.sourceHash);
  if (!envelope) return { status: 404, body: { error: 'handoff_missing', doi } };

  const partSize = normalizePartSize(partSizeValue);
  const partCount = Math.max(1, Math.ceil(envelope.ciphertext.length / partSize));
  const part = Math.max(0, Math.floor(Number(partValue || 0)));
  if (part >= partCount) {
    return { status: 416, body: { error: 'handoff_part_out_of_range', doi, part, partCount } };
  }
  const start = part * partSize;
  const ciphertextPart = envelope.ciphertext.slice(start, start + partSize);

  return {
    status: 200,
    body: {
      version: 2,
      schemaVersion: HANDOFF_SCHEMA_VERSION,
      keyId: HANDOFF_KEY_ID,
      algorithm: HANDOFF_ALGORITHM,
      compression: 'gzip',
      plaintextEncoding: 'utf-8-json',
      doi: envelope.doi,
      evidencePacketHash: envelope.evidencePacketHash,
      sourceHash: envelope.sourceHash,
      evidenceLevel: envelope.evidenceLevel,
      capturedAt: envelope.capturedAt,
      encryptedKey: envelope.encryptedKey,
      iv: envelope.iv,
      part,
      partSize,
      partCount,
      ciphertextLength: envelope.ciphertext.length,
      ciphertextPart,
    },
  };
}

export const SCHEDULED_HANDOFF_KEY_ID = HANDOFF_KEY_ID;
export const SCHEDULED_HANDOFF_SCHEMA_VERSION = HANDOFF_SCHEMA_VERSION;
export const SCHEDULED_HANDOFF_ALGORITHM = HANDOFF_ALGORITHM;
export const SCHEDULED_REVIEWED_SUMMARY_SCHEMA_VERSION = SCHEDULED_SUMMARY_SCHEMA_VERSION;
