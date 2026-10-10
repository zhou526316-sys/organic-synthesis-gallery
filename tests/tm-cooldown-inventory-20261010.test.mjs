import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
function between(start,end) {
  const a=source.indexOf(start);
  assert.ok(a>=0,'Missing real source anchor '+start);
  const b=source.indexOf(end,a+start.length);
  assert.ok(b>a,'Missing real source end '+end);
  return source.slice(a,b);
}
const accessFns=between('  function publisherAccessCooldownKey(', '  function publisherDispatchKey(');
const baseline=Date.parse('2026-10-10T02:28:40Z');
function accessHarness() {
  let clock=baseline;
  const store=new Map();
  const C=class extends Date {static now(){return clock;}};
  const ctx=vm.createContext({
    P:'osg-toc-v6:',PUBLISHER_ACCESS_COOLDOWN_PREFIX:'osg-toc-v6:publisher-access-cooldown:',
    PUBLISHER_DOI_COOLDOWN_PREFIX:'osg-toc-v6:doi-access-cooldown-v1:',
    PUBLISHER_COOLDOWN_POLICY_REVISION:'20261010-doi-first-authoritative-global-v1',
    PUBLISHER_ACCESS_COOLDOWN_MS:30*60*1000,
    Date:C,Number,Boolean,String,Math,encodeURIComponent,
    normalizeDoi:x=>String(x||'').toLowerCase().trim(),
    publisherForDoi:x=>String(x).startsWith('10.1039/')?'rsc':'acs',
    GM_getValue:(key,fallback)=>store.has(key)?store.get(key):fallback,
    GM_setValue:(key,row)=>store.set(key,row),
    GM_deleteValue:key=>store.delete(key),
  });
  vm.runInContext(accessFns,ctx);
  return {ctx,store,advance(ms){clock+=ms;}};
}
const rsc={doi:'10.1039/d6gc03748h',publisher:'rsc'};
const rscOther={doi:'10.1039/d6sc06407h',publisher:'rsc'};
const acs={doi:'10.1021/jacs.6c17448',publisher:'acs'};
const acsOther={doi:'10.1021/acs.joc.6c01921',publisher:'acs'};

test('a single verified access gate cools only its bound DOI, never a whole publisher',()=>{
  const h=accessHarness(),T=h.ctx;
  const row=T.markPublisherAccessCooldown(rsc,'publisher_access_gate');
  assert.equal(row.scope,'doi');
  assert.equal(row.until-baseline,30*60*1000);
  assert.equal(T.publisherAccessCooldownUntil(rsc),row.until);
  assert.equal(T.publisherAccessCooldownUntil(rscOther),0);
  assert.equal(T.publisherAccessCooldownUntil(acs),0);
  assert.equal(h.store.has('osg-toc-v6:publisher-access-cooldown:rsc'),false);
  h.advance(30*60*1000+1);
  assert.equal(T.publisherAccessCooldownUntil(rsc),0,'one-DOI cooling expires safely');
});
test('a prior unaudited publisher-wide cooldown is not propagated after upgrade',()=>{
  const h=accessHarness(),T=h.ctx;
  const key=T.publisherAccessCooldownKey('acs');
  h.store.set(key,{publisher:'acs',doi:acs.doi,reason:'publisher_access_gate',until:baseline+30*60*1000});
  assert.equal(T.publisherAccessCooldownUntil(acsOther),0);
  assert.equal(h.store.has(key),false,'unverified legacy global record is retired');
});
test('denials and missing evidence cannot promote a DOI gate into whole-publisher cooling',()=>{
  const h=accessHarness(),T=h.ctx;
  for(const evidence of [null,{publisherWide:true,verified:true,httpStatus:403,retryAfterMs:1800000},
       {publisherWide:true,verified:false,httpStatus:429,retryAfterMs:1800000},
       {publisherWide:true,verified:true,httpStatus:429,retryAfterMs:0}]) {
    const row=T.markPublisherAccessCooldown(acs,'publisher_access_gate',evidence);
    assert.equal(row.scope,'doi');
    assert.equal(T.publisherAccessCooldownUntil(acsOther),0);
  }
});
test('only authoritative publisher-wide 429 plus Retry-After can hold other DOI tasks',()=>{
  const h=accessHarness(),T=h.ctx;
  const record=T.markPublisherAccessCooldown(acs,'publisher_rate_limit',
    {publisherWide:true,verified:true,httpStatus:429,retryAfterMs:45*60*1000});
  assert.equal(record.scope,'publisher');
  assert.equal(T.publisherAccessCooldownUntil(acsOther),record.until);
  assert.equal(T.publisherAccessCooldownUntil(rscOther),0);
  h.advance(45*60*1000+1);
  assert.equal(T.publisherAccessCooldownUntil(acsOther),0);
});
test('real publisher access gate is still detected and respects original wait threshold',()=>{
  const f=between('  async function waitForPairedVisuals(', '  function privatePdfCaptureEligibleByAddedDate(');
  assert.match(f,/state\.auth \|\| state\.challenge/);
  assert.match(f,/state\.accessGate && Date\.now\(\)-accessGateStarted >= 12000/);
  assert.match(f,/markPublisherAccessCooldown\(job,'publisher_access_gate'\)/);
  assert.match(f,/event:'doi_cooldown'/);
  assert.match(f,/throw new Error\('publisher_access_gate'\)/);
});
test('controller respects both cooldown scopes and exposes exact DOI and reason',()=>{
  const manual=between('  async function runManualFromHead(', '  function completeControllerResume(');
  assert.match(manual,/publisherAccessCooldownDetail\(job\)/);
  assert.match(manual,/candidate\.deferReason=cooldown\.scope==='publisher'\?'publisher_access_cooldown':'doi_access_cooldown'/);
  assert.match(manual,/if\(!row\)/);
  const stats=between('  function coverageStats(', '  async function coverageWait(');
  assert.match(stats,/triggerDoi:String\(r\.deferTriggerDoi/);
  assert.match(stats,/scope:r\.deferScope==='publisher'\?'publisher':'doi'/);
  assert.match(stats,/Number\(r\.deferUntil\|\|0\)>Date\.now\(\)/);
});
test('inventory does not start second full hedge after one exhausted browser+GM transport',async()=>{
  const init=between('  async function readMissingCaptureInventory(', '  function missingCaptureDecision(');
  let calls={media:0,toc:0,figures:0,evidence:0,pdf:0},running=0,peak=0,pdfEnded=false,tocWhilePdf=false;
  const doi='10.1039/d6gc03748h',documents=[{doi,addedDate:'2026-10-10'}];
  const ctx=vm.createContext({
    URL,Date,Map,Set,Number,Math,Boolean,String,Promise,console,
    RECENT_FULL_CAPTURE_CUTOFF:'2026-10-01',
    normalizeDoi:x=>String(x||'').toLowerCase(),
    recentFullCaptureEligible:x=>x.addedDate>='2026-10-01',
    updateInventoryProgress:()=>{},nowIso:()=>new Date().toISOString(),
    manualExecutionCurrent:()=>true,controllerPaused:()=>false,
    captureLiveError:x=>String(x),coverageTransient:x=>/timeout|deadline/.test(x),
    sleep:async()=>{},INVENTORY_REQUEST_TIMEOUT_MS:16000,
    MEDIA_INVENTORY_ENDPOINT:'https://api.test/api/media/inventory',
    CAPTURE_INDEX_URL:'https://api.test/api/media/local-capture-index',
    WORKER:'https://api.test',
    EVIDENCE_INVENTORY_ENDPOINT:'https://api.test/api/article-summary/evidence-inventory',
    writeToken:()=> '测试授权占位符',
    readOwnerPdfInventory:async()=>{
      calls.pdf++;running++;peak=Math.max(peak,running);
      await new Promise(resolve=>setTimeout(resolve,65));
      pdfEnded=true;running--;
      return {schemaVersion:'private-pdf-capture-inventory-v1',complete:true,count:1,
        items:[{doi,status:'ready'}],unknown:0,errors:[]};
    },
    inventoryReadMetadataJson:async options=>{
      running++;peak=Math.max(peak,running);
      let type=options.url.includes('/media/inventory')?'media'
        :options.url.includes('/local-capture-index')?'toc'
        :options.url.includes('/staged?')?'figures':'evidence';
      calls[type]++;
      if(type==='toc'&&!pdfEnded)tocWhilePdf=true;
      await new Promise(resolve=>setTimeout(resolve,4));
      running--;
      if(type==='media')return {items:[{doi}]};
      throw Error(type==='evidence'?'private_inventory_deadline;browser:controller_native_timeout_16000ms'
         :'queue_inventory_transport_failed;browser:controller_native_timeout_16000ms;gm:gm_request_timeout');
    }
  });
  const evidence=between('  async function readEvidenceInventoryPaged(', '  async function readMissingCaptureInventory(');
  ctx.EVIDENCE_SCHEMA_VERSION='article-evidence-v2';
  vm.runInContext(evidence+'\n'+init+'\n globalThis.load=readMissingCaptureInventory;',ctx);
  const output=await ctx.load({articles:documents,generatedAt:'2026-10-10T00:00:00Z'});
  assert.equal(calls.media,1);
  assert.equal(calls.toc,1,'TOC exhausted transport must not retry immediately');
  assert.equal(calls.figures,1,'body-figure exhausted transport must not retry immediately');
  assert.equal(calls.evidence,1,'full-text exhausted transport must not retry immediately');
  assert.equal(calls.pdf,1);
  assert.ok(peak<=2,'no more than two inventory layers may run simultaneously');
  assert.ok(tocWhilePdf,'fast inventory lane must not be blocked behind slow PDF inventory');
  assert.equal(output.pdf.complete,true);
  assert.equal(output.tocs,null);
  assert.equal(output.figures,null);
  assert.equal(output.evidence,null);
  assert.equal(output.errors.length,3,'unknown inventory remains an explicit failure');
});
console.log('TM_OCT10_COOLDOWN_INVENTORY_TESTS',{readOnly:true,publisherRequests:0,productionWrites:0});
