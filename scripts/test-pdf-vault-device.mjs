import test from 'node:test';
import assert from 'node:assert/strict';
import { createPdfVaultDeviceIdentity, isPdfVaultDeviceId, PDF_VAULT_DEVICE_STORAGE_KEY } from '../shared/pdf-vault-device.mjs';

const UUID_A = '01234567-89ab-4cde-8fab-0123456789ab';
const UUID_B = '11234567-89ab-4cde-8fab-0123456789ab';
const DEVICE_A = `pdfdev_${UUID_A.replaceAll('-', '')}`;
const secureRandom = uuid => ({ randomUUID: () => uuid });
function memoryStorage(initial) {
  const values = new Map(initial == null ? [] : [[PDF_VAULT_DEVICE_STORAGE_KEY, initial]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('device identity is a random opaque label that survives a new runtime with readable storage', () => {
  const storage = memoryStorage();
  const first = createPdfVaultDeviceIdentity({ storage, crypto: secureRandom(UUID_A) });
  assert.deepEqual(first(), { device_id: DEVICE_A, persistence: 'persistent' });
  assert.strictEqual(first(), first());
  const reload = createPdfVaultDeviceIdentity({ storage, crypto: secureRandom(UUID_B) });
  assert.equal(reload().device_id, DEVICE_A);
  assert.equal(Object.isFrozen(first()), true);
});

test('separate browser stores obtain separate IDs without account, location or user-agent input', () => {
  const first = createPdfVaultDeviceIdentity({ storage: memoryStorage(), crypto: secureRandom(UUID_A) });
  const second = createPdfVaultDeviceIdentity({ storage: memoryStorage(), crypto: secureRandom(UUID_B) });
  assert.notEqual(first().device_id, second().device_id);
  assert.deepEqual(Object.keys(first()).sort(), ['device_id', 'persistence']);
  assert.equal(isPdfVaultDeviceId(first().device_id), true);
});

test('blocked storage reads produce a stable session ID and never attempt an unverified persistent write', () => {
  let writes = 0;
  let randomCalls = 0;
  const get = createPdfVaultDeviceIdentity({ storage: {
    getItem() { throw new Error('SecurityError'); }, setItem() { writes++; },
  }, crypto: { randomUUID() { randomCalls++; return UUID_A; } } });
  assert.deepEqual(get(), { device_id: DEVICE_A, persistence: 'session' });
  assert.strictEqual(get(), get());
  assert.equal(randomCalls, 1);
  assert.equal(writes, 0);
});

test('quota failure and silently dropped storage writes remain explicitly session-only', () => {
  for (const storage of [
    { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } },
    { getItem: () => null, setItem() {} },
    null,
  ]) {
    const get = createPdfVaultDeviceIdentity({ storage, crypto: secureRandom(UUID_A) });
    assert.deepEqual(get(), { device_id: DEVICE_A, persistence: 'session' });
    assert.strictEqual(get(), get());
  }
});

test('storage readback exceptions preserve the generated ID without promising persistence', () => {
  let reads = 0;
  const get = createPdfVaultDeviceIdentity({ storage: {
    getItem() { if (++reads > 1) throw new Error('Storage revoked'); return null; }, setItem() {},
  }, crypto: secureRandom(UUID_A) });
  assert.deepEqual(get(), { device_id: DEVICE_A, persistence: 'session' });
  assert.equal(get().device_id, DEVICE_A);
});

test('stored paths, malformed IDs and arbitrary values are replaced using secure randomness', () => {
  for (const previous of ['C:\\Users\\alice', 'pdfdev_not_random', '', '{}', 'pdfdev_' + 'a'.repeat(33)]) {
    const storage = memoryStorage(previous);
    assert.equal(createPdfVaultDeviceIdentity({ storage, crypto: secureRandom(UUID_A) })().device_id, DEVICE_A);
  }
});

test('Web Crypto getRandomValues is the fallback when randomUUID throws', () => {
  const get = createPdfVaultDeviceIdentity({ storage: null, crypto: {
    randomUUID() { throw new Error('unsupported'); },
    getRandomValues(bytes) { for (let i = 0; i < bytes.length; i++) bytes[i] = i; return bytes; },
  } });
  assert.deepEqual(get(), { device_id: 'pdfdev_000102030405060708090a0b0c0d0e0f', persistence: 'session' });
});

test('without secure randomness and an existing valid ID, identity is stably unavailable', () => {
  for (const crypto of [null, {}, { randomUUID() { throw new Error('blocked'); }, getRandomValues() { throw new Error('blocked'); } }]) {
    const get = createPdfVaultDeviceIdentity({ storage: memoryStorage(), crypto });
    assert.deepEqual(get(), { device_id: null, persistence: 'unavailable' });
    assert.strictEqual(get(), get());
  }
  const stored = createPdfVaultDeviceIdentity({ storage: memoryStorage(DEVICE_A), crypto: null });
  assert.deepEqual(stored(), { device_id: DEVICE_A, persistence: 'persistent' });
});
