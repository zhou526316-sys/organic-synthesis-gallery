import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {validateHistoricalApproval,selectHistoricalAdmissions,historicCard} from './lib/historical-admission.mjs';
import {isExcludedDoi} from '../shared/literature-policy.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const root=read('audit/historical-reviewed/approved-admissions.json');
const formal=read('public/toc-demand-live.json');
const eight=[
 ...read('audit/historical-reviewed/2026-10-17-eight-q3-originals-part1-joc.json').approved,
 ...read('audit/historical-reviewed/2026-10-17-eight-q3-originals-part2-joc-orglett.json').approved
];
const nine=[
 ...read('audit/historical-reviewed/2026-10-17-nine-originals-part1-aniew-orglett.json').approved,
 ...read('audit/historical-reviewed/2026-10-17-nine-originals-part2-acs-cyclizations.json').approved
];
const dateHolds=[
 read('audit/historical-reviewed/2026-10-17-three-acs-first-online-discrepancies-hold.json'),
 read('audit/historical-reviewed/2026-10-17-two-acs-date-variance-holds.json')
];
const ids=new Set(root.accepted.map(x=>x.doi));
const eightMap=new Map(eight.map(x=>[x.doi,x]));
const nineMap=new Map(nine.map(x=>[x.doi,x]));
const overlaps=[...eightMap.keys()].filter(id=>nineMap.has(id)).sort();
// Freeze exactly the 14 DOI approved by the consolidation. Later approved batches extend the manifest without altering this cohort.
const newRows=root.accepted.slice(254,268);
const formalMap=new Map(formal.articles.map(x=>[x.doi.toLowerCase(),x]));
const expectedOverlaps=[
 '10.1021/acs.joc.6c01733',
 '10.1021/acs.orglett.6c02736',
 '10.1021/acs.orglett.6c02867'
].sort();

test('two independent DOI-exact research passes reconcile seventeen reviews into fourteen unique academic approvals',()=>{
 assert.equal(validateHistoricalApproval(root).length,root.accepted.length);
 assert.ok(root.accepted.length>=268,'future DOI-exact approvals may extend this manifest');
 assert.equal(root.pending.length,2);
 assert.equal(root.summary.include,root.accepted.length);
 assert.equal(root.summary.checked,root.accepted.length+root.pending.length);
 assert.equal(new Set(root.accepted.map(x=>x.doi)).size,root.accepted.length);
 assert.deepEqual(overlaps,expectedOverlaps);
 assert.equal(eight.length,8);
 assert.equal(nine.length,9);
 const union=new Set([...eightMap.keys(),...nineMap.keys()]);
 assert.equal(union.size,14);
 assert.deepEqual(new Set(newRows.map(x=>x.doi)),union);
 assert.equal(root.newOctober17ConsolidatedFourteenOriginals.totalDistinctNewApproved,14);
 assert.equal(root.newOctober17ConsolidatedFourteenOriginals.aggregatedReviewRows,17);
 assert.deepEqual(root.newOctober17ConsolidatedFourteenOriginals.overlappingIndependentReviewedDois.sort(),expectedOverlaps);
 assert.equal(root.newOctober17NinePublisherOriginals.count,9);
 assert.equal(root.newOctober17EightPublisherDOIOriginals.count,8);
 for(const x of newRows){
   assert.equal(x.decision,'include');
   assert.equal(x.reviewPasses,2);
   assert.deepEqual(x.independentPasses.map(p=>p.decision),['include','include']);
   assert.equal(isExcludedDoi(x.doi),false);
   assert.equal(x.reviewEvidence.stageBranch,'staging/historical-archive-nightly');
   assert.equal(x.reviewEvidence.publisherOnlineDate,x.date);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline,x.date);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
   assert.match(x.reviewEvidence.stageBatchSha,/^[a-f0-9]{40}$/);
   assert.match(x.reviewEvidence.stageSourceSha256,/^[a-f0-9]{64}$/);
   assert.equal(x.reviewEvidence.abstractCopied,false);
   assert.equal(x.reviewEvidence.figureFetched,false);
   assert.equal(x.reviewEvidence.pdfFetched,false);
   assert.ok(x.authors.length>=2);
   assert.equal(x.citation.doi,x.doi);
   assert.equal(x.new,false);
   assert.equal(x.addedDate,'');
   assert.equal(x.mediaPolicy,'toc_only');
   assert.equal(x.ingestionChannel,'historical_backfill');
   assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
   const card=historicCard(x);
   assert.equal(card.new,false);
   assert.equal(card.addedDate,'');
   assert.equal(card.mediaPolicy,'toc_only');
   if(formalMap.has(x.doi)){
     const f=formalMap.get(x.doi);
     assert.equal(f.ingestionChannel,'historical_backfill');
     assert.equal(f.mediaPolicy,'toc_only');
     assert.equal(f.date,x.date);
     assert.notEqual(f.new,true);
     assert.equal(f.addedDate,'');
   }
 }
});

test('three duplicate DOI reviews have the same frozen journal identity, first-online date, authors and provenance',()=>{
 for(const id of overlaps){
   const a=eightMap.get(id),b=nineMap.get(id),live=root.accepted.find(x=>x.doi===id);
   assert.ok(live);
   assert.equal(a.date,b.date);
   assert.equal(a.date,live.date);
   assert.equal(a.title,b.title);
   assert.deepEqual(a.authors,b.authors);
   assert.deepEqual(a.authors,live.authors);
   assert.deepEqual(a.citation,b.citation);
   assert.equal(a.reviewEvidence.stageBatchSha,b.reviewEvidence.stageBatchSha);
   assert.equal(a.reviewEvidence.sourceReviewQueueGitBlobSha,b.reviewEvidence.sourceReviewQueueGitBlobSha);
   assert.equal(a.reviewEvidence.stageSourceSha256,b.reviewEvidence.stageSourceSha256);
   assert.equal(a.reviewEvidence.publisherOnlineDate,b.reviewEvidence.publisherOnlineDate);
 }
 const boryl=root.accepted.find(x=>x.doi==='10.1021/acs.orglett.6c02736');
 assert.match(boryl.scopeAssessment.boundaryChallenge,/自由基阴离子/);
 assert.match(boryl.scopeAssessment.boundaryChallenge,/DFT/);
 const selenium=root.accepted.find(x=>x.doi==='10.1021/acs.joc.6c01733');
 assert.match(selenium.scopeAssessment.boundaryChallenge,/恒电流/);
 assert.match(selenium.scopeAssessment.boundaryChallenge,/交流电/);
});

test('all separate publisher date conflicts and owner-policy veto remain unadmitted',()=>{
 const oldPending=new Set(root.pending.map(x=>x.doi));
 assert.deepEqual(oldPending,new Set([
  '10.1021/acs.joc.6c01483','10.1021/acs.orglett.6c02374'
 ]));
 const held=new Set([
  '10.1021/acs.joc.6c00852','10.1021/acs.joc.6c01890',
  '10.1021/acs.orglett.6c03028','10.1021/acs.orglett.6c02707',
  '10.1021/acs.orglett.6c02869','10.1021/acs.joc.6c01686',
  '10.1021/acs.joc.6c01612','10.1021/acs.orglett.6c03004'
 ]);
 for(const group of dateHolds){
   for(const row of group.items||group.records)held.add(row.doi);
 }
 for(const doi of held)assert.equal(ids.has(doi),false,'held DOI was silently approved '+doi);
 const vetoDoi='10.1038/s41467-026-77616-8';
 assert.ok(ids.has(vetoDoi));
 assert.equal(isExcludedDoi(vetoDoi),true);
 const vetoes=[];
 const eligible=selectHistoricalAdmissions(root,{
  published:new Set(formalMap.keys()),
  policyExcluded:new Set(root.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi)),
  onPolicyVeto:x=>vetoes.push(x)
 });
 assert.ok(vetoes.some(x=>x.doi===vetoDoi));
 const pendingDois=new Set(eligible.map(x=>x.doi));
 for(const row of newRows){
   if(formalMap.has(row.doi))assert.equal(pendingDois.has(row.doi),false);
   else assert.ok(pendingDois.has(row.doi));
 }
});
