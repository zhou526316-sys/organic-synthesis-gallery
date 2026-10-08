// Read-only PR #419 verification against the real custom-domain frontend.
// Click only the status MENU trigger; never select a status or write user data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const origin = 'https://gallery.gczhouwld.com';
const browser = await chromium.launch();
const reports = [];

async function verify(width, height, expectedPlacement) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: 'zh-CN',
    serviceWorkers: 'block',
  });
  let interceptedWrites = 0;
  await context.route('**/*', async route => {
    const request = route.request();
    if (!new URL(request.url()).pathname.startsWith('/api/') ||
        request.method() === 'GET' || request.method() === 'HEAD') {
      await route.continue();
      return;
    }
    // Even unexpected POSTs must never touch production from this anonymous QA.
    interceptedWrites += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': request.headers().origin || origin,
        'access-control-allow-credentials': 'true',
      },
      body: JSON.stringify({ ok: true, items: [], counts: {} }),
    });
  });
  const page = await context.newPage();
  try {
    await page.goto(origin + '/?feedback42-live-qa=1', {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    await page.waitForFunction(() => [...document.querySelectorAll('gallery-paper-actions')]
      .some(host => host.shadowRoot?.querySelector('button[data-action="status"]')), null, { timeout: 45000 });

    const result = await page.evaluate(async ({ expectedPlacement, fraction }) => {
      const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
      for (let attempt = 1; attempt <= 10; attempt++) {
        const findHost = () => [...document.querySelectorAll('gallery-paper-actions')].find(item =>
          item.isConnected && item.shadowRoot?.querySelector('button[data-action="status"]'));
        const host = findHost();
        if (!host) { await nextFrame(); continue; }
        const viewport = window.visualViewport;
        const vh = viewport?.height ?? innerHeight;
        const targetY = (viewport?.offsetTop ?? 0) + vh * fraction;
        const trigger = host.shadowRoot.querySelector('button[data-action="status"]');
        // Scroll the ACTUAL live card into view rather than translating a
        // content-visibility:auto card that the browser may not paint.
        window.scrollBy(0, trigger.getBoundingClientRect().top - targetY);
        await nextFrame();
        const activeHost = host.isConnected ? host : findHost();
        if (!activeHost) continue;
        const activeTrigger = activeHost.shadowRoot?.querySelector('button[data-action="status"]');
        if (!activeTrigger) continue;
        if (Math.abs(activeTrigger.getBoundingClientRect().top - targetY) > 42) {
          await nextFrame();
          continue;
        }
        // Atomic DOM click bypasses remote element IDs invalidated by
        // asynchronous updates to the card list. No status is selected.
        activeTrigger.click();
        await nextFrame();
        await nextFrame();
        if (!activeHost.isConnected) continue;
        const panel = activeHost.shadowRoot?.querySelector('.drawer');
        const currentTrigger = activeHost.shadowRoot?.querySelector('button[data-action="status"]');
        if (!panel || !currentTrigger) continue;
        const menu = panel.getBoundingClientRect();
        const anchor = currentTrigger.getBoundingClientRect();
        const top = viewport?.offsetTop ?? 0;
        const bottom = top + vh;
        const x = Math.max(5, Math.min(innerWidth - 5, menu.left + Math.min(85, menu.width / 2)));
        const y = Math.max(top + 5, Math.min(bottom - 5, menu.top + Math.min(75, menu.height / 2)));
        const hit = document.elementFromPoint(x, y);
        const painted = hit === activeHost || hit?.closest('gallery-paper-actions') === activeHost;
        return {
          attempt, expectedPlacement, actualPlacement: panel.dataset.placement || '',
          anchorState: panel.dataset.anchor || '',
          menuTop: menu.top, menuBottom: menu.bottom,
          triggerTop: anchor.top, triggerBottom: anchor.bottom,
          viewportTop: top, viewportBottom: bottom,
          aboveSpace: anchor.top - top, belowSpace: bottom - anchor.bottom,
          statusChoices: activeHost.shadowRoot.querySelectorAll('button[data-action^="set-status:"]').length,
          popupScrollable: ['auto', 'scroll'].includes(getComputedStyle(panel).overflowY),
          documentContainsHost: activeHost.isConnected,
          menuPainted: painted, hitTag: hit?.tagName || '', targetY,
        };
      }
      return { error: 'No stable action host after ten bounded attempts' };
    }, { expectedPlacement, fraction: expectedPlacement === 'above' ? 0.64 : 0.18 });

    const photo = join(process.env.RUNNER_TEMP || tmpdir(),
      `feedback42-live-${width}-${expectedPlacement}.png`);
    await page.screenshot({ path: photo, timeout: 12000 }).catch(() => {});
    console.log('LIVE_FEEDBACK42_PROBE', JSON.stringify({ width, height, ...result, interceptedWrites }));
    if (!result.error && result.actualPlacement !== expectedPlacement) {
      const assets = await page.evaluate(async () => {
        const scripts = [...document.querySelectorAll('script[src]')].map(el => el.src);
        const latest = scripts.find(url => url.includes('/assets/')) || scripts[0] || '';
        try {
          const body = latest ? await fetch(latest, { cache: 'no-store' }).then(r => r.text()) : '';
          return { latestScript: latest, scriptLength: body.length,
            containsNewPlacementCode: body.includes('dataset.placement'),
            containsNewVisualViewport: body.includes('visualViewport') };
        } catch (error) { return { latestScript: latest, error: String(error) }; }
      });
      console.log('LIVE_FEEDBACK42_BUNDLE', JSON.stringify(assets));
    }
    assert.ok(!result.error, result.error || 'Unexpected live QA failure');
    assert.equal(result.actualPlacement, expectedPlacement,
      'The LIVE deployed menu lacks the expected PR #419 placement');
    assert.ok(result.statusChoices > 0, 'No visible status choices were rendered');
    assert.equal(result.popupScrollable, true, 'Long status lists must remain scrollable');
    assert.ok(result.documentContainsHost, 'Status button host was detached');
    assert.equal(result.menuPainted, true, 'Popup geometry exists but is not painted above other UI');
    assert.ok(result.menuTop >= result.viewportTop + 5, 'Menu overflowed viewport top');
    assert.ok(result.menuBottom <= result.viewportBottom - 5, 'Menu overflowed viewport bottom');
    if (expectedPlacement === 'above') {
      assert.ok(result.aboveSpace > result.belowSpace, 'Expected more space above');
      assert.ok(result.menuBottom <= result.triggerTop - 4, 'Menu failed to open above');
    } else {
      assert.ok(result.belowSpace > result.aboveSpace, 'Expected more space below');
      assert.ok(result.menuTop >= result.triggerBottom + 4, 'Menu failed to open below');
    }
    reports.push({ width, height, ...result, interceptedWrites });
  } finally {
    await context.close();
  }
}

try {
  for (const [width, height] of [[390, 844], [1280, 900]]) {
    await verify(width, height, 'above');
    await verify(width, height, 'below');
  }
  console.log(JSON.stringify({ ok: true, version: 'feedback42-pr419',
    realOrigin: origin, scenarios: reports }));
} finally {
  await browser.close();
}
