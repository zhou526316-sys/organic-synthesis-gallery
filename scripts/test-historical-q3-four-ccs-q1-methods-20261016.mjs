import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval,selectHistoricalAdmissions} from './lib/historical-admission.mjs';
import {isExcludedDoi} from '../shared/literature-policy.js';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const m=load('audit/historical-reviewed/approved-admissions.json');
const proof=load('audit/historical-reviewed/2026-10-16-q3-four-plus-ccs-q1-originals-two-pass.json');
const live=load('public/toc-demand-live.json');
const byDoi=new Map(m.accepted.map(x=>[x.doi,x]));
const expected=new Map([
 ['10.1021/acs.orglett.6c02958',['2026-08-31','toc_only']],
 ['10.1021/acs.joc.6c01515',['2026-08-31','toc_only']],
 ['10.1021/acs.joc.6c00729',['2026-07-30','toc_only']],
 ['10.1002/anie.9818208',['2026-07-26','toc_only']],
 ['10.31635/ccschem.025.202506810',['2026-01-11','metadata_only']]
]);
test('source-pinned four genuine Q3 + one Q1 preparative academic methods',()=>{
 assert.equal(validateHistoricalApproval(m).length,m.accepted.length);
 assert.equal(proof.baselineApproved,184);
 assert.equal(proof.newApprovals,5);
 assert.equal(proof.q3Originals,4);
 assert.equal(proof.publisherCorrectedQ1Originals,1);
 assert.ok(m.summary.include>=189);
 assert.equal(m.pending.length,2);
 assert.equal(m.summary.checked,m.accepted.length+m.pending.length);
 assert.deepEqual(new Set(proof.approved.map(x=>x.doi)),new Set(expected.keys()));
 assert.equal(m.newOctober16FourQ3PlusOneCorrectedCCSQ1.count,5);
 assert.equal(m.newOctober16FourQ3PlusOneCorrectedCCSQ1.q1MetadataOnly,1);
 for(const item of proof.approved){
  const row=byDoi.get(item.doi),[date,policy]=expected.get(item.doi);
  assert.ok(row,item.doi);
  assert.equal(row.date,date);
  assert.equal(row.mediaPolicy,policy);
  assert.equal(row.reviewEvidence.publisherOnlineDate,date);
  assert.equal(row.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline,date);
  assert.equal(row.reviewEvidence.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
  assert.equal(row.reviewEvidence.stageBranch,'staging/historical-archive-nightly');
  assert.match(row.reviewEvidence.stageBatchSha,/^[a-f0-9]{40}$/);
  assert.match(row.reviewEvidence.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
  assert.match(row.reviewEvidence.stageSourceSha256,/^[a-f0-9]{64}$/);
  assert.equal(row.reviewEvidence.crossrefOpenalexSources.length,row.doi.startsWith('10.31635/')?1:2);
  assert.equal(row.reviewStatus,'two_pass_scope_include_awaiting_fixed_slot');
  assert.deepEqual(row.independentPasses.map(x=>x.decision),['include','include']);
  assert.equal(row.reviewPasses,2);
  assert.equal(row.challengeDecision,'include');
  assert.equal(row.ingestionChannel,'historical_backfill');
  assert.equal(row.new,false);
  assert.equal(row.addedDate,'');
  assert.equal(validChineseTitle(row.titleZh),true);
  assert.equal(row.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  assert.equal(row.reviewEvidence.abstractCopied,false);
  assert.equal(row.reviewEvidence.figureFetched,false);
  assert.equal(row.reviewEvidence.pdfFetched,false);
  assert.equal(isExcludedDoi(row.doi),false);
  assert.ok(!('abstract' in row)&&!('fullText' in row)&&!('pdf' in row));
  for(const k of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
   assert.ok(row.scopeAssessment[k].length>40,k+':'+row.doi);
 }
});
test('CCS issue month is not first-online; Jan formal version does not become Q3 published',()=>{
 const x=byDoi.get('10.31635/ccschem.025.202506810');
 assert.equal(x.date,'2026-01-11');
 assert.equal(x.mediaPolicy,'metadata_only');
 assert.equal(x.reviewEvidence.firstOnlineDateEvidence.stageApiDate,'2026-08-01');
 assert.equal(x.reviewEvidence.firstOnlineDateEvidence.stageDateIsIssueNotPublication,true);
 assert.equal(x.reviewEvidence.crossrefOpenalexSources.length,1);
 assert.match(x.scopeAssessment.sourceEvidence,/2025-12-09/);
 assert.match(x.scopeAssessment.sourceEvidence,/2026-01-11/);
 assert.match(x.scopeAssessment.boundaryChallenge,/metadata_only/);
});
test('substantive synthetic checks distinguish experimental products and mechanistic or date inferences',()=>{
 assert.match(byDoi.get('10.1021/acs.orglett.6c02958').scopeAssessment.preparativeTransformation,/脒、亚胺酸酯及亚胺硫代酯/);
 assert.match(byDoi.get('10.1021/acs.joc.6c01515').scopeAssessment.generalityEvidence,/克级/);
 assert.match(byDoi.get('10.1021/acs.joc.6c00729').scopeAssessment.boundaryChallenge,/SNAr/);
 assert.match(byDoi.get('10.1002/anie.9818208').scopeAssessment.generalityEvidence,/DFT/);
 assert.match(byDoi.get('10.31635/ccschem.025.202506810').scopeAssessment.generalityEvidence,/吡啶基化/);
});
test('unresolved publisher date conflicts and material-first scope holds never auto-admitted',()=>{
 for(const {doi} of proof.holds){
  assert.equal(byDoi.has(doi),false);
  assert.equal(m.pending.some(x=>x.doi===doi),false);
 }
 assert.equal(proof.guards.noFormalPublication,true);
 assert.equal(proof.guards.noPublisherMediaOrPdf,true);
 assert.equal(proof.guards.explicitQ1MetadataOnly,true);
 assert.equal(proof.guards.ownerExclusionIntact,true);
});
test('historic release selection respects exact owner veto and fixed-slot serialization',()=>{
 const formal=new Map(live.articles.map(x=>[x.doi,x]));
 const vetoes=[];
 const selected=selectHistoricalAdmissions(m,{published:new Set(formal.keys()),policyExcluded:new Set(m.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi)),onPolicyVeto:x=>vetoes.push(x)});
 const accepted=new Set(selected.map(x=>x.doi));
 for(const doi of expected.keys()){
  if(formal.has(doi)){
    const row=formal.get(doi);
    assert.equal(row.ingestionChannel,'historical_backfill');
    assert.equal(row.new,false);
    assert.equal(row.addedDate,'');
  }else assert.ok(accepted.has(doi),doi);
 }
 assert.ok(vetoes.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 assert.ok(selected.every(x=>x.new===false&&x.addedDate===''&&!isExcludedDoi(x.doi)));
});
