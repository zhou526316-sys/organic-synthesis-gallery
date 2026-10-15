import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reconcileQ3} from './historical-q3-reconciliation.mjs';
import {validateHistoricalApproval,selectHistoricalAdmissions,historicCard} from './lib/historical-admission.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const blob=p=>{
  const bytes=readFileSync(new URL('../'+p,import.meta.url));
  return createHash('sha1').update('blob '+bytes.length)
    .update(Buffer.from([0])).update(bytes).digest('hex');
};
const sciencePath='audit/historical-scope-assessments/2026-10-15-chem-three-original-science-review.json';
const datesPath='audit/historical-publisher-dates/2026/chem-four-third-online-reconciled.json';
const science=read(sciencePath),dates=read(datesPath),
  manifest=read('audit/historical-reviewed/approved-admissions.json'),
  formal=read('public/toc-demand-live.json'),
  owner=read('audit/literature-scope-corrections.json');
const byDate=new Map(dates.rows.map(x=>[x.doi,x]));
const included=['10.1016/j.chempr.2026.103205','10.1016/j.chempr.2026.103241'];
const hold='10.1016/j.chempr.2026.103162';
const journal=[{name:'Chem'}];
test('three DOI-specific Chem scientific reviews are tied to official publisher dates and frozen source proofs',()=>{
  assert.equal(science.schemaVersion,'gallery-historical-q3-chem-original-science-review-v2');
  assert.equal(science.accounting.assessed,3);
  assert.equal(science.accounting.include,2);
  assert.equal(science.accounting.pending,1);
  assert.equal(science.accounting.exclude,0);
  assert.equal(science.dateEvidenceGitBlobSha,blob(datesPath));
  assert.equal(manifest.chemThirdReviewedOriginals.scienceBlobSha,blob(sciencePath));
  assert.equal(manifest.chemThirdReviewedOriginals.publisherDatesBlobSha,blob(datesPath));
  assert.deepEqual(new Set(science.assessments.filter(x=>x.decision==='include').map(x=>x.doi)),
    new Set(included));
  assert.deepEqual(science.assessments.filter(x=>x.decision==='pending').map(x=>x.doi),[hold]);
  for(const x of science.assessments){
    const d=byDate.get(x.doi),ev=x.reviewEvidence;
    assert.ok(d);
    assert.equal(x.journal,'Chem');
    assert.equal(x.title,d.title);
    assert.equal(x.date,d.publisherFirstOnlineDate);
    assert.equal(x.reviewPasses,2);
    assert.equal(x.firstPassDecision,x.decision);
    assert.equal(x.challengeDecision,x.decision);
    assert.notEqual(x.firstPassReason,x.independentChallengeReason);
    assert.ok(x.firstPassReason.length>80);
    assert.ok(x.independentChallengeReason.length>80);
    for(const key of ['primaryContribution','preparativeTransformation','generalityEvidence',
      'sourceEvidence','boundaryChallenge'])
      assert.ok(x.scopeAssessment[key].length>=35,key+':'+x.doi);
    assert.equal(ev.stageBatchId,d.originalQ3QueueOrigin);
    assert.equal(ev.stageBatchSha,d.originalSourceBatchGitBlobSha);
    assert.equal(ev.sourceReviewQueueGitBlobSha,d.reviewQueueGitBlobSha);
    assert.equal(ev.stageSourceSha256,d.sourceRootSha256);
    assert.equal(ev.publisherArticlePage,d.officialPublisherArticlePage);
    assert.equal(ev.publisherOnlineDate,d.publisherFirstOnlineDate);
    assert.equal(ev.firstOnlineDateEvidence.stageApiDate,d.sourceDate);
    assert.equal(ev.abstractCopied,false);
    assert.equal(ev.figureFetched,false);
    assert.equal(ev.pdfFetched,false);
  }
});
test('two genuinely original methods admitted for existing sole 08 historical writer only, no daily leakage',()=>{
  assert.equal(manifest.summary.include,130);
  assert.equal(manifest.summary.pending,2);
  assert.equal(manifest.summary.checked,132);
  assert.equal(manifest.nextEligiblePublicationSlot,'2026-10-16T08:00:00+08:00');
  assert.equal(validateHistoricalApproval(manifest).length,130);
  const published=new Set(formal.articles.map(x=>x.doi));
  const excluded=new Set(owner.items.map(x=>x.doi));
  const selected=selectHistoricalAdmissions(manifest,{published,excluded,dailyDois:new Set()});
  for(const id of included){
    const a=manifest.accepted.find(x=>x.doi===id);
    const x=science.assessments.find(x=>x.doi===id);
    assert.ok(a,'expected reviewed method '+id);
    assert.ok(selected.some(x=>x.doi===id));
    assert.equal(a.reviewEvidence.publisherOnlineDate,x.date);
    assert.equal(a.scopeAssessment.primaryContribution,x.scopeAssessment.primaryContribution);
    assert.equal(a.scopeAssessment.generalityEvidence,x.scopeAssessment.generalityEvidence);
    assert.equal(a.scopeAssessment.boundaryChallenge,x.scopeAssessment.boundaryChallenge);
    assert.equal(a.reviewPasses,2);
    assert.equal(a.ingestionChannel,'historical_backfill');
    assert.equal(a.mediaPolicy,'toc_only');
    assert.equal(a.new,false);assert.equal(a.addedDate,'');
    assert.ok(a.titleZh.match(/[\u3400-\u9fff]/u));
    const card=historicCard(a);
    assert.equal(card.new,false);
    assert.equal(card.addedDate,'');
    assert.equal(card.mediaPolicy,'toc_only');
    assert.equal(card.ingestionChannel,'historical_backfill');
    assert.equal(card.date,a.date);
    assert.ok(!published.has(id));
    assert.ok(!excluded.has(id));
  }
  assert.equal(manifest.accepted.some(x=>x.doi===hold),false);
  assert.equal(manifest.pending.some(x=>x.doi===hold),false,
    'scientific pending separate from original formal date-conflict pendings');
});
const srcDates=dates.rows.filter(x=>[...included,hold].includes(x.doi));
function mock(){
  const roots=new Map();
  for(const d of srcDates){
    const id=d.originalQ3QueueOrigin;
    if(!roots.has(id))roots.set(id,[]);
    roots.get(id).push(d);
  }
  const shards=[...roots].map(([rootId,rs])=>({
    schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
    rootId,journal:'Chem',
    sourceSha256:rs[0].sourceRootSha256,
    gitBlobSha:rs[0].reviewQueueGitBlobSha,
    stats:{candidateOccurrences:rs.length},
    records:rs.map(x=>({doi:x.doi,title:x.title,journal:'Chem',date:x.sourceDate,
      authors:x.authors,priority:'P2',flags:[],sourceFamilies:x.originalQ3SourceFamilies}))
  }));
  const approved=manifest.accepted.filter(x=>included.includes(x.doi));
  return {
    state:{schema:'gallery-historical-nightly-staging-v1',mode:'candidate_discovery_only',
      completed:shards.map(x=>x.rootId),cursor:{}},
    triage:{schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
      rootSummaries:Object.fromEntries(shards.map(x=>[x.rootId,{sourceSha256:x.sourceSha256}]))},
    shards,formal:{articles:[],webpageDoiCount:0},
    manifest:{accepted:approved,pending:[]},corrections:{items:[]},journals:journal,
    chemPublisherDates:{...dates,rows:srcDates},
    chemScienceApprovedDoiEvidence:included,
    chemSciencePendingEvidence:science.assessments.filter(x=>x.decision==='pending'),
    reviewerQueueHistoricalBlobAliasesByRoot:new Map()
  };
}
test('quarter reconciliation never labels two approved and one genuine evidence-pending Chem DOI as unreviewed or published',()=>{
  const args=mock();
  const {coverage,worklist}=reconcileQ3(args);
  assert.equal(coverage.counters.uniqueSourceDois,3);
  assert.equal(coverage.counters.sourcePublisherDateDiscrepancies,3);
  assert.equal(coverage.counters.sourceApprovedWaiting08,2);
  assert.equal(coverage.counters.reviewedQ3Waiting08,2);
  assert.equal(coverage.counters.sourcePublisherReviewedScopePending,1);
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,0);
  assert.equal(coverage.counters.formalQ3Count,0);
  assert.equal(worklist.totalUnreviewedCandidates,0);
  assert.equal(worklist.publisherScopeEvidencePending.some(x=>x.doi===hold),true);
  assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
  assert.equal(worklist.noCloudflareD1Access,true);
});
test('altering pending source SHA, publisher date or forging accepted state fail closed',()=>{
  const args=mock(),original=args.chemSciencePendingEvidence[0];
  for(const evidence of [
    {...original,reviewEvidence:{...original.reviewEvidence,stageSourceSha256:'0'.repeat(64)}},
    {...original,reviewEvidence:{...original.reviewEvidence,publisherOnlineDate:'2026-07-01'}},
    {...original,firstPassReason:'same',independentChallengeReason:'same'},
    {...original,missingEvidenceMustNotMeanNoEvidenceExists:false}
  ])assert.throws(()=>reconcileQ3({...args,chemSciencePendingEvidence:[evidence]}),
    /q3_chem_scientific_pending_provenance_invalid/);
  const broken={...args,manifest:{...args.manifest,
    accepted:args.manifest.accepted.filter(x=>x.doi!==included[0])}};
  assert.throws(()=>reconcileQ3(broken),/q3_chem_date_conflict_missing_approved_science/);
  assert.throws(()=>reconcileQ3({...args,chemScienceApprovedDoiEvidence:[included[1],included[1]]}),
    /q3_chem_mandatory_science_evidence_invalid/);
});
