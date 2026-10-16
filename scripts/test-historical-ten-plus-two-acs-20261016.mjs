import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval,selectHistoricalAdmissions} from './lib/historical-admission.mjs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
import {isExcludedDoi} from '../shared/literature-policy.js';

const read=file=>JSON.parse(readFileSync(file,'utf8'));
const manifest=read('audit/historical-reviewed/approved-admissions.json');
const ten=read('audit/historical-reviewed/2026-10-16-q3-ten-acs-original-synthesis-two-pass.json');
const corrections=read('audit/historical-publisher-dates/2026/acs-three-first-online-date-conflicts-20261016.json');
const formal=read('public/toc-demand-live.json');
const ids=ten.accepted.map(x=>x.doi),corrected=corrections.doubleReviewedNewAccepted.map(x=>x.doi);

test('ten originals plus two independently publisher-date-corrected originals are fully reviewed, DOI unique and not released early',()=>{
 assert.equal(validateHistoricalApproval(manifest).length,manifest.accepted.length);
 assert.equal(manifest.newOctober16TenACSPreparativeBatch.count,10);
 assert.equal(manifest.newOctober16TwoAcsOfficialDateOverrules.count,2);
 assert.equal(ten.reviewCount,10);
 assert.equal(corrections.doubleReviewedNewAccepted.length,2);
 assert.equal(manifest.summary.checked,manifest.accepted.length+manifest.pending.length);
 assert.equal(manifest.pending.length,2);
 assert.equal(new Set([...ids,...corrected]).size,12);
 assert.ok(manifest.accepted.length>=163);
 const published=new Map(formal.articles.map(x=>[x.doi,x]));
 const accepted=new Map(manifest.accepted.map(x=>[x.doi,x]));
 for(const proof of [...ten.accepted,...corrections.doubleReviewedNewAccepted]){
  const row=accepted.get(proof.doi);
  assert.ok(row,proof.doi);
  assert.equal(row.date,proof.date);
  assert.equal(row.reviewEvidence.publisherOnlineDate,proof.date);
  assert.equal(row.reviewEvidence.stageBatchSha,proof.reviewEvidence.stageBatchSha);
  assert.equal(row.reviewEvidence.stageSourceSha256,proof.reviewEvidence.stageSourceSha256);
  assert.equal(row.reviewEvidence.sourceReviewQueueGitBlobSha,proof.reviewEvidence.sourceReviewQueueGitBlobSha);
  assert.match(row.reviewEvidence.stageBatchSha,/^[a-f0-9]{40}$/);
  assert.match(row.reviewEvidence.stageSourceSha256,/^[a-f0-9]{64}$/);
  assert.match(row.reviewEvidence.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
  assert.deepEqual(row.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
  assert.equal(row.reviewPasses,2);
  assert.deepEqual(row.independentPasses.map(x=>x.decision),['include','include']);
  assert.equal(row.challengeDecision,'include');
  assert.equal(validChineseTitle(row.titleZh),true,row.doi);
  assert.equal(row.ingestionChannel,'historical_backfill');
  assert.equal(row.mediaPolicy,'toc_only');
  assert.equal(row.new,false);
  assert.equal(row.addedDate,'');
  assert.equal(row.reviewEvidence.abstractCopied,false);
  assert.equal(row.reviewEvidence.figureFetched,false);
  assert.equal(row.reviewEvidence.pdfFetched,false);
  assert.equal(isExcludedDoi(row.doi),false);
  assert.equal(row.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  for(const f of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
   assert.ok(row.scopeAssessment[f].length>=35,row.doi+':'+f);
  if(published.has(row.doi)){
   const live=published.get(row.doi);
   assert.equal(live.ingestionChannel,'historical_backfill');
   assert.equal(live.mediaPolicy,'toc_only');
   assert.equal(live.new,false);
   assert.equal(live.addedDate,'');
  }
 }
});
test('ACS official source-date corrections do not mutate raw source or cross Q3 boundary',()=>{
 for(const x of corrections.doubleReviewedNewAccepted){
  const original=x.reviewEvidence.firstOnlineDateEvidence;
  assert.notEqual(original.sourceFrozenDate,x.date);
  assert.equal(original.officialPublisherFirstOnline,x.date);
  assert.equal(original.publisherDateOutranksSource,true);
  assert.equal(original.sourceFrozenAndUnchanged,true);
  assert.ok(x.date.startsWith('2026-08'));
 }
 const m=new Map(corrections.correctedPublisherFirstOnline.map(x=>[x.doi,x]));
 for(const x of corrections.doubleReviewedNewAccepted){
  assert.equal(m.get(x.doi).publisherOnline,x.date);
  assert.equal(m.get(x.doi).sourceDate,x.reviewEvidence.firstOnlineDateEvidence.sourceFrozenDate);
 }
});
test('same publisher two-page June/July discrepancy remains held, not invented as Q3 original',()=>{
 const held=corrections.publisherConflictStillHeld;
 assert.equal(held.length,1);
 const c=held[0];
 assert.equal(c.doi,'10.1021/acs.joc.6c01242');
 assert.equal(c.firstOfficialPageOnlineDate,'2026-07-01');
 assert.equal(c.secondOfficialPageOnlineDate,'2026-06-30');
 assert.equal(c.sourceDate,'2026-07-01');
 assert.equal(c.publicationAuthority,false);
 assert.ok(!manifest.accepted.some(x=>x.doi===c.doi));
 assert.ok(!formal.articles.some(x=>x.doi===c.doi));
 assert.equal(c.academicScopeDisposition,'scientific_include_candidate_but_online_Q2_vs_Q3_conflict_pending');
});
test('owner historical veto still holds only itself and does not discard the newly vetted twelve',()=>{
 const published=new Set(formal.articles.map(x=>x.doi));
 const vetoes=[];
 const policyExcluded=new Set(manifest.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi));
 const selected=selectHistoricalAdmissions(manifest,{published,policyExcluded,onPolicyVeto:x=>vetoes.push(x)});
 const selectedIds=new Set(selected.map(x=>x.doi));
 for(const doi of [...ids,...corrected])if(!published.has(doi))assert.ok(selectedIds.has(doi));
 assert.ok(vetoes.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 assert.ok(selected.every(x=>x.ingestionChannel==='historical_backfill'));
});
