import { test, expect, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { RESULT_WINDOW_SIZE } from '../shared/result-window.js';

test.use({
  browserName: 'webkit',
  viewport: { width: 1280, height: 900 },
  userAgent: devices['Desktop Safari'].userAgent,
  timezoneId: 'Asia/Shanghai',
});

type IndexedFixtureItem = {
  doi: string;
  revision: string;
  title: string;
  titleZh: string;
  authors: string[];
  journal: string;
  firstOnlineDate: string | null;
  datePrecision: 'day' | 'unknown';
  addedDate: string | null;
  synthesisType: 'methodology' | 'total' | 'formal' | null;
};

type ArchitectureFixture = {
  hotCount: number;
  archiveCount: number;
  memberCount: number;
  archiveDoi: string;
  archiveDate: string;
  catalogId: string;
  indexedItems: IndexedFixtureItem[];
};

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function fixture(): ArchitectureFixture {
  const root = path.resolve('dist/architecture-v1');
  const release = readJson(path.join(root, 'release.json'));
  expect(release.frontendReadActivation).toBe(true);
  expect(release.productionActivation).toBe(false);

  const current = readJson(path.join(root, release.catalogCurrent.path));
  const lifecycle = readJson(path.join(root, current.lifecycle.path));
  const catalog = readJson(path.join(root, current.catalog.path));
  const archive = Array.isArray(lifecycle.partitions?.archive) ? lifecycle.partitions.archive : [];
  const hot = Array.isArray(lifecycle.partitions?.hot) ? lifecycle.partitions.hot : [];
  if (!archive.length) throw new Error('Architecture browser regression requires at least one Archive DOI');

  const archiveDoi = String(archive[0]).toLowerCase();
  let archiveDate = '';
  for (const ref of catalog.shards || []) {
    const shard = readJson(path.join(root, ref.path));
    const row = (shard.records || []).find((item: any) => String(item.doi || '').toLowerCase() === archiveDoi);
    if (row) {
      archiveDate = String(row.firstOnlineDate || row.paper?.date || '');
      break;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveDate)) throw new Error('Archive fixture date missing');

  const records = (catalog.shards || []).flatMap((ref: any) => {
    const shard = readJson(path.join(root, ref.path));
    return Array.isArray(shard.records) ? shard.records : [];
  });
  const indexedItems = records.map((row: any): IndexedFixtureItem => ({
    doi: String(row.doi || '').toLowerCase(),
    revision: String(row.revision || ''),
    title: String(row.paper?.title || row.paper?.titleEn || ''),
    titleZh: String(row.paper?.titleZh || ''),
    authors: Array.isArray(row.paper?.authors) ? row.paper.authors.map(String) : [],
    journal: String(row.paper?.journal || ''),
    firstOnlineDate: /^\d{4}-\d{2}-\d{2}$/.test(String(row.firstOnlineDate || '')) ? String(row.firstOnlineDate) : null,
    datePrecision: row.datePrecision === 'day' ? 'day' : 'unknown',
    addedDate: /^\d{4}-\d{2}-\d{2}$/.test(String(row.addedDate || '')) ? String(row.addedDate) : null,
    synthesisType: ['methodology','total','formal'].includes(String(row.paper?.synthesisType || ''))
      ? row.paper.synthesisType
      : null,
  })).sort((a: IndexedFixtureItem,b: IndexedFixtureItem) => {
    const dateCmp = String(b.firstOnlineDate || '').localeCompare(String(a.firstOnlineDate || ''));
    return dateCmp || a.doi.localeCompare(b.doi);
  });
  expect(indexedItems).toHaveLength(Number(release.recordCount));

  return {
    hotCount: hot.length,
    archiveCount: archive.length,
    memberCount: Number(release.recordCount),
    archiveDoi,
    archiveDate,
    catalogId: String(release.catalogId),
    indexedItems,
  };
}

async function stubOptionalApi(page: import('@playwright/test').Page): Promise<void> {
  await page.route('https://api.gczhouwld.com/**', async route => {
    const url = route.request().url();
    if (url.includes('/api/user-ui/reader-counts/mark')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
      return;
    }
    if (url.includes('/api/user-ui/reader-counts')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ counts: {} }) });
      return;
    }
    if (url.includes('/api/user-ui/integrations')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ auth: { google: false, wechat: false, qq: false, email: false }, payments: { wechat: false, alipay: false } }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

test('architecture-v1 landing is Hot-only while all-time membership stays complete', async ({ page }) => {
  const data = fixture();
  expect(data.archiveCount).toBeGreaterThan(0);
  expect(data.memberCount).toBeGreaterThan(data.hotCount);

  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');
  const expectedWindow = Math.min(data.hotCount, RESULT_WINDOW_SIZE);
  await expect.poll(async () => page.locator('#gallery > .card').count(), { timeout: 30000 }).toBe(expectedWindow);
  await expect(page.locator('#resultScopeLabel')).toHaveText(/近三个月|Last 3 months/);
  await expect(page.locator('#resultCount')).toHaveText(String(data.hotCount));
  await expect(page.locator('#resultWindowStatus')).toContainText(`/`);
  await expect(page.locator('#nextResultPage')).toHaveAttribute('data-available', data.hotCount > RESULT_WINDOW_SIZE ? 'true' : 'false');
  await expect(page.locator('#resultScopeLabel')).toHaveAttribute('title', /滚动近三个月|rolling three-calendar-month/);

  const registry = await page.locator('#gallery-literature-doi-registry').evaluate(node => JSON.parse(node.textContent || '{}'));
  expect(registry.schemaVersion).toBe(2);
  expect(registry.count).toBe(data.memberCount);
  expect(registry.materializedDois).toBe(false);
  expect(registry.dois).toBeUndefined();
  expect(data.hotCount).toBeLessThan(data.memberCount);
});

test('verified Hot bootstrap renders before all-time membership finishes', async ({ page }) => {
  const data = fixture();
  let releaseMembership!: () => void;
  const membershipGate = new Promise<void>(resolve => { releaseMembership = resolve; });
  let membershipRequests = 0;

  await page.route(/\/architecture-v1\/membership\.[^/]+\.json(?:\?.*)?$/, async route => {
    membershipRequests += 1;
    await membershipGate;
    await route.continue();
  });
  await stubOptionalApi(page);

  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-hot-bootstrap');
  await expect.poll(async () => page.locator('#gallery > .card').count(), { timeout: 30000 })
    .toBe(Math.min(data.hotCount, RESULT_WINDOW_SIZE));
  await expect(page.locator('#resultCount')).toHaveText(String(data.hotCount));

  const bootstrapRegistry = await page.locator('#gallery-literature-doi-registry')
    .evaluate(node => JSON.parse(node.textContent || '{}'));
  expect(bootstrapRegistry.complete).toBe(false);
  expect(bootstrapRegistry.scope).toBe('hot-fallback');
  expect(bootstrapRegistry.materializedDois).toBe(false);
  expect(bootstrapRegistry.dois).toBeUndefined();
  expect(membershipRequests).toBeGreaterThan(0);

  releaseMembership();

  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');
  const fullRegistry = await page.locator('#gallery-literature-doi-registry')
    .evaluate(node => JSON.parse(node.textContent || '{}'));
  expect(fullRegistry.complete).toBe(true);
  expect(fullRegistry.schemaVersion).toBe(2);
  expect(fullRegistry.count).toBe(data.memberCount);
  expect(fullRegistry.materializedDois).toBe(false);
  expect(fullRegistry.dois).toBeUndefined();
});

test('result pagination keeps DOM cardinality bounded across pages', async ({ page }) => {
  const data = fixture();
  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');

  const firstCount = await page.locator('#gallery > .card').count();
  expect(firstCount).toBeLessThanOrEqual(RESULT_WINDOW_SIZE);
  const firstDoi = await page.locator('#gallery > .card').first().getAttribute('data-doi');

  if (data.hotCount > RESULT_WINDOW_SIZE) {
    const next = page.locator('#nextResultPage');
    await expect(next).toBeEnabled();
    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeVisible();
    await next.click();
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )2\//);
    await expect(page.locator('#previousResultPage')).toBeEnabled();
    await expect.poll(async () => page.locator('#gallery > .card').count())
      .toBe(Math.min(RESULT_WINDOW_SIZE, data.hotCount - RESULT_WINDOW_SIZE));
    await expect.poll(async () => page.locator('#gallery > .card').first().getAttribute('data-doi'))
      .not.toBe(firstDoi);
  } else {
    await expect(page.locator('#nextResultPage')).toBeDisabled();
  }
});



test('active D1 catalog view keeps all-time search server-paged and avoids static search shards', async ({ page }) => {
  const data = fixture();
  let staticSearchRequests = 0;
  const viewRequests: any[] = [];

  await page.route(/\/architecture-v1\/search\//, async route => {
    staticSearchRequests += 1;
    await route.continue();
  });
  await page.route('**/api/_healthcheck', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        literatureCatalogIndexShadowEnabled: true,
        literatureCatalogIndexReadEnabled: true,
        literatureCatalogIndexReadPathConfigured: true,
        literatureCatalogIndexReadPathActive: true,
        literatureCatalogIndexDb: true,
      }),
    });
  });
  await page.route('**/api/literature/catalog-view', async route => {
    const body = route.request().postDataJSON() as any;
    viewRequests.push(body);
    expect(body.catalogId).toBe(data.catalogId);
    expect(body.query).toBe('10.');
    expect(body.limit).toBe(RESULT_WINDOW_SIZE);
    const offset = body.cursor ? Number(String(body.cursor).replace(/^fixture:/, '')) : 0;
    const items = data.indexedItems.slice(offset, offset + RESULT_WINDOW_SIZE);
    const nextOffset = offset + items.length;
    const hasMore = nextOffset < data.indexedItems.length;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        schemaVersion: 'literature-catalog-index-v1',
        enabled: true,
        readPathActive: true,
        catalogId: data.catalogId,
        matched: data.indexedItems.length,
        count: items.length,
        limit: RESULT_WINDOW_SIZE,
        hasMore,
        nextCursor: hasMore ? `fixture:${nextOffset}` : null,
        sort: 'newest',
        items,
      }),
    });
  });
  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');

  await page.locator('#search').fill('10.');
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogQueryRead || ''), { timeout: 30000 })
    .toBe('d1-index');
  await expect(page.locator('#resultCount')).toHaveText(String(data.memberCount));
  await expect.poll(async () => page.locator('#gallery > .card').count()).toBe(Math.min(RESULT_WINDOW_SIZE, data.memberCount));
  await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )1\//);
  expect(staticSearchRequests).toBe(0);
  expect(viewRequests.length).toBeGreaterThanOrEqual(1);
  const requestsAfterFirstPage = viewRequests.length;

  if (data.memberCount > RESULT_WINDOW_SIZE) {
    const firstDoi = await page.locator('#gallery > .card').first().getAttribute('data-doi');
    const next = page.locator('#nextResultPage');
    await next.scrollIntoViewIfNeeded();
    await next.click();
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )2\//);
    await expect(page.locator('#previousResultPage')).toBeEnabled();
    await expect.poll(async () => page.locator('#gallery > .card').first().getAttribute('data-doi')).not.toBe(firstDoi);
    expect(viewRequests.length).toBe(requestsAfterFirstPage + 1);
    expect(viewRequests.at(-1).cursor).toBe(`fixture:${RESULT_WINDOW_SIZE}`);
    expect(staticSearchRequests).toBe(0);

    await page.locator('#previousResultPage').scrollIntoViewIfNeeded();
    await page.locator('#previousResultPage').click();
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )1\//);
    expect(viewRequests.length).toBe(requestsAfterFirstPage + 2);
    expect(viewRequests.at(-1).cursor || '').toBe('');
  }
});

test('D1 metadata is discovery-only and card content comes from the verified static revision', async ({ page }) => {
  const data = fixture();
  const canonical = data.indexedItems.find(item => item.doi === data.archiveDoi);
  if (!canonical) throw new Error('Archive indexed fixture missing');

  await page.route('**/api/_healthcheck', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        literatureCatalogIndexShadowEnabled: true,
        literatureCatalogIndexReadEnabled: true,
        literatureCatalogIndexReadPathConfigured: true,
        literatureCatalogIndexReadPathActive: true,
        literatureCatalogIndexDb: true,
      }),
    });
  });
  await page.route('**/api/literature/catalog-view', async route => {
    const body = route.request().postDataJSON() as any;
    expect(body.catalogId).toBe(data.catalogId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        schemaVersion: 'literature-catalog-index-v1',
        enabled: true,
        readPathActive: true,
        catalogId: data.catalogId,
        matched: 1,
        count: 1,
        limit: RESULT_WINDOW_SIZE,
        hasMore: false,
        nextCursor: null,
        sort: 'newest',
        items: [{ ...canonical, title: 'UNTRUSTED D1 TITLE MUST NOT RENDER' }],
      }),
    });
  });
  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#search').fill(data.archiveDoi);
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogQueryRead || ''), { timeout: 30000 })
    .toBe('d1-index');
  const card = page.locator(`#gallery > .card[data-doi="${data.archiveDoi}"]`);
  await expect(card).toHaveCount(1);
  await expect(card).not.toContainText('UNTRUSTED D1 TITLE MUST NOT RENDER');
  if (canonical.title) await expect(card).toContainText(canonical.title);
});

test('D1 revision mismatch degrades to verified static search', async ({ page }) => {
  const data = fixture();
  const canonical = data.indexedItems.find(item => item.doi === data.archiveDoi);
  if (!canonical) throw new Error('Archive indexed fixture missing');
  let staticSearchRequests = 0;

  await page.route('**/api/_healthcheck', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        literatureCatalogIndexShadowEnabled: true,
        literatureCatalogIndexReadEnabled: true,
        literatureCatalogIndexReadPathConfigured: true,
        literatureCatalogIndexReadPathActive: true,
        literatureCatalogIndexDb: true,
      }),
    });
  });
  await page.route('**/api/literature/catalog-view', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        schemaVersion: 'literature-catalog-index-v1',
        enabled: true,
        readPathActive: true,
        catalogId: data.catalogId,
        matched: 1,
        count: 1,
        limit: RESULT_WINDOW_SIZE,
        hasMore: false,
        nextCursor: null,
        sort: 'newest',
        items: [{ ...canonical, revision: 'f'.repeat(64) }],
      }),
    });
  });
  await page.route(/\/architecture-v1\/search\//, async route => {
    staticSearchRequests += 1;
    await route.continue();
  });
  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#search').fill(data.archiveDoi);
  await expect.poll(() => staticSearchRequests, { timeout: 30000 }).toBeGreaterThan(0);
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogQueryRead || ''), { timeout: 30000 })
    .toBe('static-segments');
  await expect(page.locator(`#gallery > .card[data-doi="${data.archiveDoi}"]`)).toHaveCount(1);
});

test('D1 catalog-view failure falls back to verified static search instead of false empty', async ({ page }) => {
  const data = fixture();
  let indexedViewRequests = 0;
  let staticSearchRequests = 0;
  await page.route('**/api/_healthcheck', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        literatureCatalogIndexShadowEnabled: true,
        literatureCatalogIndexReadEnabled: true,
        literatureCatalogIndexReadPathConfigured: true,
        literatureCatalogIndexReadPathActive: true,
        literatureCatalogIndexDb: true,
      }),
    });
  });
  await page.route('**/api/literature/catalog-view', async route => {
    indexedViewRequests += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'forced_index_unavailable', readPathActive: false }),
    });
  });
  await page.route(/\/architecture-v1\/search\//, async route => {
    staticSearchRequests += 1;
    await route.continue();
  });
  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#search').fill(data.archiveDoi);
  await expect.poll(() => indexedViewRequests, { timeout: 30000 }).toBeGreaterThan(0);
  await expect.poll(() => staticSearchRequests, { timeout: 30000 }).toBeGreaterThan(0);
  await expect.poll(async () => page.locator(`#gallery > .card[data-doi="${data.archiveDoi}"]:not([hidden])`).count(), { timeout: 30000 })
    .toBe(1);
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogQueryRead || ''), { timeout: 30000 })
    .toBe('static-segments');
  await expect(page.locator('#resultScopeLabel')).toHaveText(/当前筛选|Current filter/);
});

test('reader-count sorting remains on static compatibility path even when D1 capability is active', async ({ page }) => {
  let indexedViewRequests = 0;
  await page.route('**/api/_healthcheck', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        literatureCatalogIndexShadowEnabled: true,
        literatureCatalogIndexReadEnabled: true,
        literatureCatalogIndexReadPathConfigured: true,
        literatureCatalogIndexReadPathActive: true,
        literatureCatalogIndexDb: true,
      }),
    });
  });
  await page.route('**/api/literature/catalog-view', async route => {
    indexedViewRequests += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"must_not_be_called"}' });
  });
  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#sort').selectOption('readers');
  await page.locator('#search').fill('organic');
  await expect.poll(async () => page.locator('#gallery > .card').count(), { timeout: 30000 }).toBeGreaterThan(0);
  expect(indexedViewRequests).toBe(0);
});

test('active D1 capability keeps two-character chemistry queries on static compatibility search', async ({ page }) => {
  let indexedViewRequests = 0;
  let staticSearchRequests = 0;
  await page.route('**/api/_healthcheck', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        literatureCatalogIndexShadowEnabled: true,
        literatureCatalogIndexReadEnabled: true,
        literatureCatalogIndexReadPathConfigured: true,
        literatureCatalogIndexReadPathActive: true,
        literatureCatalogIndexDb: true,
      }),
    });
  });
  await page.route('**/api/literature/catalog-view', async route => {
    indexedViewRequests += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"must_not_be_called"}' });
  });
  await page.route(/\/architecture-v1\/search\//, async route => {
    staticSearchRequests += 1;
    await route.continue();
  });
  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#search').fill('Ni');
  await expect.poll(() => staticSearchRequests, { timeout: 30000 }).toBeGreaterThan(0);
  expect(indexedViewRequests).toBe(0);
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogQueryRead || ''), { timeout: 30000 })
    .toBe('static-segments');
});

test('verified Hot fallback stays bounded when full membership verification fails', async ({ page }) => {
  const data = fixture();
  let legacyCorpusRequests = 0;

  await page.route(/\/architecture-v1\/membership\.[a-f0-9]{64}\.json(?:\?.*)?$/, async route => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"forced membership failure"}' });
  });
  await page.route('**/papers.gz.b64', async route => {
    legacyCorpusRequests += 1;
    await route.abort();
  });
  await stubOptionalApi(page);

  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-hot-fallback');
  await expect(page.locator('.architecture-read-limited')).toBeVisible();
  await expect(page.locator('#resultScopeLabel')).toHaveText(/近三个月|Last 3 months/);
  await expect(page.locator('#resultCount')).toHaveText(String(data.hotCount));
  await expect.poll(async () => page.locator('#gallery > .card').count()).toBe(Math.min(data.hotCount, RESULT_WINDOW_SIZE));

  const registry = await page.locator('#gallery-literature-doi-registry').evaluate(node => JSON.parse(node.textContent || '{}'));
  expect(registry.scope).toBe('hot-fallback');
  expect(registry.complete).toBe(false);
  expect(registry.schemaVersion).toBe(2);
  expect(registry.count).toBe(data.hotCount);
  expect(registry.materializedDois).toBe(false);
  expect(registry.dois).toBeUndefined();
  expect(legacyCorpusRequests).toBe(0);
});

test('Archive DOI deep-link is resolved on demand and placed first', async ({ page }) => {
  const data = fixture();
  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/?doi=${encodeURIComponent(data.archiveDoi)}`, { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');
  const first = page.locator('#gallery > .card').first();
  await expect(first).toHaveAttribute('data-doi', data.archiveDoi, { timeout: 30000 });
  await expect.poll(async () => page.locator('#gallery > .card').count()).toBe(Math.min(data.hotCount + 1, RESULT_WINDOW_SIZE));
  await expect(page.locator('#resultCount')).toHaveText(String(data.hotCount + 1));
  await expect(page.locator('#resultScopeLabel')).toHaveText(/当前筛选|Current filter/);
});

test('global search loads an Archive DOI from search shards on demand', async ({ page }) => {
  const data = fixture();
  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');

  await page.locator('#search').fill(data.archiveDoi);
  await expect.poll(async () => {
    const cards = page.locator('#gallery > .card:not([hidden])');
    const count = await cards.count();
    if (!count) return '';
    return (await cards.first().getAttribute('data-doi')) || '';
  }, { timeout: 30000 }).toBe(data.archiveDoi);
  await expect(page.locator('#resultScopeLabel')).toHaveText(/当前筛选|Current filter/);
});

test('historical date filter loads matching Archive month on demand', async ({ page }) => {
  const data = fixture();
  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');

  await page.locator('#dateFrom').fill(data.archiveDate);
  await page.locator('#dateFrom').dispatchEvent('change');
  await page.locator('#dateTo').fill(data.archiveDate);
  await page.locator('#dateTo').dispatchEvent('change');

  await expect.poll(async () => page.locator(`#gallery > .card[data-doi="${data.archiveDoi}"]:not([hidden])`).count(), { timeout: 30000 })
    .toBe(1);
  await expect(page.locator('#resultScopeLabel')).toHaveText(/当前筛选|Current filter/);
});
