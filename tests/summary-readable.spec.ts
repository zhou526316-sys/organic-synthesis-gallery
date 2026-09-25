import { test, expect, type Page, type Locator } from '@playwright/test';
import { open } from './status-image-fixtures';

test.use({ serviceWorkers: 'block' });
const ZH = '摘要布局测试：研究目标、反应条件、底物范围及局限。';
const EN = 'Summary layout fixture: objective, conditions, scope and limitations.';

async function prepare(page: Page, width: number, height: number, available = true, toc = true, evidenceLevel: 'abstract_only' | 'partial' | 'complete' = 'complete', reason?: 'fulltext_missing' | 'summary_pending'): Promise<{ actions: Locator; calls: () => number }> {
  let calls = 0;
  // All background API requests are isolated by open(); this route replaces only
  // the summary response. No real summary generation, article clicks or reader writes.
  await page.route('**/api/user-ui/article-summary*', async route => {
    calls += 1;
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': new URL(page.url()).origin, 'access-control-allow-credentials': 'true' },
      contentType: 'application/json',
      body: JSON.stringify({
        doi: new URL(route.request().url()).searchParams.get('doi'), available,
        fulltextAvailable: evidenceLevel === 'complete' && (available || reason === 'summary_pending'),
        evidenceAvailable: available || reason === 'summary_pending',
        evidenceLevel,
        state: available ? 'published' : reason === 'summary_pending' ? 'evidence_ready' : 'missing',
        reason: available ? undefined : (reason || 'fulltext_missing'),
        source: available ? 'reviewed_evidence_v2' : undefined,
        cached: true, zh: Array(32).fill(ZH).join('\n\n'), en: Array(32).fill(EN).join('\n\n'), generatedAt: 1790000000000, reviewedAt: 1790000001000,
      }),
    });
  });
  const actions = await open(page, width);
  await actions.locator('button[data-action="close"]').click();
  await page.setViewportSize({ width, height });
  const card = page.locator('.card').filter({ has: actions }).first();
  await card.evaluate(async (element, enabled) => {
    let slot = element.querySelector<HTMLElement>('.toc-slot');
    if (!slot) { slot = document.createElement('div'); slot.className = 'toc-slot'; element.prepend(slot); }
    slot.replaceChildren();
    if (enabled) {
      // Fixed raster dimensions, rather than an SVG whose intrinsic metrics can
      // be affected by the browser's SVG sizing path. Keep the exact 640px check.
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = '#344054'; ctx.font = '32px sans-serif'; ctx.fillText('TOC layout fixture', 80, 180);
      const image = document.createElement('img'); image.className = 'toc-image'; image.alt = 'TOC test fixture';
      image.src = canvas.toDataURL('image/png'); slot.append(image); await image.decode();
    }
  }, toc);
  await actions.locator('button[data-action="summary"]').click();
  return { actions, calls: () => calls };
}

async function bounded(drawer: Locator, width: number, height: number): Promise<void> {
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('data-anchor', 'summary');
  // Resize and image load are asynchronous. Retain the same strict edges and
  // default 5-second expectation window, not an arbitrary settling sleep.
  await expect(async () => {
    const box = (await drawer.boundingBox())!;
    expect(box.width).toBeLessThan(width - 18);
    expect(box.height).toBeLessThan(height * 0.9);
    expect(box.x).toBeGreaterThanOrEqual(10);
    expect(box.y).toBeGreaterThanOrEqual(10);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 10);
    expect(box.y + box.height).toBeLessThanOrEqual(height - 10);
    expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }).toPass({ timeout: 5000 });
}

for (const { width, height } of [{ width: 1600, height: 1000 }, { width: 1280, height: 900 }, { width: 390, height: 900 }, { width: 320, height: 568 }, { width: 900, height: 420 }]) {
  test(`larger summary remains readable and nonfullscreen at ${width}x${height}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const { actions, calls } = await prepare(page, width, height);
    const drawer = actions.locator('.summary-drawer');
    await expect(drawer.locator('.summary-text')).toContainText(ZH);
    await bounded(drawer, width, height);
    const box = (await drawer.boundingBox())!;
    if (width >= 1500) expect(box.width).toBeGreaterThan(1350);
    else if (width >= 1200) expect(box.width).toBeGreaterThan(1200);
    expect(box.height).toBeGreaterThan(height * (width <= 680 ? 0.75 : 0.84));
    if (width <= 680) expect(box.height).toBeLessThanOrEqual(height * 0.86 + 2);
    else expect(box.height).toBeLessThanOrEqual(Math.min(1000, height * 0.89) + 2);
    const fontSize = await drawer.locator('.summary-text').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(width <= 680 ? 14 : 15);
    await expect(drawer.locator('.summary-toc img')).toBeVisible();
    await expect(drawer.locator('.summary-toc img')).toHaveAttribute('src', /^data:image\/png/);
    expect(await drawer.locator('.summary-toc img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(640);
    await expect(actions.locator('.bar > button.action')).toHaveCount(4);
    await info.attach('summary-geometry', { body: Buffer.from(JSON.stringify({ width, height, box, fontSize })), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath(`summary-${width}x${height}.png`), fullPage: false });
    await drawer.locator('[data-action="summary-lang:en"]').click();
    await expect(drawer.locator('.summary-text')).toContainText(EN);
    expect(calls()).toBe(1);
    await drawer.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const close = drawer.locator('[data-action="close"]');
    await expect(close).toBeVisible();
    const button = (await close.boundingBox())!;
    const fitted = (await drawer.boundingBox())!;
    expect(button.y).toBeGreaterThanOrEqual(fitted.y);
    expect(button.y + button.height).toBeLessThanOrEqual(fitted.y + fitted.height);
    expect(button.width).toBeGreaterThanOrEqual(40);
    await close.click();
    await expect(drawer).toHaveCount(0);
    expect(await page.evaluate(() => ['html', 'body'].some(selector => getComputedStyle(document.querySelector(selector)!).overflowY === 'hidden'))).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('an open summary refits on resize; management popovers stay near their own buttons', async ({ page }) => {
  const { actions } = await prepare(page, 1280, 900);
  const drawer = actions.locator('.summary-drawer');
  await expect(drawer.locator('.summary-text')).toContainText(ZH);
  for (const size of [{ width: 390, height: 844 }, { width: 900, height: 420 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(size);
    await bounded(drawer, size.width, size.height);
  }
  await drawer.locator('[data-action="close"]').click();
  const favorite = actions.locator('[data-action="favorite"]');
  await favorite.click();
  const popup = actions.locator('.drawer');
  await expect(popup).toHaveAttribute('data-anchor', 'favorite');
  expect((await popup.boundingBox())!.width).toBeLessThanOrEqual(350);
  const anchor = (await favorite.boundingBox())!;
  const panel = (await popup.boundingBox())!;
  expect(Math.min(Math.abs(panel.y - anchor.y - anchor.height), Math.abs(anchor.y - panel.y - panel.height))).toBeLessThanOrEqual(18);
});

test('missing full text still reports unavailable rather than fabricating a summary', async ({ page }) => {
  const { actions, calls } = await prepare(page, 1280, 900, false, false);
  const drawer = actions.locator('.summary-drawer');
  await expect(drawer.locator('.summary-state')).toContainText(/尚未同步到可用|No usable article text evidence/);
  await expect(drawer.locator('.summary-text')).toHaveCount(0);
  await bounded(drawer, 1280, 900);
  expect(calls()).toBe(1);
  expect((await drawer.locator('.summary-main').boundingBox())!.width).toBeGreaterThan(900);
});


test('abstract-only evidence waits for GPT review without pretending full-text coverage', async ({ page }) => {
  const { actions, calls } = await prepare(page, 1280, 900, false, false, 'abstract_only', 'summary_pending');
  const drawer = actions.locator('.summary-drawer');
  await expect(drawer.locator('.summary-state')).toContainText(/Abstract/);
  await expect(drawer.locator('.summary-state')).toContainText(/等待 GPT 审核|awaiting GPT review/);
  await expect(drawer.locator('.summary-text')).toHaveCount(0);
  expect(calls()).toBe(1);
});

test('approved abstract-only summary discloses its evidence coverage', async ({ page }) => {
  const { actions } = await prepare(page, 1280, 900, true, false, 'abstract_only');
  const drawer = actions.locator('.summary-drawer');
  await expect(drawer.locator('.summary-text')).toContainText(ZH);
  await expect(drawer.locator('.summary-meta')).toContainText(/基于 Abstract|Abstract-based/);
});


test('desktop summary gains reading space while mobile keeps the previous compact cap', async ({ page }) => {
  const desktop = await prepare(page, 1600, 1000);
  const drawer = desktop.actions.locator('.summary-drawer');
  await expect(drawer.locator('.summary-text')).toContainText(ZH);
  await bounded(drawer, 1600, 1000);
  const desktopBox = (await drawer.boundingBox())!;
  expect(desktopBox.width).toBeGreaterThan(1350);
  expect(desktopBox.width).toBeLessThanOrEqual(1441);
  expect(desktopBox.height).toBeGreaterThan(850);
  expect(desktopBox.height).toBeLessThanOrEqual(892);
  const columns = await drawer.locator('.summary-layout').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').map(Number));
  expect(columns[1]).toBeGreaterThan(columns[0] * 2);
  await drawer.locator('[data-action="close"]').click();

  const mobile = await prepare(page, 390, 900);
  const mobileDrawer = mobile.actions.locator('.summary-drawer');
  await bounded(mobileDrawer, 390, 900);
  const mobileBox = (await mobileDrawer.boundingBox())!;
  expect(Math.abs(mobileBox.width - 366)).toBeLessThanOrEqual(1);
  expect(mobileBox.height).toBeLessThanOrEqual(776);
});
