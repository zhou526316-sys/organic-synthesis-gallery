import { test, expect, type Page, type TestInfo } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const base = process.env.PAGINATION_PREVIEW_BASE || 'http://127.0.0.1:4173';

async function observe(page: Page, info: TestInfo, exercise: () => Promise<void>): Promise<void> {
  const evidence = { errors: [] as string[], consoleErrors: [] as string[], failures: [] as unknown[], responses: [] as unknown[] };
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => evidence.failures.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.url().includes('/api/')) evidence.responses.push({ url: response.url(), status: response.status() }); });
  await page.addInitScript(() => {
    const events: unknown[] = [];
    (window as any).__paginationPointerEvents = events;
    document.addEventListener('pointermove', event => {
      (window as any).__paginationMousePoint = { x: event.clientX, y: event.clientY };
    }, true);
    document.addEventListener('pointerdown', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('#resultWindowControls button') : null;
      (window as any).__paginationDownPage = button?.dataset.resultPage || '';
      events.push({ type: 'pointerdown', page: button?.dataset.resultPage, x: event.clientX, y: event.clientY, pointerType: event.pointerType });
    }, true);
    document.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('#resultWindowControls button') : null;
      events.push({ type: 'click', page: button?.dataset.resultPage, detail: event.detail });
    }, true);
  });
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
    const pointerEvents = await page.evaluate(() => (window as any).__paginationPointerEvents || []).catch(() => []);
    await info.attach('pointer-browser-evidence', { body: JSON.stringify({ ...evidence, pointerEvents }, null, 2), contentType: 'application/json' });
    if (info.status !== info.expectedStatus) await page.screenshot({ path: info.outputPath('failure.png') }).catch(() => {});
  }
}

async function pressSecondPage(page: Page): Promise<void> {
  const button = page.locator('#resultPageNumbers [data-result-page="2"]');
  await expect(button).toBeVisible({ timeout: 30000 });
  // Finish lazy layout before choosing the down point. Only hovering is
  // retried; the test still performs exactly one real press and release.
  await expect.poll(async () => {
    await button.hover({ timeout: 5000 });
    return button.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const point = (window as any).__paginationMousePoint;
      return Boolean(point && point.x >= rect.left && point.x <= rect.right
        && point.y >= rect.top && point.y <= rect.bottom
        && document.elementFromPoint(point.x, point.y)?.closest('button') === element);
    });
  }, { timeout: 10000, message: 'mouse must hit the settled page button before the single press' }).toBe(true);
  await page.mouse.down();
  expect(await page.evaluate(() => (window as any).__paginationDownPage), 'real press must hit page 2, not offscreen HTML').toBe('2');
}

for (const width of [320, 1280]) {
  test(`stationary mouse still activates the pressed page after footer shift at ${width}px`, async ({ page }, info) => {
    await observe(page, info, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await pressSecondPage(page);
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
    await pressSecondPage(page);
    await page.mouse.move(2, 2);
    await page.mouse.up();
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )1\//);
    await page.locator('#resultPageNumbers [data-result-page="2"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )2\//);
  });
});
