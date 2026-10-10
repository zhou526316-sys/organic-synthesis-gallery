// Deterministic read-only browser smoke for the actual published Gallery.
// No auth, account mutation, or publisher media access is required.
import { chromium, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const SITE = process.env.GALLERY_SITE_URL || 'https://gallery.gczhouwld.com/';
const API = process.env.GALLERY_API_URL || 'https://organic-synthesis-gallery.zhou526316.workers.dev/';
const DIR = process.env.GALLERY_SEARCH_BROWSER_OUTPUT || '/tmp/gallery-search-browser';
const report = { ok: false, startedAt: new Date().toISOString(), site: SITE, viewports: [] };
const assert = (value, reason) => { if (!value) throw new Error(reason); };
const readJson = async url => {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
  assert(res.ok, 'read_http_' + res.status + ':' + url);
  return res.json();
};
const catalogView = async (catalogId, query) => {
  const res = await fetch(new URL('/api/literature/catalog-view', API), {
    method: 'POST', headers: { 'content-type': 'application/json', 'origin': new URL(SITE).origin },
    body: JSON.stringify({ catalogId, query, sort: 'newest', limit: 100 }),
    signal: AbortSignal.timeout(20000),
  });
  assert(res.ok, 'indexed_view_http_' + res.status + ':' + query);
  const data = await res.json();
  assert(data.readPathActive === true && data.catalogId === catalogId, 'indexed_view_wrong_generation:' + query);
  assert(Number.isSafeInteger(data.matched) && Array.isArray(data.items), 'indexed_view_invalid:' + query);
  return data;
};
const terms = ['LMCT', 'ligand-to-metal charge transfer', '配体到金属电荷转移', '手性磷酸', '轴手性'];
let browser;
try {
  await mkdir(DIR, { recursive: true });
  const delivery = await readJson(new URL('release-delivery.json', SITE));
  const catalogId = String(delivery.architectureCatalogId || '');
  assert(/^[a-f0-9]{64}$/.test(catalogId), 'pages_catalog_missing');
  const sources = new Map();
  for (const term of terms) sources.set(term, await catalogView(catalogId, term));
  assert(sources.get('LMCT').matched > 4, 'lmct_not_enriched');
  report.catalogId = catalogId;
  report.matched = Object.fromEntries(terms.map(term => [term, sources.get(term).matched]));
  browser = await chromium.launch({ headless: true });

  for (const width of [1280, 390]) {
    const result = { width, checks: [], blockedMutations: 0, errors: [], catalogRead: null };
    report.viewports.push(result);
    const context = await browser.newContext({
      viewport: { width, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), method = request.method();
      const pathname = new URL(request.url()).pathname;
      // The catalog query is a public POST read. All other browser POST/PUT/DELETE
      // endpoints are isolated from the acceptance browser to prohibit side effects.
      if (['GET','HEAD','OPTIONS'].includes(method) ||
        (method === 'POST' && pathname === '/api/literature/catalog-view')) {
        await route.continue();
        return;
      }
      result.blockedMutations += 1;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': new URL(SITE).origin, 'vary': 'Origin' },
        body: pathname.includes('reader-count') ? JSON.stringify({ counts: {} })
          : JSON.stringify({ items: [] }),
      });
    });
    try {
      const first = await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
      assert(first?.ok(), 'browser_entry_http_' + first?.status());
      await expect(page.locator('#search')).toBeVisible({ timeout: 35000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), {
        timeout: 40000, intervals: [150, 300, 700, 1500],
      }).toBe('architecture-v1');

      for (const term of terms) {
        const matching = sources.get(term);
        const input = page.locator('#search');
        const responseAwaited = page.waitForResponse(response => {
          if (!response.url().includes('/api/literature/catalog-view')
            || response.request().method() !== 'POST') return false;
          try { return JSON.parse(response.request().postData() || '{}').query === term; }
          catch { return false; }
        }, { timeout: 45000 });
        await input.fill(term);
        const apiResponse = await responseAwaited;
        assert(apiResponse.status() === 200, 'browser_search_http_' + apiResponse.status() + ':' + term);
        const payload = await apiResponse.json();
        assert(payload.matched === matching.matched && payload.catalogId === catalogId,
          'browser_api_result_mismatch:' + term);

        await expect(page.locator('#resultCount')).toHaveText(String(matching.matched), { timeout: 30000 });
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogQueryRead || ''), {
          timeout: 10000,
        }).toBe('d1-index');

        const pageLimit = width <= 680 ? 12 : 24;
        const displayExpected = matching.items.slice(0, pageLimit).map(row => row.doi.toLowerCase());
        await expect(page.locator('#gallery .card[data-doi]')).toHaveCount(displayExpected.length, { timeout: 30000 });
        const displayed = await page.locator('#gallery .card[data-doi]').evaluateAll(cards =>
          cards.map(card => String(card.getAttribute('data-doi') || '').toLowerCase()));
        assert(displayed.length === new Set(displayed).size, 'duplicate_browser_cards:' + term);
        assert(JSON.stringify(displayed) === JSON.stringify(displayExpected),
          'browser_result_order_or_membership_mismatch:' + term + ':' + width);
        result.checks.push({ query: term, matched: payload.matched, shown: displayed.length,
          source: 'd1-index', firstDoi: displayed[0] || null });
      }
      assert(!result.errors.length, 'browser_javascript_errors:' + result.errors.slice(0, 3).join('|'));
      result.catalogRead = await page.evaluate(() => document.documentElement.dataset.catalogRead || null);
      result.ok = true;
    } catch (error) {
      result.error = String(error?.message || error).slice(0, 2200);
      await page.screenshot({ path: DIR + '/failure-' + width + '.png', fullPage: false }).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
  report.ok = true;
  report.completedAt = new Date().toISOString();
} catch (error) {
  report.error = String(error?.message || error).slice(0, 3200);
  report.failedAt = new Date().toISOString();
} finally {
  if (browser) await browser.close();
  await mkdir(DIR, { recursive: true });
  await writeFile(DIR + '/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log('GALLERY_SEARCH_BROWSER_ACCEPTANCE ' + JSON.stringify(report));
}
if (!report.ok) process.exitCode = 1;
