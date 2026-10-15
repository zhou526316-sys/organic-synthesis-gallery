import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reconcileQ3,CHEM_ONLINE_DATE_SCHEMA} from './historical-q3-reconciliation.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const blob=p=>{const b=readFileSync(new URL('../'+p,import.meta.url));
  return createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex')};
const datePath='audit/historical-publisher-dates/2026/chem-one-nipu-first-online-reconciled.json';
const sciencePath='audit/historical-scope-assessments/2026-10-15-chem-nipu-boundary-two-pass.json';
const dates=read(datePath),science=read(sciencePath),r=dates.rows[0],review=science.assessments[0];
const formal=read('public/toc-demand-live.json'),
      manifest=read('audit/historical-reviewed/approved-admissions.json');
const root=r.originalQ3QueueOrigin;
test('NIPU original Chem Article has publisher July 8, not July 1, without source rewrite',()=>{
  assert.equal(dates.schemaVersion,CHEM_ONLINE_DATE_SCHEMA);
  assert.equal(dates.mode,'publisher_first_online_provenance_only_not_admission');
  assert.equal(dates.recordCount,1);
  assert.equal(dates.verifiedInsideQ3,1);
  assert.equal(dates.verifiedOutsideQ3,0);
  assert.equal(dates.verifiedSourceDateConflicts,1);
  assert.equal(r.doi,'10.1016/j.chempr.2026.103145');
  assert.equal(r.sourceDate,'2026-07-01');
  assert.equal(r.publisherFirstOnlineDate,'2026-07-08');
  assert.equal(r.verifiedPublicationQuarter,'2026-Q3');
  assert.equal(r.publisherArticleType,'Research article');
  assert.equal(r.officialPublisherArticlePage,
    'https://www.sciencedirect.com/science/article/pii/S2451929426002111');
  assert.match(r.sourceRootSha256,/^[a-f0-9]{64}$/);
  assert.match(r.originalSourceBatchGitBlobSha,/^[a-f0-9]{40}$/);
  assert.match(r.reviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
  assert.equal(dates.guards.noSourceShardMutation,true);
  assert.equal(dates.guards.noOffSlotPublisherWrite,true);
});
test('independently challenged NIPU chemical-recycling route remains an evidence-specific scientific hold',()=>{
  assert.equal(science.schemaVersion,'gallery-historical-q3-chem-nipu-original-scope-pending-v1');
  assert.equal(science.dateEvidenceFile,datePath);
  assert.equal(science.dateEvidenceGitBlobSha,blob(datePath));
  assert.deepEqual(science.counts,{assessed:1,include:0,exclude:0,pending:1});
  assert.equal(review.doi,r.doi);
  assert.equal(review.date,r.publisherFirstOnlineDate);
  assert.equal(review.reviewPasses,2);
  assert.equal(review.firstPassDecision,'pending');
  assert.equal(review.challengeDecision,'pending');
  assert.equal(review.missingEvidenceMustNotMeanNoEvidenceExists,true);
  assert.ok(review.evidenceNeeded.length>=70);
  assert.ok(review.nextAction.length>=70);
  assert.notEqual(review.firstPassReason,review.independentChallengeReason);
  for(const key of ['primaryContribution','preparativeTransformation','generalityEvidence',
    'sourceEvidence','boundaryChallenge'])
    assert.ok(review.scopeAssessment[key].length>=35,key);
  assert.equal(review.reviewEvidence.stageBatchSha,r.originalSourceBatchGitBlobSha);
  assert.equal(review.reviewEvidence.sourceReviewQueueGitBlobSha,r.reviewQueueGitBlobSha);
  assert.equal(review.reviewEvidence.stageSourceSha256,r.sourceRootSha256);
  assert.equal(review.reviewEvidence.publisherArticlePage,r.officialPublisherArticlePage);
  assert.equal(review.reviewEvidence.publisherOnlineDate,r.publisherFirstOnlineDate);
  assert.equal(review.reviewEvidence.firstOnlineDateEvidence.stageApiDate,r.sourceDate);
  assert.ok(!formal.articles.some(x=>x.doi===r.doi));
  assert.ok(!manifest.accepted.some(x=>x.doi===r.doi));
  assert.ok(!manifest.pending.some(x=>x.doi===r.doi),
    'additional scientific evidence hold must not corrupt older formal date-conflict pendings');
});
function fixture(){
 return {
   state:{schema:'gallery-historical-nightly-staging-v1',
     mode:'candidate_discovery_only',completed:[root],cursor:{}},
   triage:{schemaVersion:'gallery-history-review-triage-v1',
     mode:'review_queue_only_not_publication',
     rootSummaries:{[root]:{sourceSha256:r.sourceRootSha256}}},
   shards:[{schemaVersion:'gallery-history-review-triage-v1',
     mode:'review_queue_only_not_publication',rootId:root,
     journal:'Chem',sourceSha256:r.sourceRootSha256,
     gitBlobSha:r.reviewQueueGitBlobSha,
     stats:{candidateOccurrences:1},
     records:[{doi:r.doi,title:r.title,journal:'Chem',
       date:r.sourceDate,flags:[],priority:'P3',authors:r.authors,
       sourceFamilies:r.originalQ3SourceFamilies}]
   }],
   formal:{articles:[],webpageDoiCount:0},
   manifest:{accepted:[],pending:[]},
   corrections:{items:[]},
   journals:[{name:'Chem'}],
   chemPublisherDates:dates,
   chemSciencePendingEvidence:[review],
   reviewerQueueHistoricalBlobAliasesByRoot:new Map()
 };
}
test('publisher first-online + original-science hold leave source DOI and scope pending separate from published/accepted',()=>{
  const a=fixture();
  const before=reconcileQ3({...a,chemSciencePendingEvidence:[]});
  assert.equal(before.coverage.counters.unfinishedQ3OrDateVerification,1);
  const {coverage,worklist}=reconcileQ3(a);
  assert.equal(coverage.counters.uniqueSourceDois,1);
  assert.equal(coverage.counters.sourcePublisherDateDiscrepancies,1);
  assert.equal(coverage.counters.sourcePublisherReviewedScopePending,1);
  assert.equal(coverage.counters.sourceApprovedWaiting08,0);
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
  assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
  assert.equal(worklist.publisherScopeEvidencePending.length,1);
  assert.equal(worklist.publisherScopeEvidencePending[0].doi,r.doi);
  assert.equal(worklist.totalUnreviewedCandidates,0);
});
test('forged foam first-online, source sha or missing specific evidence fail closed',()=>{
  const args=fixture();
  for(const malformed of [
    {...review,reviewEvidence:{...review.reviewEvidence,stageSourceSha256:'0'.repeat(64)}},
    {...review,reviewEvidence:{...review.reviewEvidence,publisherArticlePage:'https://fake.example'}},
    {...review,missingEvidenceMustNotMeanNoEvidenceExists:false},
    {...review,firstPassReason:'incomplete'},
    {...review,evidenceNeeded:'unknown'}
  ])assert.throws(()=>reconcileQ3({...args,chemSciencePendingEvidence:[malformed]}),
    /q3_chem_scientific_pending_provenance_invalid/);
  const wrongDate={...dates,rows:[{...r,publisherFirstOnlineDate:'2026-07-01'}]};
  assert.throws(()=>reconcileQ3({...args,chemPublisherDates:wrongDate}),
    /q3_chem_publisher_date_provenance_conflict/);
});
