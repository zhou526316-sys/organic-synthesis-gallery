import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PDF_CARD_LABELS, PDF_PROBE_MAX_AGE_MS, toDocumentManifest, toCopyManifest,
  ownsPdfCopy, resolvePdfCardState, validateCaptureSession,
} from '../shared/pdf-vault-v1.mjs';

const NOW = 1_800_000_000_000;
const DOI = '10.1021/jacs.6c00001';
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const base = { user_id: 'alice', doi: DOI, device_id: 'device_a', now: NOW };
function copy(overrides = {}) {
  return {
    id: 'copy_a', user_id: 'alice', doi: DOI, content_hash: HASH,
    storage_kind: 'local_folder', device_id: 'device_a', provider: null, provider_ref: null,
    byte_length: 1000, version_kind: 'publisher', state: 'available',
    acquired_at: NOW - 2000, last_verified_at: NOW - 1000,
    created_at: NOW - 3000, updated_at: NOW, ...overrides,
  };
}
function remote(kind = 'personal_cloud', overrides = {}) {
  return copy({ id: `copy_${kind}`, storage_kind: kind, device_id: null, provider: 'provider_a', provider_ref: 'asset_a', ...overrides });
}
function probe(item, overrides = {}) {
  return { user_id: item.user_id, doi: item.doi, copy_id: item.id, content_hash: item.content_hash,
    device_id: 'device_a', status: 'readable', checked_at: NOW, ...overrides };
}
function oaProof(item, overrides = {}) {
  return { user_id: item.user_id, doi: item.doi, copy_id: item.id, content_hash: item.content_hash,
    status: 'verified', read_allowed: true, verified_at: NOW - 100, expires_at: NOW + 1000, ...overrides };
}
function session(overrides = {}) {
  return { id: 'session_a', user_id: 'alice', doi: DOI, publisher: 'acs', destination: 'local_folder',
    device_id: 'device_a', nonce_hash: HASH, max_bytes: 20_000_000,
    created_at: NOW - 1000, expires_at: NOW + 599_000, used_at: null, revoked_at: null, ...overrides };
}
const captureContext = { ...base, publisher: 'acs', destination: 'local_folder' };
const resolve = input => resolvePdfCardState({ ...base, ...input });

test('document sync emits only the documented scalar metadata and canonical DOI', () => {
  const manifest = toDocumentManifest({ user_id: 'alice', doi: `https://doi.org/${DOI.toUpperCase()}`,
    created_at: NOW, updated_at: NOW, local_path: 'C:\\private\\paper.pdf', password: 'must-not-sync',
    directory_handle: {}, bytes: new Uint8Array([37, 80, 68, 70]), note: 'private text',
  });
  assert.deepEqual(manifest, { user_id: 'alice', doi: DOI, preferred_content_hash: null,
    preferred_version_kind: null, created_at: NOW, updated_at: NOW });
  assert.throws(() => toDocumentManifest({ ...manifest, preferred_content_hash: HASH }), /invalid_pdf_document_manifest/);
  assert.throws(() => toDocumentManifest({ ...manifest, user_id: '' }), /invalid_pdf_document_manifest/);
});

test('copy sync excludes paths, handles, credentials, PDF bytes and claimed OA authority', () => {
  const clean = copy();
  assert.deepEqual(toCopyManifest({ ...clean, path: '/private/file.pdf', handle: {}, cookie: 'secret',
    pdf_bytes: [37, 80, 68, 70], token: 'secret', oa_verified: true, nested: { full_text: 'private' } }), clean);
  for (const bad of [copy({ provider_ref: '/Users/alice/file.pdf' }), remote('personal_cloud', { provider_ref: 'https://cloud.test/file?token=secret' }),
    copy({ state: 'readable' }), copy({ content_hash: 'jacs' }), copy({ byte_length: NaN }), copy({ last_verified_at: undefined }),
    copy({ last_verified_at: NOW - 2001 })]) {
    assert.throws(() => toCopyManifest(bad));
  }
});

test('neither matching DOI nor matching bytes transfers a private copy to another account', () => {
  const aliceCopy = copy();
  assert.equal(ownsPdfCopy(aliceCopy, { user_id: 'bob', doi: DOI }), false);
  assert.equal(ownsPdfCopy(aliceCopy, { user_id: '', doi: DOI }), false);
  const bob = resolve({ user_id: 'bob', copies: [aliceCopy], probes: [probe(aliceCopy)] });
  assert.equal(bob.state, 'unknown');
  assert.equal(bob.copy_id, null);
  const wrongDoi = resolve({ doi: '10.1021/jacs.6c00002', copies: [aliceCopy], probes: [probe(aliceCopy)] });
  assert.equal(wrongDoi.state, 'unknown');
});

test('a synced available manifest is not evidence this browser can read a local file', () => {
  const item = copy();
  assert.equal(resolve({ copies: [item] }).action, 'verify_local_copy');
  assert.equal(resolve({ copies: [item] }).state, 'unknown');
  assert.equal(resolve({ copies: [item], probes: [probe(item)] }).state, 'local');
  assert.equal(resolve({ device_id: null, copies: [item], probes: [probe(item)] }).state, 'unknown');
});

test('local probe must match account, DOI, copy, hash, observing device and current time', () => {
  const item = copy();
  for (const mismatch of [{ user_id: 'bob' }, { doi: '10.1021/jacs.6c00002' }, { copy_id: 'different_copy' },
    { content_hash: OTHER_HASH }, { device_id: 'device_b' }, { checked_at: NOW + 1 },
    { checked_at: NOW - PDF_PROBE_MAX_AGE_MS - 1 }, { checked_at: NaN }]) {
    assert.equal(resolve({ copies: [item], probes: [probe(item, mismatch)] }).action, 'verify_local_copy');
  }
});

test('newer failed probe and simultaneous conflicting probe both supersede readable history', () => {
  const item = copy();
  for (const failedAt of [NOW - 1, NOW]) {
    const probes = [probe(item, { checked_at: NOW - 1 }), probe(item, { checked_at: failedAt, status: 'missing' })];
    for (const order of [probes, [...probes].reverse()]) {
      assert.equal(resolve({ copies: [item], probes: order }).action, 'restore_or_reacquire');
    }
  }
});

test('deleted, revoked and missing copies cannot reopen using a previously good probe', () => {
  for (const state of ['deleted', 'revoked', 'missing', 'pending']) {
    const item = copy({ state });
    const result = resolve({ copies: [item], probes: [probe(item)] });
    assert.notEqual(result.state, 'local');
    assert.notEqual(result.action, 'open_local');
  }
  const item = copy();
  assert.notEqual(resolve({ copies: [item, copy({ state: 'revoked' })], probes: [probe(item)] }).state, 'local');
  const tombstone = { user_id: item.user_id, doi: item.doi, id: item.id, state: 'deleted' };
  assert.notEqual(resolve({ copies: [item, tombstone], probes: [probe(item)] }).state, 'local');
  // An unrelated account's identical copy id cannot invalidate this user's own record.
  assert.equal(resolve({ copies: [item, { ...tombstone, user_id: 'bob' }], probes: [probe(item)] }).state, 'local');
});

test('current-device copy wins over all cloud/OA copies and an active capture', () => {
  const items = [remote('gallery_cloud'), remote(), remote('public_oa'), copy()];
  const result = resolve({ ...captureContext, copies: items, probes: items.map(item => probe(item)),
    oa_verifications: [oaProof(items[2])], capture_sessions: [session()] });
  assert.equal(result.state, 'local');
  assert.equal(result.copy_id, 'copy_a');
});

test('cloud access needs a current scoped probe and personal cloud precedes Gallery cloud', () => {
  const personal = remote();
  const gallery = remote('gallery_cloud');
  assert.equal(resolve({ copies: [personal] }).state, 'unknown');
  const result = resolve({ copies: [gallery, personal], probes: [probe(personal), probe(gallery)] });
  assert.equal(result.state, 'cloud');
  assert.equal(result.copy_id, personal.id);
  assert.equal(resolve({ copies: [personal], probes: [probe(personal, { user_id: 'bob' })] }).state, 'unknown');
});

test('verified OA precedes another-device presence but cannot be self-declared in the manifest', () => {
  const oa = remote('public_oa', { oa_verified: true });
  const another = copy({ device_id: 'device_b' });
  assert.equal(resolve({ copies: [oa], probes: [probe(oa)] }).state, 'unknown');
  assert.equal(resolve({ copies: [oa, another], probes: [probe(oa)], oa_verifications: [oaProof(oa)] }).state, 'oa');
  for (const bad of [{ status: 'unverified' }, { read_allowed: false }, { expires_at: NOW },
    { user_id: 'bob' }, { copy_id: 'other' }, { content_hash: OTHER_HASH }]) {
    assert.equal(resolve({ copies: [oa], probes: [probe(oa)], oa_verifications: [oaProof(oa, bad)] }).state, 'unknown');
  }
  for (const verified_at of [NOW - 100, NOW]) {
    const proofs = [oaProof(oa), oaProof(oa, { status: 'revoked', verified_at })];
    for (const order of [proofs, [...proofs].reverse()]) {
      assert.equal(resolve({ copies: [oa], probes: [probe(oa)], oa_verifications: order }).state, 'unknown');
    }
  }
  const expiredLatest = [oaProof(oa), oaProof(oa, { verified_at: NOW, expires_at: NOW })];
  assert.equal(resolve({ copies: [oa], probes: [probe(oa)], oa_verifications: expiredLatest }).state, 'unknown');
});

test('other-device presence offers restore, never a current-device open', () => {
  const item = copy({ device_id: 'device_b' });
  const result = resolve({ copies: [item], probes: [probe(item)] });
  assert.equal(result.state, 'other_device');
  assert.equal(result.action, 'restore_or_reacquire');
});

test('mobile and WeChat queue paywalled acquisition while desktop can begin its own publisher flow', () => {
  for (const device_kind of ['mobile', 'wechat']) {
    const result = resolve({ device_kind, access_required: true });
    assert.equal(result.state, 'needs_permission');
    assert.equal(result.action, 'queue_desktop_acquisition');
  }
  assert.equal(resolve({ device_kind: 'desktop', access_required: true }).action, 'start_publisher_acquisition');
});

test('all seven labels are reachable and display output contains no transport or secret fields', () => {
  const local = copy();
  const cloud = remote();
  const oa = remote('public_oa');
  const states = [resolve({}), resolve({ copies: [local], probes: [probe(local)] }),
    resolve({ copies: [cloud], probes: [probe(cloud)] }), resolve({ copies: [copy({ device_id: 'device_b' })] }),
    resolve({ copies: [oa], probes: [probe(oa)], oa_verifications: [oaProof(oa)] }),
    resolve({ access_required: true }), resolve({ ...captureContext, capture_sessions: [session()] })];
  assert.deepEqual(new Set(states.map(item => item.label)), new Set(Object.values(PDF_CARD_LABELS)));
  for (const state of states) assert.deepEqual(Object.keys(state).sort(), ['action', 'copy_id', 'label', 'reason', 'state']);
  assert.equal(JSON.stringify(states).includes(HASH), false);
});

test('ordinary capture sessions bind the target account, DOI, publisher, destination and device', () => {
  assert.equal(validateCaptureSession(session(), captureContext).valid, true);
  for (const changed of [{ user_id: 'bob' }, { doi: '10.1021/jacs.6c00002' }, { publisher: 'wiley' },
    { destination: 'opfs' }, { device_id: 'device_b' }]) {
    assert.equal(validateCaptureSession(session(), { ...captureContext, ...changed }).reason, 'binding_mismatch');
  }
  assert.equal(validateCaptureSession(session({ destination: 'gallery_cloud' }), captureContext).valid, false);
  assert.equal(validateCaptureSession(session({ publisher: 'ACS' }), captureContext).valid, false);
});

test('capture lifetime is 10–15 minutes with exclusive expiry and no used/revoked reuse', () => {
  const item = session();
  assert.equal(validateCaptureSession(item, { ...captureContext, now: item.created_at }).valid, true);
  assert.equal(validateCaptureSession(item, { ...captureContext, now: item.expires_at }).reason, 'expired');
  assert.equal(validateCaptureSession(item, { ...captureContext, now: item.created_at - 1 }).reason, 'not_started');
  assert.equal(validateCaptureSession(session({ expires_at: item.created_at + 900_000 }), captureContext).valid, true);
  for (const lifetime of [0, 599_999, 900_001, 7 * 24 * 60 * 60 * 1000]) {
    assert.equal(validateCaptureSession(session({ expires_at: item.created_at + lifetime }), captureContext).reason, 'invalid_lifetime');
  }
  assert.equal(validateCaptureSession(session({ used_at: NOW }), captureContext).reason, 'already_used');
  assert.equal(validateCaptureSession(session({ revoked_at: NOW }), captureContext).reason, 'revoked');
});

test('capture metadata rejects malformed/non-finite values and supplied over-limit import size', () => {
  for (const changed of [{ nonce_hash: 'not-a-hash' }, { max_bytes: 0 }, { max_bytes: Infinity },
    { created_at: NaN }, { expires_at: 'tomorrow' }, { user_id: '' }, { device_id: '/home/alice' }]) {
    assert.equal(validateCaptureSession(session(changed), captureContext).valid, false);
  }
  assert.equal(validateCaptureSession(session(), { ...captureContext, byte_length: 20_000_000 }).valid, true);
  for (const byte_length of [0, -1, 20_000_001, NaN]) {
    assert.equal(validateCaptureSession(session(), { ...captureContext, byte_length }).reason, 'invalid_size');
  }
  assert.equal(validateCaptureSession(session(), { ...captureContext, now: NaN }).valid, false);
});

test('contract validation is side-effect free and cannot claim a one-time session was consumed', () => {
  const item = Object.freeze(session());
  const context = Object.freeze(captureContext);
  assert.deepEqual(validateCaptureSession(item, context), { valid: true, reason: 'eligible' });
  assert.deepEqual(validateCaptureSession(item, context), { valid: true, reason: 'eligible' });
  assert.equal(item.used_at, null);
  assert.equal(resolve({ ...captureContext, capture_sessions: [session({ used_at: NOW })] }).state, 'unknown');
});

test('mixed capture snapshots cannot resurrect consumed or revoked session progress', () => {
  for (const terminal of [session({ used_at: NOW }), session({ revoked_at: NOW }),
    { user_id: 'alice', id: 'session_a', used_at: NOW }]) {
    for (const order of [[session(), terminal], [terminal, session()]]) {
      assert.equal(resolve({ ...captureContext, capture_sessions: order }).state, 'unknown');
    }
  }
  assert.equal(resolve({ ...captureContext, capture_sessions: [session(), session({ user_id: 'bob', used_at: NOW })] }).state, 'capturing');
});

test('invalid context and malformed records fail closed without throwing or returning an open action', () => {
  for (const changed of [{ user_id: '' }, { user_id: null }, { doi: 'not-a-doi' }, { now: NaN }, { now: Infinity }]) {
    assert.equal(resolve({ ...changed, copies: [copy()], probes: [probe(copy())] }).action, 'unavailable');
  }
  assert.equal(resolve({ copies: [null, {}, copy({ state: 'unexpected' })], probes: [null] }).state, 'unknown');
});
