import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval,selectHistoricalAdmissions} from './lib/historical-admission.mjs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
import {isExcludedDoi} from '../shared/literature-policy.js';

const read=p=>JSON.parse(readFileSync(p,'utf8'));
const m=read('audit/historical-reviewed/approved-admissions.json');
const proof=read('audit/historical-reviewed/2026-10-16-q3-nine-acs-wiley-synthetic-originals-two-pass.json');
const pub=read('public/toc-demand-live.json');
const accepted=new Map(m.accepted.map(x=>[x.doi,x]));
const expected=new Map([
 ['10.1021/acs.joc.6c01212','2026-07-29'],
 ['10.1021/acs.orglett.6c02393','2026-07-04'],
 ['10.1021/acs.orglett.6c02584','2026-07-06'],
 ['10.1021/acs.joc.6c00807','2026-07-28'],
 ['10.1021/acs.joc.6c01109','2026-07-30'],
 ['10.1021/acs.joc.6c01186','2026-07-30'],
 ['10.1002/anie.1980531','2026-09-04'],
 ['10.1021/acs.orglett.6c02970','2026-08-27'],
 ['10.1021/acs.orglett.6c03286','2026-08-28']
]);
const sourceRootHashes=new Map([
 ['2026-07-22_2026-07-31_joc','f989ee16faa4b3915d1d61984cba4111eb43fe73b8a61976b0a1d3ff556cd76f'],
 ['2026-07-01_2026-07-07_organic-letters','ddb2170e765d050587d8ac65e8ec437b5d4609e4505c6f07db7793d51b71b744'],
 ['2026-09-01_2026-09-07_angew','32fca3cd65b48e42c434f3ba5278fc4dab1e436f74251c53098de4d79ff89744'],
 ['2026-08-22_2026-08-31_organic-letters','66a573490c3735bd296c234d7409de0f94c356524fc4b6d259427b683164ea98']
]);
test('exact nine publisher original DOI, source root SHA, first-online days and bibliography',()=>{
 assert.equal(validateHistoricalApproval(m).length,m.accepted.length);
 assert.equal(m.summary.checked,m.accepted.length+m.pending.length);
 assert.ok(m.accepted.length>=227);
 assert.equal(m.pending.length,2);
 assert.equal(proof.baselineApproved,218);
 assert.equal(proof.newApprovals,9);
 assert.equal(proof.approved.length,9);
 assert.deepEqual(new Set(proof.approved.map(x=>x.doi)),new Set(expected.keys()));
 assert.equal(m.newOctober16NineACSAndWileyOriginals.count,9);
 for(const original of proof.approved){
   const x=accepted.get(original.doi),e=original.reviewEvidence;
   assert.ok(x,original.doi);
   assert.equal(x.date,expected.get(x.doi));
   assert.equal(e.publisherOnlineDate,x.date);
   assert.equal(e.firstOnlineDateEvidence.officialPublisherFirstOnline,x.date);
   assert.equal(e.firstOnlineDateEvidence.sourceFrozenDate,x.date);
   assert.equal(e.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
   assert.equal(x.citation.doi,x.doi);
   assert.equal(x.citation.year,2026);
   assert.ok(x.authors.length>0);
   assert.equal(validChineseTitle(x.titleZh),true,x.doi);
   assert.equal(e.stageBranch,'staging/historical-archive-nightly');
   assert.equal(e.stageSourceSha256,sourceRootHashes.get(e.stageBatchId),x.doi);
   assert.match(e.stageBatchSha,/^[a-f0-9]{40}$/);
   assert.match(e.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
   assert.deepEqual(e.crossrefOpenalexSources,['crossref','openalex']);
   assert.ok(e.publisherPage.toLowerCase().includes('/'+x.doi));
   assert.equal(x.reviewPasses,2);
   assert.deepEqual(x.independentPasses.map(p=>p.decision),['include','include']);
   assert.equal(x.firstPassDecision,'include');
   assert.equal(x.challengeDecision,'include');
   assert.equal(isExcludedDoi(x.doi),false);
   assert.equal(x.mediaPolicy,'toc_only');
   assert.equal(x.ingestionChannel,'historical_backfill');
   assert.equal(x.new,false);
   assert.equal(x.addedDate,'');
   assert.equal(e.abstractCopied,false);
   assert.equal(e.figureFetched,false);
   assert.equal(e.pdfFetched,false);
   assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
   assert.ok(!('abstract' in x)&&!('pdf' in x)&&!('fullText' in x));
   for(const field of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
     assert.ok(x.scopeAssessment[field].length>=45,field+':'+x.doi);
 }
});
test('individual scientific boundaries prevent unearned synthetic and mechanistic claims',()=>{
 const sc=id=>accepted.get(id).scopeAssessment;
 assert.ok(sc('10.1021/acs.joc.6c01212').generalityEvidence.includes('50–84%'));
 assert.ok(sc('10.1021/acs.orglett.6c02393').generalityEvidence.includes('Notopterol'));
 assert.ok(sc('10.1021/acs.orglett.6c02584').boundaryChallenge.includes('O-烷基异脲'));
 assert.ok(sc('10.1021/acs.joc.6c00807').boundaryChallenge.includes('氯'));
 assert.ok(sc('10.1021/acs.joc.6c01109').generalityEvidence.includes('Petasis'));
 assert.ok(sc('10.1021/acs.joc.6c01186').generalityEvidence.includes('TBD'));
 assert.ok(sc('10.1002/anie.1980531').boundaryChallenge.includes('Co/Josiphos'));
 assert.ok(sc('10.1021/acs.orglett.6c02970').boundaryChallenge.includes('可见光'));
 assert.ok(sc('10.1021/acs.orglett.6c03286').generalityEvidence.includes('1,4'));
 assert.ok(accepted.get('10.1021/acs.joc.6c01212').titleZh.includes('环状半缩醛'));
});
test('date-source proof is not the authority to publish; old owner exclusion still vetoed',()=>{
 const formal=new Map(pub.articles.map(x=>[x.doi,x]));
 const vetoes=[];
 const selected=selectHistoricalAdmissions(m,{
   published:new Set(formal.keys()),
   policyExcluded:new Set(m.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi)),
   onPolicyVeto:x=>vetoes.push(x)
 });
 const selectedDois=new Set(selected.map(x=>x.doi));
 for(const doi of expected.keys()){
   if(formal.has(doi)){
     const row=formal.get(doi);
     assert.equal(row.ingestionChannel,'historical_backfill');
     assert.equal(row.mediaPolicy,'toc_only');
     assert.equal(row.new,false);
     assert.equal(row.addedDate,'');
   }else assert.ok(selectedDois.has(doi),doi);
 }
 assert.ok(vetoes.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 assert.ok(selected.every(x=>!isExcludedDoi(x.doi)&&x.new===false&&x.addedDate===''));
 for(const val of Object.values(proof.guards))assert.equal(val,true);
});
