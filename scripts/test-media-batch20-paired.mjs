import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {strongOfficialCapture,officialToc,tailFlushState} from '../cloudflare/scripts/merge-new-body-auto.mjs';

const policy=JSON.parse(await fs.readFile('audit/media-auto-policy.json','utf8'));
let passed=0;
function test(name,fn){fn();passed++;console.log('BATCH20_PAIRED_PASS '+name);}

function doi(i){return '10.1021/jacs.6c'+String(90000+i).padStart(5,'0');}
function row(i,updatedAt){return {doi:doi(i),id:'figure-1',label:'Figure 1',updatedAt,sortOrder:0};}
function localOfficial(d,updatedAt){
  const suffix=d.split('/')[1];
  return {
    doi:d,kind:'official',captureVersion:'6.2.20',pageDoi:d,mediaGeneration:1790082000000,updatedAt,
    articleUrl:'https://pubs.acs.org/jacs/article/doi/'+d+'/fixture',
    sourceUrl:'https://acs.silverchair-cdn.com/acs/content_public/journal/jacs/10.1021_'+suffix+'/1/m_ja'+suffix.replace(/^jacs\./,'')+'_0006.svg'
  };
}

test('production policy targets twenty and permits a stable tail',()=>{
  assert.equal(policy.targetNewArticles,20);
  assert.equal(policy.maxNewArticles,25);
  assert.equal(policy.tailFlushAfterMinutes,15);
  assert.equal(policy.requireOfficialTocInBuild,true);
});

test('true official TOC excludes Figure 1 fallback',()=>{
  assert.equal(officialToc({toc:{available:true,imageUrl:'toc.svg',reason:'local_vpn_official_toc'}}),true);
  assert.equal(officialToc({toc:{available:true,imageUrl:'f1.svg',reason:'figure1_fallback'}}),false);
  assert.equal(officialToc({toc:{available:false,imageUrl:''}}),false);
});

test('recent nineteen-article evidence is not a stable tail',()=>{
  const now=2_000_000_000_000;
  const rows=Array.from({length:19},(_,i)=>row(i,now-5*60*1000+i));
  const state=tailFlushState(rows,{localCaptures:{items:[]}},policy,now);
  assert.equal(state.stable,false);
  assert.ok(state.ageMs<policy.tailFlushAfterMinutes*60*1000);
});

test('quiet nineteen-article tail becomes releasable after fifteen minutes',()=>{
  const now=2_000_000_000_000;
  const rows=Array.from({length:19},(_,i)=>row(i,now-20*60*1000+i));
  const state=tailFlushState(rows,{localCaptures:{items:[]}},policy,now);
  assert.equal(state.stable,true);
  assert.ok(state.ageMs>=policy.tailFlushAfterMinutes*60*1000);
});

test('fresh official TOC resets tail quiet time',()=>{
  const now=2_000_000_000_000;
  const rows=Array.from({length:7},(_,i)=>row(i,now-20*60*1000+i));
  const state=tailFlushState(rows,{localCaptures:{items:[localOfficial(doi(0),now-2*60*1000)]}},policy,now);
  assert.equal(state.stable,false);
  assert.ok(state.ageMs<5*60*1000);
});

test('strong ACS official capture binds both page and source to the exact DOI',()=>{
  const d=doi(0),good=localOfficial(d,1790140000000);
  assert.equal(strongOfficialCapture(good),true);
  assert.equal(strongOfficialCapture({...good,sourceUrl:good.sourceUrl.replace('6c90000','6c90001')}),false);
  assert.equal(strongOfficialCapture({...good,sourceUrl:'https://acs.silverchair-cdn.com/opaque/image.svg'}),false);
});

test('old capture generation cannot unlock same-build body publication',()=>{
  const d=doi(1),good=localOfficial(d,1790140000000);
  assert.equal(strongOfficialCapture({...good,mediaGeneration:1790081999999}),false);
  assert.equal(strongOfficialCapture({...good,captureVersion:'6.2.19'}),false);
});

console.log('BATCH20_PAIRED_TEST_SUMMARY '+JSON.stringify({
  passed,targetArticles:policy.targetNewArticles,maxArticles:policy.maxNewArticles,
  tailFlushAfterMinutes:policy.tailFlushAfterMinutes
}));
