import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval,selectHistoricalAdmissions,historicalPublisherPageMatchesDoi}
  from './lib/historical-admission.mjs';
import {isExcludedDoi} from '../shared/literature-policy.js';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const manifest=read('audit/historical-reviewed/approved-admissions.json');
const proof=read('audit/historical-reviewed/2026-10-16-eight-crossjournal-publisher-dated-ccs-rsc-joc-two-pass.json');
const formal=read('public/toc-demand-live.json');
const entries=new Map(manifest.accepted.map(x=>[x.doi,x]));
const expected=new Map([
  ['10.31635/ccschem.026.202607790',['2026-07-03','2026-07-03','toc_only']],
  ['10.31635/ccschem.026.202608043',['2026-08-22','2026-08-22','toc_only']],
  ['10.1039/d6sc02950g',['2026-07-31','','toc_only']],
  ['10.1021/acs.joc.6c00992',['2026-07-30','2026-07-30','toc_only']],
  ['10.31635/ccschem.026.202607664',['2026-07-13','2026-09-01','toc_only']],
  ['10.31635/ccschem.026.202607709',['2026-05-07','2026-07-01','metadata_only']],
  ['10.31635/ccschem.026.202607340',['2026-05-14','2026-09-01','metadata_only']],
  ['10.31635/ccschem.026.202607308',['2026-04-04','2026-09-01','metadata_only']]
]);
test('all eight reviewed DOI and true online dates are pinned, without issuer-date laundering',()=>{
  assert.equal(validateHistoricalApproval(manifest).length,manifest.accepted.length);
  assert.equal(manifest.summary.checked,manifest.accepted.length+manifest.pending.length);
  assert.equal(proof.baselineAccepted,210);
  assert.equal(proof.newApprovals,8);
  assert.equal(proof.approved.length,8);
  assert.ok(manifest.summary.include>=218);
  assert.equal(manifest.pending.length,2);
  assert.equal(manifest.newOctober16EightCCSRSCJOC.count,8);
  assert.deepEqual(new Set(proof.approved.map(x=>x.doi)),new Set(expected.keys()));
  for(const x of proof.approved){
    const row=entries.get(x.doi);
    assert.ok(row,x.doi);
    const [publisherDate,sourceDate,media]=expected.get(row.doi);
    assert.equal(row.date,publisherDate);
    assert.equal(row.reviewEvidence.publisherOnlineDate,publisherDate);
    assert.equal(row.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline,publisherDate);
    assert.equal(row.reviewEvidence.firstOnlineDateEvidence.sourceFrozenDate,sourceDate);
    assert.equal(row.reviewEvidence.firstOnlineDateEvidence.sourceFrozenAndUnchanged,true);
    assert.equal(row.mediaPolicy,media);
    assert.equal(row.ingestionChannel,'historical_backfill');
    assert.equal(row.addedDate,'');
    assert.equal(row.new,false);
    assert.equal(row.reviewPasses,2);
    assert.deepEqual(row.independentPasses.map(x=>x.decision),['include','include']);
    assert.equal(row.firstPassDecision,'include');
    assert.equal(row.challengeDecision,'include');
    assert.equal(row.reviewStatus,'two_pass_scope_include_awaiting_fixed_slot');
    assert.equal(validChineseTitle(row.titleZh),true);
    assert.equal(isExcludedDoi(row.doi),false);
    assert.equal(row.reviewEvidence.stageBranch,'staging/historical-archive-nightly');
    assert.match(row.reviewEvidence.stageBatchSha,/^[a-f0-9]{40}$/);
    assert.match(row.reviewEvidence.sourceReviewQueueGitBlobSha,/^[a-f0-9]{40}$/);
    assert.match(row.reviewEvidence.stageSourceSha256,/^[a-f0-9]{64}$/);
    assert.ok(row.reviewEvidence.crossrefOpenalexSources.includes('crossref'));
    assert.equal(row.reviewEvidence.crossrefOpenalexSources.length,row.doi.startsWith('10.1021/')?2:1);
    assert.equal(row.publisherAbstractRights,'not_verified_do_not_republish_full_text');
    assert.equal(row.reviewEvidence.abstractCopied,false);
    assert.equal(row.reviewEvidence.figureFetched,false);
    assert.equal(row.reviewEvidence.pdfFetched,false);
    assert.ok(!('abstract' in row)&&!('fullText' in row)&&!('pdf' in row));
    for(const k of ['primaryContribution','preparativeTransformation','generalityEvidence',
      'sourceEvidence','boundaryChallenge'])assert.ok(row.scopeAssessment[k].length>=40,row.doi+':'+k);
  }
});
test('CCS source issue metadata is superseded by official first-online for 3 Q2 and one Q3',()=>{
 const corrected=proof.q3OriginalPublisherDateCorrections;
 assert.equal(corrected.length,4);
 assert.equal(proof.preJulyMetadataOnly.length,3);
 for(const x of corrected){
   const row=entries.get(x.doi),p=row.reviewEvidence.firstOnlineDateEvidence;
   assert.equal(p.stageDateIsIssueNotPublication,true);
   assert.equal(p.stageApiDate,p.sourceFrozenDate);
   assert.notEqual(row.date,p.stageApiDate);
   assert.equal(row.date,p.officialPublisherFirstOnline);
   assert.equal(row.mediaPolicy,row.date<'2026-07-01'?'metadata_only':'toc_only');
 }
 for(const id of proof.preJulyMetadataOnly)assert.equal(entries.get(id).mediaPolicy,'metadata_only');
 assert.equal(entries.get('10.31635/ccschem.026.202607664').date,'2026-07-13');
 const rsc=entries.get('10.1039/d6sc02950g');
 assert.equal(rsc.reviewEvidence.firstOnlineDateEvidence.sourceHasYearOnlyCreatedDate,true);
 assert.equal(rsc.reviewEvidence.firstOnlineDateEvidence.sourceCreatedDate,'2026-07-31');
 assert.equal(rsc.reviewEvidence.firstOnlineDateEvidence.sourceFrozenDate,'');
 assert.equal(rsc.date,'2026-07-31');
});
test('scientific interpretations do not convert evidence limitations into asserted facts',()=>{
 const s=id=>entries.get(id).scopeAssessment;
 assert.match(s('10.31635/ccschem.026.202607790').generalityEvidence,/立体选择性降低/);
 assert.match(s('10.31635/ccschem.026.202608043').boundaryChallenge,/亲双烯体类别/);
 assert.match(s('10.1039/d6sc02950g').generalityEvidence,/3:2/);
 assert.match(s('10.1021/acs.joc.6c00992').generalityEvidence,/40个/);
 assert.match(s('10.31635/ccschem.026.202607664').boundaryChallenge,/QM\/MM/);
 assert.match(s('10.31635/ccschem.026.202607709').generalityEvidence,/94:6/);
 assert.match(s('10.31635/ccschem.026.202607340').generalityEvidence,/\[7\+4\]/);
 assert.match(s('10.31635/ccschem.026.202607308').generalityEvidence,/86%/);
});
test('the eight stay off-slot and owner-excluded DOI gets veto receipt',()=>{
 const byPublished=new Map(formal.articles.map(x=>[x.doi,x]));
 const vetoes=[];
 const eligible=selectHistoricalAdmissions(manifest,{
    published:new Set(byPublished.keys()),
    policyExcluded:new Set(manifest.accepted.filter(x=>isExcludedDoi(x.doi)).map(x=>x.doi)),
    onPolicyVeto:x=>vetoes.push(x)
 });
 const ids=new Set(eligible.map(x=>x.doi));
 for(const doi of expected.keys()){
   if(byPublished.has(doi)){
     const paper=byPublished.get(doi);
     assert.equal(paper.ingestionChannel,'historical_backfill');
     assert.equal(paper.mediaPolicy,expected.get(doi)[2]);
     assert.equal(paper.addedDate,'');
     assert.equal(paper.new,false);
   }else assert.ok(ids.has(doi),doi);
 }
 assert.ok(vetoes.some(x=>x.doi==='10.1038/s41467-026-77616-8'));
 assert.ok(eligible.every(x=>!isExcludedDoi(x.doi)&&x.new===false&&x.addedDate===''));
 for(const guard of Object.values(proof.guards))assert.equal(guard,true);
 for(const id of proof.notApprovedBecauseDateOrOriginalityStillUnverified){
   assert.equal(entries.has(id),false);
   assert.equal(manifest.pending.some(x=>x.doi===id),false);
 }
});

test('official RSC canonical articlelanding URL matches only exact DOI and publisher',()=>{
 const id='10.1039/d6sc02950g';
 const original='https://pubs.rsc.org/en/content/articlelanding/2026/sc/d6sc02950g';
 assert.equal(historicalPublisherPageMatchesDoi(id,original),true);
 assert.equal(historicalPublisherPageMatchesDoi(id,original.replace('/sc/','/gc/')),false);
 assert.equal(historicalPublisherPageMatchesDoi(id,original.replace('d6sc02950g','d6sc02950x')),false);
 assert.equal(historicalPublisherPageMatchesDoi(id,original.replace('pubs.rsc.org','forged.rsc.example')),false);
 assert.equal(historicalPublisherPageMatchesDoi(id,'http://pubs.rsc.org/en/content/articlelanding/2026/sc/d6sc02950g'),false);
});
