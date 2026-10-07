import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createLocalPdfVault, LocalPdfVaultError, PDF_VAULT_MAX_BYTES } from '../src/pdf-vault/local-vault.mjs';

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
