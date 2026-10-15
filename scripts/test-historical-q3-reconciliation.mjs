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


test('Chem publisher secondary records retain frozen source counts but leave the academic queue',()=>{
  const jul='2026-07-01_2026-07-07_chem',aug='2026-08-01_2026-08-07_chem';
  const journal={name:'Chem'};
  const sh1=shard(jul,'Chem',[
    {doi:'10.1016/j.chempr.2026.103152',title:'Relay energy transfer Preview',
      date:'2026-07-01'}
  ]);
  const sh2=shard(aug,'Chem',[
    {doi:'10.1016/j.chempr.2026.103106',title:'Original title retained by Erratum',
      date:'2026-08-01'},
    {doi:'10.1016/j.chempr.2026.103197',title:'Ni radical coupling Preview',
      date:'2026-08-01'}
  ]);
  const extended={...input,journals:[...journals,journal],
    state:{...state,completed:[...state.completed,jul,aug]},
    triage:{...triage,rootSummaries:{...triage.rootSummaries,
      [jul]:{sourceSha256:sha(jul)},[aug]:{sourceSha256:sha(aug)}}},
    shards:[...input.shards,sh1,sh2]};
  const sources=[
    {doi:sh1.records[0].doi,title:sh1.records[0].title,
      date:'2026-07-01',root:jul,issue:'2026-07-09',
      kind:'Preview',pii:'S2451929426002184',
      original:'10.1126/science.aeb8506'},
    {doi:sh2.records[0].doi,title:sh2.records[0].title,
      date:'2026-08-01',root:aug,issue:'2026-08-13',
      kind:'Erratum',pii:'S2451929426001725',
      original:'10.1016/j.chempr.2026.102990'},
    {doi:sh2.records[1].doi,title:sh2.records[1].title,
      date:'2026-08-01',root:aug,issue:'2026-08-13',
      kind:'Preview',pii:'S2451929426002639',
      original:'10.1126/science.aef6981'}
  ];
  const rows=sources.map(x=>({
    doi:x.doi,title:x.title,date:x.date,journal:'Chem',
    underlyingOriginalResearchDoi:x.original,
    publisherArticleType:x.kind,
    decision:'exclude',firstPassDecision:'exclude',challengeDecision:'exclude',
    reviewPasses:2,
    firstPassReason:'Publisher confirms this is a secondary Preview or Erratum rather than the original experimental synthetic-method Article.',
    independentChallengeReason:'Although the title describes an important organic synthesis, a distinct original article owns the evidence; counting the secondary DOI would duplicate published research.',
    reviewEvidence:{
      publisherPage:'https://www.sciencedirect.com/science/article/pii/'+x.pii,
      publisherDoi:x.doi,publisherArticleType:x.kind,
      publisherArticleDate:null,frozenSourceDate:x.date,
      sourceDateNotPublisherFirstOnline:true,
      publisherFirstOnlineDateVerified:false,
      publisherIssueDate:x.issue,
      underlyingOriginalResearchDoi:x.original,
      sourceRootId:x.root,stageSourceSha256:sha(x.root),
      stageBatchGitBlobSha:'f'.repeat(40),
      verificationKind:'publisher_direct_article_type_and_original_work_provenance'
    }
  }));
  const publisherNonResearch={
    schemaVersion:PUBLISHER_NONRESEARCH_SCHEMA,
    mode:'publisher_verified_non_original_doi_only_not_publication',
    reviewed:rows
  };
  const baseline=reconcileQ3(extended);
  const checked=reconcileQ3({...extended,publisherNonResearch});
  assert.equal(checked.coverage.counters.uniqueSourceDois,
    baseline.coverage.counters.uniqueSourceDois);
  assert.equal(checked.coverage.counters.sourcePublisherNonResearchExcluded,3);
  assert.equal(checked.coverage.counters.unfinishedQ3OrDateVerification,
    baseline.coverage.counters.unfinishedQ3OrDateVerification-3);
  for(const x of sources)
    assert.ok(!checked.worklist.rows.some(r=>r.doi===x.doi),
      'secondary DOI must not reappear in academic worklist');
  assert.equal(checked.coverage.guards.officialPublisherIssueCompletenessNotEstablished,true);
  const broken=(i,mutation)=>({...publisherNonResearch,
    reviewed:rows.map((r,n)=>n===i?{...r,reviewEvidence:{
      ...r.reviewEvidence,...mutation}}:r)});
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:broken(0,{publisherPage:'https://www.example.com/science/article/pii/S2451929426002184'})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:broken(0,{publisherDoi:'10.1016/j.chempr.2026.999999'})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:broken(1,{publisherArticleDate:'2026-08-01'})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:broken(2,{publisherFirstOnlineDateVerified:true})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:broken(2,{underlyingOriginalResearchDoi:'10.1126/science.not-original'})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:broken(0,{stageSourceSha256:'0'.repeat(64)})}),
    /q3_nonresearch_publisher_evidence_invalid/);
});


test('Chem publisher Perspectives and Insights are evidence-bound and cannot invent a single original DOI',()=>{
  const aug='2026-08-01_2026-08-07_chem';
  const sep='2026-09-01_2026-09-07_chem';
  const cases=[
    {doi:'10.1016/j.chempr.2026.103187',title:'Recent applications of axially chiral skeletons',
      bucket:aug,date:'2026-08-01',issue:'2026-08-13',
      pii:'S2451929426002536',type:'Perspective',original:null,
      relation:'multi_study_perspective'},
    {doi:'10.1016/j.chempr.2026.103195',title:'Trading an atom for another',
      bucket:aug,date:'2026-08-01',issue:'2026-08-13',
      pii:'S2451929426002615',type:'Insights',original:null,
      relation:'editorial_insight_not_original_article'},
    {doi:'10.1016/j.chempr.2026.103218',title:'One catalyst, two geometries',
      bucket:sep,date:'2026-09-01',issue:'2026-09-10',
      pii:'S2451929426002846',type:'Preview',
      original:'10.1016/j.checat.2026.101803',relation:'distinct_original_report'},
    {doi:'10.1016/j.chempr.2026.103250',title:'Exploration of new sites',
      bucket:sep,date:'2026-09-01',issue:'2026-09-10',
      pii:'S2451929426003165',type:'Preview',
      original:'10.1038/s41586-026-10931-8',relation:'distinct_original_report'}
  ];
  const shAug=shard(aug,'Chem',cases.filter(x=>x.bucket===aug)
    .map(x=>({doi:x.doi,title:x.title,date:x.date})));
  const shSep=shard(sep,'Chem',cases.filter(x=>x.bucket===sep)
    .map(x=>({doi:x.doi,title:x.title,date:x.date})));
  const extended={...input,journals:[...journals,{name:'Chem'}],
    state:{...state,completed:[...state.completed,aug,sep]},
    triage:{...triage,rootSummaries:{...triage.rootSummaries,
      [aug]:{sourceSha256:sha(aug)},
      [sep]:{sourceSha256:sha(sep)}}},
    shards:[...input.shards,shAug,shSep]};
  const rows=cases.map(x=>({
    doi:x.doi,journal:'Chem',title:x.title,date:x.date,
    publisherArticleType:x.type,underlyingOriginalResearchDoi:x.original,
    decision:'exclude',firstPassDecision:'exclude',challengeDecision:'exclude',reviewPasses:2,
    firstPassReason:'Original publisher labels this DOI as secondary publisher content; its main scientific result is a review or interpretative editorial, not an independently reported reaction.',
    independentChallengeReason:'A synthetic transformation mentioned in a title does not make a publisher-designated Preview/Perspective/Insights into a new primary source of reaction evidence or synthesis scope.',
    reviewEvidence:{
      publisherPage:'https://www.sciencedirect.com/science/article/abs/pii/'+x.pii,
      publisherDoi:x.doi,publisherArticleType:x.type,
      publisherArticleDate:null,publisherFirstOnlineDateVerified:false,
      sourceDateNotPublisherFirstOnline:true,frozenSourceDate:x.date,
      publisherIssueDate:x.issue,underlyingOriginalResearchDoi:x.original,
      originalResearchRelation:x.relation,sourceRootId:x.bucket,
      stageSourceSha256:sha(x.bucket),
      stageBatchGitBlobSha:'e'.repeat(40),
      verificationKind:'publisher_direct_article_type_and_original_work_provenance'
    }
  }));
  const publisherNonResearch={
    schemaVersion:PUBLISHER_NONRESEARCH_SCHEMA,
    mode:'publisher_verified_non_original_doi_only_not_publication',
    reviewed:rows
  };
  const before=reconcileQ3(extended);
  const after=reconcileQ3({...extended,publisherNonResearch});
  assert.equal(after.coverage.counters.uniqueSourceDois,before.coverage.counters.uniqueSourceDois);
  assert.equal(after.coverage.counters.sourcePublisherNonResearchExcluded,4);
  assert.equal(after.coverage.counters.unfinishedQ3OrDateVerification,
    before.coverage.counters.unfinishedQ3OrDateVerification-4);
  for(const paper of cases)assert.equal(after.worklist.rows.some(x=>x.doi===paper.doi),false);
  assert.equal(after.coverage.guards.officialPublisherIssueCompletenessNotEstablished,true);
  const mutation=(idx,patch)=>({...publisherNonResearch,reviewed:rows.map((item,i)=>
    i===idx?{...item,reviewEvidence:{...item.reviewEvidence,...patch}}:item)});
  assert.throws(()=>reconcileQ3({...extended,publisherNonResearch:mutation(0,
    {originalResearchRelation:'editorial_insight_not_original_article'})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,publisherNonResearch:mutation(1,
    {originalResearchRelation:'multi_study_perspective'})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,publisherNonResearch:mutation(2,
    {underlyingOriginalResearchDoi:null})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,publisherNonResearch:mutation(3,
    {publisherFirstOnlineDateVerified:true})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,publisherNonResearch:mutation(0,
    {publisherPage:'https://fake.example.com/article/pii/S2451929426002536'})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,publisherNonResearch:mutation(0,
    {stageSourceSha256:'0'.repeat(64)})}),
    /q3_nonresearch_publisher_evidence_invalid/);
});


test('three DOI-specific Chem Review/Perspective receipts remove only nonoriginal review work, retain original source count',()=>{
  const roots=['2026-07-01_2026-07-07_chem',
    '2026-08-01_2026-08-07_chem','2026-09-01_2026-09-07_chem'];
  const papers=[
    {doi:'10.1016/j.chempr.2026.103027',title:'DT C–H process Perspective',
      root:roots[0],date:'2026-07-01',issue:'2026-07-09',
      pii:'S2451929426000938',type:'Perspective',
      relation:'multi_study_perspective'},
    {doi:'10.1016/j.chempr.2026.103070',title:'Visible light carbonylation Review',
      root:roots[1],date:'2026-08-01',issue:'2026-08-13',
      pii:'S2451929426001361',type:'Review',relation:'multi_study_review'},
    {doi:'10.1016/j.chempr.2026.103209',title:'CuAAC dynamic catalysis Perspective',
      root:roots[2],date:'2026-09-01',issue:'2026-09-10',
      pii:'S2451929426002755',type:'Perspective',
      relation:'multi_study_perspective'}
  ];
  const shards=papers.map(p=>shard(p.root,'Chem',[{doi:p.doi,title:p.title,date:p.date}]));
  const extended={...input,journals:[...journals,{name:'Chem'}],
    state:{...state,completed:[...state.completed,...roots]},
    triage:{...triage,rootSummaries:{...triage.rootSummaries,
      ...Object.fromEntries(roots.map(id=>[id,{sourceSha256:sha(id)}]))}},
    shards:[...input.shards,...shards]};
  const reviewed=papers.map(p=>({
    doi:p.doi,journal:'Chem',title:p.title,date:p.date,
    publisherArticleType:p.type,underlyingOriginalResearchDoi:null,
    decision:'exclude',firstPassDecision:'exclude',challengeDecision:'exclude',reviewPasses:2,
    firstPassReason:'The Chem publisher classifies this as a Review or Perspective collecting prior research and original work published under other DOIs, not a new preparative experiment.',
    independentChallengeReason:'Although the title mentions an important synthesis class, original DOI-specific chemistry resides in underlying cited literature and does not become a new synthetic-method Article.',
    reviewEvidence:{
      publisherPage:'https://www.sciencedirect.com/science/article/pii/'+p.pii,
      publisherDoi:p.doi,publisherArticleType:p.type,
      publisherArticleDate:null,publisherFirstOnlineDateVerified:false,
      sourceDateNotPublisherFirstOnline:true,frozenSourceDate:p.date,
      publisherIssueDate:p.issue,underlyingOriginalResearchDoi:null,
      originalResearchRelation:p.relation,sourceRootId:p.root,
      stageSourceSha256:sha(p.root),stageBatchGitBlobSha:'d'.repeat(40),
      verificationKind:'publisher_direct_article_type_and_original_work_provenance'
    }
  }));
  const publisherNonResearch={
    schemaVersion:PUBLISHER_NONRESEARCH_SCHEMA,
    mode:'publisher_verified_non_original_doi_only_not_publication',reviewed
  };
  const before=reconcileQ3(extended);
  const after=reconcileQ3({...extended,publisherNonResearch});
  assert.equal(after.coverage.counters.uniqueSourceDois,before.coverage.counters.uniqueSourceDois);
  assert.equal(after.coverage.counters.sourcePublisherNonResearchExcluded,3);
  assert.equal(after.coverage.counters.unfinishedQ3OrDateVerification,
    before.coverage.counters.unfinishedQ3OrDateVerification-3);
  assert.equal(after.coverage.counters.publisherIssueResearchReconciliationComplete,false);
  for(const x of papers)assert.ok(!after.worklist.rows.some(p=>p.doi===x.doi));
  const mutation=(id,patch)=>({...publisherNonResearch,
    reviewed:reviewed.map((x,i)=>i!==id?x:{...x,reviewEvidence:{...x.reviewEvidence,...patch}})});
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:mutation(1,{originalResearchRelation:'multi_study_perspective'})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:mutation(0,{originalResearchRelation:'multi_study_review'})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:mutation(2,{publisherFirstOnlineDateVerified:true})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:mutation(1,{stageSourceSha256:'0'.repeat(64)})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:mutation(1,{publisherPage:'https://wrong.example/pii/S2451929426001361'})}),
    /q3_nonresearch_publisher_evidence_invalid/);
});


test('two Chem Preview papers cite distinct Nature publisher original DOIs, not new Q3 synthesis cards',()=>{
  const july='2026-07-01_2026-07-07_chem';
  const sep='2026-09-01_2026-09-07_chem';
  const inputPapers=[
    {doi:'10.1016/j.chempr.2026.103146',
      root:july,date:'2026-07-01',issue:'2026-07-09',
      title:'Low-pressure CO2 insertion chemistry Preview',
      pii:'S2451929426002123',original:'10.1038/s41557-026-02098-6'},
    {doi:'10.1016/j.chempr.2026.103219',
      root:sep,date:'2026-09-01',issue:'2026-09-10',
      title:'Molecular recognition ionic liquid Preview',
      pii:'S2451929426002858',original:'10.1038/s41893-026-01832-9'}
  ];
  const extraShards=inputPapers.map(x=>shard(x.root,'Chem',[
    {doi:x.doi,title:x.title,date:x.date}
  ]));
  const extended={...input,journals:[...journals,{name:'Chem'}],
    state:{...state,completed:[...state.completed,july,sep]},
    triage:{...triage,rootSummaries:{...triage.rootSummaries,
      [july]:{sourceSha256:sha(july)},[sep]:{sourceSha256:sha(sep)}}},
    shards:[...input.shards,...extraShards]};
  const reviewed=inputPapers.map(x=>({
    doi:x.doi,title:x.title,journal:'Chem',date:x.date,
    underlyingOriginalResearchDoi:x.original,publisherArticleType:'Preview',
    decision:'exclude',firstPassDecision:'exclude',challengeDecision:'exclude',
    reviewPasses:2,
    firstPassReason:'The original publisher identifies a secondary commentary on Nature original research; this DOI has no independently reported new preparative chemistry.',
    independentChallengeReason:'The original paper has important reaction/kinetic studies, but this Preview is not the primary source of its data. Do not duplicate an original method or shift first online.',
    reviewEvidence:{publisherPage:'https://www.sciencedirect.com/science/article/abs/pii/'+x.pii,
      publisherDoi:x.doi,publisherArticleType:'Preview',
      publisherArticleDate:null,publisherFirstOnlineDateVerified:false,
      sourceDateNotPublisherFirstOnline:true,frozenSourceDate:x.date,
      publisherIssueDate:x.issue,underlyingOriginalResearchDoi:x.original,
      sourceRootId:x.root,stageSourceSha256:sha(x.root),stageBatchGitBlobSha:'a'.repeat(40),
      verificationKind:'publisher_direct_article_type_and_original_work_provenance'
    }
  }));
  const publisherNonResearch={
    schemaVersion:PUBLISHER_NONRESEARCH_SCHEMA,
    mode:'publisher_verified_non_original_doi_only_not_publication',reviewed
  };
  const before=reconcileQ3(extended);
  const after=reconcileQ3({...extended,publisherNonResearch});
  assert.equal(after.coverage.counters.uniqueSourceDois,before.coverage.counters.uniqueSourceDois);
  assert.equal(after.coverage.counters.sourcePublisherNonResearchExcluded,2);
  assert.equal(after.coverage.counters.unfinishedQ3OrDateVerification,
    before.coverage.counters.unfinishedQ3OrDateVerification-2);
  for(const x of inputPapers)assert.ok(!after.worklist.rows.some(y=>y.doi===x.doi));
  assert.equal(after.coverage.counters.publisherIssueResearchReconciliationComplete,false);
  const broken=(idx,props)=>({...publisherNonResearch,reviewed:reviewed.map((x,i)=>
    i===idx?{...x,reviewEvidence:{...x.reviewEvidence,...props}}:x)});
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:broken(0,{publisherDoi:'10.1016/j.chempr.2026.100000'})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:broken(0,{publisherFirstOnlineDateVerified:true})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:broken(1,{underlyingOriginalResearchDoi:null})}),
    /q3_nonresearch_publisher_evidence_invalid/);
  assert.throws(()=>reconcileQ3({...extended,
    publisherNonResearch:broken(1,{publisherPage:'https://fake.example/abs/pii/S2451929426002858'})}),
    /q3_nonresearch_publisher_evidence_invalid/);
});
