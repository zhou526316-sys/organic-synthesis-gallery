const SESSION_KEY = 'organic-gallery-session-v1';
const SESSION_USER_KEY = 'organic-gallery-session-user-v1';
const CAPABILITY_CACHE_KEY = 'organic-gallery-private-pdf-capability-v1';
const API_BASE = 'https://api.gczhouwld.com';
const READ_CAPABILITY = 'private_pdf_read';
const TOKEN_WATCH_MS = 800;
const CAPABILITY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let ownerReadEnabled = false;
let authorizedToken = '';
let observedToken: string | null = null;
let refreshGeneration = 0;
let refreshPromise: Promise<void> | null = null;
let installed = false;
let capabilitySource = 'none';

function sessionToken(): string {
  try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}

function tokenFingerprint(token: string): string {
  // UI continuity only. This fingerprint is never used as authorization;
  // the Worker still validates the real bearer token and capability on open.
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash = Math.imul(hash ^ token.charCodeAt(index), 16777619);
  }
  return `${token.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function cachedCapabilityMatches(token: string): boolean {
  if (!token) return false;
  try {
    const cached = JSON.parse(localStorage.getItem(CAPABILITY_CACHE_KEY) || 'null') as {
      tokenFingerprint?: string;
      read?: boolean;
      verifiedAt?: number;
    } | null;
    return Boolean(
      cached?.read === true &&
      cached.tokenFingerprint === tokenFingerprint(token) &&
      Number.isFinite(cached.verifiedAt) &&
      Date.now() - Number(cached.verifiedAt) >= 0 &&
      Date.now() - Number(cached.verifiedAt) <= CAPABILITY_CACHE_TTL_MS
    );
  } catch { return false; }
}

function cachedSessionUserClaimsRead(): boolean {
  try {
    const cached = JSON.parse(localStorage.getItem(SESSION_USER_KEY) || 'null') as { capabilities?: string[] } | null;
    return Array.isArray(cached?.capabilities) && cached.capabilities.includes(READ_CAPABILITY);
  } catch { return false; }
}

function savePositiveCapability(token: string): void {
  try {
    localStorage.setItem(CAPABILITY_CACHE_KEY, JSON.stringify({
      tokenFingerprint: tokenFingerprint(token),
      read: true,
      verifiedAt: Date.now(),
    }));
  } catch { /* optional continuity cache */ }
}

function clearCapabilityCache(): void {
  try { localStorage.removeItem(CAPABILITY_CACHE_KEY); } catch { /* optional continuity cache */ }
}

function publishCapabilityState(): void {
  document.documentElement.dataset.privatePdfRead = ownerReadEnabled ? 'true' : 'false';
  document.documentElement.dataset.privatePdfReadSource = capabilitySource;
  window.dispatchEvent(new CustomEvent('gallery-private-pdf-capability', {
    detail: { read: ownerReadEnabled, source: capabilitySource },
  }));
}

function grantLocalCapability(token: string, source: string): void {
  ownerReadEnabled = true;
  authorizedToken = token;
  capabilitySource = source;
  publishCapabilityState();
}

function revokeLocalCapability(source = 'none'): void {
  ownerReadEnabled = false;
  authorizedToken = '';
  capabilitySource = source;
  publishCapabilityState();
}

async function refreshCapability(token: string, generation: number): Promise<void> {
  if (!token) return;
  try {
    const response = await fetch(API_BASE + '/api/user-ui/auth/session', {
      headers: { authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    // Network/edge failures are not evidence that a previously verified owner
    // lost permission. Keep the last verified UI state and retry later.
    if (!response.ok) return;
    const data = await response.json() as { authenticated?: boolean; user?: { capabilities?: string[] } | null };
    if (generation !== refreshGeneration || token !== sessionToken()) return;
    const allowed = Boolean(data.authenticated && data.user?.capabilities?.includes(READ_CAPABILITY));
    if (allowed) {
      savePositiveCapability(token);
      grantLocalCapability(token, 'server');
      return;
    }
    clearCapabilityCache();
    revokeLocalCapability('server-denied');
  } catch {
    // A transport timeout must not erase a positive owner entitlement from the
    // current browser. The server remains authoritative when the PDF is opened.
  }
}

function refreshSoon(): void {
  const token = sessionToken();
  const previousToken = observedToken;
  if (token === observedToken && refreshPromise) return;
  observedToken = token;
  const generation = ++refreshGeneration;

  if (!token) {
    clearCapabilityCache();
    revokeLocalCapability('signed-out');
    refreshPromise = null;
    return;
  }

  const tokenChanged = previousToken !== null && previousToken !== token;
  if (tokenChanged) {
    // Account switches must hide owner-only controls synchronously. Never reuse
    // another token's cached entitlement.
    clearCapabilityCache();
    revokeLocalCapability('token-changed');
  } else if (!ownerReadEnabled) {
    if (cachedCapabilityMatches(token)) grantLocalCapability(token, 'verified-cache');
    else if (previousToken === null && cachedSessionUserClaimsRead()) {
      // Bootstrap from the account shell's last verified user on page restore.
      // This only controls visibility; /private-pdf/open still checks the live
      // bearer session and server-side private_pdf_read capability.
      grantLocalCapability(token, 'session-cache');
    } else {
      // Preserve an explicit unresolved=false state for race protection and
      // tests, without revoking a previously verified positive entitlement.
      capabilitySource = 'checking';
      publishCapabilityState();
    }
  }

  refreshPromise = refreshCapability(token, generation).finally(() => {
    if (generation === refreshGeneration) refreshPromise = null;
    if (sessionToken() !== observedToken) refreshSoon();
  });
}

function guardPdfNavigation(event: MouseEvent): void {
  const anchor = event.composedPath().find(item =>
    item instanceof HTMLAnchorElement && item.matches(
      'a.private-pdf-button, a.private-pdf-download-button, a.private-pdf-compat-button'));
  if (!anchor) return;
  if (ownerReadEnabled && authorizedToken && authorizedToken === sessionToken()) return;
  event.preventDefault();
  refreshSoon();
}

// Keep the existing bootstrap export while the entry moves from interception of
// the publisher link to a separate, stable PDF link in each rendered card.
export function installPrivatePdfOriginalRouting(): void {
  if (installed) return;
  installed = true;
  refreshSoon();
  document.addEventListener('click', guardPdfNavigation, true);
  document.addEventListener('auxclick', guardPdfNavigation, true);
  window.addEventListener('storage', event => {
    if (event.key === SESSION_KEY || event.key === SESSION_USER_KEY || event.key === CAPABILITY_CACHE_KEY || event.key === null) refreshSoon();
  });
  window.addEventListener('gallery-auth-session-changed', refreshSoon as EventListener);
  // Native storage events cover other tabs; this also catches same-tab token
  // writers which do not yet publish the explicit auth-session event.
  window.setInterval(() => {
    if (sessionToken() !== observedToken) refreshSoon();
  }, TOKEN_WATCH_MS);
}
