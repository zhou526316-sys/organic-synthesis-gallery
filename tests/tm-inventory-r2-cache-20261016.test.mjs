import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getStagedArticleFigures,getLocalCaptureIndex} from '../cloudflare/worker/src/local-captures.js';

const epoch=1790082000000,doiA='10.1021/jacs.6c13001',doiB='10.1021/jacs.6c13002';
const indexKey='local-captures/index.json';
const stageKey='local-captures/article-figures/stage-index.json';
const reportKey='local-captures/tampermonkey/report-index.json';
const src=doi=>'https://pubs.acs.org/doi/'+doi;
let rev=100;
class R2 {
  constructor(){this.rows=new Map();this.reads=[];this.heads=[];}
  seed(key,payload){this.rows.set(key,{etag:'fixture-r2-etag-'+(++rev),raw:JSON.stringify(payload)});}
  async head(key){this.heads.push(key);const x=this.rows.get(key);return x?{etag:x.etag,size:x.raw.length}:null;}
  async get(key){this.reads.push(key);const x=this.rows.get(key);return x?{etag:x.etag,size:x.raw.length,text:async()=>x.raw}:null;}
}
function stage(doi,label='Fig. 1'){
  return {doi,id:label,label,captureVersion:'6.2.20',mediaGeneration:epoch,updatedAt:epoch+100,
    pageDoi:doi,r2Key:'staged/'+doi,label,sourceUrl:src(doi),articleUrl:src(doi),
    contentHash:'a'.repeat(32),contentType:'image/jpeg',width:800,height:500};
}
function report(doi,count){
  return {doi,captureVersion:'6.2.20',final:true,updatedAt:epoch+100,mediaNeed:'figures',
    figuresDiscovered:count,pageDoi:doi,articleUrl:src(doi),sourceUrl:src(doi)};
}
function fixture(){
  const b=new R2();b.seed(stageKey,{version:1,items:{[doiA+'|1']:stage(doiA),[doiB+'|1']:stage(doiB)}});
  b.seed(reportKey,{version:2,items:{[doiA]:report(doiA,3),[doiB]:report(doiB,1)}});
  b.seed(indexKey,{version:1,items:{[doiA+'|official']:{
    doi:doiA,kind:'official',updatedAt:epoch+100,mediaGeneration:epoch,pageDoi:doiA,
    articleUrl:src(doiA),sourceUrl:src(doiA),r2Key:'toc/image.png',contentHash:'a'.repeat(32)
  }}});
  return {MEDIA:b};
}
function url(path,doi){return new Request('https://api.example.test'+path+'?'+
  new URLSearchParams({inventory:'1',dois:doi}));}

test('15 DOI scopes reuse one verified large stage/report object per isolate',async()=>{
 const env=fixture();
 for(let i=0;i<15;i++){
   const doi=i%2?doiB:doiA;
   const output=await getStagedArticleFigures(url('/api/article-figures/staged',doi),env);
   assert.equal(output.status,200);
   assert.equal(output.body.complete,true);
   assert.equal(output.body.scopeRequestedCount,1);
   assert.equal(output.body.items.length,1);
   assert.equal(output.body.items[0].doi,doi);
   assert.equal(output.body.inventoryIndexMode,'etag-verified-doi-projection-v1');
 }
 assert.equal(env.MEDIA.reads.filter(x=>x===stageKey).length,1);
 assert.equal(env.MEDIA.reads.filter(x=>x===reportKey).length,1);
});

test('TOC and body indexed DOI readers invalidate on changed R2 ETag',async()=>{
 const env=fixture();
 let result=await getLocalCaptureIndex(url('/api/local-captures',doiA),env);
 assert.equal(result.status,200);assert.equal(result.body.count,1);
 result=await getLocalCaptureIndex(url('/api/local-captures',doiB),env);
 assert.equal(result.status,200);assert.equal(result.body.count,0);
 assert.equal(env.MEDIA.reads.filter(x=>x===indexKey).length,1);
 env.MEDIA.seed(indexKey,{version:1,items:{
  [doiA+'|official']:{doi:doiA,kind:'official',mediaGeneration:epoch,updatedAt:epoch+200,pageDoi:doiA,
    articleUrl:src(doiA),sourceUrl:src(doiA),r2Key:'toc/a.png',contentHash:'a'.repeat(32)},
  [doiB+'|official']:{doi:doiB,kind:'official',mediaGeneration:epoch,updatedAt:epoch+200,pageDoi:doiB,
    articleUrl:src(doiB),sourceUrl:src(doiB),r2Key:'toc/b.png',contentHash:'b'.repeat(32)}
 }});
 result=await getLocalCaptureIndex(url('/api/local-captures',doiB),env);
 assert.equal(result.status,200);assert.equal(result.body.count,1);
 assert.equal(env.MEDIA.reads.filter(x=>x===indexKey).length,2);
});

test('HEAD/GET generation races never become false-empty authoritative inventory',async()=>{
 const env=fixture(),bucket=env.MEDIA;
 const realGet=bucket.get.bind(bucket);
 bucket.get=async key=>{
   const obj=await realGet(key);
   if(key===stageKey)return {...obj,etag:'wrong-generation'};
   return obj;
 };
 bucket.seed(stageKey,{version:1,items:{}});
 const result=await getStagedArticleFigures(url('/api/article-figures/staged',doiA),env);
 assert.equal(result.status,503);
 assert.equal(result.body.error,'capture_inventory_unavailable');
});

console.log('TM_INVENTORY_R2_CACHE_SUMMARY '+JSON.stringify({tests:3,productionWrites:0}));
