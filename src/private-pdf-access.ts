const SESSION_KEY = 'organic-gallery-session-v1';
const API_BASE = 'https://api.gczhouwld.com';
const READ_CAPABILITY = 'private_pdf_read';

let ownerReadEnabled = false;
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

function installClickRouting(): void {
  document.addEventListener('click', event => {
    if (!ownerReadEnabled || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = anchorFromEvent(event);
    if (!anchor) return;
    const doi = doiForAnchor(anchor);
    const fallback = anchor.href;
    const token = sessionToken();
    if (!doi || !fallback || !token) return;

    event.preventDefault();
    const viewer = new URL('/pdf/', window.location.origin);
    viewer.searchParams.set('doi', doi);
    viewer.searchParams.set('fallback', fallback);
    if (anchor.target === '_blank') {
      const opened = window.open(viewer.toString(), '_blank', 'noopener');
      if (!opened) window.location.href = viewer.toString();
    } else window.location.href = viewer.toString();
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
