const WORKER_ORIGIN = 'https://organic-synthesis-gallery.zhou526316.workers.dev';
const PAGEVIEW_FLAG = '__organicGalleryPageviewV1Sent';

declare global {
  interface Window {
    [PAGEVIEW_FLAG]?: boolean;
  }
}

function currentPath(): string {
  try {
    return location.pathname || '/';
  } catch {
    return '/';
  }
}

function currentReferrer(): string {
  try {
    return document.referrer || '';
  } catch {
    return '';
  }
}

async function sendPageView(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window[PAGEVIEW_FLAG]) return;
  window[PAGEVIEW_FLAG] = true;

  try {
    await fetch(`${WORKER_ORIGIN}/api/user-ui/pageview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        path: currentPath(),
        referrer: currentReferrer(),
      }),
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true,
    });
  } catch {
    // Analytics must never block or degrade the Gallery.
  }
}

void sendPageView();

export {};
