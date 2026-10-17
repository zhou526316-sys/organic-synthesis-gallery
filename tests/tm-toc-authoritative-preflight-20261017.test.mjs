import assert from 'node:assert/strict';
import {test} from 'node:test';
import {webcrypto} from 'node:crypto';
import {importLocalCapture} from '../cloudflare/worker/src/local-captures.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const doi='10.1021/acs.orglett.6c02752';
const data=new Uint8Array(256);
data.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],0);
for(let i=8;i<data.length;i++)data[i]=i%251;
const sha=Buffer.from(await webcrypto.subtle.digest('SHA-256',data)).toString('hex').slice(0,32);
const payload={
  doi,jobId:'11111111-1111-4111-8111-111111111111',pageDoi:doi,
  captureVersion:'6.2.20',kind:'official',
  articleUrl:'https://pubs.acs.org/doi/'+doi,
  sourceUrl:'https://acs.silverchair-cdn.com/acs/content_public/journal/orlef7/pap/10.1021_acs.orglett.6c02752/1/m_ol6c02752_0007.svg',
  imageData:'data:image/png;base64,'+Buffer.from(data).toString('base64')
};
function envFor({hash=sha,stored=data,exists=true}={}){
  const calls={r2Writes:0,r2Reads:0,selects:0,indexWrites:0};
  const r2Key='toc-cache/images/verified-existing.png';
  const env={
    MEDIA:{
      async get(key){calls.r2Reads++;
        if(key!==r2Key||stored===null)return null;
        return {arrayBuffer:async()=>new Uint8Array(stored).buffer};
      },
      async put(key){calls.r2Writes++;if(key.includes('index.json'))calls.indexWrites++;}
    },
    DB:{
      prepare(sql){calls.selects++;
        assert.match(sql,/SELECT available,r2_key,content_hash FROM toc_assets WHERE doi = \? LIMIT 1/);
        return {bind(x){assert.equal(x,doi);return {first:async()=>exists
          ?{available:1,r2_key:r2Key,content_hash:hash}:null};}};
      }
    }
  };
  return {env,calls};
}
const request=new Request('https://api.gczhouwld.com/api/media/local-capture/import',{method:'POST'});

test('existing DOI with distinct hash conflicts before any R2/index write',async()=>{
 const h=envFor({hash:'f'.repeat(32)});
 const r=await importLocalCapture(request,h.env,payload);
 assert.equal(r.status,409);assert.equal(r.body.code,'official_toc_conflict_review_required');
 assert.equal(r.body.stored,false);assert.equal(r.body.productionTocStored,false);
 assert.equal(r.body.existingProduction,true);assert.equal(r.body.reviewRequired,true);
 assert.equal(h.calls.r2Writes,0);assert.equal(h.calls.r2Reads,0);
});

test('same production SHA and actual R2 bytes reuse existing official TOC',async()=>{
 const h=envFor();
 const r=await importLocalCapture(request,h.env,payload);
 assert.equal(r.status,200);
 assert.equal(r.body.importState,'already_verified_production_bytes');
 assert.equal(r.body.productionTocStored,true);
 assert.equal(r.body.contentHash,sha);
 assert.ok(r.body.imageUrl.includes('/media/toc-cache/images/verified-existing.png'));
 assert.equal(h.calls.r2Reads,1);assert.equal(h.calls.r2Writes,0);
});

test('missing or mismatched production bytes cannot close TOC gap',async()=>{
 for(const stored of [null,new Uint8Array(256).fill(11)]){
   const h=envFor({stored});
   const r=await importLocalCapture(request,h.env,payload);
   assert.equal(r.status,503);
   assert.equal(r.body.productionTocStored,false);
   assert.match(r.body.code,/official_toc_production_(?:hash_mismatch|object_unavailable)/);
   assert.equal(h.calls.r2Writes,0);
 }
});

test('cross-DOI and capture nonce safeguards execute before cache preflight',async()=>{
 const h=envFor();
 const bad={...payload,pageDoi:'10.1021/acs.orglett.6c00961'};
 const r=await importLocalCapture(request,h.env,bad);
 assert.equal(r.status,409);assert.equal(r.body.code,'capture_page_doi_unverified');
 assert.equal(h.calls.selects,0);assert.equal(h.calls.r2Reads,0);
});

console.log('TM_TOC_AUTHORITATIVE_PREFLIGHT '+JSON.stringify({tests:4,externalPublisherRequests:0,productionMediaWrites:0}));
