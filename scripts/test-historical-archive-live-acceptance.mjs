import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectedHistory,verifyDelivery,verifyIndexedDay,REPORT_SCHEMA}
  from './historical-archive-live-acceptance.mjs';
const doi='10.1021/acs.joc.6c01580';
const marker={mode:'slot-release',publicationSlot:'2026-10-14T08:00:00+08:00',
  productionCards:980,historicalAdmittedDois:[doi],dailyPublishableDois:[]};
const manifest={accepted:[{doi,reviewPasses:2,challengeDecision:'include',date:'2026-09-14',
  journal:'JOC',ingestionChannel:'historical_backfill',addedDate:'',new:false,mediaPolicy:'toc_only'}]};
test('historical DOI only for Archive, separate from daily and old media',()=>{
  const expected=expectedHistory(marker,manifest);
  assert.equal(expected.length,1);
  assert.equal(expected[0].doi,doi);
  assert.equal(expected[0].mediaPolicy,'toc_only');
  assert.equal(typeof REPORT_SCHEMA,'string');
});
test('hard-fail daily DOI leaks and broken source scope/media',()=>{
  assert.throws(()=>expectedHistory({...marker,dailyPublishableDois:[doi]},manifest),
    /historical_leaked_into_daily_release/);
  const bad=structuredClone(manifest);bad.accepted[0].mediaPolicy='standard';
  assert.throws(()=>expectedHistory(marker,bad),/historical_media_policy_mismatch/);
});
test('live Pages membership is not inferred from CI',()=>{
  const delivery={publicationSlot:marker.publicationSlot,productionCards:980,
    dois:[doi,...Array.from({length:979},(_,i)=>'10.1021/dummy.'+i)],
    architectureCatalogId:'a'.repeat(64)};
  assert.equal(verifyDelivery(delivery,marker,expectedHistory(marker,manifest)),'a'.repeat(64));
  assert.throws(()=>verifyDelivery({...delivery,dois:delivery.dois.slice(1)},marker,expectedHistory(marker,manifest)));
});
test('real D1 rows and matched catalogId are mandatory',()=>{
  const left=new Set([doi]);
  const result=verifyIndexedDay({catalogId:'a',enabled:true,readPathActive:true,
    items:[{doi}],hasMore:false,nextCursor:null},'a',left);
  assert.equal(left.size,0);assert.equal(result.hasMore,false);
  assert.throws(()=>verifyIndexedDay({catalogId:'b',enabled:true,readPathActive:true,items:[]},'a',new Set([doi])),
    /historical_index_generation_or_result_invalid/);
});
