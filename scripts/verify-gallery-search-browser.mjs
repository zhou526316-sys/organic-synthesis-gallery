// Deterministic read-only browser smoke for the actual published Gallery.
// No auth, account mutation, or publisher media access is required.
import { chromium, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const SITE = process.env.GALLERY_SITE_URL || 'https://gallery.gczhouwld.com/';
const DIR = process.env.GALLERY_SEARCH_BROWSER_OUTPUT || '/tmp/gallery-search-browser';
const report = { ok: false, startedAt: new Date().toISOString(), site: SITE, viewports: [] };
const assert = (value, reason) => { if (!value) throw new Error(reason); };
const readJson = async url => {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
  assert(res.ok, 'read_http_' + res.status + ':' + url);
  return res.json();
};
const terms = ['LMCT', 'ligand-to-metal charge transfer', '配体到金属电荷转移', '手性磷酸', '轴手性'];
let browser;
try {
  await mkdir(DIR, { recursive: true });
  const delivery = await readJson(new URL('release-delivery.json', SITE));
  const catalogId = String(delivery.architectureCatalogId || '');
  assert(/^[a-f0-9]{64}$/.test(catalogId), 'pages_catalog_missing');
  // The upstream live-search-readonly job independently verifies DOI and
  // search-index parity. Do not replay every term once more from Node in this
  // browser job: five preflight probes plus five browser requests repeatedly
  // crossed the site's per-client transient request threshold on probe #10.
  // This job tests the actual browser response and rendered card visibility.
  assert(Array.isArray(delivery.dois) && delivery.dois.length > 0,
    'published_membership_missing');
  const publishedDois = new Set(delivery.dois.map(doi => String(doi).toLowerCase()));
  assert(publishedDois.size === delivery.dois.length,'published_membership_duplicate_doi');
  report.catalogId = catalogId;
  report.publishedCount = publishedDois.size;
  report.matched = {};
  browser = await chromium.launch({ headless: true });

  const viewportValue = Number(process.env.GALLERY_SEARCH_BROWSER_VIEWPORT || 0);
  const viewports = viewportValue ? [viewportValue] : [1280, 390];
  assert(viewports.every(width => [390, 1280].includes(width)), 'unsupported_search_viewport');
  for (const width of viewports) {
    const result = { width, checks: [], blockedMutations: 0, errors: [], catalogRead: null,
      network: [] };
    report.viewports.push(result);
    const context = await browser.newContext({
      viewport: { width, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    const track = (request, status, failure = '') => {
      try {
        const uri = new URL(request.url());
        if (uri.pathname !== '/api/literature/catalog-view') return;
        const body = request.method() === 'POST' ? JSON.parse(request.postData() || '{}') : {};
        const currentQuery = request.method() === 'GET' ? uri.searchParams.get('query') : body.query;
        result.network.push({event:status,query:currentQuery||null,method:request.method(),
          failure:failure||null,at:new Date().toISOString()});
      } catch { /* diagnostics must never change request execution */ }
    };
    page.on('request', request => track(request,'started'));
    page.on('requestfailed', request => track(request,'failed',request.failure()?.errorText||''));
    page.on('response', response => track(response.request(),'response_'+response.status()));
    await page.route('**/*', async route => {
      const request = route.request(), method = request.method();
      const pathname = new URL(request.url()).pathname;
      // The catalog query is a public GET (or compatible POST read).
      // All other browser POST/PUT/DELETE endpoints are isolated from
      // the acceptance browser to prohibit production side effects.
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
        const input = page.locator('#search');
        const responseAwaited = page.waitForResponse(response => {
          const request = response.request();
          const url = new URL(response.url());
          if (url.pathname !== '/api/literature/catalog-view') return false;
          if (request.method() === 'GET') return url.searchParams.get('query') === term;
          if (request.method() !== 'POST') return false;
          try { return JSON.parse(request.postData() || '{}').query === term; }
          catch { return false; }
        }, { timeout: 45000 });
        await input.fill(term);
        const apiResponse = await responseAwaited;
        assert(apiResponse.status() === 200, 'browser_search_http_' + apiResponse.status() + ':' + term);
        const payload = await apiResponse.json();
        assert(payload.catalogId === catalogId && payload.enabled === true
          && payload.readPathActive === true && payload.sort === 'newest',
          'browser_index_generation_or_path_mismatch:' + term);
        assert(Number.isSafeInteger(payload.matched) && payload.matched >= 0
          && Array.isArray(payload.items) && payload.count === payload.items.length,
          'browser_index_count_shape_mismatch:' + term);
        assert(payload.items.every(item=>publishedDois.has(String(item.doi||'').toLowerCase())),
          'browser_index_unpublished_doi_leaked:' + term);
        assert(payload.matched >= payload.items.length && payload.items.length <= (width <= 680 ? 12 : 24),
          'browser_index_bounded_paging_invalid:' + term);
        if (term === 'LMCT') assert(payload.matched >= 11, 'lmct_recall_regressed_to_under_11');
        if (term === '轴手性') assert(payload.matched > 0, 'axial_chirality_index_empty');
        report.matched[term] = payload.matched;

        await expect(page.locator('#resultCount')).toHaveText(String(payload.matched), { timeout: 30000 });
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogQueryRead || ''), {
          timeout: 10000,
        }).toBe('d1-index');

        const pageLimit = width <= 680 ? 12 : 24;
        const displayExpected = payload.items.slice(0, pageLimit).map(row => row.doi.toLowerCase());
        const shownDois = () => page.locator('#gallery .card[data-doi]').evaluateAll(cards =>
          cards.map(card => String(card.getAttribute('data-doi') || '').toLowerCase()));
        // The D1 response precedes content-addressed shard resolution. Do not
        // mistake a previous query with the same matched count for current cards.
        await expect.poll(shownDois, { timeout: 30000, intervals: [100, 200, 500, 1000] })
          .toEqual(displayExpected);
        const displayed = await shownDois();
        assert(displayed.length === new Set(displayed).size, 'duplicate_browser_cards:' + term);
        const hiddenDois = await page.locator('#gallery .card[data-doi][hidden]').evaluateAll(cards =>
          cards.map(card => String(card.getAttribute('data-doi') || '').toLowerCase()));
        assert(hiddenDois.length === 0, 'indexed_match_hidden_by_secondary_search:' + term + ':' + width + ':' + hiddenDois.join(','));
        result.checks.push({ query: term, matched: payload.matched, shown: displayed.length,
          source: 'd1-index', method: apiResponse.request().method(),
          firstDoi: displayed[0] || null });
      }
      assert(result.checks.some(item => item.method === 'GET'),
        'no_simple_GET_observed_after_production_deployment');
      assert(!result.errors.length, 'browser_javascript_errors:' + result.errors.slice(0, 3).join('|'));
      result.catalogRead = await page.evaluate(() => document.documentElement.dataset.catalogRead || null);
      result.ok = true;
    } catch (error) {
      result.error = String(error?.message || error).slice(0, 2200);
      result.debugState = await page.evaluate(() => ({
        search: document.querySelector('#search')?.value || '',
        count: document.querySelector('#resultCount')?.textContent || '',
        cards: [...document.querySelectorAll('#gallery .card[data-doi]')].slice(0,14).map(x=>x.getAttribute('data-doi')),
        reader: document.documentElement.dataset.catalogRead || null,
        capability: document.documentElement.dataset.catalogIndexCapability || null,
        queryPath: document.documentElement.dataset.catalogQueryRead || null,
      })).catch(()=>({ unavailable:true }));
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
