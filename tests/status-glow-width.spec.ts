import { test, expect, type Page, type Locator } from '@playwright/test';
import { createHash } from 'node:crypto';
import { open, state, KEY, gifFile, GIF, originalHash } from './status-image-fixtures';

test.use({ serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' });
const range = (actions: Locator, id = 'to-read'): Locator => actions.locator(`[data-status-glow-width="${id}"]`);
const button = (actions: Locator): Locator => actions.locator('button[data-action="status"]');
const glowCard = (actions: Locator): Locator => actions.locator('..');
const mode = (actions: Locator, id = 'to-read'): Locator => actions.locator(`[data-status-glow-choice="${id}"]`);
async function widthInStore(page: Page, id = 'to-read'): Promise<number> {
  return (await state(page)).statuses.find((item: any) => item.id === id)?.style.glowWidth ?? 1;
}
async function border(node: Locator): Promise<string> {
  return node.evaluate(element => getComputedStyle(element, '::after').borderTopWidth);
}
async function preview(input: Locator, value: number, commit = false): Promise<void> {
  await input.evaluate((node, data) => {
    (node as HTMLInputElement).value = String(data.value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    if (data.commit) node.dispatchEvent(new Event('change', { bubbles: true }));
  }, { value, commit });
}
async function ready(page: Page, width = 390): Promise<Locator> {
  const actions = await open(page, width);
  await mode(actions).selectOption('soft');
  await actions.locator('[data-action="set-status:to-read"]').click();
  await button(actions).click();
  return actions;
}
function watch(page: Page): { errors: string[]; marks: string[] } {
  const evidence = { errors: [] as string[], marks: [] as string[] };
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/reader-counts/mark')) evidence.marks.push(request.url()); });
  return evidence;
}

for (const viewport of [390, 1280]) {
  test(`real drag previews continuously then persists without resizing the action at ${viewport}px`, async ({ page }, info) => {
    const evidence = watch(page);
    const actions = await ready(page, viewport);
    const input = range(actions);
    await expect(input).toHaveValue('1');
    await expect(input).toHaveAttribute('min', '1'); await expect(input).toHaveAttribute('max', '6');
    const beforeBox = (await button(actions).boundingBox())!;
    const beforeDefinitions = (await state(page)).statuses.map((item: any) => [item.id, item.countsAsRead]);
    await input.evaluate(node => node.setAttribute('data-original-drag-node', 'yes'));
    await input.scrollIntoViewIfNeeded();
    const box = (await input.boundingBox())!;
    await page.mouse.move(box.x + 3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2, { steps: 8 });
    await expect(input).toHaveValue('6');
    await expect(input).toHaveAttribute('data-original-drag-node', 'yes');
    expect(await widthInStore(page)).toBe(1);
    expect(await border(glowCard(actions))).toBe('6px');
    expect(await actions.locator('.chips > .chip.status').evaluate(node => getComputedStyle(node, '::after').content)).toBe('none');
    expect(await actions.locator('[data-action="set-status:to-read"] .status-choice-label').evaluate(node => getComputedStyle(node, '::after').content)).toBe('none');
    expect(await button(actions).evaluate(node => getComputedStyle(node, '::after').content)).toBe('none');
    await expect(actions.locator('[data-status-glow]')).toHaveCount(0);
    await expect(actions.locator('[data-glow-width-value="to-read"]')).toHaveText('6 px');
    await page.mouse.up();
    await expect.poll(() => widthInStore(page)).toBe(6);
    await expect(input).not.toHaveAttribute('data-original-drag-node', 'yes');
    const afterBox = (await button(actions).boundingBox())!;
    expect(afterBox.width).toBe(beforeBox.width); expect(afterBox.height).toBe(beforeBox.height);
    await page.screenshot({ path: info.outputPath(`glow-width-${viewport}-6px.png`) });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => border(glowCard(actions))).toBe('6px');
    await button(actions).click();
    await expect(range(actions)).toHaveValue('6');
    await actions.locator('[data-glow-width-reset="to-read"]').click();
    await expect(range(actions)).toHaveValue('1');
    expect(await widthInStore(page)).toBe(1);
    await expect(mode(actions)).toHaveValue('soft');
    expect((await state(page)).statuses.map((item: any) => [item.id, item.countsAsRead])).toEqual(beforeDefinitions);
    await expect(actions.locator('.bar > button.action')).toHaveCount(4);
    expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
  });
}

test('keyboard steps keep focus after save; reset and Off preserve the selected appearance', async ({ page }) => {
  const evidence = watch(page);
  const actions = await ready(page, 1280);
  await range(actions).focus();
  for (const value of [2, 3, 4]) {
    await page.keyboard.press('ArrowRight');
    await expect(range(actions)).toHaveValue(String(value));
    await expect(range(actions)).toBeFocused();
    expect(await widthInStore(page)).toBe(value);
  }
  await mode(actions).selectOption('none');
  await preview(range(actions), 5, true);
  expect(await widthInStore(page)).toBe(5);
  await expect(glowCard(actions)).toHaveAttribute('data-status-glow', 'none');
  expect(await glowCard(actions).evaluate(node => getComputedStyle(node, '::after').content)).toBe('none');
  await mode(actions).selectOption('pulse');
  expect(await border(glowCard(actions))).toBe('5px');
  await actions.locator('[data-glow-width-reset="to-read"]').focus();
  await page.keyboard.press('Enter');
  await expect(actions.locator('[data-glow-width-reset="to-read"]')).toBeFocused();
  expect(await widthInStore(page)).toBe(1);
  expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
});

test('every glow uses the saved width and reduced motion stops animation, not the thickness', async ({ page }, info) => {
  const evidence = watch(page);
  const actions = await ready(page, 390);
  await preview(range(actions), 6, true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const effect of ['soft', 'pulse', 'orbit', 'rainbow']) {
    await mode(actions).selectOption(effect);
    expect(await border(glowCard(actions))).toBe('6px');
    expect(await glowCard(actions).evaluate(node => getComputedStyle(node, '::after').animationName)).toBe(effect === 'soft' ? 'none' : `status-glow-${effect}`);
    await expect(range(actions)).toHaveValue('6');
  }
  const shadows = await glowCard(actions).evaluate(node => getComputedStyle(node, '::after').boxShadow);
  expect(shadows).toContain('7px'); expect(shadows).toContain('10px');
  await page.screenshot({ path: info.outputPath('glow-width-rainbow-6px.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const effect of ['pulse', 'orbit', 'rainbow']) {
    await mode(actions).selectOption(effect);
    expect(await border(glowCard(actions))).toBe('6px');
    expect(await glowCard(actions).evaluate(node => getComputedStyle(node, '::after').animationName)).toBe('none');
  }
  expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
});

test('storage failure restores saved thickness, appearance and the slider', async ({ page }) => {
  const evidence = watch(page);
  const actions = await ready(page, 1280);
  await preview(range(actions), 2, true);
  const before = (await state(page)).statuses;
  await page.evaluate(key => {
    const native = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('Test storage full', 'QuotaExceededError');
      return native.call(this, name, value);
    };
  }, KEY);
  await preview(range(actions), 6);
  expect(await border(glowCard(actions))).toBe('6px');
  await range(actions).dispatchEvent('change');
  await expect(range(actions)).toHaveValue('2');
  await expect(actions.locator('[data-glow-width-message="to-read"]')).toContainText(/保存失败|Could not save/);
  expect(await border(glowCard(actions))).toBe('2px');
  expect((await state(page)).statuses).toEqual(before);
  expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
});

test('width belongs to each status; malformed and legacy preferences remain bounded', async ({ page }) => {
  const actions = await ready(page, 390);
  await preview(range(actions), 4, true);
  await preview(range(actions, 'skim'), 2, true);
  expect(await widthInStore(page)).toBe(4); expect(await widthInStore(page, 'skim')).toBe(2);
  expect(await border(glowCard(actions))).toBe('4px');
  for (const [raw, expected] of [[null, 1], ['arbitrary-css', 1], [-100, 1], [99, 6], [2.6, 3]] as Array<[unknown, number]>) {
    await page.evaluate(({ key, raw }) => {
      const saved = JSON.parse(localStorage.getItem(key)!);
      saved.statuses.find((item: any) => item.id === 'to-read').style.glowWidth = raw;
      localStorage.setItem(key, JSON.stringify(saved));
    }, { key: KEY, raw });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => border(glowCard(actions))).toBe(`${expected}px`);
    await button(actions).click();
    await expect(range(actions)).toHaveValue(String(expected));
  }
});

test('cancelled or closed previews never leak into persisted settings', async ({ page }) => {
  const evidence = watch(page);
  const actions = await ready(page, 390);
  await preview(range(actions), 5);
  await range(actions).dispatchEvent('pointercancel');
  await expect(range(actions)).toHaveValue('1');
  expect(await border(glowCard(actions))).toBe('1px');
  await preview(range(actions), 6);
  await actions.locator('[data-action="close"]').click();
  expect(await widthInStore(page)).toBe(1);
  expect(await border(glowCard(actions))).toBe('1px');
  await button(actions).click();
  await expect(range(actions)).toHaveValue('1');
  expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
});

test('thick glow does not cover status text or change original GIF bytes on a narrow screen', async ({ page }, info) => {
  const evidence = watch(page);
  const actions = await ready(page, 320);
  await actions.locator('input[data-status-image="to-read"]').setInputFiles(gifFile);
  await expect(actions.locator('[data-status-image-message]')).toContainText(/原图已保存|Original saved/);
  await mode(actions).selectOption('orbit');
  await preview(range(actions), 6, true);
  await expect(button(actions).locator('img')).toHaveAttribute('data-image-source', 'original');
  const expectedHash = createHash('sha256').update(GIF).digest('hex');
  expect(await originalHash(button(actions).locator('img'))).toBe(expectedHash);
  await expect(button(actions).locator('.status-action-label')).toBeVisible();
  const layers = await button(actions).evaluate(node => ({
    caption: Number(getComputedStyle(node.querySelector('.status-action-label')!).zIndex),
    image: Number(getComputedStyle(node.querySelector('img')!).zIndex),
    effect: getComputedStyle(node, '::after').content,
  }));
  expect(layers.caption).toBeGreaterThan(layers.image);
  expect(layers.effect).toBe('none');
  expect(await border(glowCard(actions))).toBe('6px');
  const inputBox = (await range(actions).boundingBox())!;
  expect(inputBox.x).toBeGreaterThanOrEqual(0); expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: info.outputPath('glow-width-original-320px.png') });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(button(actions).locator('img')).toHaveAttribute('data-image-source', 'original');
  expect(await originalHash(button(actions).locator('img'))).toBe(expectedHash);
  expect(await border(glowCard(actions))).toBe('6px');
  await expect(actions.locator('.bar > button.action')).toHaveCount(4);
  expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
});


test('feedback launcher yields to an open editor then restores without losing position', async ({ page }) => {
  const evidence = watch(page);
  const actions = await open(page, 390);
  const launcher = page.locator('site-feedback-widget .site-feedback-tab');
  await actions.locator('[data-action="close"]').click();
  await expect(launcher).toBeVisible();
  const before = (await launcher.boundingBox())!;
  const positionKeys = await page.evaluate(() => [localStorage.getItem('site-feedback-tab-position-v1'), localStorage.getItem('site-feedback-widget-position-v1')]);
  await button(actions).click();
  await expect(range(actions)).toBeVisible();
  await expect(launcher).not.toBeVisible();
  await actions.locator('[data-action="close"]').click();
  await expect(launcher).toBeVisible();
  const after = (await launcher.boundingBox())!;
  expect(after.x).toBe(before.x); expect(after.y).toBe(before.y);
  expect(await page.evaluate(() => [localStorage.getItem('site-feedback-tab-position-v1'), localStorage.getItem('site-feedback-widget-position-v1')])).toEqual(positionKeys);
  await launcher.click();
  await expect(page.locator('.site-feedback-panel')).toBeVisible();
  expect(evidence.errors).toEqual([]); expect(evidence.marks).toEqual([]);
});
