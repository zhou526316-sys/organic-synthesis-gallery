import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {validateHistoricalApproval,selectHistoricalAdmissions,historicCard,HISTORICAL_APPROVED_PATH}
  from './lib/historical-admission.mjs';
const root=JSON.parse(readFileSync(HISTORICAL_APPROVED_PATH,'utf8'));
const clone=()=>structuredClone(root);
test('first 5 source-fingerprinted historic scope approvals are all valid',()=>{
  assert.equal(validateHistoricalApproval(root).length,5);
  assert.deepEqual(root.summary,{checked:7,include:5,pending:2,published:0,sourceCollision:0});
  assert.equal(new Set(root.accepted.map(x=>x.doi)).size,5);
});
test('pilot has distinct pending publication-date conflicts, never included',()=>{
  assert.equal(root.pending.length,2);
  assert.ok(root.pending.every(x=>x.decision==='pending'&&x.challengeDecision==='pending'));
  const selected=selectHistoricalAdmissions(root);
  assert.equal(selected.length,5);
  assert.ok(root.pending.every(x=>!selected.some(y=>y.doi===x.doi)));
});
test('already-published source DOI is not re-added to formal release',()=>{
  const published=new Set(root.accepted.slice(0,2).map(x=>x.doi));
  const selected=selectHistoricalAdmissions(root,{published});
  assert.equal(selected.length,3);
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
    assert.equal(card.mediaPolicy,'toc_only');
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
