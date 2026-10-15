import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reconcileQ3} from './historical-q3-reconciliation.mjs';
import {SCHEMA} from './historical-chem-cross-source-proof.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const hash=p=>{const b=readFileSync(new URL('../'+p,import.meta.url));return createHash('sha1')
  .update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex');};
const datePath='audit/historical-publisher-dates/2026/chem-103127-cross-source-online-conflict.json';
const scopePath='audit/historical-scope-assessments/2026-10-15-chem-ge-cross-source-pending.json';
const dates=read(datePath),science=read(scopePath);
const d=dates.rows[0],s=science.assessments[0];
const baseRow={doi:d.doi,title:d.title,journal:'Chem',authors:d.authors,priority:'P2',flags:[]};
function fixture(){
  const shards=d.originalSourceRows.map(p=>({
    schemaVersion:'gallery-history-review-triage-v1',
    mode:'review_queue_only_not_publication',
    rootId:p.rootId,journal:'Chem',
    sourceSha256:p.sourceRootSha256,gitBlobSha:p.reviewQueueGitBlobSha,
    stats:{candidateOccurrences:1},
    records:[{...baseRow,date:p.sourceDate,sourceFamilies:p.sourceFamilies}]
  }));
  return {state:{schema:'gallery-historical-nightly-staging-v1',
    mode:'candidate_discovery_only',completed:shards.map(x=>x.rootId),cursor:{}},
    triage:{schemaVersion:'gallery-history-review-triage-v1',
      mode:'review_queue_only_not_publication',
      rootSummaries:Object.fromEntries(shards.map(x=>[x.rootId,{sourceSha256:x.sourceSha256}]))},
    shards,formal:{articles:[],webpageDoiCount:0},
    manifest:{accepted:[],pending:[]},corrections:{items:[]},
    journals:[{name:'Chem'}],chemCrossSourceDates:dates,
    chemCrossSourcePendingEvidence:science.assessments,
    reviewerQueueHistoricalBlobAliasesByRoot:new Map()};
}
test('publisher DOI, exactly two different immutable root dates and 07-06 verified online day',()=>{
 assert.equal(dates.schemaVersion,SCHEMA);
 assert.equal(dates.recordCount,1);
 assert.equal(d.verifiedPublicationQuarter,'2026-Q3');
 assert.equal(d.doi,'10.1016/j.chempr.2026.103127');
 assert.equal(d.publisherFirstOnlineDate,'2026-07-06');
 assert.equal(d.officialPublisherArticlePage,
   'https://www.sciencedirect.com/science/article/pii/S2451929426001932');
 assert.equal(d.originalSourceRows.length,2);
 assert.deepEqual(d.originalSourceRows.map(x=>x.sourceDate),['2026-07-06','2026-08-01']);
 assert.deepEqual(d.originalSourceRows.map(x=>x.sourceFamilies),[['openalex'],['crossref']]);
 assert.equal(d.originalSourceRows[0].sourceRootSha256,
   '341f127a8b9fe6f24c4e882a4da89caeb04b8335bc32803fe664ee67cb51059f');
 assert.equal(d.originalSourceRows[1].sourceRootSha256,
   '26770f50e9727826aa1d8171817c7f6ad3ff27376721eb2684efd2d94e2a50aa');
 assert.equal(d.originalSourceRows[0].rawSourceBatchGitBlobSha,
   '2efb3dc9219a5d244f34db3aff9aa2edfe4c45f7');
 assert.equal(d.originalSourceRows[1].rawSourceBatchGitBlobSha,
   '6ea589ffc11c757ffd5e72b02d931e88e4778b68');
 assert.equal(dates.guards.noSourceShardMutation,true);
 assert.equal(dates.guards.sourceDateConflictPreservedForAudit,true);
});
test('science is NOT automatically approved by the published first-online proof',()=>{
 assert.equal(science.dateEvidenceGitBlobSha,hash(datePath));
 assert.deepEqual(science.counts,{assessed:1,include:0,exclude:0,pending:1});
 assert.equal(s.date,d.publisherFirstOnlineDate);
 assert.equal(s.doi,d.doi);
 assert.equal(s.publisherArticleType,'Research article');
 assert.equal(s.decision,'pending');
 assert.equal(s.firstPassDecision,'pending');
 assert.equal(s.challengeDecision,'pending');
 assert.equal(s.reviewPasses,2);
 assert.notEqual(s.firstPassReason,s.independentChallengeReason);
 assert.ok(s.evidenceNeeded.length>=70&&s.nextAction.length>=70);
 for(const key of ['primaryContribution','preparativeTransformation',
 'generalityEvidence','sourceEvidence','boundaryChallenge'])
 assert.ok(s.scopeAssessment[key].length>=35);
 assert.equal(s.reviewEvidence.frozenSourceDateConflictRetained,true);
 assert.deepEqual(s.reviewEvidence.sourceRootIds,d.originalSourceRows.map(x=>x.rootId));
 assert.equal(science.guards.noFormalPublication,true);
});
test('source conflict stays in census while publisher date is corrected and science pending is separate',()=>{
 const f=fixture(),base=reconcileQ3({...f,
  chemCrossSourceDates:{schemaVersion:SCHEMA,
    mode:'publisher_verified_cross_source_date_conflict_not_admission',rows:[]},
  chemCrossSourcePendingEvidence:[]});
 assert.equal(base.coverage.counters.uniqueSourceDois,1);
 assert.equal(base.coverage.counters.sourceDateConflicts,1);
 assert.equal(base.coverage.counters.unfinishedQ3OrDateVerification,1);
 const {coverage,worklist}=reconcileQ3(f);
 assert.equal(coverage.counters.uniqueSourceDois,1);
 assert.equal(coverage.counters.candidateOccurrences,2);
 assert.equal(coverage.counters.sourceDateConflicts,1);
 assert.equal(coverage.counters.sourcePublisherDateConflictsResolved,1);
 assert.equal(coverage.counters.sourcePublisherDateDiscrepancies,1);
 assert.equal(coverage.counters.unknownPublisherOnlineDate,0);
 assert.equal(coverage.counters.sourcePublisherReviewedScopePending,1);
 assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
 assert.equal(coverage.counters.sourceApprovedWaiting08,0);
 assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
 assert.equal(worklist.totalUnreviewedCandidates,0);
 assert.equal(worklist.publisherSourceDateConflictsResolved[0].publisherFirstOnlineDate,'2026-07-06');
 assert.equal(worklist.publisherScopeEvidencePending[0].doi,d.doi);
 assert.equal(worklist.publisherScopeEvidencePending[0].notOriginalManifestPending,true);
});
test('wrong publisher day, forged source SHA, fake URL and science auto-include fail closed',()=>{
 const f=fixture();
 const update=p=>({...dates,rows:[{...d,...p}]});
 const cases=[
  {publisherFirstOnlineDate:'2026-08-01'},
  {publisherFirstOnlineDate:'2026-09-01'},
  {officialPublisherArticlePage:'https://untrusted.example/article/S2451929426001932'},
  {originalSourceRows:d.originalSourceRows.map((r,i)=>i===1?{...r,sourceRootSha256:'0'.repeat(64)}:r)},
  {originalSourceRows:d.originalSourceRows.map((r,i)=>i===1?{...r,reviewQueueGitBlobSha:'0'.repeat(40)}:r)}
 ];
 for(const p of cases)assert.throws(()=>reconcileQ3({...f,chemCrossSourceDates:update(p)}),
  /q3_chem_cross_source_publisher_provenance_invalid/);
 assert.throws(()=>reconcileQ3({...f,chemCrossSourcePendingEvidence:[]}),
  /q3_chem_cross_source_date_scope_partition_incomplete/);
 assert.throws(()=>reconcileQ3({...f,chemCrossSourcePendingEvidence:[{...s,decision:'include'}]}),
  /q3_chem_cross_source_science_pending_invalid/);
});
