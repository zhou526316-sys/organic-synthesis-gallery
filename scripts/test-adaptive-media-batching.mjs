import assert from 'node:assert/strict';
import {adaptiveBatchGate,strongOfficialCapture,strongVerifiedFigureOneCapture,verifiedFigureOneInBuild,verifiedPrimaryReadyDois,tocReadyDois,officialToc,completedPacketMap} from '../cloudflare/scripts/merge-new-body-auto.mjs';
import {captureBelongsToDoi,embeddedKnownDois} from '../cloudflare/scripts/merge-local-captures.mjs';
import fs from 'node:fs/promises';

const policy=JSON.parse(await fs.readFile('audit/media-auto-policy.json','utf8'));
let passed=0;function test(name,fn){fn();passed++;console.log('ADAPTIVE_BATCH_PASS '+name);}
const now=Date.now(),doi='10.1021/jacs.6c91234';
const rows=n=>Array.from({length:n},(_,i)=>({doi:'10.1021/jacs.6c'+String(91000+i),updatedAt:now-i}));

test('policy now releases completed single-article packets immediately',()=>{
  assert.equal(policy.minNewArticles,1);assert.equal(policy.maxNewArticles,25);assert.equal(policy.maxFiguresPerCard,20);
  assert.equal(policy.requireOfficialTocInBuild,true);assert.equal(policy.requireCompletedCapturePacket,true);
  assert.equal(policy.backfillStabilityMinutes,15);assert.ok(Number.isFinite(Date.parse(policy.backfillCapturedBefore)));
});
test('one eligible completed article is deployment-ready',()=>{const g=adaptiveBatchGate(rows(1),policy,now);assert.equal(g.ready,true);assert.equal(g.mode,'target_batch');assert.equal(g.articleCount,1);});
test('zero articles never triggers a deploy',()=>{const g=adaptiveBatchGate([],policy,now);assert.equal(g.ready,false);assert.equal(g.articleCount,0);});
test('a completed image packet survives an independent PDF 403 only',()=>{
  const item={doi:'10.1016/j.chempr.2026.103220',jobId:'publisher-job-123456789',
    captureVersion:'6.2.20',mediaNeed:'toc+figures+evidence+pdf',
    final:true,status:'partial',tocStatus:'already_available',privatePdfStatus:'failed',fulltextStatus:'not_requested',
    figuresDiscovered:7,figuresStored:7,figureLabels:['Figure 1','Figure 2','Figure 3','Figure 4','Figure 5','Figure 6','Figure 7'],
    reason:'combined_capture;toc=already_available;figures=7/7;evidence=not_requested;published=0;pdf=private_pdf_http_403'};
  const make=x=>completedPacketMap({reports:{items:[x]}});
  assert.ok(make(item).has(item.doi));
  assert.ok(!make({...item,figuresStored:6}).has(item.doi));
  assert.ok(!make({...item,final:false}).has(item.doi));
  assert.ok(!make({...item,reason:item.reason+';other_error'}).has(item.doi));
  assert.ok(!make({...item,privatePdfStatus:'stored'}).has(item.doi));
  assert.ok(!make({...item,tocStatus:'not_found',reason:item.reason.replace('toc=already_available','toc=not_found')}).has(item.doi));
  assert.ok(!make({...item,status:'failed'}).has(item.doi));
});

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
test('Figure1 fallback is not labelled as official TOC',()=>assert.equal(officialToc({toc:{available:true,imageUrl:'x.svg',reason:'figure1_fallback'}}),false));
test('publisher-proven Nature Figure1 satisfies primary gate without weakening official status',()=>{
  const nature='10.1038/s44160-026-01183-5',hash='a'.repeat(32);
  const proof={doi:nature,kind:'figure1',captureVersion:'6.2.20',pageDoi:nature,
    mediaGeneration:1790082000000,updatedAt:now,contentHash:hash,
    articleUrl:'https://www.nature.com/articles/s44160-026-01183-5',
    sourceUrl:'https://media.springernature.com/lw685/springer-static/image/art%3A10.1038%2Fs44160-026-01183-5/MediaObjects/44160_2026_1183_Fig1_HTML.png'};
  const media={toc:{available:true,imageUrl:'media-mirror/local-verified-figure1.webp',reason:'figure1_fallback',contentHash:hash},
    figures:{figures:[{id:'figure-1',contentHash:hash,imageUrl:'media-mirror/local-verified-figure1.webp'}]}};
  assert.equal(strongVerifiedFigureOneCapture(proof),true);
  assert.equal(officialToc(media),false);
  assert.equal(verifiedFigureOneInBuild(media,nature,{items:[proof]}),true);
  assert.ok(verifiedPrimaryReadyDois({live:{items:{}},localCaptures:{items:[proof]}}).has(nature));
  assert.equal(verifiedFigureOneInBuild(media,nature,{items:[{...proof,contentHash:'b'.repeat(32)}]}),false);
  assert.equal(strongVerifiedFigureOneCapture({...proof,sourceUrl:proof.sourceUrl.replace('s44160-026-01183-5','s44160-026-01184-6')}),false);
  assert.equal(strongVerifiedFigureOneCapture({...proof,sourceUrl:'https://untrusted.example/10.1038/s44160-026-01183-5'}),false);
  assert.equal(verifiedFigureOneInBuild({...media,toc:{...media.toc,reason:'pdf_primary_fallback'}},nature,{items:[proof]}),false);
});
test('static local-capture guard accepts correct ACS DOI-bound source',()=>assert.equal(captureBelongsToDoi(goodOfficial,doi),true));
test('static local-capture guard rejects ACS source from another DOI',()=>assert.equal(captureBelongsToDoi({...goodOfficial,sourceUrl:goodOfficial.sourceUrl.replaceAll('6c91234','6c99999')},doi),false));
test('Nature publisher-owned DOI-bound TOC source is accepted',()=>{
  const nature='10.1038/s41586-026-11043-z',row={doi:nature,kind:'official',captureVersion:'6.2.20',pageDoi:nature,mediaGeneration:1790082000000,updatedAt:now,
    articleUrl:'https://www.nature.com/articles/s41586-026-11043-z',sourceUrl:'https://media.springernature.com/full/s41586-026-11043-z/figures/1'};
  assert.deepEqual(embeddedKnownDois(row.articleUrl),[nature]);assert.equal(strongOfficialCapture(row),true);assert.equal(captureBelongsToDoi(row,nature),true);
});
console.log('ADAPTIVE_BATCH_TEST_SUMMARY '+JSON.stringify({passed,minArticles:policy.minNewArticles,maxArticles:policy.maxNewArticles,completedPacketRequired:true,backfillStabilityMinutes:policy.backfillStabilityMinutes}));
