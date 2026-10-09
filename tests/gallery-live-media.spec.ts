import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const GALLERY = 'https://gallery.gczhouwld.com';
const API = 'https://api.gczhouwld.com';
const LOCAL_PREVIEW = 'http://127.0.0.1:4173';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const OFFICIAL = '10.1021/acscatal.6c06476';
const SCIENCE = '10.1126/science.aef3001';

async function openCanonical(page: Page, doi: string, { figure1 = false, imageFailure = false } = {}) {
  let imageUnavailable = imageFailure;
  const calls: Array<{ url: string; method: string }> = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.origin === GALLERY) {
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
        const requested = JSON.parse(request.postData() || '{}').dois || [];
        const found = requested.includes(doi) ? [{
          doi,
          toc: figure1 ? {
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
  await page.goto(GALLERY + '/?doi=' + encodeURIComponent(doi), { waitUntil: 'domcontentloaded' });
  const card = page.locator('.card[data-doi="' + doi + '"]').first();
  await expect(card).toBeVisible({ timeout: 35000 });
  return { card, calls, errors, restoreImage: () => { imageUnavailable = false; } };
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
