import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval,selectHistoricalAdmissions} from './lib/historical-admission.mjs';
import {isExcludedDoi} from '../shared/literature-policy.js';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';

const read = p => JSON.parse(readFileSync(p,'utf8'));
const manifest=read('audit/historical-reviewed/approved-admissions.json');
const proof=read('audit/historical-reviewed/2026-10-16-q3-eight-original-methods-two-pass.json');
const live=read('public/toc-demand-live.json');
const expected=new Map([
 ['10.1021/jacs.6c14333','2026-08-31'],
 ['10.1021/acs.joc.6c01263','2026-09-01'],
 ['10.1021/acscatal.6c05012','2026-09-08'],
 ['10.1002/anie.7084396','2026-09-08'],
 ['10.1002/anie.7251439','2026-08-22'],
 ['10.1021/acs.orglett.6c02963','2026-08-31'],
 ['10.1021/acs.orglett.6c02609','2026-07-15'],
 ['10.31635/ccschem.026.202607864','2026-07-10']
]);
const byDoi=new Map(manifest.accepted.map(x=>[x.doi,x]));

test('8 preparative original papers truly follow source-pinned two-pass academic contract',()=>{
 assert.equal(validateHistoricalApproval(manifest).length,manifest.accepted.length);
 assert.equal(proof.baselineApproved,176);
 assert.equal(proof.newApprovals,8);
 assert.ok(manifest.summary.include>=184);
 assert.equal(manifest.summary.checked,manifest.accepted.length+manifest.pending.length);
 assert.equal(manifest.pending.length,2);
 assert.deepEqual(new Set(proof.approved.map(x=>x.doi)),new Set(expected.keys()));
 assert.equal(manifest.newOctober16EightSourceVerifiedOriginals.count,8);
 for (const audited of proof.approved) {
  const row=byDoi.get(audited.doi);
  assert.ok(row,'missing approved '+audited.doi);
  assert.equal(row.date,expected.get(audited.doi));
  assert.equal(row.date,row.reviewEvidence.publisherOnlineDate);
  assert.equal(row.date,row.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline);
  assert.equal(row.date,row.reviewEvidence.firstOnlineDateEvidence.sourceFrozenDate);
  assert.equal(row.reviewEvidence.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
  assert.equal(row.decision,'include');
  assert.equal(row.firstPassDecision,'include');
  assert.equal(row.challengeDecision,'include');
  assert.deepEqual(row.independentPasses.map(x=>x.decision),['include','include']);
  assert.equal(row.reviewPasses,2);
  assert.equal(row.ingestionChannel,'historical_backfill');
  assert.equal(row.mediaPolicy,'toc_only');
  assert.equal(row.addedDate,'');
  assert.equal(row.new,false);
  assert.equal(validChineseTitle(row.titleZh),true);
  assert.equal(row.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  assert.ok(!('abstract' in row)&&!('fullText' in row)&&!('pdf' in row));
  assert.equal(row.reviewEvidence.abstractCopied,false);
  assert.equal(row.reviewEvidence.figureFetched,false);
  assert.equal(row.reviewEvidence.pdfFetched,false);
  assert.match(row.reviewEvidence.stageBatchSha,/^[a-f0-9]{40}$/);
  assert.match(row.reviewEvidence.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
  assert.match(row.reviewEvidence.stageSourceSha256,/^[a-f0-9]{64}$/);
  assert.equal(row.reviewEvidence.stageBranch,'staging/historical-archive-nightly');
  assert.ok(row.reviewEvidence.publisherPage.includes('/'+row.doi));
  assert.equal(row.reviewEvidence.crossrefOpenalexSources.length,
     row.doi.startsWith('10.31635/')||row.doi==='10.1002/anie.7251439'?1:2);
  assert.equal(isExcludedDoi(row.doi),false);
  for(const key of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
   assert.ok(row.scopeAssessment[key].length>=40,row.doi+' '+key);
 }
});

test('science-specific skeptical checks remain distinct from titles and unsupported scope',()=>{
 assert.match(byDoi.get('10.1021/jacs.6c14333').scopeAssessment.generalityEvidence,/PROTAC/);
 assert.match(byDoi.get('10.1021/acs.joc.6c01263').scopeAssessment.boundaryChallenge,/最大值/);
 assert.match(byDoi.get('10.1021/acscatal.6c05012').scopeAssessment.boundaryChallenge,/钯催化Z→E/);
 assert.match(byDoi.get('10.1002/anie.7084396').scopeAssessment.generalityEvidence,/脂肪族醛/);
 assert.match(byDoi.get('10.1002/anie.7251439').scopeAssessment.boundaryChallenge,/蛋白/);
 assert.match(byDoi.get('10.1021/acs.orglett.6c02963').scopeAssessment.generalityEvidence,/克级/);
 assert.match(byDoi.get('10.1021/acs.orglett.6c02609').scopeAssessment.generalityEvidence,/后期/);
 assert.match(byDoi.get('10.31635/ccschem.026.202607864').scopeAssessment.preparativeTransformation,/桥环/);
});

test('three conflicting publisher dates are held without silently appending to include or pending',()=>{
 assert.deepEqual(new Set(proof.holds.map(x=>x.doi)),new Set([
   '10.1021/acs.orglett.6c02707','10.1021/acs.joc.6c01242','10.1021/acs.joc.6c00852'
 ]));
 for (const {doi} of proof.holds){
  assert.equal(byDoi.has(doi),false);
  assert.equal(manifest.pending.some(x=>x.doi===doi),false);
 }
 assert.equal(manifest.pending.length,2);
});

test('existing owner veto and only the fixed slot can publish historical approvals',()=>{
 const formal=new Map(live.articles.map(x=>[x.doi,x]));
 const policyExcluded=new Set(manifest.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi));
 const vetoes=[];
 const admission=selectHistoricalAdmissions(manifest,{
   published:new Set(formal.keys()),policyExcluded,
   onPolicyVeto:x=>vetoes.push(x)
 });
 const acceptedIds=new Set(admission.map(x=>x.doi));
 for(const [doi] of expected){
  if(formal.has(doi)){
    const row=formal.get(doi);
    assert.equal(row.ingestionChannel,'historical_backfill');
    assert.equal(row.mediaPolicy,'toc_only');
    assert.notEqual(row.new,true);
    assert.equal(row.addedDate,'');
  }else assert.ok(acceptedIds.has(doi),doi+' should await legal 08 admission');
 }
 assert.ok(vetoes.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 assert.ok(admission.every(x=>!isExcludedDoi(x.doi)&&x.new===false&&x.addedDate===''));
 for(const k of ['noD1','noFormalPublication','noPublisherMediaOrPdf','noNewOrHot','no08SlotChange','ownerExclusionIntact'])
  assert.equal(proof.guards[k],true,k);
});
