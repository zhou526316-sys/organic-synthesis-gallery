import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildReviewShard} from './historical-review-triage.mjs';
import {verifyHistoricalReviewerStatusRefresh} from './historical-q3-reviewer-status-refresh.mjs';
import {reconcileQ3,PUBLISHER_NONRESEARCH_SCHEMA} from './historical-q3-reconciliation.mjs';

const rootId='2026-08-22_2026-08-31_nature-chemistry';
const raw={
  recordType:'historical_discovery_candidate_only',
  status:'source_enumeration_complete',
  consistency:{complete:true},
  journal:'Nature Chemistry',
  range:{from:'2026-08-22',to:'2026-08-31'},
  checkedAt:'2026-10-14T00:00:00.000Z',
  candidateCount:3,
  records:[
    {doi:'10.1038/s41557-026-02227-1',title:'Cyclopropanol can function as a caged dual-functional warhead for selective electrochemical bioconjugation',
     journal:'Nature Chemistry',date:'2026-08-28',sources:['crossref','openalex'],
     citation:{year:2026,doi:'10.1038/s41557-026-02227-1'},authors:['Shan Hu']},
    {doi:'10.1038/s41557-026-02228-0',title:'A general strategy towards multicolour fluorogenic peptides for wash-free bioassays',
     journal:'Nature Chemistry',date:'2026-08-26',sources:['crossref','openalex'],
     citation:{year:2026,doi:'10.1038/s41557-026-02228-0'},authors:['Man Sing Wong']},
    {doi:'10.1038/s41557-026-02234-2',title:'Thalidomide and targeted protein degradation',
     journal:'Nature Chemistry',date:'2026-08-28',sources:['crossref','openalex'],
     citation:{year:2026,doi:'10.1038/s41557-026-02234-2'},authors:['Connor Delaney']}
  ]
};
const rawText=JSON.stringify(raw,null,2)+'\n';
const bytes=Buffer.from(rawText,'utf8');
const sha256=createHash('sha256').update(bytes).digest('hex');
const gitSha=b=>createHash('sha1').update('blob '+b.length)
  .update(Buffer.from([0])).update(b).digest('hex');
const oldQueue=buildReviewShard(raw,{
  published:new Set(),approved:new Set(),pending:new Set(),
  sourceSha256:sha256,sourceId:rootId
});
const approved=new Set([
  '10.1038/s41557-026-02227-1',
  '10.1038/s41557-026-02228-0'
]);
const newQueue=buildReviewShard(raw,{
  published:new Set(),approved,pending:new Set(),
  sourceSha256:sha256,sourceId:rootId
});
const oldQueueGitBlob=gitSha(Buffer.from(JSON.stringify(oldQueue,null,2)+'\n'));
const options={
  rawBatchText:rawText,reviewerShard:newQueue,rootId,
  expectedRawSha256:sha256,
  expectedRawGitBlobSha:gitSha(bytes),
  previousReviewerGitBlobSha:oldQueueGitBlob,
  published:new Set(),approved,pending:new Set()
};
test('whole reviewer-shard Git hash changes after real historical approvals even though source is byte-identical',()=>{
  const modern=gitSha(Buffer.from(JSON.stringify(newQueue,null,2)+'\n'));
  assert.notEqual(oldQueueGitBlob,modern);
  assert.equal(newQueue.stats.approvedAwaiting08,2);
  assert.equal(newQueue.stats.requiresTwoPassReview,1);
  assert.equal(oldQueue.stats.approvedAwaiting08,0);
  assert.deepEqual(raw.records.map(r=>r.doi).sort(),newQueue.records.map(r=>r.doi).sort());
  assert.equal(verifyHistoricalReviewerStatusRefresh(options),oldQueueGitBlob);
});
test('unchanged source SHA256 but a mutated reviewer title or status is always rejected',()=>{
  for(const mutation of [
    r=>({...r,records:r.records.map((x,i)=>i===0?{...x,title:'fake synthetic paper'}:x)}),
    r=>({...r,records:r.records.map((x,i)=>i===2?{...x,status:'already_published'}:x)}),
    r=>({...r,stats:{...r.stats,approvedAwaiting08:3}})
  ]){
    assert.throws(()=>verifyHistoricalReviewerStatusRefresh({
      ...options,reviewerShard:mutation(newQueue)
    }),/not_deterministic/);
  }
});
test('changed original source batch or forged legacy SHA cannot authorize an alternate reviewer Git blob',()=>{
  assert.throws(()=>verifyHistoricalReviewerStatusRefresh({
    ...options,rawBatchText:rawText.replace('Shan Hu','Fake Source Author')
  }),/raw_source_changed/);
  assert.throws(()=>verifyHistoricalReviewerStatusRefresh({
    ...options,expectedRawGitBlobSha:'0'.repeat(40)
  }),/raw_source_changed/);
  assert.throws(()=>verifyHistoricalReviewerStatusRefresh({
    ...options,previousReviewerGitBlobSha:'not-hash'
  }),/untrusted_authority/);
  assert.throws(()=>verifyHistoricalReviewerStatusRefresh({
    ...options,approved:new Set()
  }),/not_deterministic/);
});
