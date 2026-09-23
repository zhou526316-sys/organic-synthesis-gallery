import { test, expect } from '@playwright/test';
import { open, state } from './status-image-fixtures';

test.use({ serviceWorkers: 'block' });
for (const width of [390, 1280]) {
  test(`glow belongs to the whole literature card and not its controls at ${width}px`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const actions = await open(page, width);
    const card = actions.locator('..');
    const statusButton = actions.locator('[data-action="status"]');
    const before = (await card.boundingBox())!;
    const originalButton = (await statusButton.boundingBox())!;
    await expect(actions.locator('.status-glow-control > span')).toHaveText(/卡片光效|Card glow/);
    await expect(actions.locator('.status-glow-width-control > label')).toHaveText(/卡片光效粗细|Card glow thickness/);
    await actions.locator('[data-status-glow-choice="to-read"]').selectOption('orbit');
    const slider = actions.locator('[data-status-glow-width="to-read"]');
    await slider.evaluate(node => {
      (node as HTMLInputElement).value = '6';
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await actions.locator('[data-action="set-status:to-read"]').click();
    await expect(card).toHaveAttribute('data-card-glow', 'orbit');
    const edge = await card.evaluate(node => {
      const effect = getComputedStyle(node, '::after');
      return { width: effect.borderTopWidth, inset: effect.inset, pointer: effect.pointerEvents, size: node.getBoundingClientRect().toJSON() };
    });
    expect(edge.width).toBe('6px'); expect(edge.inset).toBe('0px'); expect(edge.pointer).toBe('none');
    expect(edge.size.width).toBe(before.width); expect(edge.size.height).toBe(before.height);
    const afterButton = (await statusButton.boundingBox())!;
    expect(afterButton.width).toBe(originalButton.width); expect(afterButton.height).toBe(originalButton.height);
    await expect(actions.locator('[data-status-glow],[data-card-glow]')).toHaveCount(0);
    const unwanted = await actions.locator('.bar > button.action,.chip.status,.status-choice-label').evaluateAll(nodes => nodes.map(node => ({
      text: node.textContent, content: getComputedStyle(node, '::after').content, animation: getComputedStyle(node, '::after').animationName,
    })).filter(item => !['none', 'normal'].includes(item.content) || item.animation !== 'none'));
    expect(unwanted).toEqual([]);
    await expect(page.locator('#gallery > .card').nth(1)).toHaveAttribute('data-card-glow', 'none');
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: info.outputPath(`whole-card-glow-${width}.png`) });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(card).toHaveAttribute('data-card-glow', 'orbit');
    expect((await state(page)).statuses.find((s: any) => s.id === 'to-read').style.glowWidth).toBe(6);
    await statusButton.click();
    await actions.locator('[data-status-glow-choice="to-read"]').selectOption('none');
    await expect(card).toHaveAttribute('data-card-glow', 'none');
    expect(await card.evaluate(node => getComputedStyle(node, '::after').content)).toBe('none');
    expect(await card.evaluate(node => getComputedStyle(node).animationName)).toBe('none');
    expect(errors).toEqual([]);
  });
}
