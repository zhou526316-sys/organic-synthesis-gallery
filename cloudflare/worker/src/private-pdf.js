import { authenticatedSessionUserId } from './integrations.js';

const READ_CAPABILITY = 'private_pdf_read';
const OWNER_CAPABILITY = 'private_pdf_owner';
const BOOTSTRAP_HASH = '7d06423d6dec5593c6ced3cf94d7dcea652600bf0eae59e06f0921108e75e819';
const ACCESS_TTL_MS = 5 * 60 * 1000;
const VIEW_ABSOLUTE_TTL_MS = 90 * 60 * 1000;
const VIEW_COOKIE_IDLE_SECONDS = 60 * 60;
const FAST_TICKET_VERSION = 'v2';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function normalizeDoi(value) {
  const raw = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '')
    .replace(/[).,;]+$/, '');
  return /^10\.\d{4,9}\/\S+$/.test(raw) ? raw : '';
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function bytesToBase64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
function ticketSecret(env) {
  return String(env?.PRIVATE_PDF_TICKET_SECRET || env?.BRIDGE_WRITE_TOKEN || '').trim();
}
async function privatePdfTicketKey(env) {
  const secret = ticketSecret(env);
  if (!secret) return null;
  const raw = await crypto.subtle.digest('SHA-256', textEncoder.encode('organic-gallery-private-pdf-fast-ticket-v2\0' + secret));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function privatePdfContinuationKey(env) {
  const secret = ticketSecret(env);
  if (!secret) return null;
  const raw = await crypto.subtle.digest('SHA-256', textEncoder.encode('organic-gallery-private-pdf-continuation-v1\0' + secret));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function safePrivateR2Key(value) {
  // Key is exclusively obtained from the selected, active private R2 document.
  // Do not reject legitimate older R2 naming schemes solely because their
  // object path does not begin with the latest capture prefix.
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
    !/^[\\/]/.test(value) && !/[\u0000-\u001f\u007f]/.test(value) &&
    !/(^|\/)\.\.(\/|$)/.test(value) && !/^https?:\/\//i.test(value);
}
function continuationCookieName(payload) {
  return /^[A-Za-z0-9_-]{16,32}$/.test(String(payload?.nonce || ''))
    ? 'gpdf_' + payload.nonce : '';
}
async function signContinuationCookie(env, ticket) {
  const key = await privatePdfContinuationKey(env);
  if (!key) return '';
  return 'v1.' + bytesToBase64Url(new Uint8Array(await crypto.subtle.sign(
    'HMAC', key, textEncoder.encode('gallery-pdf-continuation-v1\0' + ticket))));
}
async function hasValidContinuationCookie(request, env, payload, ticket) {
  if (payload.mode !== 'view' || Date.now() > payload.hardExp) return false;
  const name = continuationCookieName(payload);
  if (!name) return false;
  const header = request.headers.get('cookie') || '';
  const value = header.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))
    ?.slice(name.length + 1) || '';
  if (!/^v1\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const key = await privatePdfContinuationKey(env);
  if (!key) return false;
  try {
    return await crypto.subtle.verify('HMAC', key, base64UrlToBytes(value.slice(3)),
      textEncoder.encode('gallery-pdf-continuation-v1\0' + ticket));
  } catch { return false; }
}
async function extendContinuationCookie(headers, env, payload, ticket) {
  const name = continuationCookieName(payload);
  if (!name || payload.mode !== 'view') return;
  const remaining = Math.ceil((payload.hardExp - Date.now()) / 1000);
  if (remaining <= 0) return;
  const signature = await signContinuationCookie(env, ticket);
  if (!signature) return;
  headers.set('set-cookie', name + '=' + signature + '; Path=/api/user-ui/private-pdf/file; Max-Age=' +
    Math.min(VIEW_COOKIE_IDLE_SECONDS, remaining) + '; Secure; HttpOnly; SameSite=Strict');
}
async function makeFastTicket(env, payload) {
  const key = await privatePdfTicketKey(env);
  if (!key) return '';
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = textEncoder.encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return FAST_TICKET_VERSION + '.' + bytesToBase64Url(iv) + '.' + bytesToBase64Url(ciphertext);
}
async function readFastTicket(env, token) {
  if (!String(token || '').startsWith(FAST_TICKET_VERSION + '.')) return null;
  const key = await privatePdfTicketKey(env);
  if (!key) return null;
  try {
    const [, ivRaw, cipherRaw] = String(token).split('.');
    const iv = base64UrlToBytes(ivRaw);
    const ciphertext = base64UrlToBytes(cipherRaw);
    if (iv.byteLength !== 12 || ciphertext.byteLength < 17) return null;
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    const payload = JSON.parse(textDecoder.decode(plaintext));
    if (payload?.v !== 2 || !normalizeDoi(payload?.doi) ||
        !safePrivateR2Key(payload?.r2Key)) return null;
    if (!Number.isSafeInteger(payload.size) || payload.size < 1) return null;
    if (!Number.isSafeInteger(payload.exp) || payload.exp < 1) return null;
    if (payload.mode == null) return { ...payload, mode: 'view', hardExp: payload.exp, nonce: '' };
    if (!['view', 'download'].includes(payload.mode) ||
        !Number.isSafeInteger(payload.hardExp) || payload.hardExp < payload.exp ||
        payload.hardExp - payload.exp > VIEW_ABSOLUTE_TTL_MS ||
        !continuationCookieName(payload)) return null;
    return payload;
  } catch {
    return null;
  }
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
        WHERE doi = ? AND active = 1 AND processing_state = 'ready'
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
  const openUrl = new URL(request.url);
  const doi = normalizeDoi(openUrl.searchParams.get('doi'));
  const mode = openUrl.searchParams.get('mode') || 'view';
  if (!doi) return { status: 400, body: { error: 'invalid_doi' } };
  if (!['view', 'download'].includes(mode)) return { status: 400, body: { error: 'invalid_pdf_mode' } };
  if (!enabled(env, 'PRIVATE_PDF_READ_ENABLED') || !env.PDF_PRIVATE) return { status: 200, body: { available: false, doi, reason: 'private_pdf_unavailable' } };
  const userId = await authenticatedSessionUserId(request, env);
  if (!userId) return { status: 401, body: { error: 'not_authenticated' } };
  if (!await hasCapability(env, userId, READ_CAPABILITY)) return { status: 403, body: { error: 'private_pdf_not_entitled' } };
  const doc = await selectedDocument(env, doi);
  if (!doc) return { status: 200, body: { available: false, doi, reason: 'pdf_not_stored' } };
  if (!safePrivateR2Key(doc.r2_key) ||
      !Number.isSafeInteger(Number(doc.byte_length)) || Number(doc.byte_length) < 8) {
    return { status: 200, body: { available: false, doi, reason: 'pdf_storage_metadata_invalid' } };
  }
  // Validate size AND actual PDF signature at the edge before minting a URL.
  // One 16-byte R2 range replaces the previous HEAD here and the extra
  // browser-to-Worker preflight request on the stateless v2 fast path.
  let firstBytes;
  try {
    const object = await env.PDF_PRIVATE.get(doc.r2_key, { range: { offset: 0, length: 16 } });
    if (!object || Number(object.size) !== Number(doc.byte_length)) {
      return { status: 200, body: { available: false, doi, reason: 'pdf_object_unavailable' } };
    }
    firstBytes = new Uint8Array(await object.arrayBuffer());
  } catch {
    return { status: 503, body: { error: 'private_pdf_storage_unavailable' } };
  }
  if (firstBytes.length !== 16 ||
      String.fromCharCode(...firstBytes.subarray(0, 5)) !== '%PDF-') {
    return { status: 200, body: { available: false, doi, reason: 'pdf_header_invalid' } };
  }
  const now = Date.now(), expiresAt = now + ACCESS_TTL_MS;
  const fastToken = await makeFastTicket(env, {
    v: 2,
    uid: userId,
    doi: doc.doi,
    r2Key: doc.r2_key,
    size: Number(doc.byte_length),
    exp: expiresAt,
    hardExp: mode === 'view' ? now + VIEW_ABSOLUTE_TTL_MS : expiresAt,
    mode,
    nonce: randomToken(12),
  });
  const selfChecked = fastToken ? await readFastTicket(env, fastToken) : null;
  let token = selfChecked && selfChecked.r2Key === doc.r2_key &&
    selfChecked.size === Number(doc.byte_length) ? fastToken : '';
  let ticketMode = token ? 'stateless-v2' : 'legacy-d1';
  if (!token) {
    token = randomToken(32);
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare(
      'INSERT INTO private_pdf_access_tokens (token_hash, user_id, document_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(tokenHash, userId, doc.id, now, expiresAt).run();
  }
  const url = new URL('/api/user-ui/private-pdf/file', request.url);
  url.searchParams.set('token', token);
  if (mode === 'download') url.searchParams.set('download', '1');
  return { status: 200, body: { available: true, doi, url: url.toString(), expiresAt,
    versionKind: doc.version_kind, ticketMode, mode,
    byteLength: Number(doc.byte_length),
    // Only the same-worker self-tested stateless ticket may omit browser
    // preflight. Legacy D1 tokens retain the old per-open verification path.
    headerVerified: ticketMode === 'stateless-v2' } };
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

function privateFileError(status, code, cors = {}) {
  const headers = new Headers(cors);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'private, no-store');
  headers.set('x-gallery-pdf-status', code);
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify({ error: code }), { status, headers });
}
export async function servePrivatePdf(request, env, cors = {}) {
  if (!enabled(env, 'PRIVATE_PDF_READ_ENABLED') || !env?.PDF_PRIVATE) {
    return privateFileError(404, 'pdf_service_unavailable', cors);
  }
  const url = new URL(request.url), token = url.searchParams.get('token') || '';
  if (token.length < 32) return privateFileError(401, 'pdf_ticket_missing', cors);
  const wantsDownload = url.searchParams.get('download') === '1';
  const isFast = token.startsWith(FAST_TICKET_VERSION + '.');
  const fast = isFast ? await readFastTicket(env, token) : null;
  if (isFast && !fast) return privateFileError(401, 'pdf_ticket_invalid', cors);

  let row = null;
  if (fast) {
    if ((fast.mode === 'download') !== wantsDownload) {
      return privateFileError(403, 'pdf_ticket_mode_mismatch', cors);
    }
    const fresh = Date.now() <= fast.exp;
    const continuation = !fresh && await hasValidContinuationCookie(request, env, fast, token);
    if (!fresh && !continuation) return privateFileError(401, 'pdf_ticket_expired', cors);
    row = { user_id: fast.uid, expires_at: fast.hardExp, doi: fast.doi,
      r2_key: fast.r2Key, byte_length: fast.size };
  } else {
    if (!env?.DB) return privateFileError(401, 'pdf_ticket_invalid', cors);
    const tokenHash = await sha256Hex(token);
    row = await env.DB.prepare(
      `SELECT t.user_id, t.expires_at, d.doi, d.r2_key, d.byte_length
         FROM private_pdf_access_tokens t
         JOIN private_pdf_documents d ON d.id = t.document_id AND d.active = 1 AND d.processing_state = 'ready'
         JOIN user_capabilities c ON c.user_id = t.user_id AND c.capability = ?
        WHERE t.token_hash = ? LIMIT 1`
    ).bind(READ_CAPABILITY, tokenHash).first();
    if (!row || Number(row.expires_at || 0) < Date.now()) {
      if (row) await env.DB.prepare('DELETE FROM private_pdf_access_tokens WHERE token_hash = ?').bind(tokenHash).run().catch(() => {});
      return privateFileError(401, 'pdf_ticket_expired_or_invalid', cors);
    }
  }

  const size = Number(row.byte_length || 0);
  if (!safePrivateR2Key(row.r2_key) || !Number.isSafeInteger(size) || size < 8) {
    return privateFileError(404, 'pdf_object_unavailable', cors);
  }
  const range = parseRange(request.headers.get('range'), size);
  if (range?.invalid) {
    const error = privateFileError(416, 'pdf_range_invalid', cors);
    const h = new Headers(error.headers);
    h.set('content-range', `bytes */${size}`);
    return new Response(error.body, { status: 416, headers: h });
  }
  const headers = new Headers(cors);
  headers.set('content-type', 'application/pdf');
  headers.set('content-disposition',
    `${wantsDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(row.doi + '.pdf')}`);
  headers.set('cache-control', 'private, no-store');
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-gallery-pdf-status', 'ok');
  if (range) {
    headers.set('content-range', `bytes ${range.start}-${range.end}/${size}`);
    headers.set('content-length', String(range.length));
  } else headers.set('content-length', String(size));

  if (fast && fast.mode === 'view') await extendContinuationCookie(headers, env, fast, token);
  if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });

  let object;
  try {
    object = await env.PDF_PRIVATE.get(row.r2_key,
      range ? { range: { offset: range.start, length: range.length } } : undefined);
  } catch { return privateFileError(503, 'pdf_storage_unavailable', cors); }
  if (!object) return privateFileError(404, 'pdf_object_unavailable', cors);
  return new Response(object.body, { status: range ? 206 : 200, headers });
}

const CAPTURE_CAPABILITY = 'private_pdf_capture';
const CAPTURE_LEASE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PDF_BYTES = 60 * 1024 * 1024;

async function sha256BufferHex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function bearerToken(request) {
  return String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

async function captureLeaseRow(request, env) {
  const token = bearerToken(request);
  if (!token || !env?.DB) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT l.token_hash, l.user_id, l.expires_at, l.revoked_at
       FROM private_pdf_capture_leases l
       JOIN user_capabilities c ON c.user_id = l.user_id AND c.capability = ?
      WHERE l.token_hash = ? LIMIT 1`
  ).bind(CAPTURE_CAPABILITY, tokenHash).first();
  if (!row || Number(row.revoked_at || 0) > 0 || Number(row.expires_at || 0) <= Date.now()) return null;
  return row;
}

export async function issuePrivatePdfCaptureLease(request, env) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  if (!enabled(env, 'PRIVATE_PDF_CAPTURE_ENABLED')) return { status: 503, body: { error: 'private_pdf_capture_disabled' } };
  const userId = await authenticatedSessionUserId(request, env);
  if (!userId) return { status: 401, body: { error: 'not_authenticated' } };
  if (!await hasCapability(env, userId, CAPTURE_CAPABILITY)) return { status: 403, body: { error: 'private_pdf_capture_not_entitled' } };
  const token = randomToken(32), tokenHash = await sha256Hex(token), now = Date.now(), expiresAt = now + CAPTURE_LEASE_TTL_MS;
  await env.DB.prepare(
    'INSERT INTO private_pdf_capture_leases (token_hash, user_id, created_at, expires_at, revoked_at, label) VALUES (?, ?, ?, ?, NULL, ?)'
  ).bind(tokenHash, userId, now, expiresAt, 'tampermonkey-browser').run();
  return { status: 200, body: { token, expiresAt, scope: 'private_pdf_capture', ttlSeconds: Math.floor(CAPTURE_LEASE_TTL_MS / 1000) } };
}

export async function revokePrivatePdfCaptureLeases(request, env) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const userId = await authenticatedSessionUserId(request, env);
  if (!userId) return { status: 401, body: { error: 'not_authenticated' } };
  const now = Date.now();
  await env.DB.prepare('UPDATE private_pdf_capture_leases SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .bind(now, userId).run();
  return { status: 200, body: { revoked: true, at: now } };
}

function publisherForPdfDoi(doi) {
  if (doi.startsWith('10.1021/')) return 'acs';
  if (doi.startsWith('10.1002/')) return 'wiley';
  if (doi.startsWith('10.1038/')) return 'nature';
  if (doi.startsWith('10.1126/')) return 'science';
  if (doi.startsWith('10.1039/')) return 'rsc';
  if (doi.startsWith('10.1016/')) return 'elsevier';
  if (doi.startsWith('10.31635/')) return 'ccs';
  return 'other';
}

function trustedPdfHost(publisher, hostname) {
  const h = String(hostname || '').toLowerCase();
  const sub = base => h === base || h.endsWith('.' + base);
  if (publisher === 'acs') return sub('pubs.acs.org');
  if (publisher === 'wiley') return sub('onlinelibrary.wiley.com');
  if (publisher === 'nature') return sub('nature.com');
  if (publisher === 'science') return sub('science.org');
  if (publisher === 'rsc') return sub('pubs.rsc.org') || sub('rscj.silverchair-cdn.com');
  if (publisher === 'elsevier') return sub('sciencedirect.com') || sub('sciencedirectassets.com') || sub('cell.com');
  if (publisher === 'ccs') return sub('chinesechemsoc.org') || sub('ccspublishing.org.cn');
  return false;
}

function safeHttpsUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'https:' && u.username === '' && u.password === '' && u.href.length <= 4096 ? u : null;
  } catch {
    return null;
  }
}

function pdfMagicValid(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 1024 || bytes.length > MAX_PDF_BYTES) return false;
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head !== '%PDF-') return false;
  const tail = new TextDecoder('latin1').decode(bytes.slice(Math.max(0, bytes.length - 4096)));
  return tail.includes('%%EOF');
}

export async function importPrivatePdf(request, env) {
  if (!env?.DB || !env?.PDF_PRIVATE) return { status: 503, body: { error: 'private_pdf_storage_unavailable' } };
  if (!enabled(env, 'PRIVATE_PDF_CAPTURE_ENABLED')) return { status: 503, body: { error: 'private_pdf_capture_disabled' } };
  const lease = await captureLeaseRow(request, env);
  if (!lease) return { status: 401, body: { error: 'private_pdf_capture_lease_invalid' } };

  const url = new URL(request.url);
  const doi = normalizeDoi(url.searchParams.get('doi'));
  if (!doi) return { status: 400, body: { error: 'invalid_doi' } };
  if (String(url.searchParams.get('controllerRevision') || '') !== '2.2.41') {
    return { status: 409, body: { error: 'stale_controller_revision', expectedControllerRevision: '2.2.41', doi } };
  }
  const publisher = publisherForPdfDoi(doi);
  if (publisher === 'other') return { status: 400, body: { error: 'unsupported_pdf_publisher' } };
  const articleUrl = safeHttpsUrl(url.searchParams.get('articleUrl'));
  const sourceUrl = safeHttpsUrl(url.searchParams.get('sourceUrl'));
  if (!articleUrl || !sourceUrl || !trustedPdfHost(publisher, articleUrl.hostname) || !trustedPdfHost(publisher, sourceUrl.hostname)) {
    return { status: 400, body: { error: 'pdf_source_not_bound_to_publisher' } };
  }
  const declaredPublisher = String(url.searchParams.get('publisher') || '').toLowerCase();
  if (declaredPublisher && declaredPublisher !== publisher) return { status: 400, body: { error: 'pdf_publisher_mismatch' } };
  const versionKind = String(url.searchParams.get('versionKind') || 'unknown').toLowerCase();
  if (!['version_of_record','accepted_manuscript','preprint','unknown'].includes(versionKind)) {
    return { status: 400, body: { error: 'invalid_pdf_version_kind' } };
  }
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (!/^(?:application\/pdf|application\/octet-stream)(?:;|$)/.test(contentType)) {
    return { status: 415, body: { error: 'pdf_content_type_required' } };
  }
  const lengthHeader = Number(request.headers.get('content-length') || 0);
  if (lengthHeader > MAX_PDF_BYTES) return { status: 413, body: { error: 'pdf_too_large' } };

  const buffer = await request.arrayBuffer();
  if (!pdfMagicValid(buffer)) return { status: 422, body: { error: 'invalid_pdf_bytes' } };
  const contentHash = await sha256BufferHex(buffer);
  const existing = await env.DB.prepare(
    'SELECT id, processing_state, active, byte_length FROM private_pdf_documents WHERE doi = ? AND content_hash = ? LIMIT 1'
  ).bind(doi, contentHash).first();
  if (existing) {
    return { status: 200, body: { stored: true, duplicate: true, doi, documentId: existing.id,
      contentHash, byteLength: Number(existing.byte_length || buffer.byteLength), processingState: existing.processing_state, active: Boolean(existing.active) } };
  }

  const id = 'pdf_' + contentHash.slice(0, 28);
  const safeDoi = doi.replace(/[^a-z0-9._-]+/g, '_');
  const r2Key = 'private-pdf/raw/' + safeDoi + '/' + contentHash + '.pdf';
  await env.PDF_PRIVATE.put(r2Key, buffer, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { doi, publisher, versionKind, contentHash },
  });
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO private_pdf_documents
       (id, doi, publisher, article_url, source_url, version_kind, content_hash, r2_key, byte_length,
        captured_at, processing_state, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'raw', 0, ?, ?)`
    ).bind(id, doi, publisher, articleUrl.href, sourceUrl.href, versionKind, contentHash, r2Key, buffer.byteLength, now, now, now).run();
  } catch (error) {
    // An identical upload may have committed first, or this INSERT may have
    // committed despite a lost acknowledgement. Return its existing receipt.
    let committed = null;
    try {
      committed = await env.DB.prepare(
        'SELECT id, processing_state, active, byte_length FROM private_pdf_documents WHERE doi = ? AND content_hash = ? LIMIT 1'
      ).bind(doi, contentHash).first();
    } catch {}
    if (committed) {
      return { status: 200, body: { stored: true, duplicate: true, doi, documentId: committed.id,
        contentHash, byteLength: Number(committed.byte_length || buffer.byteLength), processingState: committed.processing_state, active: Boolean(committed.active) } };
    }
    // This content-addressed key is shared by concurrent imports. Even an empty
    // lookup cannot rule out a pending INSERT, so deleting it here is unsafe.
    // Preserve private bytes for a retry and retain the original database error.
    throw error;
  }
  return { status: 201, body: { stored: true, duplicate: false, doi, documentId: id, contentHash,
    byteLength: buffer.byteLength, processingState: 'raw', active: false, requiresVerification: true } };
}
