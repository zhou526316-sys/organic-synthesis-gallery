import { normalizeDoi } from './literature-identity.mjs';

export { normalizeDoi };

/**
 * P0 metadata and presentation contract. This module opens no files, performs no
 * requests, verifies no publisher licence and issues no server read grants.
 * A synchronised manifest is evidence of a known location, never a read grant.
 */
export const PDF_STORAGE_KINDS = Object.freeze(['local_folder', 'opfs', 'personal_cloud', 'gallery_cloud', 'public_oa']);
export const PDF_COPY_STATES = Object.freeze(['pending', 'available', 'missing', 'revoked', 'deleted']);
export const PDF_VERSION_KINDS = Object.freeze(['publisher', 'accepted_manuscript', 'preprint', 'unknown']);
export const PDF_CAPTURE_DESTINATIONS = Object.freeze(['local_folder', 'opfs']);
export const PDF_CAPTURE_MIN_TTL_MS = 600_000;
export const PDF_CAPTURE_MAX_TTL_MS = 900_000;
export const PDF_PROBE_MAX_AGE_MS = 60_000;
export const PDF_CARD_LABELS = Object.freeze({
  unknown: 'PDF',
  local: 'PDF · 本机',
  cloud: 'PDF · 云端',
  other_device: 'PDF · 另一设备',
  oa: 'PDF · OA',
  needs_permission: 'PDF · 需权限',
  capturing: 'PDF · 获取中',
});

const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;
const PUBLISHER = /^[a-z0-9_-]{1,128}$/;
const HASH = /^[0-9a-f]{64}$/;
const localKind = kind => kind === 'local_folder' || kind === 'opfs';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const token = value => typeof value === 'string' && TOKEN.test(value);
const hash = value => typeof value === 'string' && HASH.test(value);
const timestamp = value => Number.isSafeInteger(value) && value >= 0;
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const nullable = (value, predicate) => value == null || predicate(value);
const nullValue = value => value == null ? null : value;

function identity(input) {
  if (!record(input) || !token(input.user_id)) return null;
  const doi = normalizeDoi(input.doi);
  return doi && doi.length <= 512 ? { user_id: input.user_id, doi } : null;
}

function chronology(input) {
  return timestamp(input.created_at) && timestamp(input.updated_at) && input.updated_at >= input.created_at;
}

/** Explicit allowlist. Unknown properties, including file handles/paths/bytes,
 * credentials and arbitrary nested metadata, never enter the sync payload. */
export function toDocumentManifest(input) {
  const owner = identity(input);
  if (!owner || !chronology(input) || !nullable(input.preferred_content_hash, hash) ||
      !nullable(input.preferred_version_kind, value => PDF_VERSION_KINDS.includes(value)) ||
      ((input.preferred_content_hash == null) !== (input.preferred_version_kind == null))) {
    throw new TypeError('invalid_pdf_document_manifest');
  }
  return {
    ...owner,
    preferred_content_hash: nullValue(input.preferred_content_hash),
    preferred_version_kind: nullValue(input.preferred_version_kind),
    created_at: input.created_at,
    updated_at: input.updated_at,
  };
}

/** provider_ref is an opaque application record ID, never a provider URL,
 * filesystem path, access token or credential. The future adapter must enforce
 * that meaning; syntax checking alone cannot recognise a secret-shaped ID. */
export function toCopyManifest(input) {
  const owner = identity(input);
  if (!owner || !token(input.id) || !chronology(input) ||
      !PDF_STORAGE_KINDS.includes(input.storage_kind) || !PDF_COPY_STATES.includes(input.state) ||
      !PDF_VERSION_KINDS.includes(input.version_kind) || !nullable(input.content_hash, hash) ||
      !nullable(input.byte_length, positiveInteger) || !nullable(input.acquired_at, timestamp) ||
      !nullable(input.last_verified_at, timestamp) ||
      (input.acquired_at != null && input.last_verified_at != null && input.last_verified_at < input.acquired_at)) {
    throw new TypeError('invalid_pdf_copy_manifest');
  }
  if (localKind(input.storage_kind)) {
    if (!token(input.device_id) || input.provider != null || input.provider_ref != null) {
      throw new TypeError('invalid_pdf_local_copy_location');
    }
  } else if (input.device_id != null || !token(input.provider) || !token(input.provider_ref)) {
    throw new TypeError('invalid_pdf_remote_copy_location');
  }
  if (input.state === 'available' && (!hash(input.content_hash) || !positiveInteger(input.byte_length) ||
      !timestamp(input.acquired_at) || !timestamp(input.last_verified_at))) {
    throw new TypeError('incomplete_pdf_available_copy');
  }
  return {
    id: input.id,
    ...owner,
    content_hash: nullValue(input.content_hash),
    storage_kind: input.storage_kind,
    device_id: nullValue(input.device_id),
    provider: nullValue(input.provider),
    provider_ref: nullValue(input.provider_ref),
    byte_length: nullValue(input.byte_length),
    version_kind: input.version_kind,
    state: input.state,
    acquired_at: nullValue(input.acquired_at),
    last_verified_at: nullValue(input.last_verified_at),
    created_at: input.created_at,
    updated_at: input.updated_at,
  };
}

/** Ownership matching is necessary, but is not proof of current file access. */
export function ownsPdfCopy(copy, context) {
  const owner = identity(context);
  return Boolean(owner && record(copy) && token(copy.id) &&
    copy.user_id === owner.user_id && normalizeDoi(copy.doi) === owner.doi);
}

/**
 * Contract eligibility only: this does NOT verify a nonce preimage, PDF bytes,
 * a publisher licence or the authenticated caller, and does NOT consume a
 * session. A future endpoint must validate those facts, then atomically consume
 * with all bindings + nonce_hash + used_at IS NULL + revoked_at IS NULL + time
 * and size predicates. Exactly one affected row is required to prevent replay.
 * byte_length is optional when only displaying an active acquisition; a real
 * import must provide and independently validate the actual received size.
 */
export function validateCaptureSession(session, context) {
  const fail = reason => ({ valid: false, reason });
  const owner = identity(context);
  if (!owner || !timestamp(context.now)) return fail('invalid_context');
  if (!record(session) || !token(session.id) || !token(session.user_id) ||
      !normalizeDoi(session.doi) || typeof session.publisher !== 'string' || !PUBLISHER.test(session.publisher) || !token(session.device_id) ||
      !PDF_CAPTURE_DESTINATIONS.includes(session.destination) || !hash(session.nonce_hash) ||
      !positiveInteger(session.max_bytes) || !timestamp(session.created_at) ||
      !timestamp(session.expires_at) || !nullable(session.used_at, timestamp) ||
      !nullable(session.revoked_at, timestamp)) return fail('invalid_session');
  const ttl = session.expires_at - session.created_at;
  if (ttl < PDF_CAPTURE_MIN_TTL_MS || ttl > PDF_CAPTURE_MAX_TTL_MS) return fail('invalid_lifetime');
  if (session.user_id !== owner.user_id || normalizeDoi(session.doi) !== owner.doi ||
      session.publisher !== context.publisher || session.destination !== context.destination ||
      session.device_id !== context.device_id) return fail('binding_mismatch');
  if (session.used_at != null) return fail('already_used');
  if (session.revoked_at != null) return fail('revoked');
  if (context.now < session.created_at) return fail('not_started');
  if (context.now >= session.expires_at) return fail('expired');
  if (context.byte_length !== undefined && (!positiveInteger(context.byte_length) ||
      context.byte_length > session.max_bytes)) return fail('invalid_size');
  return { valid: true, reason: 'eligible' };
}

function boundReceipt(receipt, copy, context) {
  return record(receipt) && receipt.user_id === context.user_id &&
    normalizeDoi(receipt.doi) === context.doi && receipt.copy_id === copy.id &&
    receipt.content_hash === copy.content_hash;
}

/** Receipts must come from the current device's actual file/provider probe,
 * not from synchronised manifests. Even a fresh receipt is only a UI hint:
 * the eventual click must reopen/recheck and handle revocation or a missing file. */
function probeFor(copy, context) {
  const probes = context.probes.filter(probe => boundReceipt(probe, copy, context) &&
    token(context.device_id) && probe.device_id === context.device_id &&
    timestamp(probe.checked_at) && probe.checked_at <= context.now &&
    context.now - probe.checked_at <= PDF_PROBE_MAX_AGE_MS &&
    ['readable', 'missing', 'permission_required', 'unavailable'].includes(probe.status));
  // A later failed probe supersedes an earlier successful probe. Conflicting
  // statuses at the same instant fail closed, independent of input order.
  probes.sort((a, b) => b.checked_at - a.checked_at || Number(a.status === 'readable') - Number(b.status === 'readable'));
  return probes[0];
}

function verifiedOa(copy, context) {
  // Independent, trusted rights verification; oa_verified in a copy manifest is
  // intentionally ignored. This function does not perform that verification.
  const proofs = context.oa_verifications.filter(proof => boundReceipt(proof, copy, context) &&
    timestamp(proof.verified_at) && proof.verified_at <= context.now);
  const permits = proof => proof.status === 'verified' && proof.read_allowed === true &&
    timestamp(proof.expires_at) && proof.expires_at > context.now;
  proofs.sort((a, b) => b.verified_at - a.verified_at || Number(permits(a)) - Number(permits(b)));
  return proofs.length > 0 && permits(proofs[0]);
}

function result(state, action, reason, copy = null) {
  return { state, label: PDF_CARD_LABELS[state], action, reason, copy_id: copy?.id ?? null };
}

/**
 * Seven-state card contract; returns no URL, token, nonce, hash or file path.
 * Local -> personal cloud -> optional Gallery cloud -> verified OA -> current
 * acquisition -> known other device -> restore/verify -> publisher acquisition.
 * Inputs are snapshots: the caller must discard them when account/device changes.
 */
export function resolvePdfCardState(input = {}) {
  const owner = identity(input);
  if (!owner || !timestamp(input.now)) return result('unknown', 'unavailable', 'invalid_context');
  const context = {
    ...owner,
    now: input.now,
    device_id: token(input.device_id) ? input.device_id : null,
    probes: Array.isArray(input.probes) ? input.probes : [],
    oa_verifications: Array.isArray(input.oa_verifications) ? input.oa_verifications : [],
  };
  // A manifest must not contain contradictory duplicates of one account/copy.
  // Count raw identities first: an incomplete tombstone must still suppress a
  // stale available row. Revoked/deleted copies cannot be revived; use a new id.
  const scoped = (Array.isArray(input.copies) ? input.copies : []).filter(copy => ownsPdfCopy(copy, context));
  const counts = new Map();
  for (const copy of scoped) counts.set(copy.id, (counts.get(copy.id) ?? 0) + 1);
  const unique = [];
  for (const candidate of scoped) {
    if (counts.get(candidate.id) !== 1) continue;
    try { unique.push(toCopyManifest(candidate)); } catch { /* Invalid metadata fails closed. */ }
  }
  const available = unique.filter(copy => copy.state === 'available');
  const isReadable = copy => probeFor(copy, context)?.status === 'readable';
  const local = available.find(copy => localKind(copy.storage_kind) &&
    copy.device_id === context.device_id && isReadable(copy));
  if (local) return result('local', 'open_local', 'current_device_verified', local);
  for (const kind of ['personal_cloud', 'gallery_cloud']) {
    const cloud = available.find(copy => copy.storage_kind === kind && isReadable(copy));
    if (cloud) return result('cloud', 'open_cloud', 'current_cloud_access_verified', cloud);
  }
  const oa = available.find(copy => copy.storage_kind === 'public_oa' &&
    verifiedOa(copy, context) && isReadable(copy));
  if (oa) return result('oa', 'open_oa', 'independent_oa_verification', oa);

  const sessionContext = {
    ...context, publisher: input.publisher, destination: input.destination,
  };
  const sessions = (Array.isArray(input.capture_sessions) ? input.capture_sessions : [])
    .filter(session => record(session) && session.user_id === context.user_id && token(session.id));
  const sessionCounts = new Map();
  for (const session of sessions) sessionCounts.set(session.id, (sessionCounts.get(session.id) ?? 0) + 1);
  if (sessions.some(session => sessionCounts.get(session.id) === 1 && validateCaptureSession(session, sessionContext).valid)) {
    return result('capturing', 'show_capture_progress', 'active_bound_session');
  }
  const other = available.find(copy => localKind(copy.storage_kind) &&
    context.device_id !== null && copy.device_id !== context.device_id);
  if (other) return result('other_device', 'restore_or_reacquire', 'known_other_device', other);
  const current = available.find(copy => localKind(copy.storage_kind) && copy.device_id === context.device_id);
  if (current) {
    const probe = probeFor(current, context);
    return result(input.access_required === true ? 'needs_permission' : 'unknown',
      !probe ? 'verify_local_copy' : 'restore_or_reacquire',
      !probe ? 'local_copy_unverified' : 'local_copy_unreadable', current);
  }
  const missing = unique.find(copy => localKind(copy.storage_kind) &&
    copy.device_id === context.device_id && copy.state === 'missing');
  if (missing) return result('unknown', 'restore_or_reacquire', 'local_copy_missing', missing);
  const action = ['mobile', 'wechat'].includes(input.device_kind) && input.access_required === true
    ? 'queue_desktop_acquisition' : 'start_publisher_acquisition';
  return result(input.access_required === true ? 'needs_permission' : 'unknown', action, 'no_readable_copy');
}
