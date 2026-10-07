import { authenticatedSessionUserId } from './integrations.js';
import { normalizeDoi } from '../../../shared/literature-identity.mjs';

export const PDF_VAULT_QUEUE_LIMITS = Object.freeze({
  maxBodyBytes: 2048, maxDoiLength: 512, maxBatchDois: 24,
  maxPageSize: 50, maxPending: 500, maxRows: 10_000,
});
const TABLE = 'user_pdf_acquisition_queue';
const COLUMNS = 'doi, state, revision, created_at, updated_at';
const STATES = new Set(['pending', 'cancelled', 'completed']);
const ACTION_STATE = Object.freeze({ queue: 'pending', cancel: 'cancelled', complete: 'completed' });
const MAX_REVISION = Number.MAX_SAFE_INTEGER;
const encoder = new TextEncoder();

class QueueRequestError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const result = (status, body) => ({ status, body });
const invalid = (code = 'pdf_vault_queue_invalid_request') => { throw new QueueRequestError(400, code); };
const unavailable = () => result(503, { error: 'pdf_vault_queue_unavailable' });
const unauthenticated = () => result(401, { error: 'not_authenticated' });

function doiValue(value) {
  if (typeof value !== 'string' || value.length > 2048) invalid('pdf_vault_queue_invalid_doi');
  const doi = normalizeDoi(value);
  if (!doi || doi.length > PDF_VAULT_QUEUE_LIMITS.maxDoiLength) invalid('pdf_vault_queue_invalid_doi');
  return doi;
}

function itemOf(row) {
  if (!row) return null;
  const doi = normalizeDoi(row.doi);
  if (!doi || doi !== row.doi || doi.length > PDF_VAULT_QUEUE_LIMITS.maxDoiLength
    || !STATES.has(row.state) || !Number.isSafeInteger(row.revision) || row.revision < 1
    || !Number.isSafeInteger(row.created_at) || row.created_at < 0
    || !Number.isSafeInteger(row.updated_at) || row.updated_at < row.created_at) {
    throw new Error('pdf_vault_queue_corrupt_record');
  }
  return { doi, state: row.state, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function authenticate(request, env) {
  if (!env?.DB) throw new Error('pdf_vault_queue_db_unavailable');
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S{1,512})$/i.exec(authorization.trim());
  if (!match) return null;
  const userId = await authenticatedSessionUserId(request, env);
  if (!userId) return null;
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(match[1]));
  const tokenHash = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  return { userId, tokenHash };
}

const LIVE_SESSION = 'EXISTS (SELECT 1 FROM user_sessions WHERE token_hash = ? AND user_id = ? AND expires_at > ?)';
const sessionArgs = (context, now = Date.now()) => [context.tokenHash, context.userId, now];

async function sessionAlive(env, context) {
  return Boolean(await env.DB.prepare('SELECT 1 AS live FROM user_sessions WHERE token_hash = ? AND user_id = ? AND expires_at > ?')
    .bind(...sessionArgs(context)).first());
}

async function currentItem(env, context, doi) {
  return itemOf(await env.DB.prepare(`SELECT ${COLUMNS} FROM ${TABLE} WHERE user_id = ? AND doi = ? AND ${LIVE_SESSION}`)
    .bind(context.userId, doi, ...sessionArgs(context)).first());
}

function queryOf(request) {
  const url = new URL(request.url);
  if (url.search.length > 32_768) invalid('pdf_vault_queue_query_too_large');
  const params = url.searchParams;
  const keys = [...params.keys()];
  if (keys.some(key => !['doi', 'after', 'limit'].includes(key))) invalid('pdf_vault_queue_unknown_query_field');
  if (params.has('doi')) {
    if (params.has('after') || params.has('limit')) invalid('pdf_vault_queue_mixed_query');
    const dois = [...new Set(params.getAll('doi').map(doiValue))];
    if (!dois.length || dois.length > PDF_VAULT_QUEUE_LIMITS.maxBatchDois) invalid('pdf_vault_queue_too_many_dois');
    return { kind: 'doi', dois };
  }
  if (params.getAll('after').length > 1 || params.getAll('limit').length > 1) invalid('pdf_vault_queue_duplicate_query_field');
  const rawLimit = params.get('limit');
  const limit = rawLimit === null ? PDF_VAULT_QUEUE_LIMITS.maxPageSize : Number(rawLimit);
  if (rawLimit !== null && !/^[1-9]\d?$/.test(rawLimit)) invalid('pdf_vault_queue_invalid_limit');
  if (!Number.isInteger(limit) || limit < 1 || limit > PDF_VAULT_QUEUE_LIMITS.maxPageSize) invalid('pdf_vault_queue_invalid_limit');
  const after = params.get('after') ? doiValue(params.get('after')) : '';
  return { kind: 'page', after, limit };
}

async function boundedBody(request) {
  const header = request.headers.get('content-length');
  if (header !== null && (!/^\d+$/.test(header) || Number(header) > PDF_VAULT_QUEUE_LIMITS.maxBodyBytes)) {
    throw new QueueRequestError(413, 'pdf_vault_queue_body_too_large');
  }
  const contentType = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new QueueRequestError(415, 'pdf_vault_queue_json_required');
  if (!request.body) invalid('pdf_vault_queue_invalid_json');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PDF_VAULT_QUEUE_LIMITS.maxBodyBytes) {
        await reader.cancel().catch(() => {});
        throw new QueueRequestError(413, 'pdf_vault_queue_body_too_large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
  let payload;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { invalid('pdf_vault_queue_invalid_json'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) invalid();
  const keys = Object.keys(payload);
  if (keys.length !== 3 || keys.some(key => !['doi', 'action', 'expectedRevision'].includes(key))) invalid('pdf_vault_queue_unknown_body_field');
  if (typeof payload.action !== 'string' || !Object.hasOwn(ACTION_STATE, payload.action)) invalid('pdf_vault_queue_invalid_action');
  if (typeof payload.expectedRevision !== 'number' || !Number.isSafeInteger(payload.expectedRevision)
    || payload.expectedRevision < 0 || payload.expectedRevision >= MAX_REVISION) invalid('pdf_vault_queue_invalid_revision');
  return { doi: doiValue(payload.doi), state: ACTION_STATE[payload.action], expectedRevision: payload.expectedRevision };
}

function requestFailure(error) {
  return error instanceof QueueRequestError ? result(error.status, { error: error.code }) : unavailable();
}

/** Only authenticated account metadata leaves this endpoint. Pending tasks are
 * sorted by DOI with a bounded keyset page; a DOI lookup also finds tombstones. */
export async function readPdfVaultQueue(request, env) {
  if (request.method !== 'GET') return result(405, { error: 'method_not_allowed' });
  try {
    const context = await authenticate(request, env);
    if (!context) return unauthenticated();
    const query = queryOf(request);
    if (!await sessionAlive(env, context)) return unauthenticated();
    let body;
    if (query.kind === 'doi') {
      const placeholders = query.dois.map(() => '?').join(',');
      const rows = await env.DB.prepare(`SELECT ${COLUMNS} FROM ${TABLE}
        WHERE user_id = ? AND doi IN (${placeholders}) AND ${LIVE_SESSION} ORDER BY doi`)
        .bind(context.userId, ...query.dois, ...sessionArgs(context)).all();
      if (rows?.success === false || !Array.isArray(rows?.results)) throw new Error('pdf_vault_queue_read_failed');
      const items = rows.results.map(itemOf);
      body = query.dois.length === 1 ? { userId: context.userId, item: items[0] || null } : { userId: context.userId, items };
    } else {
      const rows = await env.DB.prepare(`SELECT ${COLUMNS} FROM ${TABLE}
        WHERE user_id = ? AND state = 'pending' AND doi > ? AND ${LIVE_SESSION} ORDER BY doi LIMIT ?`)
        .bind(context.userId, query.after, ...sessionArgs(context), query.limit + 1).all();
      if (rows?.success === false || !Array.isArray(rows?.results)) throw new Error('pdf_vault_queue_read_failed');
      const hasMore = rows.results.length > query.limit;
      const items = rows.results.slice(0, query.limit).map(itemOf);
      body = { userId: context.userId, items, nextAfter: hasMore ? items[items.length - 1].doi : null, hasMore };
    }
    // A session revoked while the queue was being read never yields account
    // records, or an apparently valid but misleading empty account response.
    if (!await sessionAlive(env, context)) return unauthenticated();
    return result(200, body);
  } catch (error) { return requestFailure(error); }
}

/** A single SQL statement owns the compare-and-swap, live-session check and
 * capacity predicates. No SELECT/count followed by an unguarded write exists. */
export async function mutatePdfVaultQueue(request, env) {
  if (request.method !== 'POST') return result(405, { error: 'method_not_allowed' });
  try {
    const context = await authenticate(request, env);
    if (!context) return unauthenticated();
    if (new URL(request.url).search) invalid('pdf_vault_queue_unknown_query_field');
    const input = await boundedBody(request);
    const now = Date.now();
    let write;
    if (input.expectedRevision === 0) {
      write = await env.DB.prepare(`INSERT INTO ${TABLE} (user_id, doi, state, revision, created_at, updated_at)
        SELECT ?, ?, 'pending', 1, ?, ?
        WHERE ? = 'pending' AND ${LIVE_SESSION}
          AND (SELECT COUNT(*) FROM ${TABLE} WHERE user_id = ?) < ?
          AND (SELECT COUNT(*) FROM ${TABLE} WHERE user_id = ? AND state = 'pending') < ?
        ON CONFLICT(user_id, doi) DO NOTHING
        RETURNING ${COLUMNS}`)
        .bind(context.userId, input.doi, now, now, input.state, ...sessionArgs(context, now),
          context.userId, PDF_VAULT_QUEUE_LIMITS.maxRows, context.userId, PDF_VAULT_QUEUE_LIMITS.maxPending).all();
    } else {
      write = await env.DB.prepare(`UPDATE ${TABLE}
        SET state = ?, revision = revision + 1, updated_at = MAX(updated_at, ?)
        WHERE user_id = ? AND doi = ? AND revision = ? AND ${LIVE_SESSION}
          AND (? != 'pending' OR state = 'pending'
            OR (SELECT COUNT(*) FROM ${TABLE} WHERE user_id = ? AND state = 'pending') < ?)
        RETURNING ${COLUMNS}`)
        .bind(input.state, now, context.userId, input.doi, input.expectedRevision, ...sessionArgs(context, now),
          input.state, context.userId, PDF_VAULT_QUEUE_LIMITS.maxPending).all();
    }
    if (write?.success === false || !Array.isArray(write?.results) || write.results.length > 1) throw new Error('pdf_vault_queue_write_failed');
    if (!await sessionAlive(env, context)) return unauthenticated();
    if (write.results.length === 1) {
      const item = itemOf(write.results[0]);
      if (item.doi !== input.doi || item.revision !== input.expectedRevision + 1 || item.state !== input.state) throw new Error('pdf_vault_queue_write_mismatch');
      return result(200, { userId: context.userId, item });
    }

    const item = await currentItem(env, context, input.doi);
    if (!await sessionAlive(env, context)) return unauthenticated();
    const conflict = () => result(409, { error: 'pdf_vault_queue_revision_conflict', userId: context.userId, item });
    if ((item?.revision || 0) !== input.expectedRevision || input.state !== 'pending') return conflict();
    const counts = await env.DB.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN state = 'pending' THEN 1 ELSE 0 END), 0) AS pending
      FROM ${TABLE} WHERE user_id = ? AND ${LIVE_SESSION}`)
      .bind(context.userId, ...sessionArgs(context)).first();
    if (!await sessionAlive(env, context)) return unauthenticated();
    if (!item && Number(counts?.total) >= PDF_VAULT_QUEUE_LIMITS.maxRows) {
      return result(429, { error: 'pdf_vault_queue_total_limit', userId: context.userId });
    }
    if (item?.state !== 'pending' && Number(counts?.pending) >= PDF_VAULT_QUEUE_LIMITS.maxPending) {
      return result(429, { error: 'pdf_vault_queue_pending_limit', userId: context.userId });
    }
    // Capacity may have been freed by another device after the guarded write.
    // Return the current row for an explicit refresh/retry, without replaying.
    return conflict();
  } catch (error) { return requestFailure(error); }
}
