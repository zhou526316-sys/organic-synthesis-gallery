import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval} from './lib/historical-admission.mjs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
const m=JSON.parse(readFileSync('audit/historical-reviewed/approved-admissions.json','utf8'));
const live=JSON.parse(readFileSync('public/toc-demand-live.json','utf8'));
const excluded=JSON.parse(readFileSync('audit/literature-scope-corrections.json','utf8'));
const publisher='https://pubs.acs.org/doi/';
const known=[
 ['10.1021/acs.orglett.6c02791','2026-07-25','2026-07-22_2026-07-31_organic-letters','67f6960bccfa31a1d2477390309426061dc65563','d98a960fb5a969da79448eb4d5404bd2eaac027d'],
 ['10.1021/acs.orglett.6c02161','2026-07-28','2026-07-22_2026-07-31_organic-letters','67f6960bccfa31a1d2477390309426061dc65563','d98a960fb5a969da79448eb4d5404bd2eaac027d'],
 ['10.1021/acs.orglett.6c02188','2026-07-21','2026-07-15_2026-07-21_organic-letters','191472933f6e4097799a5642b86061b865421825','a9bceb214f6c409a443e34903f61ea3f3beb26c6'],
 ['10.1021/acs.orglett.6c03176','2026-08-20','2026-08-15_2026-08-21_organic-letters','9b28580b6638049b3007fea208c8d489c769ed79','c2e6be939bce716c000423a13e847667f6ee760f'],
 ['10.1021/acs.joc.6c01205','2026-08-12','2026-08-08_2026-08-14_joc','1e304fff3b34a0833ab461bd5381b34f722c798b','e6d198388db938014c5d837f6dc1602c1d7f8e17'],
 ['10.1021/acs.joc.6c01394','2026-08-10','2026-08-08_2026-08-14_joc','1e304fff3b34a0833ab461bd5381b34f722c798b','e6d198388db938014c5d837f6dc1602c1d7f8e17'],
 ['10.1021/acs.joc.6c00901','2026-07-09','2026-07-08_2026-07-14_joc','ca8733105479188e6a163c0d161bb49add041ef0','94ae434866589d87c9287a2ad8de4d28a80e8222'],
 ['10.1021/acs.joc.6c01053','2026-07-06','2026-07-01_2026-07-07_joc','158a2415687e4a0ecf0c588356f417cc1679d70a','4acc01e707fae7dc680fedeeb214fe01b20a80fc'],
 ['10.1021/acs.orglett.6c02716','2026-07-27','2026-07-22_2026-07-31_organic-letters','67f6960bccfa31a1d2477390309426061dc65563','d98a960fb5a969da79448eb4d5404bd2eaac027d'],
 ['10.1021/acs.orglett.6c02686','2026-08-15','2026-08-15_2026-08-21_organic-letters','9b28580b6638049b3007fea208c8d489c769ed79','c2e6be939bce716c000423a13e847667f6ee760f'],
 ['10.1021/acs.orglett.6c02640','2026-08-14','2026-08-08_2026-08-14_organic-letters','7bd5ce16a4ea71b93c86b143b95ef2c50b59e753','ebc9c0a42d1c8da2d545f068d6a43f653004dfe9']
];
test('eleven ACS original methods are scientifically audited separately from 08:00 production',()=>{
 assert.equal(validateHistoricalApproval(m).length,m.accepted.length);
 assert.equal(m.newOctober16Q3AcsMethodBatch.reviewedOriginalCount,11);
 assert.equal(m.newOctober16Q3AcsMethodBatch.noDirectPublication,true);
 assert.equal(m.newOctober16Q3AcsMethodBatch.addedToTodayOrHot,false);
 assert.equal(m.summary.checked,m.accepted.length+m.pending.length);
 assert.equal(m.pending.length,2);
 const admittedIds=new Set(),formalIds=new Set(live.articles.map(x=>x.doi));
 const forbidden=new Set(excluded.items.filter(x=>x.decision==='exclude').map(x=>x.doi));
 for(const [doi,date,root,rawSha,reviewSha] of known){
   const matches=m.accepted.filter(x=>x.doi===doi);
   assert.equal(matches.length,1,'no duplicates and no missing admitted paper '+doi);
   const row=matches[0];
   admittedIds.add(doi);
   assert.equal(row.date,date);
   assert.equal(row.reviewEvidence.publisherOnlineDate,date);
   assert.equal(row.reviewEvidence.publisherPage,publisher+doi);
   assert.equal(row.reviewEvidence.stageBatchId,root);
   assert.equal(row.reviewEvidence.stageBatchSha,rawSha);
   assert.equal(row.reviewEvidence.sourceReviewQueueGitBlobSha,reviewSha);
   assert.match(row.reviewEvidence.stageSourceSha256,/^[a-f0-9]{64}$/);
   assert.deepEqual(row.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
   assert.equal(row.reviewEvidence.publisherDirectArticleHistoryVerified,true);
   assert.equal(row.reviewEvidence.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
   assert.equal(row.decision,'include');
   assert.equal(row.firstPassDecision,'include');
   assert.equal(row.challengeDecision,'include');
   assert.equal(row.reviewPasses,2);
   assert.equal(row.independentPasses.length,2);
   assert.notEqual(row.independentPasses[0].assessment,row.independentPasses[1].reason);
   assert.equal(row.mediaPolicy,'toc_only');
   assert.equal(row.ingestionChannel,'historical_backfill');
   assert.equal(row.new,false);assert.equal(row.addedDate,'');
   assert.equal(validChineseTitle(row.titleZh),true);
   assert.equal(row.reviewEvidence.pdfFetched,false);
   assert.equal(row.reviewEvidence.figureFetched,false);
   assert.equal(row.reviewEvidence.abstractCopied,false);
   assert.equal(row.publisherAbstractRights,'not_verified_do_not_republish_full_text');
   assert.equal(forbidden.has(doi),false);
   // A later legitimate 08:00 fixed-slot historical release can now contain
   // this paper; approval regression must check metadata, not freeze the site.
   if(formalIds.has(doi)){
     const formalRow=live.articles.find(x=>x.doi===doi);
     assert.equal(formalRow.ingestionChannel,'historical_backfill');
     assert.equal(formalRow.mediaPolicy,'toc_only');
     assert.equal(formalRow.new,false);
     assert.equal(formalRow.addedDate,'');
   }
   assert.equal(['JOC','Organic Letters'].includes(row.journal),true);
   for(const k of ['primaryContribution','preparativeTransformation',
        'generalityEvidence','sourceEvidence','boundaryChallenge'])
     assert.ok(row.scopeAssessment[k].length>=40,doi+' '+k);
 }
 assert.equal(admittedIds.size,11);
 assert.deepEqual(new Set(m.newOctober16Q3AcsMethodBatch.newApprovedDois),admittedIds);
});
test('standalone publisher article research and historical issue date are not conflated',()=>{
 const total=m.accepted.find(x=>x.doi==='10.1021/acs.joc.6c01205');
 assert.match(total.scopeAssessment.generalityEvidence,/首次|first/i);
 assert.match(total.scopeAssessment.boundaryChallenge,/失败|未成功|负结果/);
 const formal=m.accepted.find(x=>x.doi==='10.1021/acs.joc.6c01394');
 assert.match(formal.scopeAssessment.generalityEvidence,/formal total synthesis|形式全合成/i);
 const elect=m.accepted.find(x=>x.doi==='10.1021/acs.orglett.6c02188');
 assert.match(elect.scopeAssessment.preparativeTransformation,/膦酸酯/);
 assert.match(elect.scopeAssessment.boundaryChallenge,/电极/);
 const Pd=m.accepted.find(x=>x.doi==='10.1021/acs.joc.6c00901');
 assert.match(Pd.scopeAssessment.generalityEvidence,/34个/);
 const Ti=m.accepted.find(x=>x.doi==='10.1021/acs.orglett.6c02686');
 assert.match(Ti.scopeAssessment.generalityEvidence,/60个/);
 // A later correction is a separate DOI and MUST NOT be a second original Letter.
 assert.equal(m.accepted.some(x=>x.doi==='10.1021/acs.orglett.6c03423'),false);
});
