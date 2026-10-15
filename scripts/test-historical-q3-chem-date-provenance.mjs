import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindChemQ3DateAudit} from './historical-q3-chem-date-proof.mjs';
import {reconcileQ3} from './historical-q3-reconciliation.mjs';
import {validateHistoricalApproval} from './lib/historical-admission.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const audit=read('audit/historical-publisher-issues/2026/chem-q3-source-date-conflicts-and-firstday-provisional.json');
const science=read('audit/historical-scope-assessments/2026-10-15-chem-three-q3-original-methods.json');
const manifest=read('audit/historical-reviewed/approved-admissions.json');
const latest=manifest.accepted.filter(x=>science.paperSpecificReviews.some(y=>y.doi===x.doi));

test('Chem month-first source and date-conflict evidence is a complete frozen source census',()=>{
  assert.equal(audit.summary.sourceUniqueDois,147);
  assert.equal(audit.summary.sourceOccurrences,160);
  assert.equal(audit.provisionalFirstOfMonthDoi.length,143);
  assert.equal(audit.nonProvisionalSourceDois.length,4);
  assert.equal(audit.conflictingSourceDateDois.length,13);
  assert.equal(audit.summary.verifiedOfficialFirstOnline,6);
  assert.equal(audit.summary.officialFirstOnlineBeforeQ3,undefined);
  assert.equal(audit.summary.officialFirstOnlineInQ3,3);
  assert.equal(audit.summary.publisherIssueDateWithoutOnlineEvidence,2);
  assert.deepEqual(audit.summary.candidateSourceFirstDates,{'2026-07-01':48,'2026-08-01':48,'2026-09-01':47});
  assert.equal(new Set([...audit.provisionalFirstOfMonthDoi,...audit.nonProvisionalSourceDois].map(x=>x.doi)).size,147);
});
test('three genuinely Q1/Q2 original Chem methods are not confused with Q3 print issue',()=>{
  const outside=audit.publisherEvidence.filter(x=>x.classification==='pre_Q3_original');
  assert.deepEqual(outside.map(x=>x.doi).sort(),[
    '10.1016/j.chempr.2026.102990',
    '10.1016/j.chempr.2026.103002',
    '10.1016/j.chempr.2026.103022'
  ]);
  assert.deepEqual(outside.map(x=>x.publisherFirstOnlineDate),['2026-03-27','2026-03-30','2026-04-14']);
  assert.ok(outside.every(x=>!manifest.accepted.some(a=>a.doi===x.doi)));
});
test('three DOI-accurate synthetic admits satisfy existing fixed 08 and real source-date override gate',()=>{
  assert.equal(latest.length,3);
  assert.equal(manifest.summary.include,122);
  assert.equal(manifest.summary.pending,2);
  assert.equal(manifest.nextEligiblePublicationSlot,'2026-10-16T08:00:00+08:00');
  assert.equal(validateHistoricalApproval(manifest).length,122);
  for(const r of latest){
    const x=audit.publisherEvidence.find(a=>a.doi===r.doi),scienceRecord=science.paperSpecificReviews.find(a=>a.doi===r.doi);
    assert.ok(x&&scienceRecord);
    assert.equal(r.date,x.publisherFirstOnlineDate);
    assert.notEqual(r.date,r.reviewEvidence.stageSourceApiDate);
    assert.equal(r.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline,r.date);
    assert.equal(r.reviewEvidence.firstOnlineDateEvidence.frozenSourceUnmodified,true);
    assert.ok(r.reviewEvidence.publisherOriginalArticleUrl.includes('/science/article/pii/'));
    assert.equal(r.scopeAssessment.primaryContribution,scienceRecord.scopeAssessment.primaryContribution);
    assert.equal(r.scopeAssessment.generalityEvidence,scienceRecord.scopeAssessment.generalityEvidence);
    assert.ok(r.authors.length>2);
    assert.equal(r.citation.doi,r.doi);
    assert.equal(r.new,false);assert.equal(r.addedDate,'');
    assert.equal(r.mediaPolicy,'toc_only');assert.equal(r.ingestionChannel,'historical_backfill');
  }
});
function mockedQ3(){
  const roots=new Map(audit.sourceRootSnapshots.map(x=>[x.rootId,{...x,records:[]}]));
  const allSource=[...audit.provisionalFirstOfMonthDoi,...audit.nonProvisionalSourceDois];
  for(const r of allSource){
    for(const x of r.occurrences||r.sourceOccurrences){
      const o=roots.get(x.sourceRootId);
      if(!o)throw Error('unknown root');
      o.records.push({doi:r.doi,journal:'Chem',title:r.title,date:x.date,
        sourceFamilies:x.sourceFamilies,flags:[],authors:['Academic Author'],priority:'P0'});
    }
  }
  const shards=[...roots.values()].map(r=>({
    schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
    rootId:r.rootId,journal:'Chem',sourceSha256:r.stageSourceSha256,
    gitBlobSha:r.reviewQueueGitBlobSha,stats:{candidateOccurrences:r.records.length},records:r.records
  }));
  const sourceByDoi=new Map();
  for(const row of allSource){
    const o=row.occurrences||row.sourceOccurrences;
    sourceByDoi.set(row.doi,{doi:row.doi,journal:'Chem',sourceRoots:[...new Set(o.map(x=>x.sourceRootId))],
      sourceHashes:[...new Set(o.map(x=>x.stageSourceSha256))],
      dateConflict:new Set(o.map(x=>x.date)).size>1,sourceFamilies:o[0].sourceFamilies});
  }
  const hashes=new Map(audit.sourceRootSnapshots.map(x=>[x.rootId,x.reviewQueueGitBlobSha]));
  return {shards,sourceByDoi,hashes,sourceState:{
    schema:'gallery-historical-nightly-staging-v1',mode:'candidate_discovery_only',
    completed:shards.map(x=>x.rootId),cursor:{}
  }};
}
test('provisional date-proof binds exact all 147 DOI and 12 shard fingerprints',()=>{
  const x=mockedQ3();
  const auth=bindChemQ3DateAudit({audit,sourceByDoi:x.sourceByDoi,
    sourceGitBlobByRoot:x.hashes,acceptedManifest:manifest.accepted});
  assert.equal(auth.provisional.size,143);
  assert.equal(auth.sourceConflict.size,13);
  assert.equal(auth.officialOutsideQ3.size,3);
  assert.equal(auth.officialWithinQ3.size,3);
  assert.equal(auth.officialDate.size,8);
});
test('publisher verified first-online Q1/Q2 is removed from Q3 unfinished without changing metadata census',()=>{
  const x=mockedQ3();
  const {coverage,worklist}=reconcileQ3({
    state:x.sourceState,
    triage:{schemaVersion:'gallery-history-review-triage-v1',mode:'review_queue_only_not_publication',
      rootSummaries:Object.fromEntries(x.shards.map(s=>[s.rootId,{sourceSha256:s.sourceSha256}]))},
    shards:x.shards,formal:{webpageDoiCount:0,articles:[]},
    manifest:{accepted:latest,pending:[]},corrections:{items:[]},
    journals:[{name:'Chem'}],chemPublisherDateAudit:audit
  });
  assert.equal(coverage.counters.uniqueSourceDois,147);
  assert.equal(coverage.counters.candidateOccurrences,160);
  assert.equal(coverage.counters.chemFirstOfMonthProvisionalDois,143);
  assert.equal(coverage.counters.chemSourceDateConflictDois,13);
  assert.equal(coverage.counters.chemPublisherVerifiedOutsideQ3,3);
  assert.equal(coverage.counters.chemPublisherVerifiedQ3,3);
  assert.equal(coverage.counters.chemStillUnverifiedOnlineDate,137);
  assert.equal(coverage.counters.sourceApprovedWaiting08,3);
  assert.equal(coverage.counters.knownOutsideQ3,3);
  assert.equal(coverage.counters.unfinishedQ3OrDateVerification,141);
  assert.equal(worklist.totalUnreviewedCandidates,141);
  for(const x of audit.publisherEvidence.filter(x=>x.classification==='pre_Q3_original'))
    assert.ok(!worklist.rows.some(y=>y.doi===x.doi));
  assert.equal(coverage.counters.publisherIssueResearchReconciliationComplete,false);
});
test('changed source Git hash and fabricated publisher-first-online decision fail closed',()=>{
  const x=mockedQ3(),first= x.shards[0];
  assert.throws(()=>bindChemQ3DateAudit({audit,sourceByDoi:x.sourceByDoi,
    sourceGitBlobByRoot:new Map([...x.hashes, [first.rootId,'a'.repeat(40)]]),
    acceptedManifest:manifest.accepted}),/source_root_sha_mismatch/);
  const tampered={...audit,publisherEvidence:audit.publisherEvidence.map(z=>
    z.doi==='10.1016/j.chempr.2026.103211'?{...z,publisherFirstOnlineDate:'2026-03-01'}:z)};
  assert.throws(()=>bindChemQ3DateAudit({audit:tampered,sourceByDoi:x.sourceByDoi,
    sourceGitBlobByRoot:x.hashes,acceptedManifest:manifest.accepted}),
    /quarter_misassigned|outside_quarter_admitted/);
});
