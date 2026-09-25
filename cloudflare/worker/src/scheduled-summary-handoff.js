const HANDOFF_PREFIX = 'private/article-summary-handoff-v1/';
const LEGACY_SUMMARY_PREFIX = 'private/article-summary/';
const HANDOFF_SCHEMA_VERSION = 'scheduled-summary-handoff-v1';
const SCHEDULED_SUMMARY_SCHEMA_VERSION = 'scheduled-reviewed-summary-v1';
const SCHEDULED_SUMMARY_ASSET = '/scheduled-article-summaries.json';
const HANDOFF_KEY_ID = 'b5c0b7eaddec13fa';

const HANDOFF_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAnjXVGMb7yXGPgDN/X8Gg
DYjoKDxBxWH8qv2de+wLqehzDiTZPl1yG4HzZPtsFSuk2V+IWNNR65gpSSgJftZh
beQ7voFcbrU+/Lh6Za0GGFb5G0xf/KxDJ5Bd9FxNYF5+BF1doOs31dvDQdEkAuKB
JK//fQAW02AULzoGViim9EM9478JyWPFFMYgW9o/ELqF+7U+Tlo/bkGzwPm4rrJA
sHEPrEUZ1mP4bhEmDAmjhae8XInQzUsxKlJKrBBSBbIMgEifSjBbp/HVcR5fzFuU
KeqyxKyE/gW4gU3C44ODQ39aro2H12E9hwurjxaz43fFIYe3Gp0grfirTH1vXuTF
NWQUeK6ZuS+cdcULqMCab691cvAuebte5XDJ48d6G8JJ2Tir+xPQk8DmLJln/ive
tIw2bYn8UzWjsMwLd87aBctm7JiPCsU8h3YTzoIIoRbDnqnLRKobjR9ilWfG4jKr
1Pr7A0owG7c9j5UJUG0EQaxbo/KqxtVphzajDQLq98rJAgMBAAE=
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

export async function encryptScheduledEvidence(evidence) {
  const doi = normalizeDoi(evidence?.doi);
  const evidencePacketHash = String(evidence?.evidencePacketHash || '');
  if (!doi || !evidencePacketHash) throw new Error('invalid_scheduled_handoff_evidence');
  const plaintext = new TextEncoder().encode(JSON.stringify(evidence));
  const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: handoffAad(doi, evidencePacketHash) },
    aesKey,
    plaintext,
  );
  const wrappedKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    await publicEncryptionKey(),
    rawAesKey,
  );
  return {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    keyId: HANDOFF_KEY_ID,
    algorithm: 'RSA-OAEP-256+A256GCM',
    doi,
    evidencePacketHash,
    sourceHash: String(evidence?.sourceHash || ''),
    evidenceLevel: String(evidence?.evidenceLevel || evidence?.fulltextStatus || 'unknown'),
    capturedAt: String(evidence?.capturedAt || ''),
    encryptedKey: bytesToBase64(wrappedKey),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
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
    },
  });
  return envelope;
}

async function readJsonObject(env, key) {
  const object = await env?.MEDIA?.get?.(key);
  if (!object) return null;
  try { return JSON.parse(await object.text()); } catch { return null; }
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

export async function getScheduledEvidenceHandoff(env, limitValue = 40) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'handoff_storage_unavailable' } };
  const limit = Math.max(1, Math.min(60, Number(limitValue || 40)));
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

  const items = [];
  for (const object of listed) {
    if (items.length >= limit) break;
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
    const envelope = await readJsonObject(env, object.key);
    if (!envelope || envelope.keyId !== HANDOFF_KEY_ID || envelope.evidencePacketHash !== evidencePacketHash) continue;
    items.push(envelope);
  }

  return {
    status: 200,
    body: {
      version: 1,
      schemaVersion: HANDOFF_SCHEMA_VERSION,
      keyId: HANDOFF_KEY_ID,
      generatedAt: new Date().toISOString(),
      publicationMode: 'daily_1200_asia_shanghai',
      count: items.length,
      limit,
      items,
    },
  };
}

export const SCHEDULED_HANDOFF_KEY_ID = HANDOFF_KEY_ID;
export const SCHEDULED_HANDOFF_SCHEMA_VERSION = HANDOFF_SCHEMA_VERSION;
export const SCHEDULED_REVIEWED_SUMMARY_SCHEMA_VERSION = SCHEDULED_SUMMARY_SCHEMA_VERSION;
