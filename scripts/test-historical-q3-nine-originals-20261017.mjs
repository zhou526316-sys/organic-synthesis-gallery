import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {validateHistoricalApproval,selectHistoricalAdmissions,historicCard} from './lib/historical-admission.mjs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
import {isExcludedDoi} from '../shared/literature-policy.js';

const read=p=>JSON.parse(readFileSync(p,'utf8'));
const root=read('audit/historical-reviewed/approved-admissions.json');
const part1=read('audit/historical-reviewed/2026-10-17-nine-originals-part1-aniew-orglett.json');
const part2=read('audit/historical-reviewed/2026-10-17-nine-originals-part2-acs-cyclizations.json');
const holds=read('audit/historical-reviewed/2026-10-17-two-acs-date-variance-holds.json');
const formal=read('public/toc-demand-live.json');
const published=new Map(formal.articles.map(r=>[r.doi?.toLowerCase(),r]));
const accepted=new Map(root.accepted.map(r=>[r.doi,r]));
const batch=[...part1.approved,...part2.approved];
const expected=new Map([
 ['10.1002/anie.7517064',['2026-09-01','Angew']],
 ['10.1021/acs.orglett.6c02867',['2026-07-28','Organic Letters']],
 ['10.1021/acs.orglett.6c02736',['2026-07-27','Organic Letters']],
 ['10.1021/acs.orglett.6c02895',['2026-07-22','Organic Letters']],
 ['10.1021/acs.orglett.6c02953',['2026-07-27','Organic Letters']],
 ['10.1021/acs.orglett.6c02714',['2026-07-30','Organic Letters']],
 ['10.1021/acs.orglett.6c02586',['2026-07-30','Organic Letters']],
 ['10.1021/acs.joc.6c01733',['2026-09-19','JOC']],
 ['10.1021/acs.joc.6c01890',['2026-09-21','JOC']]
]);
const sourceRoots=new Map([
 ['2026-09-01_2026-09-07_angew','32fca3cd65b48e42c434f3ba5278fc4dab1e436f74251c53098de4d79ff89744'],
 ['2026-07-22_2026-07-31_organic-letters','0a6b01c9f69433c2bd3e8e0c008e3e872e2e5c2e70b65b3d341e55f9868a5e61'],
 ['2026-09-15_2026-09-21_joc','4c6b34d680f068371c0bd724575ee7605dcd29867888f991e18dfed715f52648']
]);
test('nine DOI-distinct publisher-dated original preparative articles have independent article-specific academic review',()=>{
 assert.equal(validateHistoricalApproval(root).length,root.accepted.length);
 assert.ok(root.accepted.length>=263);
 assert.equal(root.summary.checked,root.accepted.length+root.pending.length);
 assert.equal(root.pending.length,2);
 assert.equal(part1.baselineApproved,254);assert.equal(part2.baselineApproved,254);
 assert.deepEqual([part1.part,part2.part],[1,2]);
 assert.deepEqual([part1.additions,part2.additions],[5,4]);
 assert.equal(batch.length,9);
 assert.deepEqual(new Set(batch.map(r=>r.doi)),new Set(expected.keys()));
 assert.equal(root.newOctober17NinePublisherOriginals.count,9);
 assert.equal(root.newOctober17NinePublisherOriginals.formalPublicationByApproval,false);
 const first=new Set(),second=new Set(),transforms=new Set();
 for(const proof of batch){
   const x=accepted.get(proof.doi),[date,journal]=expected.get(proof.doi);
   assert.ok(x,proof.doi);
   assert.deepEqual(x,proof);
   // A later sole 08:00 publication may move this reviewed DOI into Archive.
   if(published.has(x.doi)){
     const live=published.get(x.doi);
     assert.equal(live.date,x.date);
     assert.equal(live.ingestionChannel,'historical_backfill');
     assert.equal(live.mediaPolicy,'toc_only');
     assert.equal(live.addedDate,'');
     assert.notEqual(live.new,true);
   }
   assert.equal(x.date,date);
   assert.equal(x.journal,journal);
   assert.equal(x.reviewEvidence.publisherOnlineDate,date);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline,date);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.sourceFrozenDate,date);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
   assert.equal(x.reviewEvidence.stageBranch,'staging/historical-archive-nightly');
   assert.equal(x.reviewEvidence.stageSourceSha256,sourceRoots.get(x.reviewEvidence.stageBatchId));
   assert.match(x.reviewEvidence.stageBatchSha,/^[a-f0-9]{40}$/);
   assert.match(x.reviewEvidence.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
   assert.ok(x.reviewEvidence.crossrefOpenalexSources.includes('crossref'));
   if(x.journal!=='Angew')assert.deepEqual(x.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
   assert.equal(x.citation.doi,x.doi);
   assert.equal(x.citation.year,2026);
   assert.ok(x.authors.length>=2);
   assert.equal(validChineseTitle(x.titleZh),true,x.doi);
   assert.equal(x.reviewPasses,2);
   assert.deepEqual(x.independentPasses.map(y=>y.decision),['include','include']);
   assert.equal(x.firstPassDecision,'include');assert.equal(x.challengeDecision,'include');
   assert.ok(x.independentPasses[0].reason.length>=100);
   assert.ok(x.independentPasses[1].reason.length>=100);
   assert.equal(isExcludedDoi(x.doi),false);
   assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
   for(const k of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
      assert.ok(x.scopeAssessment[k].length>=45,x.doi+':'+k);
   for(const k of ['abstractCopied','figureFetched','pdfFetched'])assert.equal(x.reviewEvidence[k],false);
   for(const k of ['abstract','pdf','fullText'])assert.equal(k in x,false);
   assert.equal(x.addedDate,'');assert.equal(x.new,false);
   assert.equal(x.ingestionChannel,'historical_backfill');assert.equal(x.mediaPolicy,'toc_only');
   const card=historicCard(x);
   assert.equal(card.new,false);assert.equal(card.addedDate,'');
   assert.equal(card.mediaPolicy,'toc_only');assert.equal('pdf' in card,false);
   first.add(x.independentPasses[0].reason);
   second.add(x.independentPasses[1].reason);
   transforms.add(x.scopeAssessment.preparativeTransformation);
 }
 assert.equal(first.size,9);assert.equal(second.size,9);assert.equal(transforms.size,9);
});
test('scientific challenges distinguish chirality origin, radical identity, reagent incorporation, and electrochemical waveform',()=>{
 const c=id=>accepted.get(id).scopeAssessment.boundaryChallenge;
 assert.match(c('10.1002/anie.7517064'),/CPA/);
 assert.match(c('10.1021/acs.orglett.6c02867'),/96:4/);
 assert.match(c('10.1021/acs.orglett.6c02736'),/DFT/);
 assert.match(c('10.1021/acs.orglett.6c02895'),/SCF3/);
 assert.match(c('10.1021/acs.orglett.6c02953'),/硼酸/);
 assert.match(c('10.1021/acs.orglett.6c02714'),/高价碘/);
 assert.match(c('10.1021/acs.orglett.6c02586'),/Fe\(IV\)/);
 assert.match(c('10.1021/acs.joc.6c01733'),/交流电/);
 assert.match(c('10.1021/acs.joc.6c01890'),/高ee/);
});
test('prior date-conflicts and already-published DOI never pass academic intake',()=>{
 const stagedHolds=['10.1021/acs.orglett.6c02869','10.1021/acs.joc.6c01686'];
 assert.deepEqual(new Set(holds.records.map(x=>x.doi)),new Set(stagedHolds));
 for(const id of stagedHolds){
   assert.equal(accepted.has(id),false);
   assert.equal(root.pending.some(x=>x.doi===id),false);
 }
 assert.deepEqual(new Set(root.pending.map(x=>x.doi)),new Set([
 '10.1021/acs.joc.6c01483','10.1021/acs.orglett.6c02374'
 ]));
 for(const id of holds.alreadyFormallyPublishedNotReapproved){
   assert.equal(published.has(id),true,'already published source missing: '+id);
   assert.equal(accepted.has(id),false,'duplicate academic approval: '+id);
 }
 for(const [k,v] of Object.entries(holds.auditGuards))assert.equal(v,true,k);
});
test('existing fixed Beijing 08:00 writer and owner policy veto are not bypassed',()=>{
 const excluded=new Set(root.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi));
 const veto=[];
 const selected=selectHistoricalAdmissions(root,{
   published:new Set(published.keys()),policyExcluded:excluded,
   onPolicyVeto:x=>veto.push(x)
 });
 const selectedDois=new Set(selected.map(x=>x.doi));
 for(const x of batch)if(!published.has(x.doi))assert.ok(selectedDois.has(x.doi));
 assert.ok(veto.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 for(const v of Object.values(part1.guards))assert.equal(v,true);
 for(const v of Object.values(part2.guards))assert.equal(v,true);
 assert.ok(selected.every(x=>x.new===false&&x.addedDate===''));
});
