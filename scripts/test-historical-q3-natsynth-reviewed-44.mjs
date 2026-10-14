import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {bindReviewedQ3ScopeProof} from './historical-q3-reviewed-scope-proof.mjs';
import {reconcileQ3,PUBLISHER_NONRESEARCH_SCHEMA} from './historical-q3-reconciliation.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const blob=p=>{
  const b=readFileSync(new URL('../'+p,import.meta.url));
  return createHash('sha1').update('blob '+b.length).update(Buffer.from([0]))
    .update(b).digest('hex');
};
const base='audit/historical-reviewed/';
const proof=read(base+'q3-natsynth-44-frozen-source-proof.json');
const types=read(base+'q3-natsynth-publisher-types-44.json');
const n=read(base+'q3-natsynth-nonoriginal-31-two-pass.json');
const sp=read(base+'q3-natsynth-13-article-source-proof.json');
const sciencePath='audit/historical-scope-assessments/2026-10-14-natsynth-13-original-two-pass.json';
const science=read(sciencePath);
const bound=bindReviewedQ3ScopeProof({proof:sp,science,scienceGitBlobSha:blob(sciencePath)});
const byId=new Map(proof.items.map(x=>[x.doi,x]));
test('44 exact frozen Nature Synthesis Q3 records are duplicate-free with both source families',()=>{
  assert.equal(byId.size,44);
  assert.equal(proof.summary.sourceDois,63);
  assert.equal(proof.summary.unreviewed,44);
  assert.equal(proof.summary.previousKnown,19);
  assert.equal(proof.publisherTypeLedgerBlob,blob(base+'q3-natsynth-publisher-types-44.json'));
  assert.equal(types.items.length,44);
  for(const x of proof.items){
    assert.equal(x.journal,'Nature Synthesis');
    assert.match(x.date,/^2026-(07|08|09)-\d\d$/);
    assert.match(x.sourceSha256,/^[a-f0-9]{64}$/);
    assert.match(x.reviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
    assert.match(x.rawSourceBatchGitBlobSha,/^[a-f0-9]{40}$/);
    assert.deepEqual(new Set(x.sourceFamilies),new Set(['crossref','openalex']));
    assert.equal(x.reviewQueuePath,'audit/historical-staging/review-queue/'+x.sourceRootId+'.json');
  }
});
test('31 publisher non-original types cannot masquerade as genuine preparative Articles',()=>{
  assert.equal(n.reviewed.length,31);
  assert.equal(n.schemaVersion,PUBLISHER_NONRESEARCH_SCHEMA);
  const counts=n.reviewed.reduce((m,r)=>(m[r.publisherArticleType]=(m[r.publisherArticleType]||0)+1,m),{});
  assert.deepEqual(counts,{ 'News & Views':8,'Research Briefing':6,'Research Highlight':6,
    'Q&A':1,Comment:3,'Review Article':2,Perspective:1,'Author Correction':3,Editorial:1});
  for(const row of n.reviewed){
    const src=byId.get(row.doi),ev=row.reviewEvidence;
    assert.ok(src);
    assert.notEqual(src.publisherArticleType,'Article');
    assert.equal(row.title,src.title);
    assert.equal(row.date,src.date);
    assert.equal(ev.publisherArticleType,src.publisherArticleType);
    assert.equal(ev.publisherPage,src.publisherPage);
    assert.equal(ev.stageSourceSha256,src.sourceSha256);
    assert.equal(ev.stageBatchGitBlobSha,src.rawSourceBatchGitBlobSha);
    assert.equal(ev.sourceReviewQueueGitBlobSha,src.reviewQueueGitBlobSha);
    assert.equal(ev.sourceReviewQueuePath,src.reviewQueuePath);
    assert.ok(row.firstPassReason.length>=40);
    assert.ok(row.independentChallengeReason.length>=40);
    assert.notEqual(row.firstPassReason,row.independentChallengeReason);
    assert.equal(row.reviewPasses,2);
  }
});
test('13 genuine original Articles receive 11 exclusions and 2 evidence holds, with no automatic includes',()=>{
  assert.equal(bound.reviewed.length,13);
  assert.equal(science.accounting.exclude,11);
  assert.equal(science.accounting.evidencePending,2);
  assert.equal(science.accounting.include,0);
  assert.equal(science.accounting.integratedIntoQuarterReconciliation,false);
  for(const row of bound.reviewed){
    const item=byId.get(row.doi);
    assert.equal(row.publisherArticleType,'Article');
    assert.equal(row.stageBatchGitBlobSha,item.reviewQueueGitBlobSha);
    assert.equal(row.stageSourceSha256,item.sourceSha256);
    assert.equal(row.scientificDecision,row.assessment.decision);
    assert.ok(row.assessment.generalityEvidence.length>=20);
  }
  assert.deepEqual(bound.reviewed.filter(x=>x.scientificDecision==='pending').map(x=>x.doi).sort(),
    ['10.1038/s44160-026-01115-3','10.1038/s44160-026-01146-w']);
});
test('existing main formal DOI and other authoritative decisions cannot collide with 44 new Q3 rows',()=>{
  const main=read('public/toc-demand-live.json');
  const manifest=read(base+'approved-admissions.json');
  const n0=read(base+'q3-publisher-nonresearch-exclusions.json');
  const n1=read(base+'q3-natcatal-nonoriginal-19-two-pass.json');
  const prior=read(base+'q3-natcatal-scope-source-proof.json');
  const late=read(base+'q3-natcatal-late-online-five-source-proof.json');
  const owners=read('audit/literature-scope-corrections.json');
  const seen=new Set([
    ...main.articles.map(x=>x.doi),
    ...manifest.accepted.map(x=>x.doi),...manifest.pending.map(x=>x.doi),
    ...n0.reviewed.map(x=>x.doi),...n1.reviewed.map(x=>x.doi),
    ...prior.reviewed.map(x=>x.doi),...late.reviewed.map(x=>x.doi),
    ...owners.items.map(x=>x.doi)
  ]);
  for(const x of proof.items)assert.ok(!seen.has(x.doi),'unexpected authoritative collision '+x.doi);
});
function mock(){
  const groups=new Map();
  for(const x of proof.items){
    if(!groups.has(x.sourceRootId))groups.set(x.sourceRootId,[]);
    groups.get(x.sourceRootId).push(x);
  }
  const shards=[...groups].map(([rootId,items])=>({
    schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
    rootId,journal:'Nature Synthesis',sourceSha256:items[0].sourceSha256,
    gitBlobSha:items[0].reviewQueueGitBlobSha,stats:{candidateOccurrences:items.length},
    records:items.map(x=>({doi:x.doi,journal:'Nature Synthesis',title:x.title,
      date:x.date,authors:x.authors,priority:x.priority,sourceFamilies:x.sourceFamilies,flags:x.sourceFlags}))
  }));
  return {
    state:{schema:'gallery-historical-nightly-staging-v1',mode:'candidate_discovery_only',
      completed:shards.map(x=>x.rootId),cursor:{}},
    triage:{schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
      rootSummaries:Object.fromEntries(shards.map(x=>[x.rootId,{sourceSha256:x.sourceSha256}]))},
    shards,formal:{articles:[],webpageDoiCount:0},manifest:{accepted:[],pending:[]},
    corrections:{items:[]},journals:[{name:'Nature Synthesis'}],
    publisherNonResearch:{schemaVersion:PUBLISHER_NONRESEARCH_SCHEMA,
      mode:'publisher_verified_non_original_doi_only_not_publication',reviewed:n.reviewed},
    publisherReviewedScope:bound
  };
}
test('44 audited DOI remain in census but are not unfinished or owner-excluded',()=>{
  const {coverage,worklist}=reconcileQ3(mock());
  assert.equal(coverage.counters.uniqueSourceDois,44);
  assert.equal(coverage.counters.sourcePublisherNonResearchExcluded,31);
  assert.equal(coverage.counters.sourcePublisherReviewedScopeExcluded,11);
  assert.equal(coverage.counters.sourcePublisherReviewedScopePending,2);
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
  assert.equal(coverage.counters.sourceExplicitlyExcluded,0);
  assert.equal(coverage.counters.sourceApprovedWaiting08,0);
  assert.equal(coverage.counters.sourcePending,0);
  assert.equal(worklist.totalUnreviewedCandidates,0);
  assert.equal(worklist.publisherScopeEvidencePending.length,2);
  assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
});
test('corrupted type, source SHA, duplicate or dates fail closed',()=>{
  const x=mock(),wrong={...x.shards[0],gitBlobSha:'a'.repeat(40)};
  assert.throws(()=>reconcileQ3({...x,shards:[wrong,...x.shards.slice(1)]}),
    /q3_nonresearch_publisher_evidence_invalid|q3_reviewed_scope_provenance_or_science_conflict/);
  assert.throws(()=>reconcileQ3({...x,publisherNonResearch:{...x.publisherNonResearch,
    reviewed:[{...n.reviewed[0],publisherArticleType:'Article'},...n.reviewed.slice(1)]}}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...x,publisherReviewedScope:{...bound,
    reviewed:[...bound.reviewed,bound.reviewed[0]]}}),
    /q3_reviewed_scope_provenance_or_science_conflict/);
  assert.throws(()=>bindReviewedQ3ScopeProof({proof:{...sp,reviewed:sp.reviewed.map((r,i)=>
    i? r:{...r,date:'2026-08-09'})},science,scienceGitBlobSha:blob(sciencePath)}),
    /proof_row_invalid/);
});
