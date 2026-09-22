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
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('image_storage_failed'));
      tx.onerror = () => reject(tx.error || new Error('image_storage_failed'));
      tx.objectStore(STORE_NAME).put(blob, id);
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
        const blob = request.result;
        resolve(blob instanceof Blob && TYPES.has(blob.type) && blob.size <= MAX_STATUS_IMAGE_BYTES ? blob : null);
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
  if (event.persisted) return; // Keep URLs alive when this document enters bfcache.
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls.clear();
  urlCache.clear();
});

export function refreshOriginal(id: string): void { urlCache.delete(id); }
