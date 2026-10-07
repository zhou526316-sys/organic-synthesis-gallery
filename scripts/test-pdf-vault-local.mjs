import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createLocalPdfVault, LocalPdfVaultError, PDF_VAULT_MAX_BYTES, PDF_VAULT_CARD_DOI_LIMIT, selectLocalPdfProbe } from '../src/pdf-vault/local-vault.mjs';
import { toCopyManifest } from '../shared/pdf-vault-v1.mjs';

// These tests exercise input and session boundaries without substituting an
// in-memory database for real IndexedDB. Browser regression covers durable
// manifests, FileSystemHandles, OPFS, quota/write failures and account isolation.
const doi = '10.1021/jacs.6c01234';
const framedPdf = () => new Blob(['%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'], { type: 'application/pdf' });
function vault(overrides = {}) {
  return createLocalPdfVault({
    userId: 'account_a', deviceId: 'device_a', crypto: webcrypto,
    indexedDB: { open() { throw new Error('database should not be available in this input-boundary test'); } },
    navigator: {}, ...overrides,
  });
}
const rejectsCode = (promise, code) => assert.rejects(promise, error => error instanceof LocalPdfVaultError && error.code === code);

test('controller creation and capability inspection do not open storage or request permission', () => {
  let reads = 0;
  const controller = vault({ indexedDB: { open() { reads += 1; } } });
  const caps = controller.capabilities();
  assert.equal(reads, 0);
  assert.equal(caps.indexedDB, true);
  assert.equal(caps.crypto, true);
  assert.equal(caps.maxBytes, 50 * 1024 * 1024);
  controller.close();
});

test('account and device identifiers reject coercion and filesystem-shaped values', () => {
  for (const userId of [null, 123, {}, '../another-account', 'account/a', '']) {
    assert.throws(() => vault({ userId }), error => error.code === 'invalid_account');
  }
  for (const deviceId of [123, '../device', '']) {
    assert.throws(() => vault({ deviceId }), error => error.code === 'invalid_device');
  }
});

test('an invalid DOI or version is rejected before touching PDF bytes', async () => {
  const file = { size: 100, arrayBuffer() { throw new Error('must not read'); } };
  await rejectsCode(vault().importPdf({ doi: 'https://publisher.example/article', file }), 'invalid_doi');
  await rejectsCode(vault().importPdf({ doi, file, versionKind: 'publisher-login' }), 'invalid_version');
});

test('an oversized PDF is rejected without allocating or hashing its contents', async () => {
  let reads = 0;
  const file = { size: PDF_VAULT_MAX_BYTES + 1, arrayBuffer() { reads += 1; } };
  await rejectsCode(vault().importPdf({ doi, file }), 'pdf_too_large');
  assert.equal(reads, 0);
});

test('empty files and HTML responses do not become PDFs through their MIME type or name', async () => {
  for (const file of [new Blob([]), new Blob(['<!doctype html><html>Institution login</html>'], { type: 'application/pdf' })]) {
    await rejectsCode(vault().importPdf({ doi, file }), 'invalid_pdf');
  }
});

test('PDF framing requires both header and final EOF and rejects trailing non-whitespace', async () => {
  for (const body of ['%PDF-1.7\ntruncated body', 'prefix%PDF-1.7\n%%EOF', '%PDF-1.7\nbody\n%%EOF<script>']) {
    await rejectsCode(vault().importPdf({ doi, file: new Blob([body]) }), 'invalid_pdf');
  }
});

test('a changed file size during read cannot proceed to persistence', async () => {
  const file = { size: 80, arrayBuffer: async () => new TextEncoder().encode('%PDF-1.7\n%%EOF\n').buffer };
  await rejectsCode(vault().importPdf({ doi, file }), 'invalid_pdf');
});

test('accepted framing still needs durable storage and never returns a saved result without it', async () => {
  await rejectsCode(vault().importPdf({ doi, file: framedPdf() }), 'storage_unavailable');
});

test('cryptographic failure has no weak hash or random fallback', async () => {
  await rejectsCode(vault({ crypto: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } })
    .importPdf({ doi, file: framedPdf() }), 'crypto_unavailable');
});

test('directory picker is invoked synchronously before any IndexedDB work', async () => {
  const calls = [];
  const controller = vault({
    indexedDB: { open() { calls.push('database'); throw new Error('blocked'); } },
    showDirectoryPicker() { calls.push('picker'); return Promise.reject(new DOMException('cancelled', 'AbortError')); },
  });
  const pending = controller.selectDirectory();
  assert.deepEqual(calls, ['picker']);
  await rejectsCode(pending, 'operation_cancelled');
  assert.deepEqual(calls, ['picker']);
});

test('permission denial does not create a namespace or a saved destination', async () => {
  let touched = false;
  const controller = vault({ showDirectoryPicker: async () => ({
    queryPermission: async () => 'denied',
    getDirectoryHandle() { touched = true; throw new Error('must not create'); },
  }) });
  await rejectsCode(controller.selectDirectory(), 'permission_required');
  assert.equal(touched, false);
});

test('a session change while the picker is open prevents all destination work', async () => {
  let resolvePicker;
  let touched = false;
  let current = true;
  const controller = vault({
    assertCurrent: () => current,
    showDirectoryPicker: () => new Promise(resolve => { resolvePicker = resolve; }),
  });
  const pending = controller.selectDirectory();
  current = false;
  resolvePicker({ queryPermission() { touched = true; return Promise.resolve('granted'); } });
  await rejectsCode(pending, 'account_changed');
  assert.equal(touched, false);
});

test('a session change during a PDF read prevents hash or manifest work', async () => {
  let resolveRead;
  let hashes = 0;
  let current = true;
  const bytes = await framedPdf().arrayBuffer();
  const controller = vault({
    assertCurrent: () => current,
    crypto: {
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
      subtle: { digest() { hashes += 1; throw new Error('must not hash'); } },
    },
  });
  const pending = controller.importPdf({ doi, file: { size: bytes.byteLength, arrayBuffer: () => new Promise(resolve => { resolveRead = resolve; }) } });
  current = false;
  resolveRead(bytes);
  await rejectsCode(pending, 'account_changed');
  assert.equal(hashes, 0);
});

test('closing a controller fences later reads, imports and permission prompts', async () => {
  let prompts = 0;
  const controller = vault({ showDirectoryPicker: () => { prompts += 1; } });
  controller.close();
  controller.close();
  await rejectsCode(controller.listCopies(), 'account_changed');
  await rejectsCode(controller.getDestination(), 'account_changed');
  await rejectsCode(controller.importPdf({ doi, file: framedPdf() }), 'account_changed');
  await rejectsCode(controller.restorePermission(), 'account_changed');
  assert.throws(() => controller.selectDirectory(), error => error.code === 'account_changed');
  assert.equal(prompts, 0);
});

test('platform errors exposed to UI do not retain filenames or local directory paths', async () => {
  const controller = vault({ showDirectoryPicker: () => Promise.reject(new DOMException('C:/Users/A/private-library/file.pdf', 'NotAllowedError')) });
  await assert.rejects(controller.selectDirectory(), error => error.code === 'permission_required' && !error.message.includes('private-library'));
});

function copyRecord(overrides = {}) {
  return {
    id: 'copy_a', user_id: 'account_a', doi,
    storage_kind: 'local_folder', device_id: 'device_a', provider: null, provider_ref: null,
    content_hash: 'a'.repeat(64), byte_length: 512, version_kind: 'publisher', state: 'available',
    acquired_at: 100, last_verified_at: 100, created_at: 100, updated_at: 100,
    ...overrides,
  };
}
function probeRecord(overrides = {}) {
  return {
    user_id: 'account_a', doi, copy_id: 'copy_a', content_hash: 'a'.repeat(64),
    device_id: 'device_a', status: 'readable', checked_at: 100_000,
    ...overrides,
  };
}
const probeContext = { userId: 'account_a', deviceId: 'device_a', now: 100_000 };

test('legacy available rows and recent last_verified_at are not actual local receipts', () => {
  assert.equal(selectLocalPdfProbe(copyRecord({ last_verified_at: 100_000 }), [], probeContext), null);
  assert.equal(selectLocalPdfProbe(copyRecord(), [null, { last_verified_at: 100_000 }], probeContext), null);
});

test('a local probe is scoped to the exact account DOI copy hash and device', () => {
  const copy = copyRecord(), good = probeRecord();
  assert.deepEqual(selectLocalPdfProbe(copy, [good], probeContext), good);
  for (const mutation of [
    { user_id: 'account_b' }, { doi: '10.1021/jacs.6c99999' }, { copy_id: 'copy_b' },
    { content_hash: 'b'.repeat(64) }, { device_id: 'device_b' },
  ]) assert.equal(selectLocalPdfProbe(copy, [{ ...good, ...mutation }], probeContext), null);
  assert.equal(selectLocalPdfProbe(copy, [good], { ...probeContext, userId: 'account_b' }), null);
  assert.equal(selectLocalPdfProbe(copy, [good], { ...probeContext, deviceId: 'device_b' }), null);
});

test('local probes reject future, expired, malformed and invented statuses', () => {
  for (const mutation of [
    { checked_at: 100_001 }, { checked_at: 39_999 }, { checked_at: 99_999.5 },
    { checked_at: '100000' }, { checked_at: -1 }, { status: 'verified_by_server' },
  ]) assert.equal(selectLocalPdfProbe(copyRecord(), [probeRecord(mutation)], probeContext), null);
  assert.ok(selectLocalPdfProbe(copyRecord(), [probeRecord({ checked_at: 40_000 })], probeContext));
});

test('a later denial and simultaneous conflicting observations win over an old positive', () => {
  const older = probeRecord({ checked_at: 99_000 });
  const negative = probeRecord({ status: 'permission_required' });
  assert.equal(selectLocalPdfProbe(copyRecord(), [older, negative], probeContext).status, 'permission_required');
  assert.equal(selectLocalPdfProbe(copyRecord(), [negative, older], probeContext).status, 'permission_required');
  assert.equal(selectLocalPdfProbe(copyRecord(), [probeRecord(), negative], probeContext).status, 'permission_required');
  assert.equal(selectLocalPdfProbe(copyRecord(), [negative, probeRecord()], probeContext).status, 'permission_required');
});

test('a newer actual successful receipt can supersede an earlier denial', () => {
  const earlierDenial = probeRecord({ status: 'missing', checked_at: 99_000 });
  assert.equal(selectLocalPdfProbe(copyRecord(), [earlierDenial, probeRecord()], probeContext).status, 'readable');
});

test('a persistence-failure fence only withdraws old positives and cannot create readability', () => {
  const copy = copyRecord();
  assert.equal(selectLocalPdfProbe(copy, [probeRecord({ checked_at: 99_000 })], { ...probeContext, denyBefore: 99_000 }), null);
  assert.equal(selectLocalPdfProbe(copy, [probeRecord()], { ...probeContext, denyBefore: 99_000 }).status, 'readable');
  assert.equal(selectLocalPdfProbe(copy, [], { ...probeContext, denyBefore: 99_000 }), null);
  assert.equal(selectLocalPdfProbe(copy, [probeRecord()], { ...probeContext, denyBefore: Infinity }), null);
  assert.equal(selectLocalPdfProbe(copy, [probeRecord({ status: 'unavailable' })], { ...probeContext, denyBefore: Infinity }).status, 'unavailable');
});

test('missing, terminal and malformed copy records never supply positive readability', () => {
  for (const state of ['missing', 'pending', 'deleted', 'revoked']) {
    assert.equal(selectLocalPdfProbe(copyRecord({ state }), [probeRecord()], probeContext), null);
  }
  assert.equal(selectLocalPdfProbe(copyRecord({ byte_length: -1 }), [probeRecord()], probeContext), null);
});

test('probe results and P0 copy manifests omit local bookkeeping and private payloads', () => {
  const probe = probeRecord({ file_name: 'private.pdf', path: 'C:/private', local_revision: 4, opaque: { bytes: 'secret' } });
  assert.deepEqual(selectLocalPdfProbe(copyRecord(), [probe], probeContext), probeRecord());
  const manifest = toCopyManifest(copyRecord({ local_probe: probe, local_revision: 4, directory_handle: {}, file_name: 'private.pdf' }));
  for (const field of ['local_probe', 'local_revision', 'directory_handle', 'file_name']) assert.equal(Object.hasOwn(manifest, field), false);
});

test('empty or invalid visible-DOI batches never open the local database', async () => {
  let opened = 0;
  const controller = vault({ indexedDB: { open() { opened += 1; throw new Error('must not open'); } } });
  assert.deepEqual(await controller.describeCards({ dois: [] }), { copies: [], probes: [] });
  await rejectsCode(controller.describeCards({ dois: Array(PDF_VAULT_CARD_DOI_LIMIT + 1).fill(doi) }), 'invalid_doi_batch');
  await rejectsCode(controller.describeCards({ dois: 'all' }), 'invalid_doi_batch');
  await rejectsCode(controller.describeCards({ dois: ['not-a-doi'] }), 'invalid_doi');
  assert.equal(opened, 0);
});

test('visible-card metadata requests are fenced after controller shutdown', async () => {
  const controller = vault();
  controller.close();
  await rejectsCode(controller.describeCards({ dois: [doi] }), 'account_changed');
});
