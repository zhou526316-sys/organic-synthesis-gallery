import assert from 'node:assert/strict';
import {adaptiveBatchGate,strongOfficialCapture,tocReadyDois,officialToc} from '../cloudflare/scripts/merge-new-body-auto.mjs';
import {captureBelongsToDoi,embeddedKnownDois} from '../cloudflare/scripts/merge-local-captures.mjs';
import fs from 'node:fs/promises';

const policy=JSON.parse(await fs.readFile('audit/media-auto-policy.json','utf8'));
let passed=0;
function test(name,fn){fn();passed++;console.log('ADAPTIVE_BATCH_PASS '+name);}
const now=Date.now();
const rows=(n,ageMinutes)=>Array.from({length:n},(_,i)=>({doi:'10.1021/jacs.6c'+String(91000+i),updatedAt:now-ageMinutes*60000-i}));

test('policy prefers twenty but permits adaptive quiet tail',()=>{
  assert.equal(policy.minNewArticles,20);
  assert.equal(policy.maxNewArticles,25);
  assert.equal(policy.tailFlushIdleMinutes,15);
  assert.equal(policy.tailFlushMinArticles,1);
});

test('nineteen fresh articles wait',()=>{
  const g=adaptiveBatchGate(rows(19,1),policy,now);
  assert.equal(g.ready,false);assert.equal(g.mode,'waiting');assert.equal(g.articleCount,19);
});

test('nineteen quiet articles flush as tail',()=>{
  const g=adaptiveBatchGate(rows(19,16),policy,now);
  assert.equal(g.ready,true);assert.equal(g.mode,'quiet_tail');assert.equal(g.tailReady,true);
});

test('twenty fresh articles publish immediately',()=>{
  const g=adaptiveBatchGate(rows(20,0),policy,now);
  assert.equal(g.ready,true);assert.equal(g.mode,'target_batch');assert.equal(g.targetReady,true);
});

test('single quiet final article is not stuck forever',()=>{
  const g=adaptiveBatchGate(rows(1,20),policy,now);
  assert.equal(g.ready,true);assert.equal(g.mode,'quiet_tail');
});

test('zero articles never triggers a deploy',()=>{
  const g=adaptiveBatchGate([],policy,now);
  assert.equal(g.ready,false);assert.equal(g.articleCount,0);
});

const doi='10.1021/jacs.6c91234';
const goodOfficial={
  doi,kind:'official',captureVersion:'6.2.20',pageDoi:doi,mediaGeneration:1790082000000,updatedAt:now,
  articleUrl:'https://pubs.acs.org/jacs/article/doi/10.1021/jacs.6c91234/example',
  sourceUrl:'https://acs.silverchair-cdn.com/acs/content_public/journal/jacs/10.1021_jacs.6c91234/1/m_ja6c91234_0006.svg'
};

test('strong current ACS TOC capture is accepted as same-build readiness',()=>{
  assert.equal(strongOfficialCapture(goodOfficial),true);
});

test('foreign DOI source never unlocks same-build body publication',()=>{
  assert.equal(strongOfficialCapture({...goodOfficial,sourceUrl:goodOfficial.sourceUrl.replace('6c91234','6c99999')}),false);
});

test('untrusted host containing the correct DOI is not readiness evidence',()=>{
  assert.equal(strongOfficialCapture({...goodOfficial,sourceUrl:'https://example.org/10.1021_jacs.6c91234/image.svg'}),false);
});

test('public official TOC and strong current local TOC both count as ready',()=>{
  const ready=tocReadyDois({
    live:{items:{'10.1021/jacs.6c90001':{toc:{available:true,imageUrl:'media-mirror/x.svg',reason:'local_vpn_official_toc'}}}},
    localCaptures:{items:[goodOfficial]}
  });
  assert.ok(ready.has('10.1021/jacs.6c90001'));assert.ok(ready.has(doi));
});

test('Figure1 fallback does not count as official TOC readiness',()=>{
  assert.equal(officialToc({toc:{available:true,imageUrl:'x.svg',reason:'figure1_fallback'}}),false);
});

test('static local-capture guard accepts correct ACS DOI-bound source',()=>{
  assert.equal(captureBelongsToDoi(goodOfficial,doi),true);
});

test('static local-capture guard rejects ACS source from another DOI',()=>{
  assert.equal(captureBelongsToDoi({...goodOfficial,sourceUrl:goodOfficial.sourceUrl.replace('6c91234','6c99999')},doi),false);
});

test('static local-capture guard still handles Nature DOI paths',()=>{
  const nature='10.1038/s41586-026-11043-z';
  assert.deepEqual(embeddedKnownDois('https://www.nature.com/articles/s41586-026-11043-z'),[nature]);
  assert.equal(captureBelongsToDoi({articleUrl:'https://www.nature.com/articles/s41586-026-11043-z',sourceUrl:'https://media.springernature.com/full/s41586-026-11043-z/figures/1'},nature),true);
});

console.log('ADAPTIVE_BATCH_TEST_SUMMARY '+JSON.stringify({passed,target:policy.minNewArticles,max:policy.maxNewArticles,tailIdleMinutes:policy.tailFlushIdleMinutes}));
