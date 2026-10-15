import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reconcileQ3,CHEM_ONLINE_DATE_SCHEMA} from './historical-q3-reconciliation.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=p=>{const b=readFileSync(new URL('../'+p,import.meta.url));return createHash('sha1')
  .update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex');};
const datesFile='audit/historical-publisher-dates/2026/chem-three-more-q2-q3-first-online-20261015.json';
const scienceFile='audit/historical-scope-assessments/2026-10-15-chem-plasma-amine-ethylene-glycol-two-pass.json';
const dates=read(datesFile),science=read(scienceFile);
const expected=[
  ['10.1016/j.chempr.2026.103074','2026-09-01','2026-06-02','2026-Q2','S2451929426001403'],
  ['10.1016/j.chempr.2026.103136','2026-07-01','2026-07-10','2026-Q3','S2451929426002020'],
  ['10.1016/j.chempr.2026.103194','2026-07-01','2026-07-30','2026-Q3','S2451929426002603']
];
test('three original Chem article publisher dates bind to frozen batch without false Q3 issue month',()=>{
 assert.equal(dates.schemaVersion,CHEM_ONLINE_DATE_SCHEMA);
 assert.equal(dates.mode,'publisher_first_online_provenance_only_not_admission');
 assert.equal(dates.recordCount,3);assert.equal(dates.verifiedOutsideQ3,1);
 assert.equal(dates.verifiedInsideQ3,2);assert.equal(dates.verifiedSourceDateConflicts,3);
 assert.deepEqual(dates.rows.map(x=>[x.doi,x.sourceDate,x.publisherFirstOnlineDate,
   x.verifiedPublicationQuarter,x.officialPublisherArticlePage.split('/').at(-1)]),expected);
 assert.equal(dates.guards.noSourceShardMutation,true);
 assert.equal(dates.guards.noDateEvidenceAsAutomaticAdmission,true);
 assert.equal(dates.guards.noOffSlotPublisherWrite,true);
 for(const row of dates.rows){
   assert.equal(row.publisherArticleType,'Research article');
   assert.equal(row.academicScopeDecision,'not_made_by_publication_date_evidence');
   assert.equal(row.originalDateFrozenAndUnmodified,true);
   assert.equal(row.publisherEvidenceDateOverrulesSourceForQuarter,true);
   assert.match(row.sourceRootSha256,/^[a-f0-9]{64}$/);
   assert.match(row.reviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
   assert.match(row.originalSourceBatchGitBlobSha,/^[a-f0-9]{40}$/);
   assert.equal(row.doiResolver,'https://doi.org/'+row.doi);
   assert.equal(row.reviewQueuePath,'audit/historical-staging/review-queue/'+row.originalQ3QueueOrigin+'.json');
   assert.equal(row.originalSourceBatchPath,'audit/historical-staging/batches/'+row.originalQ3QueueOrigin+'.json');
 }
});
test('plasma methyl/ethylamine and ethylene glycol are real synthetic outputs but scholarly evidence holds, not admissions',()=>{
 assert.equal(science.dateEvidenceGitBlobSha,sha(datesFile));
 assert.deepEqual(science.counts,{assessed:2,include:0,exclude:0,pending:2});
 assert.equal(science.assessments.length,2);
 for(const a of science.assessments){
   const d=dates.rows.find(x=>x.doi===a.doi);
   assert.ok(d);assert.equal(d.verifiedPublicationQuarter,'2026-Q3');
   assert.equal(a.publisherArticleType,'Research article');
   assert.equal(a.date,d.publisherFirstOnlineDate);assert.equal(a.title,d.title);
   assert.equal(a.decision,'pending');assert.equal(a.firstPassDecision,'pending');
   assert.equal(a.challengeDecision,'pending');assert.equal(a.reviewPasses,2);
   assert.notEqual(a.firstPassReason,a.independentChallengeReason);
   assert.ok(a.firstPassReason.length>80);assert.ok(a.independentChallengeReason.length>80);
   assert.ok(a.evidenceNeeded.length>70);assert.ok(a.nextAction.length>70);
   assert.equal(a.missingEvidenceMustNotMeanNoEvidenceExists,true);
   assert.equal(a.pendingNotAdmitted,true);
   assert.equal(a.reviewEvidence.stageBatchSha,d.originalSourceBatchGitBlobSha);
   assert.equal(a.reviewEvidence.sourceReviewQueueGitBlobSha,d.reviewQueueGitBlobSha);
   assert.equal(a.reviewEvidence.stageSourceSha256,d.sourceRootSha256);
   assert.equal(a.reviewEvidence.publisherOnlineDate,d.publisherFirstOnlineDate);
   for(const k of ['primaryContribution','preparativeTransformation','generalityEvidence',
       'sourceEvidence','boundaryChallenge'])assert.ok(a.scopeAssessment[k].length>60);
 }
 assert.equal(science.guards.noFormalPublication,true);
 assert.equal(science.guards.full16JournalResearchIssueClosureUnknown,true);
});
function fixture(){
 const rs=new Map();
 for(const r of dates.rows){
   const prev=rs.get(r.originalQ3QueueOrigin)||[];
   prev.push({doi:r.doi,journal:'Chem',title:r.title,date:r.sourceDate,
     authors:r.authors,sourceFamilies:r.originalQ3SourceFamilies,flags:[],priority:'P1'});
   rs.set(r.originalQ3QueueOrigin,prev);
 }
 const shards=[...rs.entries()].map(([rootId,records])=>{
   const row=dates.rows.find(r=>r.originalQ3QueueOrigin===rootId);
   return {rootId,journal:'Chem',schemaVersion:'gallery-history-review-triage-v1',
     mode:'review_queue_only_not_publication',
     sourceSha256:row.sourceRootSha256,gitBlobSha:row.reviewQueueGitBlobSha,
     stats:{candidateOccurrences:records.length},records};
 });
 return {state:{schema:'gallery-historical-nightly-staging-v1',mode:'candidate_discovery_only',
         completed:shards.map(s=>s.rootId),cursor:{}},
   triage:{schemaVersion:'gallery-history-review-triage-v1',
     mode:'review_queue_only_not_publication',rootSummaries:Object.fromEntries(
       shards.map(s=>[s.rootId,{sourceSha256:s.sourceSha256}]))},
   shards,formal:{articles:[],webpageDoiCount:0},manifest:{accepted:[],pending:[]},
   corrections:{items:[]},journals:[{name:'Chem'}],chemPublisherDates:dates,
   chemSciencePendingEvidence:science.assessments,
   reviewerQueueHistoricalBlobAliasesByRoot:new Map()};
}
test('read-only staging-only Q3 worklist counts two scientific holds and Q2 outside, leaves all three source DOI',()=>{
 const {coverage,worklist}=reconcileQ3(fixture());
 assert.equal(coverage.counters.uniqueSourceDois,3);
 assert.equal(coverage.counters.sourcePublisherDateDiscrepancies,3);
 assert.equal(coverage.counters.sourcePublisherVerifiedOutsideQ3,1);
 assert.equal(coverage.counters.sourcePublisherReviewedScopePending,2);
 assert.equal(coverage.counters.sourcePublisherReviewedScopeExcluded,0);
 assert.equal(coverage.counters.sourceApprovedWaiting08,0);
 assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
 assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
 assert.equal(worklist.totalUnreviewedCandidates,0);
 assert.deepEqual(worklist.publisherOnlineDateCorrections.map(x=>x.doi),expected.map(x=>x[0]));
 assert.deepEqual(worklist.publisherScopeEvidencePending.map(x=>x.doi),expected.slice(1).map(x=>x[0]));
});
test('tampering with Chem publisher date, frozen source SHA, and science decision fails closed',()=>{
 const args=fixture();
 const edits=[
   [0,{publisherFirstOnlineDate:'2026-09-01'}],
   [1,{sourceRootSha256:'0'.repeat(64)}],
   [2,{officialPublisherArticlePage:'https://wrong.example/S2451929426002603'}]
 ];
 for(const [i,mod] of edits)assert.throws(()=>reconcileQ3({...args,
   chemPublisherDates:{...dates,rows:dates.rows.map((r,j)=>j===i?{...r,...mod}:r)}}),
   /q3_chem_publisher_date_provenance_conflict/);
 assert.throws(()=>reconcileQ3({...args,
   chemSciencePendingEvidence:science.assessments.map((a,i)=>i===0?{...a,decision:'include'}:a)}),
   /q3_chem_scientific_pending_provenance_invalid/);
});
