const SESSION_KEY = 'organic-gallery-session-v1';
const API_BASE = 'https://api.gczhouwld.com';
const READ_CAPABILITY = 'private_pdf_read';

let ownerReadEnabled = false;
let capabilityResolved = false;
let refreshPromise: Promise<void> | null = null;

function sessionToken(): string {
  try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}

function publishCapabilityState(): void {
  window.dispatchEvent(new CustomEvent('gallery-private-pdf-capability', { detail: { read: ownerReadEnabled } }));
}

async function refreshCapability(): Promise<void> {
  const token = sessionToken();
  if (!token) {
    ownerReadEnabled = false;
    capabilityResolved = true;
    publishCapabilityState();
    return;
  }
  try {
    const response = await fetch(API_BASE + '/api/user-ui/auth/session', {
      headers: { authorization: 'Bearer ' + token },
      cache: 'no-store',
    });
    if (!response.ok) {
      ownerReadEnabled = false;
    } else {
      const data = await response.json() as { authenticated?: boolean; user?: { capabilities?: string[] } | null };
      ownerReadEnabled = Boolean(data.authenticated && data.user?.capabilities?.includes(READ_CAPABILITY));
    }
  } catch {
    ownerReadEnabled = false;
  }
  capabilityResolved = true;
  publishCapabilityState();
}

function refreshSoon(): void {
  if (refreshPromise) return;
  refreshPromise = refreshCapability().finally(() => { refreshPromise = null; });
}

function anchorFromEvent(event: MouseEvent): HTMLAnchorElement | null {
  for (const item of event.composedPath()) {
    if (item instanceof HTMLAnchorElement && item.matches('a.open')) return item;
  }
  return null;
}

function doiForAnchor(anchor: HTMLAnchorElement): string {
  const card = anchor.closest<HTMLElement>('.card');
  return (card?.dataset.doi || '').trim().toLowerCase();
}

async function resolvePrivatePdf(doi: string, token: string): Promise<string | null> {
  const url = new URL('/api/user-ui/private-pdf/open', API_BASE);
  url.searchParams.set('doi', doi);
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const data = await response.json() as { available?: boolean; url?: string };
  return data.available && typeof data.url === 'string' ? data.url : null;
}

function installClickRouting(): void {
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Do not lose an owner click merely because the asynchronous capability
    // refresh has not finished yet. If capability is already known false, keep
    // ordinary users on the publisher path with no private lookup.
    if (capabilityResolved && !ownerReadEnabled) return;
    const anchor = anchorFromEvent(event);
    if (!anchor) return;
    const doi = doiForAnchor(anchor);
    const fallback = anchor.href;
    const token = sessionToken();
    if (!doi || !fallback || !token) return;

    event.preventDefault();
    const newTab = anchor.target === '_blank';
    // Keep a WindowProxy so the asynchronous entitlement lookup can reuse the
    // user-initiated popup. Setting noopener in window.open may deliberately
    // return null in some browsers, leaving an orphan about:blank tab.
    const target = newTab ? window.open('about:blank', '_blank') : window;
    if (!target) {
      window.location.href = fallback;
      return;
    }
    if (newTab) {
      try { target.opener = null; } catch { /* optional hardening */ }
    }

    void resolvePrivatePdf(doi, token)
      .then(privateUrl => {
        try { target.location.replace(privateUrl || fallback); }
        catch { if (!newTab) window.location.href = fallback; }
      })
      .catch(() => {
        try { target.location.replace(fallback); }
        catch { if (!newTab) window.location.href = fallback; }
      });
  }, false);
}

export function installPrivatePdfOriginalRouting(): void {
  refreshSoon();
  installClickRouting();
  window.addEventListener('storage', event => {
    if (event.key === SESSION_KEY) refreshSoon();
  });
  window.addEventListener('gallery-auth-session-changed', refreshSoon as EventListener);
}
