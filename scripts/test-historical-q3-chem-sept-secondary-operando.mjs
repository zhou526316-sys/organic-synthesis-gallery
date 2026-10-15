import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reconcileQ3,CHEM_ONLINE_DATE_SCHEMA,PUBLISHER_NONRESEARCH_SCHEMA} from './historical-q3-reconciliation.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const gitBlob=p=>{const b=readFileSync(new URL('../'+p,import.meta.url));return createHash('sha1')
  .update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex');};
const nonoriginalPath='audit/historical-reviewed/q3-publisher-nonresearch-exclusions.json';
const datePath='audit/historical-publisher-dates/2026/chem-operando-photoluminescence-20261015.json';
const sciencePath='audit/historical-scope-assessments/2026-10-15-chem-single-qd-operando-two-pass.json';
const reviewed=read(nonoriginalPath),dates=read(datePath),science=read(sciencePath);
const known=[
  ['10.1016/j.chempr.2026.103244','Review','2026-09-24','S2451929426003104'],
  ['10.1016/j.chempr.2026.103254','Perspective','2026-09-25','S2451929426003207'],
  ['10.1016/j.chempr.2026.103264','Perspective','2026-09-24','S245192942600330X']
];
const selected=known.map(([doi])=>reviewed.reviewed.find(x=>x.doi===doi));
test('three exact Chem source DOI are documented publisher Review/Perspective, not original research',()=>{
 assert.equal(reviewed.schemaVersion,PUBLISHER_NONRESEARCH_SCHEMA);
 assert.equal(reviewed.mode,'publisher_verified_non_original_doi_only_not_publication');
 assert.equal(reviewed.chemSept2026PublisherKnownOnlineSecondaryCohort?.count,3);
 assert.equal(reviewed.chemSept2026PublisherKnownOnlineSecondaryCohort?.reviewQueueGitBlobSha,
   '2b27bf95e5d71bc7f530d301e211efc79c3aeb24');
 assert.equal(new Set(reviewed.reviewed.map(r=>r.doi)).size,reviewed.reviewed.length);
 for(let i=0;i<known.length;i++){
   const [doi,type,date,pii]=known[i],x=selected[i],ev=x?.reviewEvidence;
   assert.ok(x);assert.equal(x.publisherArticleType,type);
   assert.equal(x.date,date);assert.equal(x.decision,'exclude');
   assert.equal(x.firstPassDecision,'exclude');assert.equal(x.challengeDecision,'exclude');
   assert.equal(x.reviewPasses,2);assert.ok(x.firstPassReason.length>=80);
   assert.ok(x.independentChallengeReason.length>=80);
   assert.notEqual(x.firstPassReason,x.independentChallengeReason);
   assert.equal(ev.publisherPage,'https://www.sciencedirect.com/science/article/pii/'+pii);
   assert.equal(ev.publisherArticleDate,date);assert.equal(ev.publisherFirstOnlineDateVerified,true);
   assert.equal(ev.sourceDateNotPublisherFirstOnline,false);
   assert.equal(ev.publisherIssueDate,null);
   assert.equal(ev.publisherPii,pii);
   assert.equal(ev.frozenSourceDate,date);
   assert.equal(ev.sourceRootId,'2026-09-22_2026-09-30_chem');
   assert.equal(ev.stageSourceSha256,'a4d0fc7868cd95b14a923cefff8f1ab6c376d60c99247418957ef4df586a3b2d');
   assert.equal(ev.stageBatchGitBlobSha,'085438b03d94aa947b0d6caf0de34654698cf22c');
   assert.equal(ev.sourceReviewQueueGitBlobSha,'2b27bf95e5d71bc7f530d301e211efc79c3aeb24');
   assert.deepEqual(ev.sourceFamilies,['openalex']);
   assert.equal(ev.underlyingOriginalResearchDoi,null);
   assert.equal(x.guards.noFormalPublication,true);
 }
});
test('original Chem 103199 online date and two-pass science exclusion are separate and source-bound',()=>{
 assert.equal(dates.schemaVersion,CHEM_ONLINE_DATE_SCHEMA);
 assert.equal(dates.recordCount,1);assert.equal(dates.verifiedInsideQ3,1);
 assert.equal(dates.verifiedSourceDateConflicts,1);
 const d=dates.rows[0],a=science.assessments[0];
 assert.equal(d.doi,'10.1016/j.chempr.2026.103199');
 assert.equal(d.publisherFirstOnlineDate,'2026-08-13');
 assert.equal(d.sourceDate,'2026-08-01');
 assert.equal(d.verifiedPublicationQuarter,'2026-Q3');
 assert.equal(d.officialPublisherArticlePage,'https://www.sciencedirect.com/science/article/pii/S2451929426002652');
 assert.equal(d.sourceRootSha256,'26770f50e9727826aa1d8171817c7f6ad3ff27376721eb2684efd2d94e2a50aa');
 assert.equal(d.reviewQueueGitBlobSha,'26c5304d84ab4f5b7c470daa427d0249b6f524a5');
 assert.equal(d.originalSourceBatchGitBlobSha,'6ea589ffc11c757ffd5e72b02d931e88e4778b68');
 assert.equal(science.dateEvidenceGitBlobSha,gitBlob(datePath));
 assert.deepEqual(science.counts,{assessed:1,include:0,exclude:1,pending:0});
 assert.equal(a.decision,'exclude');assert.equal(a.publisherArticleType,'Research article');
 assert.equal(a.reviewPasses,2);assert.equal(a.firstPassDecision,'exclude');
 assert.equal(a.challengeDecision,'exclude');
 assert.ok(a.firstPassReason.length>80);assert.ok(a.independentChallengeReason.length>80);
 assert.notEqual(a.firstPassReason,a.independentChallengeReason);
 for(const k of ['primaryContribution','preparativeTransformation','generalityEvidence',
   'sourceEvidence','boundaryChallenge'])assert.ok(a.scopeAssessment[k].length>70);
 assert.equal(a.reviewEvidence.publisherOnlineDate,d.publisherFirstOnlineDate);
 assert.equal(a.reviewEvidence.stageBatchSha,d.originalSourceBatchGitBlobSha);
 assert.equal(a.reviewEvidence.sourceReviewQueueGitBlobSha,d.reviewQueueGitBlobSha);
 assert.equal(a.reviewEvidence.stageSourceSha256,d.sourceRootSha256);
 assert.equal(science.guards.researchArticleNotReclassifiedAsReview,true);
});
function fixture(){
 const perRoot=new Map();
 for(const r of selected){
   const ev=r.reviewEvidence,root=ev.sourceRootId;
   const a=perRoot.get(root)||[];
   a.push({doi:r.doi,title:r.title,date:r.date,journal:'Chem',sourceFamilies:ev.sourceFamilies,
     flags:[],priority:'P1',authors:['Publisher Author']});
   perRoot.set(root,a);
 }
 for(const r of dates.rows){
   const root=r.originalQ3QueueOrigin,a=perRoot.get(root)||[];
   a.push({doi:r.doi,title:r.title,date:r.sourceDate,journal:'Chem',
     sourceFamilies:r.originalQ3SourceFamilies,flags:[],priority:'P1',authors:r.authors});
   perRoot.set(root,a);
 }
 const shards=[...perRoot].map(([rootId,records])=>{
   const secondary=selected.find(x=>x.reviewEvidence.sourceRootId===rootId);
   const sourceSha256=secondary?secondary.reviewEvidence.stageSourceSha256:dates.rows[0].sourceRootSha256;
   const gitBlobSha=secondary?secondary.reviewEvidence.sourceReviewQueueGitBlobSha:dates.rows[0].reviewQueueGitBlobSha;
   return {rootId,journal:'Chem',schemaVersion:'gallery-history-review-triage-v1',
     mode:'review_queue_only_not_publication',sourceSha256,gitBlobSha,
     stats:{candidateOccurrences:records.length},records};
 });
 return {state:{schema:'gallery-historical-nightly-staging-v1',mode:'candidate_discovery_only',
           completed:shards.map(s=>s.rootId),cursor:{}},
   triage:{schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
      rootSummaries:Object.fromEntries(shards.map(s=>[s.rootId,{sourceSha256:s.sourceSha256}]))},
   shards,formal:{webpageDoiCount:0,articles:[]},manifest:{accepted:[],pending:[]},corrections:{items:[]},
   journals:[{name:'Chem'}],publisherNonResearch:{schemaVersion:PUBLISHER_NONRESEARCH_SCHEMA,
     mode:'publisher_verified_non_original_doi_only_not_publication',reviewed:selected},
   chemPublisherDates:dates,chemScienceExcludedEvidence:science.assessments,
   reviewerQueueHistoricalBlobAliasesByRoot:new Map()};
}
test('reconciler separates three secondary DOI and one original science exclude; no source DOI disappears',()=>{
 const {coverage,worklist}=reconcileQ3(fixture());
 assert.equal(coverage.counters.uniqueSourceDois,4);
 assert.equal(coverage.counters.sourcePublisherNonResearchExcluded,3);
 assert.equal(coverage.counters.sourcePublisherReviewedScopeExcluded,1);
 assert.equal(coverage.counters.sourcePublisherReviewedScopePending,0);
 assert.equal(coverage.counters.sourcePublisherDateDiscrepancies,1);
 assert.equal(coverage.counters.sourcePublisherVerifiedOutsideQ3,0);
 assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
 assert.equal(coverage.counters.sourceApprovedWaiting08,0);
 assert.equal(worklist.totalUnreviewedCandidates,0);
 assert.deepEqual(worklist.publisherOnlineDateCorrections.map(x=>x.doi),
   ['10.1016/j.chempr.2026.103199']);
 assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
});
test('wrong DOI, forged date, false publisher type or missing scientific proof must fail closed',()=>{
 const args=fixture(),newPub=x=>({...args.publisherNonResearch,
   reviewed:args.publisherNonResearch.reviewed.map((a,i)=>i===0?x:a)});
 const original=args.publisherNonResearch.reviewed[0];
 for(const ev of [
   {...original.reviewEvidence,publisherArticleDate:'2026-09-25'},
   {...original.reviewEvidence,publisherPii:'S2451929426009999'},
   {...original.reviewEvidence,sourceReviewQueueGitBlobSha:'0'.repeat(40)},
   {...original.reviewEvidence,publisherFirstOnlineDateVerified:false}
 ])assert.throws(()=>reconcileQ3({...args,publisherNonResearch:newPub({...original,reviewEvidence:ev})}),
   /q3_nonresearch_publisher_evidence_invalid/);
 assert.throws(()=>reconcileQ3({...args,chemPublisherDates:{...dates,
   rows:[{...dates.rows[0],publisherFirstOnlineDate:'2026-08-01'}]}}),
   /q3_chem_publisher_date_provenance_conflict/);
 assert.throws(()=>reconcileQ3({...args,chemScienceExcludedEvidence:[{...science.assessments[0],decision:'include'}]}),
   /q3_chem_scientific_exclusion_provenance_invalid/);
});
