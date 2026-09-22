import { MAX_STATUS_IMAGE_BYTES, STATUS_IMAGE_TYPES as TYPES } from './status-image-types';
const DB_NAME = 'organic-gallery-status-images-v1';
const STORE_NAME = 'originals';
const ID_PATTERN = /^[a-f0-9]{64}$/;
const urlCache = new Map<string, Promise<string | null>>();
const objectUrls = new Set<string>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    let settled = false;
    const timer = window.setTimeout(() => { settled = true; reject(new Error('image_storage_unavailable')); }, 8000);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      window.clearTimeout(timer);
      if (settled) { request.result.close(); return; }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => { window.clearTimeout(timer); settled = true; reject(request.error || new Error('image_storage_unavailable')); };
    request.onblocked = () => { window.clearTimeout(timer); settled = true; reject(new Error('image_storage_unavailable')); };
  });
}

export async function writeOriginal(id: string, blob: Blob): Promise<void> {
  // WebKit ephemeral sessions can reject IndexedDB Blob/File values. A plain
  // ArrayBuffer preserves identical bytes without requiring a temporary file.
  // Read bytes before starting the transaction; never await inside an active tx.
  const bytes = await blob.arrayBuffer();
  if (!ID_PATTERN.test(id) || !TYPES.has(blob.type) || !bytes.byteLength || bytes.byteLength > MAX_STATUS_IMAGE_BYTES) throw new Error('image_storage_failed');
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const timer = window.setTimeout(() => { try { tx.abort(); } catch {} reject(new Error('image_storage_unavailable')); }, 15000);
      tx.oncomplete = () => { window.clearTimeout(timer); resolve(); };
      tx.onabort = () => { window.clearTimeout(timer); reject(tx.error || new Error('image_storage_failed')); };
      const request = tx.objectStore(STORE_NAME).put({ bytes, type: blob.type }, id);
      request.onerror = () => { window.clearTimeout(timer); reject(request.error || new Error('image_storage_failed')); };
    });
  } finally { db.close(); }
}

async function readOriginal(id: string): Promise<Blob | null> {
  const db = await openDatabase();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      tx.onabort = () => reject(tx.error || new Error('image_storage_failed'));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const value = request.result;
        if (value instanceof Blob) {
          resolve(TYPES.has(value.type) && value.size <= MAX_STATUS_IMAGE_BYTES ? value : null);
          return;
        }
        resolve(value?.bytes instanceof ArrayBuffer && TYPES.has(value.type) && value.bytes.byteLength > 0 && value.bytes.byteLength <= MAX_STATUS_IMAGE_BYTES
          ? new Blob([value.bytes], { type: value.type }) : null);
      };
    });
  } finally { db.close(); }
}

export function originalUrl(id: string): Promise<string | null> {
  if (!ID_PATTERN.test(id)) return Promise.resolve(null);
  let pending = urlCache.get(id);
  if (!pending) {
    pending = readOriginal(id).then(blob => {
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      objectUrls.add(url);
      return url;
    }).catch(() => null);
    urlCache.set(id, pending);
  }
  return pending;
}

window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls.clear();
  urlCache.clear();
});

export function refreshOriginal(id: string): void { urlCache.delete(id); }
