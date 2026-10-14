import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {verifyEarlyNatsynthIssueReceipt} from './verify-historical-publisher-early-issues.mjs';
const source=JSON.parse(readFileSync('audit/historical-publisher-issues/2026/nature-synthesis-issues-07-08-research.json','utf8'));
const clone=()=>structuredClone(source);
test('July and August cover issues each have 13 original Research DOI but all listed published dates precede Q3',()=>{
 const a=verifyEarlyNatsynthIssueReceipt(source);
 assert.equal(a.issues,2);assert.equal(a.ResearchDOIs,26);
 assert.equal(a.Q3FromIssuePublishedLabels,0);
 assert.equal(a.formalCatalogMemberResearchDOIs,2);
 assert.equal(a.individualLandingDatesIndependentlyVerified,false);
 assert.equal(a.publisherQ3CompletenessEstablished,false);
 assert.deepEqual(source.issues.map(x=>x.articleRows.length),[13,13]);
 assert.equal(source.formalCatalogSnapshot.total,1087);
 assert.deepEqual(source.counters.exactFormalDOIs,['10.1038/s44160-026-01023-6','10.1038/s44160-026-01036-1']);
 for(const issue of source.issues)for(const row of issue.articleRows){
   assert.ok(row.issueTocArticlePublishedDate<'2026-07-01');
   assert.equal(row.independentArticleLandingFirstOnlineVerified,false);
 }
});
test('date, source and publisher DOI tampering fail closed',()=>{
 const a=clone();a.issues[0].articleRows[0].issueTocArticlePublishedDate='2026-07-01';
 assert.throws(()=>verifyEarlyNatsynthIssueReceipt(a),/publisher_early_issue_doi_date/);
 const b=clone();b.issues[1].articleRows[0].articleUrl='https://example.com/articles/fake';
 assert.throws(()=>verifyEarlyNatsynthIssueReceipt(b),/publisher_early_issue_doi_date/);
 const c=clone();c.issues[0].articleRows[1].doi=c.issues[0].articleRows[0].doi;
 assert.throws(()=>verifyEarlyNatsynthIssueReceipt(c),/publisher_early_issue_doi_date/);
 const d=clone();d.issues[1].articleRows[7].publisherArticleType='Research Highlight';
 assert.throws(()=>verifyEarlyNatsynthIssueReceipt(d),/publisher_early_issue_doi_date/);
 const e=clone();e.guards.independentArticleFirstPublishedNotVerified=false;
 assert.throws(()=>verifyEarlyNatsynthIssueReceipt(e),/publisher_early_issue_guards/);
 const f=clone();f.issues[0].articleRows[0].independentArticleLandingFirstOnlineVerified=true;
 assert.throws(()=>verifyEarlyNatsynthIssueReceipt(f),/publisher_early_issue_doi_date/);
});

test('2026-10-14 current readback: exactly two pre-July Nature Synthesis DOI are already formally admitted',()=>{
 const a=clone();a.issues[1].articleRows[1].formalCatalogReadback.present=false;
 assert.throws(()=>verifyEarlyNatsynthIssueReceipt(a),/publisher_early_issue_current_catalog_membership/);
 const b=clone();b.issues[1].articleRows[7].formalCatalogReadback.storedDate='2026-07-01';
 assert.throws(()=>verifyEarlyNatsynthIssueReceipt(b),/publisher_early_issue_current_catalog_membership/);
 const c=clone();c.counters.formalDOIsOfTheseResearchRows=0;
 assert.throws(()=>verifyEarlyNatsynthIssueReceipt(c),/publisher_early_issue_counters/);
 const d=clone();d.formalCatalogSnapshot.total=984;
 assert.throws(()=>verifyEarlyNatsynthIssueReceipt(d),/publisher_early_issue_current_readback_snapshot/);
 const e=clone();e.historicalManifestSnapshot.acceptedTotal=91;
 assert.throws(()=>verifyEarlyNatsynthIssueReceipt(e),/publisher_early_issue_current_readback_snapshot/);
});
