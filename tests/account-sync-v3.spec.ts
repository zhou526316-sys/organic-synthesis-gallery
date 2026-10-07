import { test, expect } from '@playwright/test';

test.use({ browserName: 'webkit' });

const SESSION_KEY = 'organic-gallery-session-v1';
const STATE_KEY = 'organic-gallery-user-ui-v1';
const REVISION_KEY = 'organic-gallery-account-sync-revision-v1';
const USER_KEY = 'organic-gallery-account-sync-user-v1';
const PREVIEW_BASE = process.env.ACCOUNT_SYNC_PREVIEW_BASE || 'http://127.0.0.1:4173';

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
  const origins = new Set(['https://api.gczhouwld.com', 'https://organic-synthesis-gallery.zhou526316.workers.dev']);
  const paths = new Set(['/api/user-ui/integrations', '/api/user-ui/auth/session', '/api/user-ui/pageview']);
  // The built app also starts authentication and analytics. Keep those requests
  // inside the fixture so page-error assertions test sync, not external CORS.
  await page.route(url => origins.has(url.origin) && paths.has(url.pathname), route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/user-ui/auth/session'
      ? { authenticated: true, user: { id: 'account-sync-test-user', displayName: 'Account sync test', capabilities: [] } }
      : path === '/api/user-ui/pageview'
        ? { ok: true }
        : {
            auth: { google: false, wechat: false, qq: false, email: false },
            payments: { wechat: false, alipay: false },
          };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
      },
      body: JSON.stringify(body),
    });
  });
}

async function mutableV3Account(page: import('@playwright/test').Page, state: any, writeEnabled: boolean) {
  const server = {
    state: structuredClone(state), revision: 10, writeEnabled,
    modes: [] as string[], attempts: [] as any[], accepted: [] as any[],
    pauseAfterPaperBatch: false,
  };
  const head = () => ({
    ready: true, revision: server.revision, updatedAt: server.revision * 100,
    globalState: Object.fromEntries(Object.entries(server.state).filter(([key]) => key !== 'papers' && key !== 'metadata')),
    globalRevision: server.revision, paperCount: Object.keys(server.state.papers).length,
    metadataCount: Object.keys(server.state.metadata).length,
    changeFloorRevision: 10, papersSplit: true, metadataSplit: true,
  });
  const identity = () => ({ userId: 'u-resume', writeEnabled: server.writeEnabled, writeAuthority: 'v3' });
  await page.route('https://api.gczhouwld.com/api/user-ui/reader-counts', async route => {
    const body = route.request().postDataJSON() as any;
    const mode = String(body?.mode || '');
    const respond = (status: number, value: unknown) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(value),
    });
    if (!mode) { await respond(200, { counts: {} }); return; }
    server.modes.push(mode);
    if (mode === 'account-v3-head') {
      await respond(200, { account: { ...identity(), readPath: 'v3-head', ...head() } });
      return;
    }
    if (mode === 'account-v3-page') {
      const keys = [...new Set([...Object.keys(server.state.papers), ...Object.keys(server.state.metadata)])]
        .sort().filter(key => key > String(body.afterKey || ''));
      const selected = keys.slice(0, Math.min(100, Number(body.limit) || 100));
      const rows = selected.map(paperKey => ({
        paperKey, paperPresent: Object.hasOwn(server.state.papers, paperKey),
        paperState: server.state.papers[paperKey], metadataPresent: Object.hasOwn(server.state.metadata, paperKey),
        metadata: server.state.metadata[paperKey],
      }));
      await respond(200, { account: { ...identity(), readPath: 'v3-page', ready: true,
        scanStartRevision: server.revision, head: head(), rows, count: rows.length,
        hasMore: keys.length > selected.length, nextKey: keys.length > selected.length ? selected.at(-1) : null,
      } });
      return;
    }
    if (mode === 'account-v3-delta') {
      await respond(200, { account: { ...identity(), readPath: 'v3-delta', ready: true,
        resetRequired: body.sinceRevision !== server.revision,
        sinceRevision: body.sinceRevision, targetRevision: server.revision, head: head(),
        globalRevision: server.revision, count: 0, changes: [], hasMore: false, nextCursor: null,
      } });
      return;
    }
    if (mode === 'account-v3-mutate') {
      server.attempts.push(structuredClone(body));
      if (!server.writeEnabled) {
        await respond(503, { error: 'user_library_v3_write_suspended', writeAuthority: 'v3', writeEnabled: false });
        return;
      }
      if (body.expectedRevision !== server.revision) {
        await respond(409, { error: 'user_library_v3_revision_conflict', currentRevision: server.revision });
        return;
      }
      expect(body.operations.length).toBeLessThanOrEqual(32);
      if (body.globalState) Object.assign(server.state, body.globalState);
      for (const operation of body.operations) {
        // Match the real whole-row contract, including omitted metadata.
        if (operation.delete || !Object.hasOwn(operation, 'paperState')) delete server.state.papers[operation.paperKey];
        else server.state.papers[operation.paperKey] = structuredClone(operation.paperState);
        if (operation.delete || !Object.hasOwn(operation, 'metadata')) delete server.state.metadata[operation.paperKey];
        else server.state.metadata[operation.paperKey] = structuredClone(operation.metadata);
      }
      server.revision += 1;
      server.accepted.push(structuredClone(body));
      const account = { ...identity(), readPath: 'v3-mutate', ...head(), operationCount: body.operations.length };
      if (server.pauseAfterPaperBatch && body.operations.length) {
        server.writeEnabled = false;
        server.pauseAfterPaperBatch = false;
      }
      await respond(200, { account });
      return;
    }
    await respond(500, { error: `unexpected_mode:${mode}` });
  });
  return server;
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

  await page.goto(`${PREVIEW_BASE}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => savedState, { timeout: 30000 }).not.toBeNull();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accountSyncRead || '')).toBe('v3');

  expect(modes).toContain('account-v3-head');
  expect(modes.filter(mode => mode === 'account-v3-page')).toHaveLength(2);
  expect(modes).toContain('account-v3-delta');
  expect(modes).not.toContain('account-pull');
  // Initial account merge intentionally keeps the existing local scalar preference.
  // D3c3 changes only the remote read transport; it must not change legacy merge semantics.
  expect(savedState.hideRead).toBe(false);
  expect(Object.keys(savedState.papers).sort()).toEqual(['10.1234/a', '10.1234/b']);
  expect(savedState.papers['10.1234/a'].note).toBe('A');
  expect(savedState.papers['10.1234/b'].note).toBe('B');

  const remembered = await page.evaluate(({ revisionKey, userKey }) => ({
    revision: localStorage.getItem(revisionKey),
    user: localStorage.getItem(userKey),
  }), { revisionKey: REVISION_KEY, userKey: USER_KEY });
  expect(remembered).toEqual({ revision: '6', user: 'u-v3' });
});

test('new account under WRITE=1 migrates directly through V3 without creating a legacy document', async ({ page }) => {
  test.setTimeout(60_000);
  const key='10.1234/new-user';
  const local={
    ...globalState(false),
    papers:{
      [key]:{favorite:true,collections:[],note:'new-user',quickTerms:[],tags:[],updatedAt:10},
    },
    metadata:{
      [key]:{id:key,doi:key,title:'New User',journal:'JACS'},
    },
  };
  await seedSession(page,local);
  await stubCommonApi(page);

  const modes:string[]=[];
  const mutations:any[]=[];
  let revision=0;
  const emptyHead={
    ready:true,revision:0,updatedAt:0,globalState:globalState(false),
    globalRevision:0,paperCount:0,metadataCount:0,changeFloorRevision:0,
    papersSplit:true,metadataSplit:true,
  };

  await page.route('https://api.gczhouwld.com/api/user-ui/reader-counts', async route => {
    const body=route.request().postDataJSON() as any;
    const mode=String(body?.mode || '');
    if(!mode){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({counts:{}})});
      return;
    }
    modes.push(mode);
    if(mode==='account-v3-head'){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        account:{userId:'u-new',readPath:'v3-head',writeEnabled:true,writeAuthority:'legacy',...emptyHead},
      })});
      return;
    }
    if(mode==='account-v3-page'){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        account:{
          userId:'u-new',readPath:'v3-page',writeEnabled:true,writeAuthority:'legacy',
          ready:true,scanStartRevision:0,head:emptyHead,count:0,hasMore:false,nextKey:null,rows:[],
        },
      })});
      return;
    }
    if(mode==='account-v3-delta'){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        account:{
          userId:'u-new',readPath:'v3-delta',writeEnabled:true,writeAuthority:'legacy',
          ready:true,resetRequired:false,sinceRevision:0,targetRevision:0,head:emptyHead,
          globalRevision:0,count:0,hasMore:false,nextCursor:null,changes:[],
        },
      })});
      return;
    }
    if(mode==='account-v3-mutate'){
      mutations.push(structuredClone(body));
      expect(body.expectedRevision).toBe(revision);
      revision+=1;
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        account:{
          userId:'u-new',readPath:'v3-mutate',writeEnabled:true,writeAuthority:'v3',
          revision,updatedAt:100+revision,paperCount:revision>=2?1:0,
          metadataCount:revision>=2?1:0,operationCount:(body.operations||[]).length,changeFloorRevision:0,
        },
      })});
      return;
    }
    if(mode==='account-save'||mode==='account-pull'){
      await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'legacy_path_must_not_run'})});
      return;
    }
    await route.fulfill({status:400,contentType:'application/json',body:'{}'});
  });

  await page.goto(`${PREVIEW_BASE}/`,{waitUntil:'domcontentloaded'});
  await expect.poll(()=>mutations.length,{timeout:30000}).toBe(2);
  expect(mutations[0].operations).toEqual([]);
  expect(mutations[0].globalState).toBeTruthy();
  expect(mutations[1].operations).toHaveLength(1);
  expect(mutations[1].operations[0].paperKey).toBe(key);
  expect(modes).not.toContain('account-save');
  expect(modes).not.toContain('account-pull');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.accountSyncWrite || '')).toBe('v3');
  await expect.poll(()=>page.evaluate(k=>localStorage.getItem(k),REVISION_KEY)).toBe('2');
});

test('V3 write authority batches 65 dirty paper keys as 32/32/1 and never calls legacy account-save', async ({ page }) => {
  test.setTimeout(60_000);
  const local = {
    ...globalState(false),
    papers: {} as Record<string, any>,
    metadata: {} as Record<string, any>,
  };
  for (let index = 0; index < 65; index += 1) {
    const key = `10.1234/local-${String(index).padStart(2,'0')}`;
    local.papers[key] = {
      favorite:true,
      collections:[],
      note:`N${index}-${'x'.repeat(30000)}`,
      quickTerms:[],
      tags:[],
      updatedAt:100+index,
    };
    local.metadata[key] = { id:key,doi:key,title:`Local ${index}`,journal:'JACS' };
  }
  expect(JSON.stringify(local).length).toBeGreaterThan(1_500_000);
  await seedSession(page,local);
  await stubCommonApi(page);

  const modes:string[]=[];
  const mutations:any[]=[];
  const head = {
    ready:true,
    revision:10,
    updatedAt:1000,
    globalState:globalState(false),
    globalRevision:10,
    paperCount:0,
    metadataCount:0,
    changeFloorRevision:10,
    papersSplit:true,
    metadataSplit:true,
  };
  let nextRevision=10;

  await page.route('https://api.gczhouwld.com/api/user-ui/reader-counts', async route => {
    const body = route.request().postDataJSON() as any;
    const mode = String(body?.mode || '');
    if (!mode) {
      await route.fulfill({ status:200,contentType:'application/json',body:JSON.stringify({counts:{}}) });
      return;
    }
    modes.push(mode);

    if (mode === 'account-v3-head') {
      await route.fulfill({
        status:200,contentType:'application/json',
        body:JSON.stringify({account:{userId:'u-write',readPath:'v3-head',writeEnabled:true,...head}}),
      });
      return;
    }
    if (mode === 'account-v3-page') {
      await route.fulfill({
        status:200,contentType:'application/json',
        body:JSON.stringify({account:{
          userId:'u-write',readPath:'v3-page',writeEnabled:true,ready:true,
          scanStartRevision:10,head,count:0,hasMore:false,nextKey:null,rows:[],
        }}),
      });
      return;
    }
    if (mode === 'account-v3-delta') {
      await route.fulfill({
        status:200,contentType:'application/json',
        body:JSON.stringify({account:{
          userId:'u-write',readPath:'v3-delta',writeEnabled:true,ready:true,
          resetRequired:false,sinceRevision:10,targetRevision:10,head,
          globalRevision:10,count:0,hasMore:false,nextCursor:null,changes:[],
        }}),
      });
      return;
    }
    if (mode === 'account-v3-mutate') {
      mutations.push(structuredClone(body));
      expect(body.expectedRevision).toBe(nextRevision);
      expect(Array.isArray(body.operations)).toBe(true);
      expect(body.operations.length).toBeLessThanOrEqual(32);
      nextRevision += 1;
      await route.fulfill({
        status:200,contentType:'application/json',
        body:JSON.stringify({account:{
          userId:'u-write',readPath:'v3-mutate',writeEnabled:true,writeAuthority:'v3',
          revision:nextRevision,updatedAt:1000+nextRevision,
          paperCount:Math.min((nextRevision-10)*32,65),
          metadataCount:Math.min((nextRevision-10)*32,65),
          operationCount:body.operations.length,
          changeFloorRevision:10,
        }}),
      });
      return;
    }
    if (mode === 'account-save') {
      await route.fulfill({
        status:500,contentType:'application/json',
        body:JSON.stringify({error:'legacy_save_must_not_run'}),
      });
      return;
    }
    if (mode === 'account-pull') {
      await route.fulfill({
        status:500,contentType:'application/json',
        body:JSON.stringify({error:'legacy_pull_must_not_run'}),
      });
      return;
    }
    await route.fulfill({ status:400,contentType:'application/json',body:'{}' });
  });

  await page.goto(`${PREVIEW_BASE}/`, { waitUntil:'domcontentloaded' });
  await expect.poll(() => mutations.filter(item=>item.operations?.length>0).length, { timeout:30000 }).toBe(3);
  const paperMutations=mutations.filter(item=>item.operations?.length>0);
  const globalMutations=mutations.filter(item=>item.operations?.length===0 && item.globalState);
  expect(paperMutations.map(item=>item.operations.length)).toEqual([32,32,1]);
  expect(globalMutations.length).toBeLessThanOrEqual(1);
  expect(mutations.map(item=>item.expectedRevision)).toEqual(
    mutations.map((_,index)=>10+index)
  );
  expect(modes).not.toContain('account-save');
  expect(modes).not.toContain('account-pull');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accountSyncWrite || '')).toBe('v3');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), REVISION_KEY))
    .toBe(String(10+mutations.length));
});

test('live write-authority flip upgrades a dirty paper from legacy save to V3 mutate without reload', async ({ page }) => {
  test.setTimeout(60_000);
  await seedSession(page);
  await stubCommonApi(page);

  let activated=false;
  let initialLegacySave:any=null;
  const modes:string[]=[];
  const mutations:any[]=[];

  const headFor=(revision:number,writeEnabled:boolean)=>({
    ready:true,
    revision,
    updatedAt:revision*100,
    globalState:globalState(false),
    globalRevision:revision,
    paperCount:0,
    metadataCount:0,
    changeFloorRevision:revision,
    papersSplit:true,
    metadataSplit:true,
    writeEnabled,
  });

  await page.route('https://api.gczhouwld.com/api/user-ui/reader-counts', async route => {
    const body=route.request().postDataJSON() as any;
    const mode=String(body?.mode||'');
    if(!mode){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({counts:{}})});
      return;
    }
    modes.push(mode);

    if(mode==='account-v3-head'){
      const revision=activated?2:1;
      const writeEnabled=activated;
      const head=headFor(revision,writeEnabled);
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        account:{userId:'u-live',readPath:'v3-head',writeEnabled,writeAuthority:'legacy',...head},
      })});
      return;
    }
    if(mode==='account-v3-page'){
      const revision=activated?2:1;
      const writeEnabled=activated;
      const head=headFor(revision,writeEnabled);
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        account:{userId:'u-live',readPath:'v3-page',writeEnabled,writeAuthority:'legacy',ready:true,
          scanStartRevision:revision,head,count:0,hasMore:false,nextKey:null,rows:[]},
      })});
      return;
    }
    if(mode==='account-v3-delta'){
      const revision=activated?2:1;
      const writeEnabled=activated;
      const head=headFor(revision,writeEnabled);
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        account:{userId:'u-live',readPath:'v3-delta',writeEnabled,writeAuthority:'legacy',ready:true,
          resetRequired:false,sinceRevision:revision,targetRevision:revision,head,
          globalRevision:revision,count:0,hasMore:false,nextCursor:null,changes:[]},
      })});
      return;
    }
    if(mode==='account-save'){
      if(!activated){
        initialLegacySave=structuredClone(body.state);
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          account:{userId:'u-live',revision:2,updatedAt:200,state:body.state,writeEnabled:false,writeAuthority:'legacy'},
        })});
        return;
      }
      await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({
        error:'user_library_client_upgrade_required',currentRevision:2,writePath:'v3',
      })});
      return;
    }
    if(mode==='account-v3-mutate'){
      mutations.push(structuredClone(body));
      expect(body.expectedRevision).toBe(2);
      expect(body.operations).toHaveLength(1);
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        account:{userId:'u-live',readPath:'v3-mutate',writeEnabled:true,writeAuthority:'v3',
          revision:3,updatedAt:300,paperCount:1,metadataCount:1,
          operationCount:1,changeFloorRevision:2},
      })});
      return;
    }
    if(mode==='account-pull'){
      await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'legacy_pull_must_not_run'})});
      return;
    }
    await route.fulfill({status:400,contentType:'application/json',body:'{}'});
  });

  await page.goto(`${PREVIEW_BASE}/`, {waitUntil:'domcontentloaded'});
  await expect.poll(()=>initialLegacySave,{timeout:30000}).not.toBeNull();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.accountSyncWrite||'')).toBe('legacy');

  activated=true;
  const actions=page.locator('gallery-paper-actions').first();
  await actions.locator('button[data-action="favorite"]').click();
  await actions.locator('button[data-action="toggle-favorite"]').click();

  await expect.poll(()=>mutations.length,{timeout:10000}).toBe(1);
  expect(modes.filter(mode=>mode==='account-v3-mutate')).toHaveLength(1);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.accountSyncWrite||'')).toBe('v3');
  await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),REVISION_KEY)).toBe('3');
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

  await page.goto(`${PREVIEW_BASE}/`, { waitUntil: 'domcontentloaded' });
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

  await page.goto(`${PREVIEW_BASE}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => savedState, { timeout: 30000 }).not.toBeNull();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accountSyncRead || '')).toBe('legacy');
  expect(modes).toContain('account-pull');
  expect(savedState.papers['10.1234/leak']).toBeUndefined();
  expect(savedState.papers['10.1234/legacy'].note).toBe('integrity fallback');
});

test('V3-authoritative account under global write rollback stays suspended and never attempts legacy save', async ({ page }) => {
  test.setTimeout(60_000);
  const local = fullState('local pending');
  await seedSession(page, local);
  await stubCommonApi(page);

  const modes:string[]=[];
  const remote = fullState('remote committed');
  const head = {
    ready:true,
    revision:2,
    updatedAt:200,
    globalState:globalState(false),
    globalRevision:1,
    paperCount:1,
    metadataCount:1,
    changeFloorRevision:1,
    papersSplit:true,
    metadataSplit:true,
  };

  await page.route('https://api.gczhouwld.com/api/user-ui/reader-counts', async route => {
    const body=route.request().postDataJSON() as any;
    const mode=String(body?.mode || '');
    if(!mode){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({counts:{}})});
      return;
    }
    modes.push(mode);
    if(mode==='account-v3-head'){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        account:{userId:'u-suspended',readPath:'v3-head',writeEnabled:false,writeAuthority:'v3',...head},
      })});
      return;
    }
    if(mode==='account-v3-page'){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        account:{
          userId:'u-suspended',readPath:'v3-page',writeEnabled:false,writeAuthority:'v3',
          ready:true,scanStartRevision:2,head,count:1,hasMore:false,nextKey:null,
          rows:[{
            paperKey:'10.1234/legacy',
            paperPresent:true,
            paperState:remote.papers['10.1234/legacy'],
            metadataPresent:true,
            metadata:remote.metadata['10.1234/legacy'],
          }],
        },
      })});
      return;
    }
    if(mode==='account-v3-delta'){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        account:{
          userId:'u-suspended',readPath:'v3-delta',writeEnabled:false,writeAuthority:'v3',
          ready:true,resetRequired:false,sinceRevision:2,targetRevision:2,head,
          globalRevision:1,count:0,hasMore:false,nextCursor:null,changes:[],
        },
      })});
      return;
    }
    if(mode==='account-save'||mode==='account-v3-mutate'){
      await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'write_must_not_run_while_suspended'})});
      return;
    }
    if(mode==='account-pull'){
      await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'legacy_pull_must_not_run'})});
      return;
    }
    await route.fulfill({status:400,contentType:'application/json',body:'{}'});
  });

  await page.goto(`${PREVIEW_BASE}/`,{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.accountSyncRead||'')).toBe('v3');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.accountSyncWrite||'')).toBe('suspended');
  await page.waitForTimeout(1500);

  expect(modes).toContain('account-v3-head');
  expect(modes).toContain('account-v3-page');
  expect(modes).toContain('account-v3-delta');
  expect(modes).not.toContain('account-save');
  expect(modes).not.toContain('account-v3-mutate');
  expect(modes).not.toContain('account-pull');
  const localAfter=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{}'),STATE_KEY);
  expect(localAfter.papers['10.1234/legacy'].note).toBe('local pending');
  expect(await page.evaluate(key=>localStorage.getItem(key),REVISION_KEY)).toBe('2');
});

test('suspended dirty account resumes on a bounded poll without reload and keeps local edits plus remote metadata', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install();
  await seedSession(page, fullState('local pending'));
  await stubCommonApi(page);
  const server = await mutableV3Account(page, fullState('remote committed'), false);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(`${PREVIEW_BASE}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accountSyncWrite)).toBe('suspended');

  // Add another dirty row while writes are paused, through the real card UI.
  const actions = page.locator('gallery-paper-actions').first();
  await actions.locator('button[data-action="favorite"]').click();
  await actions.locator('button[data-action="toggle-favorite"]').click();
  await page.clock.fastForward(1000);
  await expect.poll(() => server.modes.filter(mode => mode === 'account-v3-head').length).toBe(2);
  const paused = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), STATE_KEY);
  const addedKey = Object.keys(paused.papers).find(key => key !== '10.1234/legacy')!;
  expect(addedKey).toBeTruthy();
  expect(paused.papers[addedKey].favorite).toBe(true);
  expect(paused.papers['10.1234/legacy'].note).toBe('local pending');
  expect(server.attempts).toEqual([]);
  expect(await page.evaluate(key => localStorage.getItem(key), REVISION_KEY)).toBe('10');

  // A newer remote row must not erase an unsent local note. Its metadata and
  // unrelated tags must survive the full-row operation used to save that note.
  server.state.papers['10.1234/legacy'].note = 'newer remote note';
  server.state.papers['10.1234/legacy'].updatedAt = Date.now() + 100_000;
  server.state.papers['10.1234/legacy'].tags = ['remote-only-tag'];
  server.state.metadata['10.1234/legacy'].title = 'New remote title';
  server.state.papers['10.1234/remote-only'] = { favorite: true, collections: [], note: 'remote only', quickTerms: [], tags: [] };
  server.state.metadata['10.1234/remote-only'] = { id: '10.1234/remote-only', title: 'Remote only', journal: 'JACS' };
  server.revision += 1;
  server.writeEnabled = true;
  await page.clock.fastForward(46_000);

  await expect.poll(() => server.state.papers['10.1234/legacy'].note).toBe('local pending');
  await expect.poll(() => server.state.papers[addedKey]?.favorite).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accountSyncWrite)).toBe('v3');
  expect(server.accepted[0].expectedRevision).toBe(11);
  expect(server.state.metadata['10.1234/legacy'].title).toBe('New remote title');
  expect(server.state.papers['10.1234/legacy'].tags).toEqual(['remote-only-tag']);
  expect(server.state.papers['10.1234/remote-only'].note).toBe('remote only');
  expect(server.modes).not.toContain('account-save');
  expect(server.modes).not.toContain('account-pull');
  const settledCount = server.accepted.length;
  await page.clock.fastForward(46_000);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), REVISION_KEY)).toBe(String(server.revision));
  expect(server.accepted).toHaveLength(settledCount);
  expect(errors).toEqual([]);
});

test('a paused multi-batch V3 save resumes the remaining rows without replaying acknowledged rows', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install();
  const local = { ...globalState(false), papers: {} as Record<string, any>, metadata: {} as Record<string, any> };
  for (let index = 0; index < 65; index += 1) {
    const key = `10.1234/resume-${String(index).padStart(2, '0')}`;
    local.papers[key] = { favorite: true, collections: [], note: `pending ${index}`, quickTerms: [], tags: [], updatedAt: 100 + index };
    local.metadata[key] = { id: key, doi: key, title: `Paper ${index}`, journal: 'JACS' };
  }
  await seedSession(page, local);
  await stubCommonApi(page);
  const server = await mutableV3Account(page, { ...globalState(false), papers: {}, metadata: {} }, true);
  server.pauseAfterPaperBatch = true;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(`${PREVIEW_BASE}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accountSyncWrite)).toBe('suspended');
  expect(Object.keys(server.state.papers)).toHaveLength(32);
  const paused = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), STATE_KEY);
  expect(Object.keys(paused.papers)).toHaveLength(65);
  expect(paused.papers['10.1234/resume-64'].note).toBe('pending 64');
  const acknowledged = server.accepted.filter(body => body.operations.length)[0].operations.map((operation: any) => operation.paperKey);

  // Another device changes a row from the acknowledged first batch while this
  // device still has 33 pending rows. Recovery must not replay its old copy.
  const firstKey = acknowledged[0];
  server.state.papers[firstKey].note = 'new remote note after first commit';
  server.state.metadata[firstKey].title = 'Remote metadata after first commit';
  server.revision += 1;
  const resumedRevision = server.revision;
  server.writeEnabled = true;
  await page.clock.fastForward(46_000);

  await expect.poll(() => Object.keys(server.state.papers).length).toBe(65);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accountSyncWrite)).toBe('v3');
  const paperBatches = server.accepted.filter(body => body.operations.length);
  expect(paperBatches.map(body => body.operations.length)).toEqual([32, 32, 1]);
  expect(paperBatches[1].expectedRevision).toBe(resumedRevision);
  expect(paperBatches.slice(1).flatMap(body => body.operations.map((operation: any) => operation.paperKey))
    .some(key => acknowledged.includes(key))).toBe(false);
  expect(server.state.papers[firstKey].note).toBe('new remote note after first commit');
  expect(server.state.metadata[firstKey].title).toBe('Remote metadata after first commit');
  expect(server.state.papers['10.1234/resume-64'].note).toBe('pending 64');
  expect(server.state.metadata['10.1234/resume-64'].title).toBe('Paper 64');
  expect(server.modes).not.toContain('account-save');
  expect(server.modes).not.toContain('account-pull');
  const settledCount = server.accepted.length;
  await page.clock.fastForward(46_000);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), REVISION_KEY)).toBe(String(server.revision));
  expect(server.accepted).toHaveLength(settledCount);
  expect(errors).toEqual([]);
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

  await page.goto(`${PREVIEW_BASE}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('organic-gallery-account-sync-revision-v1'))).toBe('3');

  await page.evaluate(sessionKey => localStorage.removeItem(sessionKey), SESSION_KEY);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('organic-gallery-account-sync-revision-v1')), { timeout: 5000 }).toBeNull();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accountSyncRead || '')).toBe('none');
  expect(await page.evaluate(() => localStorage.getItem('organic-gallery-account-sync-user-v1'))).toBeNull();
});
