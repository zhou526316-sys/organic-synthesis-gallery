const SESSION_KEY = 'organic-gallery-session-v1';
const API_BASE = 'https://api.gczhouwld.com';
const READ_CAPABILITY = 'private_pdf_read';
const TOKEN_WATCH_MS = 800;

let ownerReadEnabled = false;
let authorizedToken = '';
let observedToken: string | null = null;
let refreshGeneration = 0;
let refreshPromise: Promise<void> | null = null;
let installed = false;

function sessionToken(): string {
  try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}

function publishCapabilityState(): void {
  document.documentElement.dataset.privatePdfRead = ownerReadEnabled ? 'true' : 'false';
  window.dispatchEvent(new CustomEvent('gallery-private-pdf-capability', { detail: { read: ownerReadEnabled } }));
}

function revokeLocalCapability(): void {
  ownerReadEnabled = false;
  authorizedToken = '';
  publishCapabilityState();
}

async function refreshCapability(token: string, generation: number): Promise<void> {
  if (!token) return;
  let allowed = false;
  try {
    const response = await fetch(API_BASE + '/api/user-ui/auth/session', {
      headers: { authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const data = await response.json() as { authenticated?: boolean; user?: { capabilities?: string[] } | null };
      allowed = Boolean(data.authenticated && data.user?.capabilities?.includes(READ_CAPABILITY));
    }
  } catch { /* Permission stays revoked until a successful session check. */ }
  if (generation !== refreshGeneration) return;
  if (token !== sessionToken()) {
    refreshSoon();
    return;
  }
  ownerReadEnabled = allowed;
  authorizedToken = allowed ? token : '';
  publishCapabilityState();
}

function refreshSoon(): void {
  const token = sessionToken();
  if (token === observedToken && refreshPromise) return;
  observedToken = token;
  const generation = ++refreshGeneration;
  // Hide every card's PDF entry synchronously before requesting the new account.
  revokeLocalCapability();
  refreshPromise = refreshCapability(token, generation).finally(() => {
    if (generation === refreshGeneration) refreshPromise = null;
    if (sessionToken() !== observedToken) refreshSoon();
  });
}

function guardPdfNavigation(event: MouseEvent): void {
  const anchor = event.composedPath().find(item =>
    item instanceof HTMLAnchorElement && item.matches('a.private-pdf-button'));
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
    if (event.key === SESSION_KEY || event.key === null) refreshSoon();
  });
  window.addEventListener('gallery-auth-session-changed', refreshSoon as EventListener);
  // Native storage events cover other tabs; this also catches same-tab token
  // writers which do not yet publish the explicit auth-session event.
  window.setInterval(() => {
    if (sessionToken() !== observedToken) refreshSoon();
  }, TOKEN_WATCH_MS);
}
