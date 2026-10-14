import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {bindReviewedQ3ScopeProof} from './historical-q3-reviewed-scope-proof.mjs';
import {reconcileQ3} from './historical-q3-reconciliation.mjs';
import {validateHistoricalApproval} from './lib/historical-admission.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const blob=path=>{
  const buf=readFileSync(new URL('../'+path,import.meta.url));
  return createHash('sha1').update('blob '+buf.length)
    .update(Buffer.from([0])).update(buf).digest('hex');
};
const prefix='audit/historical-reviewed/';
const sourcePath=prefix+'q3-natcomm-nine-frozen-source.json';
const fullPath='audit/historical-scope-assessments/2026-10-14-natcomm-nine-original-two-pass.json';
const exceptionPath='audit/historical-scope-assessments/2026-10-14-natcomm-one-exclude-one-pending.json';
const exceptionProofPath=prefix+'q3-natcomm-two-exceptions-source-proof.json';
const source=read(sourcePath),full=read(fullPath);
const exceptions=read(exceptionPath),proof=read(exceptionProofPath);
const manifest=read(prefix+'approved-admissions.json');
const bound=bindReviewedQ3ScopeProof({
  proof,science:exceptions,scienceGitBlobSha:blob(exceptionPath)
});
const bySource=new Map(source.rows.map(x=>[x.doi,x]));
const byScience=new Map(full.assessments.map(x=>[x.doi,x]));
const admitted=manifest.accepted.filter(x=>bySource.has(x.doi));
test('nine original Nature Communications Article records have unique DOI, date and dual immutable source proofs',()=>{
  assert.equal(bySource.size,9);
  assert.equal(source.rows.length,9);
  assert.equal(source.sourceRootCount,6);
  assert.equal(new Set(source.rows.map(x=>x.sourceRootId)).size,6);
  for(const s of source.rows){
    assert.equal(s.journal,'Nature Communications');
    assert.match(s.doi,/^10\.1038\/s41467-026-\d{5}-[a-z0-9]$/);
    assert.match(s.date,/^2026-(07|08|09)-\d\d$/);
    assert.equal(s.citation.doi,s.doi);
    assert.equal(s.citation.year,2026);
    assert.equal(s.citation.volume,'17');
    assert.ok(s.citation.articleNumber.length>=3);
    assert.deepEqual(new Set(s.sourceFamilies),new Set(['crossref','openalex']));
    assert.match(s.sourceSha256,/^[a-f0-9]{64}$/);
    assert.match(s.reviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
    assert.match(s.originalBatchGitBlobSha,/^[a-f0-9]{40}$/);
    assert.deepEqual(s.sourceFlags,[]);
    assert.equal(s.publisherPage,'https://www.nature.com/articles/'+s.doi.split('/')[1]);
    assert.equal(s.reviewQueuePath,'audit/historical-staging/review-queue/'+s.sourceRootId+'.json');
    assert.equal(s.originalBatchPath,'audit/historical-staging/batches/'+s.sourceRootId+'.json');
  }
});
test('7 academic includes, one excluded simulation, one science pending preserve distinct challenges and actual product limits',()=>{
  assert.equal(byScience.size,9);
  assert.deepEqual(full.accounting,{
    assessmentCount:9,include:7,exclude:1,evidencePending:1,integratedIntoQuarterReconciliation:false
  });
  assert.equal(manifest.reviewedNatureCommunicationsNew.auditedScienceGitBlobSha,blob(fullPath));
  assert.equal(manifest.reviewedNatureCommunicationsNew.sourceProofBlobSha,blob(sourcePath));
  for(const s of full.assessments){
    assert.equal(s.date,bySource.get(s.doi)?.date);
    assert.equal(s.publisherArticleType,'Article');
    assert.equal(s.publisherPage,bySource.get(s.doi)?.publisherPage);
    assert.equal(s.reviewPasses,2);
    assert.equal(s.firstPassDecision,s.decision);
    assert.equal(s.challengeDecision,s.decision);
    assert.notEqual(s.firstPassReason,s.independentChallengeReason);
    assert.ok(s.generalityEvidence.length>=45);
    assert.ok(s.independentChallengeReason.length>=45);
  }
  assert.equal(full.assessments.filter(x=>x.decision==='include').length,7);
  assert.deepEqual(full.assessments.filter(x=>x.decision==='pending').map(x=>x.doi),['10.1038/s41467-026-76617-x']);
  assert.deepEqual(full.assessments.filter(x=>x.decision==='exclude').map(x=>x.doi),['10.1038/s41467-026-77096-w']);
  assert.match(byScience.get('10.1038/s41467-026-76617-x').evidenceNeeded,/不同烯烃/);
  assert.match(byScience.get('10.1038/s41467-026-77096-w').independentChallengeReason,/激发概率/);
});
test('seven isolated 08:00 original synthesis admissions pass every existing historic authorization gate',()=>{
  assert.equal(manifest.summary.include,126);
  assert.equal(manifest.summary.pending,2);
  assert.equal(manifest.summary.checked,128);
  assert.equal(admitted.length,7);
  assert.equal(validateHistoricalApproval(manifest).length,126);
  for(const row of admitted){
    const f=bySource.get(row.doi),s=byScience.get(row.doi);
    assert.ok(f&&s);
    assert.equal(s.decision,'include');
    assert.equal(row.title,f.title);
    assert.equal(row.date,f.date);
    assert.equal(row.citation.articleNumber,f.citation.articleNumber);
    assert.deepEqual(row.authors,f.authors);
    assert.equal(row.reviewEvidence.publisherPage,f.publisherPage);
    assert.equal(row.reviewEvidence.stageBatchSha,f.originalBatchGitBlobSha);
    assert.equal(row.reviewEvidence.sourceReviewQueueGitBlobSha,f.reviewQueueGitBlobSha);
    assert.equal(row.reviewEvidence.stageSourceSha256,f.sourceSha256);
    assert.equal(row.scopeAssessment.primaryContribution,s.primaryContribution);
    assert.equal(row.scopeAssessment.generalityEvidence,s.generalityEvidence);
    assert.equal(row.scopeAssessment.boundaryChallenge,s.boundaryChallenge);
    assert.equal(row.ingestionChannel,'historical_backfill');
    assert.equal(row.mediaPolicy,'toc_only');
    assert.equal(row.addedDate,'');
    assert.equal(row.new,false);
    assert.ok(/[\u3400-\u9fff]/.test(row.titleZh));
    assert.equal(row.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  }
});
test('one exclude and one new science pending remain separate from original two manifest date pendings',()=>{
  assert.equal(proof.scientificEvidenceBlobSha,blob(exceptionPath));
  assert.equal(exceptions.parentFullScienceGitBlobSha,blob(fullPath));
  assert.equal(bound.reviewed.length,2);
  assert.equal(bound.reviewed.filter(x=>x.scientificDecision==='pending').length,1);
  assert.equal(bound.reviewed.filter(x=>x.scientificDecision==='exclude').length,1);
  assert.equal(exceptions.accounting.include,0);
  for(const p of bound.reviewed){
    const s=bySource.get(p.doi);
    assert.equal(p.stageSourceSha256,s.sourceSha256);
    assert.equal(p.stageBatchGitBlobSha,s.reviewQueueGitBlobSha);
    assert.equal(p.sourceRootId,s.sourceRootId);
    assert.equal(p.publisherPage,s.publisherPage);
    assert.ok(!admitted.some(a=>a.doi===p.doi));
  }
  assert.equal(manifest.pending.length,2);
});
function mock(){
  const rootMap=new Map();
  for(const r of source.rows){
    if(!rootMap.has(r.sourceRootId))rootMap.set(r.sourceRootId,[]);
    rootMap.get(r.sourceRootId).push(r);
  }
  const shards=[...rootMap].map(([rootId,rows])=>({
    schemaVersion:'gallery-history-review-triage-v1',
    mode:'review_queue_only_not_publication',rootId,journal:'Nature Communications',
    sourceSha256:rows[0].sourceSha256,gitBlobSha:rows[0].reviewQueueGitBlobSha,
    stats:{candidateOccurrences:rows.length},
    records:rows.map(x=>({
      doi:x.doi,journal:x.journal,title:x.title,date:x.date,
      authors:x.authors,sourceFamilies:x.sourceFamilies,
      flags:x.sourceFlags,priority:'P1'
    }))
  }));
  return {
    state:{schema:'gallery-historical-nightly-staging-v1',
      mode:'candidate_discovery_only',completed:shards.map(s=>s.rootId),cursor:{}},
    triage:{schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
      rootSummaries:Object.fromEntries(shards.map(s=>[s.rootId,{sourceSha256:s.sourceSha256}]))},
    shards,formal:{articles:[],webpageDoiCount:0},
    manifest:{accepted:admitted,pending:[]},
    corrections:{items:[]},publisherReviewedScope:bound,
    journals:[{name:'Nature Communications'}]
  };
}
test('Q3 reviewer census counts all nine original DOI once and never conflates pending with publication',()=>{
  const {coverage,worklist}=reconcileQ3(mock());
  assert.equal(coverage.counters.uniqueSourceDois,9);
  assert.equal(coverage.counters.sourceApprovedWaiting08,7);
  assert.equal(coverage.counters.sourcePublisherReviewedScopeExcluded,1);
  assert.equal(coverage.counters.sourcePublisherReviewedScopePending,1);
  assert.equal(coverage.counters.sourcePending,0);
  assert.equal(coverage.counters.sourceAlreadyPublished,0);
  assert.equal(coverage.counters.sourceExplicitlyExcluded,0);
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
  assert.equal(worklist.totalUnreviewedCandidates,0);
  assert.deepEqual(worklist.publisherScopeEvidencePending.map(x=>x.doi),['10.1038/s41467-026-76617-x']);
  assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
});
test('a mutated reviewer Git blob, authorizer collision, or tampered science decision is rejected',()=>{
  const s=mock();
  const affected=s.shards.findIndex(x=>x.records.some(y=>y.doi==='10.1038/s41467-026-76617-x'));
  assert.ok(affected>=0);
  assert.throws(()=>reconcileQ3({...s,shards:s.shards.map((r,i)=>
    i===affected?{...r,gitBlobSha:'c'.repeat(40)}:r)}),
    /q3_reviewed_scope_provenance_or_science_conflict|q3_invalid_review_shard/);
  assert.throws(()=>reconcileQ3({...s,manifest:{accepted:[admitted[0],admitted[0]],pending:[]}}),
    /q3_formal_doi_partition_conflict/);
  const mutated={...proof,reviewed:proof.reviewed.map((r,i)=>i? r:{...r,scientificDecision:'include'})};
  assert.throws(()=>bindReviewedQ3ScopeProof({proof:mutated,science:exceptions,scienceGitBlobSha:blob(exceptionPath)}),
    /q3_reviewed_scope_proof_row_invalid/);
});
