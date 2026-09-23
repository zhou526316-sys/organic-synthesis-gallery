import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('navigation registers before deliberately slow optional user modules', async ({ page }) => {
  const started = Date.now();
  const requests: Array<{ at: number; url: string }> = [];
  const errors: string[] = [];
  const marks: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/assets/') && url.endsWith('.js')) requests.push({ at: Date.now() - started, url });
    if (new URL(url).pathname.endsWith('/reader-counts/mark')) marks.push(url);
  });

  await page.context().route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === 'blob:' || url.protocol === 'data:') { await route.continue(); return; }
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/');
    if (api) {
      const headers = {
        'access-control-allow-origin': request.headers().origin || 'http://127.0.0.1:4173',
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE',
        'access-control-allow-headers': request.headers()['access-control-request-headers'] || 'content-type, authorization',
        'vary': 'Origin',
      };
      if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
      const body = url.pathname.endsWith('/reader-counts') ? { counts: {} }
        : url.pathname.endsWith('/integrations') ? { auth: {}, payments: {} }
          : { items: [] };
      await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
      return;
    }
    const optional = /\/(?:user-center-management|interaction-stability|account-sync|feedback-widget)-[^/]+\.js$/.test(url.pathname);
    if (optional) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    await route.continue();
  });

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });

  const navigation = page.locator('gallery-page-navigation');
  await expect(navigation).toBeVisible({ timeout: 2500 });
  const visibleAt = Date.now() - started;
  expect(visibleAt).toBeLessThan(2500);

  await expect.poll(() => requests.findIndex(item => /page-navigation-/.test(item.url))).toBeGreaterThanOrEqual(0);
  const navigationIndex = requests.findIndex(item => /page-navigation-/.test(item.url));
  const firstOptionalIndex = requests.findIndex(item => /(?:user-center-management|interaction-stability|account-sync|feedback-widget)-/.test(item.url));
  expect(firstOptionalIndex).toBeGreaterThan(navigationIndex);

  await expect(page.locator('gallery-user-shell')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.site-feedback-tab')).toBeVisible({ timeout: 12000 });
  expect(errors).toEqual([]);
  expect(marks).toEqual([]);
});
