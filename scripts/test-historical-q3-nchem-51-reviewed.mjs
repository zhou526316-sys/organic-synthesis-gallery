import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {bindReviewedQ3ScopeProof} from './historical-q3-reviewed-scope-proof.mjs';
import {reconcileQ3,PUBLISHER_NONRESEARCH_SCHEMA} from './historical-q3-reconciliation.mjs';
import {validateHistoricalApproval} from './lib/historical-admission.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const blobSha=p=>{
  const b=readFileSync(new URL('../'+p,import.meta.url));
  return createHash('sha1').update('blob '+b.length).update(Buffer.from([0]))
    .update(b).digest('hex');
};
const prefix='audit/historical-reviewed/';
const pubFile='audit/historical-publisher-issues/2026/nature-chemistry-q3-2026-all-types-66.json';
const frozenFile=prefix+'q3-nchem-51-frozen-source-proof.json';
const scienceFile='audit/historical-scope-assessments/2026-10-14-nchem-21-excluded-pending.json';
const fullScienceFile='audit/historical-scope-assessments/2026-10-14-nchem-24-original-two-pass.json';
const boundFile=prefix+'q3-nchem-21-scope-source-proof.json';
const census=read(pubFile),source=read(frozenFile),non=read(prefix+'q3-nchem-27-nonoriginal-two-pass.json');
const science=read(scienceFile),fullScience=read(fullScienceFile),proof=read(boundFile);
const authorizations=read(prefix+'approved-admissions.json');
const bound=bindReviewedQ3ScopeProof({proof,science,scienceGitBlobSha:blobSha(scienceFile)});
const cids=new Map(census.items.map(r=>[r.doi,r]));
const fids=new Map(source.items.map(r=>[r.doi,r]));
const included=['10.1038/s41557-026-02228-0','10.1038/s41557-026-02227-1','10.1038/s41557-026-02232-4'];
const records=authorizations.accepted.filter(x=>included.includes(x.doi));
test('official Nature Chemistry July-September date/type census contains exact 66 without missing source DOIs',()=>{
  assert.equal(cids.size,66);
  assert.equal(census.counters.publisherQ3AllTypes,66);
  assert.equal(census.counters.publisherQ3OriginalArticles,37);
  assert.equal(census.counters.publisherQ3Nonoriginal,29);
  assert.equal(census.counters.absentFromStage,0);
  assert.equal(census.counters.dateMismatches,0);
  assert.equal(census.publisherIndexPages.length,4);
  assert.equal(source.publisherCensusBlobSha,blobSha(pubFile));
  assert.equal(fids.size,51);
  assert.equal(source.summary.officialOriginalArticles,24);
  assert.equal(source.summary.publisherNonOriginal,27);
  for(const x of source.items){
    const c=cids.get(x.doi);
    assert.ok(c,'not found in official publisher list: '+x.doi);
    assert.equal(c.publisherDate,x.publisherDate);
    assert.equal(c.publisherArticleType,x.publisherArticleType);
    assert.equal(c.publisherArticleUrl,x.publisherArticleUrl);
    assert.equal(c.reviewQueueGitBlobSha,x.reviewQueueGitBlobSha);
    assert.equal(c.stageSourceSha256,x.stageSourceSha256);
    assert.match(x.originalBatchGitBlobSha,/^[0-9a-f]{40}$/);
    assert.match(x.stageSourceSha256,/^[0-9a-f]{64}$/);
    assert.deepEqual(new Set(x.sourceFamilies),new Set(['crossref','openalex']));
    assert.deepEqual(x.sourceFlags,[]);
  }
});
test('27 DOI are actual publisher non-original categories, not fabricated excluded original articles',()=>{
  assert.equal(non.schemaVersion,PUBLISHER_NONRESEARCH_SCHEMA);
  assert.equal(non.reviewed.length,27);
  for(const x of non.reviewed){
    const f=fids.get(x.doi),e=x.reviewEvidence;
    assert.ok(f,x.doi);assert.notEqual(f.publisherArticleType,'Article');
    assert.equal(x.publisherArticleType,f.publisherArticleType);
    assert.equal(x.title,f.sourceTitle);assert.equal(x.date,f.publisherDate);
    assert.equal(e.publisherPage,f.publisherArticleUrl);
    assert.equal(e.publisherArticleDate,f.publisherDate);
    assert.equal(e.stageSourceSha256,f.stageSourceSha256);
    assert.equal(e.stageBatchGitBlobSha,f.originalBatchGitBlobSha);
    assert.equal(e.sourceReviewQueueGitBlobSha,f.reviewQueueGitBlobSha);
    assert.equal(e.sourceReviewQueuePath,f.reviewQueuePath);
    assert.equal(x.decision,'exclude');
    assert.equal(x.reviewPasses,2);
    assert.ok(x.firstPassReason.length>=40);
    assert.ok(x.independentChallengeReason.length>=40);
    assert.notEqual(x.firstPassReason,x.independentChallengeReason);
  }
});
test('twenty original Article scope exclusions and a single distinct evidence-pending decision retain reviewer challenges',()=>{
  assert.equal(bound.reviewed.length,21);
  assert.equal(science.accounting.exclude,20);
  assert.equal(science.accounting.evidencePending,1);
  assert.equal(science.accounting.include,0);
  assert.equal(science.parentFullScienceGitBlobSha,blobSha(fullScienceFile));
  for(const r of bound.reviewed){
    const f=fids.get(r.doi);
    assert.ok(f,r.doi);assert.equal(r.publisherArticleType,'Article');
    assert.equal(r.stageSourceSha256,f.stageSourceSha256);
    assert.equal(r.stageBatchGitBlobSha,f.reviewQueueGitBlobSha);
    assert.equal(r.publisherPage,f.publisherArticleUrl);
    assert.equal(r.assessment.decision,r.scientificDecision);
    assert.notEqual(r.assessment.firstPassReason,r.assessment.independentChallengeReason);
  }
  const waiting=bound.reviewed.filter(x=>x.scientificDecision==='pending');
  assert.deepEqual(waiting.map(x=>x.doi),['10.1038/s41557-026-02226-2']);
  assert.equal(waiting[0].assessment.missingEvidenceMustNotMeanNoEvidenceExists,true);
});
test('three separately approved original synthetic methods are truly authorized for 08-only historical release',()=>{
  assert.equal(records.length,3);
  assert.equal(fullScience.accounting.include,3);
  assert.equal(authorizations.summary.include,authorizations.accepted.length);
  assert.ok(authorizations.summary.include>=119,'historically authorized Nature Chemistry 3 retained');
  assert.equal(authorizations.summary.pending,2);
  assert.equal(authorizations.summary.checked,authorizations.accepted.length+authorizations.pending.length);
  assert.equal(authorizations.auditGuards.requiresFixed08Release,true);
  const validated=validateHistoricalApproval(authorizations);
  assert.equal(validated.length,authorizations.accepted.length);
  for(const r of records){
    const p=fids.get(r.doi),science=fullScience.assessments.find(x=>x.doi===r.doi);
    assert.ok(p&&science);
    assert.equal(p.publisherArticleType,'Article');
    assert.equal(r.title,p.sourceTitle);
    assert.equal(r.date,p.publisherDate);
    assert.equal(r.reviewEvidence.publisherPage,p.publisherArticleUrl);
    assert.equal(r.reviewEvidence.stageBatchSha,p.originalBatchGitBlobSha);
    assert.equal(r.reviewEvidence.stageSourceSha256,p.stageSourceSha256);
    assert.equal(r.reviewEvidence.sourceReviewQueueGitBlobSha,p.reviewQueueGitBlobSha);
    assert.equal(r.citation.doi,r.doi);
    assert.equal(r.journal,'Nature Chemistry');
    assert.equal(r.reviewStatus,'two_pass_scope_include_awaiting_fixed_slot');
    assert.equal(r.ingestionChannel,'historical_backfill');
    assert.equal(r.mediaPolicy,'toc_only');
    assert.equal(r.new,false);assert.equal(r.addedDate,'');
    assert.equal(r.reviewPasses,2);assert.equal(r.challengeDecision,'include');
    assert.equal(r.scopeAssessment.primaryContribution,science.primaryContribution);
    assert.equal(r.scopeAssessment.generalityEvidence,science.generalityEvidence);
    assert.equal(r.scopeAssessment.boundaryChallenge,science.boundaryChallenge);
  }
});
test('51 verified source DOIs partition 27 nonoriginal, 20 scope excluded, one science pending, 3 accepted',()=>{
  const membership=new Map();
  for(const r of non.reviewed)membership.set(r.doi,'non-original');
  for(const r of bound.reviewed){assert.ok(!membership.has(r.doi));membership.set(r.doi,r.scientificDecision)}
  for(const r of records){assert.ok(!membership.has(r.doi));membership.set(r.doi,'include')}
  assert.equal(membership.size,51);
  for(const id of fids.keys())assert.ok(membership.has(id),id);
});
function input(){
 const roots=new Map();
 for(const a of source.items){
   if(!roots.has(a.sourceRootId))roots.set(a.sourceRootId,[]);
   roots.get(a.sourceRootId).push(a);
 }
 const shards=[...roots].map(([rootId,arr])=>({
  schemaVersion:'gallery-history-review-triage-v1',
  mode:'review_queue_only_not_publication',rootId,journal:'Nature Chemistry',
  sourceSha256:arr[0].stageSourceSha256,
  gitBlobSha:arr[0].reviewQueueGitBlobSha,
  stats:{candidateOccurrences:arr.length},
  records:arr.map(x=>({doi:x.doi,journal:'Nature Chemistry',title:x.sourceTitle,
   date:x.publisherDate,sourceFamilies:x.sourceFamilies,flags:x.sourceFlags,
   authors:['First Author'],priority:x.sourcePriority||'P3'}))
 }));
 return {
 state:{schema:'gallery-historical-nightly-staging-v1',mode:'candidate_discovery_only',
   completed:shards.map(x=>x.rootId),cursor:{}},
 triage:{schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
   rootSummaries:Object.fromEntries(shards.map(x=>[x.rootId,{sourceSha256:x.sourceSha256}]))},
 shards,formal:{articles:[],webpageDoiCount:0},
 manifest:{accepted:records,pending:[]},corrections:{items:[]},
 publisherNonResearch:{schemaVersion:PUBLISHER_NONRESEARCH_SCHEMA,
   mode:'publisher_verified_non_original_doi_only_not_publication',reviewed:non.reviewed},
 publisherReviewedScope:bound,
 journals:[{name:'Nature Chemistry'}]
 };
}
test('published source census does not decrease when a reviewed DOI changes status',()=>{
 const {coverage,worklist}=reconcileQ3(input());
 assert.equal(coverage.counters.uniqueSourceDois,51);
 assert.equal(coverage.counters.sourcePublisherNonResearchExcluded,27);
 assert.equal(coverage.counters.sourcePublisherReviewedScopeExcluded,20);
 assert.equal(coverage.counters.sourcePublisherReviewedScopePending,1);
 assert.equal(coverage.counters.sourceApprovedWaiting08,3);
 assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
 assert.equal(coverage.counters.sourcePending,0);
 assert.equal(coverage.counters.sourceExplicitlyExcluded,0);
 assert.equal(worklist.totalUnreviewedCandidates,0);
 assert.equal(worklist.publisherScopeEvidencePending.length,1);
 assert.equal(worklist.publisherScopeEvidencePending[0].doi,'10.1038/s41557-026-02226-2');
 assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
});
test('DOI hash, official type, duplicate science, protected admitted DOI collisions all fail closed',()=>{
 const x=input(),bad={...x.shards[0],gitBlobSha:'0'.repeat(40)};
 assert.throws(()=>reconcileQ3({...x,shards:[bad,...x.shards.slice(1)]}),
   /q3_nonresearch_publisher_evidence_invalid|q3_reviewed_scope_provenance_or_science_conflict/);
 assert.throws(()=>reconcileQ3({...x,publisherNonResearch:{...x.publisherNonResearch,
   reviewed:[{...non.reviewed[0],publisherArticleType:'Article'},...non.reviewed.slice(1)]}}),
   /q3_nonresearch_publisher_evidence_invalid/);
 assert.throws(()=>reconcileQ3({...x,publisherReviewedScope:{...bound,
   reviewed:[...bound.reviewed,bound.reviewed[0]]}}),
   /q3_reviewed_scope_provenance_or_science_conflict/);
 assert.throws(()=>reconcileQ3({...x,manifest:{accepted:[records[0],{...records[0]}],pending:[]}}),
   /q3_formal_doi_partition_conflict/);
});

test('complete 66-DOI publisher census spans twelve historical windows; 51 reviewed DOI use only eleven',()=>{
  const all=new Set(census.sourceRoots.map(x=>x.rootId));
  const reviewed=new Set(source.items.map(x=>x.sourceRootId));
  assert.equal(all.size,12);
  assert.equal(reviewed.size,11);
  assert.ok([...reviewed].every(x=>all.has(x)));
  assert.ok(census.items.every(x=>all.has(x.sourceRootId)));
  const previouslyKnownOnly=[...all].filter(x=>!reviewed.has(x));
  assert.deepEqual(previouslyKnownOnly,['2026-08-01_2026-08-07_nature-chemistry']);
  for(const row of census.items.filter(x=>previouslyKnownOnly.includes(x.sourceRootId)))
    assert.notEqual(row.originalStatus,'unfinished',
      'a real unfinished paper cannot be dropped because the shard lacks a new review');
});

test('a verified old reviewer-shard Git SHA remains a proof alias only for the status-regenerated root',()=>{
  const x=input();
  const target='2026-08-22_2026-08-31_nature-chemistry';
  const originals=x.shards;
  const before=originals.find(sh=>sh.rootId===target);
  assert.ok(before);
  const refreshed=originals.map(sh=>sh.rootId===target
    ?{...sh,gitBlobSha:'e'.repeat(40)}:sh);
  assert.throws(()=>reconcileQ3({...x,shards:refreshed}),
    /q3_nonresearch_publisher_evidence_invalid|q3_reviewed_scope_provenance_or_science_conflict/);
  const historicalAliases=new Map([[target,new Set([before.gitBlobSha])]]);
  const {coverage}=reconcileQ3({...x,shards:refreshed,
    reviewerQueueHistoricalBlobAliasesByRoot:historicalAliases});
  assert.equal(coverage.counters.uniqueSourceDois,51);
  assert.equal(coverage.counters.sourceApprovedWaiting08,3);
  assert.equal(coverage.counters.sourcePublisherNonResearchExcluded,27);
  assert.equal(coverage.counters.sourcePublisherReviewedScopeExcluded,20);
  assert.equal(coverage.counters.sourcePublisherReviewedScopePending,1);
  const incorrectRoot='2026-09-01_2026-09-07_nature-chemistry';
  assert.throws(()=>reconcileQ3({...x,shards:refreshed,
    reviewerQueueHistoricalBlobAliasesByRoot:new Map([[incorrectRoot,
      new Set([before.gitBlobSha])]])}),
    /q3_nonresearch_publisher_evidence_invalid|q3_reviewed_scope_provenance_or_science_conflict/);
});
