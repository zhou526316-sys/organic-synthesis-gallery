import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval} from './lib/historical-admission.mjs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
const accepted=JSON.parse(readFileSync('audit/historical-reviewed/approved-admissions.json','utf8'));
const formal=JSON.parse(readFileSync('public/toc-demand-live.json','utf8'));
const entries=[
 ['10.1021/acs.joc.6c00656','2026-07-10','2026-07-08_2026-07-14_joc',
  'ca8733105479188e6a163c0d161bb49add041ef0','1957cc142582b5e8753d2320e1590240e9e17a46',
  'a63d5ccf56d4b29ed830b74122668ce47cdd4de8a445c0f6610daf772541d287'],
 ['10.1021/acs.joc.6c00718','2026-07-08','2026-07-08_2026-07-14_joc',
  'ca8733105479188e6a163c0d161bb49add041ef0','1957cc142582b5e8753d2320e1590240e9e17a46',
  'a63d5ccf56d4b29ed830b74122668ce47cdd4de8a445c0f6610daf772541d287'],
 ['10.1021/acs.joc.6c01376','2026-09-16','2026-09-15_2026-09-21_joc',
  '0a6b4fb5580453d2b101f2f94030ee7f9c473541','0291856081a86b8aba4e11d667f9e56b7757ac9e',
  '4c6b34d680f068371c0bd724575ee7605dcd29867888f991e18dfed715f52648'],
 ['10.1021/acs.joc.6c01788','2026-09-08','2026-09-08_2026-09-14_joc',
  'c5604566a1a9763ce4fbbd2233b424db5c960517','7f2236cb970dc7526bb2c588065e64b2c57d204c',
  'f0da1c52dcca8b76338f982a53a4c24e592e342e142bfcad92f29048429d3f14']
];
test('frozen Crossref/OpenAlex Q3 JOC batch has four article-specific two-pass method approvals',()=>{
 assert.equal(validateHistoricalApproval(accepted).length,accepted.accepted.length);
 assert.equal(accepted.newOctober16AdditionalJocScopeBatch.count,4);
 assert.equal(accepted.summary.checked,
   accepted.accepted.length+accepted.pending.length);
 assert.equal(accepted.pending.length,2);
 const allIds=new Set(accepted.accepted.map(x=>x.doi));
 assert.equal(allIds.size,accepted.accepted.length);
 const selected=new Set();
 for(const [doi,day,root,raw,review,sourceSha] of entries){
  const list=accepted.accepted.filter(x=>x.doi===doi);
  assert.equal(list.length,1);
  const x=list[0],ev=x.reviewEvidence;
  selected.add(doi);
  assert.equal(x.date,day);
  assert.equal(ev.publisherOnlineDate,day);
  assert.equal(ev.firstOnlineDateEvidence.officialPublisherFirstOnline,day);
  assert.equal(ev.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
  assert.equal(ev.publisherPage,'https://pubs.acs.org/doi/'+doi);
  assert.equal(ev.stageBatchId,root);
  assert.equal(ev.stageBatchSha,raw);
  assert.equal(ev.sourceReviewQueueGitBlobSha,review);
  assert.equal(ev.stageSourceSha256,sourceSha);
  assert.deepEqual(ev.crossrefOpenalexSources,['crossref','openalex']);
  assert.equal(ev.abstractCopied,false);
  assert.equal(ev.figureFetched,false);
  assert.equal(ev.pdfFetched,false);
  assert.equal(x.firstPassDecision,'include');
  assert.equal(x.challengeDecision,'include');
  assert.equal(x.reviewPasses,2);
  assert.equal(x.independentPasses.length,2);
  assert.notEqual(x.independentPasses[0].assessment,x.independentPasses[1].reason);
  assert.equal(validChineseTitle(x.titleZh),true);
  assert.equal(x.mediaPolicy,'toc_only');
  assert.equal(x.ingestionChannel,'historical_backfill');
  assert.equal(x.new,false);
  assert.equal(x.addedDate,'');
  assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  for(const field of ['primaryContribution','preparativeTransformation','generalityEvidence',
    'sourceEvidence','boundaryChallenge'])assert.ok(x.scopeAssessment[field].length>=35,doi+field);
  const alreadyPublished=formal.articles.find(f=>f.doi===doi);
  if(alreadyPublished){
   // Valid only if it entered through the SAME sole fixed 08:00 historic gate.
   assert.equal(alreadyPublished.ingestionChannel,'historical_backfill');
   assert.equal(alreadyPublished.mediaPolicy,'toc_only');
   assert.equal(alreadyPublished.new,false);
   assert.equal(alreadyPublished.addedDate,'');
  }
 }
 assert.deepEqual(selected,
  new Set(accepted.newOctober16AdditionalJocScopeBatch.approvedDois));
});
test('real organic transformation is not confused with catalyst material research or pure enzyme engineering',()=>{
 const map=new Map(accepted.accepted.map(x=>[x.doi,x]));
 const ox=map.get('10.1021/acs.joc.6c00656');
 assert.match(ox.scopeAssessment.primaryContribution,/重排/);
 assert.match(ox.scopeAssessment.boundaryChallenge,/消旋/);
 const est=map.get('10.1021/acs.joc.6c00718');
 assert.match(est.scopeAssessment.preparativeTransformation,/乙酸乙烯酯/);
 assert.match(est.scopeAssessment.boundaryChallenge,/酶工程/);
 const ring=map.get('10.1021/acs.joc.6c01376');
 assert.match(ring.scopeAssessment.primaryContribution,/动态动力学拆分/);
 assert.match(ring.scopeAssessment.generalityEvidence,/88%/);
 const mannich=map.get('10.1021/acs.joc.6c01788');
 assert.match(mannich.scopeAssessment.preparativeTransformation,/Mannich/);
 assert.match(mannich.scopeAssessment.generalityEvidence,/99%/);
});
test('already formally present aza-Michael and genuinely disputed publisher dates cannot be re-admitted here',()=>{
 for(const doi of accepted.newOctober16AdditionalJocScopeBatch.alreadyFormallyPresentNotReAdmitted){
  assert.equal(accepted.newOctober16AdditionalJocScopeBatch.approvedDois.includes(doi),false);
 }
 for(const doi of accepted.newOctober16AdditionalJocScopeBatch.knownDateConflictsNotAdmitted)
  assert.equal(accepted.newOctober16AdditionalJocScopeBatch.approvedDois.includes(doi),false);
});
