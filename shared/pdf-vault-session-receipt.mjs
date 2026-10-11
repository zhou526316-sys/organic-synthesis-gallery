/**
 * Short-lived, device-local UX hint based only on a completed server session
 * validation. It is NOT a server-issued access grant. PDF bytes and file handles
 * remain account/device scoped, and a remote recheck still follows a cache hit.
 * A session revoked on another device can remain locally known only until the
 * short receipt TTL or the next negative server response.
 */
export const PDF_SESSION_RECEIPT_KEY = 'gallery-pdf-vault-session-receipt-v1';
export const PDF_SESSION_RECEIPT_TTL_MS = 120_000;
const USER = /^[A-Za-z0-9_-]{1,128}$/;
const DIGEST = /^[0-9a-f]{64}$/;

function storage() {
  try { return globalThis.localStorage; } catch { return null; }
}
async function tokenDigest(value) {
  if (typeof value !== 'string' || !value || !globalThis.crypto?.subtle) return '';
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function clearPdfSessionReceipt() {
  try { storage()?.removeItem(PDF_SESSION_RECEIPT_KEY); } catch { /* Optional hint only. */ }
}
export async function recordVerifiedPdfSession(token, userId, { currentToken = null } = {}) {
  if (!USER.test(userId || '') || !token) return false;
  const hash = await tokenDigest(token);
  if (!DIGEST.test(hash)) return false;
  // A response from the old account must never publish a new receipt after
  // logout or an account switch while Web Crypto was pending.
  const readCurrent = currentToken || (() => {
    try { return storage()?.getItem('organic-gallery-session-v1') || ''; } catch { return ''; }
  });
  if (readCurrent() !== token) return false;
  try {
    storage()?.setItem(PDF_SESSION_RECEIPT_KEY, JSON.stringify({
      version: 1, userId, tokenHash: hash, verifiedAt: Date.now(),
    }));
    return true;
  } catch { return false; }
}
export async function readVerifiedPdfSession(token, { now = Date.now() } = {}) {
  if (!token) return null;
  let value;
  try { value = JSON.parse(storage()?.getItem(PDF_SESSION_RECEIPT_KEY) || 'null'); }
  catch { return null; }
  if (!value || value.version !== 1 || !USER.test(value.userId || '') ||
      !DIGEST.test(value.tokenHash || '') || !Number.isSafeInteger(value.verifiedAt) ||
      value.verifiedAt > now || now - value.verifiedAt > PDF_SESSION_RECEIPT_TTL_MS) return null;
  if (await tokenDigest(token) !== value.tokenHash) return null;
  try {
    if (storage()?.getItem('organic-gallery-session-v1') !== token) return null;
  } catch { return null; }
  return { id: value.userId, verifiedAt: value.verifiedAt };
}
