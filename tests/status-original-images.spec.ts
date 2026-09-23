import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { KEY, GIF, gifFile, isolate, open, originalHash, state } from './status-image-fixtures';
import { expectAnimatedImage } from './animated-image-evidence';

for (const width of [390, 1280]) {
  test(`original GIF is animated, byte-exact and persistent at ${width}px`, async ({ page, browser }, info) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const actions = await open(page, width);
    await actions.locator('input[data-status-image="to-read"]').setInputFiles(gifFile);
    await expect(actions.locator('[data-status-image-message]')).toContainText(/原图已保存|Original saved/);
    await expect(page.locator('[data-gallery-user-cropper]')).toHaveCount(0);
    const choice = actions.locator('button[data-action="set-status:to-read"]');
    const image = choice.locator('.status-image');
    await expect(image).toHaveAttribute('data-image-source', 'original');
    expect(await originalHash(image)).toBe(createHash('sha256').update(GIF).digest('hex'));
    expect(await image.evaluate(node => ({ w: (node as HTMLImageElement).naturalWidth, h: (node as HTMLImageElement).naturalHeight }))).toEqual({ w: 120, h: 60 });
    await expectAnimatedImage(image, info);
    await choice.click();
    const action = actions.locator('button[data-action="status"]');
    await expect(action.locator('img')).toHaveAttribute('data-image-source', 'original');
    await expect(action).toHaveAttribute('aria-label', /将读|To read/);
    await expect(action.locator('.status-action-label')).toBeVisible();
    await expect(action.locator('.status-action-label')).toContainText(/将读|To read/);
    await expect(actions.locator('.bar > button.action')).toHaveCount(4);
    await expect(actions.locator('.chip.status img')).toBeVisible();
    await action.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`status-original-${width}.png`), fullPage: false });
    const serialized = JSON.stringify(await state(page));
    expect(serialized.length).toBeLessThan(1_500_000);
    expect(serialized).not.toContain('blob:');
    expect(JSON.parse(serialized).statuses[0].style.imageData).toMatch(/^data:image\/png;base64,/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(action.locator('img')).toHaveAttribute('data-image-source', 'original');
    expect(await originalHash(action.locator('img'))).toBe(createHash('sha256').update(GIF).digest('hex'));
    await action.click();
    await actions.locator('button[data-action="view-status-image:to-read"]').click();
    const viewer = page.locator('dialog[data-status-image-viewer]');
    await expect(viewer).toBeVisible();
    await expect(viewer.locator('img')).toHaveAttribute('data-image-source', 'original');
    const bounds = await viewer.boundingBox();
    expect(bounds!.width).toBeLessThan(width);
    expect(bounds!.height).toBeLessThan(900);
    expect(await originalHash(viewer.locator('img'))).toBe(createHash('sha256').update(GIF).digest('hex'));
    await page.screenshot({ path: info.outputPath(`status-viewer-${width}.png`), fullPage: false });
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);

    const other = await browser.newContext();
    try {
      await isolate(other);
      await other.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: KEY, value: serialized });
      const otherPage = await other.newPage();
      await otherPage.goto('http://127.0.0.1:4173/');
      const otherAction = otherPage.locator('gallery-paper-actions').first().locator('button[data-action="status"]');
      await expect(otherAction.locator('img')).toHaveAttribute('data-image-source', 'preview');
      await expect(otherAction.locator('img')).toHaveAttribute('src', /^data:image\/png/);
      await expect.poll(() => otherAction.locator('img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    } finally { await other.close(); }
    await actions.locator('button[data-action="clear-status-image:to-read"]').click();
    await expect(action.locator('img')).toHaveCount(0);
    await expect(action).toContainText(/将读|To read/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(action.locator('img')).toHaveCount(0);
    expect((await state(page)).statuses[0].style.imageOriginal).toBeUndefined();
    expect(errors).toEqual([]);
  });
}

test('animation evidence rejects an unchanged static preview', async ({ page }, info) => {
  // Negative control: a nonmoving PNG must not satisfy the exact GIF checker.
  // This context contains no Gallery, external scripts or production requests.
  await page.setContent('<img id="still" style="width:72px;height:36px" alt="Static negative control">');
  await page.locator('#still').evaluate(node => {
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 60;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 120, 60);
    (node as HTMLImageElement).src = canvas.toDataURL('image/png');
  });
  let rejected = false;
  try { await expectAnimatedImage(page.locator('#still'), info); }
  catch (error) {
    rejected = true;
    expect(String(error)).toContain('toBeGreaterThan');
  }
  expect(rejected).toBe(true);
});
