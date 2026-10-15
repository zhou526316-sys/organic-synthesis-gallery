import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {bindReviewedQ3ScopeProof} from './historical-q3-reviewed-scope-proof.mjs';
import {reconcileQ3} from './historical-q3-reconciliation.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const sha=path=>{
  const bytes=readFileSync(new URL('../'+path,import.meta.url));
  return createHash('sha1').update('blob '+bytes.length)
    .update(Buffer.from([0])).update(bytes).digest('hex');
};
const scienceFile='audit/historical-scope-assessments/2026-10-15-natcomm-two-academic-exceptions.json';
const fullFile='audit/historical-scope-assessments/2026-10-15-natcomm-five-original-two-pass.json';
const sourceFile='audit/historical-reviewed/q3-natcomm-five-source-proof-20261015.json';
const proofFile='audit/historical-reviewed/q3-natcomm-two-academic-exceptions-source-proof.json';
const science=read(scienceFile),full=read(fullFile),source=read(sourceFile),proof=read(proofFile);
const bound=bindReviewedQ3ScopeProof({proof,science,scienceGitBlobSha:sha(scienceFile)});
const sourceMap=new Map(source.rows.map(x=>[x.doi,x]));
const admissions=read('audit/historical-reviewed/approved-admissions.json');

test('two exception DOI science records are distinct from three real fixed-slot academic approvals',()=>{
  assert.equal(proof.scientificEvidenceBlobSha,sha(scienceFile));
  assert.equal(proof.originalSourceProofGitBlobSha,sha(sourceFile));
  assert.equal(science.parentFullScienceGitBlobSha,sha(fullFile));
  assert.equal(sourceMap.size,5);
  assert.equal(full.accounting.include,3);
  assert.equal(science.accounting.assessmentCount,2);
  assert.equal(science.accounting.include,0);
  assert.equal(science.accounting.exclude,1);
  assert.equal(science.accounting.evidencePending,1);
  assert.equal(bound.reviewed.length,2);
  const ids=new Set(bound.reviewed.map(x=>x.doi));
  const manifest=new Map(admissions.accepted.map(x=>[x.doi,x]));
  const fullInclude=full.assessments.filter(x=>x.decision==='include');
  assert.equal(fullInclude.length,3);
  for(const x of fullInclude){
    assert.ok(manifest.has(x.doi),'three accepted Q3 original methods must be preserved');
    assert.ok(!ids.has(x.doi),'an approved paper must not be recast as pending or excluded');
    assert.equal(manifest.get(x.doi).date,sourceMap.get(x.doi).firstOnline);
  }
  assert.equal(admissions.pending.length,2,'original publication-day pending remains separate');
  assert.ok(admissions.summary.include>=128);
});

test('immutable source proof checks publisher day and review shard hashes on both academic holds',()=>{
  for(const x of bound.reviewed){
    const src=sourceMap.get(x.doi),p=x.assessment;
    assert.ok(src&&p);
    assert.equal(src.publisherType,'Article');
    assert.equal(src.officialPage,x.publisherPage);
    assert.equal(src.firstOnline,x.date);
    assert.equal(src.sourceBatchSha256,x.stageSourceSha256);
    assert.equal(src.reviewQueueGitBlobSha,x.stageBatchGitBlobSha);
    assert.equal(x.sourceShardPath,'audit/historical-staging/review-queue/'+x.sourceRootId+'.json');
    assert.deepEqual(new Set(x.sourceFamilies),new Set(['crossref','openalex']));
    assert.match(src.rawSourceGitBlobSha,/^[0-9a-f]{40}$/);
    assert.equal(x.scientificDecision,p.decision);
    assert.equal(p.reviewPasses,2);
    assert.notEqual(p.firstPassReason,p.independentChallengeReason);
    assert.ok(p.primaryContribution.length>=10);
    assert.ok(p.preparativeTransformation.length>=10);
    assert.ok(p.generalityEvidence.length>=10);
  }
  const pending=bound.reviewed.filter(x=>x.scientificDecision==='pending');
  assert.equal(pending.length,1);
  assert.equal(pending[0].doi,'10.1038/s41467-026-75484-w');
  assert.ok(pending[0].assessment.nextAction.length>=40);
  assert.equal(pending[0].assessment.missingEvidenceMustNotMeanNoEvidenceExists,true);
  const excluded=bound.reviewed.filter(x=>x.scientificDecision==='exclude');
  assert.equal(excluded[0].doi,'10.1038/s41467-026-75547-y');
});

function mock(){
  const shards=bound.reviewed.map(x=>({
    schemaVersion:'gallery-history-review-triage-v1',
    mode:'review_queue_only_not_publication',
    rootId:x.sourceRootId,journal:'Nature Communications',
    sourceSha256:x.stageSourceSha256,gitBlobSha:x.stageBatchGitBlobSha,
    stats:{candidateOccurrences:1},
    records:[{doi:x.doi,journal:'Nature Communications',title:x.assessment.title,
      date:x.date,priority:'P2',flags:[],authors:['Publisher verified'],
      sourceFamilies:x.sourceFamilies}]
  }));
  return {
    state:{schema:'gallery-historical-nightly-staging-v1',
      mode:'candidate_discovery_only',completed:shards.map(x=>x.rootId),cursor:{}},
    triage:{schemaVersion:'gallery-history-review-triage-v1',
      mode:'review_queue_only_not_publication',
      rootSummaries:Object.fromEntries(shards.map(x=>[x.rootId,{sourceSha256:x.sourceSha256}]))},
    shards,formal:{articles:[],webpageDoiCount:0},
    manifest:{accepted:[],pending:[]},corrections:{items:[]},
    publisherReviewedScope:bound,
    journals:[{name:'Nature Communications'}]
  };
}

test('one exclusion and one evidence hold remain in DOI census but no longer masquerade as unreviewed',()=>{
  const {coverage,worklist}=reconcileQ3(mock());
  assert.equal(coverage.counters.uniqueSourceDois,2);
  assert.equal(coverage.counters.sourcePublisherReviewedScopeExcluded,1);
  assert.equal(coverage.counters.sourcePublisherReviewedScopePending,1);
  assert.equal(coverage.counters.sourceExplicitlyExcluded,0);
  assert.equal(coverage.counters.sourcePending,0);
  assert.equal(coverage.counters.sourceApprovedWaiting08,0);
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
  assert.equal(worklist.totalUnreviewedCandidates,0);
  assert.equal(worklist.publisherScopeEvidencePending.length,1);
  assert.equal(worklist.publisherScopeEvidencePending[0].notOriginalManifestPending,true);
  assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
});

test('tampered reviewer SHA, false scientific date or duplicate scope DOI fail closed',()=>{
  const src=mock();
  assert.throws(()=>reconcileQ3({...src,shards:src.shards.map((r,i)=>
    i===0?{...r,gitBlobSha:'f'.repeat(40)}:r)}),/reviewed_scope_provenance/);
  assert.throws(()=>reconcileQ3({...src,publisherReviewedScope:{...bound,
    reviewed:bound.reviewed.map((r,i)=>i===0?{...r,date:'2026-09-11'}:r)}}),
    /reviewed_scope_provenance/);
  assert.throws(()=>reconcileQ3({...src,publisherReviewedScope:{...bound,
    reviewed:[...bound.reviewed,bound.reviewed[0]]}}),
    /reviewed_scope_provenance/);
  assert.throws(()=>bindReviewedQ3ScopeProof({
    proof:{...proof,scientificEvidenceBlobSha:'0'.repeat(40)},
    science,scienceGitBlobSha:sha(scienceFile)
  }),/frozen_science_hash/);
});
