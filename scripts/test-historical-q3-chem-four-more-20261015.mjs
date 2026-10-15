import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reconcileQ3,CHEM_ONLINE_DATE_SCHEMA} from './historical-q3-reconciliation.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const blob=p=>{const b=readFileSync(new URL('../'+p,import.meta.url));
 return createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex');};
const datesPath='audit/historical-publisher-dates/2026/chem-four-more-first-online-20261015.json';
const sciencePath='audit/historical-scope-assessments/2026-10-15-chem-pida-electroprocess-science-hold.json';
const dates=read(datesPath),science=read(sciencePath),formal=read('public/toc-demand-live.json'),
  approved=read('audit/historical-reviewed/approved-admissions.json');
const expected=[
 ['10.1016/j.chempr.2026.102966','2026-03-30','2026-08-01','2026-Q1','S245192942600032X'],
 ['10.1016/j.chempr.2026.103034','2026-04-20','2026-08-01','2026-Q2','S2451929426001002'],
 ['10.1016/j.chempr.2026.103026','2026-04-17','2026-09-01','2026-Q2','S2451929426000926'],
 ['10.1016/j.chempr.2026.103242','2026-09-09','2026-09-01','2026-Q3','S2451929426003086']
];
test('four Chemistry original DOI must retain publisher first-online dates, not false Q3 issue dates',()=>{
 assert.equal(dates.schemaVersion,CHEM_ONLINE_DATE_SCHEMA);
 assert.equal(dates.mode,'publisher_first_online_provenance_only_not_admission');
 assert.equal(dates.recordCount,4);
 assert.equal(dates.verifiedOutsideQ3,3);
 assert.equal(dates.verifiedInsideQ3,1);
 assert.equal(dates.verifiedSourceDateConflicts,4);
 assert.equal(dates.verifiedQ1OutsideQ3,1);
 assert.equal(dates.verifiedQ2OutsideQ3,2);
 assert.deepEqual(dates.rows.map(x=>[x.doi,x.publisherFirstOnlineDate,x.sourceDate,
   x.verifiedPublicationQuarter,x.officialPublisherArticlePage.split('/').at(-1)]),expected);
 assert.equal(dates.guards.noSourceShardMutation,true);
 assert.equal(dates.guards.noAutomaticAcademicAdmission,true);
});
test('official ScienceDirect Article PII/source hashes must identify same DOI and immutable raw review shard',()=>{
 const keys=new Set();
 for(const x of dates.rows){
   assert.match(x.doi,/^10\.1016\/j\.chempr\.2026\.\d{6}$/);
   assert.equal(x.publisherArticleType,'Research article');
   assert.equal(x.doiResolver,'https://doi.org/'+x.doi);
   assert.match(x.officialPublisherArticlePage,
     /^https:\/\/www\.sciencedirect\.com\/science\/article\/pii\/S2451929426[A-Z0-9]{6}$/);
   assert.ok(!keys.has(x.doi));keys.add(x.doi);
   assert.equal(x.bibliographic.doi,x.doi);
   assert.equal(x.reviewQueuePath,'audit/historical-staging/review-queue/'+x.originalQ3QueueOrigin+'.json');
   assert.equal(x.originalSourceBatchPath,'audit/historical-staging/batches/'+x.originalQ3QueueOrigin+'.json');
   assert.match(x.sourceRootSha256,/^[a-f0-9]{64}$/);
   assert.match(x.reviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
   assert.match(x.originalSourceBatchGitBlobSha,/^[a-f0-9]{40}$/);
   assert.ok(['crossref','openalex'].some(s=>x.originalQ3SourceFamilies.includes(s)));
   assert.equal(x.originalDateFrozenAndUnmodified,true);
   assert.equal(x.publisherEvidenceDateOverrulesSourceForQuarter,true);
   assert.ok(!formal.articles.some(r=>r.doi===x.doi));
   assert.ok(!approved.accepted.some(r=>r.doi===x.doi));
 }
});
test('PIDA Article is evidence-pending because single scalable reagent not proven as broadly transferable reaction',()=>{
 assert.equal(science.schemaVersion,'gallery-historical-q3-chem-pida-preparative-scope-hold-v1');
 assert.equal(science.dateEvidenceGitBlobSha,blob(datesPath));
 assert.deepEqual(science.accounting,{assessed:1,include:0,exclude:0,pending:1});
 const s=science.assessments[0],source=dates.rows.find(x=>x.doi===s.doi);
 assert.ok(source);
 assert.equal(s.doi,'10.1016/j.chempr.2026.103242');
 assert.equal(s.date,'2026-09-09');
 assert.equal(s.decision,'pending');assert.equal(s.reviewPasses,2);
 assert.equal(s.firstPassDecision,'pending');assert.equal(s.challengeDecision,'pending');
 assert.notEqual(s.firstPassReason,s.independentChallengeReason);
 assert.ok(s.evidenceNeeded.length>=70);assert.ok(s.nextAction.length>=70);
 assert.equal(s.missingEvidenceMustNotMeanNoEvidenceExists,true);
 for(const k of ['primaryContribution','preparativeTransformation','generalityEvidence',
   'sourceEvidence','boundaryChallenge'])assert.ok(s.scopeAssessment[k].length>=40);
 assert.equal(s.reviewEvidence.stageBatchSha,source.originalSourceBatchGitBlobSha);
 assert.equal(s.reviewEvidence.sourceReviewQueueGitBlobSha,source.reviewQueueGitBlobSha);
 assert.equal(s.reviewEvidence.stageSourceSha256,source.sourceRootSha256);
 assert.equal(s.reviewEvidence.publisherArticlePage,source.officialPublisherArticlePage);
 assert.equal(s.reviewEvidence.publisherOnlineDate,source.publisherFirstOnlineDate);
 assert.equal(s.reviewEvidence.firstOnlineDateEvidence.stageApiDate,source.sourceDate);
 assert.ok(!approved.pending.some(x=>x.doi===s.doi),
   'additional scientific evidence hold must remain separate from original formal date-conflict pendings');
});
function fixture(){
 const roots=new Map();
 for(const r of dates.rows){
  const id=r.originalQ3QueueOrigin;
  if(!roots.has(id))roots.set(id,[]);
  roots.get(id).push(r);
 }
 const shards=[...roots.entries()].map(([rootId,rows])=>({
   schemaVersion:'gallery-history-review-triage-v1',
   mode:'review_queue_only_not_publication',rootId,journal:'Chem',
   sourceSha256:rows[0].sourceRootSha256,gitBlobSha:rows[0].reviewQueueGitBlobSha,
   stats:{candidateOccurrences:rows.length},
   records:rows.map(r=>({doi:r.doi,title:r.title,date:r.sourceDate,journal:'Chem',
     sourceFamilies:r.originalQ3SourceFamilies,flags:[],priority:'P2',authors:r.authors}))
 }));
 return {state:{schema:'gallery-historical-nightly-staging-v1',
   mode:'candidate_discovery_only',completed:[...roots.keys()],cursor:{}},
   triage:{schemaVersion:'gallery-history-review-triage-v1',
     mode:'review_queue_only_not_publication',
     rootSummaries:Object.fromEntries(shards.map(s=>[s.rootId,{sourceSha256:s.sourceSha256}]))},
   shards,formal:{articles:[],webpageDoiCount:0},manifest:{accepted:[],pending:[]},
   corrections:{items:[]},journals:[{name:'Chem'}],
   chemPublisherDates:dates,reviewerQueueHistoricalBlobAliasesByRoot:new Map()}
}
test('publisher date corrections retain four source DOI, avoid three spurious Q3 candidates and keep PIDA academically unfinished',()=>{
 const args=fixture(),{coverage,worklist}=reconcileQ3(args);
 assert.equal(coverage.counters.uniqueSourceDois,4);
 assert.equal(coverage.counters.sourcePublisherDateDiscrepancies,4);
 assert.equal(coverage.counters.sourcePublisherVerifiedOutsideQ3,3);
 assert.equal(coverage.counters.unfinishedQ3OrDateVerification,1);
 assert.equal(coverage.counters.sourceApprovedWaiting08,0);
 assert.equal(worklist.rows[0].doi,'10.1016/j.chempr.2026.103242');
 assert.equal(worklist.publisherOnlineDateCorrections.length,4);
 assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
});
test('official date, source SHA, PII and extra fake duplicate proofs fail closed',()=>{
 const args=fixture(),base=dates.rows;
 const mutate=(i,p)=>({...dates,rows:base.map((x,j)=>i===j?{...x,...p}:x)});
 for(const [i,p] of [
 [0,{publisherFirstOnlineDate:'2026-08-01'}],
 [1,{sourceRootSha256:'0'.repeat(64)}],
 [2,{publisherFirstOnlineDate:'2026-09-01'}],
 [3,{doiResolver:'https://doi.org/10.1016/j.chempr.2026.999999'}],
 [3,{officialPublisherArticlePage:'https://wrong.example/pii/S2451929426003086'}]
 ])assert.throws(()=>reconcileQ3({...args,chemPublisherDates:mutate(i,p)}),
 /q3_chem_publisher_date_provenance_conflict/);
 assert.throws(()=>reconcileQ3({...args,chemPublisherDates:{...dates,rows:[...base,base[0]]}}),
 /q3_chem_publisher_date_provenance_conflict/);
});
