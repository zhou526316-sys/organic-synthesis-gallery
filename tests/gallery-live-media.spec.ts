import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const GALLERY = 'https://gallery.gczhouwld.com';
const API = 'https://api.gczhouwld.com';
const LOCAL_PREVIEW = 'http://127.0.0.1:4174';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const OFFICIAL = '10.1021/acscatal.6c06476';
const SCIENCE = '10.1126/science.aef3001';
const CONFIRMED_BAD_ANGeW = '10.1002/anie.4335022';
const WRONG_TOC_HASH = '35f10c5321cd43179a4c71c73e388da8';
const RSC_MISSING = [
  '10.1039/d6sc06374h',
  '10.1039/d6gc04458a',
  '10.1039/d6gc05783g',
] as const;
type MediaStatus = 'available' | 'missing' | 'network-error' | 'incomplete';

async function openCanonical(page: Page, doi: string, { figure1 = false, imageFailure = false, staleStatic = false,
  initialMediaStatus = 'available' as MediaStatus } = {}) {
  let imageUnavailable = imageFailure;
  let mediaStatus: MediaStatus = initialMediaStatus;
  const calls: Array<{ url: string; method: string }> = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // main.ts is dynamically imported by bootstrap.ts *after* DOMContentLoaded;
  // wait for its real event listener instead of dispatching before it exists.
  await page.addInitScript(() => {
    (window as any).__galleryMediaListenerReady = false;
    const nativeAdd = window.addEventListener;
    window.addEventListener = function (type, callback, options) {
      if (type === 'gallery-assets-updated') (window as any).__galleryMediaListenerReady = true;
      return nativeAdd.call(this, type, callback, options);
    } as typeof window.addEventListener;
  });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.origin === GALLERY) {
      if (staleStatic && url.pathname === '/media-index.json') {
        calls.push({ url: url.href, method });
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({
            version: 2, generatedAt: 1,
            items: { [doi]: {
              doi, toc: {
                available: true, reason: 'imported',
                contentHash: WRONG_TOC_HASH,
                imageUrl: 'media-mirror/old-substrate-grid.png',
              },
              figures: { available: false, doi, figures: [] },
            } },
          }),
        });
        return;
      }
      if (url.pathname === '/media-index.json' && initialMediaStatus !== 'available') {
        calls.push({ url: url.href, method });
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ version: 2, generatedAt: 1, items: {} }),
        });
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        calls.push({ url: url.href, method });
        await route.fulfill({ status: 404, body: 'Gallery is static Pages, not the media API' });
        return;
      }
      const response = await page.request.get(LOCAL_PREVIEW + url.pathname + url.search, { timeout: 15000 });
      await route.fulfill({
        status: response.status(),
        contentType: response.headers()['content-type'] || 'application/octet-stream',
        body: await response.body(),
      });
      return;
    }
    if (url.origin === API) {
      const headers = {
        'access-control-allow-origin': GALLERY,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
      };
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      if (url.pathname === '/api/media/batch' && method === 'POST') {
        calls.push({ url: url.href, method });
        if (mediaStatus === 'network-error') {
          await route.fulfill({ status: 503, headers, contentType: 'application/json',
            body: JSON.stringify({ error: 'upstream_media_unavailable' }) });
          return;
        }
        const requested = JSON.parse(request.postData() || '{}').dois || [];
        const found = requested.includes(doi) && mediaStatus !== 'incomplete' ? [{
          doi,
          toc: mediaStatus === 'missing' ? { available: false, doi, reason: 'cache_miss' } :
            figure1 ? {
              available: true, imageUrl: API + '/media/original.png',
              reason: 'figure1_fallback',
              primary: { kind: 'figure1', label: 'Figure 1', imageUrl: API + '/media/original.png' },
            } : { available: true, imageUrl: API + '/media/original.png', reason: 'imported' },
          figures: { available: false, doi, figures: [] },
        }] : [];
        await route.fulfill({
          status: 200, headers, contentType: 'application/json',
          body: JSON.stringify({ items: found, generatedAt: Date.now() }),
        });
        return;
      }
      if (url.pathname === '/media/original.png') {
        await route.fulfill(imageUnavailable
          ? { status: 503, headers, contentType: 'text/plain', body: 'image temporarily unavailable' }
          : { status: 200, headers, contentType: 'image/png', body: PNG });
        return;
      }
      await route.fulfill({
        status: 200, headers, contentType: 'application/json',
        body: JSON.stringify({ items: [], generatedAt: Date.now() }),
      });
      return;
    }
    // Other external services are unrelated to the tested TOC display.
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ items: [], generatedAt: Date.now() }),
    });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(GALLERY + '/', { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => (window as any).__galleryMediaListenerReady === true, null, { timeout: 15000 });
  } catch (error) {
    console.log('GALLERY_MEDIA_MODULE_DIAGNOSTIC', await page.evaluate(() => ({
      appText: document.querySelector('#app')?.textContent?.slice(0, 450),
      scripts: [...document.querySelectorAll('script[src]')].map(x => (x as HTMLScriptElement).src),
    })), errors);
    throw error;
  }
  // The isolated CI adapter deliberately does not return a literature catalogue;
  // inject one genuine DOI card into the built app instead of falsely expecting
  // the entire remote publication service to populate the test environment.
  // Real media hooks, API routing, Image loading and retry handlers are unchanged.
  await page.evaluate(doi => {
    const fixture = document.createElement('section');
    fixture.dataset.galleryMediaTest = 'true';
    fixture.style.cssText = 'position:fixed;top:32px;left:20px;z-index:2;width:390px;min-height:260px;background:white';
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.doi = doi;
    card.style.cssText = 'width:360px;min-height:240px';
    const slot = document.createElement('div');
    slot.className = 'toc-slot generated';
    slot.dataset.doi = doi;
    slot.dataset.state = 'idle';
    slot.style.cssText = 'height:225px;min-height:225px';
    slot.textContent = '正在获取原始主图…';
    const figures = document.createElement('div');
    figures.className = 'figure-strip-slot';
    figures.dataset.figureDoi = doi;
    card.append(slot, figures);
    fixture.append(card);
    document.body.prepend(fixture);
    window.dispatchEvent(new CustomEvent('gallery-assets-updated', { detail: { doi } }));
  }, doi);
  const card = page.locator('[data-gallery-media-test] .card[data-doi="' + doi + '"]').first();
  await expect(card).toBeVisible({ timeout: 10000 });
  return {
    card, calls, errors,
    restoreImage: () => { imageUnavailable = false; },
    setMediaStatus: (next: MediaStatus) => { mediaStatus = next; },
  };
}

for (const [doi, figure1] of [[OFFICIAL, false], [SCIENCE, true]] as const) {
  test('canonical Gallery card loads ' + (figure1 ? 'verified Figure 1' : 'official TOC') + ' from live API', async ({ page }) => {
    test.setTimeout(90000);
    const fixture = await openCanonical(page, doi, { figure1 });
    const img = fixture.card.locator('.toc-slot[data-state="done"] img.toc-image');
    await expect(img).toBeVisible({ timeout: 25000 });
    await expect.poll(async () => img.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    if (figure1) await expect(fixture.card.locator('.toc-label')).toContainText('Figure 1');
    expect(fixture.calls.some(row => row.url === API + '/api/media/batch' && row.method === 'POST')).toBe(true);
    expect(fixture.calls.filter(row => row.url.startsWith(GALLERY + '/api/'))).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

test('unavailable original image shows actionable retry and recovers without a new scrape', async ({ page }) => {
  test.setTimeout(90000);
  const fixture = await openCanonical(page, OFFICIAL, { imageFailure: true });
  const retry = fixture.card.locator('.toc-retry');
  await expect(retry).toBeVisible({ timeout: 25000 });
  fixture.restoreImage();
  await retry.click();
  const img = fixture.card.locator('.toc-slot[data-state="done"] img.toc-image');
  await expect(img).toBeVisible({ timeout: 25000 });
  await expect.poll(async () => img.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(fixture.calls.some(row => row.url === API + '/api/media/batch' && row.method === 'POST')).toBe(true);
  expect(fixture.errors).toEqual([]);
});

test('corrected Angew media from live API overrides the previously published wrong TOC', async ({ page }) => {
  test.setTimeout(90000);
  const fixture = await openCanonical(page, CONFIRMED_BAD_ANGeW, { staleStatic: true });
  const img = fixture.card.locator('.toc-slot[data-state="done"] img.toc-image');
  await expect(img).toBeVisible({ timeout: 25000 });
  await expect.poll(async () => img.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(img).toHaveAttribute('src', API + '/media/original.png');
  expect(fixture.calls.filter(row => row.url === GALLERY + '/media-index.json').length).toBe(1);
  expect(fixture.calls.some(row => row.url === API + '/api/media/batch' && row.method === 'POST')).toBe(true);
  expect(fixture.errors).toEqual([]);
});

for (const doi of RSC_MISSING) {
  test('RSC missing original ' + doi + ' is pending rather than falsely reporting service failure', async ({ page }) => {
    test.setTimeout(90000);
    const fixture = await openCanonical(page, doi, { initialMediaStatus: 'missing' });
    const slot = fixture.card.locator('.toc-slot');
    await expect(slot).toHaveAttribute('data-state', 'not-yet-available', { timeout: 25000 });
    await expect(slot.locator('.toc-retry')).toHaveCount(0);
    await expect(slot).toContainText(/原始主图待补齐|Original graphic pending/);
    expect(fixture.calls.some(row => row.url === API + '/api/media/batch')).toBe(true);
    expect(fixture.errors).toEqual([]);
  });
}

test('network failure -> confirmed cache miss -> newly uploaded TOC restores the same visible card', async ({ page }) => {
  test.setTimeout(90000);
  const doi = RSC_MISSING[0];
  const fixture = await openCanonical(page, doi, { initialMediaStatus: 'network-error' });
  const slot = fixture.card.locator('.toc-slot');
  const retry = slot.locator('.toc-retry');
  await expect(retry).toBeVisible({ timeout: 25000 });
  await expect(retry).toContainText(/主图服务暂不可用|Graphic service unavailable/);
  expect(fixture.calls.some(row => row.url === API + '/api/media/batch')).toBe(true);

  fixture.setMediaStatus('missing');
  await retry.click();
  await expect(slot).toHaveAttribute('data-state', 'not-yet-available', { timeout: 25000 });
  await expect(slot.locator('.toc-retry')).toHaveCount(0);
  await expect(slot).toContainText(/原始主图待补齐|Original graphic pending/);

  fixture.setMediaStatus('available');
  await page.evaluate(target => {
    window.dispatchEvent(new CustomEvent('gallery-assets-updated', { detail: { doi: target } }));
  }, doi);
  const img = slot.locator('[data-state="done"] img.toc-image, img.toc-image');
  await expect(img).toBeVisible({ timeout: 25000 });
  await expect.poll(async () => img.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(slot.locator('.toc-retry')).toHaveCount(0);
  expect(fixture.calls.filter(row => row.url === API + '/api/media/batch').length).toBeGreaterThanOrEqual(3);
  expect(fixture.errors).toEqual([]);
});

test('an incomplete live response is not proof that a missing TOC is pending', async ({ page }) => {
  test.setTimeout(90000);
  const fixture = await openCanonical(page, RSC_MISSING[1], { initialMediaStatus: 'incomplete' });
  const slot = fixture.card.locator('.toc-slot');
  await expect(slot.locator('.toc-retry')).toBeVisible({ timeout: 25000 });
  await expect(slot).not.toHaveAttribute('data-state', 'not-yet-available');
  await expect(slot.locator('.toc-pending-status')).toHaveCount(0);
  expect(fixture.errors).toEqual([]);
});

test('visible pending TOC is rechecked after five minutes without a page reload or new publisher visit', async ({ page }) => {
  test.setTimeout(90000);
  await page.clock.install();
  const doi = RSC_MISSING[2];
  const fixture = await openCanonical(page, doi, { initialMediaStatus: 'missing' });
  const slot = fixture.card.locator('.toc-slot');
  await expect(slot).toHaveAttribute('data-state', 'not-yet-available', { timeout: 25000 });
  const initialBatches = fixture.calls.filter(row => row.url === API + '/api/media/batch').length;

  fixture.setMediaStatus('available');
  // Advance only browser time. The live UI interval should poll visible
  // pending cards when their media TTL expires, not when a user clicks.
  await page.clock.fastForward(5 * 60_000 + 1000);
  await page.clock.runFor(400);
  const img = slot.locator('img.toc-image');
  await expect(img).toBeVisible({ timeout: 25000 });
  await expect.poll(async () => img.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(fixture.calls.filter(row => row.url === API + '/api/media/batch').length).toBeGreaterThan(initialBatches);
  expect(fixture.errors).toEqual([]);
});
