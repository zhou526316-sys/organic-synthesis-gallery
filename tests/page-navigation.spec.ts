import { test, expect, type Page } from '@playwright/test';

const SITE = process.env.LIVE_SITE_URL || 'http://127.0.0.1:4173/';
test.use({ serviceWorkers: 'block' });

async function open(page: Page, width = 390): Promise<{ errors: string[]; marks: string[] }> {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [], marks: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('**/*', async route => {
    const request = route.request(), url = request.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) { await route.continue(); return; }
    const path = new URL(url).pathname;
    const headers = {
      'access-control-allow-origin': request.headers().origin || new URL(SITE).origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] || 'content-type, authorization',
      'vary': 'Origin',
    };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    const api = path === '/api' || path.startsWith('/api/');
    if (['GET', 'HEAD'].includes(request.method()) && !api) { await route.continue(); return; }
    if (path.endsWith('/reader-counts/mark')) marks.push(path);
    const body = path.endsWith('/reader-counts') ? { counts: {} }
      : path.endsWith('/integrations') ? { auth: {}, payments: {} }
        : path.endsWith('/article-summary') ? { available: false, reason: 'fulltext_missing' } : { items: [] };
    await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const response = await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBe(true);
  await expect(page.locator('gallery-page-navigation')).toBeVisible();
  await expect(page.locator('#gallery > .card').first()).toBeVisible();
  console.log('NAVIGATION_ENTRY', JSON.stringify({ site: SITE, scripts: await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => (node as HTMLScriptElement).src)) }));
  return { errors, marks };
}
const position = (page: Page) => page.evaluate(() => ({ y: scrollY, remaining: document.documentElement.scrollHeight - document.documentElement.clientHeight - scrollY }));

for (const width of [320, 1280]) test(`top/bottom reaches actual page ends without replacing cards at ${width}px`, async ({ page }, info) => {
  const evidence = await open(page, width);
  const nav = page.locator('gallery-page-navigation');
  const top = nav.locator('[data-page-jump="top"]'), bottom = nav.locator('[data-page-jump="bottom"]');
  await page.evaluate(() => { (window as any).__navCards = Array.from(document.querySelectorAll('#gallery > .card')); });
  await expect(top).toBeDisabled();
  await expect(bottom).toBeEnabled();
  const bounds = (await nav.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
  const target = (await bottom.boundingBox())!;
  expect(target.height).toBeGreaterThanOrEqual(44);
  await bottom.click();
  await expect.poll(async () => (await position(page)).remaining).toBeLessThanOrEqual(4);
  await expect(bottom).toBeDisabled();
  await page.screenshot({ path: info.outputPath(`page-end-${width}.png`) });
  await top.click();
  await expect.poll(async () => (await position(page)).y).toBeLessThanOrEqual(3);
  await expect(top).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__navCards.every((node: Element, index: number) => node === document.querySelectorAll('#gallery > .card')[index]))).toBe(true);
  await page.screenshot({ path: info.outputPath(`page-top-${width}.png`) });
  expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
});

test('keyboard controls, live language labels and reduced motion', async ({ page }) => {
  const evidence = await open(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    document.documentElement.lang = 'en';
    const native = window.scrollTo.bind(window);
    (window as any).__navScrolls = [];
    window.scrollTo = ((...args: any[]) => { (window as any).__navScrolls.push(args[0]); return (native as any)(...args); }) as typeof window.scrollTo;
  });
  const nav = page.locator('gallery-page-navigation');
  const bottom = nav.getByRole('button', { name: 'Go to bottom' });
  await expect(bottom).toHaveAttribute('title', 'Go to bottom');
  // Press the key on the native shadow-DOM button itself so WebKit cannot
  // lose focus between a separate focus command and the keyboard event.
  await bottom.press('Enter');
  await expect.poll(async () => (await position(page)).remaining).toBeLessThanOrEqual(4);
  expect(await page.evaluate(() => (window as any).__navScrolls[0].behavior)).toBe('instant');
  const top = nav.getByRole('button', { name: 'Back to top' });
  // The instant scroll position can settle before the next rAF refreshes the
  // endpoint button state. A real user cannot activate a disabled button, so
  // wait for the control to become actionable before exercising Space.
  await expect(top).toBeEnabled();
  await top.press('Space');
  await expect.poll(async () => (await position(page)).y).toBeLessThanOrEqual(3);
  await page.evaluate(() => { document.documentElement.lang = 'zh'; });
  await expect(nav.getByRole('button', { name: '回到顶部' })).toBeVisible();
  expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
});

test('navigation yields to real card drawers and image viewer, then restores', async ({ page }, info) => {
  const evidence = await open(page);
  const nav = page.locator('gallery-page-navigation');
  const actions = page.locator('gallery-paper-actions').first();
  await actions.locator('[data-action="status"]').click();
  await expect(actions.locator('.drawer')).toBeVisible();
  await expect(nav).toBeHidden();
  await actions.locator('[data-action="close"]').click();
  await expect(nav).toBeVisible();
  // Explicit input fixture; no real paper/media content is changed or uploaded.
  await page.evaluate(() => {
    const button = document.createElement('button'); button.className = 'figure-thumb'; button.id = 'nav-image-fixture';
    const image = new Image();
    image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="white"/><text x="40" y="100" font-size="30">Navigation test image</text></svg>');
    image.alt = 'Navigation test image'; image.width = 120; button.append(image); document.body.prepend(button);
  });
  await page.locator('#nav-image-fixture').click();
  await expect(page.locator('.media-viewer')).toBeVisible();
  await expect(nav).toBeHidden();
  await page.screenshot({ path: info.outputPath('navigation-hidden-under-viewer.png') });
  await page.locator('.media-viewer [data-action="close"]').click();
  await expect(nav).toBeVisible();
  expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
});

test('short pages hide navigation; new content and resize restore correct limits', async ({ page }) => {
  const evidence = await open(page);
  // Isolated layout input test: no source methods or navigation functions patched.
  await page.evaluate(() => {
    for (const node of Array.from(document.body.children)) if (node.tagName !== 'GALLERY-PAGE-NAVIGATION') (node as HTMLElement).style.display = 'none';
    document.body.style.minHeight = '0'; document.documentElement.style.minHeight = '0';
  });
  const nav = page.locator('gallery-page-navigation');
  await expect(nav).toBeHidden();
  await page.evaluate(() => { const block = document.createElement('div'); block.style.height = '3200px'; document.body.append(block); });
  await expect(nav).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await nav.locator('[data-page-jump="bottom"]').click();
  await expect.poll(async () => (await position(page)).remaining).toBeLessThanOrEqual(4);
  await page.setViewportSize({ width: 1280, height: 700 });
  await expect(nav.locator('[data-page-jump="bottom"]')).toBeEnabled();
  await nav.locator('[data-page-jump="bottom"]').click();
  await expect.poll(async () => (await position(page)).remaining).toBeLessThanOrEqual(4);
  expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
});

test('disconnect/reconnect creates no duplicate controls or handlers and print hides navigation', async ({ page }) => {
  const evidence = await open(page);
  await page.evaluate(() => {
    const element = document.querySelector('gallery-page-navigation')!;
    element.remove(); document.body.append(element);
  });
  const nav = page.locator('gallery-page-navigation');
  await expect(nav).toHaveCount(1);
  await expect(nav.locator('button')).toHaveCount(2);
  await page.emulateMedia({ media: 'print' }); await expect(nav).toBeHidden();
  await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' }); await expect(nav).toBeVisible();
  await nav.locator('[data-page-jump="bottom"]').click();
  await expect.poll(async () => (await position(page)).remaining).toBeLessThanOrEqual(4);
  expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
});


test('content-root growth reveals navigation without window resize or unrelated module events', async ({ page }) => {
  const evidence = await open(page, 390);
  const nav = page.locator('gallery-page-navigation');
  await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('#app')!;
    const gallery = document.querySelector<HTMLElement>('#gallery')!;
    for (const child of Array.from(document.body.children)) {
      if (child !== app && child.tagName !== 'GALLERY-PAGE-NAVIGATION') (child as HTMLElement).style.display = 'none';
    }
    for (const child of Array.from(app.children)) {
      if (child !== gallery) (child as HTMLElement).style.display = 'none';
    }
    document.body.style.cssText = 'min-height:0!important;height:auto!important;overflow:visible!important';
    document.documentElement.style.cssText = 'min-height:0!important;height:auto!important;overflow:visible!important';
    gallery.replaceChildren();
    gallery.style.cssText = 'display:block!important;position:static!important;min-height:0!important;height:10px!important;overflow:hidden!important;contain:none!important';
    app.style.cssText = 'display:block!important;position:static!important;min-height:0!important;height:10px!important;overflow:hidden!important;contain:none!important';
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeLessThan(80);
  await expect(nav).toBeHidden();

  // No resize/scroll/custom event is dispatched here. The observed #app box
  // itself grows, mirroring late card layout increasing the application height.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#app')!.style.setProperty('height', '2500px', 'important');
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeGreaterThan(1000);
  await expect(nav).toBeVisible({ timeout: 1500 });

  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#app')!.style.setProperty('height', '10px', 'important');
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeLessThan(80);
  await expect(nav).toBeHidden({ timeout: 1500 });
  expect(evidence.errors).toEqual([]);
  expect(evidence.marks).toEqual([]);
});


test('late gallery insertion after navigation connection reveals the control without resize events', async ({ page }) => {
  const evidence = await open(page, 390);
  const nav = page.locator('gallery-page-navigation');

  await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('#app')!;
    const currentNav = document.querySelector<HTMLElement>('gallery-page-navigation')!;
    for (const child of Array.from(document.body.children)) {
      if (child !== app && child !== currentNav) (child as HTMLElement).style.display = 'none';
    }
    app.replaceChildren();
    document.body.style.cssText = 'min-height:0!important;height:auto!important;overflow:visible!important';
    document.documentElement.style.cssText = 'min-height:0!important;height:auto!important;overflow:visible!important';
    app.style.cssText = 'display:block!important;position:static!important;min-height:0!important;height:auto!important;overflow:visible!important;contain:none!important';
    currentNav.remove();
    document.body.append(currentNav);
  });

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeLessThan(80);
  await expect(nav).toBeHidden();

  // Simulate main() completing its asynchronous content render only after the
  // navigation custom element has already connected.
  await page.evaluate(() => {
    const gallery = document.createElement('div');
    gallery.id = 'gallery';
    gallery.style.cssText = 'display:block!important;position:static!important;height:2500px!important;overflow:hidden!important;contain:none!important';
    document.querySelector('#app')!.append(gallery);
  });

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeGreaterThan(1000);
  await expect(nav).toBeVisible({ timeout: 1500 });
  expect(evidence.errors).toEqual([]);
  expect(evidence.marks).toEqual([]);
});
