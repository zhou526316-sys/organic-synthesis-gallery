import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://gallery.gczhouwld.com/';
const ANGeW = '10.1002/anie.4335022';
const BODY_SAMPLE = '10.1021/acscatal.6c06476';
const BAD_MIRROR = 'worker-52eb28218d55f8af1d17e0f35ab4.png';
const reportDir = path.join(process.env.RUNNER_TEMP || '/tmp', 'gallery-live-home-qa');
const report = {
  schemaVersion: 'gallery-live-home-readonly-v1',
  checkedAt: new Date().toISOString(),
  site: SITE,
  readOnly: true,
  publishingActions: 0,
  editingActions: 0,
  userDataActions: 0,
  browser: 'chromium',
  probes: [],
};
await mkdir(reportDir, { recursive: true });

function captureNetwork(page) {
  const errors = [];
  const failedRequests = [];
  const relevant = url => /(?:release-delivery\.json|architecture-v1\/release\.json|media-index\.json|\/api\/media\/batch)/.test(url);
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => {
    if (relevant(request.url())) failedRequests.push({ url: request.url().slice(0,230), reason: request.failure()?.errorText || '' });
  });
  const status = [];
  page.on('response', response => {
    if (relevant(response.url())) status.push({ url: response.url().slice(0,230), status: response.status() });
  });
  return { errors, failedRequests, status };
}

async function readUi(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('#gallery .card')];
    const imageList = cards.flatMap(card => [...card.querySelectorAll('img.toc-image')]);
    const displayed = imageList.filter(img => img.complete && img.naturalWidth > 0);
    const resource = performance.getEntriesByType('resource').map(e => ({
      name: String(e.name || ''), duration: Math.round(e.duration), bytes: Number(e.transferSize || 0),
    }));
    return {
      cards: cards.length,
      resultCount: document.querySelector('#resultCount')?.textContent?.trim() || '',
      error: document.querySelector('#app .error')?.textContent?.trim().slice(0,700) || '',
      searchPresent: Boolean(document.querySelector('#search')),
      imageElements: imageList.length,
      loadedTocs: displayed.length,
      firstTocUrl: imageList[0]?.currentSrc || imageList[0]?.src || '',
      mediaIndexReads: resource.filter(e => /\/media-index\.json/.test(e.name)),
      deliveryReads: resource.filter(e => /\/release-delivery\.json/.test(e.name)),
      architectureReleaseReads: resource.filter(e => /\/architecture-v1\/release\.json/.test(e.name)),
      mediaBatchReads: resource.filter(e => /\/api\/media\/batch/.test(e.name)),
      catalogRead: document.documentElement.dataset.catalogRead || '',
    };
  });
}

async function waitForContent(page) {
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('#gallery .card').length > 0 || Boolean(document.querySelector('#app .error')),
      null, { timeout: 42000, polling: 500 },
    );
  } catch {
    // Preserve detailed evidence and fail below rather than concealing an empty shell.
  }
}

const browser = await chromium.launch({ headless: true });
let failed = false;
try {
  for (const viewport of [{ width:390, height:844 },{ width:1280, height:900 }]) {
    const context = await browser.newContext({
      viewport, locale:'zh-CN', serviceWorkers:'block', ignoreHTTPSErrors:false,
    });
    const page = await context.newPage();
    const network = captureNetwork(page);
    const started = Date.now();
    let navigationError = '';
    try {
      await page.goto(SITE, { waitUntil:'domcontentloaded', timeout:35000 });
      await waitForContent(page);
      // Measure first decoded media paint rather than conflating quick card
      // skeleton creation with an actually visible chemical graphic.
      if ((await readUi(page)).cards > 0) {
        try {
          await page.waitForFunction(() =>
            [...document.querySelectorAll('#gallery img.toc-image')].some(img => img.complete && img.naturalWidth > 0),
            null, { timeout:18000, polling:200 });
        } catch { /* Preserve a missing media paint as an explicit null. */ }
      }
    } catch (error) { navigationError = String(error).slice(0,400); }
    const coldUi = await readUi(page);
    const cold = {
      viewport, phase:'cold', elapsedMs:Date.now()-started,
      firstTocPaintMs:coldUi.loadedTocs > 0 ? Date.now()-started : null,
      url:page.url(), navigationError, ...coldUi,
      errors:[...network.errors], failedRequests:[...network.failedRequests], status:[...network.status],
    };
    report.probes.push(cold);
    await page.screenshot({ path:path.join(reportDir, 'gallery-' + viewport.width + '-cold.png') }).catch(() => {});
    if (cold.error || cold.cards === 0 || navigationError) {
      failed = true;
      await context.close();
      continue;
    }

    const warmStarted = Date.now();
    await page.reload({ waitUntil:'domcontentloaded', timeout:35000 });
    await waitForContent(page);
    try {
      await page.waitForFunction(() =>
        [...document.querySelectorAll('#gallery img.toc-image')].some(img => img.complete && img.naturalWidth > 0),
        null, { timeout:15000, polling:200 });
    } catch {}
    const warmUi = await readUi(page);
    const warm = {
      viewport, phase:'warm', elapsedMs:Date.now()-warmStarted,
      firstTocPaintMs:warmUi.loadedTocs > 0 ? Date.now()-warmStarted : null,
      ...warmUi,
    };
    report.probes.push(warm);
    if (warm.error || warm.cards === 0) failed = true;

    // Search is intentionally read-only; do not modify account, feedback or PDF.
    if (viewport.width === 1280) {
      const search = page.locator('#search');
      if (await search.count()) {
        await search.fill(ANGeW);
        const slot = page.locator('.toc-slot[data-doi="' + ANGeW + '"]').first();
        let found = false;
        try { await slot.waitFor({ state:'visible', timeout:25000 }); found = true; } catch {}
        if (found) {
          await page.waitForTimeout(2500);
          const image = await slot.locator('img.toc-image').first();
          const src = await image.count() ? await image.getAttribute('src') : '';
          const loaded = await image.count() ? await image.evaluate(el => el.complete && el.naturalWidth > 0) : false;
          report.angew = { found, src, loaded, wrongOldMirror: Boolean(src?.includes(BAD_MIRROR)) };
          if (!loaded || report.angew.wrongOldMirror) failed = true;
        } else {
          report.angew = { found:false, cards:(await readUi(page)).cards, error:(await readUi(page)).error };
          failed = true;
        }
      } else {
        report.angew = { found:false, reason:'search_input_absent' };
        failed = true;
      }
      await page.screenshot({ path:path.join(reportDir, 'gallery-angew-search.png') }).catch(() => {});

      // The static public index confirms this specific ACS Catalysis DOI has
      // numbered body figures. Verify that a real card actually paints them.
      await search.fill(BODY_SAMPLE);
      const bodySlot = page.locator('.figure-strip-slot[data-figure-doi="' + BODY_SAMPLE + '"]').first();
      let thumbs = 0;
      let decoded = 0;
      let sampleFound = false;
      try {
        await bodySlot.locator('.figure-thumb img').first().waitFor({ state:'attached', timeout:25000 });
        sampleFound = true;
        await bodySlot.locator('.figure-thumb img').first().scrollIntoViewIfNeeded({ timeout:8000 });
        await page.waitForFunction(() =>
          [...document.querySelectorAll('.figure-strip-slot[data-figure-doi="' + BODY_SAMPLE + '"] img')]
            .some(img => img.complete && img.naturalWidth > 0),
          null, { timeout:18000, polling:200 },
        );
        const result = await bodySlot.evaluate(slot => {
          const imgs = [...slot.querySelectorAll('.figure-thumb img')];
          return { thumbs:imgs.length, decoded:imgs.filter(img => img.complete && img.naturalWidth > 0).length };
        });
        thumbs = result.thumbs;
        decoded = result.decoded;
      } catch (error) {
        report.bodyImageError = String(error).slice(0,400);
      }
      report.bodySample = { doi:BODY_SAMPLE, found:sampleFound, thumbs, decoded };
      if (!sampleFound || !decoded) failed = true;
      await page.screenshot({ path:path.join(reportDir, 'gallery-body-figures.png') }).catch(() => {});
    }
    await context.close();
  }
} catch (error) {
  failed = true;
  report.unexpectedError = String(error);
} finally {
  await browser.close();
}
report.passed = !failed;
await writeFile(path.join(reportDir, 'acceptance.json'), JSON.stringify(report, null, 2) + '\n');
console.log('GALLERY_LIVE_HOME_READONLY ' + JSON.stringify(report));
if (failed) process.exitCode = 1;
