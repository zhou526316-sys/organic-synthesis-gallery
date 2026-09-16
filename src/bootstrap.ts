const ZH_CACHE_KEY = 'organic-gallery-zh-title-cache-v2';

async function preloadChineseTitleCache(): Promise<void> {
  try {
    const response = await fetch(new URL('./title-translations-zh.json', document.baseURI), { cache: 'force-cache' });
    if (!response.ok) return;
    const payload = await response.json() as { translations?: Array<{ title?: unknown; zh?: unknown }> };
    const cached = JSON.parse(localStorage.getItem(ZH_CACHE_KEY) || '{}') as Record<string, unknown>;
    for (const item of payload.translations || []) {
      if (typeof item.title !== 'string' || typeof item.zh !== 'string') continue;
      const title = item.title.trim();
      const zh = item.zh.trim();
      if (title && zh) cached[title] = zh;
    }
    localStorage.setItem(ZH_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Translation preload is an optimization; the main app still has its normal fallback path.
  }
}

void preloadChineseTitleCache().finally(async () => {
  await import('./main');
  await import('./user-ui/account-sync');
  await import('./media-enhancements');
  await import('./runtime-recovery');
});