import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const src=readFileSync('public/toc-mainline.user.js','utf8');
function snippet(from,to){
 const a=src.indexOf(from),b=src.indexOf(to,a+from.length);
 assert.ok(a>0&&b>a,from+' boundary');
 return src.slice(a,b);
}
const priority=snippet('  function compareMissingCaptureJobs(', '  function validCapturedFigure(');
const pending=snippet('  function coveragePending(', '  function coverageApplyFreshPlan(');
const ctx=vm.createContext({
 Date,Array,Number,String,Map,Set,
 recentFullCaptureEligible:r=>r.mediaPolicy!=='toc_only'&&r.addedDate>='2026-10-01'&&r.date>='2026-10-01',
 captureBatchDate:r=>String(r.addedDate||r.date||''),
 journalPriority:r=>r.journal==='Nature'?0:r.journal==='JACS'?1:2,
 coverageHasNeeds:r=>r.captureToc===true
});
vm.runInContext(priority+'\n'+pending+
 '\n globalThis.sort=compareMissingCaptureJobs;globalThis.pending=coveragePending;',ctx);

test('Oct-1+ paper is scheduled ahead of later-admitted historical TOC only',()=>{
 const historical={doi:'10.1038/s41557-026-02228-0',date:'2026-08-18',addedDate:'2026-10-16',
   mediaPolicy:'toc_only',journal:'Nature',captureToc:true};
 const recent={doi:'10.1021/acs.orglett.6c05001',date:'2026-10-15',addedDate:'2026-10-15',
   mediaPolicy:'recent_full',journal:'Organic Letters',captureToc:true};
 assert.ok(ctx.sort(recent,historical)<0);
 assert.ok(ctx.sort(historical,recent)>0);
 const run={coverage:new Map([['old',{state:'pending',job:historical,attempts:0}],
   ['new',{state:'pending',job:recent,attempts:0}]])};
 assert.equal(ctx.pending(run)[0].job.doi,recent.doi);
 const oldOnly=[historical,{...historical,doi:'10.1038/s41467-026-70000-0',
   addedDate:'2026-10-13',journal:'Nature'}];
 assert.equal(oldOnly.sort(ctx.sort)[0].doi,historical.doi,'historical records retain their own order');
});

test('real full inventory fetch is no longer repeated every publisher DOI',()=>{
 assert.match(src,/INVENTORY_FULL_REFRESH_MIN_MS\s*=\s*20\s*\*\s*60\s*\*\s*1000/);
 assert.match(src,/Date\.now\(\)-checkedAt>=INVENTORY_FULL_REFRESH_MIN_MS/);
 assert.doesNotMatch(src,/Date\.now\(\)-checkedAt>=60000/);
 assert.match(src,/if\(freshState&&!freshState\.applied\)/);
 assert.match(src,/beginFreshInventory\(\);return applyFreshInventory\(true\)/);
 assert.match(src,/ownerPdfInventoryState.*'verified'/);
});

test('PDF D1 inventory uses <=80 DOI per batch and preserves all rows',async()=>{
 const fn=snippet('  async function readOwnerPdfInventory(', '  async function readEvidenceInventoryPaged(');
 let requestCount=0,progress=[];
 const pdfCtx=vm.createContext({
 Date,Map,Math,Number,String,Promise,Array,JSON,
 privatePdfLease:()=>({token:'测试授权令牌占位符'}),
 GM_getValue:()=>null,PRIVATE_PDF_LEASE_KEY:'fixture',
 recentFullCaptureEligible:()=>true,normalizeDoi:x=>x.toLowerCase(),
 PRIVATE_PDF_INVENTORY_ENDPOINT:'https://api.gczhouwld.com/api/private-pdf/capture-inventory',
 updateInventoryProgress:(r,layer,state,ts,details)=>progress.push({layer,state,details}),
 inventoryReadMetadataJson:async function(opts){
   assert.equal(opts.method,'POST');
   assert.equal(opts.headers.authorization,'Bearer 测试授权令牌占位符');
   const dois=JSON.parse(opts.data).dois;requestCount++;
   assert.ok(dois.length<=80,'the Worker only supports 80 DOI per call');
   return {schemaVersion:'private-pdf-capture-inventory-v1',complete:true,
     count:dois.length,items:dois.map(doi=>({doi,status:'missing'}))};
 },
 sleep:async()=>{},captureLiveError:x=>String(x)
 });
 vm.runInContext(fn+'\n globalThis.read=readOwnerPdfInventory;',pdfCtx);
 const articles=Array.from({length:329},(_,i)=>({doi:'10.1021/jacs.6c'+String(i).padStart(5,'0')}));
 const actual=await pdfCtx.read(articles,{});
 assert.equal(actual.complete,true);assert.equal(actual.items.length,329);
 assert.equal(requestCount,9,'329 DOI should not require 28 separate D1 reads');
 assert.ok(progress.some(x=>x.layer==='pdf'&&x.state==='done'));
});

test('an exhausted 16s media transport must not be retried blindly',()=>{
 const fn=snippet('    async function readMedia(){','    async function scopedIndex(');
 assert.ok(fn.includes('controller_native_timeout_16000ms'));
 assert.ok(fn.includes('inventory_(?:deadline|transport_failed)'));
 assert.match(fn,/return cache\.get\(key\)\|\|null/);
 assert.match(src,/publisher_script_quarantined_distinct_dois/);
 assert.match(src,/owner_pdf_replay_capacity_full/);
});

console.log('TM_20261016_PRIORITIZED_INVENTORY_TEST '+JSON.stringify({
 tests:4,privatePdfRequests:0,productionWrites:0,publisherRequests:0
}));
