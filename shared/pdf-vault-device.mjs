/** Browser-installation label only. It is not a device fingerprint or an access
 * credential. Clearing browser data can remove it. It never proves file access. */
export const PDF_VAULT_DEVICE_STORAGE_KEY = 'gallery.pdf_vault.device.v1';
const DEVICE_ID = /^pdfdev_[0-9a-f]{32}$/;

export function isPdfVaultDeviceId(value) {
  return typeof value === 'string' && DEVICE_ID.test(value);
}

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function defaultCrypto() {
  try { return globalThis.crypto ?? null; } catch { return null; }
}

function randomId(crypto) {
  if (!crypto) return null;
  try {
    if (typeof crypto.randomUUID === 'function') {
      const uuid = crypto.randomUUID();
      const candidate = typeof uuid === 'string' ? `pdfdev_${uuid.replaceAll('-', '').toLowerCase()}` : null;
      if (isPdfVaultDeviceId(candidate)) return candidate;
    }
  } catch { /* Try Web Crypto's other secure random API. */ }
  try {
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return `pdfdev_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    }
  } catch { /* No secure identity can be created. */ }
  return null;
}

/**
 * Lazy resolver with an identity stable for its entire page/runtime lifetime.
 * If storage read/write/readback fails, a cryptographically random session ID
 * is retained in memory and is explicitly labelled non-persistent. There is no
 * Math.random, clock, user agent, account ID or filesystem-path fallback.
 * Reuse the same resolver in an app; recreating one cannot promise persistence.
 * The optional adapters make all storage-failure behavior testable without DOM.
 */
export function createPdfVaultDeviceIdentity(options = {}) {
  let resolved;
  return function getIdentity() {
    if (resolved) return resolved;
    const storage = Object.hasOwn(options, 'storage') ? options.storage : defaultStorage();
    const crypto = Object.hasOwn(options, 'crypto') ? options.crypto : defaultCrypto();
    let storageReadable = false;
    try {
      if (storage && typeof storage.getItem === 'function') {
        const existing = storage.getItem(PDF_VAULT_DEVICE_STORAGE_KEY);
        storageReadable = true;
        if (isPdfVaultDeviceId(existing)) {
          resolved = Object.freeze({ device_id: existing, persistence: 'persistent' });
          return resolved;
        }
      }
    } catch { /* A blocked read is not an empty persistent store. */ }
    const device_id = randomId(crypto);
    if (!device_id) {
      resolved = Object.freeze({ device_id: null, persistence: 'unavailable' });
      return resolved;
    }
    let persistent = false;
    if (storageReadable) {
      try {
        if (typeof storage.setItem === 'function') {
          storage.setItem(PDF_VAULT_DEVICE_STORAGE_KEY, device_id);
          persistent = storage.getItem(PDF_VAULT_DEVICE_STORAGE_KEY) === device_id;
        }
      } catch { /* Quota, disabled storage or a failed readback keeps session-only ID. */ }
    }
    resolved = Object.freeze({ device_id, persistence: persistent ? 'persistent' : 'session' });
    return resolved;
  };
}

const currentDeviceIdentity = createPdfVaultDeviceIdentity();

export function getPdfVaultDeviceIdentity() {
  return currentDeviceIdentity();
}
