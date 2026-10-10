import {TENCENT_PDF_ORIGIN} from './pdf-tencent-file-failover.mjs';

// This is only a route-preference decision, never a PDF entitlement.
// The Tencent relay forwards to the canonical Worker, which validates every
// session, READ capability, DOI and ticket on each request.
const OWNER_ROLE = 'private_pdf_owner';
const READER_ROLE = 'private_pdf_read';
const SESSION_URL = TENCENT_PDF_ORIGIN + '/api/user-ui/auth/session';
export const OWNER_ROLE_CHECK_TIMEOUT_MS = 4000;

export function cachedOwnerHint(raw) {
  try {
    const user = JSON.parse(String(raw || 'null'));
    // A cached negative can skip this optional Tencent preference entirely.
    // A positive is never trusted without a fresh live-server check.
    return user && Array.isArray(user.capabilities) &&
      user.capabilities.includes(OWNER_ROLE) ? true : false;
  } catch { return false; }
}

export async function liveOwnerTencentPriority(sessionToken, fetcher = fetch,
  timeoutMs = OWNER_ROLE_CHECK_TIMEOUT_MS) {
  if (typeof sessionToken !== 'string' || !sessionToken ||
      sessionToken.length > 1024) return false;
  try {
    const response = await fetcher(SESSION_URL, {
      method: 'GET',
      headers: {authorization: 'Bearer ' + sessionToken},
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(Math.max(500, Math.min(5000,timeoutMs))),
    });
    if (!response || response.status !== 200 || response.ok !== true) return false;
    const data = await response.json();
    const roles = data?.user?.capabilities;
    return data?.authenticated === true && Array.isArray(roles) &&
      roles.includes(OWNER_ROLE) && roles.includes(READER_ROLE);
  } catch { return false; }
}
