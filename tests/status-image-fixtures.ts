import { expect, type Page, type BrowserContext, type Locator } from '@playwright/test';
import { recordStatusNetwork } from './status-network-evidence';
export const KEY = 'organic-gallery-user-ui-v1';
export const GIF = Buffer.from('R0lGODlheAA8AIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAKAAAACwAAAAAeAA8AAAIigABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJsqXLlzBjypxJs6bNmzhz6tzJs6fPn0CDCh1KtKjRo0iTKl3KtKnTp1CjSp1KtarVq1izat3KtavXr2DDih1LtqzZs2jTql3Ltq3bt3Djyp1Lt67duzwDAgAh+QQBKAABACwAAAAAeAA8AIEAAP8AAAAAAAAAAAAIigABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJsqXLlzBjypxJs6bNmzhz6tzJs6fPn0CDCh1KtKjRo0iTKl3KtKnTp1CjSp1KtarVq1izat3KtavXr2DDih1LtqzZs2jTql3Ltq3bt3Djyp1Lt67duzwDAgA7', 'base64');
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
export const gifFile = { name: 'animated-status.gif', mimeType: 'image/gif', buffer: GIF };

export async function isolate(context: BrowserContext): Promise<void> {
  await recordStatusNetwork(context);
  // No production traffic, including reader events, feedback, accounts or media writes.
  await context.route('**/*', async route => {
    const request = route.request();
    const url = request.url();
    if (url.startsWith('http://127.0.0.1:4173/') || url.startsWith('blob:') || url.startsWith('data:')) { await route.continue(); return; }
    // Synthetic cross-origin responses must satisfy browser CORS checks too.
    // Keep the page-error assertions; do not mistake a fixture error for an app error.
    const headers = {
      'access-control-allow-origin': request.headers().origin || 'http://127.0.0.1:4173',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] || 'content-type, authorization',
      'access-control-allow-methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
      'vary': 'Origin',
    };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    const body = url.includes('/reader-counts') ? { counts: {}, count: 0 }
      : url.includes('/integrations') ? { auth: { google: false, wechat: false, qq: false, email: false }, payments: { wechat: false, alipay: false } }
      : { items: [], generatedAt: Date.now() };
    await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
export async function open(page: Page, width = 390): Promise<Locator> {
  page.on('console', message => { if (message.text().startsWith('status-image-error')) console.log(message.text()); });
  await isolate(page.context());
  await page.setViewportSize({ width, height: 900 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  console.log('image capabilities', await page.evaluate(() => ({ secure: isSecureContext, digest: typeof crypto.subtle?.digest, database: typeof indexedDB.open, arrayBuffer: typeof Blob.prototype.arrayBuffer })));
  const actions = page.locator('gallery-paper-actions').first();
  await expect(actions).toBeVisible({ timeout: 30000 });
  await actions.locator('button[data-action="status"]').click();
  return actions;
}
export async function originalHash(image: Locator): Promise<string> {
  return image.evaluate(async element => {
    const data = await (await fetch((element as HTMLImageElement).src)).arrayBuffer();
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), value => value.toString(16).padStart(2, '0')).join('');
  });
}
export async function state(page: Page): Promise<any> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), KEY);
}
