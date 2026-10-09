// Canonical opaque bearer sessions. The D1 insert trigger is the concurrency
// backstop: every login route, including older clients, is capped at five.
export const MAX_ACCOUNT_DEVICES = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const DEVICE_ID_RE = /^[a-f0-9]{32}$/;

function randomToken(size = 36) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Hex(value) {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(data)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function canonicalDeviceInfo(payload) {
  const id = typeof payload?.deviceId === 'string' ? payload.deviceId.trim().toLowerCase() : '';
  const label = typeof payload?.deviceLabel === 'string'
    ? payload.deviceLabel.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)
    : '';
  return { deviceId: DEVICE_ID_RE.test(id) ? id : null, deviceLabel: label || null };
}

export async function issueBearerSession(env, userId, payload = {}) {
  if (!env?.DB || !userId) throw new Error('account_session_database_unavailable');
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const { deviceId, deviceLabel } = canonicalDeviceInfo(payload);
  // D1.batch is transactional. Delete the preceding session for this browser
  // before inserting: a repeated sign-in does not consume a second slot.
  // The D1 AFTER INSERT trigger atomically evicts any excess session, so
  // simultaneous sixth-device logins cannot bypass the five-session limit.
  const statements = [];
  if (deviceId) {
    statements.push(env.DB.prepare(
      'DELETE FROM user_sessions WHERE user_id = ? AND token_hash IN ' +
      '(SELECT token_hash FROM user_session_devices WHERE user_id = ? AND device_id = ?)'
    ).bind(userId, userId, deviceId));
  }
  statements.push(env.DB.prepare(
    'INSERT INTO user_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)'
  ).bind(tokenHash, userId, now, expiresAt));
  statements.push(env.DB.prepare(
    'UPDATE user_session_devices SET device_id = ?, device_label = ?, last_seen_at = ? WHERE token_hash = ? AND user_id = ?'
  ).bind(deviceId, deviceLabel, now, tokenHash, userId));
  await env.DB.batch(statements);
  return { token, expiresAt };
}

export async function touchBearerSession(env, tokenHash) {
  if (!env?.DB || !tokenHash) return;
  const now = Date.now();
  // Updating every API hit would consume unnecessary D1 writes.
  await env.DB.prepare(
    'UPDATE user_session_devices SET last_seen_at=? WHERE token_hash=? AND last_seen_at<?'
  ).bind(now, tokenHash, now - TOUCH_INTERVAL_MS).run();
}

export async function listBearerSessions(env, userId, currentTokenHash) {
  const rows = await env.DB.prepare(
    'SELECT s.token_hash, s.created_at, s.expires_at, d.device_label, ' +
    'COALESCE(d.last_seen_at,s.created_at) AS last_seen_at ' +
    'FROM user_sessions s LEFT JOIN user_session_devices d ON d.token_hash=s.token_hash ' +
    'WHERE s.user_id=? AND s.expires_at>? ' +
    'ORDER BY last_seen_at DESC, s.created_at DESC, s.token_hash ASC'
  ).bind(userId, Date.now()).all();
  const sessions = (rows?.results || []).map(row => ({
    sessionId: String(row.token_hash).slice(0, 24),
    deviceLabel: row.device_label || null,
    current: row.token_hash === currentTokenHash,
    lastSeenAt: Number(row.last_seen_at || row.created_at),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
  }));
  return { limit: MAX_ACCOUNT_DEVICES, count: sessions.length, sessions };
}

export async function revokeBearerSession(env, userId, currentTokenHash, sessionId) {
  if (!/^[a-f0-9]{24}$/.test(String(sessionId || ''))) return { status: 400, body: { error: 'invalid_session_id' } };
  const result = await env.DB.prepare(
    'DELETE FROM user_sessions WHERE user_id=? AND substr(token_hash,1,24)=? AND token_hash<>?'
  ).bind(userId, sessionId, currentTokenHash).run();
  return { status: 200, body: { ok: true, revoked: Number(result?.meta?.changes || 0) } };
}

export async function bearerTokenHash(token) {
  return token ? sha256Hex(token) : null;
}
