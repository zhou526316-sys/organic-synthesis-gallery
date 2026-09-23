import assert from 'node:assert/strict';
import {selectLiveVerificationBatch} from './select-new-body-live-dois.mjs';

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

console.log('NEW_BODY_LIVE_SELECTION_TESTS '+JSON.stringify({passed}));
