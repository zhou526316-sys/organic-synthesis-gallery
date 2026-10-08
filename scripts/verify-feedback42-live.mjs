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
        const host = [...document.querySelectorAll('gallery-paper-actions')].find(item =>
          item.isConnected && item.shadowRoot?.querySelector('button[data-action="status"]'));
        if (!host) { await nextFrame(); continue; }
        const trigger = host.shadowRoot.querySelector('button[data-action="status"]');
        const viewport = window.visualViewport;
        const vh = viewport?.height ?? innerHeight;
        const targetY = (viewport?.offsetTop ?? 0) + vh * fraction;
        host.style.transform = `translateY(${targetY - trigger.getBoundingClientRect().top}px)`;
        // Keep finding and clicking within one browser evaluation to avoid stale
        // remote element IDs when the gallery rerenders asynchronously.
        host.shadowRoot.querySelector('button[data-action="status"]').click();
        await nextFrame();
        await nextFrame();
        if (!host.isConnected) continue;
        const panel = host.shadowRoot.querySelector('.drawer');
        const currentTrigger = host.shadowRoot.querySelector('button[data-action="status"]');
        if (!panel || !currentTrigger) continue;
        const menu = panel.getBoundingClientRect();
        const anchor = currentTrigger.getBoundingClientRect();
        const top = viewport?.offsetTop ?? 0;
        const bottom = top + vh;
        return {
          attempt, expectedPlacement, actualPlacement: panel.dataset.placement || '',
          anchorState: panel.dataset.anchor || '',
          menuTop: menu.top, menuBottom: menu.bottom,
          triggerTop: anchor.top, triggerBottom: anchor.bottom,
          viewportTop: top, viewportBottom: bottom,
          aboveSpace: anchor.top - top, belowSpace: bottom - anchor.bottom,
          statusChoices: host.shadowRoot.querySelectorAll('button[data-action^="set-status:"]').length,
          popupScrollable: ['auto', 'scroll'].includes(getComputedStyle(panel).overflowY),
          documentContainsHost: host.isConnected,
        };
      }
      return { error: 'No stable action host after ten bounded attempts' };
    }, { expectedPlacement, fraction: expectedPlacement === 'above' ? 0.72 : 0.18 });

    const photo = join(process.env.RUNNER_TEMP || tmpdir(),
      `feedback42-live-${width}-${expectedPlacement}.png`);
    await page.screenshot({ path: photo, timeout: 12000 }).catch(() => {});
    console.log('LIVE_FEEDBACK42_PROBE', JSON.stringify({ width, height, ...result, interceptedWrites }));
    if (!result.error && result.actualPlacement !== expectedPlacement) {
      const assets = await page.evaluate(async () => {
        const scripts = [...document.querySelectorAll('script[src]')].map(el => el.src);
        const latest = scripts.find(url => /\\/assets\\//.test(url)) || scripts[0] || '';
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
