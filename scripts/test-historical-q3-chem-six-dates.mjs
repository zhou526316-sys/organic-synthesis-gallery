import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileQ3,CHEM_ONLINE_DATE_SCHEMA} from './historical-q3-reconciliation.mjs';
import {validateHistoricalApproval} from './lib/historical-admission.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const old=read('audit/historical-publisher-dates/2026/chem-five-first-online-reconciled.json');
const six=read('audit/historical-publisher-dates/2026/chem-six-additional-online-reconciled.json');
const manifest=read('audit/historical-reviewed/approved-admissions.json');
const formal=read('public/toc-demand-live.json');
const corrections=read('audit/literature-scope-corrections.json');
const ids=new Set(six.rows.map(x=>x.doi));
const approved=six.rows.filter(x=>x.verifiedPublicationQuarter==='2026-Q3');
const preQuarter=six.rows.filter(x=>x.verifiedPublicationQuarter!=='2026-Q3');
const approvedMap=new Map(manifest.accepted.map(x=>[x.doi,x]));
test('new six official Chem dates are distinct from five immutable earlier corrections',()=>{
  assert.equal(six.schemaVersion,CHEM_ONLINE_DATE_SCHEMA);
  assert.equal(six.mode,'publisher_first_online_provenance_only_not_admission');
  assert.equal(six.recordCount,6);
  assert.equal(six.verifiedInsideQ3,3);
  assert.equal(six.verifiedOutsideQ3,3);
  assert.equal(six.verifiedQ1OutsideQ3,2);
  assert.equal(six.verifiedQ2OutsideQ3,1);
  assert.equal(six.rows.find(x=>x.doi==='10.1016/j.chempr.2026.103022').verifiedPublicationQuarter,'2026-Q2');
  assert.equal(six.verifiedSourceDateConflicts,6);
  assert.equal(ids.size,6);
  assert.equal(old.rows.length,5);
  assert.ok(six.rows.every(x=>!old.rows.some(y=>y.doi===x.doi)));
  assert.ok(six.rows.every(x=>x.originalDateFrozenAndUnmodified
    &&x.publisherEvidenceDateOverrulesSourceForQuarter));
});
test('each exact DOI has publisher PII, immutable source date, real raw reviewer SHA and unchanged source family',()=>{
  for(const r of six.rows){
    assert.match(r.doi,/^10\.1016\/j\.chempr\.2026\.\d{6}$/);
    assert.equal(r.doiResolver,'https://doi.org/'+r.doi);
    assert.match(r.officialPublisherArticlePage,
      /^https:\/\/www\.sciencedirect\.com\/science\/article\/pii\/S2451929426\d{6}$/);
    assert.equal(r.reviewQueuePath,'audit/historical-staging/review-queue/'+r.originalQ3QueueOrigin+'.json');
    assert.equal(r.originalSourceBatchPath,'audit/historical-staging/batches/'+r.originalQ3QueueOrigin+'.json');
    assert.match(r.sourceRootSha256,/^[a-f0-9]{64}$/);
    assert.match(r.reviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
    assert.match(r.originalSourceBatchGitBlobSha,/^[a-f0-9]{40}$/);
    assert.match(r.sourceDate,/^2026-(07|08|09)-\d\d$/);
    assert.match(r.publisherFirstOnlineDate,/^2026-\d\d-\d\d$/);
    assert.notEqual(r.sourceDate,r.publisherFirstOnlineDate);
    assert.equal(r.publisherArticleType,'Research article');
    assert.ok(r.authors.length>=3);
    assert.equal(r.bibliographic.doi,r.doi);
  }
});
test('three earlier-2026 actual-online Articles are not Q3 admissions',()=>{
  assert.deepEqual(preQuarter.map(x=>[x.doi,x.publisherFirstOnlineDate]).sort(),[
    ['10.1016/j.chempr.2026.102952','2026-03-19'],
    ['10.1016/j.chempr.2026.103002','2026-03-30'],
    ['10.1016/j.chempr.2026.103022','2026-04-14']
  ]);
  const publicSet=new Set(formal.articles.map(x=>x.doi));
  for(const row of preQuarter){
    assert.ok(!approvedMap.has(row.doi),'pre-Q3 paper cannot be Q3 admission '+row.doi);
    assert.ok(!publicSet.has(row.doi),'pre-Q3 paper cannot be inserted as wrong Q3 article '+row.doi);
  }
});
test('three official Q3 original synthetic methods have independently reviewed science and 08-only release authority',()=>{
  assert.deepEqual(approved.map(x=>[x.doi,x.publisherFirstOnlineDate]).sort(),[
    ['10.1016/j.chempr.2026.103186','2026-07-29'],
    ['10.1016/j.chempr.2026.103204','2026-08-18'],
    ['10.1016/j.chempr.2026.103257','2026-09-17']
  ]);
  assert.ok(manifest.summary.include>=125);
  assert.equal(manifest.summary.pending,2);
  assert.equal(manifest.nextEligiblePublicationSlot,'2026-10-16T08:00:00+08:00');
  assert.equal(validateHistoricalApproval(manifest).length,manifest.summary.include);
  for(const src of approved){
    const x=approvedMap.get(src.doi);
    assert.ok(x,'missing independently admitted DOI '+src.doi);
    assert.equal(x.date,src.publisherFirstOnlineDate);
    assert.equal(x.reviewEvidence.publisherOnlineDate,src.publisherFirstOnlineDate);
    assert.equal(x.reviewEvidence.firstOnlineDateEvidence.stageApiDate,src.sourceDate);
    assert.equal(x.reviewEvidence.stageBatchSha,src.originalSourceBatchGitBlobSha);
    assert.equal(x.reviewEvidence.sourceReviewQueueGitBlobSha,src.reviewQueueGitBlobSha);
    assert.equal(x.reviewEvidence.stageSourceSha256,src.sourceRootSha256);
    assert.equal(x.reviewPasses,2);
    assert.equal(x.challengeDecision,'include');
    assert.equal(x.mediaPolicy,'toc_only');
    assert.equal(x.new,false);
    assert.equal(x.ingestionChannel,'historical_backfill');
    assert.equal(x.addedDate,'');
    assert.ok(x.authors.length>=3);
    for(const k of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
      assert.ok(x.scopeAssessment[k].length>=35);
  }
});
function mock(){
 const buckets=new Map();
 for(const x of six.rows){
   const root=x.originalQ3QueueOrigin;
   if(!buckets.has(root))buckets.set(root,[]);
   buckets.get(root).push(x);
 }
 const shards=[...buckets.entries()].map(([rootId,rows])=>({
   schemaVersion:'gallery-history-review-triage-v1',
   mode:'review_queue_only_not_publication',
   rootId,journal:'Chem',sourceSha256:rows[0].sourceRootSha256,
   gitBlobSha:rows[0].reviewQueueGitBlobSha,
   stats:{candidateOccurrences:rows.length},
   records:rows.map(r=>({doi:r.doi,title:r.title,journal:'Chem',date:r.sourceDate,
      flags:[],priority:'P3',authors:r.authors,sourceFamilies:r.originalQ3SourceFamilies}))
 }));
 const rootSummaries=Object.fromEntries(shards.map(x=>[x.rootId,{sourceSha256:x.sourceSha256}]));
 return {state:{schema:'gallery-historical-nightly-staging-v1',mode:'candidate_discovery_only',
      completed:shards.map(x=>x.rootId),cursor:{}},
   triage:{schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',rootSummaries},
   shards,formal:{articles:[],webpageDoiCount:0},
   manifest:{accepted:approved.map(x=>approvedMap.get(x.doi)),pending:[]},
   corrections:{items:[]},journals:[{name:'Chem'}],
   chemPublisherDates:{...six,rows:six.rows},
   reviewerQueueHistoricalBlobAliasesByRoot:new Map()
 };
}
test('six DOI remain in the source census; Q1 misdated are removed from Q3 unfinished, Q3 approved stay 08-only',()=>{
 const {coverage,worklist}=reconcileQ3(mock());
 assert.equal(coverage.counters.uniqueSourceDois,6);
 assert.equal(coverage.counters.sourcePublisherDateDiscrepancies,6);
 assert.equal(coverage.counters.sourcePublisherVerifiedOutsideQ3,3);
 assert.equal(coverage.counters.sourceApprovedWaiting08,3);
 assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
 assert.equal(coverage.counters.formalQ3Count,0);
 assert.equal(coverage.counters.reviewedQ3Waiting08,3);
 assert.equal(worklist.totalUnreviewedCandidates,0);
 assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
});
test('a fabricated date, duplicate DOI and fake Q1 admission must fail closed',()=>{
 const x=mock();
 assert.throws(()=>reconcileQ3({...x,chemPublisherDates:{...six,
    rows:[{...six.rows[0],publisherFirstOnlineDate:six.rows[0].sourceDate},...six.rows.slice(1)]}}),
    /q3_chem_publisher_date_provenance_conflict/);
 assert.throws(()=>reconcileQ3({...x,chemPublisherDates:{...six,
    rows:[...six.rows,six.rows[0]]}}),
    /q3_chem_publisher_date_provenance_conflict/);
 assert.throws(()=>reconcileQ3({...x,manifest:{accepted:[
    ...x.manifest.accepted,
    {...x.manifest.accepted[0],doi:preQuarter[0].doi,date:preQuarter[0].publisherFirstOnlineDate}
 ] ,pending:[]}}),/q3_chem_pre_q3_original_cannot_be_admitted_as_q3/);
});
