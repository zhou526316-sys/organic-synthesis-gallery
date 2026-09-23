import { test, expect, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { open, state, KEY, gifFile, GIF, originalHash } from './status-image-fixtures';

test.use({ serviceWorkers: 'block' });
const MODES = ['none', 'soft', 'pulse', 'orbit', 'rainbow'];
const choice = (actions: Locator): Locator => actions.locator('[data-status-glow-choice="to-read"]');
const action = (actions: Locator): Locator => actions.locator('button[data-action="status"]');
async function selectStatus(actions: Locator): Promise<void> { await actions.locator('[data-action="set-status:to-read"]').click(); }
async function animation(button: Locator): Promise<string> { return button.evaluate(node => getComputedStyle(node, '::after').animationName); }
function record(page: Page): { errors: string[]; marks: string[] } {
  const result = { errors: [] as string[], marks: [] as string[] };
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/reader-counts/mark')) result.marks.push(request.url()); });
  return result;
}

for (const width of [390, 1280]) {
  test(`glow options persist without changing status or button geometry at ${width}px`, async ({ page }, info) => {
    const evidence = record(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const actions = await open(page, width);
    await expect(choice(actions).locator('option')).toHaveCount(5);
    await expect(choice(actions)).toHaveValue('none');
    const definitions = (await state(page)).statuses.map((item: any) => [item.id, item.countsAsRead]);
    await selectStatus(actions);
    const originalBox = (await action(actions).boundingBox())!;
    const originalClass = await action(actions).getAttribute('class');
    for (const mode of MODES) {
      await action(actions).click();
      await choice(actions).selectOption(mode);
      await expect(action(actions)).toHaveAttribute('data-status-glow', mode);
      expect(await animation(action(actions))).toBe(['none', 'soft'].includes(mode) ? 'none' : `status-glow-${mode}`);
      await expect(actions.locator('.chips > .chip.status')).toHaveAttribute('data-status-glow', mode);
      expect((await state(page)).statuses.find((item: any) => item.id === 'to-read').style.glow).toBe(mode);
      await actions.locator('[data-action="close"]').click();
      expect(await action(actions).getAttribute('class')).toBe(originalClass);
      const box = (await action(actions).boundingBox())!;
      expect(box.width).toBe(originalBox.width); expect(box.height).toBe(originalBox.height);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(action(actions)).toHaveAttribute('data-status-glow', 'rainbow');
    await action(actions).click();
    await choice(actions).selectOption('pulse');
    const initialOpacity = await action(actions).evaluate(node => getComputedStyle(node, '::after').opacity);
    await expect.poll(() => action(actions).evaluate(node => getComputedStyle(node, '::after').opacity), { intervals: [150, 220, 310] }).not.toBe(initialOpacity);
    await actions.locator('input[data-status-color="to-read"]').evaluate(node => {
      (node as HTMLInputElement).value = '#123456'; node.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect.poll(() => action(actions).evaluate(node => getComputedStyle(node).getPropertyValue('--status-glow-rgb').trim())).toBe('18,52,86');
    await page.screenshot({ path: info.outputPath(`status-glow-controls-${width}.png`) });
    await choice(actions).selectOption('none');
    expect(await animation(action(actions))).toBe('none');
    expect((await state(page)).statuses.map((item: any) => [item.id, item.countsAsRead])).toEqual(definitions);
    await expect(actions.locator('.bar > button.action')).toHaveCount(4);
    expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
  });

  test(`status caption overlays bright and dark original images at ${width}px`, async ({ page }, info) => {
    const evidence = record(page);
    const actions = await open(page, width);
    for (const [fill, tone] of [['#ffffff', 'dark'], ['#101010', 'light']]) {
      const base64 = await page.evaluate(fill => {
        const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 60;
        const ctx = canvas.getContext('2d')!; ctx.fillStyle = fill; ctx.fillRect(0, 0, 120, 60);
        return canvas.toDataURL('image/png').split(',')[1];
      }, fill);
      const bytes = Buffer.from(base64, 'base64');
      await actions.locator('input[data-status-image="to-read"]').setInputFiles({ name: 'caption.png', mimeType: 'image/png', buffer: bytes });
      await expect(actions.locator('[data-status-image-message]')).toContainText(/原图已保存|Original saved/);
      await selectStatus(actions);
      await expect(action(actions).locator('.status-action-label')).toBeVisible();
      await expect(action(actions).locator('.status-action-label')).toContainText(/将读|To read/);
      await expect(action(actions)).toHaveAttribute('data-caption-tone', tone);
      await expect(action(actions).locator('img')).toHaveAttribute('data-image-source', 'original');
      expect(await originalHash(action(actions).locator('img'))).toBe(createHash('sha256').update(bytes).digest('hex'));
      const geometry = await action(actions).evaluate(node => {
        const image = node.querySelector('img')!; const caption = node.querySelector('.status-action-label')!;
        return { button: node.getBoundingClientRect().toJSON(), image: image.getBoundingClientRect().toJSON(),
          fit: getComputedStyle(image).objectFit, imageZ: getComputedStyle(image).zIndex, labelZ: getComputedStyle(caption).zIndex,
          color: getComputedStyle(caption).color, surface: getComputedStyle(caption).backgroundColor };
      });
      expect(geometry.fit).toBe('cover');
      expect(Math.abs(geometry.image.width - geometry.button.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.image.height - geometry.button.height)).toBeLessThanOrEqual(1);
      expect(Number(geometry.labelZ)).toBeGreaterThan(Number(geometry.imageZ));
      expect(geometry.color).toBe(tone === 'dark' ? 'rgb(17, 24, 39)' : 'rgb(255, 255, 255)');
      await action(actions).scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`status-caption-${tone}-${width}.png`) });
      await action(actions).click();
    }
    await actions.locator('input[data-status-image="to-read"]').setInputFiles(gifFile);
    await expect(actions.locator('[data-status-image-message]')).toContainText(/原图已保存|Original saved/);
    await choice(actions).selectOption('orbit');
    await selectStatus(actions);
    await expect(action(actions).locator('img')).toHaveAttribute('data-image-source', 'original');
    expect(await originalHash(action(actions).locator('img'))).toBe(createHash('sha256').update(GIF).digest('hex'));
    await expect(action(actions).locator('.status-action-label')).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(action(actions)).toHaveAttribute('data-status-glow', 'orbit');
    await expect(action(actions).locator('.status-action-label')).toBeVisible();
    await action(actions).click();
    await actions.locator('[data-action="clear-status-image:to-read"]').click();
    await expect(action(actions).locator('img')).toHaveCount(0);
    await expect(action(actions)).toHaveAttribute('data-status-glow', 'orbit');
    await expect(action(actions)).toHaveAttribute('aria-label', /将读|To read/);
    expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
  });
}

test('reduced motion keeps chosen glow static and leaves four buttons intact', async ({ page }) => {
  const actions = await open(page, 390);
  await selectStatus(actions);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const mode of ['pulse', 'orbit', 'rainbow']) {
    await action(actions).click(); await choice(actions).selectOption(mode);
    await expect(action(actions)).toHaveAttribute('data-status-glow', mode);
    expect(await animation(action(actions))).toBe('none');
    await actions.locator('[data-action="close"]').click();
  }
  await expect(actions.locator('.bar > button.action')).toHaveCount(4);
});

test('failed preference save rolls back glow and reports the failure', async ({ page }) => {
  const evidence = record(page);
  const actions = await open(page, 1280);
  await choice(actions).selectOption('soft');
  const before = JSON.stringify(await state(page));
  await page.evaluate(key => {
    const native = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('Full', 'QuotaExceededError'); return native.call(this, name, value); };
  }, KEY);
  await choice(actions).selectOption('rainbow');
  await expect(choice(actions)).toHaveValue('soft');
  await expect(actions.locator('[data-status-glow-message="to-read"]')).toContainText(/保存失败|Could not save/);
  expect(JSON.stringify(await state(page))).toBe(before);
  expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
});

test('unknown saved glow values render as off rather than arbitrary CSS', async ({ page }) => {
  const actions = await open(page, 390);
  await selectStatus(actions);
  await page.evaluate(key => {
    const data = JSON.parse(localStorage.getItem(key)!); data.statuses[0].style.glow = 'invalid-css-value'; localStorage.setItem(key, JSON.stringify(data));
  }, KEY);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(action(actions)).toHaveAttribute('data-status-glow', 'none');
  await action(actions).click(); await expect(choice(actions)).toHaveValue('none');
});
