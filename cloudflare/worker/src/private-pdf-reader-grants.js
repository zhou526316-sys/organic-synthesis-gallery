import { authenticatedSessionUserId } from './integrations.js';

// Owner-only, account-bound read grants. The only capability this endpoint
// can create or revoke is private_pdf_read. No shared entitlement is inferred
// merely from a user-supplied email address.
const READ = 'private_pdf_read';
const OWNER = 'private_pdf_owner';
const GRANT_PREFIX = 'owner_reader_grant:';
const PROTECTED = new Set([OWNER, 'private_pdf_capture', 'private_pdf_process']);
function emailValue(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return email.length >= 5 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}
const reply = (status, body) => ({ status, body });

export async function managePrivatePdfReaderGrant(request, env, payload) {
  if (!env?.DB) return reply(503, { error: 'database_not_configured' });
  const ownerId = await authenticatedSessionUserId(request, env);
  if (!ownerId) return reply(401, { error: 'not_authenticated' });

  try {
    const owner = await env.DB.prepare(
      'SELECT 1 AS ok FROM user_capabilities WHERE user_id = ? AND capability = ? LIMIT 1'
    ).bind(ownerId, OWNER).first();
    if (!owner?.ok) return reply(403, { error: 'owner_required' });
  } catch {
    return reply(503, { error: 'owner_check_unavailable' });
  }

  const email = emailValue(payload?.email);
  const action = payload?.action;
  if (!email || !['status', 'grant', 'revoke'].includes(action) ||
      !payload || Object.keys(payload).some(key => !['email', 'action', 'rightsConfirmed'].includes(key))) {
    return reply(400, { error: 'invalid_reader_grant_request' });
  }
  if (action === 'grant' && payload.rightsConfirmed !== true)
    return reply(400, { error: 'owner_share_rights_confirmation_required' });
  try {
    // Both the current account email and verified email must match. Older
    // accounts can change their email after verification; an old receipt must
    // not authorize a different address. Ambiguity fails closed.
    const result = await env.DB.prepare(
      'SELECT u.id AS user_id FROM users u JOIN user_email_verifications v ON v.user_id = u.id ' +
      'WHERE lower(u.email) = ? AND lower(v.email) = ? AND v.verified_at > 0 LIMIT 2'
    ).bind(email, email).all();
    const rows = result?.results || [];
    if (rows.length !== 1 || !rows[0]?.user_id)
      return reply(404, { error: 'reader_account_not_verified_or_ambiguous' });
    const targetId = String(rows[0].user_id);
    if (targetId === ownerId) return reply(409, { error: 'owner_account_not_reader_target' });

    const grants = await env.DB.prepare(
      'SELECT capability, granted_by FROM user_capabilities WHERE user_id = ? ' +
      "AND capability IN ('private_pdf_read','private_pdf_owner','private_pdf_capture','private_pdf_process')"
    ).bind(targetId).all();
    const capabilities = new Map((grants?.results || []).map(item =>
      [String(item.capability), String(item.granted_by || '')]));
    if ([...PROTECTED].some(role => capabilities.has(role)))
      return reply(409, { error: 'reader_target_has_privileged_pdf_capabilities' });
    const existing = capabilities.get(READ);
    const mayRevoke = existing === GRANT_PREFIX + ownerId;

    if (action === 'status') {
      return reply(200, { verified: true, readGranted: Boolean(existing), canRevoke: mayRevoke });
    }
    if (action === 'grant' && existing) {
      return reply(200, { verified: true, readGranted: true, changed: false, canRevoke: mayRevoke });
    }
    if (action === 'revoke' && !existing) {
      return reply(200, { verified: true, readGranted: false, changed: false, canRevoke: false });
    }
    if (action === 'revoke' && !mayRevoke)
      return reply(409, { error: 'grant_source_is_not_owner_managed' });

    const now = Date.now();
    const statement = action === 'grant'
      ? env.DB.prepare(
        'INSERT INTO user_capabilities (user_id,capability,granted_at,granted_by) VALUES (?,?,?,?) ON CONFLICT(user_id,capability) DO NOTHING'
      ).bind(targetId, READ, now, GRANT_PREFIX + ownerId)
      : env.DB.prepare(
        "DELETE FROM user_capabilities WHERE user_id=? AND capability='private_pdf_read' AND granted_by=?"
      ).bind(targetId, GRANT_PREFIX + ownerId);

    // Both the permission mutation and a durable audit receipt are committed
    // in one D1 batch. The audit row records the owner's attempted action;
    // the response always reads back the effective state.
    const audit = env.DB.prepare(
      'INSERT INTO private_pdf_reader_grant_audit (event_id,actor_user_id,target_user_id,action,created_at) VALUES (?,?,?,?,?)'
    ).bind(crypto.randomUUID(), ownerId, targetId, action, now);
    await env.DB.batch([statement, audit]);
    const final = await env.DB.prepare(
      'SELECT granted_by FROM user_capabilities WHERE user_id=? AND capability=? LIMIT 1'
    ).bind(targetId, READ).first();
    const readGranted = Boolean(final?.granted_by);
    if ((action === 'grant') !== readGranted)
      return reply(409, { error: 'reader_grant_concurrent_change' });
    return reply(200, {
      verified: true, readGranted, changed: true,
      canRevoke: final?.granted_by === GRANT_PREFIX + ownerId,
    });
  } catch {
    // No underlying SQL errors or emails are reflected in public responses.
    return reply(503, { error: 'reader_grant_storage_unavailable' });
  }
}
