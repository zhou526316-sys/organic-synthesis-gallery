// Storage only: caller must validate capture/task/page/source identity before entering.
// No publisher requests, historical promotion, D1 writes, or object deletion.
export const STAGE_STORAGE_REVISION = '2026-09-23.1';
export const STAGE_INDEX_KEY = 'local-captures/article-figures/stage-index.json';
export const CAPTURE_EVIDENCE_SCHEMA = 'body-capture-evidence-v1';
const CUTOVER = 1790082000000;
const MAX_ATTEMPTS = 4;
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');

export function captureEvidencePayload(entry, fullHash) {
  return [
    CAPTURE_EVIDENCE_SCHEMA,
    String(entry?.doi || ''), String(entry?.id || ''), String(entry?.label || ''), String(entry?.caption || ''),
    String(entry?.articleUrl || ''), String(entry?.sourceUrl || ''), String(entry?.pageDoi || ''), String(entry?.jobId || ''),
    String(entry?.captureVersion || ''), Number(entry?.mediaGeneration || 0), String(entry?.r2Key || ''),
    String(entry?.contentHash || ''), String(fullHash || ''), Number(entry?.byteLength || 0), Number(entry?.width || 0),
    Number(entry?.height || 0), Number(entry?.sortOrder || 0),
  ];
}

export async function captureEvidenceFingerprint(entry, fullHash) {
  return digest(new TextEncoder().encode(JSON.stringify(captureEvidencePayload(entry, fullHash))));
}

export function storageCause(error) {
  const message = String(error?.message || error || '');
  const explicit = Number(error?.status || error?.statusCode || error?.httpStatus || 0);
  const number = Number(message.match(/\b(429|500|502|503|504)\b/)?.[1] || 0);
  const status = explicit || number;
  if (status === 429 || /\b10058\b|too\s*many\s*requests|rate.?limit/i.test(message)) return { cause: 'rate_limited', upstreamStatus: 429, retryable: true };
  if ([500,502,503,504].includes(status) || /\b100(?:01|43)\b|ServiceUnavailable|temporar(?:ily|y)|internal.?error/i.test(message)) return { cause: 'service_unavailable', upstreamStatus: status || null, retryable: true };
  if (error?.storageCause) return { cause: error.storageCause, upstreamStatus: null, retryable: false };
  return { cause: 'unclassified_storage_error', upstreamStatus: explicit || null, retryable: false };
}
function integrityError(cause) { return Object.assign(new Error(cause), {storageCause: cause}); }

export async function storeVerifiedStage(request, env, entry, bytes, fullHash, trustedPrevious, options = {}) {
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = options.now || Date.now;
  const requestId = crypto.randomUUID();
  const captureEvidenceFingerprintValue = await captureEvidenceFingerprint(entry, fullHash);
  const bucket = env.MEDIA;
  let operation = 'index_read', objectStored = false, retryCount = 0;
  const retryEvents = [];
  const wait = async (attempt, cause) => {
    retryCount += 1;
    retryEvents.push({operation, cause, attempt: attempt + 1});
    await sleep(1100 * 2 ** attempt);
  };
  const attemptOperation = async (name, work) => {
    operation = name;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try { return await work(); }
      catch (error) {
        const detail = storageCause(error);
        if (!detail.retryable || attempt === MAX_ATTEMPTS - 1) throw error;
        await wait(attempt, detail.cause);
      }
    }
  };
  const readIndex = async () => {
    operation = 'index_read';
    const object = await bucket.get(STAGE_INDEX_KEY);
    if (!object) return {index: {version: 1, updatedAt: 0, items: {}}, etag: null};
    if (!object.etag) throw integrityError('index_etag_missing');
    let index;
    try {
      const raw = await object.text();
      if (raw.length > 6000000) throw new Error('size');
      index = JSON.parse(raw);
    } catch { throw integrityError('index_invalid'); }
    if (!index || typeof index !== 'object' || Array.isArray(index) || !index.items || typeof index.items !== 'object' || Array.isArray(index.items)) throw integrityError('index_invalid');
    return {index, etag: object.etag};
  };
  const verifiedObject = async (key, hashPrefix, expectedSize) => {
    const object = await bucket.get(key);
    if (!object) return false;
    if (object.size > 4000000) throw integrityError('object_integrity_mismatch');
    const raw = new Uint8Array(await object.arrayBuffer());
    if (raw.length < 100 || raw.length > 4000000 || (expectedSize && raw.length !== expectedSize) || !(await digest(raw)).startsWith(hashPrefix)) throw integrityError('object_integrity_mismatch');
    return true;
  };
  const receipt = (record, extra = {}) => ({status: 200, body: {
    stored: true, staged: true, published: false, doi: record.doi, id: record.id,
    width: Number(record.width || 0), height: Number(record.height || 0), contentHash: record.contentHash,
    imageUrl: new URL(request.url).origin + '/media/' + record.r2Key.split('/').map(encodeURIComponent).join('/'),
    updatedAt: record.updatedAt, stageStorageRevision: STAGE_STORAGE_REVISION,
    captureEvidenceSchema: CAPTURE_EVIDENCE_SCHEMA,
    captureEvidenceFingerprint: record.captureEvidenceFingerprint || null,
    requestId, storageRetryCount: retryCount, ...extra
  }});
  const retained = async previous => {
    if (!previous || !trustedPrevious(previous) || previous.updatedAt < CUTOVER || !previous.r2Key || !/^[a-f0-9]{32}$/.test(previous.contentHash || '')) return null;
    const same = previous.r2Key === entry.r2Key && previous.contentHash === entry.contentHash;
    const higher = Number(previous.width || 0) * Number(previous.height || 0) > Number(entry.width || 0) * Number(entry.height || 0) && entry.width > 0 && entry.height > 0;
    if (!same && !higher) return null;
    const exists = await attemptOperation('retained_object_read', () => verifiedObject(previous.r2Key, previous.contentHash, previous.byteLength));
    return exists ? receipt(previous, {reusedExistingObject: same, retainedHigherResolution: !same}) : null;
  };
  try {
    const first = await attemptOperation('index_read', readIndex);
    const identity = entry.doi + '|' + entry.id;
    const existing = await retained(first.index.items[identity]);
    if (existing) return existing;
    await attemptOperation('object_write', async () => {
      // Content-addressed existing objects are reused only after real byte verification.
      if (await verifiedObject(entry.r2Key, fullHash, bytes.byteLength)) {objectStored = true; return;}
      const written = await bucket.put(entry.r2Key, bytes, {
        onlyIf: {etagDoesNotMatch: '*'}, sha256: Uint8Array.from(fullHash.match(/../g), h => parseInt(h, 16)).buffer,
        httpMetadata: {contentType: entry.contentType, cacheControl: 'public, max-age=31536000, immutable'},
        customMetadata: {doi: entry.doi, sourceId: entry.id, contentHash: entry.contentHash, jobId: entry.jobId, captureVersion: entry.captureVersion, source: 'tampermonkey-article-figure-stage'}
      });
      if (!written && !(await verifiedObject(entry.r2Key, fullHash, bytes.byteLength))) throw integrityError('object_conditional_write_unconfirmed');
      objectStored = true;
    });
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        // Re-read on every retry so another article's newly saved entry is not lost.
        const current = await readIndex();
        const prior = await retained(current.index.items[identity]);
        if (prior) return prior;
        const record = {...entry, captureEvidenceFingerprint: captureEvidenceFingerprintValue, captureEvidenceSchema: CAPTURE_EVIDENCE_SCHEMA, updatedAt: now(), stageStorageRevision: STAGE_STORAGE_REVISION};
        current.index.items[identity] = record;
        current.index.version = 1; current.index.updatedAt = record.updatedAt;
        operation = 'index_write';
        const saved = await bucket.put(STAGE_INDEX_KEY, JSON.stringify(current.index), {
          onlyIf: current.etag ? {etagMatches: current.etag} : {etagDoesNotMatch: '*'},
          httpMetadata: {contentType: 'application/json; charset=utf-8', cacheControl: 'no-store'}
        });
        if (saved) return receipt(record);
        if (attempt === MAX_ATTEMPTS - 1) throw Object.assign(new Error('index_compare_and_swap_conflict'), {status: 503});
        await wait(attempt, 'index_version_conflict');
      } catch (error) {
        if (!storageCause(error).retryable || attempt === MAX_ATTEMPTS - 1) throw error;
        await wait(attempt, storageCause(error).cause);
      }
    }
    throw integrityError('index_unconfirmed');
  } catch (error) {
    const cause = storageCause(error);
    const code = 'stage_storage_' + operation + '_' + cause.cause;
    const body = {stored: false, staged: false, published: false, doi: entry.doi, id: entry.id,
      error: code, code, detail: code + ';requestId=' + requestId,
      operation, upstreamStatus: cause.upstreamStatus, retryable: cause.retryable,
      retryAfterMs: cause.retryable ? 5000 : null, objectStored, indexCommitted: false,
      stageStorageRevision: STAGE_STORAGE_REVISION, storageRetryCount: retryCount, requestId};
    console.warn('STAGE_STORAGE_FAILURE', JSON.stringify({...body, retries: retryEvents}));
    return {status: cause.retryable ? 503 : 500, headers: cause.retryable ? {'retry-after': '5'} : {}, body};
  }
}
