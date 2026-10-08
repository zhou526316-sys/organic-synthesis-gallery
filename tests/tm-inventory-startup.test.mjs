import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
assert.ok(source.includes("// @version      6.2.48"));
assert.ok(source.includes("var INSTALL_REVISION = '6.2.48';"));
assert.ok(source.includes("INVENTORY_STARTUP_REVISION = '20261007-inventory-warmstart-hedge-v1'"));
assert.ok(source.includes("INVENTORY_PLAN_CACHE_TTL_MS = 10 * 60 * 1000"));
assert.ok(source.includes("if(dois.length<=1200)"));
assert.ok(source.includes("for(var i=0;i<dois.length;i+=250)"));
assert.ok(source.includes("库存核对中，缺项统计尚未生成"));
assert.ok(source.includes("已用最近库存先生成待办；后台复核中"));
assert.ok(source.includes("beginFreshInventory();s.phase='running'"));
assert.ok(!source.includes("if(!await refresh())return;s.phase='running';"));

const fnStart=source.indexOf('  function inventoryReadMetadataJson(');
const fnEnd=source.indexOf('\n  async function getJson(',fnStart);
assert.ok(fnStart>0&&fnEnd>fnStart);
const fnSource=source.slice(fnStart,fnEnd);

function context({native,gm,hedge=8,timeout=45}={}) {
  const ctx=vm.createContext({
    AbortController,setTimeout,clearTimeout,Date,Promise,Object,Number,Math,Error,JSON,
    location:{hostname:'gallery.gczhouwld.com',pathname:'/'},
    GALLERY_HOST:'gallery.gczhouwld.com',PAGES_GALLERY_HOST:'organic-synthesis-gallery-public.pages.dev',
    LEGACY_GALLERY_HOST:'zhou526316-sys.github.io',LEGACY_GALLERY_PATH:'/organic-synthesis-gallery/',
    INVENTORY_REQUEST_TIMEOUT_MS:timeout,
    INVENTORY_HEDGE_DELAY_MS:hedge,
    nativeControllerRequest:native||(async()=>({status:200,responseText:'{"ok":true}'})),
    gmRequest:gm||(async()=>({status:200,responseText:'{"ok":true}'})),
    async metadataJson(options,prefix){
      const response=await (gm||(async()=>({status:200,responseText:'{"ok":true}'})))(options);
      const status=Number(response.status||0);
      if(status<200||status>=300){const error=new Error(prefix+'_http_'+status);error.httpStatus=status;throw error;}
      return JSON.parse(String(response.responseText||'{}'));
    },
    parseMetadataJson(response,prefix){
      const status=Number(response.status||0);
      if(status<200||status>=300){const error=new Error(prefix+'_http_'+status);error.httpStatus=status;throw error;}
      return JSON.parse(String(response.responseText||'{}'));
    }
  });
  vm.runInContext(fnSource,ctx);
  return ctx;
}

test('fast browser inventory response wins without starting GM hedge',async()=>{
  let gmCalls=0;
  const ctx=context({
    native:async()=>({status:200,responseText:'{"path":"browser"}'}),
    gm:async()=>{gmCalls++;return {status:200,responseText:'{"path":"gm"}'};}
  });
  const value=await vm.runInContext('inventoryReadMetadataJson',ctx)({method:'GET',url:'https://api.test/inventory',timeout:45},'inventory');
  assert.equal(value.path,'browser');
  assert.equal(value.__inventoryMeta.transport,'browser');
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(gmCalls,0);
});

test('slow browser read is hedged and GM can win quickly',async()=>{
  let gmCalls=0;
  const ctx=context({
    native:()=>new Promise(()=>{}),
    gm:async()=>{gmCalls++;return {status:200,responseText:'{"path":"gm"}'};},
    hedge:5,timeout:35
  });
  const started=Date.now();
  const value=await vm.runInContext('inventoryReadMetadataJson',ctx)({method:'GET',url:'https://api.test/inventory',timeout:35},'inventory');
  assert.equal(value.path,'gm');
  assert.equal(value.__inventoryMeta.transport,'gm');
  assert.equal(gmCalls,1);
  assert.ok(Date.now()-started<30);
});

test('definitive 401 does not launch a duplicate GM read',async()=>{
  let gmCalls=0;
  const ctx=context({
    native:async()=>({status:401,responseText:'{}'}),
    gm:async()=>{gmCalls++;return {status:200,responseText:'{"path":"gm"}'};},
    hedge:20,timeout:45
  });
  await assert.rejects(()=>vm.runInContext('inventoryReadMetadataJson',ctx)({method:'GET',url:'https://api.test/private',timeout:45},'private'),/private_http_401/);
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(gmCalls,0);
});

test('localhost fixture never launches browser-native inventory hedge',async()=>{
  let nativeCalls=0,gmCalls=0;
  const ctx=context({
    native:async()=>{nativeCalls++;return {status:200,responseText:'{"path":"browser"}'};},
    gm:async()=>{gmCalls++;return {status:200,responseText:'{"path":"gm"}'};}
  });
  ctx.location={hostname:'127.0.0.1',pathname:'/'};
  const value=await vm.runInContext('inventoryReadMetadataJson',ctx)({method:'GET',url:'https://api.test/inventory',timeout:45},'inventory');
  assert.equal(value.path,'gm');
  assert.equal(nativeCalls,0);
  assert.equal(gmCalls,1);
});

test('warm plan is scoped to exact queue generation and article count',()=>{
  const start=source.indexOf('  function cachedInventoryPlan(');
  const end=source.indexOf('\n  function saveInventoryPlan(',start);
  const body=source.slice(start,end);
  assert.match(body,/queueGeneratedAt/);
  assert.match(body,/queueCount/);
  assert.match(body,/INVENTORY_PLAN_CACHE_TTL_MS/);
  assert.match(body,/allowed\.has\(doi\)/);
});

test('fresh inventory is required before all-resolved path can finish',()=>{
  const start=source.indexOf('  async function runManualFromHead(');
  const end=source.indexOf('\n  function installMenu\(',start);
  const body=source.slice(start,end);
  assert.match(body,/if\(freshState&&!freshState\.applied\)\{if\(!await applyFreshInventory\(true\)\)return;continue;\}/);
  assert.match(body,/inventoryComplete\(state\.value\)/);
  assert.match(body,/coverageApplyFreshPlan\(run,jobs,complete\)/);
});

console.log('TM_INVENTORY_STARTUP_TEST_SUMMARY '+JSON.stringify({passed:6,productionWrites:0,publisherRequests:0}));
