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

type IndexedFixtureRecord = {
  doi: string;
  revision: string;
  firstOnlineDate: string | null;
  datePrecision: 'day' | 'unknown';
  addedDate: string | null;
  paper: {
    title?: string | null;
    titleEn?: string | null;
    titleZh?: string | null;
    authors?: string[];
    journal?: string;
    synthesisType?: 'methodology' | 'total' | 'formal';
  };
};

type ArchitectureFixture = {
  hotCount: number;
  archiveCount: number;
  memberCount: number;
  archiveDoi: string;
  archiveDate: string;
  catalogId: string;
  records: IndexedFixtureRecord[];
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
  const records = (catalog.shards || []).flatMap((ref: any) => {
    const shard = readJson(path.join(root, ref.path));
    return Array.isArray(shard.records) ? shard.records : [];
  }) as IndexedFixtureRecord[];
  const archiveRecord = records.find(item => String(item.doi || '').toLowerCase() === archiveDoi);
  const archiveDate = String(archiveRecord?.firstOnlineDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveDate)) throw new Error('Archive fixture date missing');

  return {
    hotCount: hot.length,
    archiveCount: archive.length,
    memberCount: Number(release.recordCount),
    archiveDoi,
    archiveDate,
    catalogId: String(release.catalogId),
    records,
  };
}

async function stubOptionalApi(
  page: import('@playwright/test').Page,
  catalogView?: (route: import('@playwright/test').Route) => Promise<void>,
): Promise<void> {
  await page.route('**/api/literature/catalog-view', catalogView || (async route => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'literature_catalog_index_read_disabled', readPathActive: false }),
    });
  }));
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

function indexedItem(record: IndexedFixtureRecord): Record<string, unknown> {
  const synthesisType = ['methodology', 'total', 'formal'].includes(String(record.paper?.synthesisType || ''))
    ? record.paper.synthesisType
    : null;
  return {
    doi: String(record.doi).toLowerCase(),
    revision: record.revision,
    title: String(record.paper?.title ?? record.paper?.titleEn ?? ''),
    titleZh: String(record.paper?.titleZh ?? ''),
    authors: Array.isArray(record.paper?.authors) ? record.paper.authors : [],
    journal: String(record.paper?.journal || ''),
    firstOnlineDate: record.firstOnlineDate || null,
    datePrecision: record.datePrecision === 'day' ? 'day' : 'unknown',
    addedDate: record.addedDate || null,
    synthesisType,
  };
}

function largestJournalPageFixture(data: ArchitectureFixture): { journal: string; records: IndexedFixtureRecord[] } {
  const groups = new Map<string, IndexedFixtureRecord[]>();
  for (const record of data.records) {
    const journal = String(record.paper?.journal || '');
    if (!journal) continue;
    const group = groups.get(journal) || [];
    group.push(record);
    groups.set(journal, group);
  }
  const candidates = [...groups.entries()]
    .filter(([, rows]) => rows.length > RESULT_WINDOW_SIZE)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  if (!candidates.length) throw new Error('Indexed browser regression requires a journal with more than one result window');
  const [journal, records] = candidates[0];
  records.sort((a, b) => {
    const date = String(b.firstOnlineDate || '').localeCompare(String(a.firstOnlineDate || ''));
    return date || String(a.doi).localeCompare(String(b.doi));
  });
  return { journal, records };
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
  expect(registry.count).toBe(data.memberCount);
  expect(registry.dois).toContain(data.archiveDoi);
  expect(data.hotCount).toBeLessThan(data.memberCount);
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



test('indexed journal view uses server totals and cursor pages while resolving static content', async ({ page }) => {
  const data = fixture();
  const indexedFixture = largestJournalPageFixture(data);
  let catalogCalls = 0;

  await stubOptionalApi(page, async route => {
    catalogCalls += 1;
    const body = route.request().postDataJSON() as Record<string, any>;
    expect(body.catalogId).toBe(data.catalogId);
    expect(body.selectedJournals).toContain(indexedFixture.journal);
    expect(body.sort).toBe('newest');
    const cursor = typeof body.cursor === 'string' ? body.cursor : '';
    const pageIndex = cursor ? Number(cursor.replace(/^page-/, '')) : 0;
    expect(Number.isSafeInteger(pageIndex) && pageIndex >= 0).toBe(true);
    const start = pageIndex * RESULT_WINDOW_SIZE;
    const records = indexedFixture.records.slice(start, start + RESULT_WINDOW_SIZE);
    const hasMore = start + records.length < indexedFixture.records.length;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        schemaVersion: 'literature-catalog-index-v1',
        enabled: true,
        readPathActive: true,
        catalogId: data.catalogId,
        matched: indexedFixture.records.length,
        count: records.length,
        limit: RESULT_WINDOW_SIZE,
        hasMore,
        nextCursor: hasMore ? `page-${pageIndex + 1}` : null,
        sort: 'newest',
        items: records.map(indexedItem),
      }),
    });
  });

  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');

  const picker = page.locator('.journal-picker');
  await picker.locator('summary').click();
  await expect(picker).toHaveAttribute('open', '');
  const targetOption = picker.getByRole('checkbox', { name: indexedFixture.journal, exact: true });
  await targetOption.check();
  await expect(targetOption).toBeChecked();
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogDiscovery || ''), { timeout: 30000 })
    .toBe('d1-index');
  await expect(page.locator('#resultCount')).toHaveText(String(indexedFixture.records.length));
  await expect.poll(async () => page.locator('#gallery > .card').count())
    .toBe(Math.min(RESULT_WINDOW_SIZE, indexedFixture.records.length));
  await expect(page.locator('#gallery > .card').first())
    .toHaveAttribute('data-doi', String(indexedFixture.records[0].doi).toLowerCase());

  const next = page.locator('#nextResultPage');
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )2\//);
  await expect(page.locator('#previousResultPage')).toBeEnabled();
  await expect(page.locator('#resultCount')).toHaveText(String(indexedFixture.records.length));
  await expect(page.locator('#gallery > .card').first())
    .toHaveAttribute('data-doi', String(indexedFixture.records[RESULT_WINDOW_SIZE].doi).toLowerCase());
  expect(catalogCalls).toBe(2);
});

test('read-disabled indexed endpoint is probed once then static discovery remains authoritative', async ({ page }) => {
  const data = fixture();
  let probes = 0;
  await stubOptionalApi(page, async route => {
    probes += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'literature_catalog_index_read_disabled', readPathActive: false }),
    });
  });
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#search').fill(data.archiveDoi);
  await expect.poll(async () => page.locator(`#gallery > .card[data-doi="${data.archiveDoi}"]:not([hidden])`).count(), { timeout: 30000 })
    .toBe(1);
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogDiscovery || ''))
    .toBe('static-segments');
  expect(probes).toBe(1);

  await page.locator('#dateFrom').fill(data.archiveDate);
  await page.locator('#dateFrom').dispatchEvent('change');
  await page.waitForTimeout(500);
  expect(probes).toBe(1);
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
  expect(registry.count).toBe(data.hotCount);
  expect(registry.dois).not.toContain(data.archiveDoi);
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
