import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reconcileQ3,expectedQ3Roots,Q3_SCHEMA,PUBLISHER_NONRESEARCH_SCHEMA}
  from './historical-q3-reconciliation.mjs';
const journals=[{name:'JOC'},{name:'Chemical Science'}];
const j1='2026-07-01_2026-07-07_joc',
  j2='2026-07-08_2026-07-14_joc',
  rsc='2026-08-01_2026-08-07_chemical-science';
const sha=id=>id===j1?'a'.repeat(64):id===j2?'b'.repeat(64):'c'.repeat(64);
function shard(rootId,journal,records){
  return {schemaVersion:'gallery-history-review-triage-v1',
    mode:'review_queue_only_not_publication',rootId,journal,
    sourceSha256:sha(rootId),stats:{candidateOccurrences:records.length},
    records:records.map(x=>({journal,sourceBatchId:rootId,
      sourceBatchSha256:sha(rootId),sourceFamilies:['crossref'],
      authors:['One Author'],flags:[],priority:'P0',...x}))};
}
const a=shard(j1,'JOC',[
  {doi:'10.1021/acs.joc.6c00001',title:'Real JOC method already published',date:'2026-07-03'},
  {doi:'10.1021/acs.joc.6c00002',title:'Missing online date',date:'',
    flags:['publisher_first_online_date_unverified'],priority:'P3'},
  {doi:'10.1021/acs.joc.6c00003',title:'Earlier-year DOI appears in created July',date:'2026-05-20'},
  {doi:'10.1021/acs.joc.6c00004',title:'Explicit exclusion',date:'2026-07-05'},
  {doi:'10.1021/acs.joc.6c00005',title:'Already two-pass reviewed',date:'2026-07-06'}
]);
const b=shard(j2,'JOC',[
  {doi:'10.1021/acs.joc.6c00001',title:'Real JOC method already published',date:'2026-07-03'},
  {doi:'10.1021/acs.joc.6c00006',title:'Genuine unreviewed synthesis',date:'2026-07-12'}
]);
const c=shard(rsc,'Chemical Science',[
  {doi:'10.1039/d6sc01000a',title:'RSC created in Aug but published date unknown',
    date:'',flags:['publisher_first_online_date_unverified'],priority:'P3'}
]);
const state={schema:'gallery-historical-nightly-staging-v1',
  mode:'candidate_discovery_only',completed:[j1,j2,rsc],
  cursor:{range:{from:'2025-09-01',to:'2025-09-30'},journalIndex:3}};
const triage={schemaVersion:'gallery-history-review-triage-v1',
  mode:'review_queue_only_not_publication',
  rootSummaries:{[j1]:{sourceSha256:sha(j1)},
    [j2]:{sourceSha256:sha(j2)},
    [rsc]:{sourceSha256:sha(rsc)}}};
const formal={webpageDoiCount:2,articles:[
  {doi:'10.1021/acs.joc.6c00001',journal:'JOC',date:'2026-07-03'},
  {doi:'10.1021/acs.joc.6c09999',journal:'JOC',date:'2026-09-14'}
]};
const manifest={accepted:[{doi:'10.1021/acs.joc.6c00005',date:'2026-07-06'}],pending:[]};
const corrections={items:[{doi:'10.1021/acs.joc.6c00004',decision:'exclude'}]};
const input={state,triage,shards:[a,b,c],formal,manifest,corrections,journals};
test('there are exactly four week roots per month, per each of 16 journals',()=>{
  const list=expectedQ3Roots();
  assert.equal(list.length,192);
  assert.equal(new Set(list.map(z=>z.id)).size,192);
  for(const month of ['2026-07','2026-08','2026-09'])
    assert.equal(list.filter(z=>z.month===month).length,64);
  assert.ok(list.some(z=>z.id==='2026-09-22_2026-09-30_joc'));
  assert.ok(list.some(z=>z.id==='2026-08-22_2026-08-31_joc'));
});
test('API root complete does not imply full publisher issue or academic scope',()=>{
  const {coverage,worklist}=reconcileQ3(input);
  assert.equal(coverage.schemaVersion,Q3_SCHEMA);
  assert.equal(coverage.counters.expectedSourceRoots,24);
  assert.equal(coverage.counters.sourceCompletedRoots,3);
  assert.equal(coverage.counters.missingSourceRoots,21);
  assert.equal(coverage.counters.candidateOccurrences,8);
  assert.equal(coverage.counters.uniqueSourceDois,7);
  assert.equal(coverage.counters.duplicateSourceDoiOccurrences,1);
  assert.equal(coverage.counters.formalQ3Count,2);
  assert.equal(coverage.counters.missingFormalQ3FromSource,1);
  assert.equal(coverage.reference.formalMinusHypothesis,-998);
  assert.equal(coverage.reference.actualMissingEligibleCountUnknown,true);
  assert.equal(coverage.guards.officialPublisherIssueCompletenessNotEstablished,true);
  assert.equal(worklist.noCloudflareD1Access,true);
});
test('RSC source created dates are never silently interpreted as online dates',()=>{
  const {coverage,worklist}=reconcileQ3(input);
  assert.equal(coverage.counters.apiDatedQ3Candidates,4);
  assert.equal(coverage.counters.unknownPublisherOnlineDate,2);
  assert.equal(coverage.counters.knownOutsideQ3,1);
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,3);
  assert.equal(worklist.totalUnreviewedCandidates,3);
  assert.equal(worklist.rows.filter(z=>!z.apiDateCandidate).length,2);
  assert.equal(coverage.counters.reviewedQ3Waiting08,1);
});
test('current published, double-reviewed and explicit corrections do not enter reviewer worklist',()=>{
  const {coverage,worklist}=reconcileQ3(input);
  assert.equal(coverage.counters.sourceAlreadyPublished,1);
  assert.equal(coverage.counters.sourceApprovedWaiting08,1);
  assert.equal(coverage.counters.sourceExplicitlyExcluded,1);
  assert.equal(worklist.rows.some(z=>z.doi==='10.1021/acs.joc.6c00001'),false);
  assert.equal(worklist.rows.some(z=>z.doi==='10.1021/acs.joc.6c00005'),false);
  assert.equal(worklist.rows.some(z=>z.doi==='10.1021/acs.joc.6c00004'),false);
  assert.ok(worklist.rows.every(z=>z.scopeReview.includes('two_pass')));
});
test('month/journal rotation and pagination preserve every unfinished DOI exactly once',()=>{
  const all=reconcileQ3({...input,limit:3,page:0}).worklist;
  const pages=Array.from({length:3},(_,i)=>
    reconcileQ3({...input,limit:1,page:i}).worklist.rows[0].doi);
  assert.equal(new Set(pages).size,3);
  assert.deepEqual(new Set(pages),new Set(all.rows.map(z=>z.doi)));
  assert.equal(all.nextPage,null);
  const first=reconcileQ3({...input,limit:1,page:0}).worklist;
  assert.equal(first.nextPage,1);
  assert.equal(first.pageSize,1);
});
test('bad source fingerprint, DOI collision or forced benchmark fail closed',()=>{
  assert.throws(()=>reconcileQ3({...input,shards:[{...a,sourceSha256:'bad'},b,c]}),
    /q3_invalid_review_shard/);
  assert.throws(()=>reconcileQ3({...input,limit:401}),
    /q3_reference_or_page_invalid/);
  assert.throws(()=>reconcileQ3({...input,reference:1200}),
    /q3_reference_or_page_invalid/);
  assert.throws(()=>reconcileQ3({...input,
    manifest:{accepted:[{doi:'10.1021/acs.joc.6c00005'}],
      pending:[{doi:'10.1021/acs.joc.6c00005'}]}}),
    /q3_formal_doi_partition_conflict/);
  assert.throws(()=>reconcileQ3({...input,
    formal:{webpageDoiCount:3,articles:formal.articles}}),
    /q3_invalid_formal_authority/);
});

test('five publisher-verified non-original research DOI remain source-counted but not academically unfinished',()=>{
  const review={
    doi:'10.1021/acs.joc.6c00006',
    journal:'JOC',
    date:'2026-07-12',
    title:'Genuine unreviewed synthesis',
    publisherArticleType:'News & Views',
    decision:'exclude',firstPassDecision:'exclude',challengeDecision:'exclude',
    reviewPasses:2,
    firstPassReason:'Publisher explicitly labels the DOI as a News & Views commentary, rather than an original experimental organic-synthesis research article.',
    independentChallengeReason:'Even if the title contains a relevant synthesis transformation, the experiment was published under another distinct original DOI; do not create duplicate synthesis cards from commentary.',
    reviewEvidence:{
      publisherPage:'https://pubs.acs.org/doi/10.1021/acs.joc.6c00006',
      publisherArticleType:'News & Views',publisherArticleDate:'2026-07-12',
      sourceRootId:j2,stageSourceSha256:sha(j2),stageBatchGitBlobSha:'e'.repeat(40),
      verificationKind:'publisher_direct_article_type_and_original_work_provenance'
    }
  };
  const publisherNonResearch={
    schemaVersion:PUBLISHER_NONRESEARCH_SCHEMA,
    mode:'publisher_verified_non_original_doi_only_not_publication',
    reviewed:[review]
  };
  const {coverage,worklist}=reconcileQ3({...input,publisherNonResearch});
  assert.equal(coverage.counters.uniqueSourceDois,7,'the DOI remains present in the source census');
  assert.equal(coverage.counters.sourcePublisherNonResearchExcluded,1);
  assert.equal(coverage.counters.sourceExplicitlyExcluded,1,'owner DOI corrections stay separate');
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,2);
  assert.equal(worklist.verifiedPublisherNonResearchExcluded,1);
  assert.ok(!worklist.rows.some(x=>x.doi===review.doi));
  assert.equal(worklist.noAutomaticAcademicDecision,true);
  assert.equal(coverage.guards.publisherNonResearchExclusionsAreDOISpecificOnly,true);
  assert.throws(()=>reconcileQ3({...input,publisherNonResearch:{
    ...publisherNonResearch,reviewed:[{...review,reviewEvidence:{
      ...review.reviewEvidence,publisherArticleType:'Article'
    }}]}}),/q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...input,publisherNonResearch:{
    ...publisherNonResearch,reviewed:[{...review,reviewEvidence:{
      ...review.reviewEvidence,publisherPage:'https://www.example.com/not-same-paper'
    }}]}}),/q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...input,publisherNonResearch:{
    ...publisherNonResearch,reviewed:[{...review,reviewEvidence:{
      ...review.reviewEvidence,stageSourceSha256:'0'.repeat(64)
    }}]}}),/q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...input,publisherNonResearch:{
    ...publisherNonResearch,reviewed:[{...review,date:'2026-07-13'}]
  }}),/q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...input,publisherNonResearch:{
    ...publisherNonResearch,reviewed:[review,review]
  }}),/q3_nonresearch_doi_missing_or_colliding/);
  assert.throws(()=>reconcileQ3({...input,publisherNonResearch:{
    ...publisherNonResearch,reviewed:[{...review,doi:'10.1021/acs.joc.6c00001'}]
  }}),/q3_nonresearch_doi_missing_or_colliding/);
  assert.throws(()=>reconcileQ3({...input,publisherNonResearch:{reviewed:[]}}),
    /q3_nonresearch_ledger_untrusted_schema/);
});
