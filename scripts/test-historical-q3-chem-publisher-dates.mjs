import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  reconcileQ3,CHEM_ONLINE_DATE_SCHEMA
} from './historical-q3-reconciliation.mjs';
import {validateHistoricalApproval} from './lib/historical-admission.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const blob=p=>{
  const b=readFileSync(new URL('../'+p,import.meta.url));
  return createHash('sha1').update('blob '+b.length)
    .update(Buffer.from([0])).update(b).digest('hex');
};
const recordPath='audit/historical-publisher-dates/2026/chem-five-first-online-reconciled.json';
const sciencePath='audit/historical-scope-assessments/2026-10-15-chem-three-q3-methods-two-pass.json';
const proof=read(recordPath),science=read(sciencePath);
const authorized=read('audit/historical-reviewed/approved-admissions.json');
const items=new Map(proof.rows.map(x=>[x.doi,x]));
const expectedNew=[
  ['10.1016/j.chempr.2026.103211','2026-08-21','2026-08-01'],
  ['10.1016/j.chempr.2026.103215','2026-08-31','2026-08-01'],
  ['10.1016/j.chempr.2026.103249','2026-09-16','2026-09-01']
];
const correctQ1=[
  ['10.1016/j.chempr.2026.102968','2026-03-26','2026-08-01'],
  ['10.1016/j.chempr.2026.102990','2026-03-27','2026-08-01']
];

test('exact five Chem DOI publisher-first-online dates are distinguished from frozen issue-day candidates',()=>{
  assert.equal(proof.schemaVersion,CHEM_ONLINE_DATE_SCHEMA);
  assert.equal(items.size,5);
  assert.equal(proof.verifiedOutsideQ3,2);
  assert.equal(proof.verifiedInsideQ3,3);
  for(const [doi,actual,frozen] of [...correctQ1,...expectedNew]){
    const r=items.get(doi);
    assert.ok(r,doi);
    assert.equal(r.publisherFirstOnlineDate,actual);
    assert.equal(r.sourceDate,frozen);
    assert.equal(r.doiResolver,'https://doi.org/'+doi);
    assert.equal(r.officialPublisherArticlePage.startsWith('https://www.sciencedirect.com/science/article/pii/S2451929426'),true);
    assert.match(r.originalSourceBatchGitBlobSha,/^[0-9a-f]{40}$/);
    assert.match(r.reviewQueueGitBlobSha,/^[0-9a-f]{40}$/);
    assert.match(r.sourceRootSha256,/^[0-9a-f]{64}$/);
    assert.equal(r.originalDateFrozenAndUnmodified,true);
  }
  for(const [doi] of correctQ1)assert.equal(items.get(doi).verifiedPublicationQuarter,'2026-Q1');
  for(const [doi] of expectedNew)assert.equal(items.get(doi).verifiedPublicationQuarter,'2026-Q3');
});
test('source-reviewed Chem includes have actual first online and original Chinese/bibliographic record',()=>{
  const selected=authorized.accepted.filter(x=>items.has(x.doi));
  assert.equal(selected.length,3);
  assert.equal(authorized.summary.include,authorized.accepted.length);
  assert.ok(authorized.summary.include>=122,'three new Chem methods retained');
  assert.equal(authorized.summary.pending,2);
  assert.equal(authorized.summary.checked,authorized.accepted.length+authorized.pending.length);
  assert.equal(authorized.nextEligiblePublicationSlot,'2026-10-16T08:00:00+08:00');
  assert.equal(validateHistoricalApproval(authorized).length,authorized.accepted.length);
  assert.equal(science.dateEvidenceGitBlobSha,blob(recordPath));
  assert.equal(science.counts.include,3);
  const manifestSet=new Set(selected.map(x=>x.doi));
  for(const row of science.assessments){
    assert.ok(manifestSet.has(row.doi));
    const a=selected.find(x=>x.doi===row.doi),p=items.get(row.doi);
    assert.equal(row.date,p.publisherFirstOnlineDate);
    assert.equal(a.date,row.date);
    assert.equal(a.reviewEvidence.firstOnlineDateEvidence.stageApiDate,p.sourceDate);
    assert.equal(a.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline,p.publisherFirstOnlineDate);
    assert.equal(a.reviewEvidence.stageBatchSha,p.originalSourceBatchGitBlobSha);
    assert.equal(a.reviewEvidence.sourceReviewQueueGitBlobSha,p.reviewQueueGitBlobSha);
    assert.equal(a.reviewEvidence.publisherOnlineDate,p.publisherFirstOnlineDate);
    assert.equal(a.reviewEvidence.publisherArticlePage,p.officialPublisherArticlePage);
    assert.equal(a.citation.doi,row.doi);
    assert.equal(a.citation.articleNumber,row.doi.split('.').at(-1));
    assert.equal(a.mediaPolicy,'toc_only');
    assert.equal(a.ingestionChannel,'historical_backfill');
    assert.equal(a.new,false);
    assert.equal(a.addedDate,'');
    assert.equal(a.firstPassDecision,'include');
    assert.equal(a.challengeDecision,'include');
    assert.equal(a.reviewPasses,2);
    assert.notEqual(a.independentPasses[0].assessment,a.independentPasses[1].reason);
  }
  for(const [doi] of correctQ1)assert.ok(!authorized.accepted.some(a=>a.doi===doi),'Q1 article wrongly approved as Q3 '+doi);
});

const byRoot=new Map();
for(const r of proof.rows){
  if(!byRoot.has(r.originalQ3QueueOrigin))byRoot.set(r.originalQ3QueueOrigin,[]);
  byRoot.get(r.originalQ3QueueOrigin).push(r);
}
const shards=[...byRoot].map(([rootId,rows])=>({
  schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
  rootId,journal:'Chem',sourceSha256:rows[0].sourceRootSha256,
  gitBlobSha:rows[0].reviewQueueGitBlobSha,
  stats:{candidateOccurrences:rows.length},
  records:rows.map(x=>({
    doi:x.doi,journal:'Chem',title:x.title,date:x.sourceDate,
    flags:[],sourceFamilies:x.originalQ3SourceFamilies,priority:'P2',
    authors:x.authors
  }))
}));
function mock(extra={}){
  return {
    state:{schema:'gallery-historical-nightly-staging-v1',
      mode:'candidate_discovery_only',completed:shards.map(x=>x.rootId),cursor:{}},
    triage:{schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
      rootSummaries:Object.fromEntries(shards.map(x=>[x.rootId,{sourceSha256:x.sourceSha256}]))},
    shards,formal:{articles:[],webpageDoiCount:0},
    manifest:{accepted:authorized.accepted.filter(x=>items.has(x.doi)),pending:[]},
    corrections:{items:[]},
    journals:[{name:'Chem'}],chemPublisherDates:proof,
    ...extra
  };
}
test('Q3 reconciliation preserves DOI union and separates two Q1 candidates from three verified Q3 approved papers',()=>{
  const {coverage,worklist}=reconcileQ3(mock());
  assert.equal(coverage.counters.uniqueSourceDois,5);
  assert.equal(coverage.counters.apiDatedQ3Candidates,5,'frozen API source date census retained');
  assert.equal(coverage.counters.sourcePublisherDateDiscrepancies,5);
  assert.equal(coverage.counters.sourcePublisherVerifiedOutsideQ3,2);
  assert.equal(coverage.counters.sourceApprovedWaiting08,3);
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
  assert.equal(coverage.counters.sourceExplicitlyExcluded,0);
  assert.equal(coverage.counters.sourcePublisherNonResearchExcluded,0);
  assert.equal(coverage.counters.sourcePublisherReviewedScopeExcluded,0);
  assert.equal(worklist.publisherOnlineDateCorrections.length,5);
  assert.equal(worklist.totalUnreviewedCandidates,0);
  assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
});
test('incorrect DOI, publisher cohort, source date, publisher PII or missing science authority fail closed',()=>{
  const base=mock(),clone=()=>structuredClone(proof);
  const corrupt=r=>({...base,chemPublisherDates:{...proof,rows:proof.rows.map(x=>x.doi===r.doi?r:x)}});
  const changed=clone();changed.rows[0].publisherFirstOnlineDate='2026-08-01';
  assert.throws(()=>reconcileQ3({...base,chemPublisherDates:changed}),/q3_chem_publisher_date_provenance_conflict/);
  const wrong=clone();wrong.rows[2].verifiedPublicationQuarter='2026-Q1';
  assert.throws(()=>reconcileQ3({...base,chemPublisherDates:wrong}),/q3_chem_publisher_quarter_mismatch/);
  const pii=clone();pii.rows[0].officialPublisherArticlePage='https://not-sciencedirect.example/science/article/pii/S2451929426000343';
  assert.throws(()=>reconcileQ3({...base,chemPublisherDates:pii}),/q3_chem_publisher_date_provenance_conflict/);
  const noAuthority={...base,manifest:{accepted:[],pending:[]}};
  assert.throws(()=>reconcileQ3(noAuthority),/q3_chem_date_conflict_missing_approved_science/);
  const q1=authorized.accepted[0];
  assert.throws(()=>reconcileQ3({...base,manifest:{accepted:[...base.manifest.accepted,{...q1,doi:correctQ1[0][0]}],pending:[]}}),
    /q3_chem_pre_q3_original_cannot_be_admitted_as_q3/);
});
