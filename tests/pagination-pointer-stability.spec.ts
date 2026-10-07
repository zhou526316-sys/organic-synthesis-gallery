import { test, expect, type Page, type TestInfo } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const base = process.env.PAGINATION_PREVIEW_BASE || 'http://127.0.0.1:4173';

async function observe(page: Page, info: TestInfo, exercise: () => Promise<void>): Promise<void> {
  const evidence = { errors: [] as string[], consoleErrors: [] as string[], failures: [] as unknown[], responses: [] as unknown[] };
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => evidence.failures.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.url().includes('/api/')) evidence.responses.push({ url: response.url(), status: response.status() }); });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.endsWith('/reader-counts')) body = { counts: {} };
    else if (path.endsWith('/media/batch') || path.endsWith('/media/inventory')) body = { items: [] };
    else if (path.endsWith('/auth/session')) body = { authenticated: false, user: null };
    else if (path.endsWith('/integrations')) body = { auth: {}, payments: {} };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  try {
    await exercise();
    expect(evidence.errors).toEqual([]);
  } finally {
    await info.attach('pointer-browser-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    if (info.status !== info.expectedStatus) await page.screenshot({ path: info.outputPath('failure.png') }).catch(() => {});
  }
}

for (const width of [320, 1280]) {
  test(`stationary mouse still activates the pressed page after footer shift at ${width}px`, async ({ page }, info) => {
    await observe(page, info, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      const button = page.locator('#resultPageNumbers [data-result-page="2"]');
      await expect(button).toBeVisible({ timeout: 30000 });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      if (!box) throw new Error('page button has no hit target');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )1\//);
      await page.locator('#resultWindowControls').evaluate(element => { element.style.transform = 'translateY(120px)'; });
      await page.mouse.up();
      await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )2\//);
    });
  });
}

test('dragging away cancels mouse activation while Enter remains usable', async ({ page }, info) => {
  await observe(page, info, async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const button = page.locator('#resultPageNumbers [data-result-page="2"]');
    await expect(button).toBeVisible({ timeout: 30000 });
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    if (!box) throw new Error('page button has no hit target');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(2, 2);
    await page.mouse.up();
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )1\//);
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )2\//);
  });
});
