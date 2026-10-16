import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval,selectHistoricalAdmissions} from './lib/historical-admission.mjs';
import {isExcludedDoi} from '../shared/literature-policy.js';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
const load=f=>JSON.parse(readFileSync(f,'utf8'));
const m=load('audit/historical-reviewed/approved-admissions.json');
const p=load('audit/historical-reviewed/2026-10-16-q3-nine-new-originals-two-pass.json');
const formal=load('public/toc-demand-live.json');
const accepted=new Map(m.accepted.map(x=>[x.doi,x]));
const publisherDates=new Map([
 [
  "10.1021/acs.orglett.6c02334",
  "2026-07-06"
 ],
 [
  "10.1021/acs.orglett.6c02414",
  "2026-07-06"
 ],
 [
  "10.1021/acs.orglett.6c02330",
  "2026-07-16"
 ],
 [
  "10.1021/acs.orglett.6c02710",
  "2026-07-17"
 ],
 [
  "10.1021/acs.orglett.6c03033",
  "2026-08-27"
 ],
 [
  "10.1021/acs.joc.6c00990",
  "2026-07-29"
 ],
 [
  "10.1021/acs.joc.6c00158",
  "2026-07-30"
 ],
 [
  "10.1021/acs.joc.6c00634",
  "2026-08-29"
 ],
 [
  "10.1002/anie.2349367",
  "2026-09-08"
 ]
]);
test('nine real publisher dates, unique frozen Crossref and OpenAlex DOI, and two-pass synthesis evidence',()=>{
 assert.equal(validateHistoricalApproval(m).length,m.accepted.length);
 assert.equal(p.baselineApproved,201);
 assert.equal(p.newApprovals,9);
 assert.equal(p.approved.length,9);
 assert.equal(m.summary.checked,m.accepted.length+m.pending.length);
 assert.ok(m.summary.include>=210);
 assert.equal(m.pending.length,2);
 assert.equal(m.newOctober16NinePublisherOriginals.count,9);
 assert.deepEqual(new Set(p.approved.map(x=>x.doi)),new Set(publisherDates.keys()));
 for(const x of p.approved){
  const r=accepted.get(x.doi);
  assert.ok(r,x.doi);
  assert.equal(r.date,publisherDates.get(x.doi));
  assert.equal(r.date,r.reviewEvidence.firstOnlineDateEvidence.sourceFrozenDate);
  assert.equal(r.date,r.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline);
  assert.equal(r.reviewEvidence.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
  assert.ok(r.reviewEvidence.publisherPage.includes(r.doi));
  assert.match(r.reviewEvidence.stageBatchSha,/^[a-f0-9]{40}$/);
  assert.match(r.reviewEvidence.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
  assert.match(r.reviewEvidence.stageSourceSha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(r.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
  assert.equal(r.reviewPasses,2);
  assert.deepEqual(r.independentPasses.map(x=>x.decision),['include','include']);
  assert.equal(validChineseTitle(r.titleZh),true,r.doi);
  assert.equal(isExcludedDoi(r.doi),false);
  assert.equal(r.ingestionChannel,'historical_backfill');
  assert.equal(r.mediaPolicy,'toc_only');
  assert.equal(r.addedDate,'');
  assert.equal(r.new,false);
  assert.equal(r.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  for(const key of ['abstractCopied','figureFetched','pdfFetched'])assert.equal(r.reviewEvidence[key],false);
  assert.ok(!('abstract' in r)&&!('pdf' in r)&&!('fullText' in r));
  for(const key of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])assert.ok(r.scopeAssessment[key].length>=40);
 }
});
test('separate chemistry and mechanism boundaries not conflated',()=>{
 const s=id=>accepted.get(id).scopeAssessment;
 assert.match(s('10.1021/acs.orglett.6c02334').generalityEvidence,/DABSO/);
 assert.match(s('10.1021/acs.orglett.6c02330').generalityEvidence,/99% ee/);
 assert.match(s('10.1021/acs.orglett.6c02710').boundaryChallenge,/缩酮/);
 assert.match(s('10.1021/acs.orglett.6c02414').generalityEvidence,/NUSIOC-Phos/);
 assert.ok(s('10.1021/acs.orglett.6c03033').generalityEvidence.includes('Pd(0)/Pd(II)'));
 assert.match(s('10.1021/acs.joc.6c00990').boundaryChallenge,/吡啶羧酸/);
 assert.ok(s('10.1021/acs.joc.6c00158').preparativeTransformation.includes('Rh(III)'));
 assert.match(s('10.1021/acs.joc.6c00634').boundaryChallenge,/全合成/);
 assert.match(s('10.1002/anie.2349367').boundaryChallenge,/HAT/);
 assert.equal(accepted.has('10.1021/acs.joc.6c01623'),false);
 assert.equal(m.pending.some(x=>x.doi==='10.1021/acs.joc.6c01623'),false);
});
test('no formal or media release before authorized 08:00 admission',()=>{
 const published=new Map(formal.articles.map(x=>[x.doi,x]));
 const selection=selectHistoricalAdmissions(m,{published:new Set(published.keys()),policyExcluded:new Set(m.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi))});
 const ids=new Set(selection.map(x=>x.doi));
 for(const id of publisherDates.keys()){
  if(published.has(id)){const x=published.get(id);assert.equal(x.ingestionChannel,'historical_backfill');assert.equal(x.mediaPolicy,'toc_only');assert.equal(x.new,false);}
  else assert.ok(ids.has(id),id);
 }
 assert.ok(selection.every(x=>!isExcludedDoi(x.doi)&&x.new===false&&x.addedDate===''));
 for(const flag of Object.values(p.guards))assert.equal(flag,true);
});
