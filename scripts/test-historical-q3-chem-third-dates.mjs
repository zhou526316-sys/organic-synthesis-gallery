import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileQ3,CHEM_ONLINE_DATE_SCHEMA} from './historical-q3-reconciliation.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const proof=read('audit/historical-publisher-dates/2026/chem-four-third-online-reconciled.json');
const first=read('audit/historical-publisher-dates/2026/chem-five-first-online-reconciled.json');
const second=read('audit/historical-publisher-dates/2026/chem-six-additional-online-reconciled.json');
const catalog=read('public/toc-demand-live.json');
const approved=read('audit/historical-reviewed/approved-admissions.json');
const expected=[
  ['10.1016/j.chempr.2026.103000','2026-03-30','2026-09-01','2026-Q1'],
  ['10.1016/j.chempr.2026.103162','2026-07-22','2026-07-01','2026-Q3'],
  ['10.1016/j.chempr.2026.103205','2026-08-20','2026-08-01','2026-Q3'],
  ['10.1016/j.chempr.2026.103241','2026-09-11','2026-09-01','2026-Q3']
];
test('four further publisher dates preserve Q1/Q3 partitions and disjoint prior evidence',()=>{
  assert.equal(proof.schemaVersion,CHEM_ONLINE_DATE_SCHEMA);
  assert.equal(proof.mode,'publisher_first_online_provenance_only_not_admission');
  assert.equal(proof.recordCount,4);
  assert.equal(proof.verifiedInsideQ3,3);
  assert.equal(proof.verifiedOutsideQ3,1);
  assert.equal(proof.verifiedSourceDateConflicts,4);
  assert.deepEqual(proof.rows.map(x=>[
    x.doi,x.publisherFirstOnlineDate,x.sourceDate,x.verifiedPublicationQuarter]),expected);
  const prev=new Set([...first.rows,...second.rows].map(x=>x.doi));
  assert.equal(proof.rows.filter(x=>prev.has(x.doi)).length,0);
  assert.equal(new Set(proof.rows.map(x=>x.doi)).size,4);
  assert.equal(proof.guards.noOffSlotPublisherWrite,true);
  assert.equal(proof.guards.noSourceShardMutation,true);
});
test('DOI-exact publisher PII and frozen source fingerprint are mandatory',()=>{
  const previous=[...first.rows,...second.rows];
  for(const x of proof.rows){
    assert.equal(x.doiResolver,'https://doi.org/'+x.doi);
    assert.match(x.officialPublisherArticlePage,
      /^https:\/\/www\.sciencedirect\.com\/science\/article\/pii\/S2451929426\d{6}$/);
    assert.equal(x.publisherArticleType,'Research article');
    assert.equal(x.originalDateFrozenAndUnmodified,true);
    assert.equal(x.publisherEvidenceDateOverrulesSourceForQuarter,true);
    assert.equal(x.reviewQueuePath,'audit/historical-staging/review-queue/'+x.originalQ3QueueOrigin+'.json');
    assert.equal(x.originalSourceBatchPath,'audit/historical-staging/batches/'+x.originalQ3QueueOrigin+'.json');
    assert.match(x.sourceRootSha256,/^[0-9a-f]{64}$/);
    assert.match(x.reviewQueueGitBlobSha,/^[0-9a-f]{40}$/);
    assert.match(x.originalSourceBatchGitBlobSha,/^[0-9a-f]{40}$/);
    const older=previous.find(y=>y.originalQ3QueueOrigin===x.originalQ3QueueOrigin);
    if(older){
      assert.equal(x.sourceRootSha256,older.sourceRootSha256);
      assert.equal(x.originalSourceBatchGitBlobSha,older.originalSourceBatchGitBlobSha);
    }
    assert.equal(x.bibliographic.doi,x.doi);
  }
});
test('publisher first-online evidence alone admits nothing; two later science-reviewed Q3 DOI are independently approved',()=>{
  const cat=new Set(catalog.articles.map(x=>x.doi));
  const acc=new Set(approved.accepted.map(x=>x.doi));
  const independentlyReviewed=new Set(approved.chemThirdReviewedOriginals?.acceptedDois||[]);
  assert.deepEqual(independentlyReviewed,new Set([
    '10.1016/j.chempr.2026.103205',
    '10.1016/j.chempr.2026.103241'
  ]));
  for(const x of proof.rows){
    // Date-only proof cannot admit. A separately two-pass-approved DOI
    // may legitimately have been published later by the fixed 08:00 writer.
    if(cat.has(x.doi)){
      assert.ok(independentlyReviewed.has(x.doi),'date-only DOI must not enter formal catalog: '+x.doi);
      assert.ok(acc.has(x.doi),'formal DOI requires science-reviewed manifest: '+x.doi);
      const card=catalog.articles.find(v=>v.doi===x.doi);
      assert.equal(card?.ingestionChannel,'historical_backfill',x.doi);
      assert.equal(card?.mediaPolicy,x.publisherFirstOnlineDate<'2026-07-01'?'metadata_only':'toc_only',x.doi);
      assert.equal(card?.addedDate,'',x.doi);
      assert.notEqual(card?.new,true,x.doi);
      assert.equal(card?.date,x.publisherFirstOnlineDate,x.doi);
    }
    assert.equal(acc.has(x.doi),independentlyReviewed.has(x.doi));
    assert.equal(x.academicScopeDecision,'not_made_by_publication_date_evidence');
  }
});
function fixture(){
 const group=new Map();
 for(const x of proof.rows){
   const id=x.originalQ3QueueOrigin;
   if(!group.has(id))group.set(id,[]);
   group.get(id).push(x);
 }
 const shards=[...group].map(([rootId,records])=>({
   schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
   rootId,journal:'Chem',sourceSha256:records[0].sourceRootSha256,
   gitBlobSha:records[0].reviewQueueGitBlobSha,
   stats:{candidateOccurrences:records.length},
   records:records.map(x=>({
     doi:x.doi,title:x.title,journal:'Chem',date:x.sourceDate,
     authors:x.authors,flags:[],priority:'P2',sourceFamilies:x.originalQ3SourceFamilies
   }))
 }));
 return {state:{schema:'gallery-historical-nightly-staging-v1',mode:'candidate_discovery_only',
      completed:shards.map(x=>x.rootId),cursor:{}},
   triage:{schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
     rootSummaries:Object.fromEntries(shards.map(x=>[x.rootId,{sourceSha256:x.sourceSha256}]))},
   shards,formal:{articles:[],webpageDoiCount:0},
   manifest:{accepted:[],pending:[]},corrections:{items:[]},journals:[{name:'Chem'}],
   chemPublisherDates:proof,reviewerQueueHistoricalBlobAliasesByRoot:new Map()};
}
test('date corrections keep four source DOI; exclude one Q1 but preserve Q3 unfinished',()=>{
  const args=fixture();
  const before=reconcileQ3({...args,chemPublisherDates:{
    schemaVersion:CHEM_ONLINE_DATE_SCHEMA,
    mode:'publisher_first_online_provenance_only_not_admission',rows:[]
  }});
  const {coverage,worklist}=reconcileQ3(args);
  assert.equal(coverage.counters.uniqueSourceDois,4);
  assert.equal(coverage.counters.sourcePublisherDateDiscrepancies,4);
  assert.equal(coverage.counters.sourcePublisherVerifiedOutsideQ3,1);
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,3);
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,
    before.coverage.counters.unfinishedQ3OrDateVerification-1);
  assert.deepEqual(new Set(worklist.rows.map(x=>x.doi)),new Set(expected.slice(1).map(x=>x[0])));
  assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
  assert.equal(worklist.noAutomaticAcademicDecision,true);
});
test('fabricated publisher DOI/date, overlap, source fingerprints and cloned entries fail closed',()=>{
 const args=fixture();
 const change=(idx,patch)=>({...proof,rows:proof.rows.map((x,i)=>i===idx?{...x,...patch}:x)});
 for(const [idx,patch] of [
   [0,{officialPublisherArticlePage:'https://another.example/10.1016/j.chempr.2026.103000'}],
   [0,{doiResolver:'https://doi.org/10.1016/j.chempr.2026.103162'}],
   [1,{sourceDate:'2026-07-02'}],
   [2,{reviewQueueGitBlobSha:'0'.repeat(40)}],
   [3,{sourceRootSha256:'0'.repeat(64)}],
   [3,{publisherFirstOnlineDate:'2026-09-01'}]
 ]){
   assert.throws(()=>reconcileQ3({...args,chemPublisherDates:change(idx,patch)}),
     /q3_chem_publisher_date_provenance_conflict/);
 }
 assert.throws(()=>reconcileQ3({...args,chemPublisherDates:{
   ...proof,rows:[...proof.rows,proof.rows[0]]
 }}),/q3_chem_publisher_date_provenance_conflict/);
});


test('an unreviewed Q3 date may not forge formal release or accepted science',()=>{
  const args=fixture(),paper=proof.rows[1];
  assert.throws(()=>reconcileQ3({...args,
    manifest:{accepted:[{doi:paper.doi,date:paper.publisherFirstOnlineDate,
      journal:'Chem',decision:'include',reviewPasses:2}],pending:[]}}),
    /q3_chem_date_conflict_missing_approved_science/);
  assert.throws(()=>reconcileQ3({...args,
    formal:{articles:[{doi:paper.doi,journal:'Chem',date:paper.publisherFirstOnlineDate}],
      webpageDoiCount:1}}),
    /q3_chem_date_proof_unreviewed_must_not_claim_admission/);
});
