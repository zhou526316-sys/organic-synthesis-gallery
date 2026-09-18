import { spawn } from 'node:child_process';
import process from 'node:process';
import { chromium } from 'playwright';

const port = 4174;
const base = `http://127.0.0.1:${port}`;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const server = spawn(npm, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, CI: '1' },
});
let output = '';
server.stdout.on('data', chunk => { output += String(chunk); });
server.stderr.on('data', chunk => { output += String(chunk); });

async function waitForServer() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Vite server did not start.\n${output}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('gallery-paper-actions').first().waitFor({ state: 'visible', timeout: 45_000 });
  const host = page.locator('gallery-paper-actions').first();
  await host.scrollIntoViewIfNeeded();

  await page.evaluate(() => {
    const gallery = document.querySelector('#gallery');
    const first = gallery?.querySelector('.card');
    window.__mobileP0 = { first, removedCards: 0, addedCards: 0 };
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.removedNodes) if (node instanceof HTMLElement && node.matches('.card')) window.__mobileP0.removedCards += 1;
        for (const node of record.addedNodes) if (node instanceof HTMLElement && node.matches('.card')) window.__mobileP0.addedCards += 1;
      }
    });
    if (gallery) observer.observe(gallery, { childList: true });
    window.__mobileP0.observer = observer;
  });

  const assertUnlocked = async label => {
    const state = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const drawers = [...document.querySelectorAll('gallery-paper-actions')]
        .filter(host => host.getAttribute('data-drawer-open') === 'true').length;
      const overlays = [...document.querySelectorAll('gallery-paper-actions')]
        .reduce((count, host) => count + (host.shadowRoot?.querySelectorAll('.overlay').length || 0), 0);
      const htmlStyle = getComputedStyle(html);
      const bodyStyle = getComputedStyle(body);
      return {
        drawers,
        overlays,
        htmlOverflow: htmlStyle.overflow,
        bodyOverflow: bodyStyle.overflow,
        htmlClass: html.className,
        bodyClass: body.className,
        sameCard: window.__mobileP0?.first === document.querySelector('#gallery .card'),
      };
    });
    assert(state.drawers === 0, `${label}: drawer flag remains`);
    assert(state.overlays === 0, `${label}: orphan overlay remains`);
    assert(state.htmlOverflow !== 'hidden', `${label}: html overflow is hidden`);
    assert(state.bodyOverflow !== 'hidden', `${label}: body overflow is hidden`);
    assert(!/gallery-user-drawer-open|scroll-lock|scroll-locked|no-scroll/.test(state.htmlClass + ' ' + state.bodyClass), `${label}: scroll-lock class remains`);
    assert(state.sameCard, `${label}: first Gallery card was destroyed/recreated`);
  };

  const assertScrollable = async label => {
    const before = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 120));
    await page.waitForTimeout(20);
    const after = await page.evaluate(() => window.scrollY);
    if (after === before) {
      await page.evaluate(() => window.scrollBy(0, -120));
      await page.waitForTimeout(20);
      const fallback = await page.evaluate(() => window.scrollY);
      assert(fallback !== before, `${label}: page did not scroll in either direction`);
    }
  };

  for (let cycle = 1; cycle <= 30; cycle += 1) {
    await host.locator('[data-action="status"]').click();
    await host.locator('[data-action="set-status:to-read"]').click();
    await assertUnlocked(`cycle ${cycle} to-read`);
    await assertScrollable(`cycle ${cycle} after to-read`);

    await host.scrollIntoViewIfNeeded();
    await host.locator('[data-action="status"]').click();
    await host.locator('[data-action="set-status:skim"]').click();
    await assertUnlocked(`cycle ${cycle} skim`);
    await assertScrollable(`cycle ${cycle} after skim`);

    await host.scrollIntoViewIfNeeded();
    await host.locator('[data-action="note"]').click();
    const note = host.locator('textarea[data-note]');
    await note.fill(`mobile-p0-cycle-${cycle}`);
    await host.locator('[data-action="close"]').click();
    await assertUnlocked(`cycle ${cycle} note-close`);

    await host.locator('[data-action="more"]').click();
    await host.locator('[data-action="close"]').click();
    await assertUnlocked(`cycle ${cycle} more-close`);
  }

  const mutation = await page.evaluate(() => ({
    removedCards: window.__mobileP0?.removedCards || 0,
    addedCards: window.__mobileP0?.addedCards || 0,
  }));
  assert(mutation.removedCards === 0, `Gallery cards removed during personal-state loop: ${mutation.removedCards}`);
  assert(mutation.addedCards === 0, `Gallery cards added during personal-state loop: ${mutation.addedCards}`);

  console.log(JSON.stringify({ cycles: 30, ...mutation, mobileScrollLock: 'passed' }));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
