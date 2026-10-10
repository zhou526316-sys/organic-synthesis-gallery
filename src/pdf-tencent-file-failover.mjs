/**
 * Tencent private-PDF file failover contract.
 *
 * The public Gallery manifest is an activation gate, NEVER an entitlement.
 * Each selected origin still mints its own ticket via the canonical Worker.
 * No signed file URL or bearer credential may be reused across hosts.
 */
export const TENCENT_PDF_ORIGIN = 'https://pdf.gczhouwld.com';
export const CANONICAL_PDF_ORIGIN = 'https://api.gczhouwld.com';
export const BACKUP_PDF_ORIGIN = 'https://organic-synthesis-gallery.zhou526316.workers.dev';
const ROUTING_MANIFEST = '/pdf-gateway-routing.json';
const SHA256 = /^[a-f0-9]{64}$/;

/**
 * Fail closed when the signed-in site's routing configuration is absent,
 * malformed, slow, redirected or not explicitly enabled for exactly our host.
 * This function never sends a session token, DOI or PDF URL.
 */
export async function tencentPdfRouteEnabled(fetcher = fetch, timeoutMs = 1200, {manual = false} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('manifest_timeout'),
    Math.min(5000, Math.max(200, Number(timeoutMs) || 1200)));
  try {
    const response = await fetcher(ROUTING_MANIFEST, {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
      redirect: 'error', signal: controller.signal,
    });
    if (response.status !== 200 || !response.ok) return false;
    const config = await response.json();
    return config !== null && typeof config === 'object' && !Array.isArray(config) &&
      config.schemaVersion === 1 && config.origin === TENCENT_PDF_ORIGIN &&
      (config.enabled === true || (manual === true && config.manualCanary === true));
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** Preserve the original two-Worker fallback when Tencent is not activated. */
export function nextOwnerPdfFileOrigin(activeOrigin, tencentEnabled = false) {
  if (tencentEnabled === true &&
      (activeOrigin === CANONICAL_PDF_ORIGIN || activeOrigin === BACKUP_PDF_ORIGIN))
    return TENCENT_PDF_ORIGIN;
  if (activeOrigin === CANONICAL_PDF_ORIGIN) return BACKUP_PDF_ORIGIN;
  if (activeOrigin === BACKUP_PDF_ORIGIN || activeOrigin === TENCENT_PDF_ORIGIN)
    return CANONICAL_PDF_ORIGIN;
  return '';
}

/** Both R2 identity AND the ticket's own host are required before splicing. */
export function isMatchingOwnerPdfFileSource(source, origin, expectedHash, byteLength) {
  if (!source || typeof source !== 'object' || source.headerVerified !== true ||
      !SHA256.test(String(expectedHash || '')) ||
      source.contentHash !== expectedHash ||
      !Number.isSafeInteger(byteLength) || byteLength < 16 ||
      source.byteLength !== byteLength)
    return false;
  try {
    const url = new URL(source.url);
    if (url.origin !== origin || url.pathname !== '/api/user-ui/private-pdf/file' ||
        url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
    const names = [...url.searchParams.keys()];
    return names.length === 1 && names[0] === 'token' &&
      Boolean(url.searchParams.get('token'));
  } catch {
    return false;
  }
}

/** Explicit routes only, never expose signed URLs in telemetry. */
export function ownerPdfRouteLabel(origin) {
  return origin === TENCENT_PDF_ORIGIN ? 'tencent' :
    origin === CANONICAL_PDF_ORIGIN ? 'primary' :
    origin === BACKUP_PDF_ORIGIN ? 'backup' : 'unknown';
}
