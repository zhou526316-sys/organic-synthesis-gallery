import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {selectArticleBatch,strongOfficialCapture,officialToc} from '../cloudflare/scripts/merge-new-body-auto.mjs';

const policy=JSON.parse(await fs.readFile('audit/media-auto-policy.json','utf8'));
let passed=0;
function test(name,fn){fn();passed++;console.log('BATCH20_PAIRED_PASS '+name);}

function doi(i){return '10.1021/jacs.6c'+String(90000+i).padStart(5,'0');}
function row(i){
  return {doi:doi(i),id:'figure-1',label:'Figure 1',sortOrder:0,updatedAt:1790140000000+i};
}
function paperMap(n){
  const m=new Map();
  for(let i=0;i<n;i++)m.set(doi(i),{doi:doi(i),journal:'JACS',date:'2026-09-'+String(23-(i%5)).padStart(2,'0')});
  return m;
}
function mediaWithOfficial(n){
  return {items:Object.fromEntries(Array.from({length:n},(_,i)=>[doi(i),{
    doi:doi(i),
    toc:{available:true,imageUrl:'media-mirror/toc-'+i+'.svg',reason:'local_vpn_official_toc'},
    figures:{available:false,doi:doi(i),figures:[]}
  }]))};
}

test('production policy requires at least twenty articles',()=>{
  assert.equal(policy.minNewArticles,20);
  assert.ok(policy.maxNewArticles>=20&&policy.maxNewArticles<=25);
  assert.equal(policy.requireOfficialToc,true);
});

test('nineteen ready articles publish nothing',()=>{
  const rows=Array.from({length:19},(_,i)=>row(i));
  const x=selectArticleBatch(rows,mediaWithOfficial(19),paperMap(19),policy);
  assert.equal(x.readyArticles,19);
  assert.equal(x.rows.length,0);
  assert.equal(x.dois.length,0);
});

test('twenty ready articles form one publishable batch',()=>{
  const rows=Array.from({length:20},(_,i)=>row(i));
  const x=selectArticleBatch(rows,mediaWithOfficial(20),paperMap(20),policy);
  assert.equal(x.readyArticles,20);
  assert.equal(x.dois.length,20);
  assert.equal(x.rows.length,20);
});

test('twenty five ready articles stay within configured maximum',()=>{
  const rows=Array.from({length:25},(_,i)=>row(i));
  const x=selectArticleBatch(rows,mediaWithOfficial(25),paperMap(25),policy);
  assert.equal(x.dois.length,25);
  assert.equal(x.rows.length,25);
});

test('Figure 1 fallback is not an official TOC',()=>{
  const m=mediaWithOfficial(20);
  m.items[doi(0)].toc.reason='figure1_fallback';
  assert.equal(officialToc(m.items[doi(0)]),false);
  const x=selectArticleBatch(Array.from({length:20},(_,i)=>row(i)),m,paperMap(20),policy);
  assert.equal(x.readyArticles,19);
  assert.equal(x.rows.length,0);
});

test('same-build official TOC unlocks body only after merge-local-captures stage',()=>{
  const rows=Array.from({length:20},(_,i)=>row(i));
  const before={items:Object.fromEntries(Array.from({length:20},(_,i)=>[doi(i),{doi:doi(i),toc:{available:false,reason:'cache_miss'},figures:{available:false,doi:doi(i),figures:[]}}]))};
  const readyOverride=new Set(rows.map(r=>r.doi));
  const poll=selectArticleBatch(rows,before,paperMap(20),policy,{readyOverride});
  assert.equal(poll.dois.length,20); // enough evidence to trigger a Pages build
  const actualBefore=selectArticleBatch(rows,before,paperMap(20),policy);
  assert.equal(actualBefore.rows.length,0); // but body cannot publish before TOC is merged
  const after=mediaWithOfficial(20);
  const actualAfter=selectArticleBatch(rows,after,paperMap(20),policy);
  assert.equal(actualAfter.dois.length,20);
});

test('strong ACS official capture must bind page and source to exact DOI',()=>{
  const d=doi(0);
  const good={
    doi:d,kind:'official',captureVersion:'6.2.20',pageDoi:d,mediaGeneration:1790082000000,updatedAt:1790140000000,
    articleUrl:'https://pubs.acs.org/jacs/article/doi/'+d+'/example',
    sourceUrl:'https://acs.silverchair-cdn.com/acs/content_public/journal/jacs/10.1021_jacs.6c90000/1/m_ja6c90000_0006.svg'
  };
  assert.equal(strongOfficialCapture(good),true);
  assert.equal(strongOfficialCapture({...good,sourceUrl:good.sourceUrl.replace('6c90000','6c90001')}),false);
  assert.equal(strongOfficialCapture({...good,sourceUrl:'https://acs.silverchair-cdn.com/opaque/image.svg'}),false);
});

test('article group is held whole rather than partially published past card limit',()=>{
  const d=doi(0),rows=Array.from({length:10},(_,i)=>({...row(0),id:'figure-'+(i+1),sortOrder:i}));
  const media=mediaWithOfficial(20);
  media.items[d].figures={available:true,doi:d,figures:[{id:'figure-99',label:'Figure 99'}]};
  const filler=Array.from({length:19},(_,i)=>row(i+1));
  const x=selectArticleBatch([...rows,...filler],media,paperMap(20),policy);
  assert.ok(!x.dois.includes(d));
  assert.ok(x.readyArticles<=19);
  assert.equal(x.rows.length,0);
});

test('batch image ceiling never causes a partial article',()=>{
  const small={...policy,maxNewImages:20,minNewArticles:20,maxNewArticles:25};
  const rows=[];
  for(let i=0;i<20;i++){
    rows.push({...row(i),id:'figure-1'});
    rows.push({...row(i),id:'figure-2',sortOrder:1});
  }
  const x=selectArticleBatch(rows,mediaWithOfficial(20),paperMap(20),small);
  assert.ok(x.readyArticles<20);
  assert.equal(x.rows.length,0);
});

console.log('BATCH20_PAIRED_TEST_SUMMARY '+JSON.stringify({passed,minArticles:policy.minNewArticles,maxArticles:policy.maxNewArticles,maxImages:policy.maxNewImages}));
