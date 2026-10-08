import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
function fn(name){
  const re=new RegExp('^  (?:async )?function '+name+'\\(','m');
  const m=re.exec(source);
  assert.ok(m, 'missing '+name);
  const end=source.indexOf('\n  }\n',m.index);
  assert.ok(end>m.index,'missing function end '+name);
  return source.slice(m.index,end+5);
}
const names=['pendingImageTransferKeys','retainImageForGalleryUpload','imageReplayReceiptMatches',
  'imageReplayAlreadyStored','replayOneDeferredImage'];
function fixture(){
  const store=new Map(),requests=[];
  const P='osg-toc-v6:',prefix=P+'pending-image-transfer-v1:';
  const CAP='https://api.gczhouwld.com/api/media/local-capture/import';
  const STAGE='https://api.gczhouwld.com/api/article-figures/stage';
  const doi='10.1021/acscatal.6c05658',jobId='8a1b2c3d-1111-4444-8888-123456789abc';
  const payload={
    doi,jobId,captureVersion:'6.2.20',pageDoi:doi,kind:'official',
    imageData:'data:image/png;base64,'+'a'.repeat(800),
    articleUrl:'https://pubs.acs.org/doi/'+doi,
    sourceUrl:'https://acs.silverchair-cdn.com/content/'+doi.replace('/','_')+'/toc.png'
  };
  const ctx={
    URL,Date,Math,Number,String,Object,Boolean,Array,Map,Set,JSON,encodeURIComponent,console,
    IMAGE_OUTBOX_PREFIX:prefix,IMAGE_OUTBOX_CAP_BYTES:18*1024*1024,
    CAPTURE_ENDPOINT:CAP,FIGURE_STAGE_ENDPOINT:STAGE,
    RECENT_FULL_CAPTURE_CUTOFF:'2026-10-01',VERSION:'6.2.20',P,WORKER:'https://api.gczhouwld.com',
    CONTROLLER_ID:'test-gallery-controller',ACTIVE_JOB_KEY:P+'active-job',
    QUEUE_URL:'https://gallery.gczhouwld.com/toc-demand-live.json',imageOutboxBusy:false,
    normalizeDoi:v=>String(v||'').toLowerCase(),isGalleryPage:()=>true,controllerPaused:()=>false,
    recentFullCaptureEligible:j=>Boolean(j&&j.addedDate>='2026-10-01'),
    writeToken:()=> '测试写入密钥占位符',
    GM_listValues:()=>[...store.keys()],
    GM_getValue:(key,fallback)=>store.has(key)?store.get(key):fallback,
    GM_setValue:(key,value)=>store.set(key,value),
    GM_deleteValue:key=>store.delete(key),
    sleep:async()=>{},
    getJson:async(url)=>{
      requests.push({kind:'read',url});
      if(url.includes('toc-demand'))return {articles:[{doi,addedDate:'2026-10-08'}]};
      if(url.includes('/article-figures/staged?'))return {items:[]};
      if(url.includes('/api/toc?'))return {available:false};
      throw Error('unexpected GET '+url);
    },
    fetchPostJson:async(url,p,token,timeout)=>{
      requests.push({kind:'write',url,doi:p.doi,timeout});
      assert.equal(token,'测试写入密钥占位符');
      return {stored:true,doi:p.doi,kind:p.kind,contentHash:'a'.repeat(32),productionTocStored:true};
    }
  };
  vm.createContext(ctx);
  vm.runInContext(names.map(fn).join('\n')+
    '\n globalThis.F={pendingImageTransferKeys,retainImageForGalleryUpload,imageReplayReceiptMatches,imageReplayAlreadyStored,replayOneDeferredImage};',ctx);
  const job={doi,jobId,addedDate:'2026-10-08',captureToc:true};
  function eligibleRow(){const key=ctx.F.pendingImageTransferKeys()[0];const row=store.get(key);row.nextAt=0;store.set(key,row);return key;}
  return {ctx,store,requests,job,payload,doi,CAP,STAGE,eligibleRow};
}

test('transient ACS visual transfer is retained, never writes an authorization token or a private PDF',()=>{
  const x=fixture(),err=new Error('gm_request_timeout');
  assert.equal(x.ctx.F.retainImageForGalleryUpload(x.job,x.CAP,x.payload,'r2_upload',err),true);
  const keys=x.ctx.F.pendingImageTransferKeys();
  assert.equal(keys.length,1);
  const row=x.store.get(keys[0]);
  assert.equal(row.doi,x.doi);assert.equal(row.payload.imageData,x.payload.imageData);
  assert.equal(Object.hasOwn(row,'token'),false);
  assert.equal(JSON.stringify(row).includes('测试写入密钥占位符'),false);
  assert.equal(x.ctx.F.retainImageForGalleryUpload(x.job,'https://evil.example/import',x.payload,'r2_upload',err),false);
  assert.equal(x.ctx.F.retainImageForGalleryUpload(x.job,x.CAP,x.payload,'r2_upload',Object.assign(new Error('unauthorized'),{httpStatus:403})),false);
  assert.equal(x.ctx.F.retainImageForGalleryUpload({...x.job,addedDate:'2026-09-30'},x.CAP,x.payload,'r2_upload',err),false);
});

test('Gallery performs one native POST and keeps data until the server returns verified DOI+kind receipt',async()=>{
  const x=fixture();
  assert.equal(x.ctx.F.retainImageForGalleryUpload(x.job,x.CAP,x.payload,'r2_upload',new Error('gm_request_timeout')),true);
  x.eligibleRow();
  assert.equal(await x.ctx.F.replayOneDeferredImage(),true);
  assert.equal(x.ctx.F.pendingImageTransferKeys().length,0);
  assert.equal(x.requests.filter(x=>x.kind==='write').length,1);
  assert.equal(x.requests.find(x=>x.kind==='write').timeout,45000);
});

test('pending image is retained on transport failure, then safely retried',async()=>{
  const x=fixture();
  x.ctx.F.retainImageForGalleryUpload(x.job,x.CAP,x.payload,'r2_upload',new Error('gm_request_timeout'));
  const key=x.eligibleRow();
  x.ctx.fetchPostJson=async()=>{throw new Error('Failed to fetch')};
  assert.equal(await x.ctx.F.replayOneDeferredImage(),false);
  assert.equal(x.ctx.F.pendingImageTransferKeys().length,1);
  assert.equal(x.store.get(key).attempts,1);
  assert.ok(x.store.get(key).nextAt>Date.now());
});

test('already stored DOI-bound staged Figure is reused without another upload',async()=>{
  const x=fixture();
  const p={...x.payload,id:'figure-2',label:'Figure 2',width:900,height:500};
  delete p.kind;
  x.ctx.F.retainImageForGalleryUpload(x.job,x.STAGE,p,'figure_stage',new Error('gm_request_timeout'));
  x.eligibleRow();
  x.ctx.getJson=async url=>{
    if(url.includes('toc-demand'))return {articles:[{doi:x.doi,addedDate:'2026-10-08'}]};
    if(url.includes('/article-figures/staged?'))return {items:[{doi:x.doi,id:'figure-2',sourceUrl:p.sourceUrl,contentHash:'b'.repeat(32),width:1200,height:850}]};
    throw Error('unexpected url');
  };
  x.ctx.fetchPostJson=async()=>{throw Error('a verified existing figure must not be re-uploaded')};
  assert.equal(await x.ctx.F.replayOneDeferredImage(),true);
  assert.equal(x.ctx.F.pendingImageTransferKeys().length,0);
});

test('absent or out-of-scope DOI is not replayed despite a pending asset',async()=>{
  const x=fixture();
  x.ctx.F.retainImageForGalleryUpload(x.job,x.CAP,x.payload,'r2_upload',new Error('gm_request_timeout'));
  x.eligibleRow();
  x.ctx.getJson=async()=>({articles:[]});
  assert.equal(await x.ctx.F.replayOneDeferredImage(),false);
  assert.equal(x.ctx.F.pendingImageTransferKeys().length,1);
  assert.equal(x.requests.filter(x=>x.kind==='write').length,0);
});

test('same-DOI retry does not expand the outbox or erase a larger pending image',()=>{
  const x=fixture();const error=new Error('gm_request_timeout');
  x.ctx.F.retainImageForGalleryUpload(x.job,x.CAP,x.payload,'r2_upload',error);
  const larger={...x.payload,imageData:'data:image/png;base64,'+'b'.repeat(1200)};
  x.ctx.F.retainImageForGalleryUpload(x.job,x.CAP,larger,'r2_upload',error);
  x.ctx.F.retainImageForGalleryUpload(x.job,x.CAP,x.payload,'r2_upload',error);
  assert.equal(x.ctx.F.pendingImageTransferKeys().length,1);
  const row=x.store.get(x.ctx.F.pendingImageTransferKeys()[0]);
  assert.equal(row.payload.imageData,larger.imageData);
});

test('publisher image and owner PDF upload have bounded dynamic timeouts',()=>{
  assert.ok(source.includes('IMAGE_UPLOAD_MAX_BUDGET_MS = 48000'));
  assert.ok(source.includes('Math.min(35000,Math.floor(left()*0.8))'));
  assert.ok(source.includes('var firstBudget=Math.max(1,Math.floor(budget*0.8));'));
  assert.ok(source.includes("retainImageForGalleryUpload(job,endpoint,payload,stage,error)"));
  assert.ok(source.includes('startImageOutboxSender();'));
  assert.ok(!fn('retainImageForGalleryUpload').includes('PRIVATE_PDF_CAPTURE_ENDPOINT'));
});
