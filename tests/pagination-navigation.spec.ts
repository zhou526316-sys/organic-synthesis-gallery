import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const base = process.env.PAGINATION_PREVIEW_BASE || 'http://127.0.0.1:4173';

async function isolateApi(page: Page): Promise<void> {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.endsWith('/reader-counts')) body = { counts: {} };
    else if (path.endsWith('/media/batch') || path.endsWith('/media/inventory')) body = { items: [] };
    else if (path.endsWith('/auth/session')) body = { authenticated: false, user: null };
    else if (path.endsWith('/integrations')) body = { auth: {}, payments: {} };
    else if (path.endsWith('/article-summary')) body = { available: false, reason: 'fulltext_missing' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

for (const width of [320, 390, 680, 681, 1280]) {
  for (const language of ['zh', 'en']) {
    test(`pagination is centered, touch-sized and navigable at ${width}px ${language}`, async ({ page }, info) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      const network: string[] = [];
      const consoleErrors: string[] = [];
      const responses: Array<{ path: string; status: number }> = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => network.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('response', response => { if (response.url().includes('/api/')) responses.push({ path: new URL(response.url()).pathname, status: response.status() }); });
      await isolateApi(page);
      try {
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#gallery > .card').first()).toBeVisible({ timeout: 30000 });
        await page.locator(`[data-lang="${language}"]`).click();
        const controls = page.locator('#resultWindowControls');
        await expect(controls).toBeVisible();
        await controls.scrollIntoViewIfNeeded();
        const layout = await controls.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const sizes = [...element.querySelectorAll<HTMLElement>('button, input')].map(node => {
            const box = node.getBoundingClientRect();
            return { width: box.width, height: box.height, id: node.id || node.dataset.resultPage || '' };
          });
          return { center: rect.left + rect.width / 2, viewport: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, sizes };
        });
        expect(Math.abs(layout.center - width / 2)).toBeLessThanOrEqual(2);
        expect(layout.overflow).toBeLessThanOrEqual(1);
        for (const size of layout.sizes) {
          expect(size.width, `${size.id} width`).toBeGreaterThanOrEqual(44);
          expect(size.height, `${size.id} height`).toBeGreaterThanOrEqual(44);
        }
        if (width <= 900) {
          await expect(page.locator('#nextResultPage .result-page-button-label')).toBeVisible();
          await expect(page.locator('#previousResultPage .result-page-button-label')).toBeVisible();
        }
        await expect(page.locator('#previousResultPage')).toBeDisabled();
        const firstDoi = await page.locator('#gallery > .card').first().getAttribute('data-doi');
        await page.locator('[data-result-page="2"]').click();
        await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )2\//);
        await expect(page.locator('#resultPageNumbers [aria-current="page"]')).toHaveText('2');
        await expect(page.locator('#gallery > .card').first()).not.toHaveAttribute('data-doi', firstDoi || '');
        expect(await page.locator('#gallery > .card').count()).toBeLessThanOrEqual(width <= 680 ? 12 : 24);
        await page.locator('#resultPageJumpInput').fill('3');
        await page.locator('#resultPageJumpInput').press('Enter');
        await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )3\//);
        for (const invalid of ['0', '-1', '1.5']) {
          await page.locator('#resultPageJumpInput').fill(invalid);
          await page.locator('#resultPageJumpButton').click();
          await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )3\//);
        }
        const last = Number(await page.locator('#resultPageJumpInput').getAttribute('max'));
        expect(last).toBeGreaterThan(3);
        await page.locator('#resultPageJumpInput').fill(String(last));
        await page.locator('#resultPageJumpButton').click();
        await expect(page.locator('#resultPageNumbers [aria-current="page"]')).toHaveText(String(last));
        await expect(page.locator('#nextResultPage')).toBeDisabled();
        await page.locator('[data-result-page="1"]').click();
        await expect(page.locator('#gallery > .card').first()).toHaveAttribute('data-doi', firstDoi || '');
        await expect(page.locator('#resultPageJumpInput')).toHaveValue('1');
        if (width <= 680) {
          // Keep the real launchers visible: hiding widgets in a test would
          // conceal the production overlap rather than verify the fix.
          await expect(page.locator('gallery-page-navigation')).toBeVisible();
          await expect(page.locator('site-feedback-widget .site-feedback-tab')).toBeVisible();
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await expect.poll(() => controls.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            if (bounds.top < 0 || bounds.bottom > innerHeight + 1) return ['pager-outside-viewport'];
            const obstacles = [document.querySelector('gallery-page-navigation'), document.querySelector('site-feedback-widget .site-feedback-tab')]
              .filter((node): node is Element => Boolean(node)).map(node => node.getBoundingClientRect());
            return [...element.querySelectorAll<HTMLElement>('button,input')].filter(node => {
              const box = node.getBoundingClientRect();
              return obstacles.some(other => Math.min(box.right, other.right) > Math.max(box.left, other.left)
                && Math.min(box.bottom, other.bottom) > Math.max(box.top, other.top));
            }).map(node => node.id || node.dataset.resultPage || 'occluded-control');
          })).toEqual([]);
        }
        // The numeric last-page button must work too, not merely the jump form.
        await page.locator(`[data-result-page="${last}"]`).click();
        await expect(page.locator('#resultPageNumbers [aria-current="page"]')).toHaveText(String(last));
        await expect(page.locator('#nextResultPage')).toBeDisabled();
        await page.locator('[data-result-page="1"]').click();
        await expect(page.locator('#resultPageJumpInput')).toHaveValue('1');
        await controls.scrollIntoViewIfNeeded();
        await controls.screenshot({ path: info.outputPath(`pagination-${width}-${language}.png`) });
        expect(errors).toEqual([]);
        await info.attach('layout.json', { body: JSON.stringify(layout, null, 2), contentType: 'application/json' });
      } finally {
        await info.attach('browser-diagnostics.json', { body: JSON.stringify({ errors, network, consoleErrors, responses }, null, 2), contentType: 'application/json' });
        if (info.status !== info.expectedStatus) await page.screenshot({ path: info.outputPath('failure.png'), fullPage: false }).catch(() => {});
      }
    });
  }
}
