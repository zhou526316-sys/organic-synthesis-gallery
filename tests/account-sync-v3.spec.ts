import { test, expect } from '@playwright/test';

test.use({ browserName: 'webkit' });

const SESSION_KEY = 'organic-gallery-session-v1';
const STATE_KEY = 'organic-gallery-user-ui-v1';
const REVISION_KEY = 'organic-gallery-account-sync-revision-v1';
const USER_KEY = 'organic-gallery-account-sync-user-v1';

function globalState(hideRead = false) {
  return {
    statuses: [{ id: 'deep', name: '深读', style: { rgb: [37, 151, 96], shape: 'pill' }, countsAsRead: true }],
    quickTerms: [],
    collections: [],
    aliases: [],
    actionStyles: {},
    followedSearches: [],
    searchHistory: [],
    hideRead,
  };
}

function fullState(note: string) {
  return {
    ...globalState(false),
    papers: {
      '10.1234/legacy': {
        favorite: true,
        collections: [],
        note,
        quickTerms: [],
        tags: [],
        updatedAt: 20,
      },
    },
    metadata: {
      '10.1234/legacy': {
        id: '10.1234/legacy',
        doi: '10.1234/legacy',
        title: 'Legacy fallback paper',
        journal: 'JACS',
      },
    },
  };
}

async function seedSession(page: import('@playwright/test').Page, state?: object) {
  await page.addInitScript(({ sessionKey, stateKey, token, initialState }) => {
    localStorage.setItem(sessionKey, token);
    if (initialState) localStorage.setItem(stateKey, JSON.stringify(initialState));
  }, {
    sessionKey: SESSION_KEY,
    stateKey: STATE_KEY,
    token: 'v3-browser-session',
    initialState: state || null,
  });
}

async function stubCommonApi(page: import('@playwright/test').Page) {
  await page.route('https://api.gczhouwld.com/api/user-ui/integrations', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        auth: { google: false, wechat: false, qq: false, email: false },
        payments: { wechat: false, alipay: false },
      }),
    })
  );
}

test('account sync assembles V3 head/pages/delta before saving and never calls legacy pull', async ({ page }) => {
  test.setTimeout(60_000);
  await seedSession(page);
  await stubCommonApi(page);

  const modes: string[] = [];
  let savedState: any = null;
  const head = {
    ready: true,
    revision: 5,
    updatedAt: 500,
    globalState: globalState(true),
    globalRevision: 5,
    paperCount: 2,
    metadataCount: 2,
    changeFloorRevision: 5,
    papersSplit: true,
    metadataSplit: true,
  };

  await page.route('https://api.gczhouwld.com/api/user-ui/reader-counts', async route => {
    const body = route.request().postDataJSON() as any;
    const mode = String(body?.mode || '');
    if (!mode) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ counts: {} }) });
      return;
    }
    modes.push(mode);

    if (mode === 'account-v3-head') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ account: { userId: 'u-v3', readPath: 'v3-head', ...head } }),
      });
      return;
    }

    if (mode === 'account-v3-page') {
      const afterKey = String(body?.afterKey || '');
      const row = afterKey
        ? {
            paperKey: '10.1234/b',
            paperPresent: true,
            paperState: { favorite: true, collections: [], note: 'B', quickTerms: [], tags: [], updatedAt: 20 },
            metadataPresent: true,
            metadata: { id: '10.1234/b', doi: '10.1234/b', title: 'B', journal: 'Angew' },
          }
        : {
            paperKey: '10.1234/a',
            paperPresent: true,
            paperState: { favorite: true, collections: [], note: 'A', quickTerms: [], tags: [], updatedAt: 10 },
            metadataPresent: true,
            metadata: { id: '10.1234/a', doi: '10.1234/a', title: 'A', journal: 'JACS' },
          };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          account: {
            userId: 'u-v3',
            readPath: 'v3-page',
            ready: true,
            scanStartRevision: 5,
            head,
            count: 1,
            hasMore: !afterKey,
            nextKey: afterKey ? null : '10.1234/a',
            rows: [row],
          },
        }),
      });
      return;
    }

    if (mode === 'account-v3-delta') {
      expect(body.sinceRevision).toBe(5);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          account: {
            userId: 'u-v3',
            readPath: 'v3-delta',
            ready: true,
            resetRequired: false,
            sinceRevision: 5,
            targetRevision: 5,
            head,
            globalRevision: 5,
            count: 0,
            hasMore: false,
            nextCursor: null,
            changes: [],
          },
        }),
      });
      return;
    }

    if (mode === 'account-pull') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'legacy_pull_must_not_run' }) });
      return;
    }

    if (mode === 'account-save') {
      savedState = body.state;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          account: { userId: 'u-v3', revision: 6, updatedAt: 600, state: body.state },
        }),
      });
      return;
    }

    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'unexpected_mode' }) });
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => savedState, { timeout: 30000 }).not.toBeNull();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accountSyncRead || '')).toBe('v3');

  expect(modes).toContain('account-v3-head');
  expect(modes.filter(mode => mode === 'account-v3-page')).toHaveLength(2);
  expect(modes).toContain('account-v3-delta');
  expect(modes).not.toContain('account-pull');
  expect(savedState.hideRead).toBe(true);
  expect(Object.keys(savedState.papers).sort()).toEqual(['10.1234/a', '10.1234/b']);
  expect(savedState.papers['10.1234/a'].note).toBe('A');
  expect(savedState.papers['10.1234/b'].note).toBe('B');

  const remembered = await page.evaluate(({ revisionKey, userKey }) => ({
    revision: localStorage.getItem(revisionKey),
    user: localStorage.getItem(userKey),
  }), { revisionKey: REVISION_KEY, userKey: USER_KEY });
  expect(remembered).toEqual({ revision: '6', user: 'u-v3' });
});

test('a stale V3 page discards partial V3 state and falls back to the legacy pull atomically', async ({ page }) => {
  test.setTimeout(60_000);
  await seedSession(page);
  await stubCommonApi(page);

  const modes: string[] = [];
  let savedState: any = null;
  const head = {
    ready: true,
    revision: 3,
    updatedAt: 300,
    globalState: globalState(false),
    globalRevision: 3,
    paperCount: 2,
    metadataCount: 2,
    changeFloorRevision: 3,
    papersSplit: true,
    metadataSplit: true,
  };

  await page.route('https://api.gczhouwld.com/api/user-ui/reader-counts', async route => {
    const body = route.request().postDataJSON() as any;
    const mode = String(body?.mode || '');
    if (!mode) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ counts: {} }) });
      return;
    }
    modes.push(mode);

    if (mode === 'account-v3-head') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ account: { userId: 'u-fallback', readPath: 'v3-head', ...head } }),
      });
      return;
    }

    if (mode === 'account-v3-page' && !body.afterKey) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          account: {
            userId: 'u-fallback',
            readPath: 'v3-page',
            ready: true,
            scanStartRevision: 3,
            head,
            count: 1,
            hasMore: true,
            nextKey: '10.1234/partial',
            rows: [{
              paperKey: '10.1234/partial',
              paperPresent: true,
              paperState: { favorite: true, collections: [], note: 'MUST NOT LEAK', quickTerms: [], tags: [] },
              metadataPresent: true,
              metadata: { id: '10.1234/partial', doi: '10.1234/partial', title: 'Partial', journal: 'JACS' },
            }],
          },
        }),
      });
      return;
    }

    if (mode === 'account-v3-page') {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'user_library_v3_not_fresh',
          legacyRevision: 4,
          v3Revision: 3,
        }),
      });
      return;
    }

    if (mode === 'account-pull') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          account: { userId: 'u-fallback', revision: 4, updatedAt: 400, state: fullState('legacy wins'), readPath: 'rows' },
        }),
      });
      return;
    }

    if (mode === 'account-save') {
      savedState = body.state;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          account: { userId: 'u-fallback', revision: 5, updatedAt: 500, state: body.state },
        }),
      });
      return;
    }

    await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => savedState, { timeout: 30000 }).not.toBeNull();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accountSyncRead || '')).toBe('legacy');

  expect(modes).toContain('account-pull');
  expect(savedState.papers['10.1234/legacy'].note).toBe('legacy wins');
  expect(savedState.papers['10.1234/partial']).toBeUndefined();
  expect(savedState.metadata['10.1234/partial']).toBeUndefined();
});

test('malformed V3 identity or counts are discarded before any partial state is applied', async ({ page }) => {
  test.setTimeout(60_000);
  await seedSession(page);
  await stubCommonApi(page);

  const modes: string[] = [];
  let savedState: any = null;
  const head = {
    ready: true,
    revision: 7,
    updatedAt: 700,
    globalState: globalState(false),
    globalRevision: 7,
    paperCount: 2,
    metadataCount: 2,
    changeFloorRevision: 7,
    papersSplit: true,
    metadataSplit: true,
  };

  await page.route('https://api.gczhouwld.com/api/user-ui/reader-counts', async route => {
    const body = route.request().postDataJSON() as any;
    const mode = String(body?.mode || '');
    if (!mode) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ counts: {} }) });
      return;
    }
    modes.push(mode);

    if (mode === 'account-v3-head') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ account: { userId: 'u-integrity', readPath: 'v3-head', ...head } }),
      });
      return;
    }
    if (mode === 'account-v3-page') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          account: {
            userId: 'different-user',
            readPath: 'v3-page',
            ready: true,
            scanStartRevision: 7,
            head,
            count: 1,
            hasMore: false,
            nextKey: null,
            rows: [{
              paperKey: '10.1234/leak',
              paperPresent: true,
              paperState: { favorite: true, collections: [], note: 'MUST NOT APPLY', quickTerms: [], tags: [] },
              metadataPresent: true,
              metadata: { id: '10.1234/leak', doi: '10.1234/leak', title: 'Leak', journal: 'JACS' },
            }],
          },
        }),
      });
      return;
    }
    if (mode === 'account-pull') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          account: { userId: 'u-integrity', revision: 8, updatedAt: 800, state: fullState('integrity fallback') },
        }),
      });
      return;
    }
    if (mode === 'account-save') {
      savedState = body.state;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          account: { userId: 'u-integrity', revision: 9, updatedAt: 900, state: body.state },
        }),
      });
      return;
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => savedState, { timeout: 30000 }).not.toBeNull();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accountSyncRead || '')).toBe('legacy');
  expect(modes).toContain('account-pull');
  expect(savedState.papers['10.1234/leak']).toBeUndefined();
  expect(savedState.papers['10.1234/legacy'].note).toBe('integrity fallback');
});

test('session removal clears remembered account revision and disables account sync', async ({ page }) => {
  test.setTimeout(60_000);
  await seedSession(page);
  await stubCommonApi(page);

  await page.route('https://api.gczhouwld.com/api/user-ui/reader-counts', async route => {
    const body = route.request().postDataJSON() as any;
    const mode = String(body?.mode || '');
    if (!mode) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ counts: {} }) });
      return;
    }
    if (mode === 'account-v3-head') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'user_library_v3_read_disabled' }) });
      return;
    }
    if (mode === 'account-pull') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ account: { userId: 'u-logout', revision: 2, updatedAt: 200, state: fullState('remote') } }),
      });
      return;
    }
    if (mode === 'account-save') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ account: { userId: 'u-logout', revision: 3, updatedAt: 300, state: body.state } }),
      });
      return;
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('organic-gallery-account-sync-revision-v1'))).toBe('3');

  await page.evaluate(sessionKey => localStorage.removeItem(sessionKey), SESSION_KEY);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('organic-gallery-account-sync-revision-v1')), { timeout: 5000 }).toBeNull();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accountSyncRead || '')).toBe('none');
  expect(await page.evaluate(() => localStorage.getItem('organic-gallery-account-sync-user-v1'))).toBeNull();
});
