import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getArticleSummary,importArticleFulltext} from '../src/article-summary.js';

class MemoryR2 {
  constructor(){this.objects=new Map();}
  async put(key,value){this.objects.set(key,typeof value==='string'?value:JSON.stringify(value));}
  async get(key){
    const text=this.objects.get(key);
    return text===undefined?null:{text:async()=>text};
  }
}
const doi='10.1021/jacs.6c08636',r2=new MemoryR2();
const packetId=createHash('sha256').update(doi).digest('hex').slice(0,32);
const key='private/article-evidence-v2/'+packetId+'.json';
const approved={};
const ASSETS={fetch:async()=>new Response(JSON.stringify({
  version:1,generatedAt:1790000000000,items:approved
}),{status:200,headers:{'content-type':'application/json'}})};
const env={MEDIA:r2,ASSETS,SCHEDULED_SUMMARY_HANDOFF_ENABLED:'0'};
const paragraphs=(
  'Catalytic C–C bond construction proceeds with substrate scope and selectivity. '+
  'Control experiments support a plausible radical pathway, whereas the proposed cycle is not fully established. '
).repeat(24);
const payload=(extra={})=>({
  schemaVersion:'article-evidence-v2',doi,pageDoi:doi,
  title:'DOI-verified example',journal:'JACS',publisher:'acs',
  articleUrl:'https://pubs.acs.org/doi/'+doi,
  sourceUrl:'https://pubs.acs.org/doi/'+doi,
  captureVersion:'6.2.20',controllerRevision:'2.2.34',
  jobId:'12345678-1234-1234-1234-123456789012',
  queueGeneratedAt:'2026-09-24T10:00:00Z',
  capturedAt:'2026-09-24T10:05:00Z',
  fulltextStatus:'complete',textProcessingPolicy:'unknown',
  sections:[{type:'results',heading:'Results',text:paragraphs,order:0}],
  captions:[{label:'Scheme 1',type:'scheme',
    text:'Standard reaction conditions and representative validated products.'}],
  tables:[{label:'Table 1',title:'Optimization',
    text:'Comparison of catalysts, solvents, yields and enantioselectivities.'}],
  ...extra,
});
const first=await importArticleFulltext(env,payload());
assert.equal(first.status,200);
approved[doi]={
  schemaVersion:'scheduled-reviewed-summary-v1',doi,status:'approved',
  sourceHash:first.body.sourceHash,evidencePacketHash:first.body.evidencePacketHash,
  evidenceLevel:'complete',
  zh:'该研究经过两遍科学审核，依据已验证的实验结果与底物范围形成摘要。',
  en:'This twice-reviewed scientific account accurately describes the verified reaction evidence.',
  generatedAt:1790000000000,reviewedAt:1790000000000,
  promptVersion:'gallery-daily-summary-v1',auditVersion:'gallery-daily-summary-audit-v1'
};
const original=await getArticleSummary(env,doi);
assert.equal(original.body.available,true);
assert.equal(original.body.contentEquivalentRevalidated,false);
const reimport=await importArticleFulltext(env,payload({
  capturedAt:'2026-09-24T11:05:00Z',
  jobId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
}));
assert.equal(reimport.status,200);
assert.equal(first.body.sourceHash,reimport.body.sourceHash);
assert.notEqual(first.body.evidencePacketHash,reimport.body.evidencePacketHash);
const equivalent=await getArticleSummary(env,doi);
assert.equal(equivalent.body.available,true);
assert.equal(equivalent.body.contentEquivalentRevalidated,true);
assert.equal(equivalent.body.source,'scheduled_reviewed_evidence_v2');
assert.equal(equivalent.body.sourceHash,first.body.sourceHash);
assert.equal(equivalent.body.evidencePacketHash,reimport.body.evidencePacketHash);
assert.equal(equivalent.body.reviewedAt,approved[doi].reviewedAt);

// A forged/corrupt packet cannot be re-attested even if it copies the
// originally reviewed sourceHash. The source and full packet must both rehash.
const parsed=JSON.parse(await (await r2.get(key)).text());
await r2.put(key,JSON.stringify({...parsed,articleUrl:'https://pubs.acs.org/doi/'+doi+'?changed'}));
const corrupt=await getArticleSummary(env,doi);
assert.equal(corrupt.body.available,false);
assert.equal(corrupt.body.reason,'scheduled_summary_pending');
await r2.put(key,JSON.stringify(parsed));
const again=await getArticleSummary(env,doi);
assert.equal(again.body.available,true);
assert.equal(again.body.contentEquivalentRevalidated,true);

// A scientific-text correction changes SourceHash: require new two-pass review.
const changed=await importArticleFulltext(env,payload({
  sections:[{type:'results',heading:'Results',text:paragraphs+
    ' Revised yield and selectivity data supersede the old account.',order:0}]
}));
assert.notEqual(changed.body.sourceHash,first.body.sourceHash);
assert.equal((await getArticleSummary(env,doi)).body.available,false);

// A completeness downgrade cannot reuse even an identical chemistry text.
const downgraded=await importArticleFulltext(env,payload({
  fulltextStatus:'partial',capturedAt:'2026-09-24T12:05:00Z'
}));
assert.equal(downgraded.body.sourceHash,first.body.sourceHash);
assert.equal((await getArticleSummary(env,doi)).body.available,false);
console.log(JSON.stringify({
  strictExactPacketStillValid:true,
  sameTextMetadataRepackagingReverified:true,
  fullCurrentPacketAndAllRowsIndependentlyHashed:true,
  damagedPacketRejected:true,
  changedChemistryRejected:true,
  completenessDowngradeRejected:true,
  noProductionWrites:true,
}));
