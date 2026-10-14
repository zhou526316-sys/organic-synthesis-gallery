import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {bindReviewedQ3ScopeProof} from './historical-q3-reviewed-scope-proof.mjs';
import {reconcileQ3,PUBLISHER_NONRESEARCH_SCHEMA} from './historical-q3-reconciliation.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=p=>{
  const b=readFileSync(new URL('../'+p,import.meta.url));
  return createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex');
};
const rootPath='audit/historical-reviewed/q3-natcatal-unfinished-24-source-proof.json';
const nonPath='audit/historical-reviewed/q3-natcatal-nonoriginal-19-two-pass.json';
const sciencePath='audit/historical-scope-assessments/2026-10-14-natcatal-late-online-five.json';
const proofPath='audit/historical-reviewed/q3-natcatal-late-online-five-source-proof.json';
const source=read(rootPath),non=read(nonPath),science=read(sciencePath),proof=read(proofPath);
const scope=bindReviewedQ3ScopeProof({proof,science,scienceGitBlobSha:sha(sciencePath)});
const mainNon=read('audit/historical-reviewed/q3-publisher-nonresearch-exclusions.json');
const priorScope=read('audit/historical-reviewed/q3-natcatal-scope-source-proof.json');
const formal=read('public/toc-demand-live.json'),manifest=read('audit/historical-reviewed/approved-admissions.json');
const owner=read('audit/literature-scope-corrections.json');
const byId=new Map(source.rows.map(x=>[x.doi,x]));
test('every one of 24 Q3 DOI has a frozen primary-source fingerprint and two literature families',()=>{
  assert.equal(source.sourceDoiCount,24);
  assert.equal(byId.size,24);
  for(const row of source.rows){
    assert.equal(row.journal,'Nature Catalysis');
    assert.match(row.date,/^2026-(07|08|09)-\d\d$/);
    assert.match(row.sourceRootSha256,/^[a-f0-9]{64}$/);
    assert.match(row.sourceShardGitBlobSha,/^[a-f0-9]{40}$/);
    assert.equal(row.sourceShardPath,'audit/historical-staging/review-queue/'+row.sourceRootId+'.json');
    assert.deepEqual(new Set(row.sourceFamilies),new Set(['crossref','openalex']));
    assert.deepEqual(row.flags,[]);
  }
});
test('all 19 secondary items have DOI-specific publisher types and protected original research references',()=>{
  assert.equal(non.schemaVersion,PUBLISHER_NONRESEARCH_SCHEMA);
  assert.equal(non.reviewed.length,19);
  assert.deepEqual(non.summary.byType,{
    'Publisher Correction':1,'Author Correction':2,'Research Briefing':2,
    'Research Highlight':4,'News & Views':9,Comment:1
  });
  for(const item of non.reviewed){
    const row=byId.get(item.doi),ev=item.reviewEvidence;
    assert.ok(row,item.doi);
    assert.equal(ev.publisherPage,'https://www.nature.com/articles/'+item.doi.split('/')[1]);
    assert.equal(item.date,row.date);
    assert.equal(item.title,row.title);
    assert.equal(ev.publisherArticleDate,item.date);
    assert.equal(ev.stageSourceSha256,row.sourceRootSha256);
    assert.equal(ev.sourceReviewQueueGitBlobSha,row.sourceShardGitBlobSha);
    assert.equal(ev.sourceReviewQueuePath,row.sourceShardPath);
    assert.equal(item.firstPassDecision,'exclude');
    assert.equal(item.challengeDecision,'exclude');
    assert.notEqual(item.firstPassReason,item.independentChallengeReason);
    assert.ok(item.firstPassReason.length>=60);
    assert.ok(item.independentChallengeReason.length>=60);
    assert.equal(item.reviewPasses,2);
    assert.equal(item.guards.notAutomaticTitleExclusion,true);
    assert.ok(ev.stageBatchGitBlobSha.match(/^[a-f0-9]{40}$/));
  }
});
test('five original Articles receive four scope excludes and one independently held biological-synthesis pending',()=>{
  assert.equal(scope.reviewed.length,5);
  assert.equal(science.accounting.exclude,4);
  assert.equal(science.accounting.evidencePending,1);
  for(const row of scope.reviewed){
    assert.equal(row.publisherArticleType,'Article');
    assert.ok(byId.has(row.doi));
    assert.equal(row.stageBatchGitBlobSha,byId.get(row.doi).sourceShardGitBlobSha);
    assert.equal(row.scientificDecision,row.assessment.decision);
    assert.ok(row.assessment.scopeAssessment.generalityEvidence.length>45);
  }
  const pending=scope.reviewed.filter(x=>x.scientificDecision==='pending');
  assert.equal(pending.length,1);
  assert.equal(pending[0].doi,'10.1038/s41929-026-01611-x');
  assert.match(pending[0].assessment.evidenceNeeded,/底物接受度/);
  assert.equal(pending[0].assessment.missingEvidenceMustNotMeanNoEvidenceExists,true);
});
test('no residual DOI collides with the formal catalog, owner exclusions, original pending or earlier scope decisions',()=>{
  const protectedSet=new Set([
    ...formal.articles.map(x=>x.doi),
    ...manifest.accepted.map(x=>x.doi),
    ...manifest.pending.map(x=>x.doi),
    ...owner.items.map(x=>x.doi),
    ...mainNon.reviewed.map(x=>x.doi),
    ...priorScope.reviewed.map(x=>x.doi)
  ]);
  for(const doi of byId.keys())assert.equal(protectedSet.has(doi),false,doi);
});
function mockInput(){
  const groups=new Map();
  for(const x of source.rows){
    if(!groups.has(x.sourceRootId))groups.set(x.sourceRootId,[]);
    groups.get(x.sourceRootId).push(x);
  }
  const shards=[...groups].map(([rootId,items])=>({
    schemaVersion:'gallery-history-review-triage-v1',
    mode:'review_queue_only_not_publication',
    rootId,journal:'Nature Catalysis',
    sourceSha256:items[0].sourceRootSha256,
    gitBlobSha:items[0].sourceShardGitBlobSha,
    stats:{candidateOccurrences:items.length},
    records:items.map(x=>({doi:x.doi,journal:'Nature Catalysis',
      title:x.title,date:x.date,priority:x.priority,flags:x.flags,authors:['Reference Author'],
      sourceFamilies:x.sourceFamilies}))
  }));
  const rootSummaries=Object.fromEntries(shards.map(x=>[x.rootId,{sourceSha256:x.sourceSha256}]));
  return {
    state:{schema:'gallery-historical-nightly-staging-v1',mode:'candidate_discovery_only',
      completed:shards.map(x=>x.rootId),cursor:{range:{from:'2025-01-01',to:'2025-01-31'},journalIndex:0}},
    triage:{schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',rootSummaries},
    shards,formal:{webpageDoiCount:0,articles:[]},manifest:{accepted:[],pending:[]},corrections:{items:[]},
    publisherNonResearch:non,publisherReviewedScope:scope,journals:[{name:'Nature Catalysis'}]
  };
}
test('complete Q3 mock accounts for 19 nonoriginal + four scope exclusions + one separate scope pending without source loss',()=>{
  const {coverage,worklist}=reconcileQ3(mockInput());
  assert.equal(coverage.counters.uniqueSourceDois,24);
  assert.equal(coverage.counters.sourcePublisherNonResearchExcluded,19);
  assert.equal(coverage.counters.sourcePublisherReviewedScopeExcluded,4);
  assert.equal(coverage.counters.sourcePublisherReviewedScopePending,1);
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
  assert.equal(worklist.totalUnreviewedCandidates,0);
  assert.equal(worklist.verifiedPublisherScopeEvidencePending,1);
  assert.equal(worklist.publisherScopeEvidencePending[0].doi,'10.1038/s41929-026-01611-x');
  assert.equal(coverage.counters.sourcePending,0,'not original manifest pending');
  assert.equal(coverage.counters.sourceExplicitlyExcluded,0,'not owner exclusions');
  assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
});
test('tampered reviewed-source SHA, fabricated publisher type and reused DOI fail closed',()=>{
  const input=mockInput();
  const first=input.shards[0];
  assert.throws(()=>reconcileQ3({...input,shards:[{...first,gitBlobSha:'e'.repeat(40)},...input.shards.slice(1)]}),
    /q3_nonresearch_publisher_evidence_invalid|q3_reviewed_scope_provenance_or_science_conflict/);
  const badItem={...non.reviewed[0],publisherArticleType:'Article'};
  assert.throws(()=>reconcileQ3({...input,publisherNonResearch:{
    ...non,reviewed:[badItem,...non.reviewed.slice(1)]
  }}),/q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...input,publisherReviewedScope:{
    ...scope,reviewed:[...scope.reviewed,scope.reviewed[0]]
  }}),/q3_reviewed_scope_provenance_or_science_conflict/);
});
