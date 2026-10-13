import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
import {test} from 'node:test';
import {validateHistoricalApproval,selectHistoricalAdmissions,historicCard,HISTORICAL_APPROVED_PATH,historicalPublisherPageMatchesDoi}
  from './lib/historical-admission.mjs';
const root=JSON.parse(readFileSync(HISTORICAL_APPROVED_PATH,'utf8'));
const clone=()=>structuredClone(root);
test('all source-fingerprinted historic scope approvals are valid and cumulatively extensible',()=>{
  assert.equal(validateHistoricalApproval(root).length,root.summary.include);
  assert.ok(root.summary.include>=10);
  assert.equal(root.summary.checked,root.accepted.length+root.pending.length);
  assert.equal(root.summary.pending,2);
  assert.equal(new Set(root.accepted.map(x=>x.doi)).size,root.accepted.length);
});
test('pilot has distinct pending publication-date conflicts, never included',()=>{
  assert.equal(root.pending.length,2);
  assert.ok(root.pending.every(x=>x.decision==='pending'&&x.challengeDecision==='pending'));
  const selected=selectHistoricalAdmissions(root);
  assert.equal(selected.length,root.accepted.length);
  assert.ok(root.pending.every(x=>!selected.some(y=>y.doi===x.doi)));
});
test('already-published source DOI is not re-added to formal release',()=>{
  const published=new Set(root.accepted.slice(0,2).map(x=>x.doi));
  const selected=selectHistoricalAdmissions(root,{published});
  assert.equal(selected.length,root.accepted.length-2);
  assert.ok(selected.every(x=>!published.has(x.doi)));
});
test('cross-scope and daily-DOI collision hard block',()=>{
  for(const name of ['excluded','dailyDois']){
    assert.throws(()=>selectHistoricalAdmissions(root,{[name]:new Set([root.accepted[0].doi])}),
      name==='excluded'?/historical_review_excluded_doi/:/historical_review_daily_overlap/);
  }
});
test('card projection excludes historic from daily new/hot and PDF capture',()=>{
  for(const x of root.accepted){
    const card=historicCard(x);
    assert.equal(card.new,false);
    assert.equal(card.addedDate,'');
    assert.equal(card.ingestionChannel,'historical_backfill');
    assert.equal(card.mediaPolicy,x.date<'2026-07-01'?'metadata_only':'toc_only');
    assert.equal(card.doi,x.doi);
    assert.equal(card.titleZh,x.titleZh);
    assert.equal('abstract' in card,false);
    assert.equal('pdf' in card,false);
  }
});
test('an explicitly pre-July approved historical DOI is metadata-only',()=>{
  const x={...root.accepted[0],date:'1967-05-11'};
  assert.equal(historicCard(x).mediaPolicy,'metadata_only');
});
test('fake one-pass scope approval is rejected even if title resembles chemistry',()=>{
  const m=clone();m.accepted[0].reviewPasses=1;
  assert.throws(()=>validateHistoricalApproval(m),/historical_review_two_pass_missing/);
});
test('publisher-date mismatch and malformed source receipt both fail closed',()=>{
  const m=clone();m.accepted[0].reviewEvidence.publisherOnlineDate='2026-09-09';
  assert.throws(()=>validateHistoricalApproval(m),/historical_review_source_identity_missing/);
  const n=clone();n.accepted[1].reviewEvidence.stageBatchSha='000';
  assert.throws(()=>validateHistoricalApproval(n),/historical_review_source_identity_missing/);
});
test('rights or PDF leakage in review cannot enter historical archive',()=>{
  const x=clone();x.accepted[0].publisherAbstractRights='free';
  assert.throws(()=>validateHistoricalApproval(x),/historical_review_rights_not_verified/);
  const y=clone();y.accepted[0].pdf='https://example.com/protected.pdf';
  assert.throws(()=>validateHistoricalApproval(y),/historical_review_rights_not_verified/);
});
test('historic DOI admission cannot pretend to be new or fetch body media',()=>{
  const x=clone();x.accepted[0].new=true;
  assert.throws(()=>validateHistoricalApproval(x),/historical_review_wrong_capture_or_newness/);
  const y=clone();y.accepted[0].mediaPolicy='standard';
  assert.throws(()=>validateHistoricalApproval(y),/historical_review_wrong_capture_or_newness/);
});
test('two DOI groups cannot overlap and a pending record cannot silently flip to include',()=>{
  const x=clone();x.pending[0].doi=x.accepted[0].doi;
  assert.throws(()=>validateHistoricalApproval(x),/historical_review_doi_invalid_or_duplicate/);
  const y=clone();y.pending[0].decision='include';
  assert.throws(()=>validateHistoricalApproval(y),/historical_review_pending_conflated_with_include/);
});
test('review scope SHA and evidence are mandatory',()=>{
  const x=clone();x.scopeCorrectionsBlobSha='';
  assert.throws(()=>validateHistoricalApproval(x),/historical_review_scope_fingerprint_missing/);
  const y=clone();y.accepted[0].scopeAssessment.generalityEvidence='';
  assert.throws(()=>validateHistoricalApproval(y),/historical_review_scope_evidence_missing/);
});


test('each historic Chinese title passes actual 08:00 writer input validation',()=>{
  for(const row of root.accepted)
    assert.equal(validChineseTitle(row.titleZh),true,row.doi);
});

test('new three scope-approved historical DOI are uniquely staged and frozen for the next 08:00 slot',()=>{
  const expected=["10.1021/acs.joc.6c00602","10.1021/acscatal.6c05426","10.1021/acs.orglett.6c03154"];
  for(const doi of expected){
    const row=root.accepted.find(x=>x.doi===doi);
    assert.ok(row,doi);
    assert.equal(row.reviewStatus,'two_pass_scope_include_awaiting_fixed_slot');
    assert.equal(row.reviewEvidence.publisherOnlineDate,row.date);
    assert.equal(row.reviewEvidence.abstractCopied,false);
    assert.equal(row.ingestionChannel,'historical_backfill');
    assert.equal(row.addedDate,'');
    assert.equal(row.new,false);
  }
  assert.equal(root.summary.checked,root.accepted.length+root.pending.length);
});

test('newly verified missed September JOC chemistry has independent evidence passes',()=>{
  for(const doi of ['10.1021/acs.joc.6c01580','10.1021/acs.joc.6c01772']){
    const row=root.accepted.find(x=>x.doi===doi);
    assert.ok(row,'missing newly reviewed DOI '+doi);
    assert.equal(row.reviewPasses,2);
    assert.equal(row.challengeDecision,'include');
    assert.equal(row.reviewEvidence.stageBatchSha,'c5604566a1a9763ce4fbbd2233b424db5c960517');
    assert.equal(row.mediaPolicy,'toc_only');
    assert.equal(row.addedDate,'');
  }
});

test('multi-journal old synthesis admission requires official Nature publisher URLs and no old media',()=>{
  assert.ok(root.accepted.length>=23);
  for(const id of [
    '10.1021/acs.joc.6c00818','10.1021/acs.joc.6c01133',
    '10.1021/acs.joc.6c01465','10.1021/acs.joc.6c01523',
    '10.1038/s44160-026-01023-6','10.1038/s44160-026-01036-1',
    '10.1021/jacs.5c13553','10.1021/jacs.5c14490',
    '10.1021/acs.joc.5c02749','10.1021/acs.joc.6c00214']){
    const row=root.accepted.find(x=>x.doi===id);
    assert.ok(row,'missing approved source-reviewed DOI '+id);
    assert.equal(row.reviewPasses,2);
    assert.equal(row.challengeDecision,'include');
    assert.equal(row.reviewEvidence.publisherOnlineDate,row.date);
    assert.equal(row.ingestionChannel,'historical_backfill');
    assert.equal(row.mediaPolicy,row.date<'2026-07-01'?'metadata_only':'toc_only');
    assert.equal(row.addedDate,'');
    assert.equal(row.new,false);
  }
  const names=root.accepted.filter(x=>x.doi.startsWith('10.1038/'));
  assert.ok(names.length>=2);
  for(const x of names){
    assert.ok(x.reviewEvidence.publisherPage.startsWith('https://www.nature.com/articles/'));
    assert.ok(historicalPublisherPageMatchesDoi(x.doi,x.reviewEvidence.publisherPage));
  }
  assert.equal(historicalPublisherPageMatchesDoi(
    '10.1038/s44160-026-01023-6','https://www.nature.com/articles/s44160-026-01234-0'),false);
  assert.equal(historicalPublisherPageMatchesDoi(
    '10.1038/s44160-026-01023-6','http://www.nature.com/articles/s44160-026-01023-6'),false);
});

test('2026-Q3 three independently assessed JOC methods are never marked daily new',()=>{
  const expected=[
    ['10.1021/acs.joc.6c00587','2026-07-02','158a2415687e4a0ecf0c588356f417cc1679d70a'],
    ['10.1021/acs.joc.6c00860','2026-08-05','fdbac4c465d92dcc0817d7507348d985349331f3'],
    ['10.1021/acs.joc.5c03271','2026-08-01','fdbac4c465d92dcc0817d7507348d985349331f3']
  ];
  for(const [doi,date,sourceSha] of expected){
    const row=root.accepted.find(x=>x.doi===doi);
    assert.ok(row,'missing source-reviewed DOI '+doi);
    assert.equal(row.date,date);
    assert.equal(row.reviewEvidence.publisherOnlineDate,date);
    assert.equal(row.reviewEvidence.stageBatchSha,sourceSha);
    assert.ok(row.reviewEvidence.publisherPage.includes('/'+doi));
    assert.equal(row.firstPassDecision,'include');
    assert.equal(row.challengeDecision,'include');
    assert.equal(row.reviewPasses,2);
    assert.equal(row.new,false);
    assert.equal(row.addedDate,'');
    assert.equal(row.ingestionChannel,'historical_backfill');
    assert.equal(row.mediaPolicy,'toc_only');
    assert.equal(row.publisherAbstractRights,'not_verified_do_not_republish_full_text');
    assert.ok(Object.keys(row.scopeAssessment).includes('boundaryChallenge'));
    assert.equal('pdf' in row,false);
  }
});
