import { test, expect, devices } from '@playwright/test';
import { open as openStatusFixture } from './status-image-fixtures';
import fs from 'node:fs';
import path from 'node:path';
import { RESULT_WINDOW_SIZE, MOBILE_RESULT_WINDOW_SIZE } from '../shared/result-window.js';

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
    // Includes genuinely recent admissions whose first-online date is missing
    // or appears in future metadata; all-time membership remains unchanged.
    hotCount: Number(release.hotHeadInline?.candidateCount ?? hot.length),
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

// Feedback #42: a status editor near the lower edge must open upward rather
// than squeeze into a small 220px region below its triggering button.
for (const [device, width, height] of [
  ['mobile', 390, 844],
  ['desktop', 1280, 900],
] as const) {
  test(`reading-status editor uses the roomier side of the viewport (${device})`, async ({ page }) => {
    // Use the same isolated, stable action fixture as the status interaction
    // suite; architecture Hot/Archive cards legitimately rerender during load.
    const actions = await openStatusFixture(page, width);
    await actions.locator('button[data-action="close"]').click();
    await page.setViewportSize({ width, height });
    const button = actions.locator('button[data-action="status"]');
    const drawer = actions.locator('.drawer');
    await expect(button).toBeVisible({ timeout: 30000 });

    const moveTrigger = async (desiredTop: number): Promise<void> => {
      // Move only the stable test action host; avoid browser-scroll coupling
      // with unrelated fixed overlays and document-scrolling preferences.
      await button.evaluate((node, target) => {
        const host = (node.getRootNode() as ShadowRoot).host as HTMLElement;
        const prior = Number(host.dataset.popupTestOffset || '0');
        const next = prior + target - node.getBoundingClientRect().top;
        host.dataset.popupTestOffset = String(next);
        host.style.transform = `translateY(${next}px)`;
      }, desiredTop);
      await expect.poll(
        () => button.evaluate((node, target) => Math.abs(node.getBoundingClientRect().top - target), desiredTop),
        { timeout: 5000 },
      ).toBeLessThan(3);
    };
    const geometry = async () => actions.evaluate(host => {
      const root = (host as HTMLElement).shadowRoot!;
      const anchor = root.querySelector<HTMLElement>('button[data-action="status"]')!.getBoundingClientRect();
      const panel = root.querySelector<HTMLElement>('.drawer')!.getBoundingClientRect();
      const vp = window.visualViewport;
      const top = vp?.offsetTop ?? 0;
      const bottom = top + (vp?.height ?? window.innerHeight);
      return {
        above: anchor.top - top,
        below: bottom - anchor.bottom,
        triggerTop: anchor.top,
        triggerBottom: anchor.bottom,
        popupTop: panel.top,
        popupBottom: panel.bottom,
        viewportTop: top,
        viewportBottom: bottom,
      };
    });

    // This regression asserts layout, not pointer hit-testing across synthetic card positions.
    await moveTrigger(Math.round(height * 0.70));
    await button.evaluate(node => (node as HTMLButtonElement).click());
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('data-placement', 'above');
    // The former page could calculate a valid menu rectangle but still paint
    // nothing: content-visibility:auto on the containing card clipped the
    // absolute-positioned status editor outside its card boundary.
    const visibleMenu = await actions.evaluate(host => {
      const card = (host as HTMLElement).closest('.card')!;
      const panel = (host as HTMLElement).shadowRoot!.querySelector<HTMLElement>('.drawer')!;
      const rect = panel.getBoundingClientRect();
      const x = Math.max(5, Math.min(innerWidth - 5, rect.left + Math.min(85, rect.width / 2)));
      const y = Math.max(5, Math.min(innerHeight - 5, rect.top + Math.min(75, rect.height / 2)));
      return {
        containment: getComputedStyle(card).contentVisibility,
        topmost: document.elementFromPoint(x, y) === host,
      };
    });
    expect(visibleMenu.containment).toBe('visible');
    expect(visibleMenu.topmost).toBe(true);
    const upper = await geometry();
    expect(upper.above).toBeGreaterThan(upper.below);
    expect(upper.popupBottom).toBeLessThanOrEqual(upper.triggerTop - 5);
    expect(upper.popupTop).toBeGreaterThanOrEqual(upper.viewportTop + 6);

    await actions.locator('button[data-action="close"]').evaluate(node => (node as HTMLButtonElement).click());
    await expect.poll(() => actions.evaluate(host =>
      getComputedStyle((host as HTMLElement).closest('.card')!).contentVisibility
    )).toBe('auto');
    await moveTrigger(Math.round(height * 0.18));
    await button.evaluate(node => (node as HTMLButtonElement).click());
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('data-placement', 'below');
    const lower = await geometry();
    expect(lower.below).toBeGreaterThan(lower.above);
    expect(lower.popupTop).toBeGreaterThanOrEqual(lower.triggerBottom + 5);
    expect(lower.popupBottom).toBeLessThanOrEqual(lower.viewportBottom - 6);
    await expect(actions.locator('.bar > button.action')).toHaveCount(4);
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

test('publisher-verified SciAdv card displays 7 Oct without pending-date label', async ({ page }) => {
  // Test the rendered card, not only the override helper. The authorized
  // source data may still say 9 Oct until the next fixed 08:00 release.
  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');
  await page.locator('#search').fill('10.1126/sciadv.aed4187');
  const card = page.locator('#gallery > .card[data-doi="10.1126/sciadv.aed4187"]');
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card).toHaveAttribute('data-date', '2026-10-07');
  await expect(card.locator('.tag.date')).not.toContainText(/2026-10-09|Oct 9|待核实|unverified/i);
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
    await expect(page.locator('#resultPageNumbers [data-result-page="1"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#resultPageNumbers [data-result-page="2"]')).toBeVisible();
    await page.locator('#resultPageNumbers [data-result-page="2"]').click();
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )2\//);
    await expect(page.locator('#previousResultPage')).toBeEnabled();
    await expect(page.locator('#resultPageNumbers [data-result-page="2"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#resultPageJumpInput')).toHaveValue('2');
    await expect.poll(async () => page.locator('#gallery > .card').count())
      .toBe(Math.min(RESULT_WINDOW_SIZE, data.hotCount - RESULT_WINDOW_SIZE));
    await expect.poll(async () => page.locator('#gallery > .card').first().getAttribute('data-doi'))
      .not.toBe(firstDoi);

    const lastPage = Math.ceil(data.hotCount / RESULT_WINDOW_SIZE);
    if (lastPage > 2) {
      await page.locator('#resultPageJumpInput').fill(String(lastPage));
      await page.locator('#resultPageJumpButton').click();
      await expect(page.locator('#resultWindowStatus')).toContainText(new RegExp(`(?:第 |Page )${lastPage}\\/`));
      await expect(page.locator('#resultPageNumbers [aria-current="page"]')).toHaveText(String(lastPage));
      await expect(page.locator('#nextResultPage')).toBeDisabled();
    }
  } else {
    await expect(page.locator('#resultWindowControls')).toBeHidden();
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
    await expect(page.locator('#resultPageNumbers [data-result-page="2"]')).toBeVisible();
    await page.locator('#resultPageNumbers [data-result-page="2"]').click();
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )2\//);
    await expect(page.locator('#previousResultPage')).toBeEnabled();
    await expect.poll(async () => page.locator('#gallery > .card').first().getAttribute('data-doi')).not.toBe(firstDoi);
    expect(viewRequests.length).toBe(requestsAfterFirstPage + 1);
    expect(viewRequests.at(-1).cursor).toBe(`fixture:${RESULT_WINDOW_SIZE}`);
    expect(staticSearchRequests).toBe(0);

    if (data.memberCount > RESULT_WINDOW_SIZE * 2) {
      await page.locator('#resultPageJumpInput').fill('3');
      await page.locator('#resultPageJumpButton').click();
      await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )3\//);
      expect(viewRequests.at(-1).cursor).toBe(`fixture:${RESULT_WINDOW_SIZE * 2}`);
    }

    const readsBeforeReturn = viewRequests.length;
    await page.locator('#resultPageJumpInput').fill('1');
    await page.locator('#resultPageJumpButton').click();
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )1\//);
    await expect(page.locator('#gallery > .card').first()).toHaveAttribute('data-doi', firstDoi);
    // Page one was already validated. Returning within the bounded cache TTL
    // should not need another API request or manufacture a stale page-three cursor.
    expect(viewRequests.length).toBe(readsBeforeReturn);
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

// Primary custom-domain / workers.dev failover is activated only on
// non-localhost origins. The local Playwright preview intentionally uses its
// same-origin API fixture, so a localhost test cannot exercise production
// failover. Run that path in the deployed browser acceptance instead.

test('two transient failed search transports cannot permanently demote abstract FTS to title-only', async ({ page }) => {
  const data = fixture();
  const canonical = data.indexedItems.find(item => item.doi === data.archiveDoi)!;
  let attempts = 0;
  await stubOptionalApi(page);
  await page.route('**/api/_healthcheck', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true, literatureCatalogIndexShadowEnabled: true, literatureCatalogIndexReadEnabled: true,
      literatureCatalogIndexReadPathConfigured: true, literatureCatalogIndexReadPathActive: true,
      literatureCatalogIndexDb: true,
    }) });
  });
  await page.route('**/api/literature/catalog-view', async route => {
    attempts += 1;
    if (attempts <= 2) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      version: 1, schemaVersion: 'literature-catalog-index-v1', enabled: true, readPathActive: true,
      catalogId: data.catalogId, matched: 1, count: 1, limit: RESULT_WINDOW_SIZE,
      hasMore: false, nextCursor: null, sort: 'newest', items: [canonical],
    }) });
  });
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#search').fill(data.archiveDoi);
  await expect.poll(() => attempts, { timeout: 30000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogQueryRead || ''), { timeout: 30000 })
    .toBe('d1-index');
  await expect(page.locator('#resultCount')).toHaveText('1');
  await expect(page.locator(`#gallery > .card[data-doi="${data.archiveDoi}"]`)).toHaveCount(1);
  expect(attempts).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.architecture-read-limited')).toHaveCount(0);
});

for (const entry of ['doi', 'edition'] as const) {
  test(`LMCT-length indexed search is global even after a featured ${entry} deep link`, async ({ page }) => {
    const data = fixture();
    const queryRequests: any[] = [];
    await stubOptionalApi(page);
    await page.route('**/api/_healthcheck', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        literatureCatalogIndexShadowEnabled: true, literatureCatalogIndexReadEnabled: true,
        literatureCatalogIndexReadPathConfigured: true, literatureCatalogIndexReadPathActive: true,
        literatureCatalogIndexDb: true,
      }),
    }));
    await page.route('**/api/literature/catalog-view', async route => {
      const body = route.request().postDataJSON() as any;
      queryRequests.push(body);
      const items = data.indexedItems.slice(0, body.limit);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        version: 1, schemaVersion: 'literature-catalog-index-v1', enabled: true, readPathActive: true,
        catalogId: data.catalogId, matched: data.memberCount, count: items.length, limit: body.limit,
        hasMore: data.memberCount > items.length, nextCursor: data.memberCount > items.length ? 'fixture:next' : null,
        sort: 'newest', items,
      }) });
    });
    const base = process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174';
    if (entry === 'edition') {
      await page.route('**/wechat-editions/2099-01-01.json', route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: '2099-01-01', date: '2099-01-01',
          featuredDoi: data.archiveDoi, dois: [data.archiveDoi] }),
      }));
    }
    const href = entry === 'doi'
      ? `${base}/?doi=${encodeURIComponent(data.archiveDoi)}`
      : `${base}/?edition=2099-01-01`;
    await page.goto(href, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
      .toBe('architecture-v1');
    if (entry === 'doi') {
      await expect(page.locator('#gallery > .card').first()).toHaveAttribute('data-doi', data.archiveDoi);
    } else {
      await expect(page.locator('#gallery > .card.edition-featured').first()).toHaveAttribute('data-doi', data.archiveDoi);
    }
    await page.locator('#search').fill('LMCT');
    await expect.poll(() => queryRequests.filter(x => x.query === 'LMCT').length, { timeout: 30000 })
      .toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogQueryRead || ''), { timeout: 30000 })
      .toBe('d1-index');
    await expect(page.locator('#resultCount')).toHaveText(String(data.memberCount));
    await expect(page.locator('#gallery > .card')).toHaveCount(Math.min(data.memberCount, RESULT_WINDOW_SIZE));
    // The optional UserSearchController must not re-hide abstract-indexed
    // papers simply because LMCT is absent from their visible titles.
    await expect(page.locator('#gallery > .card:not([hidden])')).toHaveCount(Math.min(data.memberCount, RESULT_WINDOW_SIZE));
    await expect(page.locator('#gallery > .card').first()).toHaveAttribute('data-doi', data.indexedItems[0].doi);
    expect(queryRequests.at(-1)?.query).toBe('LMCT');
    expect(queryRequests.at(-1)?.selectedJournals).toEqual([]);
    expect(queryRequests.at(-1)?.addedDate).toBe('');
  });
}

test('changing only-new and journal filters refreshes the indexed query and allows clearing all search restrictions', async ({ page }) => {
  const data = fixture();
  const requests: any[] = [];
  const journal = data.indexedItems[0].journal;
  await stubOptionalApi(page);
  await page.route('**/api/_healthcheck', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      literatureCatalogIndexShadowEnabled: true, literatureCatalogIndexReadEnabled: true,
      literatureCatalogIndexReadPathConfigured: true, literatureCatalogIndexReadPathActive: true,
      literatureCatalogIndexDb: true,
    }),
  }));
  await page.route('**/api/literature/catalog-view', async route => {
    const body = route.request().postDataJSON() as any;
    requests.push(body);
    const filtered = data.indexedItems.filter(item =>
      (!body.addedDate || item.addedDate === body.addedDate)
      && (!body.selectedJournals?.length || body.selectedJournals.includes(item.journal)));
    const items = filtered.slice(0, body.limit);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      version: 1, schemaVersion: 'literature-catalog-index-v1', enabled: true, readPathActive: true,
      catalogId: data.catalogId, matched: filtered.length, count: items.length, limit: body.limit,
      hasMore: filtered.length > items.length, nextCursor: filtered.length > items.length ? 'fixture:next' : null,
      sort: 'newest', items,
    }) });
  });
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');
  await page.locator('#search').fill('LMCT');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogQueryRead || ''), { timeout: 30000 })
    .toBe('d1-index');
  await expect(page.locator('#resultCount')).toHaveText(String(data.memberCount));
  await page.locator('#newOnly').check();
  await expect.poll(() => requests.filter(x => x.query === 'LMCT' && x.addedDate).length, { timeout: 30000 })
    .toBeGreaterThan(0);
  const newestRequest = requests.filter(x => x.query === 'LMCT').at(-1);
  expect(newestRequest.addedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator('#clearSearchScope')).toBeVisible();
  await page.locator('#clearSearchScope').click();
  // Clearing only-new restores the previously verified unfiltered query.
  // It may be served from the short-lived search cache without a fresh POST.
  await expect(page.locator('#newOnly')).not.toBeChecked();
  await expect(page.locator('#resultCount')).toHaveText(String(data.memberCount));
  await expect(page.locator('#gallery .card').first()).toHaveAttribute('data-doi', data.indexedItems[0].doi);
  await page.locator('.journal-picker summary').click();
  await page.locator(`input[data-journal-option][value="${journal}"]`).check();
  await expect.poll(() => requests.filter(x => x.query === 'LMCT' && x.selectedJournals?.includes(journal)).length, { timeout: 30000 })
    .toBeGreaterThan(0);
  await expect(page.locator('#clearSearchScope')).toBeVisible();
  await page.locator('#clearSearchScope').click();
  await expect(page.locator('#resultCount')).toHaveText(String(data.memberCount));
  await expect(page.locator('#gallery .card').first()).toHaveAttribute('data-doi', data.indexedItems[0].doi);
  await expect(page.locator(`input[data-journal-option][value="${journal}"]`)).not.toBeChecked();
});

test('search entered after most-read ordering explicitly switches to indexed latest search', async ({ page }) => {
  const data = fixture();
  let indexed = 0;
  await stubOptionalApi(page);
  await page.route('**/api/_healthcheck', route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ literatureCatalogIndexShadowEnabled: true, literatureCatalogIndexReadEnabled: true,
      literatureCatalogIndexReadPathConfigured: true, literatureCatalogIndexReadPathActive: true,
      literatureCatalogIndexDb: true }) }));
  await page.route('**/api/literature/catalog-view', async route => {
    indexed += 1;
    const body = route.request().postDataJSON() as any;
    const items = data.indexedItems.slice(0, body.limit);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      version: 1, schemaVersion: 'literature-catalog-index-v1', enabled: true, readPathActive: true,
      catalogId: data.catalogId, matched: data.memberCount, count: items.length, limit: body.limit,
      hasMore: data.memberCount > items.length, nextCursor: 'fixture:next', sort: 'newest', items,
    }) });
  });
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 })
    .toBe('architecture-v1');
  await page.locator('#sort').selectOption('readers');
  await page.locator('#search').fill('LMCT');
  await expect(page.locator('#sort')).toHaveValue('newest');
  await expect.poll(() => indexed, { timeout: 30000 }).toBeGreaterThan(0);
  await expect(page.locator('#resultCount')).toHaveText(String(data.memberCount));
  await expect(page.locator('.architecture-read-limited')).toContainText(/完整摘要|complete abstract/);
});

for (const width of [390, 1280]) {
  test(`search suggestions close on selection, outside click, keyboard, scroll and remount at ${width}px`, async ({ page }) => {
    await stubOptionalApi(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`,
      { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#gallery .card').first()).toBeVisible({ timeout: 30000 });
    const firstDoi = await page.locator('#gallery .card').first().getAttribute('data-doi');
    expect(firstDoi?.startsWith('10.')).toBe(true);
    // Every verified paper DOI starts with 10.; journal names in the first
    // bootstrap window can change asynchronously and are not a stable
    // suggestion fixture for the different viewport sizes.
    const query = '10.';
    // Scope this test to the suggestion controller so its lifecycle does not
    // depend on unrelated asynchronous corpus searches/remounts.
    await page.evaluate(() => {
      document.querySelector('#app')?.addEventListener(
        'gallery-corpus-query', event => event.stopImmediatePropagation(), true,
      );
    });
    const search = page.locator('#search');
    const popover = page.locator('.user-search-popover');
    const openSuggestions = async (): Promise<void> => {
      // Ensure Playwright's automatic scroll-to-input occurs *before* creating
      // the popover; page-scroll dismisses it by design.
      await search.scrollIntoViewIfNeeded();
      await search.fill('');
      await search.fill(query);
      await expect(popover.locator('button').first()).toBeVisible({ timeout: 10000 });
    };

    await openSuggestions();
    // A nearby non-input surface tests outside-pointer dismissal without
    // moving the viewport back to the hero and racing input auto-scroll.
    await page.locator('.resultline').click();
    await expect(popover).toHaveCount(0);

    await openSuggestions();
    await search.press('Escape');
    await expect(popover).toHaveCount(0);
    // WebKit may also clear a native type=search input on Escape. The popup
    // must disappear regardless of that browser-level input behavior.

    await openSuggestions();
    await search.press('Enter');
    await expect(popover).toHaveCount(0);

    await openSuggestions();
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    await expect(popover).toHaveCount(0);

    await openSuggestions();
    const touchOption = popover.locator('button').first();
    await touchOption.dispatchEvent('pointerdown', { pointerType: 'touch' });
    // Do not detach the option before the browser has emitted click.
    await expect(touchOption).toBeVisible();
    await touchOption.dispatchEvent('click', { detail: 1 });
    await expect(popover).toHaveCount(0);
    await openSuggestions();
    await popover.locator('button').first().click();
    await expect(popover).toHaveCount(0);

    await openSuggestions();
    await popover.locator('button').first().focus();
    await page.keyboard.press('Enter');
    await expect(popover).toHaveCount(0);

    // Selection synchronously dispatches another input event; an obsolete
    // suggestion popover must never be orphaned in document.body.
    await page.waitForTimeout(50);
    await expect(popover).toHaveCount(0);

    await openSuggestions();
    await page.locator('[data-lang="en"]').click();
    await expect(popover).toHaveCount(0);
  });
}

test('a burst of search keystrokes does not rebuild gallery cards or schedule stale indexed renders', async ({ page }) => {
  await stubOptionalApi(page);
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`,
    { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogRead || ''),
    { timeout: 30000 }).toBe('architecture-v1');
  await expect(page.locator('#gallery .card').first()).toBeVisible();
  const result = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('#search')!;
    const gallery = document.querySelector<HTMLElement>('#gallery')!;
    let childRebuilds = 0;
    const observer = new MutationObserver(records => {
      childRebuilds += records.filter(record => record.type === 'childList').length;
    });
    observer.observe(gallery, { childList: true });
    for (const query of ['LMC', 'LMCT', 'LMCTx', 'LMCTxy', 'LMCTxyz']) {
      input.value = query;
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    await Promise.resolve();
    await Promise.resolve();
    observer.disconnect();
    return {
      childRebuilds,
      loading: gallery.dataset.searchPending === 'true',
      count: document.querySelector('#resultCount')?.textContent,
      cards: gallery.querySelectorAll('.card').length,
    };
  });
  expect(result.loading).toBe(true);
  expect(result.count).toBe('…');
  expect(result.cards).toBe(0);
  expect(result.childRebuilds).toBeLessThanOrEqual(2);
});

test('latest indexed search wins over delayed obsolete responses and repeats use short-lived cache', async ({ page }) => {
  const data = fixture();
  const queries: string[] = [];
  let delayedCancelled = false;
  await stubOptionalApi(page);
  await page.route('**/api/_healthcheck', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      literatureCatalogIndexShadowEnabled: true,
      literatureCatalogIndexReadEnabled: true,
      literatureCatalogIndexReadPathConfigured: true,
      literatureCatalogIndexReadPathActive: true,
      literatureCatalogIndexDb: true,
    }) });
  });
  await page.route('**/api/literature/catalog-view', async route => {
    const body = route.request().postDataJSON() as any;
    queries.push(String(body.query || ''));
    if (body.query === 'LMCT') {
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    const item = body.query === 'LMCT' ? data.indexedItems[1] : data.indexedItems[0];
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        version: 1, schemaVersion: 'literature-catalog-index-v1',
        enabled: true, readPathActive: true, catalogId: data.catalogId,
        matched: 1, count: 1, limit: body.limit, hasMore: false, nextCursor: null,
        sort: 'newest', items: [item],
      }) });
    } catch {
      if (body.query === 'LMCT') delayedCancelled = true;
    }
  });
  await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`,
    { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogRead || ''),
    { timeout: 30000 }).toBe('architecture-v1');
  await page.locator('#search').fill('LMCT');
  await expect.poll(() => queries.includes('LMCT'), { timeout: 10000 }).toBe(true);
  await page.locator('#search').fill('nickel');
  await expect.poll(() => queries.includes('nickel'), { timeout: 10000 }).toBe(true);
  await expect(page.locator('#gallery .card[data-doi]')).toHaveCount(1);
  await expect(page.locator('#gallery .card').first()).toHaveAttribute('data-doi', data.indexedItems[0].doi);
  await page.waitForTimeout(850); // Old delayed response must never repaint the new results.
  await expect(page.locator('#gallery .card').first()).toHaveAttribute('data-doi', data.indexedItems[0].doi);
  const before = queries.filter(query => query === 'nickel').length;
  await page.locator('#search').fill('');
  await page.locator('#search').fill('nickel');
  await expect(page.locator('#resultCount')).toHaveText('1');
  await expect(page.locator('#gallery .card').first()).toHaveAttribute('data-doi', data.indexedItems[0].doi);
  expect(queries.filter(query => query === 'nickel')).toHaveLength(before);
  expect(delayedCancelled || queries.filter(query => query === 'LMCT').length === 1).toBeTruthy();
  const durations = await page.evaluate(() => ({
    network: document.documentElement.dataset.catalogSearchNetworkMs,
    total: document.documentElement.dataset.catalogSearchTotalMs,
  }));
  expect(Number(durations.network)).toBeGreaterThanOrEqual(0);
  expect(Number(durations.total)).toBeGreaterThanOrEqual(0);
});

test('short chemistry terms remain on static reader-sort compatibility path', async ({ page }) => {
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
  // Reader-count sorting remains a compatibility-only path for two-character
  // chemistry terms, which the current D1 trigram index cannot safely match.
  // Longer words such as LMCT now intentionally switch to indexed discovery.
  await page.locator('#search').fill('Ni');
  await expect.poll(async () => page.locator('#gallery > .card').count(), { timeout: 30000 }).toBeGreaterThan(0);
  await expect(page.locator('#sort')).toHaveValue('readers');
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


async function observeResponsiveBrowser(
  page: import('@playwright/test').Page,
  info: import('@playwright/test').TestInfo,
  exercise: () => Promise<void>,
): Promise<void> {
  const evidence = { pageErrors: [] as string[], consoleErrors: [] as string[], failedRequests: [] as unknown[], apiResponses: [] as unknown[] };
  page.on('pageerror', error => evidence.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => evidence.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.url().includes('/api/')) evidence.apiResponses.push({ url: response.url(), status: response.status() }); });
  try {
    await exercise();
    expect(evidence.pageErrors, 'uncaught browser errors').toEqual([]);
  } finally {
    await info.attach('responsive-pagination-browser-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  }
}

test('mobile shows 12 papers per page and keeps next/previous pagination complete', async ({ page }, info) => {
  await observeResponsiveBrowser(page, info, async () => {
    const data = fixture();
    expect(data.hotCount).toBeGreaterThan(MOBILE_RESULT_WINDOW_SIZE);
    await page.setViewportSize({ width: 390, height: 844 });
    await stubOptionalApi(page);
    await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 }).toBe('architecture-v1');
    await expect(page.locator('#gallery > .card')).toHaveCount(MOBILE_RESULT_WINDOW_SIZE);
    await expect(page.locator('#resultCount')).toHaveText(String(data.hotCount));
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )1\//);
    const first = await page.locator('#gallery > .card').first().getAttribute('data-doi');
    const firstDois = await page.locator('#gallery > .card').evaluateAll(cards => cards.map(card => card.getAttribute('data-doi')));
    await page.locator('#nextResultPage').scrollIntoViewIfNeeded();
    await page.locator('#nextResultPage').click();
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )2\//);
    await expect(page.locator('#gallery > .card')).toHaveCount(Math.min(MOBILE_RESULT_WINDOW_SIZE, data.hotCount - MOBILE_RESULT_WINDOW_SIZE));
    const secondDois = await page.locator('#gallery > .card').evaluateAll(cards => cards.map(card => card.getAttribute('data-doi')));
    expect(secondDois.some(doi => firstDois.includes(doi))).toBe(false);
    await page.locator('#previousResultPage').scrollIntoViewIfNeeded();
    await page.locator('#previousResultPage').click();
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )1\//);
    await expect(page.locator('#gallery > .card')).toHaveCount(MOBILE_RESULT_WINDOW_SIZE);
    await expect(page.locator('#gallery > .card').first()).toHaveAttribute('data-doi', first || '');
  });
});

test('the existing 680px breakpoint switches between mobile 12 and desktop 24', async ({ page }, info) => {
  await observeResponsiveBrowser(page, info, async () => {
    const data = fixture();
    await page.setViewportSize({ width: 680, height: 900 });
    await stubOptionalApi(page);
    await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#gallery > .card')).toHaveCount(Math.min(data.hotCount, MOBILE_RESULT_WINDOW_SIZE));
    await page.setViewportSize({ width: 681, height: 900 });
    await expect(page.locator('#gallery > .card')).toHaveCount(Math.min(data.hotCount, RESULT_WINDOW_SIZE));
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )1\//);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#gallery > .card')).toHaveCount(Math.min(data.hotCount, MOBILE_RESULT_WINDOW_SIZE));
    await expect(page.locator('#resultCount')).toHaveText(String(data.hotCount));
  });
});

test('mobile D1 catalog search sends limit 12 and keeps its cursor when moving forward', async ({ page }, info) => {
  await observeResponsiveBrowser(page, info, async () => {
    const data = fixture(), requests: any[] = [];
    await page.setViewportSize({ width: 390, height: 844 });
    await stubOptionalApi(page);
    await page.route('**/api/_healthcheck', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      literatureCatalogIndexShadowEnabled: true, literatureCatalogIndexReadEnabled: true,
      literatureCatalogIndexReadPathConfigured: true, literatureCatalogIndexReadPathActive: true, literatureCatalogIndexDb: true,
    }) }));
    await page.route('**/api/literature/catalog-view', async route => {
      const body = route.request().postDataJSON(); requests.push(body);
      expect(body.catalogId).toBe(data.catalogId);
      expect(body.limit).toBe(MOBILE_RESULT_WINDOW_SIZE);
      const offset = body.cursor ? Number(String(body.cursor).replace(/^mobile:/, '')) : 0;
      const items = data.indexedItems.slice(offset, offset + MOBILE_RESULT_WINDOW_SIZE);
      const next = offset + items.length, hasMore = next < data.memberCount;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        version: 1, schemaVersion: 'literature-catalog-index-v1', enabled: true, readPathActive: true,
        catalogId: data.catalogId, matched: data.memberCount, count: items.length, limit: MOBILE_RESULT_WINDOW_SIZE,
        hasMore, nextCursor: hasMore ? `mobile:${next}` : null, sort: 'newest', items,
      }) });
    });
    await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('#search').fill('10.');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogQueryRead || ''), { timeout: 30000 }).toBe('d1-index');
    await expect(page.locator('#gallery > .card')).toHaveCount(MOBILE_RESULT_WINDOW_SIZE);
    await page.locator('#nextResultPage').scrollIntoViewIfNeeded();
    await page.locator('#nextResultPage').click();
    await expect(page.locator('#resultWindowStatus')).toContainText(/(?:第 |Page )2\//);
    await expect(page.locator('#gallery > .card')).toHaveCount(MOBILE_RESULT_WINDOW_SIZE);
    expect(requests.at(-1).cursor).toBe(`mobile:${MOBILE_RESULT_WINDOW_SIZE}`);
  });
});


test('mobile date pickers allow dates before the first indexed paper and keep a valid range', async ({ page }, info) => {
  await observeResponsiveBrowser(page, info, async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubOptionalApi(page);
    await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
    // The async all-time membership initialization previously reintroduced the old minimum.
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 }).toBe('architecture-v1');
    for (const id of ['#dateFrom', '#dateTo']) {
      await expect(page.locator(id)).toHaveAttribute('type', 'date');
      await expect(page.locator(id)).not.toHaveAttribute('min', /.+/);
      await expect(page.locator(id)).not.toHaveAttribute('max', /.+/);
    }

    await page.locator('#dateFrom').fill('1900-01-01');
    await page.locator('#dateFrom').dispatchEvent('change');
    await expect(page.locator('#dateFrom')).toHaveValue('1900-01-01');
    await page.locator('#dateTo').fill('1900-12-31');
    await page.locator('#dateTo').dispatchEvent('change');
    await expect(page.locator('#dateTo')).toHaveValue('1900-12-31');

    // Date ordering is still enforced by the existing change handlers, not catalog limits.
    await page.locator('#dateFrom').fill('1901-02-03');
    await page.locator('#dateFrom').dispatchEvent('change');
    await expect(page.locator('#dateFrom')).toHaveValue('1901-02-03');
    await expect(page.locator('#dateTo')).toHaveValue('1901-02-03');
    await page.locator('#dateTo').fill('1899-06-04');
    await page.locator('#dateTo').dispatchEvent('change');
    await expect(page.locator('#dateFrom')).toHaveValue('1899-06-04');
    await expect(page.locator('#dateTo')).toHaveValue('1899-06-04');

    await page.locator('#clearCustomFilters').click();
    await expect(page.locator('#dateFrom')).toHaveValue('');
    await expect(page.locator('#dateTo')).toHaveValue('');
    await expect(page.locator('#dateFrom')).not.toHaveAttribute('min', /.+/);
    await expect(page.locator('#dateTo')).not.toHaveAttribute('max', /.+/);
  });
});

test('mobile historical date selection fetches a matching Archive paper, not just the Hot landing', async ({ page }, info) => {
  await observeResponsiveBrowser(page, info, async () => {
    const data = fixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await stubOptionalApi(page);
    await page.goto(`${process.env.ARCHITECTURE_PREVIEW_BASE || 'http://127.0.0.1:4174'}/`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.catalogRead || ''), { timeout: 30000 }).toBe('architecture-v1');
    await page.locator('#dateFrom').fill(data.archiveDate);
    await page.locator('#dateFrom').dispatchEvent('change');
    await page.locator('#dateTo').fill(data.archiveDate);
    await page.locator('#dateTo').dispatchEvent('change');
    await expect.poll(() => page.locator(`#gallery > .card[data-doi="${data.archiveDoi}"]:not([hidden])`).count(), { timeout: 30000 }).toBe(1);
    await expect(page.locator('#resultScopeLabel')).toHaveText(/当前筛选|Current filter/);
  });
});
