import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {bindReviewedQ3ScopeProof} from './historical-q3-reviewed-scope-proof.mjs';
import {reconcileQ3} from './historical-q3-reconciliation.mjs';

const read=(p)=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const blobSha=(p)=>{
  const b=readFileSync(new URL('../'+p,import.meta.url));
  return createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex');
};
const ledgerPath='audit/historical-scope-assessments/2026-10-14-nature-catalysis-issues-07-09.json';
const proofPath='audit/historical-reviewed/q3-natcatal-scope-source-proof.json';
const ledger=read(ledgerPath),proof=read(proofPath);
const authority=bindReviewedQ3ScopeProof({
  proof,science:ledger,scienceGitBlobSha:blobSha(ledgerPath)
});

test('all fifteen exact Nature Catalysis scope decisions bind to a frozen science ledger',()=>{
  assert.equal(proof.scientificEvidenceBlobSha,blobSha(ledgerPath));
  assert.equal(authority.reviewed.length,15);
  assert.equal(new Set(authority.reviewed.map(x=>x.doi)).size,15);
  assert.equal(authority.reviewed.filter(x=>x.scientificDecision==='exclude').length,14);
  assert.equal(authority.reviewed.filter(x=>x.scientificDecision==='pending').length,1);
  assert.equal(proof.summary.sourceFamiliesBoth,15);
  assert.ok(authority.reviewed.every(x=>x.sourceFamilies.includes('crossref')&&x.sourceFamilies.includes('openalex')));
});

test('tampering with science hash, decision or source root is rejected before any count changes',()=>{
  const args={proof,science:ledger,scienceGitBlobSha:blobSha(ledgerPath)};
  assert.throws(()=>bindReviewedQ3ScopeProof({...args,scienceGitBlobSha:'a'.repeat(40)}),
    /frozen_science_hash/);
  assert.throws(()=>bindReviewedQ3ScopeProof({...args,proof:{...proof,
    reviewed:proof.reviewed.map((x,i)=>i===0?{...x,scientificDecision:'include'}:x)}}),
    /proof_row_invalid/);
  assert.throws(()=>bindReviewedQ3ScopeProof({...args,proof:{...proof,
    reviewed:proof.reviewed.map((x,i)=>i===0?{...x,sourceShardPath:'wrong.json'}:x)}}),
    /proof_row_invalid/);
  assert.throws(()=>bindReviewedQ3ScopeProof({...args,proof:{...proof,
    reviewed:proof.reviewed.slice(1)}}),/reviewed_set_mismatch/);
});

const doiExcluded='10.1038/s41929-026-01603-x';
const doiPending='10.1038/s41929-026-01608-6';
const selected=authority.reviewed.filter(x=>[doiExcluded,doiPending].includes(x.doi));
const root='2026-08-22_2026-08-31_nature-catalysis';
const sha=selected[0].stageSourceSha256;
const gitSha=selected[0].stageBatchGitBlobSha;
const shard={
  schemaVersion:'gallery-history-review-triage-v1',
  mode:'review_queue_only_not_publication',
  rootId:root,journal:'Nature Catalysis',sourceSha256:sha,gitBlobSha:gitSha,
  stats:{candidateOccurrences:2},
  records:selected.map(x=>({
    doi:x.doi,journal:'Nature Catalysis',title:x.assessment.primaryContribution,
    date:x.date,flags:[],authors:['Hengan Wang'],priority:'P0',
    sourceFamilies:x.sourceFamilies
  }))
};
const mock={
  state:{schema:'gallery-historical-nightly-staging-v1',
    mode:'candidate_discovery_only',completed:[root],
    cursor:{range:{from:'2025-01-01',to:'2025-01-31'},journalIndex:1}},
  triage:{schemaVersion:'gallery-history-review-triage-v1',
    mode:'review_queue_only_not_publication',
    rootSummaries:{[root]:{sourceSha256:sha}}},
  shards:[shard],
  formal:{webpageDoiCount:0,articles:[]},
  manifest:{accepted:[],pending:[]},
  corrections:{items:[]},
  journals:[{name:'Nature Catalysis'}],
  publisherReviewedScope:{...authority,reviewed:selected}
};

test('verified science exclude and pending are not unfinished, approved or owner exclusions',()=>{
  const {coverage,worklist}=reconcileQ3(mock);
  assert.equal(coverage.counters.uniqueSourceDois,2);
  assert.equal(coverage.counters.sourcePublisherReviewedScopeExcluded,1);
  assert.equal(coverage.counters.sourcePublisherReviewedScopePending,1);
  assert.equal(coverage.counters.sourceAlreadyPublished,0);
  assert.equal(coverage.counters.sourceApprovedWaiting08,0);
  assert.equal(coverage.counters.sourcePending,0);
  assert.equal(coverage.counters.sourceExplicitlyExcluded,0);
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
  assert.equal(worklist.totalUnreviewedCandidates,0);
  assert.equal(worklist.publisherScopeEvidencePending.length,1);
  assert.equal(worklist.publisherScopeEvidencePending[0].doi,doiPending);
  assert.equal(worklist.publisherScopeEvidencePending[0].notOriginalManifestPending,true);
});

test('missing source or wrong source Git SHA fails closed rather than reducing queue',()=>{
  assert.throws(()=>reconcileQ3({...mock,shards:[{...shard,gitBlobSha:'f'.repeat(40)}]}),
    /reviewed_scope_provenance/);
  assert.throws(()=>reconcileQ3({...mock,shards:[{...shard,records:[shard.records[0]],
    stats:{candidateOccurrences:1}}]}),/reviewed_scope_provenance/);
  assert.throws(()=>reconcileQ3({...mock,publisherReviewedScope:{...authority,
    reviewed:selected.map((x,i)=>i===0?{...x,date:'2026-08-24'}:x)}}),
    /reviewed_scope_provenance/);
});

test('a later formal DOI or an already-approved DOI overrides stale scope evidence by rejecting collision',()=>{
  assert.throws(()=>reconcileQ3({...mock,formal:{
    webpageDoiCount:1,articles:[{doi:doiPending,journal:'Nature Catalysis',date:'2026-08-25'}]
  }}),/reviewed_scope_provenance/);
  assert.throws(()=>reconcileQ3({...mock,manifest:{
    accepted:[{doi:doiExcluded,date:'2026-08-25'}],pending:[]
  }}),/reviewed_scope_provenance/);
});

test('Q3 remains scientifically unclosed even after all DOI statuses in one shard are decided',()=>{
  const {coverage}=reconcileQ3(mock);
  assert.equal(coverage.counters.missingSourceRoots,11);
  assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
  assert.equal(coverage.reference.notAutomaticInclusionTarget,true);
  assert.equal(coverage.guards.officialPublisherIssueCompletenessNotEstablished,true);
});

test('DOI-exact concise Chinese preparative description is valid scientific evidence, not an empty template',()=>{
  const row=authority.reviewed.find(x=>x.doi==='10.1038/s41929-026-01571-2');
  assert.equal(row.assessment.preparativeTransformation.length,24);
  assert.ok(row.assessment.firstPassReason.length>=40);
  assert.ok(row.assessment.independentChallengeReason.length>=40);
  const sourceRoot=row.sourceRootId;
  const sourceShard={
    ...shard,rootId:sourceRoot,
    sourceSha256:row.stageSourceSha256,
    gitBlobSha:row.stageBatchGitBlobSha,
    stats:{candidateOccurrences:1},
    records:[{
      doi:row.doi,journal:'Nature Catalysis',date:row.date,
      title:row.assessment.primaryContribution,
      sourceFamilies:row.sourceFamilies,flags:[],authors:['One Author'],priority:'P2'
    }]
  };
  const input={
    ...mock,
    state:{...mock.state,completed:[sourceRoot]},
    triage:{...mock.triage,rootSummaries:{
      [sourceRoot]:{sourceSha256:row.stageSourceSha256}
    }},
    shards:[sourceShard],
    publisherReviewedScope:{...authority,reviewed:[row]}
  };
  const result=reconcileQ3(input);
  assert.equal(result.coverage.counters.sourcePublisherReviewedScopeExcluded,1);
  assert.equal(result.coverage.counters.unfinishedQ3OrDateVerification,0);
  assert.equal(result.worklist.totalUnreviewedCandidates,0);
});
