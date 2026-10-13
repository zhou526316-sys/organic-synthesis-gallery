import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expectedHistory,verifyDelivery,verifyIndexedDay,historicalD1Budget,REPORT_SCHEMA}
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

test('historical D1 budget charges queries, not candidate volume, and fails before overrun',()=>{
  const budget=historicalD1Budget(2);
  assert.equal(budget.limit,2);
  assert.equal(budget.used,0);
  budget.charge();budget.charge();
  assert.equal(budget.used,2);
  assert.throws(()=>budget.charge(),/historical_d1_readback_query_budget_exhausted:2\/2/);
  assert.equal(budget.used,2);
  for(const invalid of [0,-1,25,1.5,Infinity,NaN])
    assert.throws(()=>historicalD1Budget(invalid),/historical_d1_budget_invalid/);
});
test('readback workflow reserves one slot in GitHub cache BEFORE any optional D1 call',()=>{
  const config=readFileSync('.github/workflows/historical-archive-live-acceptance.yml','utf8');
  const cached=config.indexOf('actions/cache/restore@v4');
  const reservation=config.indexOf('actions/cache/save@v4');
  const live=config.indexOf('run: node scripts/historical-archive-live-acceptance.mjs');
  assert.ok(cached>0&&reservation>cached&&live>reservation);
  assert.match(config,/HISTORICAL_D1_MAX_API_QUERIES: '16'/);
  assert.match(config,/group: historical-archive-d1-slot-budget/);
  assert.match(config,/github.event_name == 'workflow_run'/);
  assert.match(config,/steps.slot_cache.outputs.cache-hit != 'true'/);
  assert.match(config,/github.event_name == 'workflow_dispatch' && inputs.force_d1_readback == true/);
  assert.match(config,/github.event_name == 'pull_request'|pull_request:/);
});
