import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { PNG, gifFile, open, originalHash, state } from './status-image-fixtures';

test('30 MB boundary is stored outside preferences; invalid replacement keeps previous image', async ({ page }) => {
  test.setTimeout(90000);
  const actions = await open(page);
  const input = actions.locator('input[data-status-image="to-read"]');
  const full = Buffer.concat([PNG, Buffer.alloc(30_000_000 - PNG.length)]);
  await input.setInputFiles({ name: 'exact-30MB.png', mimeType: 'image/png', buffer: full });
  await expect(actions.locator('[data-status-image-message]')).toContainText(/原图已保存|Original saved/);
  const image = actions.locator('button[data-action="set-status:to-read"] .status-image');
  await expect(image).toHaveAttribute('data-image-source', 'original');
  const expectedHash = createHash('sha256').update(full).digest('hex');
  expect(await originalHash(image)).toBe(expectedHash);
  const before = (await state(page)).statuses[0].style;
  expect(before.imageOriginal.size).toBe(30_000_000);
  expect(before.imageData.length).toBeLessThan(100_000);
  for (const [file, error] of [
    [{ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.concat([full, Buffer.from([0])]) }, /30 MB/],
    [{ name: 'fake.gif', mimeType: 'image/gif', buffer: Buffer.from('<svg></svg>') }, /PNG/],
    [{ name: 'broken.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89abroken') }, /无法解码|cannot be decoded/],
  ] as const) {
    await input.setInputFiles(file);
    await expect(actions.locator('[data-status-image-message]')).toContainText(error);
    expect((await state(page)).statuses[0].style).toEqual(before);
  }
});

for (const failure of ['indexedDB', 'preferences']) {
  test(`storage failure (${failure}) never reports a saved replacement`, async ({ page }) => {
    const actions = await open(page);
    const input = actions.locator('input[data-status-image="to-read"]');
    await input.setInputFiles(gifFile);
    await expect(actions.locator('[data-status-image-message]')).toContainText(/原图已保存|Original saved/);
    const before = (await state(page)).statuses[0].style;
    await page.evaluate(mode => {
      if (mode === 'indexedDB') indexedDB.open = () => { throw new DOMException('Test storage denied', 'SecurityError'); };
      else {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string): void {
          if (key === 'organic-gallery-user-ui-v1') throw new DOMException('Test quota', 'QuotaExceededError');
          original.call(this, key, value);
        };
      }
    }, failure);
    await input.setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: PNG });
    await expect(actions.locator('[data-status-image-message]')).toContainText(/未能保存|Could not save/);
    expect((await state(page)).statuses[0].style).toEqual(before);
    await expect(actions.locator('button[data-action="set-status:to-read"] .status-image')).toHaveAttribute('data-status-asset', before.imageOriginal.id);
  });
}

test('removal while original is loading prevents stale upload from restoring the image', async ({ page }) => {
  const actions = await open(page);
  const input = actions.locator('input[data-status-image="to-read"]');
  await input.setInputFiles(gifFile);
  await expect(actions.locator('[data-status-image-message]')).toContainText(/原图已保存|Original saved/);
  await page.evaluate(() => {
    const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args: Parameters<SubtleCrypto['digest']>) => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return nativeDigest(...args);
    };
  });
  await input.setInputFiles({ name: 'slow-replacement.png', mimeType: 'image/png', buffer: PNG });
  await expect(input).toBeDisabled();
  await actions.locator('button[data-action="clear-status-image:to-read"]').click();
  await expect(input).toBeEnabled({ timeout: 10000 });
  await expect(actions.locator('[data-status-image-message]')).toContainText(/已取消|Cancelled/);
  expect((await state(page)).statuses[0].style.imageOriginal).toBeUndefined();
  await expect(actions.locator('button[data-action="set-status:to-read"] img')).toHaveCount(0);
});
