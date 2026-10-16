import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval,selectHistoricalAdmissions} from './lib/historical-admission.mjs';
import {isExcludedDoi} from '../shared/literature-policy.js';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';

const load=p=>JSON.parse(readFileSync(p,'utf8'));
const m=load('audit/historical-reviewed/approved-admissions.json');
const proof=load('audit/historical-reviewed/2026-10-16-q3-twelve-publisher-originals-two-pass.json');
const formal=load('public/toc-demand-live.json');
const accepted=new Map(m.accepted.map(r=>[r.doi,r]));
const expected=new Map([
 ['10.1021/acs.joc.6c01034','2026-08-03'],
 ['10.1002/anie.4069826','2026-07-21'],
 ['10.1021/acs.orglett.6c02370','2026-07-14'],
 ['10.1021/acs.orglett.6c02444','2026-07-13'],
 ['10.1021/acs.joc.6c01602','2026-09-04'],
 ['10.1021/acs.orglett.6c02694','2026-08-28'],
 ['10.1002/anie.7785903','2026-07-27'],
 ['10.1021/acs.orglett.6c03223','2026-08-29'],
 ['10.1021/acs.orglett.6c03210','2026-08-28'],
 ['10.1021/acs.orglett.6c02939','2026-08-03'],
 ['10.1021/acs.joc.6c01118','2026-07-30'],
 ['10.1021/acs.joc.6c01613','2026-08-31']
]);
test('twelve DOI-exact publisher first-online dates and original science remain evidence reviewed',()=>{
 assert.equal(validateHistoricalApproval(m).length,m.accepted.length);
 assert.equal(proof.baselineApproved,189);
 assert.equal(proof.newApprovals,12);
 assert.ok(m.summary.include>=201);
 assert.equal(m.pending.length,2);
 assert.equal(m.summary.checked,m.accepted.length+m.pending.length);
 assert.equal(m.newOctober16TwelvePublisherQ3Originals.count,12);
 assert.deepEqual(new Set(proof.approved.map(x=>x.doi)),new Set(expected.keys()));
 for(const original of proof.approved){
  const row=accepted.get(original.doi);
  assert.ok(row,original.doi);
  assert.equal(row.date,expected.get(row.doi));
  assert.equal(row.date,row.reviewEvidence.publisherOnlineDate);
  assert.equal(row.date,row.reviewEvidence.firstOnlineDateEvidence.sourceFrozenDate);
  assert.equal(row.date,row.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline);
  assert.equal(row.reviewEvidence.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
  assert.ok(row.reviewEvidence.publisherPage.includes(row.doi));
  assert.equal(row.reviewEvidence.stageBranch,'staging/historical-archive-nightly');
  assert.match(row.reviewEvidence.stageBatchSha,/^[a-f0-9]{40}$/);
  assert.match(row.reviewEvidence.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
  assert.match(row.reviewEvidence.stageSourceSha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(row.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
  assert.equal(row.reviewPasses,2);
  assert.deepEqual(row.independentPasses.map(x=>x.decision),['include','include']);
  assert.equal(row.challengeDecision,'include');
  assert.equal(validChineseTitle(row.titleZh),true,row.doi);
  assert.equal(row.ingestionChannel,'historical_backfill');
  assert.equal(row.mediaPolicy,'toc_only');
  assert.equal(row.addedDate,'');
  assert.equal(row.new,false);
  assert.equal(row.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  for(const key of ['abstractCopied','figureFetched','pdfFetched'])
   assert.equal(row.reviewEvidence[key],false,key+':'+row.doi);
  assert.ok(!('abstract' in row)&&!('fullText' in row)&&!('pdf' in row));
  assert.equal(isExcludedDoi(row.doi),false);
  for(const key of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
   assert.ok(row.scopeAssessment[key].length>=40,row.doi+':'+key);
 }
});
test('chemistry scope challenges distinguish key intermediate, real total synthesis and formal synthesis',()=>{
 const U=accepted.get('10.1021/acs.joc.6c01034');
 assert.match(U.scopeAssessment.generalityEvidence,/60%/);
 assert.match(U.scopeAssessment.boundaryChallenge,/没有完成整药/);
 assert.match(U.scopeAssessment.generalityEvidence,/CIDKR/);
 const Strepto=accepted.get('10.1021/acs.joc.6c01602');
 assert.match(Strepto.scopeAssessment.generalityEvidence,/total synthesis/i);
 assert.match(Strepto.scopeAssessment.preparativeTransformation,/Liebeskind/);
 const Si=accepted.get('10.1002/anie.4069826');
 assert.match(Si.scopeAssessment.generalityEvidence,/133/);
 assert.match(Si.scopeAssessment.boundaryChallenge,/动力学拆分/);
 assert.match(Si.scopeAssessment.generalityEvidence,/形式全合成/);
});
test('controls, catalytic mechanisms and maximum stereoselectivity are not fictionalized',()=>{
 const v=id=>accepted.get(id).scopeAssessment;
 assert.match(v('10.1021/acs.orglett.6c02370').generalityEvidence,/93% ee/);
 assert.match(v('10.1021/acs.orglett.6c02444').generalityEvidence,/98% ee/);
 assert.match(v('10.1021/acs.orglett.6c02694').generalityEvidence,/83%/);
 assert.match(v('10.1002/anie.7785903').boundaryChallenge,/non-regioselective/);
 assert.match(v('10.1021/acs.orglett.6c03223').boundaryChallenge,/picolinamide/);
 assert.match(v('10.1021/acs.orglett.6c03210').boundaryChallenge,/DMAD/);
 assert.match(v('10.1021/acs.orglett.6c02939').generalityEvidence,/E4671/);
 assert.match(v('10.1021/acs.joc.6c01118').generalityEvidence,/溴代酯/);
 assert.match(v('10.1021/acs.joc.6c01613').boundaryChallenge,/Pd\(II\)/);
});
test('unsolved authority dates remain held, no accidental new source approval',()=>{
 assert.deepEqual(new Set(proof.holds.map(x=>x.doi)),new Set([
  '10.1126/sciadv.aee4031','10.1021/acs.joc.6c01890','10.1021/acs.orglett.6c03028'
 ]));
 for(const x of proof.holds){
  assert.equal(accepted.has(x.doi),false);
  assert.equal(m.pending.some(z=>z.doi===x.doi),false);
 }
 for(const key of ['noD1','noFormalPublication','noPublisherMediaOrPdf','noNewOrHot','no08SlotChange','ownerExclusionIntact'])
  assert.equal(proof.guards[key],true,key);
});
test('only authorized later 08:00 admission can move one of the twelve to formal catalog',()=>{
 const pub=new Map(formal.articles.map(x=>[x.doi,x]));
 const policyExcluded=new Set(m.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi));
 const vetoes=[];
 const selection=selectHistoricalAdmissions(m,{published:new Set(pub.keys()),policyExcluded,onPolicyVeto:x=>vetoes.push(x)});
 const ids=new Set(selection.map(x=>x.doi));
 for(const doi of expected.keys()){
  if(pub.has(doi)){
   const row=pub.get(doi);
   assert.equal(row.ingestionChannel,'historical_backfill');
   assert.equal(row.mediaPolicy,'toc_only');
   assert.equal(row.new,false);
   assert.equal(row.addedDate,'');
  }else assert.ok(ids.has(doi),doi);
 }
 assert.ok(vetoes.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 assert.ok(selection.every(x=>!isExcludedDoi(x.doi)&&x.new===false&&x.addedDate===''));
});
