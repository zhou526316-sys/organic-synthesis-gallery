import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ARTICLE_EVIDENCE_SCHEMA_VERSION,importArticleFulltext,getArticleSummary} from '../src/article-summary.js';

const DOI='10.1021/jacs.6c08636';
const REVIEW_SCHEMA='scheduled-reviewed-summary-v1';
const original='A nickel-catalyzed electrochemical coupling strategy enables selective carbon-carbon bond construction from readily available building blocks with a defined reaction mechanism. '.repeat(6);
const payload=(extra={})=>({
  schemaVersion:ARTICLE_EVIDENCE_SCHEMA_VERSION,doi:DOI,pageDoi:DOI,
  publisher:'acs',articleUrl:'https://pubs.acs.org/doi/'+DOI,
  sourceUrl:'https://pubs.acs.org/doi/'+DOI,
  captureVersion:'6.2.20',controllerRevision:'2.2.32',
  jobId:'12345678-1234-1234-1234-123456789012',
  queueGeneratedAt:'2026-09-24T12:00:00Z',
  capturedAt:'2026-09-24T12:05:00Z',fulltextStatus:'complete',
  textProcessingPolicy:'open_access',
  sections:[{type:'abstract',heading:'Abstract',order:0,text:original},
    {type:'results',heading:'Results',order:1,text:original}],
  captions:[],tables:[],...extra
});
class R2Object{
  constructor(data,options={}){this.raw=String(data);this.customMetadata=options.customMetadata||{};}
  async text(){return this.raw;}
}
class R2{
  map=new Map();
  async put(k,v,opt={}){this.map.set(k,new R2Object(v,opt));}
  async get(k){return this.map.get(k)||null;}
  async list(){return {objects:[],truncated:false};}
}
async function sha(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function setup(t){
  const MEDIA=new R2(),assets={items:{}};
  const env={MEDIA,SCHEDULED_SUMMARY_HANDOFF_ENABLED:'0',
    ASSETS:{fetch:async()=>new Response(JSON.stringify({version:1,items:assets.items}),{
      status:200,headers:{'content-type':'application/json'}
    })}};
  const first=await importArticleFulltext(env,payload());
  assert.equal(first.status,200);
  const row={schemaVersion:REVIEW_SCHEMA,doi:DOI,status:'approved',
    sourceHash:first.body.sourceHash,evidencePacketHash:first.body.evidencePacketHash,
    evidenceLevel:'complete',zh:'经证据核验的中文科研解读。',
    en:'A scientifically reviewed description supported by the exact article evidence.',
    reviewedAt:1790265660000,generatedAt:1790265600000,
    auditVersion:'gallery-reviewed-v1',promptVersion:'summary-v1'};
  assets.items[DOI]=row;
  const baseline=await getArticleSummary(env,DOI);
  assert.equal(baseline.body.available,true);
  assert.equal(baseline.body.source,'scheduled_reviewed_evidence_v2');
  return {env,MEDIA,assets,row,first};
}
test('same exact text, same evidence level and revalidated DOI returns previously approved review',async t=>{
  const {env,first}=await setup(t);
  const second=await importArticleFulltext(env,payload({
    capturedAt:'2026-10-10T22:31:00Z',
    jobId:'87654321-1234-1234-1234-123456789012',
    controllerRevision:'2.2.83'
  }));
  assert.equal(second.body.sourceHash,first.body.sourceHash);
  assert.notEqual(second.body.evidencePacketHash,first.body.evidencePacketHash);
  const current=await getArticleSummary(env,DOI);
  assert.equal(current.status,200);
  assert.equal(current.body.available,true);
  assert.equal(current.body.contentEquivalentReviewed,true);
  assert.equal(current.body.source,'scheduled_reviewed_source_equivalent_v2');
  assert.equal(current.body.sourceHash,first.body.sourceHash);
  assert.equal(current.body.evidencePacketHash,second.body.evidencePacketHash);
});
test('changed experimental evidence never reuses old reviewed claim',async t=>{
  const {env}=await setup(t);
  await importArticleFulltext(env,payload({
    sections:[{type:'abstract',heading:'Abstract',order:0,text:original+' Material experimental difference.'}]
  }));
  const current=await getArticleSummary(env,DOI);
  assert.equal(current.body.available,false);
  assert.equal(current.body.reason,'scheduled_summary_pending');
});
test('same source text but a different Evidence level cannot reuse deep review',async t=>{
  const {env,first}=await setup(t);
  const shifted=await importArticleFulltext(env,payload({fulltextStatus:'partial'}));
  assert.equal(shifted.body.sourceHash,first.body.sourceHash);
  const current=await getArticleSummary(env,DOI);
  assert.equal(current.body.available,false);
});
test('no-external-AI evidence policy blocks content-equivalence fallback',async t=>{
  const {env}=await setup(t);
  await importArticleFulltext(env,payload({
    textProcessingPolicy:'no_external_ai',capturedAt:'2026-10-11T00:00:00Z'
  }));
  const current=await getArticleSummary(env,DOI);
  assert.equal(current.body.available,false);
});
test('tampered stored Evidence text is rejected even if old declared source hash matches',async t=>{
  const {env,MEDIA,first}=await setup(t);
  const second=await importArticleFulltext(env,payload({capturedAt:'2026-10-11T00:02:00Z'}));
  const id=(await sha(DOI)).slice(0,32),key='private/article-evidence-v2/'+id+'.json';
  const object=JSON.parse((await MEDIA.get(key)).raw);
  object.sections[0].text += ' A tampered statement with a different experimental claim.';
  assert.equal(object.sourceHash,first.body.sourceHash);
  await MEDIA.put(key,JSON.stringify(object));
  const current=await getArticleSummary(env,DOI);
  assert.equal(current.body.available,false);
});
test('review asset missing audit provenance never promotes equivalent content',async t=>{
  const {env,assets}=await setup(t);
  delete assets.items[DOI].auditVersion;
  await importArticleFulltext(env,payload({capturedAt:'2026-10-11T00:03:00Z'}));
  const current=await getArticleSummary(env,DOI);
  assert.equal(current.body.available,false);
});
