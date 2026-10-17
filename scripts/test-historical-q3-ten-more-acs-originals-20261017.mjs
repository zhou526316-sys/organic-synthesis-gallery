import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {validateHistoricalApproval,selectHistoricalAdmissions,historicCard} from './lib/historical-admission.mjs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
import {isExcludedDoi} from '../shared/literature-policy.js';

const read=p=>JSON.parse(readFileSync(p,'utf8'));
const manifest=read('audit/historical-reviewed/approved-admissions.json');
const formal=read('public/toc-demand-live.json');
const joc=read('audit/historical-reviewed/2026-10-17-ten-new-originals-seven-joc-two-pass.json');
const ol=read('audit/historical-reviewed/2026-10-17-ten-new-originals-three-orglett-two-pass.json');
const hold=read('audit/historical-reviewed/2026-10-17-orglett-6c02882-acs-page-date-variance-hold.json');
const extra=[...joc.approved,...ol.approved];
const approved=new Map(manifest.accepted.map(x=>[x.doi,x]));
const published=new Set(formal.articles.map(x=>x.doi.toLowerCase()));
const dates=new Map([
 ['10.1021/acs.joc.6c01762','2026-08-28'],
 ['10.1021/acs.joc.6c01386','2026-08-31'],
 ['10.1021/acs.joc.6c01518','2026-08-31'],
 ['10.1021/acs.joc.6c01319','2026-08-27'],
 ['10.1021/acs.joc.6c01511','2026-08-28'],
 ['10.1021/acs.joc.6c01782','2026-08-26'],
 ['10.1021/acs.joc.6c01576','2026-08-31'],
 ['10.1021/acs.orglett.6c03393','2026-08-31'],
 ['10.1021/acs.orglett.6c02782','2026-08-31'],
 ['10.1021/acs.orglett.6c03358','2026-08-26']
]);
const rootHash=new Map([
 ['2026-08-22_2026-08-31_joc','713253fb6cb7d97c32fcb4cbc8e03e50b2910024b6ad4119d6af99faf5d40eb2'],
 ['2026-08-22_2026-08-31_organic-letters','66a573490c3735bd296c234d7409de0f94c356524fc4b6d259427b683164ea98']
]);

test('ten independent original syntheses are 268-to-278 scholarly approvals, not a formal release',()=>{
 assert.equal(validateHistoricalApproval(manifest).length,278);
 assert.equal(manifest.accepted.length,278);
 assert.equal(manifest.pending.length,2);
 assert.deepEqual([manifest.summary.include,manifest.summary.checked],[278,280]);
 assert.equal(joc.newApprovals,7);
 assert.equal(ol.newApprovals,3);
 assert.deepEqual([joc.part,ol.part],[1,2]);
 assert.equal(joc.baselineApproved,268);
 assert.equal(ol.baselineApproved,268);
 assert.deepEqual(new Set(extra.map(x=>x.doi)),new Set(dates.keys()));
 assert.equal(manifest.newOctober17TenMoreACSOrganicOriginals.newApprovals,10);
 assert.equal(manifest.newOctober17TenMoreACSOrganicOriginals.publishedByThisApproval,false);
 const first=new Set(),second=new Set(),transforms=new Set();
 for(const row of extra){
   const x=approved.get(row.doi);
   assert.ok(x,'missing accepted DOI '+row.doi);
   assert.deepEqual(x,row);
   if(published.has(x.doi)){
     const formalRow=formal.articles.find(y=>y.doi===x.doi);
     assert.equal(formalRow.ingestionChannel,'historical_backfill');
     assert.equal(formalRow.mediaPolicy,'toc_only');
     assert.equal(formalRow.addedDate,'');
     assert.notEqual(formalRow.new,true);
     assert.equal(formalRow.date,x.date);
   }
   assert.equal(x.date,dates.get(x.doi));
   assert.equal(x.reviewEvidence.publisherOnlineDate,x.date);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.sourceFrozenDate,x.date);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline,x.date);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
   assert.equal(x.reviewEvidence.stageSourceSha256,rootHash.get(x.reviewEvidence.stageBatchId));
   assert.match(x.reviewEvidence.stageBatchSha,/^[a-f0-9]{40}$/);
   assert.match(x.reviewEvidence.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
   assert.deepEqual(x.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
   assert.equal(x.citation.doi,x.doi);
   assert.equal(x.citation.year,2026);
   assert.ok(x.citation.volume&&x.citation.issue&&/^\d+-\d+$/.test(x.citation.pages),x.doi);
   assert.equal(validChineseTitle(x.titleZh),true,x.doi);
   assert.equal(x.reviewPasses,2);
   assert.deepEqual(x.independentPasses.map(p=>p.decision),['include','include']);
   assert.equal(isExcludedDoi(x.doi),false);
   assert.equal(x.ingestionChannel,'historical_backfill');
   assert.equal(x.mediaPolicy,'toc_only');
   assert.equal(x.addedDate,'');
   assert.equal(x.new,false);
   assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
   assert.equal(x.reviewEvidence.abstractCopied,false);
   assert.equal(x.reviewEvidence.figureFetched,false);
   assert.equal(x.reviewEvidence.pdfFetched,false);
   for(const field of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
      assert.ok(x.scopeAssessment[field].length>=35,x.doi+':'+field);
   const card=historicCard(x);
   assert.equal(card.new,false);
   assert.equal(card.addedDate,'');
   assert.equal(card.mediaPolicy,'toc_only');
   assert.equal('pdf' in card,false);
   first.add(x.independentPasses[0].reason);
   second.add(x.independentPasses[1].reason);
   transforms.add(x.scopeAssessment.preparativeTransformation);
 }
 assert.equal(first.size,10);
 assert.equal(second.size,10);
 assert.equal(transforms.size,10);
});
test('article-specific methodological claims preserve published limitations',()=>{
 const challenge=id=>approved.get(id).challengeReason;
 assert.match(challenge('10.1021/acs.joc.6c01762'),/TMSN3/);
 assert.match(challenge('10.1021/acs.joc.6c01386'),/锌/);
 assert.match(challenge('10.1021/acs.joc.6c01518'),/硒粉/);
 assert.match(challenge('10.1021/acs.joc.6c01319'),/100 mol%/);
 assert.match(challenge('10.1021/acs.joc.6c01511'),/机械化学/);
 assert.match(challenge('10.1021/acs.joc.6c01782'),/NIS/);
 assert.match(challenge('10.1021/acs.joc.6c01576'),/stereodivergent/);
 assert.match(challenge('10.1021/acs.orglett.6c03393'),/E\/Z/);
 assert.match(challenge('10.1021/acs.orglett.6c02782'),/C3/);
 assert.match(challenge('10.1021/acs.orglett.6c03358'),/NBO/);
});
test('publisher route date dispute, original two pendings, and owner policy veto remain fail-closed',()=>{
 assert.equal(hold.doi,'10.1021/acs.orglett.6c02882');
 assert.equal(hold.crossrefOpenalexFrozenSourceDay,'2026-08-24');
 assert.deepEqual(new Set(hold.officialPublisherRouteReadbacks.map(r=>r.displayedPublishedOnline)),
     new Set(['2026-08-24','2026-08-25']));
 assert.equal(hold.guards.notAddedToApprovedManifest,true);
 assert.equal(approved.has(hold.doi),false);
 assert.deepEqual(new Set(manifest.pending.map(p=>p.doi)),
    new Set(['10.1021/acs.joc.6c01483','10.1021/acs.orglett.6c02374']));
 for(const id of ['10.1021/acs.joc.6c00852','10.1021/acs.orglett.6c03028','10.1021/acs.orglett.6c02707'])
    assert.equal(approved.has(id),false);
 const vetoes=[];
 const available=selectHistoricalAdmissions(manifest,{
   published,
   policyExcluded:new Set(manifest.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi)),
   onPolicyVeto:x=>vetoes.push(x)
 });
 const allow=new Set(available.map(x=>x.doi));
 for(const x of extra){
   if(published.has(x.doi))assert.equal(allow.has(x.doi),false,'formal archive DOI cannot release twice '+x.doi);
   else assert.ok(allow.has(x.doi),'not-yet-published original should await fixed slot '+x.doi);
 }
 assert.ok(vetoes.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 assert.ok(available.every(x=>x.new===false&&x.addedDate===''));
 for(const g of [joc.guards,ol.guards])for(const value of Object.values(g))assert.equal(value,true);
});
