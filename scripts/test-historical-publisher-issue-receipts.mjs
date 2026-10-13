import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {verifyResearchIssueReceipt} from './verify-historical-publisher-issues.mjs';
const receipt=JSON.parse(readFileSync('audit/historical-publisher-issues/2026/nature-synthesis-issues-09-10-research.json','utf8'));
const clone=()=>structuredClone(receipt);
test('two independent complete publisher Research issue TOCs have 26 unique original DOI',()=>{
  const x=verifyResearchIssueReceipt(receipt);
  assert.deepEqual(x,{
    issues:2,totalResearch:26,Q3Online:1,preQ3Online:25,
    q3FormalPresent:1,observedIssueResearchDOIs:26,
    publisherIssueScopeComplete:true,fullQ3PeriodComplete:false,
    perArticleDatesFullyIndependentlyVerified:false
  });
  assert.deepEqual(receipt.issues.map(x=>x.allResearchRows.length),[13,13]);
  assert.ok(receipt.issues.every(x=>x.allResearchRows.every(row=>row.publisherArticleType==='Article')));
});
test('September cover issue has ZERO Q3 online Article, October has one July2 Article',()=>{
  const [sep,oct]=receipt.issues;
  assert.equal(sep.issue,'2026-09');
  assert.equal(sep.allResearchRows.filter(x=>x.discoveryQuarter==='2026-Q3').length,0);
  assert.equal(oct.issue,'2026-10');
  const q3=oct.allResearchRows.filter(x=>x.discoveryQuarter==='2026-Q3');
  assert.deepEqual(q3.map(x=>x.doi),['10.1038/s44160-026-01096-3']);
  assert.deepEqual(q3.map(x=>x.publisherIssueListedPublishedDate),['2026-07-02']);
  assert.equal(q3[0].catalogAtAudit.present,true);
  assert.equal(q3[0].catalogAtAudit.storedDate,'2026-07-02');
});
test('cover month is not acceptable as first-online date and Q3 completeness stays false',()=>{
  const x=clone();
  x.issues[0].allResearchRows[0].publisherIssueListedPublishedDate='2026-09-01';
  assert.throws(()=>verifyResearchIssueReceipt(x),/quarter_classification/);
  const y=clone();
  y.guards.noQ3CompleteClaim=false;
  assert.throws(()=>verifyResearchIssueReceipt(y),/release_guards/);
  const z=clone();
  z.issues[1].allResearchRows[2].publisherIssueListedPublishedDate='2026-10-01';
  assert.throws(()=>verifyResearchIssueReceipt(z),/quarter_classification/);
});
test('exact publisher DOI identity, article type and immutability of receipt fail closed',()=>{
  const a=clone();a.issues[0].allResearchRows[1].doi=a.issues[0].allResearchRows[0].doi;
  assert.throws(()=>verifyResearchIssueReceipt(a),/doi_or_date/);
  const b=clone();b.issues[1].allResearchRows[3].articleUrl='https://example.com/non-original';
  assert.throws(()=>verifyResearchIssueReceipt(b),/doi_or_date/);
  const c=clone();c.issues[1].allResearchRows[9].publisherArticleType='Research Briefing';
  assert.throws(()=>verifyResearchIssueReceipt(c),/doi_or_date/);
  const d=clone();d.issues[1].allResearchRows[2].catalogAtAudit.storedDate='2026-10-01';
  assert.throws(()=>verifyResearchIssueReceipt(d),/catalog_date_mismatch/);
  const e=clone();e.issues[0].officialIssueResearchCount=12;
  assert.throws(()=>verifyResearchIssueReceipt(e),/issue_receipt/);
});
