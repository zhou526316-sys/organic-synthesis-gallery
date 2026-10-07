import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';

// Run from the repository root. TM_SOURCE_FILE supports an isolated review copy.
const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require('playwright')); }
catch (error) {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
  ({chromium} = createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, '__tm_fixture.cjs'))('playwright'));
}
const out = process.env.RUNNER_TEMP || '/tmp';
await fs.mkdir(out, {recursive:true});
const source = await fs.readFile(process.env.TM_SOURCE_FILE || 'public/toc-mainline.user.js', 'utf8');
assert.match(source, /async\s+function\s+tryResumeInterruptedManualRun\s*\(/, 'guarded recovery entry point must be present');
assert.match(source, /function\s+controllerTick\s*\(/, 'startup and periodic tick entry point must be present');
const cut = source.lastIndexOf('  installManualRestartListener();');
assert.ok(cut > 0, 'userscript bootstrap boundary must exist');
const script = source.slice(0, cut) + `
  isGalleryPage = () => true;
  writeToken = () => 'fixture-local-only';
  badge = (text) => { globalThis.__badges.push(String(text)); };
  // The real browser exercises recovery, storage fencing and acquisition timing.
  // Root's separate test covers the actual inventory/capture loop.
  runManualFromHead = async function(run) {
    const row = {id:run.id,owner:CONTROLLER_ID,startedAt:run.startedAt};
    globalThis.__manualStarts.push(row);
    GM_setValue('fixture:start:' + run.id, row);
    return {started:true,id:run.id};
  };
  globalThis.T = {
    tryResumeInterruptedManualRun, controllerTick, requestControllerPause,
    owner:CONTROLLER_ID, controllerRevision:CONTROLLER_REVISION,
    installRevision:INSTALL_REVISION, version:VERSION,
    lifecycleRevision:IMMEDIATE_RESTART_REVISION,
    coverageRevision:QUEUE_COVERAGE_REVISION,
    keys:{manual:MANUAL_RUN_KEY,lease:LEASE_KEY,summary:SUMMARY_KEY,
      active:ACTIVE_JOB_KEY,heartbeat:HEARTBEAT_KEY,enabled:ENABLED_KEY,
      abort:ABORT_KEY,resume:RESUME_REQUEST_KEY}
  };
  installManualRestartListener();
})();`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, {'content-type':'text/html; charset=utf-8'});
  res.end('<!doctype html><meta charset="utf-8"><title>Manual resume fixture</title><body><h1>Manual resume fixture</h1></body>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({headless:true});
const report = {
  mockedGM:true, mockedCaptureLoop:true, consoleErrors:[],pageErrors:[],
  failedRequests:[],externalRequests:[],gmNetworkAttempts:[],responses:[],
  cases:[],passed:false
};
const contexts = [];

async function fixture(name, pageCount = 1) {
  const context = await browser.newContext({viewport:{width:1050,height:800}, serviceWorkers:'block'});
  contexts.push({context,name});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  await context.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin === origin) return route.continue();
    report.externalRequests.push({name,url});
    return route.abort('blockedbyclient');
  });
  await context.addInitScript(() => {
    const listeners = [];
    globalThis.__manualStarts = [];
    globalThis.__badges = [];
    globalThis.__gmNetworkAttempts = [];
    // Every read and listener delivery is detached from the stored object.
    const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    globalThis.GM_getValue = (key, fallback) => {
      const value = localStorage.getItem(key);
      return value === null ? clone(fallback) : JSON.parse(value);
    };
    globalThis.GM_setValue = (key, value) => {
      const oldValue = GM_getValue(key, null);
      localStorage.setItem(key, JSON.stringify(value));
      for (const row of listeners.filter(row => row.key === key)) row.fn(key, clone(oldValue), clone(value), false);
    };
    globalThis.GM_deleteValue = key => {
      const oldValue = GM_getValue(key, null);
      localStorage.removeItem(key);
      for (const row of listeners.filter(row => row.key === key)) row.fn(key, clone(oldValue), undefined, false);
    };
    globalThis.GM_listValues = () => Object.keys(localStorage);
    globalThis.GM_addValueChangeListener = (key, fn) => {listeners.push({key,fn});return listeners.length;};
    globalThis.addEventListener('storage', event => {
      const oldValue = event.oldValue === null ? undefined : JSON.parse(event.oldValue);
      const newValue = event.newValue === null ? undefined : JSON.parse(event.newValue);
      for (const row of listeners.filter(row => row.key === event.key)) row.fn(event.key, clone(oldValue), clone(newValue), true);
    });
    globalThis.GM_registerMenuCommand = () => {};
    const forbidden = name => (...args) => {
      __gmNetworkAttempts.push({name,url:String(args[0]?.url || args[0] || '')});
      throw new Error('fixture forbids real network or publisher tabs: ' + name);
    };
    globalThis.GM_xmlhttpRequest = forbidden('GM_xmlhttpRequest');
    globalThis.GM_openInTab = forbidden('GM_openInTab');
    globalThis.GM_download = forbidden('GM_download');
  });
  const pages = [];
  for (let index = 0; index < pageCount; index++) {
    const page = await context.newPage();
    page.on('console', msg => {if (msg.type() === 'error') report.consoleErrors.push({name,text:msg.text()});});
    page.on('pageerror', error => report.pageErrors.push({name,error:String(error)}));
    page.on('requestfailed', req => report.failedRequests.push({name,url:req.url(),failure:req.failure()?.errorText}));
    page.on('response', res => report.responses.push({name,url:res.url(),status:res.status()}));
    await page.goto(origin + '/?fixture=' + encodeURIComponent(name) + '&page=' + index);
    await page.addScriptTag({content:script});
    pages.push(page);
  }
  return pages;
}

async function seed(page, options = {}) {
  return page.evaluate(options => {
    const k = T.keys, now = Date.now(), id = 'interrupted-fixture';
    const startedAt = new Date(now - 30 * 60 * 1000).toISOString();
    GM_setValue(k.manual, {id,owner:'retired-fixture-page',startedAt,revision:T.lifecycleRevision});
    GM_setValue(k.summary, {controllerRunId:'manual:' + id,controllerRevision:T.controllerRevision,
      version:T.version,mode:'missing_only',queueCoverageRevision:T.coverageRevision,
      startedAt,phase:'running',total:2,pendingMissing:2,results:[]});
    GM_setValue(k.lease, {owner:options.foreignLease ? 'other-live-controller' : 'manual:' + id,
      manualRunId:options.foreignLease ? undefined : id,
      controllerRevision:T.controllerRevision,installRevision:T.installRevision,
      expiresAt:now + (options.foreignLease ? 90000 : -1000)});
    GM_setValue(k.enabled, !options.disabled);
    if (options.abort) GM_setValue(k.abort, {at:now,reason:'user_aborted'});
    else GM_deleteValue(k.abort);
    GM_deleteValue(k.active);GM_deleteValue(k.heartbeat);GM_deleteValue(k.resume);
    GM_setValue('fixture:retained-receipt', {contentHash:'fixture-saved-receipt',stored:true});
    // Prove that mutations to a value returned by GM_getValue do not alias storage.
    const detached = GM_getValue(k.manual);detached.owner = 'accidental-alias';
    if (GM_getValue(k.manual).owner === 'accidental-alias') throw new Error('GM fixture aliases stored objects');
    return id;
  }, options);
}

try {
  {
    const [page] = await fixture('expired-idle-once');
    const oldId = await seed(page);
    await page.evaluate(async () => {await T.tryResumeInterruptedManualRun();});
    await page.waitForFunction(() => __manualStarts.length === 1, null, {timeout:4000});
    await page.evaluate(async () => {await T.tryResumeInterruptedManualRun();await T.controllerTick();});
    const state = await page.evaluate(() => ({starts:__manualStarts,manual:GM_getValue(T.keys.manual),lease:GM_getValue(T.keys.lease),receipt:GM_getValue('fixture:retained-receipt')}));
    assert.equal(state.starts.length, 1, 'one interrupted run must recover exactly once');
    assert.notEqual(state.manual.id, oldId, 'recovery must mint a new generation');
    assert.equal(state.manual.id, state.starts[0].id);
    assert.equal(state.lease.owner, 'manual:' + state.manual.id);
    assert.equal(state.receipt.stored, true, 'saved receipts must remain intact');
    report.cases.push('expired idle run recovers once with new generation and retained receipts');
  }
  for (const options of [{foreignLease:true},{disabled:true},{abort:true}]) {
    const name = Object.keys(options)[0];
    const [page] = await fixture(name);
    const oldId = await seed(page, options);
    const before = await page.evaluate(() => ({lease:GM_getValue(T.keys.lease),enabled:GM_getValue(T.keys.enabled),abort:GM_getValue(T.keys.abort,null)}));
    const result = await page.evaluate(async () => {const result=await T.tryResumeInterruptedManualRun();await T.controllerTick();return result;});
    const after = await page.evaluate(() => ({starts:__manualStarts,manual:GM_getValue(T.keys.manual),lease:GM_getValue(T.keys.lease),enabled:GM_getValue(T.keys.enabled),abort:GM_getValue(T.keys.abort,null)}));
    assert.equal(result, false, name + ' must not start recovery');
    assert.equal(after.starts.length, 0);
    assert.equal(after.manual.id, oldId);
    assert.deepEqual(after.lease, before.lease, name + ' must not replace a lease');
    assert.equal(after.enabled, before.enabled, name + ' must not enable capture');
    assert.deepEqual(after.abort, before.abort, name + ' must preserve pause intent');
    report.cases.push(name + ' blocks automatic recovery without changing ownership or pause');
  }
  {
    const [a,b] = await fixture('two-page-race', 2);
    const oldId = await seed(a);
    assert.equal(await b.evaluate(() => GM_getValue(T.keys.manual).id), oldId, 'pages must share GM storage');
    const startAt = Date.now() + 100;
    await Promise.all([a,b].map(page => page.evaluate(async startAt => {
      await new Promise(resolve => setTimeout(resolve, Math.max(0,startAt-Date.now())));
      await T.tryResumeInterruptedManualRun();
    }, startAt)));
    const starts = (await Promise.all([a,b].map(page => page.evaluate(() => __manualStarts)))).flat();
    assert.equal(starts.length, 1, 'two competing pages must start only one capture generation');
    const state = await a.evaluate(() => ({manual:GM_getValue(T.keys.manual),lease:GM_getValue(T.keys.lease),startKeys:GM_listValues().filter(key=>key.startsWith('fixture:start:'))}));
    assert.equal(state.startKeys.length, 1, 'unique persisted generation witnesses must match');
    assert.notEqual(state.manual.id, oldId);
    assert.equal(state.manual.id, starts[0].id);
    assert.equal(state.manual.owner, starts[0].owner);
    assert.equal(state.lease.owner, 'manual:' + starts[0].id);
    report.cases.push('two real browser pages compete through shared detached storage and only one wins');
  }
  for (const {context,name} of contexts) for (const page of context.pages()) {
    report.gmNetworkAttempts.push(...await page.evaluate(() => __gmNetworkAttempts).then(rows=>rows.map(row=>({name,...row}))));
  }
  assert.equal(report.externalRequests.length,0,'no external request may be attempted');
  assert.equal(report.gmNetworkAttempts.length,0,'no GM request or publisher tab may be attempted');
  assert.equal(report.consoleErrors.length,0,'browser console must be clean');
  assert.equal(report.pageErrors.length,0,'no uncaught browser errors');
  assert.equal(report.failedRequests.length,0,'fixture requests must succeed');
  report.passed = true;
} catch (error) {
  report.error = String(error.stack || error);
  for (const {context,name} of contexts) for (const [index,page] of context.pages().entries()) {
    await page.screenshot({path:path.join(out, 'tm-manual-resume-' + name + '-' + index + '.png')}).catch(()=>{});
  }
  throw error;
} finally {
  for (const {context,name} of contexts) {
    await context.tracing.stop({path:path.join(out,'tm-manual-resume-' + name + '-trace.zip')});
    await context.close();
  }
  await fs.writeFile(path.join(out,'tm-manual-resume-browser-report.json'),JSON.stringify(report,null,2));
  console.log('MANUAL_RESUME_BROWSER_REPORT',JSON.stringify(report));
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
