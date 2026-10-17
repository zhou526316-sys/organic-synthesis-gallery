import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval,selectHistoricalAdmissions,historicCard} from './lib/historical-admission.mjs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
import {isExcludedDoi} from '../shared/literature-policy.js';

const read=p=>JSON.parse(readFileSync(p,'utf8'));
const manifest=read('audit/historical-reviewed/approved-admissions.json');
const ol=read('audit/historical-reviewed/2026-10-16-q3-ten-source-verified-originals-part1-orglett.json');
const joc=read('audit/historical-reviewed/2026-10-16-q3-ten-source-verified-originals-part2-joc.json');
const formal=read('public/toc-demand-live.json');
const published=new Set(formal.articles.map(x=>x.doi.toLowerCase()));
const entries=[...ol.approved,...joc.approved],accepted=new Map(manifest.accepted.map(x=>[x.doi,x]));
const expected=new Map([
 ['10.1021/acs.orglett.6c02582','2026-07-29'],
 ['10.1021/acs.orglett.6c02743','2026-07-30'],
 ['10.1021/acs.orglett.6c02778','2026-07-28'],
 ['10.1021/acs.orglett.6c02806','2026-07-29'],
 ['10.1021/acs.orglett.6c02645','2026-07-27'],
 ['10.1021/acs.joc.6c01268','2026-07-25'],
 ['10.1021/acs.joc.6c01384','2026-07-27'],
 ['10.1021/acs.joc.6c01526','2026-08-27'],
 ['10.1021/acs.joc.6c01408','2026-08-27'],
 ['10.1021/acs.joc.6c01759','2026-09-21']
]);
const roots=new Map([
 ['2026-07-22_2026-07-31_organic-letters','0a6b01c9f69433c2bd3e8e0c008e3e872e2e5c2e70b65b3d341e55f9868a5e61'],
 ['2026-07-22_2026-07-31_joc','f989ee16faa4b3915d1d61984cba4111eb43fe73b8a61976b0a1d3ff556cd76f'],
 ['2026-08-22_2026-08-31_joc','713253fb6cb7d97c32fcb4cbc8e03e50b2910024b6ad4119d6af99faf5d40eb2'],
 ['2026-09-15_2026-09-21_joc','4c6b34d680f068371c0bd724575ee7605dcd29867888f991e18dfed715f52648']
]);

test('ten DOI-distinct original syntheses pass full immutable, bibliography and two-pass source checks',()=>{
 assert.equal(validateHistoricalApproval(manifest).length,manifest.accepted.length);
 assert.ok(manifest.accepted.length>=254);
 assert.equal(manifest.summary.checked,manifest.accepted.length+manifest.pending.length);
 assert.equal(manifest.pending.length,2);
 assert.deepEqual([ol.part,joc.part],[1,2]);
 assert.equal(ol.baselineApproved,244);
 assert.equal(joc.baselineApproved,244);
 assert.equal(ol.newApprovals,5);assert.equal(joc.newApprovals,5);
 assert.deepEqual(new Set(entries.map(x=>x.doi)),new Set(expected.keys()));
 assert.equal(manifest.newOctober16TenACSOriginalsSourceChecked.count,10);
 assert.equal(manifest.newOctober16TenACSOriginalsSourceChecked.notPublishedByThisApproval,true);
 const first=new Set(),second=new Set(),synthesis=new Set();
 for(const proof of entries){
   const x=accepted.get(proof.doi);
   assert.ok(x,proof.doi);
   assert.deepEqual(x,proof);
   if(published.has(x.doi)){
     const live=formal.articles.find(row=>row.doi===x.doi);
     assert.equal(live.date,x.date);
     assert.equal(live.ingestionChannel,'historical_backfill');
     assert.equal(live.mediaPolicy,'toc_only');
     assert.equal(live.addedDate,'');
     assert.notEqual(live.new,true);
   }
   assert.equal(x.date,expected.get(x.doi));
   const evidence=x.reviewEvidence;
   assert.equal(evidence.publisherOnlineDate,x.date);
   assert.equal(evidence.firstOnlineDateEvidence.officialPublisherFirstOnline,x.date);
   assert.equal(evidence.firstOnlineDateEvidence.sourceFrozenDate,x.date);
   assert.equal(evidence.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
   assert.equal(evidence.stageBranch,'staging/historical-archive-nightly');
   assert.equal(evidence.stageSourceSha256,roots.get(evidence.stageBatchId),x.doi);
   assert.match(evidence.stageBatchSha,/^[a-f0-9]{40}$/);
   assert.match(evidence.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
   assert.deepEqual(evidence.crossrefOpenalexSources,['crossref','openalex']);
   assert.equal(evidence.publisherPage,'https://pubs.acs.org/doi/'+x.doi);
   assert.equal(x.citation.doi,x.doi);
   assert.equal(x.citation.year,2026);
   assert.ok(x.citation.volume&&x.citation.issue&&/^\d+-\d+$/.test(x.citation.pages),x.doi);
   assert.ok(x.authors.length>=3);
   assert.equal(validChineseTitle(x.titleZh),true,x.doi);
   assert.equal(x.reviewPasses,2);
   assert.deepEqual(x.independentPasses.map(y=>y.decision),['include','include']);
   assert.equal(x.firstPassDecision,'include');
   assert.equal(x.challengeDecision,'include');
   assert.equal(isExcludedDoi(x.doi),false);
   assert.equal(x.mediaPolicy,'toc_only');
   assert.equal(x.ingestionChannel,'historical_backfill');
   assert.equal(x.new,false);
   assert.equal(x.addedDate,'');
   assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
   assert.equal(evidence.abstractCopied,false);
   assert.equal(evidence.figureFetched,false);
   assert.equal(evidence.pdfFetched,false);
   for(const k of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
     assert.ok(x.scopeAssessment[k].length>=45,x.doi+':'+k);
   first.add(x.independentPasses[0].reason);
   second.add(x.independentPasses[1].reason);
   synthesis.add(x.scopeAssessment.preparativeTransformation);
   const card=historicCard(x);
   assert.equal(card.new,false);
   assert.equal(card.addedDate,'');
   assert.equal(card.mediaPolicy,'toc_only');
   assert.equal('pdf' in card,false);
   assert.equal('abstract' in card,false);
 }
 assert.equal(first.size,10);assert.equal(second.size,10);assert.equal(synthesis.size,10);
});
test('each article has chemistry-specific boundary instead of generic abstract restatement',()=>{
 const c=doi=>accepted.get(doi).challengeReason;
 assert.match(c('10.1021/acs.orglett.6c02582'),/异头溴化/);
 assert.match(c('10.1021/acs.orglett.6c02743'),/HFIP/);
 assert.match(c('10.1021/acs.orglett.6c02778'),/两性离子/);
 assert.match(c('10.1021/acs.orglett.6c02806'),/1,6-HAT/);
 assert.match(c('10.1021/acs.orglett.6c02645'),/CF3|β-F/);
 assert.match(c('10.1021/acs.joc.6c01268'),/恒电流/);
 assert.match(c('10.1021/acs.joc.6c01384'),/对映选择性/);
 assert.match(c('10.1021/acs.joc.6c01526'),/切换/);
 assert.match(c('10.1021/acs.joc.6c01408'),/非对映/);
 assert.match(c('10.1021/acs.joc.6c01759'),/EnT/);
});
test('already formally catalogued ACS DOI, date holds, policy exclusions and 08:00 release gate stay intact',()=>{
 const already=[
 '10.1021/acs.orglett.6c03062',
 '10.1021/acs.orglett.6c02881',
 '10.1021/acs.orglett.6c02944'
 ];
 for(const doi of already){
   assert.ok(published.has(doi),'formal DOI missing '+doi);
   assert.equal(accepted.has(doi),false,'do not re-approve formally catalogued DOI '+doi);
 }
 for(const doi of [
 '10.1021/acs.joc.6c00852',
 '10.1021/acs.orglett.6c03028',
 '10.1021/acs.orglett.6c02707'
 ])assert.equal(accepted.has(doi),false,'prior held DOI must stay unresolved '+doi);
 assert.deepEqual(new Set(manifest.pending.map(x=>x.doi)),new Set([
  '10.1021/acs.joc.6c01483','10.1021/acs.orglett.6c02374']));
 const policyExcluded=new Set(manifest.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi));
 const vetoes=[];
 const admissions=selectHistoricalAdmissions(manifest,{published,policyExcluded,onPolicyVeto:x=>vetoes.push(x)});
 const selected=new Set(admissions.map(x=>x.doi));
 for(const x of entries)
   if(!published.has(x.doi))assert.ok(selected.has(x.doi),'unpublished approved DOI held by release selector '+x.doi);
 assert.ok(vetoes.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 assert.ok(admissions.every(x=>x.new===false&&x.addedDate===''));
 for(const field of Object.values(ol.guards))assert.equal(field,true);
 for(const field of Object.values(joc.guards))assert.equal(field,true);
});
