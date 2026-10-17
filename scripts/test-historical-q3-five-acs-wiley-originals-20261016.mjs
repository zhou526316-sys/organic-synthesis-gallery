import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval,selectHistoricalAdmissions} from './lib/historical-admission.mjs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
import {isExcludedDoi} from '../shared/literature-policy.js';

const read=p=>JSON.parse(readFileSync(p,'utf8'));
const manifest=read('audit/historical-reviewed/approved-admissions.json');
const packet=read('audit/historical-reviewed/2026-10-16-q3-five-acs-wiley-original-preparations-two-pass.json');
const site=read('public/toc-demand-live.json');
const accepted=new Map(manifest.accepted.map(x=>[x.doi,x]));
const expected=new Map([
 ['10.1002/anie.2368387','2026-09-04'],
 ['10.1021/acs.orglett.6c02295','2026-07-31'],
 ['10.1021/acs.orglett.6c02476','2026-07-31'],
 ['10.1021/acs.joc.6c00411','2026-07-27'],
 ['10.1021/acs.joc.6c00523','2026-07-27']
]);
const hashes=new Map([
 ['2026-09-01_2026-09-07_angew','32fca3cd65b48e42c434f3ba5278fc4dab1e436f74251c53098de4d79ff89744'],
 ['2026-07-22_2026-07-31_organic-letters','0a6b01c9f69433c2bd3e8e0c008e3e872e2e5c2e70b65b3d341e55f9868a5e61'],
 ['2026-07-22_2026-07-31_joc','f989ee16faa4b3915d1d61984cba4111eb43fe73b8a61976b0a1d3ff556cd76f']
]);
test('five additional publisher-verified original-synthesis DOI extend academic approvals, never a release',()=>{
 assert.equal(validateHistoricalApproval(manifest).length,manifest.accepted.length);
 assert.ok(manifest.accepted.length>=232);
 assert.equal(manifest.summary.checked,manifest.accepted.length+manifest.pending.length);
 assert.equal(manifest.pending.length,2);
 assert.equal(packet.baselineApproved,227);
 assert.equal(packet.newApprovals,5);
 assert.equal(packet.approved.length,5);
 assert.deepEqual(new Set(packet.approved.map(x=>x.doi)),new Set(expected.keys()));
 assert.equal(manifest.newOctober16FiveACSAndWileyOriginals.publishedByThisApproval,false);
 for(const proof of packet.approved){
   const x=accepted.get(proof.doi);
   assert.ok(x,proof.doi);
   assert.deepEqual(x,proof);
   assert.equal(x.date,expected.get(x.doi));
   assert.equal(x.reviewEvidence.publisherOnlineDate,x.date);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline,x.date);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.sourceFrozenDate,x.date);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
   assert.equal(x.reviewEvidence.stageSourceSha256,hashes.get(x.reviewEvidence.stageBatchId));
   assert.equal(x.reviewEvidence.stageBranch,'staging/historical-archive-nightly');
   assert.match(x.reviewEvidence.stageBatchSha,/^[a-f0-9]{40}$/);
   assert.match(x.reviewEvidence.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
   assert.deepEqual(x.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
   assert.equal(x.authors.length>0,true);
   assert.equal(x.citation.doi,x.doi);
   assert.equal(validChineseTitle(x.titleZh),true,x.doi);
   assert.equal(x.reviewPasses,2);
   assert.deepEqual(x.independentPasses.map(v=>v.decision),['include','include']);
   assert.equal(isExcludedDoi(x.doi),false);
   assert.equal(x.new,false);
   assert.equal(x.addedDate,'');
   assert.equal(x.ingestionChannel,'historical_backfill');
   assert.equal(x.mediaPolicy,'toc_only');
   assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
   assert.equal(x.reviewEvidence.abstractCopied,false);
   assert.equal(x.reviewEvidence.figureFetched,false);
   assert.equal(x.reviewEvidence.pdfFetched,false);
   assert.equal('abstract' in x,false);
   assert.equal('fullText' in x,false);
   assert.equal('pdf' in x,false);
   for(const k of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
     assert.ok(x.scopeAssessment[k].length>=45,x.doi+':'+k);
 }
});
test('science-specific adversarial boundaries are preserved and no pending DOI is admitted',()=>{
 assert.ok(accepted.get('10.1002/anie.2368387').challengeReason.includes('二氢喹唑啉酮'));
 assert.ok(accepted.get('10.1021/acs.orglett.6c02295').challengeReason.includes('methoxyamine'));
 assert.ok(accepted.get('10.1021/acs.orglett.6c02476').challengeReason.includes('1,6-HAT'));
 assert.ok(accepted.get('10.1021/acs.joc.6c00411').challengeReason.includes('非对映'));
 assert.ok(accepted.get('10.1021/acs.joc.6c00523').challengeReason.includes('荧光'));
 assert.deepEqual(new Set(manifest.pending.map(p=>p.doi)),new Set(['10.1021/acs.joc.6c01483','10.1021/acs.orglett.6c02374']));
});
test('existing site and owner exclusion remain controlling; archival entries never enter Today/Hot',()=>{
 const formal=new Map(site.articles.map(x=>[x.doi,x]));
 const vetoes=[];
 const selected=selectHistoricalAdmissions(manifest,{
  published:new Set(formal.keys()),
  policyExcluded:new Set(manifest.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi)),
  onPolicyVeto:x=>vetoes.push(x)
 });
 const selectedDois=new Set(selected.map(x=>x.doi));
 for(const doi of expected.keys()){
   if(formal.has(doi)){
     const row=formal.get(doi);
     assert.equal(row.ingestionChannel,'historical_backfill');
     assert.equal(row.mediaPolicy,'toc_only');
     assert.notEqual(row.new,true);
     assert.equal(row.addedDate,'');
   }else assert.ok(selectedDois.has(doi),doi);
 }
 assert.ok(vetoes.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 for(const field of Object.values(packet.guards))assert.equal(field,true);
});
