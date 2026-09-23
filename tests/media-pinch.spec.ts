import { test, expect, type Page, type Locator } from '@playwright/test';

const SITE = process.env.LIVE_SITE_URL || 'http://127.0.0.1:4173/';
test.use({ serviceWorkers: 'block', hasTouch: true });
const evidence = new Map<Page, { errors: string[]; marks: string[] }>();

async function open(page: Page, width = 390): Promise<{ viewport: Locator; image: Locator; controls: Locator }> {
  await page.setViewportSize({ width, height: 900 });
  const record = { errors: [] as string[], marks: [] as string[] }; evidence.set(page, record);
  page.on('pageerror', error => record.errors.push(error.message));
  await page.context().route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (['data:', 'blob:'].includes(url.protocol)) { await route.continue(); return; }
    const headers = { 'access-control-allow-origin': request.headers().origin || new URL(SITE).origin,
      'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] || 'content-type, authorization', 'vary': 'Origin' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/');
    if (['GET', 'HEAD'].includes(request.method()) && !api) { await route.continue(); return; }
    if (url.pathname.endsWith('/reader-counts/mark')) record.marks.push(url.pathname);
    const body = url.pathname.endsWith('/reader-counts') ? { counts: {} }
      : url.pathname.endsWith('/integrations') ? { auth: {}, payments: {} } : { items: [] };
    await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const response = await page.goto(SITE, { waitUntil: 'networkidle' });
  expect(response?.ok()).toBe(true);
  await expect(page.locator('#gallery > .card').first()).toBeVisible();
  await page.evaluate(() => {
    const card = document.createElement('article'); card.id = 'pinch-input-fixture'; card.className = 'card';
    card.style.cssText = 'margin:16px;padding:12px;max-width:300px';
    for (let i = 1; i <= 2; i++) {
      const button = document.createElement('button'); button.className = 'figure-thumb';
      const image = new Image(); image.alt = `Gesture test image ${i}`; image.width = 120;
      // Fixed raster dimensions avoid conflating SVG intrinsic-size reporting
      // with the gesture geometry under test. No product CSS/method is patched.
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1200, 800);
      ctx.strokeStyle = 'black'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(600, 0); ctx.lineTo(600, 800); ctx.moveTo(0, 400); ctx.lineTo(1200, 400); ctx.stroke();
      ctx.fillStyle = 'black'; ctx.font = '42px sans-serif'; ctx.fillText(`Gesture test image ${i}`, 350, 330);
      image.src = canvas.toDataURL('image/png');
      button.append(image); card.append(button);
    }
    document.body.prepend(card);
  });
  await page.locator('#pinch-input-fixture button').first().click();
  await expect(page.locator('.media-viewer')).toBeVisible();
  const image = page.locator('.media-viewer__image');
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1200);
  await expect.poll(() => image.evaluate(node => parseFloat((node as HTMLElement).style.width))).toBeGreaterThan(0);
  return { viewport: page.locator('.media-viewer__viewport'), image, controls: page.locator('.media-viewer__controls') };
}
const scale = (image: Locator) => image.evaluate(node => parseFloat((node as HTMLElement).style.width) / (node as HTMLImageElement).naturalWidth);
const point = (viewport: Locator, event: string, id: number, x: number, y: number, type = 'touch') =>
  viewport.dispatchEvent(event, { pointerId: id, pointerType: type, clientX: x, clientY: y, button: 0, buttons: event === 'pointerup' ? 0 : 1, isPrimary: id === 1 });
async function center(viewport: Locator) {
  const box = (await viewport.boundingBox())!; return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function spread(viewport: Locator, x: number, y: number) {
  await point(viewport, 'pointerdown', 1, x - 35, y);
  await point(viewport, 'pointerdown', 2, x + 35, y);
  await point(viewport, 'pointermove', 1, x - 90, y);
  await point(viewport, 'pointermove', 2, x + 90, y);
}

test.afterEach(async ({ page }, info) => {
  const record = evidence.get(page);
  if (record) {
    await info.attach('gesture-errors-and-reader-marks.json', { body: JSON.stringify(record), contentType: 'application/json' });
    expect(record.errors).toEqual([]); expect(record.marks).toEqual([]);
  }
  evidence.delete(page);
});

for (const width of [390, 1280]) test(`two-pointer zoom preserves focal point and one-finger continuation at ${width}px`, async ({ page }, info) => {
  const { viewport, image } = await open(page, width);
  const c = await center(viewport), oldRect = (await image.boundingBox())!;
  const anchor = { x: (c.x - oldRect.x) / oldRect.width, y: (c.y - oldRect.y) / oldRect.height };
  const initial = await scale(image), source = await image.getAttribute('src'), pageY = await page.evaluate(() => scrollY);
  await spread(viewport, c.x, c.y);
  expect(await scale(image)).toBeCloseTo(initial * 180 / 70, 2);
  const rect = (await image.boundingBox())!;
  expect(Math.abs(rect.x + anchor.x * rect.width - c.x)).toBeLessThan(2);
  expect(Math.abs(rect.y + anchor.y * rect.height - c.y)).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath(`pinch-expanded-${width}.png`) });
  await point(viewport, 'pointerup', 2, c.x + 90, c.y);
  const left = await viewport.evaluate(node => node.scrollLeft);
  await point(viewport, 'pointermove', 1, c.x - 110, c.y);
  expect(await viewport.evaluate(node => node.scrollLeft)).toBeCloseTo(left + 20, 0);
  await point(viewport, 'pointerup', 1, c.x - 110, c.y);
  await expect(viewport).not.toHaveClass(/dragging/);
  expect(await page.evaluate(() => scrollY)).toBe(pageY);
  expect(await image.getAttribute('src')).toBe(source);
});

test('pinch enforces existing scale limits and ignores a third finger', async ({ page }) => {
  const { viewport, image, controls } = await open(page);
  const c = await center(viewport);
  await spread(viewport, c.x, c.y);
  const before = await scale(image);
  await point(viewport, 'pointerdown', 3, c.x, c.y + 80);
  await point(viewport, 'pointermove', 3, c.x + 30, c.y + 150);
  expect(await scale(image)).toBe(before);
  await point(viewport, 'pointerup', 3, c.x + 30, c.y + 150);
  await point(viewport, 'pointermove', 1, c.x - 4000, c.y);
  await point(viewport, 'pointermove', 2, c.x + 4000, c.y);
  expect(await scale(image)).toBe(6);
  await expect(controls.locator('[data-action="zoom-in"]')).toBeDisabled();
  await point(viewport, 'pointermove', 1, c.x - 1, c.y);
  await point(viewport, 'pointermove', 2, c.x + 1, c.y);
  expect(await scale(image)).toBe(0.2);
  await expect(controls.locator('[data-action="zoom-out"]')).toBeDisabled();
});

test('cancel and lost capture do not leave sticky drag or stale pinch state', async ({ page }) => {
  const { viewport, image } = await open(page);
  const c = await center(viewport); await spread(viewport, c.x, c.y);
  await point(viewport, 'pointercancel', 1, c.x - 90, c.y);
  await point(viewport, 'lostpointercapture', 2, c.x + 90, c.y);
  await expect(viewport).not.toHaveClass(/dragging/);
  const before = await scale(image), left = await viewport.evaluate(node => node.scrollLeft);
  await point(viewport, 'pointermove', 1, c.x - 150, c.y);
  expect(await scale(image)).toBe(before);
  expect(await viewport.evaluate(node => node.scrollLeft)).toBe(left);
  await spread(viewport, c.x, c.y);
  expect(await scale(image)).toBeGreaterThan(before);
});

test('image switching, resize and close clear active pointers', async ({ page }) => {
  const { viewport, image, controls } = await open(page);
  const c = await center(viewport); await spread(viewport, c.x, c.y);
  await controls.locator('[data-action="next"]').click();
  await expect(image).toHaveAttribute('alt', 'Gesture test image 2');
  await expect(controls.locator('[data-action="fit"]')).toHaveClass(/active/);
  const fit = await scale(image);
  await point(viewport, 'pointermove', 1, c.x - 180, c.y);
  expect(await scale(image)).toBe(fit);
  await spread(viewport, c.x, c.y);
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(viewport).not.toHaveClass(/dragging/);
  const resized = await scale(image);
  await point(viewport, 'pointermove', 2, c.x + 180, c.y);
  expect(await scale(image)).toBe(resized);
  await controls.locator('[data-action="close"]').click();
  await expect(page.locator('.media-viewer')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.locator('#pinch-input-fixture button').first().click();
  await expect(page.locator('.media-viewer')).toHaveCount(1);
  await expect(page.locator('.media-viewer__viewport')).not.toHaveClass(/dragging/);
});

test('mouse drag, wheel, keyboard and Fit remain usable', async ({ page }) => {
  const { viewport, image, controls } = await open(page, 1280);
  await controls.locator('[data-action="zoom-in"]').click();
  await controls.locator('[data-action="zoom-in"]').click();
  const c = await center(viewport), oldLeft = await viewport.evaluate(node => node.scrollLeft);
  await page.mouse.move(c.x, c.y); await page.mouse.down();
  await page.mouse.move(c.x - 50, c.y, { steps: 5 }); await page.mouse.up();
  expect(await viewport.evaluate(node => node.scrollLeft)).toBeGreaterThan(oldLeft + 40);
  const before = await scale(image); await page.mouse.wheel(0, -100);
  await expect.poll(() => scale(image)).toBeGreaterThan(before);
  await page.keyboard.press('1'); expect(await scale(image)).toBe(1);
  await controls.locator('[data-action="fit"]').click();
  await expect(controls.locator('[data-action="fit"]')).toHaveClass(/active/);
  await page.keyboard.press('Escape'); await expect(page.locator('.media-viewer')).toHaveCount(0);
});

if (process.env.TEST_BROWSER === 'chromium') test('browser-delivered two-touch input zooms the image, not the document', async ({ page }, info) => {
  const { viewport, image } = await open(page);
  const c = await center(viewport), initial = await scale(image);
  const pageScale = await page.evaluate(() => visualViewport?.scale);
  await viewport.evaluate(node => {
    (window as any).__trustedTouches = [];
    node.addEventListener('pointerdown', event => (window as any).__trustedTouches.push({ trusted: (event as PointerEvent).isTrusted, type: (event as PointerEvent).pointerType }));
  });
  const session = await page.context().newCDPSession(page);
  const touches = (distance: number) => [-1, 1].map((sign, id) => ({ id, x: c.x + sign * distance, y: c.y, radiusX: 4, radiusY: 4, force: 1 }));
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(35) });
  for (const distance of [45, 55, 65, 75, 90]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(distance) });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await scale(image)).toBeGreaterThan(initial * 2);
  expect(await page.evaluate(() => visualViewport?.scale)).toBe(pageScale);
  expect(await page.evaluate(() => (window as any).__trustedTouches)).toEqual([{ trusted: true, type: 'touch' }, { trusted: true, type: 'touch' }]);
  await page.screenshot({ path: info.outputPath('browser-delivered-pinch.png') });
  await session.detach();
});
