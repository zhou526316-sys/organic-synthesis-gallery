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

function fixtureViewHandler(data: ArchitectureFixture, calls: any[]): LiteratureViewHandler {
  return body => {
    calls.push(structuredClone(body));
    if (body?.catalogId !== data.catalogId) {
      return { status: 409, body: { error: 'literature_catalog_generation_not_ready', readPathActive: false } };
    }
    const query = String(body?.query || '').trim().toLowerCase();
    if (query && [...query].length < 3) {
      return { status: 422, body: { error: 'literature_catalog_short_query_requires_compatibility', readPathActive: false } };
    }
    if (body?.sort === 'readers') {
      return { status: 422, body: { error: 'literature_catalog_reader_sort_requires_compatibility', readPathActive: false } };
    }
    const selected = new Set(Array.isArray(body?.selectedJournals) ? body.selectedJournals : []);
    const excluded = new Set(Array.isArray(body?.excludedJournals) ? body.excludedJournals : []);
    const dateFrom = String(body?.dateFrom || '');
    const dateTo = String(body?.dateTo || '');
    const addedDate = String(body?.addedDate || '');
    let rows = data.records.filter(row => {
      if (selected.size && !selected.has(row.paper.journal)) return false;
      if (excluded.has(row.paper.journal)) return false;
      if (dateFrom && row.firstOnlineDate < dateFrom) return false;
      if (dateTo && row.firstOnlineDate > dateTo) return false;
      if (addedDate && row.addedDate !== addedDate) return false;
      if (!query) return true;
      return [
        row.paper.title,
        row.paper.titleZh || '',
        row.doi,
        row.paper.journal,
        row.paper.authors.join(' '),
        row.firstOnlineDate,
      ].some(value => String(value || '').toLowerCase().includes(query));
    });
    rows = [...rows].sort((a,b) => body?.sort === 'oldest'
      ? a.firstOnlineDate.localeCompare(b.firstOnlineDate) || a.doi.localeCompare(b.doi)
      : b.firstOnlineDate.localeCompare(a.firstOnlineDate) || a.doi.localeCompare(b.doi));
    const limit = Math.max(1, Math.min(100, Number(body?.limit || RESULT_WINDOW_SIZE)));
    const cursor = String(body?.cursor || '');
    const offset = cursor ? Number(cursor.replace(/^fixture:/, '')) : 0;
    const pageRows = rows.slice(offset, offset + limit);
    const hasMore = offset + pageRows.length < rows.length;
    return {
      body: {
        version: 1,
        schemaVersion: 'literature-catalog-index-v1',
        enabled: true,
        readPathActive: true,
        catalogId: data.catalogId,
        matched: rows.length,
        count: pageRows.length,
        limit,
        hasMore,
        nextCursor: hasMore ? `fixture:${offset + pageRows.length}` : null,
        sort: body?.sort === 'oldest' ? 'oldest' : 'newest',
        items: pageRows.map(viewItem),
      },
    };
  };
}

test('architecture-v1 landing is Hot-only while all-time membership stays complete', async ({ page }) => {
  const data = fixture();
  expect(data.archiveCount).toBeGreaterThan(0);
  expect(data.memberCount).toBeGreaterThan(data.hotCount);

  const viewCalls: any[] = [];
  await stubOptionalApi(page, fixtureViewHandler(data, viewCalls));
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
  expect(viewCalls).toHaveLength(0);
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogQuery || 'static')).toBe('static');
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



test('D1 cursor canary keeps only the current verified 60-card window in memory', async ({ page }) => {
  const data = fixture();
  const calls: any[] = [];
  await stubOptionalApi(page, fixtureViewHandler(data, calls));
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');

  const expected = newestFirst(data.records.filter(row => row.firstOnlineDate.includes('2026')));
  expect(expected.length).toBeGreaterThan(RESULT_WINDOW_SIZE);

  const registryBefore = await page.locator('#gallery-literature-doi-registry').textContent();
  await page.locator('#search').fill('2026');

  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogQuery || ''), { timeout: 30000 })
    .toBe('d1-cursor');
  await expect(page.locator('#resultCount')).toHaveText(String(expected.length));
  await expect.poll(async () => page.locator('#gallery > .card').count()).toBe(RESULT_WINDOW_SIZE);
  await expect(page.locator('#gallery > .card').first()).toHaveAttribute('data-doi', expected[0].doi);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.at(-1).catalogId).toBe(data.catalogId);
  expect(calls.at(-1).query).toBe('2026');
  expect(calls.at(-1).limit).toBe(RESULT_WINDOW_SIZE);

  const next = page.locator('#nextResultPage');
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )2\//);
  await expect(page.locator('#gallery > .card').first()).toHaveAttribute('data-doi', expected[RESULT_WINDOW_SIZE].doi);
  expect(calls.at(-1).cursor).toBe(`fixture:${RESULT_WINDOW_SIZE}`);
  expect(await page.locator('#gallery-literature-doi-registry').textContent()).toBe(registryBefore);
  expect(await page.locator('#gallery > .card').count()).toBeLessThanOrEqual(RESULT_WINDOW_SIZE);
});

test('D1 cursor canary forwards journal/date/sort filters without expanding the DOM window', async ({ page }) => {
  const data = fixture();
  const calls: any[] = [];
  await stubOptionalApi(page, fixtureViewHandler(data, calls));
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');

  await page.locator('#search').fill('2026');
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogQuery || ''), { timeout: 30000 })
    .toBe('d1-cursor');

  const targetJournal = data.records.some(row => row.paper.journal === 'JACS')
    ? 'JACS'
    : data.records.find(row => row.paper.journal)?.paper.journal || '';
  expect(targetJournal).not.toBe('');
  await page.locator('.journal-picker summary').click();
  await page.locator(`[data-journal-option][value="${targetJournal}"]`).check();
  await expect.poll(() => String(calls.at(-1)?.selectedJournals?.[0] || ''), { timeout: 30000 }).toBe(targetJournal);
  expect(await page.locator('#gallery > .card').count()).toBeLessThanOrEqual(RESULT_WINDOW_SIZE);
  for (const journal of await page.locator('#gallery > .card').evaluateAll(cards => cards.map(card => card.getAttribute('data-journal')))) {
    expect(journal).toBe(targetJournal);
  }

  await page.locator('#sort').selectOption('oldest');
  await expect.poll(() => String(calls.at(-1)?.sort || ''), { timeout: 30000 }).toBe('oldest');
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogQuery || '')).toBe('d1-cursor');

  const targetDate = data.records.find(row => row.paper.journal === targetJournal && /^2026-/.test(row.firstOnlineDate))?.firstOnlineDate;
  expect(targetDate).toMatch(/^2026-/);
  await page.locator('#dateFrom').fill(targetDate!);
  await page.locator('#dateFrom').dispatchEvent('change');
  await page.locator('#dateTo').fill(targetDate!);
  await page.locator('#dateTo').dispatchEvent('change');
  await expect.poll(() => String(calls.at(-1)?.dateFrom || ''), { timeout: 30000 }).toBe(targetDate);
  await expect.poll(() => String(calls.at(-1)?.dateTo || ''), { timeout: 30000 }).toBe(targetDate);
  expect(await page.locator('#gallery > .card').count()).toBeLessThanOrEqual(RESULT_WINDOW_SIZE);
});

test('short, translated-Chinese and readers queries stay on the static compatibility path', async ({ page }) => {
  const data = fixture();
  const calls: any[] = [];
  await stubOptionalApi(page, fixtureViewHandler(data, calls));
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');

  await page.locator('#search').fill('Ni');
  await page.waitForTimeout(500);
  expect(calls).toHaveLength(0);

  await page.locator('#search').fill('有机合成');
  await page.waitForTimeout(500);
  expect(calls).toHaveLength(0);

  await page.locator('#sort').selectOption('readers');
  await page.locator('#search').fill('2026');
  await page.waitForTimeout(500);
  expect(calls).toHaveLength(0);
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogQuery || 'static')).not.toBe('d1-cursor');
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

test('D1 failure falls back to search shards without producing a false empty result', async ({ page }) => {
  const data = fixture();
  let d1Attempts = 0;
  await stubOptionalApi(page, async () => {
    d1Attempts += 1;
    return { status: 503, body: { error: 'forced_d1_failure', readPathActive: false } };
  });
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
  expect(d1Attempts).toBeGreaterThan(0);
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogQuery || '')).toBe('static-fallback');
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
