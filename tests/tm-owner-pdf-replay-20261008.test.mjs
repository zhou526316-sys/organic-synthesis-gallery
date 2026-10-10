import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {test} from 'node:test';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const from=source.indexOf("  var OWNER_PDF_REPLAY_PREFIX=");
const until=source.indexOf('  async function maybeCapturePrivatePdf(',from);
assert.ok(from>0&&until>from,'owner PDF recovery helpers must exist');
const body=source.slice(from,until);
function pdfBytes(){
  const bytes=new Uint8Array(2048);
  bytes.set(new TextEncoder().encode('%PDF-1.7'),0);
  bytes.set(new TextEncoder().encode('%%EOF'),2040);
  return bytes.buffer;
}
function fixture(){
  const store=new Map(),network=[];
  const doi='10.1021/acscatal.6c06279';
  const job={doi,addedDate:'2026-10-08',publisher:'acs',capturePrivatePdf:true,jobId:'11111111-1111-4111-8111-111111111111'};
  const pdf={buffer:pdfBytes(),byteLength:2048,sourceUrl:'https://pubs.acs.org/doi/pdf/'+doi};
  let inventoryStatus='missing',lease={token:'测试专属PDF捕获授权占位符',expiresAt:Date.now()+86400000};
  const ctx={
    Date,Math,Number,String,Array,Set,Map,JSON,URL,Uint8Array,TextEncoder,AbortController,crypto:webcrypto,btoa,atob,
    setTimeout,clearTimeout,console,location:{href:'https://pubs.acs.org/doi/'+doi},
    P:'osg-toc-v6:',CONTROLLER_ID:'test-owner-gallery-controller',CONTROLLER_REVISION:'2.2.41',
    ACTIVE_JOB_KEY:'osg-toc-v6:active-job',RECENT_FULL_CAPTURE_CUTOFF:'2026-10-01',
    PRIVATE_PDF_CAPTURE_ENDPOINT:'https://api.gczhouwld.com/api/private-pdf/import',
    PRIVATE_PDF_INVENTORY_ENDPOINT:'https://api.gczhouwld.com/api/private-pdf/capture-inventory',
    QUEUE_URL:'https://gallery.gczhouwld.com/toc-demand-live.json',
    imageOutboxBusy:false,
    normalizeDoi:s=>String(s||'').toLowerCase(),
    recentFullCaptureEligible:j=>Boolean(j&&j.addedDate>='2026-10-01'),
    controllerPaused:()=>false,currentCaptureJob:()=>true,isGalleryPage:()=>true,
    privatePdfLease:()=>lease,
    privatePdfBytesValid:b=>b&&b.byteLength>=1024&&String.fromCharCode(...new Uint8Array(b).slice(0,5))==='%PDF-',
    publisherForDoi:()=> 'acs',sleep:async()=>{},
    GM_getValue:(key,defaultValue)=>store.has(key)?store.get(key):defaultValue,
    GM_setValue:(key,v)=>store.set(key,v),
    GM_deleteValue:key=>store.delete(key),
    GM_listValues:()=>Array.from(store.keys()),
    getJson:async()=>({articles:[{doi,addedDate:'2026-10-08'}]}),
    inventoryReadMetadataJson:async o=>{
      network.push({kind:'inventory',url:o.url});
      assert.equal(o.method,'POST');
      return {complete:true,items:[{doi,status:inventoryStatus}]};
    },
    fetch:async (url,options)=>{
      network.push({kind:'upload',url,options});
      assert.equal(options.headers['content-type'],'application/pdf');
      assert.equal(options.headers.authorization,'Bearer '+lease.token);
      const bytes=options.body,hash=await webcrypto.subtle.digest('SHA-256',bytes);
      const digest=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
      return {ok:true,status:201,json:async()=>({stored:true,doi,byteLength:bytes.byteLength,contentHash:digest})};
    }
  };
  vm.createContext(ctx);
  vm.runInContext(body+'\n globalThis.O={pendingOwnerPdfKeys,retainOwnerPdfAfterUploadFailure,replayOneOwnerPdf};',ctx);
  function makeReady(){const key=ctx.O.pendingOwnerPdfKeys()[0],row=store.get(key);row.nextAt=0;store.set(key,row);return key;}
  return {ctx,store,network,doi,job,pdf,makeReady,setInventory:s=>{inventoryStatus=s;},setLease:l=>{lease=l;}};
}

test('ACS private PDF fetched over authorized publisher browser is retained only after upload transport failed',async()=>{
  const h=fixture();
  assert.equal(await h.ctx.O.retainOwnerPdfAfterUploadFailure(h.job,h.pdf,new Error('private_pdf_upload_transport_failed:gm=gm_request_timeout;native=Failed to fetch')),true);
  const keys=h.ctx.O.pendingOwnerPdfKeys();
  assert.equal(keys.length,1);
  const item=h.store.get(keys[0]);
  assert.equal(item.byteLength,2048);assert.equal(item.sha256.length,64);
  assert.equal(item.publisher,'acs');
  assert.equal(Object.hasOwn(item,'token'),false);
  assert.equal(JSON.stringify(item).includes('测试专属PDF捕获授权占位符'),false);
  assert.equal(await h.ctx.O.retainOwnerPdfAfterUploadFailure(h.job,h.pdf,Object.assign(new Error('private_pdf_upload_http_403'),{httpStatus:403})),false);
  assert.equal(await h.ctx.O.retainOwnerPdfAfterUploadFailure({...h.job,addedDate:'2026-09-30'},h.pdf,new Error('gm_request_timeout')),false);
});

test('Gallery owner lease checks true missing inventory, then sends original PDF bytes once with verified hash',async()=>{
  const h=fixture();
  await h.ctx.O.retainOwnerPdfAfterUploadFailure(h.job,h.pdf,new Error('gm_request_timeout'));
  h.makeReady();
  assert.equal(await h.ctx.O.replayOneOwnerPdf(),true);
  assert.equal(h.ctx.O.pendingOwnerPdfKeys().length,0);
  const calls=h.network.filter(x=>x.kind==='upload');
  assert.equal(calls.length,1);
  assert.ok(calls[0].url.includes('controllerRevision=2.2.41'));
  assert.equal(calls[0].options.body.byteLength,2048);
});

test('owner authorization absence and raw/pending cloud records do not cause a redundant PDF write',async()=>{
  const h=fixture();
  await h.ctx.O.retainOwnerPdfAfterUploadFailure(h.job,h.pdf,new Error('gm_request_timeout'));
  h.makeReady();h.setLease(null);
  assert.equal(await h.ctx.O.replayOneOwnerPdf(),false);
  assert.equal(h.network.filter(x=>x.kind==='upload').length,0);
  h.setLease({token:'新的测试owner授权占位符',expiresAt:Date.now()+3600000});
  h.setInventory('pending');
  assert.equal(await h.ctx.O.replayOneOwnerPdf(),false);
  assert.equal(h.ctx.O.pendingOwnerPdfKeys().length,1);
  assert.equal(h.network.filter(x=>x.kind==='upload').length,0);
});

test('remote verified ready PDF removes local pending bytes without uploading again',async()=>{
  const h=fixture();
  await h.ctx.O.retainOwnerPdfAfterUploadFailure(h.job,h.pdf,new Error('gm_request_timeout'));
  h.makeReady();h.setInventory('ready');
  assert.equal(await h.ctx.O.replayOneOwnerPdf(),true);
  assert.equal(h.ctx.O.pendingOwnerPdfKeys().length,0);
  assert.equal(h.network.filter(x=>x.kind==='upload').length,0);
});

test('local data hash mismatch blocks transport and leaves PDF bytes recoverable',async()=>{
  const h=fixture();
  await h.ctx.O.retainOwnerPdfAfterUploadFailure(h.job,h.pdf,new Error('gm_request_timeout'));
  const key=h.makeReady(),row=h.store.get(key);row.sha256='a'.repeat(64);h.store.set(key,row);
  assert.equal(await h.ctx.O.replayOneOwnerPdf(),false);
  assert.equal(h.ctx.O.pendingOwnerPdfKeys().length,1);
  assert.equal(h.network.filter(x=>x.kind==='upload').length,0);
});

test('private PDF upload never queues unauthorized, cancelled, oversized or pre-Oct-1 files',async()=>{
  const h=fixture();
  const err=new Error('gm_request_timeout');
  assert.equal(await h.ctx.O.retainOwnerPdfAfterUploadFailure({...h.job,capturePrivatePdf:false},h.pdf,err),false);
  assert.equal(await h.ctx.O.retainOwnerPdfAfterUploadFailure(h.job,h.pdf,new Error('private_pdf_upload_cancelled')),false);
  const big={...h.pdf,buffer:new ArrayBuffer(9*1024*1024),byteLength:9*1024*1024};
  assert.equal(await h.ctx.O.retainOwnerPdfAfterUploadFailure(h.job,big,err),false);
  assert.equal(h.ctx.O.pendingOwnerPdfKeys().length,0);
});


test('Gallery retries downloaded bytes once through GM after a native network failure, preserving DOI and SHA',async()=>{
  const h=fixture();
  await h.ctx.O.retainOwnerPdfAfterUploadFailure(h.job,h.pdf,new Error('gm_request_timeout'));
  h.makeReady();
  h.ctx.fetch=async(url,options)=>{
    h.network.push({kind:'native_failed',url,options});
    throw new TypeError('Failed to fetch');
  };
  let gmCount=0;
  h.ctx.gmRequest=async(options,skipNativeFallback)=>{
    gmCount++;
    assert.equal(skipNativeFallback,true);
    assert.equal(options.method,'POST');
    assert.equal(options.headers.authorization,'Bearer 测试专属PDF捕获授权占位符');
    const bytes=options.data,hash=await webcrypto.subtle.digest('SHA-256',bytes);
    const digest=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
    h.network.push({kind:'gm_upload',url:options.url,bytes:bytes.byteLength});
    return {status:201,finalUrl:options.url,responseText:JSON.stringify({
      stored:true,doi:h.doi,byteLength:bytes.byteLength,contentHash:digest
    })};
  };
  assert.equal(await h.ctx.O.replayOneOwnerPdf(),true);
  assert.equal(gmCount,1);
  assert.equal(h.ctx.O.pendingOwnerPdfKeys().length,0);
  assert.equal(h.network.filter(x=>x.kind==='native_failed').length,1);
  assert.equal(h.network.filter(x=>x.kind==='gm_upload').length,1);
});
test('Gallery PDF replay respects explicit Worker HTTP 403 without alternate transport',async()=>{
  const h=fixture();
  await h.ctx.O.retainOwnerPdfAfterUploadFailure(h.job,h.pdf,new Error('gm_request_timeout'));
  h.makeReady();
  let gmCalls=0;
  h.ctx.fetch=async(url,options)=>({ok:false,status:403,url,
    json:async()=>({error:'fixture_not_entitled'})});
  h.ctx.gmRequest=async()=>{gmCalls++;throw Error('GM must not run after 403');};
  assert.equal(await h.ctx.O.replayOneOwnerPdf(),false);
  assert.equal(gmCalls,0);
  assert.equal(h.ctx.O.pendingOwnerPdfKeys().length,1);
});
test('Gallery PDF GM replay refuses foreign redirects and keeps local bytes',async()=>{
  const h=fixture();
  await h.ctx.O.retainOwnerPdfAfterUploadFailure(h.job,h.pdf,new Error('gm_request_timeout'));
  h.makeReady();
  h.ctx.fetch=async()=>{throw new TypeError('Failed to fetch');};
  h.ctx.gmRequest=async options=>({status:201,finalUrl:'https://example.invalid/receive',
    responseText:JSON.stringify({stored:true,doi:h.doi,byteLength:2048,contentHash:'a'.repeat(64)})});
  assert.equal(await h.ctx.O.replayOneOwnerPdf(),false);
  assert.equal(h.ctx.O.pendingOwnerPdfKeys().length,1);
});
test('Chem body-evidence upload uses a bounded 12s budget without changing RSC/ACS budgets',async()=>{
  const from=source.indexOf('  async function tryCaptureArticleEvidence(');
  const to=source.indexOf('\n  function mergeFallbackCandidates(',from);
  assert.ok(from>0&&to>from);
  const body=source.slice(from,to);
  for(const [publisher,mediaNeed,expected] of [
    ['elsevier','toc+figures+evidence',12000],
    ['rsc','toc+figures+evidence',9000],
    ['acs','toc+figures+evidence',4000],
    ['elsevier','evidence',10000]
  ]){
    let actualTimeout=0;
    const ctx={
      Number,String,Date,location:{href:'https://example.invalid/article'},
      evidenceCaptureEligible:()=>true,
      captureLiveUpdate:()=>{},
      buildArticleEvidencePacket:()=>({fulltextStatus:'partial',_metrics:{chars:2000,sections:2}}),
      postArticleEvidence:async(payload,token,timeout)=>{
        actualTimeout=timeout;return {stored:true,doi:'10.1016/j.chempr.2026.103043',
          schemaVersion:'article-evidence-v2',evidenceLevel:'partial',chars:2000,sections:2};
      },
      pushTrace:()=>{},normalizeDoi:v=>v,EVIDENCE_SCHEMA_VERSION:'article-evidence-v2'
    };
    vm.createContext(ctx);
    vm.runInContext(body+'\n globalThis.run=tryCaptureArticleEvidence;',ctx);
    const res=await ctx.run({doi:'10.1016/j.chempr.2026.103043',publisher,mediaNeed},[],'fixture',0);
    assert.equal(res.status,'stored');
    assert.equal(actualTimeout,expected,publisher+' '+mediaNeed);
  }
});
test('owner manual PDF menu waits for a real retry result before reporting success',()=>{
  const match=source.match(/GM_registerMenuCommand\('使用 owner 授权补传本机暂存私人PDF', async function \(\) \{([\s\S]*?)\n    \}\);/);
  assert.ok(match,'async owner menu command missing');
  assert.match(match[1],/success=await replayOneOwnerPdf\(\)/);
  assert.match(match[1],/if\(success\)/);
  assert.doesNotMatch(match[1],/window\.alert\('已检查/);
});
