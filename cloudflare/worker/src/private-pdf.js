import { authenticatedSessionUserId } from './integrations.js';

const READ_CAPABILITY = 'private_pdf_read';
const OWNER_CAPABILITY = 'private_pdf_owner';
const BOOTSTRAP_HASH = 'b9eba6b79e55197d7eca0bc9acc63ab9d3e33537d21903ce2bb11bcd83e0aaef';
const ACCESS_TTL_MS = 5 * 60 * 1000;

function normalizeDoi(value) {
  const raw = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '')
    .replace(/[).,;]+$/, '');
  return /^10\.\d{4,9}\/\S+$/.test(raw) ? raw : '';
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function randomToken(size = 32) {
  const bytes = new Uint8Array(size); crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function enabled(env, key) { return String(env?.[key] || '').trim() === '1'; }
async function capabilitiesForUser(env, userId) {
  if (!env?.DB || !userId) return [];
  try {
    const rows = await env.DB.prepare('SELECT capability FROM user_capabilities WHERE user_id = ? ORDER BY capability').bind(userId).all();
    return [...new Set((rows.results || []).map(row => String(row.capability || '')).filter(Boolean))];
  } catch { return []; }
}
async function hasCapability(env, userId, capability) {
  if (!env?.DB || !userId) return false;
  try {
    const row = await env.DB.prepare('SELECT 1 AS ok FROM user_capabilities WHERE user_id = ? AND capability = ? LIMIT 1').bind(userId, capability).first();
    return Boolean(row?.ok);
  } catch { return false; }
}
async function selectedDocument(env, doi) {
  if (!env?.DB || !doi) return null;
  try {
    return await env.DB.prepare(
      `SELECT id, doi, version_kind, content_hash, r2_key, byte_length, captured_at, processing_state
         FROM private_pdf_documents
        WHERE doi = ? AND active = 1
        ORDER BY CASE version_kind WHEN 'version_of_record' THEN 4 WHEN 'accepted_manuscript' THEN 3 WHEN 'preprint' THEN 2 ELSE 1 END DESC,
                 captured_at DESC
        LIMIT 1`
    ).bind(doi).first();
  } catch { return null; }
}
export async function bootstrapPrivatePdfOwner(request, env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const userId = await authenticatedSessionUserId(request, env);
  if (!userId) return { status: 401, body: { error: 'not_authenticated' } };
  const code = typeof payload?.claimCode === 'string' ? payload.claimCode.trim() : '';
  const claimHash = /^[a-f0-9]{64}$/i.test(String(env.PRIVATE_PDF_OWNER_BOOTSTRAP_HASH || ''))
    ? String(env.PRIVATE_PDF_OWNER_BOOTSTRAP_HASH).toLowerCase()
    : BOOTSTRAP_HASH;
  if (!code || await sha256Hex(code) !== claimHash) return { status: 403, body: { error: 'invalid_owner_claim' } };
  const verified = await env.DB.prepare('SELECT 1 AS ok FROM user_email_verifications WHERE user_id = ? LIMIT 1').bind(userId).first();
  if (!verified?.ok) return { status: 403, body: { error: 'verified_email_required' } };
  const existing = await env.DB.prepare('SELECT user_id FROM user_capabilities WHERE capability = ? LIMIT 1').bind(OWNER_CAPABILITY).first();
  if (existing?.user_id && existing.user_id !== userId) return { status: 409, body: { error: 'owner_already_claimed' } };
  const now = Date.now();
  for (const capability of [OWNER_CAPABILITY, READ_CAPABILITY, 'private_pdf_capture', 'private_pdf_process']) {
    await env.DB.prepare(
      `INSERT INTO user_capabilities (user_id, capability, granted_at, granted_by)
       VALUES (?, ?, ?, 'owner_bootstrap')
       ON CONFLICT(user_id, capability) DO UPDATE SET granted_at = excluded.granted_at, granted_by = excluded.granted_by`
    ).bind(userId, capability, now).run();
  }
  return { status: 200, body: { claimed: true, userId, capabilities: await capabilitiesForUser(env, userId) } };
}
export async function privatePdfStatus(request, env) {
  const doi = normalizeDoi(new URL(request.url).searchParams.get('doi'));
  if (!doi) return { status: 400, body: { error: 'invalid_doi' } };
  const userId = await authenticatedSessionUserId(request, env);
  if (!userId) return { status: 200, body: { enabled: enabled(env, 'PRIVATE_PDF_READ_ENABLED'), authenticated: false, entitled: false, available: false, doi } };
  const entitled = await hasCapability(env, userId, READ_CAPABILITY);
  if (!enabled(env, 'PRIVATE_PDF_READ_ENABLED') || !entitled) {
    return { status: 200, body: { enabled: enabled(env, 'PRIVATE_PDF_READ_ENABLED'), authenticated: true, entitled, available: false, doi } };
  }
  const doc = await selectedDocument(env, doi);
  return { status: 200, body: { enabled: true, authenticated: true, entitled: true, available: Boolean(doc && env.PDF_PRIVATE), doi,
    document: doc ? { id: doc.id, versionKind: doc.version_kind, byteLength: Number(doc.byte_length || 0), capturedAt: Number(doc.captured_at || 0), processingState: doc.processing_state || 'raw' } : null } };
}
export async function openPrivatePdf(request, env) {
  const doi = normalizeDoi(new URL(request.url).searchParams.get('doi'));
  if (!doi) return { status: 400, body: { error: 'invalid_doi' } };
  if (!enabled(env, 'PRIVATE_PDF_READ_ENABLED') || !env.PDF_PRIVATE) return { status: 200, body: { available: false, doi, reason: 'private_pdf_unavailable' } };
  const userId = await authenticatedSessionUserId(request, env);
  if (!userId) return { status: 401, body: { error: 'not_authenticated' } };
  if (!await hasCapability(env, userId, READ_CAPABILITY)) return { status: 403, body: { error: 'private_pdf_not_entitled' } };
  const doc = await selectedDocument(env, doi);
  if (!doc) return { status: 200, body: { available: false, doi, reason: 'pdf_not_stored' } };
  const token = randomToken(32), tokenHash = await sha256Hex(token), now = Date.now(), expiresAt = now + ACCESS_TTL_MS;
  await env.DB.prepare(
    'INSERT INTO private_pdf_access_tokens (token_hash, user_id, document_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(tokenHash, userId, doc.id, now, expiresAt).run();
  const url = new URL('/api/user-ui/private-pdf/file', request.url); url.searchParams.set('token', token);
  return { status: 200, body: { available: true, doi, url: url.toString(), expiresAt, versionKind: doc.version_kind } };
}
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : null, end = match[2] ? Number(match[2]) : null;
  if (start === null && end !== null) { const length = Math.min(size, end); start = size - length; end = size - 1; }
  if (start !== null && end === null) end = size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return { invalid: true };
  end = Math.min(end, size - 1);
  return { start, end, length: end - start + 1 };
}
export async function servePrivatePdf(request, env, cors = {}) {
  if (!enabled(env, 'PRIVATE_PDF_READ_ENABLED') || !env?.DB || !env?.PDF_PRIVATE) return new Response('Not available', { status: 404 });
  const token = new URL(request.url).searchParams.get('token') || '';
  if (token.length < 32) return new Response('Unauthorized', { status: 401 });
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT t.user_id, t.expires_at, d.doi, d.r2_key, d.byte_length
       FROM private_pdf_access_tokens t
       JOIN private_pdf_documents d ON d.id = t.document_id AND d.active = 1
       JOIN user_capabilities c ON c.user_id = t.user_id AND c.capability = ?
      WHERE t.token_hash = ? LIMIT 1`
  ).bind(READ_CAPABILITY, tokenHash).first();
  if (!row || Number(row.expires_at || 0) < Date.now()) {
    if (row) await env.DB.prepare('DELETE FROM private_pdf_access_tokens WHERE token_hash = ?').bind(tokenHash).run().catch(() => {});
    return new Response('Unauthorized', { status: 401 });
  }
  const head = await env.PDF_PRIVATE.head(row.r2_key);
  if (!head) return new Response('Not found', { status: 404 });
  const range = parseRange(request.headers.get('range'), Number(head.size || row.byte_length || 0));
  if (range?.invalid) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${head.size}`, ...cors } });
  const object = await env.PDF_PRIVATE.get(row.r2_key, range ? { range: { offset: range.start, length: range.length } } : undefined);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers(cors);
  headers.set('content-type', 'application/pdf');
  headers.set('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.doi + '.pdf')}`);
  headers.set('cache-control', 'private, no-store');
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');
  if (range) { headers.set('content-range', `bytes ${range.start}-${range.end}/${head.size}`); headers.set('content-length', String(range.length)); }
  else headers.set('content-length', String(head.size));
  return new Response(request.method === 'HEAD' ? null : object.body, { status: range ? 206 : 200, headers });
}
