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

type ArchitectureRecordFixture = {
  doi: string;
  revision: string;
  firstOnlineDate: string;
  datePrecision: string;
  addedDate: string;
  paper: {
    journal: string;
    title: string;
    titleZh?: string;
    authors: string[];
    synthesisType?: 'methodology' | 'total' | 'formal';
  };
};

type ArchitectureFixture = {
  catalogId: string;
  hotCount: number;
  archiveCount: number;
  memberCount: number;
  archiveDoi: string;
  archiveDate: string;
  records: ArchitectureRecordFixture[];
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

  const records: ArchitectureRecordFixture[] = [];
  for (const ref of catalog.shards || []) {
    const shard = readJson(path.join(root, ref.path));
    for (const row of shard.records || []) {
      const doi = String(row.doi || '').toLowerCase();
      if (!doi || !row.paper) continue;
      records.push({
        doi,
        revision: String(row.revision || ''),
        firstOnlineDate: String(row.firstOnlineDate || row.paper?.date || ''),
        datePrecision: String(row.datePrecision || 'unknown'),
        addedDate: String(row.addedDate || row.paper?.addedDate || ''),
        paper: {
          journal: String(row.paper.journal || ''),
          title: String(row.paper.title || ''),
          titleZh: typeof row.paper.titleZh === 'string' ? row.paper.titleZh : undefined,
          authors: Array.isArray(row.paper.authors) ? row.paper.authors.map(String) : [],
          synthesisType: row.paper.synthesisType,
        },
      });
    }
  }
  records.sort((a,b)=>a.doi.localeCompare(b.doi));
  const archiveDoi = String(archive[0]).toLowerCase();
  const archiveRow = records.find(row => row.doi === archiveDoi);
  const archiveDate = String(archiveRow?.firstOnlineDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveDate)) throw new Error('Archive fixture date missing');

  return {
    catalogId: String(release.catalogId || ''),
    hotCount: hot.length,
    archiveCount: archive.length,
    memberCount: Number(release.recordCount),
    archiveDoi,
    archiveDate,
    records,
  };
}

type LiteratureViewHandler = (body: any) => Promise<{ status?: number; body: any }> | { status?: number; body: any };

async function stubOptionalApi(
  page: import('@playwright/test').Page,
  literatureView?: LiteratureViewHandler,
): Promise<void> {
  await page.route('https://organic-synthesis-gallery.zhou526316.workers.dev/api/literature/catalog-view', async route => {
    if (!literatureView) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'literature_catalog_index_read_disabled', readPathActive: false }),
      });
      return;
    }
    const body = route.request().postDataJSON();
    const result = await literatureView(body);
    await route.fulfill({
      status: result.status || 200,
      contentType: 'application/json',
      body: JSON.stringify(result.body),
    });
  });
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

function viewItem(row: ArchitectureRecordFixture) {
  return {
    doi: row.doi,
    revision: row.revision,
    title: row.paper.title,
    titleZh: row.paper.titleZh || '',
    authors: row.paper.authors,
    journal: row.paper.journal,
    firstOnlineDate: row.firstOnlineDate,
    datePrecision: row.datePrecision,
    addedDate: row.addedDate || null,
    synthesisType: row.paper.synthesisType || 'methodology',
  };
}

function newestFirst(rows: ArchitectureRecordFixture[]): ArchitectureRecordFixture[] {
  return [...rows].sort((a,b) =>
    b.firstOnlineDate.localeCompare(a.firstOnlineDate) || a.doi.localeCompare(b.doi)
  );
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
