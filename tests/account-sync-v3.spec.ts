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

  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
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
          userId:'u-write',readPath:'v3-mutate',writeEnabled:true,
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

  await page.goto('http://127.0.0.1:4173/', { waitUntil:'domcontentloaded' });
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
        account:{userId:'u-live',readPath:'v3-mutate',writeEnabled:true,
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

  await page.goto('http://127.0.0.1:4173/', {waitUntil:'domcontentloaded'});
  await expect.poll(()=>initialLegacySave,{timeout:30000}).not.toBeNull();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.accountSyncWrite||'')).toBe('legacy');

  activated=true;
  const actions=page.locator('gallery-paper-actions').first();
  await actions.locator('button[data-action="favorite"]').click();

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

  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
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
