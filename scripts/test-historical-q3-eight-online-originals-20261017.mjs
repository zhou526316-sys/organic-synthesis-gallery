import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval,selectHistoricalAdmissions,historicCard} from './lib/historical-admission.mjs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
import {isExcludedDoi} from '../shared/literature-policy.js';

const load=p=>JSON.parse(readFileSync(p,'utf8'));
const manifest=load('audit/historical-reviewed/approved-admissions.json');
const part1=load('audit/historical-reviewed/2026-10-17-eight-q3-originals-part1-joc.json');
const part2=load('audit/historical-reviewed/2026-10-17-eight-q3-originals-part2-joc-orglett.json');
const holds=load('audit/historical-reviewed/2026-10-17-three-acs-first-online-discrepancies-hold.json');
const formal=load('public/toc-demand-live.json');
const entries=[...part1.approved,...part2.approved];
const accepted=new Map(manifest.accepted.map(x=>[x.doi,x]));
const published=new Set(formal.articles.map(x=>x.doi.toLowerCase()));
const days=new Map([
 ['10.1021/acs.joc.6c00646','2026-08-26'],
 ['10.1021/acs.joc.6c01208','2026-08-26'],
 ['10.1021/acs.joc.6c01404','2026-08-27'],
 ['10.1021/acs.joc.6c01587','2026-09-16'],
 ['10.1021/acs.joc.6c01733','2026-09-19'],
 ['10.1021/acs.joc.6c01819','2026-09-19'],
 ['10.1021/acs.orglett.6c02867','2026-07-28'],
 ['10.1021/acs.orglett.6c02736','2026-07-27']
]);
const rootSHA=new Map([
 ['2026-08-22_2026-08-31_joc','713253fb6cb7d97c32fcb4cbc8e03e50b2910024b6ad4119d6af99faf5d40eb2'],
 ['2026-09-15_2026-09-21_joc','4c6b34d680f068371c0bd724575ee7605dcd29867888f991e18dfed715f52648'],
 ['2026-07-22_2026-07-31_organic-letters','0a6b01c9f69433c2bd3e8e0c008e3e872e2e5c2e70b65b3d341e55f9868a5e61']
]);

test('eight ACS publisher-online original syntheses are distinct, source-frozen and two-pass-reviewed',()=>{
 assert.equal(validateHistoricalApproval(manifest).length,manifest.accepted.length);
 assert.ok(manifest.accepted.length>=262);
 assert.equal(manifest.summary.include,manifest.accepted.length);
 assert.equal(manifest.summary.checked,manifest.accepted.length+manifest.pending.length);
 assert.equal(manifest.pending.length,2);
 assert.deepEqual([part1.part,part2.part],[1,2]);
 assert.deepEqual([part1.newApprovals,part2.newApprovals],[4,4]);
 assert.equal(part1.baselineApproved,254);
 assert.equal(part2.baselineApproved,254);
 assert.deepEqual(new Set(entries.map(x=>x.doi)),new Set(days.keys()));
 assert.equal(manifest.newOctober17EightPublisherDOIOriginals.count,8);
 assert.equal(manifest.newOctober17EightPublisherDOIOriginals.notPublishedByThisApproval,true);
 const distinctScience=new Set(),challenges=new Set();
 for(const proof of entries){
   const x=accepted.get(proof.doi),e=proof.reviewEvidence;
   assert.ok(x,'missing new scholarly approval '+proof.doi);
   assert.deepEqual(x,proof);
   assert.equal(published.has(x.doi),false,'formal historical DOI should not be re-added '+x.doi);
   assert.equal(x.date,days.get(x.doi));
   assert.equal(x.citation.doi,x.doi);
   assert.equal(x.citation.year,2026);
   assert.ok(x.citation.volume&&x.citation.issue&&x.citation.pages.includes('-'),x.doi);
   assert.ok(x.authors.length>=3);
   assert.equal(validChineseTitle(x.titleZh),true,x.doi);
   assert.equal(x.reviewPasses,2);
   assert.deepEqual(x.independentPasses.map(p=>p.decision),['include','include']);
   assert.equal(e.publisherOnlineDate,x.date);
   assert.equal(e.publisherPage,'https://pubs.acs.org/doi/'+x.doi);
   assert.equal(e.firstOnlineDateEvidence.officialPublisherFirstOnline,x.date);
   assert.equal(e.firstOnlineDateEvidence.sourceFrozenDate,x.date);
   assert.equal(e.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
   assert.equal(e.stageBranch,'staging/historical-archive-nightly');
   assert.equal(e.stageSourceSha256,rootSHA.get(e.stageBatchId),x.doi);
   assert.equal(e.stageBatchSha.length,40,x.doi);
   assert.equal(e.sourceReviewQueueGitBlobSha.length,40,x.doi);
   assert.deepEqual(e.crossrefOpenalexSources,['crossref','openalex']);
   assert.equal(isExcludedDoi(x.doi),false);
   assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
   assert.equal(e.abstractCopied,false);
   assert.equal(e.figureFetched,false);
   assert.equal(e.pdfFetched,false);
   assert.equal(x.new,false);
   assert.equal(x.addedDate,'');
   assert.equal(x.mediaPolicy,'toc_only');
   assert.equal(x.ingestionChannel,'historical_backfill');
   for(const key of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
     assert.ok(x.scopeAssessment[key].length>=45,x.doi+' '+key);
   const card=historicCard(x);
   assert.equal(card.new,false);
   assert.equal(card.addedDate,'');
   assert.equal(card.mediaPolicy,'toc_only');
   assert.equal('abstract' in card,false);
   assert.equal('pdf' in card,false);
   distinctScience.add(x.scopeAssessment.preparativeTransformation);
   challenges.add(x.challengeReason);
 }
 assert.equal(distinctScience.size,8);
 assert.equal(challenges.size,8);
});

test('key scientific boundaries distinguish chemoselectivity, stereochemistry, natural-product synthesis and models',()=>{
 const reason=id=>accepted.get(id).challengeReason;
 assert.match(reason('10.1021/acs.joc.6c00646'),/tBuOK|强碱/);
 assert.match(reason('10.1021/acs.joc.6c01208'),/92%/);
 assert.match(reason('10.1021/acs.joc.6c01404'),/trans/);
 assert.match(reason('10.1021/acs.joc.6c01587'),/无光|可见光/);
 assert.match(reason('10.1021/acs.joc.6c01733'),/恒电流/);
 assert.match(reason('10.1021/acs.joc.6c01819'),/17步/);
 assert.match(reason('10.1021/acs.orglett.6c02867'),/96:4/);
 assert.match(reason('10.1021/acs.orglett.6c02736'),/自由基阴离子/);
});

test('three ACS first-online contradictions are documented only as held source, no publisher date guess',()=>{
 assert.equal(holds.items.length,3);
 assert.equal(holds.mode,'read_only_evidence_hold_no_admission');
 for(const h of holds.items){
   assert.notEqual(h.stageSourceDate,h.publisherPageDate,h.doi);
   assert.equal(accepted.has(h.doi),false,'held date dispute improperly admitted '+h.doi);
   assert.equal(manifest.pending.some(x=>x.doi===h.doi),false,'do not alter original authoritative two pending '+h.doi);
   assert.ok(h.publisherUrls.some(x=>x.includes(h.doi)),h.doi);
   assert.ok(h.status.startsWith('hold_unapproved'));
 }
 assert.deepEqual(new Set(manifest.pending.map(x=>x.doi)),new Set([
  '10.1021/acs.joc.6c01483','10.1021/acs.orglett.6c02374'
 ]));
 assert.equal(accepted.has('10.1021/acs.joc.6c00852'),false,'older publisher hold preserved');
 assert.equal(holds.guards.noManifestAdmission,true);
 assert.equal(holds.guards.noNewExclusion,true);
});

test('sole 08:00 writer and owner DOI veto remain controlling, not the review manifest itself',()=>{
 const vetoes=[];
 const policyExcluded=new Set(manifest.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi));
 const selected=selectHistoricalAdmissions(manifest,{published,policyExcluded,onPolicyVeto:x=>vetoes.push(x)});
 const ids=new Set(selected.map(x=>x.doi));
 for(const x of entries)assert.ok(ids.has(x.doi),x.doi);
 assert.ok(vetoes.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 assert.ok(selected.every(x=>x.new===false&&x.addedDate===''));
 for(const flag of [...Object.values(part1.guards),...Object.values(part2.guards)])assert.equal(flag,true);
});
