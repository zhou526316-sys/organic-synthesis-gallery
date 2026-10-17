import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval,selectHistoricalAdmissions} from './lib/historical-admission.mjs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
import {isExcludedDoi} from '../shared/literature-policy.js';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const manifest=load('audit/historical-reviewed/approved-admissions.json');
const proof=load('audit/historical-reviewed/2026-10-16-q3-thirteen-original-synthesis-two-pass.json');
const formal=load('public/toc-demand-live.json');
const known=proof.approved.map(x=>x.doi);
const expected={
 '10.1021/jacs.6c09884':'2026-07-01',
 '10.1021/acs.joc.6c01078':'2026-07-10',
 '10.1021/acs.joc.6c01304':'2026-09-19',
 '10.1021/acs.joc.6c01290':'2026-08-11',
 '10.1021/acs.joc.6c01278':'2026-07-31',
 '10.1021/acs.joc.6c01433':'2026-08-08',
 '10.1021/acs.orglett.6c03420':'2026-08-20',
 '10.1021/acs.orglett.6c02921':'2026-08-07',
 '10.1021/acs.orglett.6c02149':'2026-07-18',
 '10.1021/acs.orglett.6c02745':'2026-08-07',
 '10.1002/anie.4869748':'2026-07-30',
 '10.1002/anie.6230875':'2026-08-24',
 '10.1126/sciadv.aeg3025':'2026-07-24',
};
test('thirteen distinct article-evidenced 2026 Q3 studies have frozen first-online and two-pass methods',()=>{
 assert.equal(validateHistoricalApproval(manifest).length,manifest.summary.include);
 assert.ok(manifest.summary.include>=176);
 assert.equal(manifest.summary.checked,manifest.accepted.length+manifest.pending.length);
 assert.equal(manifest.pending.length,2);
 assert.equal(proof.baselineApproved,163);
 assert.equal(proof.newApprovals,13);
 assert.equal(manifest.newOctober16ThirteenCrossJournalSynthesis.count,13);
 assert.equal(new Set(known).size,13);
 assert.deepEqual(new Set(known),new Set(Object.keys(expected)));
 const map=new Map(manifest.accepted.map(x=>[x.doi,x]));
 const prod=new Map(formal.articles.map(x=>[x.doi,x]));
 for(const item of proof.approved){
  const row=map.get(item.doi);assert.ok(row,'missing approved '+item.doi);
  assert.equal(row.date,expected[item.doi]);
  assert.equal(row.date,item.reviewEvidence.publisherOnlineDate);
  assert.equal(row.reviewEvidence.publisherPage,item.reviewEvidence.publisherPage);
  assert.equal(row.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline,row.date);
  assert.equal(row.reviewEvidence.firstOnlineDateEvidence.sourceFrozenDate,row.date);
  assert.equal(row.reviewEvidence.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
  assert.match(row.reviewEvidence.stageBatchSha,/^[a-f0-9]{40}$/);
  assert.match(row.reviewEvidence.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
  assert.match(row.reviewEvidence.stageSourceSha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(row.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
  assert.equal(row.ingestionChannel,'historical_backfill');
  assert.equal(row.reviewPasses,2);
  assert.equal(row.challengeDecision,'include');
  assert.deepEqual(row.independentPasses.map(y=>y.decision),['include','include']);
  assert.equal(validChineseTitle(row.titleZh),true,row.doi);
  assert.equal(row.addedDate,'');assert.equal(row.new,false);
  assert.equal(row.mediaPolicy,'toc_only');
  assert.equal(row.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  assert.equal(row.reviewEvidence.abstractCopied,false);
  assert.equal(row.reviewEvidence.figureFetched,false);
  assert.equal(row.reviewEvidence.pdfFetched,false);
  assert.equal(isExcludedDoi(row.doi),false);
  for(const key of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
    assert.ok(row.scopeAssessment[key].length>=35,row.doi+':'+key);
  if(prod.has(row.doi)){
    const previous=prod.get(row.doi);
    assert.equal(previous.ingestionChannel,'historical_backfill');
    assert.equal(previous.mediaPolicy,'toc_only');
    assert.notEqual(previous.new,true);
    assert.equal(previous.addedDate,'');
  }
 }
});
test('scientific caveats preserve actual distinct catalyst modes and mechanism levels',()=>{
 const m=new Map(manifest.accepted.map(x=>[x.doi,x]));
 assert.match(m.get('10.1021/acs.joc.6c01078').scopeAssessment.generalityEvidence,/32个/);
 assert.match(m.get('10.1021/acs.joc.6c01304').scopeAssessment.generalityEvidence,/99:1 er/);
 assert.match(m.get('10.1021/acs.joc.6c01290').scopeAssessment.boundaryChallenge,/五糖/);
 assert.match(m.get('10.1021/acs.joc.6c01433').scopeAssessment.generalityEvidence,/Note/);
 assert.match(m.get('10.1021/acs.orglett.6c03420').scopeAssessment.boundaryChallenge,/CO/);
 assert.match(m.get('10.1021/acs.orglett.6c02921').scopeAssessment.boundaryChallenge,/自由基/);
 assert.match(m.get('10.1021/acs.orglett.6c02745').scopeAssessment.boundaryChallenge,/CPA/);
 assert.match(m.get('10.1002/anie.4869748').scopeAssessment.generalityEvidence,/100 mmol/);
 assert.match(m.get('10.1002/anie.6230875').scopeAssessment.generalityEvidence,/HheC/);
 assert.match(m.get('10.1126/sciadv.aeg3025').scopeAssessment.generalityEvidence,/模拟/);
});
test('source-reviewed selected DOI never ride the daily slot, owner veto stays exact',()=>{
 const prod=new Set(formal.articles.map(x=>x.doi));
 const vetoes=[];
 const policyExcluded=new Set(manifest.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi));
 const result=selectHistoricalAdmissions(manifest,{published:prod,policyExcluded,onPolicyVeto:x=>vetoes.push(x)});
 const ids=new Set(result.map(x=>x.doi));
 for(const doi of known)if(!prod.has(doi))assert.ok(ids.has(doi));
 assert.ok(vetoes.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 assert.ok(result.every(x=>!isExcludedDoi(x.doi)&&x.new===false&&x.addedDate===''));
 assert.equal(proof.guards.noD1,true);
 assert.equal(proof.guards.noFormalPublication,true);
 assert.equal(proof.guards.noPublisherMediaOrPdf,true);
});
