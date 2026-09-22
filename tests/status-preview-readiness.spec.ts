import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { GIF, gifFile, open, originalHash, state } from './status-image-fixtures';

const DB = 'organic-gallery-status-images-v1';
type Gate = { calls: number; completed: number; release: () => void };

async function seed(page: Page, width = 390): Promise<void> {
  const actions = await open(page, width);
  await actions.locator('input[data-status-image="to-read"]').setInputFiles(gifFile);
  await expect(actions.locator('[data-status-image-message]')).toContainText(/原图已保存|Original saved/);
}

async function gateStorageOnReload(page: Page, denied = false): Promise<void> {
  await page.addInitScript(({ dbName, denied }) => {
    const native = IDBFactory.prototype.open;
    let released = false;
    const waiting: Array<() => void> = [];
    const gate: Gate = { calls: 0, completed: 0, release: () => { released = true; waiting.splice(0).forEach(start => start()); } };
    (window as Window & { __previewStorageGate: Gate }).__previewStorageGate = gate;
    IDBFactory.prototype.open = function (name: string, version?: number): IDBOpenDBRequest {
      if (name !== dbName || released) return version === undefined ? native.call(this, name) : native.call(this, name, version);
      gate.calls += 1;
      if (denied) throw new DOMException('Isolated test storage denial', 'SecurityError');
      // Delay the actual open rather than changing app timeouts. When released,
      // forward native results/events so the original bytes still come from IDB.
      const held = new EventTarget() as IDBOpenDBRequest;
      waiting.push(() => {
        const request = version === undefined ? native.call(this, name) : native.call(this, name, version);
        Object.defineProperty(held, 'result', { get: () => request.result });
        Object.defineProperty(held, 'error', { get: () => request.error });
        for (const name of ['success', 'error', 'blocked', 'upgradeneeded']) request.addEventListener(name, event => {
          if (name === 'success' || name === 'error') gate.completed += 1;
          const callback = (held as unknown as Record<string, ((event: Event) => void) | undefined>)[`on${name}`];
          callback?.call(held, event);
        });
      });
      return held;
    };
  }, { dbName: DB, denied });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('gallery-paper-actions').first().locator('button[data-action="status"]').click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __previewStorageGate: Gate }).__previewStorageGate.calls)).toBeGreaterThan(0);
}

async function releaseStorage(page: Page): Promise<void> {
  await page.evaluate(() => (window as Window & { __previewStorageGate: Gate }).__previewStorageGate.release());
  await expect.poll(() => page.evaluate(() => (window as Window & { __previewStorageGate: Gate }).__previewStorageGate.completed)).toBeGreaterThan(0);
}

for (const width of [390, 1280]) {
  test(`preview and viewer are usable before the local original resolves at ${width}px`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await seed(page, width);
    const before = (await state(page)).statuses[0].style;
    await gateStorageOnReload(page);
    const actions = page.locator('gallery-paper-actions').first();
    const image = actions.locator('button[data-action="set-status:to-read"] .status-image');
    await expect(image).toHaveAttribute('data-image-source', 'preview');
    await expect(image).toHaveAttribute('data-original-state', 'pending');
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await actions.locator('button[data-action="view-status-image:to-read"]').click();
    const viewer = page.locator('dialog[data-status-image-viewer]');
    await expect(viewer).toBeVisible();
    await expect(viewer.locator('img')).toHaveAttribute('data-image-source', 'preview');
    await expect(viewer).toContainText(/正在读取本地原图|loading the local original/);
    expect(await page.evaluate(() => (window as Window & { __previewStorageGate: Gate }).__previewStorageGate.completed)).toBe(0);
    await releaseStorage(page);
    await expect(image).toHaveAttribute('data-image-source', 'original');
    await expect(viewer.locator('img')).toHaveAttribute('data-image-source', 'original');
    expect(await originalHash(viewer.locator('img'))).toBe(createHash('sha256').update(GIF).digest('hex'));
    expect((await state(page)).statuses[0].style).toEqual(before);
    const bounds = await viewer.boundingBox();
    expect(bounds!.width).toBeLessThan(width);
    await page.screenshot({ path: info.outputPath(`preview-upgraded-${width}.png`) });
    expect(errors).toEqual([]);
  });
}

test('denied local storage keeps decoded previews and the viewer usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await seed(page);
  const before = (await state(page)).statuses[0].style;
  await gateStorageOnReload(page, true);
  const actions = page.locator('gallery-paper-actions').first();
  const image = actions.locator('button[data-action="set-status:to-read"] .status-image');
  await expect(image).toHaveAttribute('data-image-source', 'preview');
  await expect(image).toHaveAttribute('data-original-state', 'unavailable');
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await actions.locator('button[data-action="view-status-image:to-read"]').click();
  const viewer = page.locator('dialog[data-status-image-viewer]');
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText(/无可用原图|Original unavailable/);
  await expect(viewer.locator('img')).toHaveAttribute('data-image-source', 'preview');
  expect((await state(page)).statuses[0].style).toEqual(before);
  expect(errors).toEqual([]);
});

test('closing the pending viewer and removing artwork prevents late restoration', async ({ page }) => {
  await seed(page);
  await gateStorageOnReload(page);
  const actions = page.locator('gallery-paper-actions').first();
  await actions.locator('button[data-action="view-status-image:to-read"]').click();
  const viewer = page.locator('dialog[data-status-image-viewer]');
  await expect(viewer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await actions.locator('button[data-action="clear-status-image:to-read"]').click();
  await releaseStorage(page);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(viewer).toHaveCount(0);
  await expect(actions.locator('button[data-action="set-status:to-read"] img')).toHaveCount(0);
  expect((await state(page)).statuses[0].style.imageOriginal).toBeUndefined();
});

test('undecodable stored original never replaces the displayed preview', async ({ page }) => {
  await seed(page);
  const before = (await state(page)).statuses[0].style;
  await page.evaluate(async ({ name, id }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('originals', 'readwrite');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
        tx.objectStore('originals').put({ bytes: new TextEncoder().encode('not-an-image').buffer, type: 'image/gif' }, id);
      };
    });
  }, { name: DB, id: before.imageOriginal.id });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const actions = page.locator('gallery-paper-actions').first();
  await actions.locator('button[data-action="status"]').click();
  const image = actions.locator('button[data-action="set-status:to-read"] .status-image');
  await expect(image).toHaveAttribute('data-original-state', 'unavailable');
  await expect(image).toHaveAttribute('data-image-source', 'preview');
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await actions.locator('button[data-action="view-status-image:to-read"]').click();
  const viewer = page.locator('dialog[data-status-image-viewer]');
  await expect(viewer).toContainText(/无可用原图|Original unavailable/);
  await expect(viewer.locator('img')).toHaveAttribute('data-image-source', 'preview');
  expect((await state(page)).statuses[0].style).toEqual(before);
});
