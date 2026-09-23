import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { open, gifFile, GIF, state, originalHash } from './status-image-fixtures';
test.use({ serviceWorkers: 'block' });

test('a loaded original does not remain pending when decode stalls; repeated renders share validation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const actions = await open(page, 1280);
  await page.evaluate(() => {
    const native = HTMLImageElement.prototype.decode;
    (window as any).__blobDecodeCalls = [];
    HTMLImageElement.prototype.decode = function () {
      if (this.src.startsWith('blob:')) {
        (window as any).__blobDecodeCalls.push(this.src);
        // Load still fires and dimensions are genuine; only decode stays pending.
        return new Promise<void>(() => {});
      }
      return native.call(this);
    };
  });
  await actions.locator('[data-status-image="to-read"]').setInputFiles(gifFile);
  await expect(actions.locator('[data-status-image-message]')).toContainText(/原图已保存|Original saved/);
  const choice = actions.locator('[data-action="set-status:to-read"]');
  await expect(choice.locator('img')).toHaveAttribute('data-image-source', 'original');
  await choice.click();
  const button = actions.locator('[data-action="status"]');
  await expect(button.locator('img')).toHaveAttribute('data-image-source', 'original');
  const url = await button.locator('img').getAttribute('src');
  for (const color of ['#123456', '#abcdef', '#654321']) {
    await button.click();
    await actions.locator('[data-status-color="to-read"]').evaluate((node, color) => {
      (node as HTMLInputElement).value = color;
      node.dispatchEvent(new Event('change', { bubbles: true }));
    }, color);
    await expect(button.locator('img')).toHaveAttribute('data-image-source', 'original');
    await actions.locator('[data-action="close"]').click();
  }
  expect(await page.evaluate(url => (window as any).__blobDecodeCalls.filter((item: string) => item === url).length, url)).toBe(1);
  expect(await originalHash(button.locator('img'))).toBe(createHash('sha256').update(GIF).digest('hex'));
  expect(errors).toEqual([]);
});

test('corrupt original never replaces a valid synced preview', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const actions = await open(page, 390);
  await actions.locator('[data-status-image="to-read"]').setInputFiles(gifFile);
  await expect(actions.locator('[data-status-image-message]')).toContainText(/原图已保存|Original saved/);
  await actions.locator('[data-action="set-status:to-read"]').click();
  const saved = (await state(page)).statuses.find((item: any) => item.id === 'to-read').style;
  await page.evaluate(id => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('organic-gallery-status-images-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('originals', 'readwrite');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
      tx.objectStore('originals').put({ bytes: new Uint8Array([0, 1, 2, 3]).buffer, type: 'image/gif' }, id);
    };
  }), saved.imageOriginal.id);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const image = actions.locator('[data-action="status"] img');
  await expect(image).toHaveAttribute('data-original-state', 'unavailable');
  await expect(image).toHaveAttribute('data-image-source', 'preview');
  await expect(image).toHaveAttribute('src', saved.imageData);
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('same-origin API POST is isolated from the static preview server', async ({ page }) => {
  await open(page, 390);
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/media/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    return { status: response.status, json: await response.json() };
  });
  expect(result.status).toBe(200);
  expect(result.json.items).toEqual([]);
});
