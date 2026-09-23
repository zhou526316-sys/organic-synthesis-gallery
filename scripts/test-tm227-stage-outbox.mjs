import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const start=source.indexOf('  // BEGIN OSG_FIGURE_STAGE_OUTBOX_V1');
const end=source.indexOf('  // END OSG_FIGURE_STAGE_OUTBOX_V1')+'  // END OSG_FIGURE_STAGE_OUTBOX_V1'.length;
assert.ok(start>0&&end>start);
const moduleSource=source.slice(start,end);
let passed=0;

function harness(options={}){
  const store=new Map(),posts=[],checkpoints=new Map();
  let now=1800000000000;
  class Clock extends Date {static now(){return now;}}
  const env={
    Date:Clock,URL,encodeURIComponent,setInterval:()=>1,globalThis:{},P:'p:',VERSION:'6.2.20',CONTROLLER_ID:'controller',
    FIGURE_STAGE_ENDPOINT:'https://worker.test/api/article-figures/stage',
    GM_getValue:(k,d)=>store.has(k)?structuredClone(store.get(k)):d,
    GM_setValue:(k,v)=>store.set(k,structuredClone(v)),GM_deleteValue:k=>store.delete(k),GM_listValues:()=>[...store.keys()],
    normalizeDoi:x=>String(x||'').trim().toLowerCase(),autoReportText:x=>String(x||'').replace(/SECRET_TOKEN/g,'[redacted]').slice(0,450),
    retryableImageUpload:e=>{const s=Number(e&&e.httpStatus||0);return [408,425,429,500,502,503,504].includes(s)||(!s&&/network|timeout|failed/i.test(String(e&&e.message||'')));},
    isGalleryPage:()=>true,writeToken:()=> 'SECRET_TOKEN',sleep:async()=>{},
    postJson:async (_url,payload,_token)=>{posts.push(structuredClone(payload));if(options.post)return options.post(payload,store);return {stored:true,staged:true,doi:payload.doi,id:payload.id,contentHash:'abc123',width:payload.width,height:payload.height};},
    readCheckpoint:doi=>structuredClone(checkpoints.get(doi)||{doi,version:'6.2.20',figures:{}}),
    saveCheckpoint:(doi,value)=>checkpoints.set(doi,structuredClone(value))
  };
  const ctx=vm.createContext(env);vm.runInContext(moduleSource,ctx);
  const api=vm.runInContext('({figureStageOutboxKeys,figureStageOutboxKey,figureStageOutboxChars,enqueueFigureStageRetry,drainFigureStageOutbox,validateDeferredStageReceipt,figureStageOutboxDisplay})',ctx);
  const job={doi:'10.1021/jacs.6c99999',jobId:'12345678-1234-1234-1234-123456789012'};
  const candidate={url:'https://acs.silverchair-cdn.com/acs/content_public/journal/jacs/pap/10.1021_jacs.6c99999/1/m_ja6c99999_0001.svg',label:'Figure 1'};
  const payload={doi:job.doi,jobId:job.jobId,captureVersion:'6.2.20',pageDoi:job.doi,articleUrl:'https://pubs.acs.org/jacs/article/doi/'+job.doi+'/fixture',sourceUrl:candidate.url,id:'figure-1',label:'Figure 1',caption:'Figure 1. Fixture.',order:0,width:900,height:420,imageData:'data:image/svg+xml;base64,'+'A'.repeat(1200)};
  const image={byteLength:900,width:900,height:420};
  const quality={quality:'vector',usable:true};
  const err503=Object.assign(new Error('upload_http_503:response_without_worker_error_code'),{httpStatus:503});
  return {api,ctx,store,posts,checkpoints,job,candidate,payload,image,quality,err503,advance:ms=>now+=ms};
}
async function test(name,fn){await fn();passed++;console.log('TM227_STAGE_OUTBOX_PASS '+name);}

await test('retryable 503 preserves already acquired bytes without token',()=>{
  const h=harness();assert.equal(h.api.enqueueFigureStageRetry(h.job,h.candidate,h.image,h.payload,h.quality,h.err503),true);
  assert.equal(h.api.figureStageOutboxKeys().length,1);
  const row=h.store.get(h.api.figureStageOutboxKeys()[0]);assert.equal(row.payload.imageData,h.payload.imageData);
  const serialized=JSON.stringify([...h.store.values()]);assert.ok(!serialized.includes('SECRET_TOKEN'));
});

await test('low quality and TIFF are never admitted',()=>{
  const h=harness();
  assert.equal(h.api.enqueueFigureStageRetry(h.job,h.candidate,h.image,h.payload,{quality:'low',usable:false},h.err503),false);
  const tiff={...h.payload,imageData:'data:image/tiff;base64,'+'A'.repeat(1200)};
  assert.equal(h.api.enqueueFigureStageRetry(h.job,h.candidate,h.image,tiff,h.quality,h.err503),false);
  assert.equal(h.api.figureStageOutboxKeys().length,0);
});

await test('nonretryable HTTP refusal and identity mismatch are not queued',()=>{
  const h=harness();const e403=Object.assign(new Error('upload_http_403'),{httpStatus:403});
  assert.equal(h.api.enqueueFigureStageRetry(h.job,h.candidate,h.image,h.payload,h.quality,e403),false);
  assert.equal(h.api.enqueueFigureStageRetry(h.job,h.candidate,h.image,{...h.payload,pageDoi:'10.1021/other'},h.quality,h.err503),false);
});

await test('same DOI/id deduplicates and higher area replaces payload',()=>{
  const h=harness();assert.ok(h.api.enqueueFigureStageRetry(h.job,h.candidate,h.image,h.payload,h.quality,h.err503));
  const small={...h.payload,width:700,height:300,imageData:'data:image/svg+xml;base64,'+'B'.repeat(1000)};
  assert.ok(h.api.enqueueFigureStageRetry(h.job,h.candidate,{byteLength:800},small,h.quality,h.err503));
  let row=h.store.get(h.api.figureStageOutboxKeys()[0]);assert.equal(row.payload.width,900);
  const large={...h.payload,width:1200,height:600,imageData:'data:image/svg+xml;base64,'+'C'.repeat(1600)};
  assert.ok(h.api.enqueueFigureStageRetry(h.job,h.candidate,{byteLength:1200},large,h.quality,h.err503));
  row=h.store.get(h.api.figureStageOutboxKeys()[0]);assert.equal(row.payload.width,1200);assert.equal(row.revision,2);
});

await test('queue has explicit bounded capacity',()=>{
  const h=harness();
  for(let i=0;i<12;i++){const p={...h.payload,id:'figure-'+i,label:'Figure '+i};assert.ok(h.api.enqueueFigureStageRetry(h.job,h.candidate,h.image,p,h.quality,h.err503));}
  assert.equal(h.api.figureStageOutboxKeys().length,12);
  assert.equal(h.api.enqueueFigureStageRetry(h.job,h.candidate,h.image,{...h.payload,id:'figure-overflow'},h.quality,h.err503),false);
  assert.equal(h.store.get('p:figure-stage-outbox-ack-v1').state,'outbox_full');
});

await test('Gallery drain stages identical queued payload and saves checkpoint',async()=>{
  const h=harness();h.api.enqueueFigureStageRetry(h.job,h.candidate,h.image,h.payload,h.quality,h.err503);
  await h.api.drainFigureStageOutbox();
  assert.equal(h.posts.length,1);assert.equal(h.posts[0].imageData,h.payload.imageData);assert.equal(h.api.figureStageOutboxKeys().length,0);
  const cp=h.checkpoints.get(h.job.doi);assert.equal(cp.figures['Figure 1'].contentHash,'abc123');assert.equal(cp.figures['Figure 1'].sourceUrl,h.payload.sourceUrl);
  assert.equal(h.store.get('p:figure-stage-outbox-ack-v1').state,'delivered');
});

await test('transient retry stays queued with bounded backoff and no publisher request',async()=>{
  const h=harness({post:async()=>{const e=Object.assign(new Error('network failed'),{httpStatus:0});throw e;}});
  h.api.enqueueFigureStageRetry(h.job,h.candidate,h.image,h.payload,h.quality,h.err503);await h.api.drainFigureStageOutbox();
  assert.equal(h.api.figureStageOutboxKeys().length,1);const row=h.store.get(h.api.figureStageOutboxKeys()[0]);assert.equal(row.tries,1);assert.ok(row.nextAt>Date.now());assert.equal(row.blocked,false);
});

await test('nonretryable deferred failure is retained but blocked',async()=>{
  const h=harness({post:async()=>{const e=Object.assign(new Error('identity rejected'),{httpStatus:409});throw e;}});
  h.api.enqueueFigureStageRetry(h.job,h.candidate,h.image,h.payload,h.quality,h.err503);await h.api.drainFigureStageOutbox();
  const row=h.store.get(h.api.figureStageOutboxKeys()[0]);assert.equal(row.blocked,true);assert.ok(row.nextAt-Date.now()>=6*60*60*1000);
});

await test('newer replacement survives acknowledgement of older send',async()=>{
  let h;h=harness({post:async payload=>{
    const key=h.api.figureStageOutboxKeys()[0],row=h.store.get(key);h.store.set(key,{...row,revision:row.revision+1,payload:{...row.payload,width:1300}});
    return {stored:true,staged:true,doi:payload.doi,id:payload.id,contentHash:'old'};
  }});
  h.api.enqueueFigureStageRetry(h.job,h.candidate,h.image,h.payload,h.quality,h.err503);await h.api.drainFigureStageOutbox();
  assert.equal(h.api.figureStageOutboxKeys().length,1);assert.equal(h.store.get(h.api.figureStageOutboxKeys()[0]).revision,2);
});

await test('deferred receipt must match DOI and figure identity',()=>{
  const h=harness();
  assert.throws(()=>h.api.validateDeferredStageReceipt({stored:true,staged:true,doi:'10.1021/other',id:'figure-1'},h.payload),/identity_mismatch/);
  assert.throws(()=>h.api.validateDeferredStageReceipt({stored:false,staged:false,doi:h.payload.doi,id:'figure-1'},h.payload),/receipt_invalid/);
});

await test('outbox module cannot open publisher tabs or download publisher media',()=>{
  assert.ok(!/GM_openInTab\(|window\.open\(|acquireImage\(|pageFetchCandidate\(|gmFetchCandidate\(/.test(moduleSource));
});

console.log('TM227_STAGE_OUTBOX_TEST_SUMMARY '+JSON.stringify({passed,productionWrites:0,publisherDownloads:0,maxItems:12}));
