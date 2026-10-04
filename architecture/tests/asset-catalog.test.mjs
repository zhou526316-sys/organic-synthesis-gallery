import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnifiedAssetCatalog, verifyUnifiedAssetCatalog, assetStable } from '../asset-catalog.mjs';

const dois=['10.1234/a','10.1234/b','10.1234/c'];
const worker=()=>({
  generatedAt:100,
  items:[
    {doi:dois[0],tocStored:true,tocMissing:false,tocReason:'cached',largeSource:'toc',figureCount:2,
      capturedFigures:[{label:'Figure 1',contentHash:'a'.repeat(32),width:1000,height:800,quality:'usable'},
                       {label:'Figure 2',contentHash:'b'.repeat(32),width:900,height:700,quality:'usable'}]},
    {doi:dois[1],tocStored:false,tocMissing:true,tocReason:'cache_miss',largeSource:'none',figureCount:0,capturedFigures:[]},
    {doi:dois[2],tocStored:false,tocMissing:true,tocReason:'cache_miss',largeSource:'figure',figureOneStored:false,
      figureCount:1,capturedFigures:[{label:'Scheme 1',contentHash:'c'.repeat(32),width:700,height:600,quality:'usable'}]},
  ]
});
const local=()=>({
  updatedAt:200,count:2,items:[
    {doi:dois[1],kind:'official',contentHash:'d'.repeat(32),updatedAt:190,sourceUrl:'https://signed.example/?token=secret'},
    {doi:'10.9999/foreign',kind:'official',contentHash:'e'.repeat(32),updatedAt:190},
  ]
});
const staged=()=>({
  schemaVersion:'capture-inventory-v1',complete:true,generatedAt:300,count:2,items:[
    {doi:dois[0],expectedFigureCount:2,observedAt:290,figures:{
      'Figure 1':{label:'Figure 1',contentHash:'a'.repeat(32),width:1000,height:800,quality:'usable',updatedAt:280},
      'Figure 2':{label:'Figure 2',contentHash:'b'.repeat(32),width:900,height:700,quality:'usable',updatedAt:281},
    }},
    {doi:dois[1],expectedFigureCount:3,observedAt:292,figures:{
      'Figure 1':{label:'Figure 1',contentHash:'f'.repeat(32),width:800,height:600,quality:'usable',updatedAt:282},
    }},
  ]
});
const display=()=>({
  version:2,generatedAt:400,items:{
    [dois[0]]:{doi:dois[0],toc:{available:true,imageUrl:'media-mirror/a.jpg',reason:'imported',contentHash:'1'.repeat(32)}},
    [dois[2]]:{doi:dois[2],toc:{available:true,imageUrl:'media-mirror/c.jpg',reason:'figure1_fallback',contentHash:'2'.repeat(32)}},
    '10.9999/display':{doi:'10.9999/display',toc:{available:true,imageUrl:'media-mirror/x.jpg',reason:'imported'}},
  }
});
const summaries=()=>({
  version:1,generatedAt:500,items:{
    [dois[0]]:{doi:dois[0],status:'approved',sourceHash:'3'.repeat(64),evidencePacketHash:'4'.repeat(64),evidenceLevel:'complete',
      zh:'PRIVATE-LIKE-SUMMARY-TEXT-SHOULD-NOT-BE-COPIED',en:'DO NOT COPY',reviewedAt:450},
    '10.9999/summary':{doi:'10.9999/summary',status:'approved',sourceHash:'5'.repeat(64),evidencePacketHash:'6'.repeat(64)}
  }
});
function build(overrides={}) {
  return buildUnifiedAssetCatalog({
    membershipDois:dois,
    workerInventory:worker(),
    localCaptureIndex:local(),
    stagedFigureInventory:staged(),
    staticMediaIndex:display(),
    summaryIndex:summaries(),
    source:{publicationSlot:'2026-10-04T08:00:00+08:00',datasetSha256:'7'.repeat(64)},
    ...overrides,
  });
}

test('complete membership is preserved and catalog verifies',()=>{
  const c=build(),v=verifyUnifiedAssetCatalog(c,dois);
  assert.equal(v.ok,true);assert.equal(v.count,3);assert.equal(c.rows.length,3);
});

test('published, captured and display TOC remain separate facts',()=>{
  const c=build(),a=c.rows.find(x=>x.doi===dois[0]),b=c.rows.find(x=>x.doi===dois[1]),d=c.rows.find(x=>x.doi===dois[2]);
  assert.equal(a.toc.published.official,true);assert.equal(a.toc.captured.official,false);assert.equal(a.toc.display.kind,'official');
  assert.equal(b.toc.published.official,false);assert.equal(b.toc.captured.official,true);
  assert.equal(d.toc.published.fallback,true);assert.equal(d.toc.display.kind,'figure1');
});

test('captured official TOC without published official TOC is reconciliation, not missing',()=>{
  const c=build();
  assert.deepEqual(c.reconciliation.capturedTocNotPublished,[dois[1]]);
  assert.equal(c.summary.capturedTocNotPublished,1);
});

test('figure completeness requires expected count from staged evidence',()=>{
  const c=build(),a=c.rows.find(x=>x.doi===dois[0]),b=c.rows.find(x=>x.doi===dois[1]),d=c.rows.find(x=>x.doi===dois[2]);
  assert.equal(a.figures.captured.completeness,'complete');
  assert.equal(a.figures.captured.expectedCount,2);
  assert.equal(b.figures.captured.completeness,'incomplete');
  assert.equal(b.figures.captured.expectedCount,3);
  assert.equal(d.figures.published.presence,'present');
  assert.equal(d.figures.captured.completeness,'unknown');
  assert.equal(d.figures.captured.expectedCount,null);
});

test('unknown completeness is never rewritten as missing',()=>{
  const c=build(),d=c.rows.find(x=>x.doi===dois[2]);
  assert.equal(d.figures.captured.presence,'absent');
  assert.equal(d.figures.captured.completeness,'unknown');
  assert.ok(c.reconciliation.publishedFiguresWithoutCompletenessProof.includes(dois[2]));
});

test('summary availability exposes only hashes and evidence level, never prose',()=>{
  const c=build(),row=c.rows.find(x=>x.doi===dois[0]);
  assert.equal(row.summary.presence,'present');
  assert.equal(row.evidence.presence,'referenced_by_reviewed_summary');
  const text=assetStable(c);
  assert.ok(!text.includes('PRIVATE-LIKE-SUMMARY-TEXT-SHOULD-NOT-BE-COPIED'));
  assert.ok(!text.includes('DO NOT COPY'));
});

test('foreign source records are audited but never enter canonical membership',()=>{
  const c=build();
  assert.deepEqual(c.foreign.localCapture,['10.9999/foreign']);
  assert.deepEqual(c.foreign.staticMedia,['10.9999/display']);
  assert.deepEqual(c.foreign.summaries,['10.9999/summary']);
  assert.equal(c.rows.some(x=>x.doi.startsWith('10.9999/')),false);
});

test('signed source URLs and article URLs never leak into shadow catalog',()=>{
  const text=assetStable(build());
  assert.ok(!text.includes('signed.example'));
  assert.ok(!text.includes('sourceUrl'));
  assert.ok(!text.includes('articleUrl'));
  assert.ok(!text.includes('token'));
});

test('worker inventory must exactly cover all-time membership',()=>{
  const bad=worker();bad.items.pop();
  assert.throws(()=>build({workerInventory:bad}),/worker_inventory_membership_mismatch/);
});

test('staged inventory must declare complete and internally match its count',()=>{
  const bad=staged();bad.complete=false;
  assert.throws(()=>build({stagedFigureInventory:bad}),/staged_figure_inventory_incomplete/);
  const bad2=staged();bad2.count=999;
  assert.throws(()=>build({stagedFigureInventory:bad2}),/staged_figure_inventory_incomplete/);
});

test('catalog hash is deterministic and mutation is detected',()=>{
  const a=build(),b=build();
  assert.equal(a.catalogHash,b.catalogHash);
  a.rows[0].toc.published.official=!a.rows[0].toc.published.official;
  assert.throws(()=>verifyUnifiedAssetCatalog(a,dois),/asset_catalog_hash_mismatch/);
});

test('static display cannot manufacture published state',()=>{
  const c=build(),d=c.rows.find(x=>x.doi===dois[2]);
  assert.equal(d.toc.display.presence,'present');
  assert.equal(d.toc.published.official,false);
});

test('evidence without reviewed summary remains unknown rather than absent',()=>{
  const c=build();
  for(const doi of [dois[1],dois[2]]) assert.equal(c.rows.find(x=>x.doi===doi).evidence.presence,'unknown');
});
