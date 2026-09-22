import { test, expect, type Page, type Locator } from '@playwright/test';
import { open } from './status-image-fixtures';

async function summary(page: Page, width: number, withToc = true): Promise<{ actions: Locator; drawer: Locator; calls: () => number }> {
  const actions = await open(page, width);
  await actions.locator('button[data-action="close"]').click();
  let count = 0;
  await page.route('**/api/user-ui/article-summary*', async route => {
    const request = route.request();
    const headers = { 'access-control-allow-origin': request.headers().origin || new URL(page.url()).origin, 'access-control-allow-credentials': 'true' };
    count += 1;
    await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({
      available: true, fulltextAvailable: true, source: 'fulltext', cached: true,
      zh: '中文全文摘要：本测试内容仅用于界面排版。\n' + '研究目标、核心反应、条件、机理、底物范围与局限。\n'.repeat(45),
      en: 'English full-text summary: isolated layout test only.\n' + 'Objective, transformation, conditions, mechanism, scope and limitations.\n'.repeat(45),
      generatedAt: 1789980000000,
    }) });
  });
  await actions.evaluate((element, withToc) => {
    const card = element.closest('.card');
    if (!card) throw new Error('Card missing');
    card.querySelectorAll('.toc-image, .toc-link img, .toc-slot img').forEach(image => image.remove());
    if (withToc) {
      const image = document.createElement('img');
      image.className = 'toc-image';
      image.alt = 'TOC fixture';
      // The PNG has an invariant 600x320 intrinsic size. The previous SVG
      // fixture exposed layout-dependent naturalWidth in this WebKit build.
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('TOC fixture canvas unavailable');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 600, 320);
      ctx.fillStyle = '#111';
      ctx.font = '42px sans-serif';
      ctx.fillText('TOC layout test', 40, 160);
      image.src = canvas.toDataURL('image/png');
      const slot = card.querySelector('.toc-slot') || card;
      slot.append(image);
    }
  }, withToc);
  await actions.locator('button[data-action="summary"]').click();
  const drawer = actions.locator('.drawer.summary-drawer');
  await expect(drawer).toHaveAttribute('data-summary-layout', 'reading');
  await expect(drawer.locator('.summary-text')).toContainText('中文全文摘要');
  return { actions, drawer, calls: () => count };
}

async function insideViewport(page: Page, drawer: Locator): Promise<void> {
  await expect.poll(async () => {
    const box = await drawer.boundingBox();
    const viewport = page.viewportSize()!;
    return Boolean(box && box.x >= 15 && box.y >= 15 && box.x + box.width <= viewport.width - 15 && box.y + box.height <= viewport.height - 15);
  }).toBe(true);
  const box = (await drawer.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeLessThanOrEqual(1201);
  expect(box.height).toBeLessThanOrEqual(viewport.height * 0.84 + 1);
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
  expect(await drawer.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
}

for (const width of [390, 768, 1280, 2134]) {
  test(`large nonfullscreen summary remains readable and bounded at ${width}px`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const { actions, drawer, calls } = await summary(page, width);
    await insideViewport(page, drawer);
    const size = await drawer.locator('.summary-text').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
    expect(size).toBeGreaterThanOrEqual(width <= 680 ? 15 : 16);
    if (width >= 1280) expect((await drawer.boundingBox())!.width).toBeGreaterThanOrEqual(1000);
    await expect(drawer.locator('.summary-toc img')).toBeVisible();
    await expect.poll(() => drawer.locator('.summary-toc img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(600);
    await page.screenshot({ path: info.outputPath(`summary-reading-${width}.png`) });
    await drawer.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await expect(drawer.locator('button[data-action="close"]')).toBeVisible();
    await drawer.locator('button[data-action="summary-lang:en"]').click();
    await expect(drawer.locator('.summary-text')).toContainText('English full-text summary');
    expect(calls()).toBe(1);
    await insideViewport(page, drawer);
    await page.setViewportSize({ width: width > 680 ? 590 : 1280, height: 760 });
    await insideViewport(page, drawer);
    await drawer.locator('button[data-action="close"]').click();
    await expect(drawer).toHaveCount(0);
    const favorite = actions.locator('button[data-action="favorite"]');
    await favorite.click();
    const picker = actions.locator('.drawer');
    await expect(picker).toHaveAttribute('data-anchor', 'favorite');
    const anchor = (await favorite.boundingBox())!;
    const panel = (await picker.boundingBox())!;
    const gap = Math.min(Math.abs(panel.y - anchor.y - anchor.height), Math.abs(anchor.y - panel.y - panel.height));
    expect(gap).toBeLessThanOrEqual(18);
    expect(panel.width).toBeLessThanOrEqual(351);
    await expect(actions.locator('.bar > button.action')).toHaveCount(4);
    expect(errors).toEqual([]);
  });
}

test('a summary without TOC uses the full text column and closes outside', async ({ page }) => {
  const { drawer } = await summary(page, 1280, false);
  await expect(drawer.locator('.summary-toc')).toHaveCount(0);
  const layout = (await drawer.locator('.summary-layout').boundingBox())!;
  const main = (await drawer.locator('.summary-main').boundingBox())!;
  expect(Math.abs(layout.width - main.width)).toBeLessThanOrEqual(2);
  await insideViewport(page, drawer);
  await page.mouse.click(2, 2);
  await expect(drawer).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).not.toBe('hidden');
});
