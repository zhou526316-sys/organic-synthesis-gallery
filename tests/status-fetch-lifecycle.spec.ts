import { test, expect, type Route } from '@playwright/test';
import { open } from './status-image-fixtures';
import { networkEvidence } from './status-network-evidence';

const PRIMARY = 'https://api.gczhouwld.com';
const WORKER = 'https://organic-synthesis-gallery.zhou526316.workers.dev';
const PATH = '/api/__gallery_lifecycle_probe__';
const URL = `${WORKER}${PATH}?__gallery_lifecycle_probe__=true`;

type Entry = { event?: string; origin?: string; path?: string; documentId?: string; name?: string; aborted?: boolean };
function starts(page: Parameters<typeof open>[0]): Entry[] {
  return (networkEvidence(page.context()) as Entry[]).filter(item => item.event === 'fetch:start' && item.path === PATH);
}

// Every probe is held or fulfilled locally. No feedback, reader marks, or other
// write operations are allowed through to any production API by these tests.
async function holdProbe(page: Parameters<typeof open>[0]): Promise<Route[]> {
  const held: Route[] = [];
  await page.route('**/*__gallery_lifecycle_probe__*', async route => { held.push(route); });
  return held;
}
async function release(held: Route[]): Promise<void> {
  for (const route of held) {
    try { await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:4173' }, body: '{}' }); }
    catch { /* navigation can already have cancelled this deliberately held route */ }
  }
}

test('an already cancelled API call does not start another attempt', async ({ page }) => {
  await open(page);
  await holdProbe(page);
  const result = await page.evaluate(async url => {
    const controller = new AbortController();
    controller.abort();
    try { await fetch(url, { signal: controller.signal }); return 'resolved'; }
    catch (error) { return error instanceof Error ? error.name : 'unknown'; }
  }, URL);
  expect(result).toBe('AbortError');
  expect(starts(page).filter(item => item.origin === WORKER)).toEqual([]);
});

test('cancelling an in-flight API call does not try the backup origin', async ({ page }) => {
  await open(page);
  const held = await holdProbe(page);
  await page.evaluate(url => {
    const root = window as Window & { __probeController?: AbortController; __probeResult?: string };
    root.__probeController = new AbortController();
    void fetch(url, { signal: root.__probeController.signal }).then(() => { root.__probeResult = 'resolved'; }, error => { root.__probeResult = error.name; });
  }, URL);
  await expect.poll(() => held.length).toBe(1);
  await page.evaluate(() => (window as Window & { __probeController?: AbortController }).__probeController?.abort());
  await expect.poll(() => page.evaluate(() => (window as Window & { __probeResult?: string }).__probeResult)).toBe('AbortError');
  expect(starts(page).map(item => item.origin)).toEqual([PRIMARY]);
  await release(held);
});

test('document reload never retries an old pending API request', async ({ page }) => {
  await open(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const held = await holdProbe(page);
  await page.evaluate(url => { void fetch(url).catch(() => {}); }, URL);
  await expect.poll(() => held.length).toBe(1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('gallery-paper-actions').first()).toBeVisible();
  await release(held);
  expect(starts(page).map(item => item.origin)).toEqual([PRIMARY]);
  expect(errors).toEqual([]);
});
