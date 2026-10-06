import { installGalleryPerformanceRuntime } from './performance-runtime';
import { validChineseTitle } from '../shared/chinese-title-overrides.js';

const ZH_CACHE_KEY = 'organic-gallery-zh-title-cache-v2';
const restoreLegacyMediaListeners = installGalleryPerformanceRuntime();

async function preloadChineseTitleCache(): Promise<void> {
  try {
    const response = await fetch(new URL('./title-translations-zh.json', document.baseURI), { cache: 'default' });
    if (!response.ok) return;
    const payload = await response.json() as { translations?: Array<{ title?: unknown; zh?: unknown }> };
    const cached = JSON.parse(localStorage.getItem(ZH_CACHE_KEY) || '{}') as Record<string, unknown>;
    for (const item of payload.translations || []) {
      if (typeof item.title !== 'string' || typeof item.zh !== 'string') continue;
      const title = item.title.trim();
      const zh = item.zh.trim();
      if (title && validChineseTitle(zh)) cached[title] = zh;
    }
    localStorage.setItem(ZH_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Translation preload is an optimization; the main app still has its normal fallback path.
  }
}

function firstContentReady(): Promise<void> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener('gallery-first-content-rendered', finish);
      resolve();
    };
    window.addEventListener('gallery-first-content-rendered', finish, { once: true });
    window.setTimeout(finish, 3200);
  });
}

const firstContent = firstContentReady();
const mainReady = import('./main');

void mainReady.finally(() => {
  restoreLegacyMediaListeners();
}).then(async () => {
  await firstContent;
  // Everything below is useful after the first cards exist, but none of it
  // should compete with the architecture/Hot-head requests needed to paint them.
  await import('./card-share');
  await import('./user-ui/page-navigation');
  await import('./user-ui/user-center-management');
  await import('./user-ui/interaction-stability');
  await import('./user-ui/account-sync');
  const privatePdf = await import('./private-pdf-access');
  privatePdf.installPrivatePdfOriginalRouting();
  await import('./user-ui/feedback-widget');
  await import('./site-analytics');
  await import('./media-enhancements');
  await import('./runtime-recovery');
  await import('./nature-figure-fallbacks');
});

void Promise.allSettled([firstContent, mainReady]).then(async results => {
  if (results[0]?.status !== 'fulfilled' || results[1]?.status !== 'fulfilled') return;
  await preloadChineseTitleCache();
  window.dispatchEvent(new CustomEvent('gallery-title-cache-updated'));
});