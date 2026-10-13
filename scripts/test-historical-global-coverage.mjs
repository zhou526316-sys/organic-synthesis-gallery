import assert from 'node:assert/strict';
import {test} from 'node:test';
import {historicalYearPlan,mergeHistoricalReviewShards,COVERAGE_SCHEMA}
  from './historical-global-coverage.mjs';
import {TARGET_JOURNALS} from '../shared/literature-journals.js';
const f='2026-09-22_2026-09-30_jacs';
const root={schema:'gallery-historical-nightly-staging-v1',mode:'candidate_discovery_only',
  completed:[f],lastRunFinished:'2026-10-13T01:01:01Z',
  cursor:{range:{from:'2026-09-22',to:'2026-09-30'},journalIndex:1}};
const triage={schemaVersion:'gallery-history-review-triage-v1',
  mode:'review_queue_only_not_publication',
  rootSummaries:{[f]:{sourceSha256:'abcd'}}};
const shard={schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
  rootId:f,sourceSha256:'abcd',journal:'JACS',stats:{candidateOccurrences:2},
  records:[
    {doi:'10.1021/jacs.6c00001',status:'already_published',flags:[]},
    {doi:'10.1021/jacs.6c00002',status:'requires_two_pass_review',
      flags:['publisher_first_online_date_unverified']}
  ]};
test('all sixteen have founding plans; prospective activeFrom not reused',()=>{
  const plan=historicalYearPlan(TARGET_JOURNALS);
  assert.equal(plan.size,16);
  assert.ok(plan.get('JACS').get('1879').plannedRoots>0);
  assert.equal(plan.get('Nature Synthesis').get('2021').plannedRoots,0);
  assert.ok(plan.get('JOC').get('1936').plannedRoots>0);
  assert.equal(plan.get('Angew').get('1961').plannedRoots,0);
});
test('source completions are NOT publisher issue verification',()=>{
  const output=mergeHistoricalReviewShards(root,triage,[shard]);
  assert.equal(output.schemaVersion,COVERAGE_SCHEMA);
  assert.equal(output.counters.sourceCompletedRoots,1);
  assert.equal(output.counters.reviewQueueRoots,1);
  assert.equal(output.counters.candidateOccurrences,2);
  assert.equal(output.counters.distinctCandidateDois,2);
  assert.equal(output.counters.alreadyPublished,1);
  assert.equal(output.counters.requiresTwoPassReview,1);
  assert.equal(output.counters.unverifiedPublicationDate,1);
  assert.equal(output.counters.publisherIssueMatchedRoots,0);
  assert.equal(output.counters.noDoiArchiveSourceComplete,false);
  assert.equal(output.guards.reviewOrPublicationWrites,false);
});
test('repeat DOI across windows counts once globally',()=>{
  const nextId='2026-09-15_2026-09-21_jacs';
  const modified={...root,completed:[f,nextId]};
  const t={...triage,rootSummaries:{...triage.rootSummaries,[nextId]:{sourceSha256:'xyz'}}};
  const repeated={...shard,rootId:nextId,sourceSha256:'xyz',stats:{candidateOccurrences:1},
    records:[{doi:shard.records[0].doi,status:'already_published',flags:[]}]};
  const out=mergeHistoricalReviewShards(modified,t,[shard,repeated]);
  assert.equal(out.counters.candidateOccurrences,3);
  assert.equal(out.counters.distinctCandidateDois,2);
  assert.equal(out.counters.duplicateDoiOccurrences,1);
});
test('unsupported/missing evidence never counted complete',()=>{
  assert.throws(()=>mergeHistoricalReviewShards({...root,completed:[f,f]},triage,[shard]),
    /duplicate_completed_historical_roots/);
  const bad={...shard,sourceSha256:'invalid'};
  assert.throws(()=>mergeHistoricalReviewShards(root,triage,[bad]),/historical_triage_shard_or_source_hash_invalid/);
});
