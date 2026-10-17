import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=readFileSync('public/toc-mainline.user.js','utf8');
const start=source.indexOf('  async function readOwnerPdfInventory(');
const finish=source.indexOf('  async function readEvidenceInventoryPaged(',start);
assert.ok(start>0&&finish>start);
const implementation=source.slice(start,finish);
const jobs=Array.from({length:349},(_,i)=>({
 doi:'10.1021/jacs.6c'+String(i).padStart(5,'0'),addedDate:'2026-10-17'
}));
function harness({failure='none'}={}){
 const calls=[],network=[],now=Date.now();
 let inflight=0,peak=0;
 const ctx={Map,Set,Date,Promise,Number,Math,String,Array,JSON,console,
  PRIVATE_PDF_LEASE_KEY:'owner-lease',OWNER_PDF_INVENTORY_BATCH_SIZE:64,
  PRIVATE_PDF_INVENTORY_ENDPOINT:'https://api.example.test/api/private-pdf/capture-inventory',
  GM_getValue:()=>null,privatePdfLease:()=>({token:'测试授权占位符',expiresAt:now+86400000}),
  normalizeDoi:d=>String(d||'').toLowerCase(),
  recentFullCaptureEligible:r=>r.addedDate>='2026-10-01',
  updateInventoryProgress:()=>{},
  captureLiveError:v=>String(v),
  inventoryReadMetadataJson:async options=>{
   const d=JSON.parse(options.data).dois;
   calls.push(d);inflight++;peak=Math.max(peak,inflight);
   await new Promise(resolve=>setImmediate(resolve));
   inflight--;
   assert.equal(options.method,'POST');
   assert.ok(d.length>0&&d.length<=64);
   assert.equal(options.headers.authorization,'Bearer 测试授权占位符');
   if(failure==='deadline'&&d.includes(jobs[0].doi))throw Error('owner_pdf_inventory_deadline;browser:controller_native_timeout_16000ms');
   if(failure==='403'&&d.includes(jobs[0].doi)){const e=Error('owner_pdf_inventory_http_403');e.httpStatus=403;throw e;}
   network.push(...d);
   return {schemaVersion:'private-pdf-capture-inventory-v1',complete:true,
     count:d.length,items:d.map(doi=>({doi,status:'ready'}))};
  }
 };
 vm.createContext(ctx);
 vm.runInContext(implementation+'\n globalThis.execute=readOwnerPdfInventory;',ctx);
 return {execute:ctx.execute,calls,network,peak:()=>peak};
}

test('349 DOI owner inventory uses only 6 authorized parallel-bounded requests',async()=>{
 const h=harness();
 const r=await h.execute(jobs,null);
 assert.equal(h.calls.length,6);
 assert.equal(h.peak(),2);
 assert.equal(r.complete,true);
 assert.equal(r.items.length,349);
 assert.equal(r.unknown,0);
 assert.deepEqual([...h.network].sort(),jobs.map(x=>x.doi).sort());
});

test('one exhausted 64-DOI transport remains unknown, no split and no false missing',async()=>{
 const h=harness({failure:'deadline'});
 const r=await h.execute(jobs.slice(0,128),null);
 assert.equal(h.calls.length,2,'no extra subdivided network calls');
 assert.equal(r.complete,false);
 assert.equal(r.items.length,64);
 assert.equal(r.unknown,64);
 assert.equal(r.errors.length,1);
 assert.ok(r.items.every(x=>x.status==='ready'));
});

test('PDF 403 yields no retry or owner bypass and preserves missing-versus-unknown',async()=>{
 const h=harness({failure:'403'});
 const r=await h.execute(jobs.slice(0,64),null);
 assert.equal(h.calls.length,1);
 assert.equal(r.complete,false);
 assert.equal(r.unknown,64);
 assert.equal(r.items.length,0);
 assert.equal(r.errors.length,1);
});

test('cold R2 inventory has one bounded request, with no second timeout hedge',()=>{
 const reader=source.slice(source.indexOf('  async function readMissingCaptureInventory('),
   source.indexOf('  function missingCaptureDecision('));
 assert.match(reader,/timeout:INVENTORY_BULK_R2_TIMEOUT_MS/);
 assert.match(source,/INVENTORY_BULK_R2_TIMEOUT_MS = 30000/);
 assert.match(reader,/bulk_exhausted_no_hedge/);
 assert.match(reader,/return \{complete:false,count:0,items:\[\]\}/);
 assert.match(source,/var OWNER_PDF_INVENTORY_BATCH_SIZE = 64/);
 assert.ok(source.includes("var VERSION = '6.2.20';"));
 assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.41';"));
});
console.log('TM_OWNER_INVENTORY_64_TESTS '+JSON.stringify({actualPublisherRequests:0,mediaWrites:0}));
