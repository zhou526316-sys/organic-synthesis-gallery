import { getEvidenceIndexStatus, listEvidenceHandoffIndexRows, scheduledHandoffIndexReadEnabled, shadowIndexHandoff } from './evidence-index.js';
const HANDOFF_PREFIX = 'private/article-summary-handoff-v1/';
const EVIDENCE_PREFIX = 'private/article-evidence-v2/';
const LEGACY_SUMMARY_PREFIX = 'private/article-summary/';
const HANDOFF_SCHEMA_VERSION = 'scheduled-summary-handoff-v1';
const SCHEDULED_SUMMARY_SCHEMA_VERSION = 'scheduled-reviewed-summary-v1';
const SCHEDULED_SUMMARY_ASSET = '/scheduled-article-summaries.json';
const HANDOFF_KEY_ID = '9c55e2d2ed734de9';
const HANDOFF_ALGORITHM = 'RSA-OAEP-256+A256GCM+GZIP';
const DEFAULT_PART_SIZE = 6000;

const HANDOFF_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAv50rEyFtaQbOzRs8PLtf
NN6B3TN2RGXxL3FoUtftDDItbTNPgWqkjkKY94SFzWJz0DcL2KNvJYjzhk0IQYk+
dImE1wsS/wxpzmVSnbyHGGrvlIiWYmyVqE6MAmbXDhD4mrB4OXFFdkDl4JvHdoJn
s4r//hzlbYjeO9cLGSd5oVF2nG8wBFaxO5AuBH7vhJUEm5TDHZ8MpkhT/xLMtnwV
98T+VqGZjcfG78AogLEXPhUfGFIzFQt7KunpXvGrhzoY7gKsw0H871Fznbl9zp+S
VbDLCKBfTMQb/N68/FIsMReampD9pdZUlQHxg4cUOdPBfUv+6Hh9IoSNH8k88Kz+
W5tHEMHgljcvqStjbRC2aCPSJ/JS3i6meNwKLtiCLKS0PfisuHk5v7N1SMnS4K8w
bxMv8jm7L8c1XU2WXYk3ztZn+fUUb11aLrAFiBBd50+6dwcIwZaHexBUS4+5RS1P
NRoeBC12BTiJv1FV745L5vdHpFJNRcZgyXe9Q+HL1EzPAgMBAAE=
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
  await shadowIndexHandoff(env, envelope);
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

function handoffSelectionIdentity(envelope) {
  return {
    doi:String(envelope?.doi||''),
    evidencePacketHash:String(envelope?.evidencePacketHash||''),
    sourceHash:String(envelope?.sourceHash||''),
    evidenceLevel:String(envelope?.evidenceLevel||''),
    capturedAt:String(envelope?.capturedAt||''),
    keyId:String(envelope?.keyId||''),
    algorithm:String(envelope?.algorithm||''),
    compression:String(envelope?.compression||''),
  };
}
function handoffBackfillIdentity(row) {
  return {
    doi:String(row?.doi||''),
    evidenceKey:String(row?.evidenceKey||''),
    evidencePacketHash:String(row?.evidencePacketHash||''),
    sourceHash:String(row?.sourceHash||''),
    evidenceLevel:String(row?.evidenceLevel||''),
    textProcessingPolicy:String(row?.textProcessingPolicy||''),
    capturedAt:String(row?.capturedAt||''),
  };
}
async function listPrefixMetadata(env,prefix,maxPages=10) {
  const listed=[];let cursor;let saturated=false;
  for(let pageNo=0;pageNo<maxPages;pageNo+=1){
    const page=await env.MEDIA.list({
      prefix,limit:1000,...(cursor?{cursor}:{}),include:['customMetadata'],
    });
    listed.push(...(page?.objects||[]));
    if(!page?.truncated||!page?.cursor){cursor='';break;}
    cursor=page.cursor;
    if(pageNo===maxPages-1) saturated=true;
  }
  return {listed,saturated};
}

async function pendingHandoffSelectionLegacy(env, limit) {
  const asset=await readScheduledSummaryAsset(env);
  const {listed,saturated}=await listPrefixMetadata(env,HANDOFF_PREFIX,10);
  listed.sort((a,b)=>String(b?.customMetadata?.capturedAt||'').localeCompare(String(a?.customMetadata?.capturedAt||'')));
  const items=[];
  for(const object of listed){
    if(items.length>=limit) break;
    const meta=object?.customMetadata||{};
    const doi=normalizeDoi(meta.doi),evidencePacketHash=String(meta.evidencePacketHash||''),sourceHash=String(meta.sourceHash||'');
    if(!doi||!evidencePacketHash||!sourceHash) continue;
    if(String(meta.keyId||'')!==HANDOFF_KEY_ID||String(meta.algorithm||'')!==HANDOFF_ALGORITHM||String(meta.compression||'')!=='gzip') continue;
    const scheduled=asset.items?.[doi];
    if(scheduled&&scheduled.status==='approved'&&scheduled.evidencePacketHash===evidencePacketHash&&scheduled.sourceHash===sourceHash) continue;
    if(await currentLegacySummaryMatches(env,doi,evidencePacketHash,sourceHash)) continue;
    const envelope=await readJsonObject(env,object.key);
    if(!envelopeIsCurrent(envelope,evidencePacketHash,sourceHash)) continue;
    items.push(handoffSelectionIdentity(envelope));
  }
  return {
    items,scannedObjects:listed.length,saturated,
    candidateSetHash:await sha256Hex(JSON.stringify(items)),
  };
}

async function pendingHandoffObjectsIndexed(env, limit) {
  const status=await getEvidenceIndexStatus(env);
  if(status.status!==200||status.body?.handoffReadPathReady!==true){
    return {status:409,body:{error:'scheduled_handoff_index_not_ready',indexStatus:status.body||{}}};
  }
  const asset=await readScheduledSummaryAsset(env);
  const rowsOut=[];let offset=0;let scannedRows=0;
  for(let pageNo=0;pageNo<100&&rowsOut.length<limit;pageNo+=1){
    const page=await listEvidenceHandoffIndexRows(env,{ready:true,limit:500,offset});
    if(page.status!==200) return page;
    const rows=page.body?.items||[];
    scannedRows+=rows.length;
    for(const row of rows){
      if(rowsOut.length>=limit) break;
      const doi=normalizeDoi(row?.doi),evidencePacketHash=String(row?.evidence_packet_hash||''),sourceHash=String(row?.source_hash||'');
      if(!doi||!evidencePacketHash||!sourceHash) continue;
      const handoffKey=String(row?.handoff_r2_key||'');
      if(String(row?.handoff_key_id||'')!==HANDOFF_KEY_ID||String(row?.handoff_algorithm||'')!==HANDOFF_ALGORITHM
        ||String(row?.handoff_compression||'')!=='gzip'||!handoffKey.startsWith(HANDOFF_PREFIX)) continue;
      const scheduled=asset.items?.[doi];
      if(scheduled&&scheduled.status==='approved'&&scheduled.evidencePacketHash===evidencePacketHash&&scheduled.sourceHash===sourceHash) continue;
      if(await currentLegacySummaryMatches(env,doi,evidencePacketHash,sourceHash)) continue;
      const envelope=await readJsonObject(env,handoffKey);
      if(!envelopeIsCurrent(envelope,evidencePacketHash,sourceHash)){
        return {status:409,body:{error:'scheduled_handoff_index_envelope_mismatch',doi}};
      }
      rowsOut.push({
        object:{key:handoffKey},
        meta:{doi,evidencePacketHash,sourceHash,capturedAt:String(row?.captured_at||'')},
        envelope,
      });
    }
    if(rows.length<500) break;
    offset+=rows.length;
  }
  return {status:200,body:{rows:rowsOut,scannedRows}};
}

async function pendingHandoffSelectionIndexed(env, limit) {
  const selected=await pendingHandoffObjectsIndexed(env,limit);
  if(selected.status!==200) return selected;
  const items=(selected.body.rows||[]).map(({envelope})=>handoffSelectionIdentity(envelope));
  return {status:200,body:{
    items,scannedRows:selected.body.scannedRows,candidateSetHash:await sha256Hex(JSON.stringify(items)),
  }};
}

async function handoffBackfillSelectionLegacy(env, limit) {
  const asset=await readScheduledSummaryAsset(env);
  const evidenceListing=await listPrefixMetadata(env,EVIDENCE_PREFIX,10);
  const handoffListing=await listPrefixMetadata(env,HANDOFF_PREFIX,10);
  const evidenceObjects=evidenceListing.listed.sort((a,b)=>
    String(b?.customMetadata?.capturedAt||'').localeCompare(String(a?.customMetadata?.capturedAt||''))
  );
  const currentHandoffKeys=new Set();
  for(const object of handoffListing.listed){
    const meta=object?.customMetadata||{};
    const doi=normalizeDoi(meta.doi),evidencePacketHash=String(meta.evidencePacketHash||''),sourceHash=String(meta.sourceHash||'');
    if(!doi||!evidencePacketHash||!sourceHash) continue;
    if(String(meta.keyId||'')!==HANDOFF_KEY_ID||String(meta.algorithm||'')!==HANDOFF_ALGORITHM||String(meta.compression||'')!=='gzip') continue;
    currentHandoffKeys.add(doi+'|'+evidencePacketHash+'|'+sourceHash);
  }
  const items=[];
  for(const object of evidenceObjects){
    if(items.length>=limit) break;
    const meta=object?.customMetadata||{};
    const doi=normalizeDoi(meta.doi),evidencePacketHash=String(meta.evidencePacketHash||''),sourceHash=String(meta.sourceHash||'');
    if(!doi||!evidencePacketHash||!sourceHash) continue;
    const policy=String(meta.textProcessingPolicy||'');
    if(policy==='no_external_ai') continue;
    const scheduled=asset.items?.[doi];
    if(scheduled&&scheduled.status==='approved'&&scheduled.evidencePacketHash===evidencePacketHash&&scheduled.sourceHash===sourceHash) continue;
    if(currentHandoffKeys.has(doi+'|'+evidencePacketHash+'|'+sourceHash)) continue;
    if(await currentLegacySummaryMatches(env,doi,evidencePacketHash,sourceHash)) continue;
    const id=await idForDoi(doi);
    const existing=await readJsonObject(env,HANDOFF_PREFIX+id+'.json');
    if(envelopeIsCurrent(existing,evidencePacketHash,sourceHash)) continue;
    const evidence=await readJsonObject(env,object.key);
    if(!evidence||evidence.evidencePacketHash!==evidencePacketHash||evidence.sourceHash!==sourceHash) continue;
    items.push(handoffBackfillIdentity({
      doi,evidenceKey:object.key,evidencePacketHash,sourceHash,
      evidenceLevel:String(meta.evidenceLevel||'unknown'),textProcessingPolicy:policy,
      capturedAt:String(meta.capturedAt||''),
    }));
  }
  return {
    items,
    scannedEvidenceObjects:evidenceObjects.length,
    scannedHandoffObjects:handoffListing.listed.length,
    saturated:evidenceListing.saturated||handoffListing.saturated,
    candidateSetHash:await sha256Hex(JSON.stringify(items)),
  };
}

async function handoffBackfillObjectsIndexed(env, limit) {
  const status=await getEvidenceIndexStatus(env);
  if(status.status!==200||status.body?.handoffReadPathReady!==true){
    return {status:409,body:{error:'scheduled_handoff_index_not_ready',indexStatus:status.body||{}}};
  }
  const asset=await readScheduledSummaryAsset(env);
  const rowsOut=[];let offset=0;let scannedRows=0;let skippedCurrent=0;let skippedPolicy=0;
  for(let pageNo=0;pageNo<100&&rowsOut.length<limit;pageNo+=1){
    const page=await listEvidenceHandoffIndexRows(env,{ready:false,limit:500,offset});
    if(page.status!==200) return page;
    const rows=page.body?.items||[];
    scannedRows+=rows.length;
    for(const row of rows){
      if(rowsOut.length>=limit) break;
      const doi=normalizeDoi(row?.doi),evidencePacketHash=String(row?.evidence_packet_hash||''),sourceHash=String(row?.source_hash||'');
      if(!doi||!evidencePacketHash||!sourceHash) continue;
      const policy=String(row?.text_processing_policy||'');
      if(policy==='no_external_ai'){skippedPolicy+=1;continue;}
      const scheduled=asset.items?.[doi];
      if(scheduled&&scheduled.status==='approved'&&scheduled.evidencePacketHash===evidencePacketHash&&scheduled.sourceHash===sourceHash){
        skippedCurrent+=1;continue;
      }
      if(await currentLegacySummaryMatches(env,doi,evidencePacketHash,sourceHash)){
        skippedCurrent+=1;continue;
      }
      const id=await idForDoi(doi);
      const existing=await readJsonObject(env,HANDOFF_PREFIX+id+'.json');
      if(envelopeIsCurrent(existing,evidencePacketHash,sourceHash)){
        await shadowIndexHandoff(env,existing);
        skippedCurrent+=1;
        continue;
      }
      const evidenceKey=String(row?.evidence_r2_key||'');
      const evidence=await readJsonObject(env,evidenceKey);
      if(!evidence||evidence.evidencePacketHash!==evidencePacketHash||evidence.sourceHash!==sourceHash){
        return {status:409,body:{error:'scheduled_handoff_index_evidence_mismatch',doi}};
      }
      rowsOut.push({row,evidence});
    }
    if(rows.length<500) break;
    offset+=rows.length;
  }
  return {status:200,body:{
    rows:rowsOut,scannedRows,skippedCurrent,skippedPolicy,evidenceCount:Number(status.body?.evidenceCount||0),
  }};
}

async function handoffBackfillSelectionIndexed(env, limit) {
  const selected=await handoffBackfillObjectsIndexed(env,limit);
  if(selected.status!==200) return selected;
  const items=(selected.body.rows||[]).map(({row,evidence})=>handoffBackfillIdentity({
    doi:evidence.doi,evidenceKey:String(row.evidence_r2_key||''),evidencePacketHash:evidence.evidencePacketHash,
    sourceHash:evidence.sourceHash,evidenceLevel:String(row.evidence_level||evidence.evidenceLevel||'unknown'),
    textProcessingPolicy:String(row.text_processing_policy||evidence.textProcessingPolicy||''),
    capturedAt:String(row.captured_at||evidence.capturedAt||''),
  }));
  return {status:200,body:{
    items,scannedRows:selected.body.scannedRows,candidateSetHash:await sha256Hex(JSON.stringify(items)),
  }};
}

function comparisonSide(selection,scanKey) {
  return {
    count:selection.items.length,
    [scanKey]:Number(selection[scanKey]||0),
    candidateSetHash:selection.candidateSetHash,
    items:selection.items,
  };
}

export async function compareScheduledHandoffIndexShadow(env, limitValue = 40) {
  if(!env?.MEDIA||!env?.DB) return {status:503,body:{error:'scheduled_handoff_shadow_storage_unavailable'}};
  const limit=Math.max(1,Math.min(60,Number(limitValue||40)));

  const pendingLegacyBefore=await pendingHandoffSelectionLegacy(env,limit);
  const pendingIndexed=await pendingHandoffSelectionIndexed(env,limit);
  if(pendingIndexed.status!==200) return pendingIndexed;
  const pendingLegacyAfter=await pendingHandoffSelectionLegacy(env,limit);
  const pendingStable=pendingLegacyBefore.candidateSetHash===pendingLegacyAfter.candidateSetHash;
  const pendingSaturated=pendingLegacyBefore.saturated||pendingLegacyAfter.saturated;
  const pendingSame=pendingStable&&!pendingSaturated
    &&pendingLegacyBefore.candidateSetHash===pendingIndexed.body.candidateSetHash
    &&JSON.stringify(pendingLegacyBefore.items)===JSON.stringify(pendingIndexed.body.items);

  const backfillLegacyBefore=await handoffBackfillSelectionLegacy(env,limit);
  const backfillIndexed=await handoffBackfillSelectionIndexed(env,limit);
  if(backfillIndexed.status!==200) return backfillIndexed;
  const backfillLegacyAfter=await handoffBackfillSelectionLegacy(env,limit);
  const backfillStable=backfillLegacyBefore.candidateSetHash===backfillLegacyAfter.candidateSetHash;
  const backfillSaturated=backfillLegacyBefore.saturated||backfillLegacyAfter.saturated;
  const backfillSame=backfillStable&&!backfillSaturated
    &&backfillLegacyBefore.candidateSetHash===backfillIndexed.body.candidateSetHash
    &&JSON.stringify(backfillLegacyBefore.items)===JSON.stringify(backfillIndexed.body.items);

  const comparable=pendingStable&&backfillStable&&!pendingSaturated&&!backfillSaturated;
  return {status:200,body:{
    version:1,mode:'scheduled_handoff_index_shadow',readPathActive:scheduledHandoffIndexReadEnabled(env),
    comparable,sourceStable:pendingStable&&backfillStable,
    legacyPotentiallySaturated:pendingSaturated||backfillSaturated,
    same:comparable&&pendingSame&&backfillSame,limit,
    pending:{
      same:pendingSame,
      legacy:comparisonSide(pendingLegacyBefore,'scannedObjects'),
      indexed:comparisonSide(pendingIndexed.body,'scannedRows'),
    },
    backfill:{
      same:backfillSame,
      legacy:{
        count:backfillLegacyBefore.items.length,
        scannedEvidenceObjects:backfillLegacyBefore.scannedEvidenceObjects,
        scannedHandoffObjects:backfillLegacyBefore.scannedHandoffObjects,
        candidateSetHash:backfillLegacyBefore.candidateSetHash,
        items:backfillLegacyBefore.items,
      },
      indexed:comparisonSide(backfillIndexed.body,'scannedRows'),
    },
  }};
}

export async function backfillScheduledEvidenceHandoffs(env, limitValue = 4) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'handoff_storage_unavailable' } };
  const limit = Math.max(1, Math.min(12, Number(limitValue || 4)));

  let discoveryMode = 'legacy_r2';
  let fallbackReason = '';
  if (scheduledHandoffIndexReadEnabled(env)) {
    const indexed = await handoffBackfillObjectsIndexed(env, limit);
    if (indexed.status === 200) {
      let created = 0;
      for (const row of indexed.body.rows || []) {
        const envelope = await persistScheduledEvidenceHandoff(env, row.evidence);
        if (envelope) created += 1;
      }
      return {
        status: 200,
        body: {
          ok: true,
          created,
          scanned: Number(indexed.body.scannedRows || 0),
          limit,
          skippedCurrent: Number(indexed.body.skippedCurrent || 0),
          skippedPolicy: Number(indexed.body.skippedPolicy || 0),
          evidenceCount: Number(indexed.body.evidenceCount || 0),
          hasMore: created >= limit,
          keyId: HANDOFF_KEY_ID,
          algorithm: HANDOFF_ALGORITHM,
          discoveryMode: 'd1_index',
        },
      };
    }
    discoveryMode = 'legacy_r2_fallback';
    fallbackReason = String(indexed.body?.error || 'scheduled_handoff_index_unavailable');
  }

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

  const currentHandoffKeys = new Set();
  let handoffCursor;
  for (let pageNo = 0; pageNo < 10; pageNo += 1) {
    const page = await env.MEDIA.list({
      prefix: HANDOFF_PREFIX,
      limit: 1000,
      ...(handoffCursor ? { cursor: handoffCursor } : {}),
      include: ['customMetadata'],
    });
    for (const handoffObject of page?.objects || []) {
      const meta = handoffObject?.customMetadata || {};
      const doi = normalizeDoi(meta.doi);
      const evidencePacketHash = String(meta.evidencePacketHash || '');
      const sourceHash = String(meta.sourceHash || '');
      if (!doi || !evidencePacketHash || !sourceHash) continue;
      if (String(meta.keyId || '') !== HANDOFF_KEY_ID ||
          String(meta.algorithm || '') !== HANDOFF_ALGORITHM ||
          String(meta.compression || '') !== 'gzip') continue;
      currentHandoffKeys.add(doi + '|' + evidencePacketHash + '|' + sourceHash);
    }
    if (!page?.truncated || !page?.cursor) break;
    handoffCursor = page.cursor;
  }

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
    const handoffSignature = doi + '|' + evidencePacketHash + '|' + sourceHash;
    if (currentHandoffKeys.has(handoffSignature)) {
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
      discoveryMode,
      ...(fallbackReason ? { fallbackReason } : {}),
    },
  };
}

export async function getScheduledEvidenceHandoff(env, limitValue = 40, options = {}) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'handoff_storage_unavailable' } };
  const limit = Math.max(1, Math.min(60, Number(limitValue || 40)));
  const manifestOnly = options?.manifestOnly === true;

  let rows;
  let discoveryMode = 'legacy_r2';
  let fallbackReason = '';
  if (scheduledHandoffIndexReadEnabled(env)) {
    const indexed = await pendingHandoffObjectsIndexed(env, limit);
    if (indexed.status === 200) {
      rows = indexed.body.rows || [];
      discoveryMode = 'd1_index';
    } else {
      rows = await pendingHandoffObjects(env, limit);
      discoveryMode = 'legacy_r2_fallback';
      fallbackReason = String(indexed.body?.error || 'scheduled_handoff_index_unavailable');
    }
  } else {
    rows = await pendingHandoffObjects(env, limit);
  }

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
      discoveryMode,
      ...(fallbackReason ? { fallbackReason } : {}),
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
