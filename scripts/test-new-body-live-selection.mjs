import assert from 'node:assert/strict';
import {selectLiveVerificationBatch} from './select-new-body-live-dois.mjs';
import {liveMediaPrimaryProof} from './live-media-primary-proof.mjs';

let passed=0;
function check(name,fn){fn();passed+=1;console.log('NEW_BODY_LIVE_SELECTION_PASS '+name);}

check('current status.added batch has priority',()=>{
  const r=selectLiveVerificationBatch({added:[{doi:'10.1/a'},{doi:'10.1/a'},{doi:'10.1/b'}]},{items:[
    {admittedAt:20,record:{doi:'10.1/c'}}
  ]});
  assert.deepEqual(r,{mode:'current_release',dois:['10.1/a','10.1/b'],admittedAt:null});
});

check('no-op build rechecks latest retained admittedAt batch',()=>{
  const r=selectLiveVerificationBatch({added:[]},{items:[
    {admittedAt:10,record:{doi:'10.1/a'}},
    {admittedAt:20,record:{doi:'10.1/b'}},
    {admittedAt:20,record:{doi:'10.1/c'}},
    {admittedAt:20,record:{doi:'10.1/b'}}
  ]});
  assert.equal(r.mode,'latest_retained_release');
  assert.equal(r.admittedAt,20);
  assert.deepEqual(r.dois,['10.1/b','10.1/c']);
});

check('empty snapshot yields no verification batch',()=>{
  assert.deepEqual(selectLiveVerificationBatch({added:[]},{items:[]}),{mode:'none',dois:[],admittedAt:null});
});

check('reviewed official TOC remains valid regardless of new Figure1 pairing',()=>{
  assert.deepEqual(liveMediaPrimaryProof('10.1021/jacs.6c11855',
    {toc:{available:true,imageUrl:'media-mirror/worker-123.png',reason:'imported'}}),
    {valid:true,kind:'official'});
});

check('exact public Nature and Science Figure1 pair preserves correct fallback identity',()=>{
  for(const doi of ['10.1038/s44160-026-01183-5','10.1126/science.aef3001']){
    const hash='a'.repeat(32),imageUrl='media-mirror/local-abc123.png';
    const figure={id:'figure-1',label:'Figure 1',contentHash:hash,imageUrl,
      sourceRepository:'Local VPN Collector',source:'windows-toc-collector'};
    const toc={available:true,reason:'figure1_fallback',imageUrl,contentHash:hash,
      sourceRepository:'Local VPN Collector',source:'windows-toc-collector'};
    const record={toc,figures:{figures:[figure,
      {id:'figure-2',label:'Figure 2',imageUrl:'media-mirror/body-auto-verified.png'}]}};
    assert.deepEqual(liveMediaPrimaryProof(doi,record),{valid:true,kind:'verified_figure1'});
    assert.equal(liveMediaPrimaryProof('10.1021/jacs.6c11855',record).valid,false);
    assert.equal(liveMediaPrimaryProof(doi,{...record,toc:{...toc,reason:'pdf_primary_fallback'}}).valid,false);
    assert.equal(liveMediaPrimaryProof(doi,{...record,toc:{...toc,contentHash:'b'.repeat(32)}}).valid,false);
    assert.equal(liveMediaPrimaryProof(doi,{...record,toc:{...toc,sourceRepository:'unknown'}}).valid,false);
    assert.equal(liveMediaPrimaryProof(doi,{...record,figures:{figures:[{...figure,imageUrl:'media-mirror/foreign.png'}]}}).valid,false);
    assert.equal(liveMediaPrimaryProof(doi,{...record,figures:{figures:[figure,figure]}}).valid,false);
  }
});

console.log('NEW_BODY_LIVE_SELECTION_TESTS '+JSON.stringify({passed}));
