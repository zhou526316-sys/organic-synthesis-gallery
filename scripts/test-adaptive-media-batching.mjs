import assert from 'node:assert/strict';
import {adaptiveBatchGate,strongOfficialCapture,tocReadyDois,officialToc,completedPacketMap} from '../cloudflare/scripts/merge-new-body-auto.mjs';
import {captureBelongsToDoi,embeddedKnownDois} from '../cloudflare/scripts/merge-local-captures.mjs';
import fs from 'node:fs/promises';

const policy=JSON.parse(await fs.readFile('audit/media-auto-policy.json','utf8'));
let passed=0;function test(name,fn){fn();passed++;console.log('ADAPTIVE_BATCH_PASS '+name);}
const now=Date.now(),doi='10.1021/jacs.6c91234';
const rows=n=>Array.from({length:n},(_,i)=>({doi:'10.1021/jacs.6c'+String(91000+i),updatedAt:now-i}));

test('policy now releases completed single-article packets immediately',()=>{
  assert.equal(policy.minNewArticles,1);assert.equal(policy.maxNewArticles,25);
  assert.equal(policy.requireOfficialTocInBuild,true);assert.equal(policy.requireCompletedCapturePacket,true);
  assert.equal(policy.backfillStabilityMinutes,15);assert.ok(Number.isFinite(Date.parse(policy.backfillCapturedBefore)));
});
test('one eligible completed article is deployment-ready',()=>{const g=adaptiveBatchGate(rows(1),policy,now);assert.equal(g.ready,true);assert.equal(g.mode,'target_batch');assert.equal(g.articleCount,1);});
test('zero articles never triggers a deploy',()=>{const g=adaptiveBatchGate([],policy,now);assert.equal(g.ready,false);assert.equal(g.articleCount,0);});
test('completed packet index requires a completed body-bearing media phase',()=>{
  const ok={doi,jobId:'packet-job-12345678',captureVersion:'6.2.20',mediaNeed:'figures',final:true,status:'success',figuresDiscovered:2,figuresStored:2,figureLabels:['Figure 1','Figure 2']};
  const bad={...ok,doi:'10.1021/jacs.6c91235',figuresStored:1};
  const unfinished={...ok,doi:'10.1021/jacs.6c91236',final:false};
  const tocOnly={...ok,doi:'10.1021/jacs.6c91237',mediaNeed:'toc',figuresDiscovered:0,figuresStored:0,figureLabels:[]};
  const map=completedPacketMap({reports:{items:[ok,bad,unfinished,tocOnly]}});assert.ok(map.has(doi));assert.ok(!map.has(bad.doi));assert.ok(!map.has(unfinished.doi));assert.ok(!map.has(tocOnly.doi));
});

const goodOfficial={doi,kind:'official',captureVersion:'6.2.20',pageDoi:doi,mediaGeneration:1790082000000,updatedAt:now,
  articleUrl:'https://pubs.acs.org/jacs/article/doi/10.1021/jacs.6c91234/example',
  sourceUrl:'https://acs.silverchair-cdn.com/acs/content_public/journal/jacs/10.1021_jacs.6c91234/1/m_ja6c91234_0006.svg'};
test('strong current ACS TOC capture is accepted as same-build readiness',()=>assert.equal(strongOfficialCapture(goodOfficial),true));
test('foreign DOI source never unlocks same-build publication',()=>assert.equal(strongOfficialCapture({...goodOfficial,sourceUrl:goodOfficial.sourceUrl.replaceAll('6c91234','6c99999')}),false));
test('untrusted host containing correct DOI is rejected',()=>assert.equal(strongOfficialCapture({...goodOfficial,sourceUrl:'https://example.org/10.1021_jacs.6c91234/image.svg'}),false));
test('public official TOC and strong current local TOC both count as ready',()=>{
  const ready=tocReadyDois({live:{items:{'10.1021/jacs.6c90001':{toc:{available:true,imageUrl:'media-mirror/x.svg',reason:'local_vpn_official_toc'}}}},localCaptures:{items:[goodOfficial]}});
  assert.ok(ready.has('10.1021/jacs.6c90001'));assert.ok(ready.has(doi));
});
test('Figure1 fallback does not count as official TOC readiness',()=>assert.equal(officialToc({toc:{available:true,imageUrl:'x.svg',reason:'figure1_fallback'}}),false));
test('static local-capture guard accepts correct ACS DOI-bound source',()=>assert.equal(captureBelongsToDoi(goodOfficial,doi),true));
test('static local-capture guard rejects ACS source from another DOI',()=>assert.equal(captureBelongsToDoi({...goodOfficial,sourceUrl:goodOfficial.sourceUrl.replaceAll('6c91234','6c99999')},doi),false));
test('Nature publisher-owned DOI-bound TOC source is accepted',()=>{
  const nature='10.1038/s41586-026-11043-z',row={doi:nature,kind:'official',captureVersion:'6.2.20',pageDoi:nature,mediaGeneration:1790082000000,updatedAt:now,
    articleUrl:'https://www.nature.com/articles/s41586-026-11043-z',sourceUrl:'https://media.springernature.com/full/s41586-026-11043-z/figures/1'};
  assert.deepEqual(embeddedKnownDois(row.articleUrl),[nature]);assert.equal(strongOfficialCapture(row),true);assert.equal(captureBelongsToDoi(row,nature),true);
});
console.log('ADAPTIVE_BATCH_TEST_SUMMARY '+JSON.stringify({passed,minArticles:policy.minNewArticles,maxArticles:policy.maxNewArticles,completedPacketRequired:true,backfillStabilityMinutes:policy.backfillStabilityMinutes}));
