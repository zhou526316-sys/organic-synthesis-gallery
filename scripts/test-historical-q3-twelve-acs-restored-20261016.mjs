import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval,selectHistoricalAdmissions} from './lib/historical-admission.mjs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
import {isExcludedDoi} from '../shared/literature-policy.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const manifest=read('audit/historical-reviewed/approved-admissions.json');
const p1=read('audit/historical-reviewed/2026-10-16-q3-twelve-acs-part1-source-two-pass.json');
const p2=read('audit/historical-reviewed/2026-10-16-q3-twelve-acs-part2-source-two-pass.json');
const holds=read('audit/historical-reviewed/2026-10-16-acs-online-date-route-variance-and-scope-holds.json');
const pub=read('public/toc-demand-live.json');
const existing=new Set(pub.articles.map(x=>x.doi.toLowerCase()));
const rows=[...p1.approved,...p2.approved];
const byId=new Map(manifest.accepted.map(x=>[x.doi,x]));
const dates=new Map([
 ['10.1021/acs.joc.6c00852','2026-08-31'],
 ['10.1021/acs.joc.6c01132','2026-08-26'],
 ['10.1021/acs.joc.6c01019','2026-08-27'],
 ['10.1021/acs.joc.6c01355','2026-08-28'],
 ['10.1021/acs.orglett.6c03428','2026-08-29'],
 ['10.1021/acs.orglett.6c03400','2026-08-27'],
 ['10.1021/acs.orglett.6c03498','2026-08-29'],
 ['10.1021/acs.orglett.6c03305','2026-08-28'],
 ['10.1021/acs.orglett.6c03444','2026-08-27'],
 ['10.1021/acs.orglett.6c03047','2026-08-28'],
 ['10.1021/acs.orglett.6c03023','2026-08-22'],
 ['10.1021/acs.orglett.6c02986','2026-08-25']
]);
const roots=new Map([
 ['2026-08-22_2026-08-31_joc','713253fb6cb7d97c32fcb4cbc8e03e50b2910024b6ad4119d6af99faf5d40eb2'],
 ['2026-08-22_2026-08-31_organic-letters','66a573490c3735bd296c234d7409de0f94c356524fc4b6d259427b683164ea98']
]);
test('twelve new frozen original syntheses have independent article-specific second-pass and no formal release',()=>{
 assert.equal(validateHistoricalApproval(manifest).length,manifest.accepted.length);
 assert.ok(manifest.accepted.length>=244);
 assert.equal(manifest.summary.checked,manifest.accepted.length+manifest.pending.length);
 assert.equal(manifest.pending.length,2);
 assert.deepEqual([p1.part,p2.part],[1,2]);
 assert.equal(p1.baselineApproved,232);
 assert.equal(p2.baselineApproved,232);
 assert.deepEqual([p1.newApprovals,p2.newApprovals],[6,6]);
 assert.equal(rows.length,12);
 assert.deepEqual(new Set(rows.map(x=>x.doi)),new Set(dates.keys()));
 assert.deepEqual(new Set(rows.map(x=>x.journal)),new Set(['JOC','Organic Letters']));
 assert.equal(manifest.newOctober16Q3TwelveACSAfterTimeout.count,12);
 assert.equal(manifest.newOctober16Q3TwelveACSAfterTimeout.publishedByThisApproval,false);
 for(const p of rows){
   const x=byId.get(p.doi),e=p.reviewEvidence;
   assert.ok(x,p.doi);
   assert.deepEqual(x,p);
   assert.equal(existing.has(x.doi),false,'already-formal DOI was reapproved: '+x.doi);
   assert.equal(x.date,dates.get(x.doi));
   assert.equal(e.publisherOnlineDate,x.date);
   assert.equal(e.firstOnlineDateEvidence.officialPublisherFirstOnline,x.date);
   assert.equal(e.firstOnlineDateEvidence.sourceFrozenDate,x.date);
   assert.equal(e.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
   assert.equal(e.stageSourceSha256,roots.get(e.stageBatchId),x.doi);
   assert.match(e.stageBatchSha,/^[a-f0-9]{40}$/);
   assert.match(e.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
   assert.deepEqual(e.crossrefOpenalexSources,['crossref','openalex']);
   assert.equal(x.authors.length>0,true);
   assert.equal(x.citation.doi,x.doi);
   assert.equal(validChineseTitle(x.titleZh),true,x.doi);
   assert.equal(x.reviewPasses,2);
   assert.deepEqual(x.independentPasses.map(v=>v.decision),['include','include']);
   assert.equal(isExcludedDoi(x.doi),false);
   assert.equal(x.ingestionChannel,'historical_backfill');
   assert.equal(x.mediaPolicy,'toc_only');
   assert.equal(x.addedDate,'');
   assert.equal(x.new,false);
   assert.equal(e.abstractCopied,false);
   assert.equal(e.figureFetched,false);
   assert.equal(e.pdfFetched,false);
   assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
   assert.equal('abstract' in x,false);
   assert.equal('pdf' in x,false);
   assert.equal('fullText' in x,false);
   for(const f of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
     assert.ok(x.scopeAssessment[f].length>=35,x.doi+':'+f);
 }
});
test('scientific challenge verifies chemistry not just paper titles',()=>{
 const c=doi=>byId.get(doi).challengeReason;
 assert.match(c('10.1021/acs.joc.6c00852'),/镍催化/);
 assert.match(c('10.1021/acs.joc.6c01132'),/光/);
 assert.match(c('10.1021/acs.joc.6c01019'),/三组分/);
 assert.match(c('10.1021/acs.joc.6c01355'),/三条/);
 assert.match(c('10.1021/acs.orglett.6c03428'),/硝基/);
 assert.match(c('10.1021/acs.orglett.6c03400'),/MeMgBr/);
 assert.match(c('10.1021/acs.orglett.6c03498'),/copper-mediated/);
 assert.match(c('10.1021/acs.orglett.6c03305'),/Ni/);
 assert.match(c('10.1021/acs.orglett.6c03444'),/dr/);
 assert.match(c('10.1021/acs.orglett.6c03047'),/导向/);
 assert.match(c('10.1021/acs.orglett.6c03023'),/不同酶/);
 assert.match(c('10.1021/acs.orglett.6c02986'),/diradical/);
});
test('one-day ACS route variants and mechanism-only papers stay unapproved, not silently vetoed',()=>{
 const ids=holds.publisherDayRouteVariance.map(z=>z.doi);
 assert.equal(ids.length,4);
 for(const h of holds.publisherDayRouteVariance){
   assert.equal(h.freezeUnchanged,true);
   assert.notEqual(h.issuePage,h.landing);
   assert.equal(h.status,'unresolved_official_page_day_discrepancy');
   assert.ok(!byId.has(h.doi),h.doi);
 }
 assert.equal(holds.scientificScopeEvidencePending.length,2);
 assert.ok(holds.scientificScopeEvidencePending.every(x=>!byId.has(x.doi)));
 assert.deepEqual(new Set(manifest.pending.map(x=>x.doi)),new Set([
  '10.1021/acs.joc.6c01483','10.1021/acs.orglett.6c02374']));
 assert.ok(holds.immutableGuards.notAutomaticallyPublished);
});
test('formal 08:00 writer still owns admission and owner exclusion policy remains veto',()=>{
 const vetoes=[];
 const selected=selectHistoricalAdmissions(manifest,{
   published:existing,
   policyExcluded:new Set(manifest.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi)),
   onPolicyVeto:x=>vetoes.push(x)
 });
 const selectedDois=new Set(selected.map(x=>x.doi));
 for(const x of rows)assert.ok(selectedDois.has(x.doi),x.doi);
 assert.ok(vetoes.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 for(const x of selected)assert.equal(x.new,false);
 for(const prop of Object.values(p1.flags))assert.equal(prop,true);
 for(const prop of Object.values(p2.flags))assert.equal(prop,true);
});
