import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const blobSha = path => {
  const b = readFileSync(new URL('../' + path, import.meta.url));
  return createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
};
const receiptPath = 'audit/historical-publisher-issues/2026/nature-catalysis-issues-07-08-research.json';
const assessmentPath = 'audit/historical-scope-assessments/2026-10-14-nature-catalysis-issues-07-09.json';
const receipt = read(receiptPath);
const previous = read('audit/historical-publisher-issues/2026/nature-catalysis-issue-09-research.json');
const review = read(assessmentPath);
const formal = read(receipt.formalSnapshot.source);
const manifest = read(receipt.academicSnapshot.source);
const corrections = read(review.scopeCorrectionsFile);
const issues = [...receipt.issues, previous];
const entries = issues.flatMap(i => i.articles.map(a => ({...a, issue: i.journalIssue})));
const isQ3 = a => /^2026-(07|08|09)-\d{2}$/.test(a.publisherIssueListedDate);
const q3 = entries.filter(isQ3);
const papers = new Map(formal.articles.map(a => [a.doi.toLowerCase(), a]));
const reviewed = new Map(review.assessments.map(a => [a.doi, a]));

test('two additional issue receipts have complete counted ordered DOI records', () => {
  assert.equal(receipt.schemaVersion, 'gallery-publisher-research-issue-receipt-v1');
  assert.deepEqual(receipt.issues.map(i => i.articles.length), [7, 11]);
  for (const issue of issues) {
    assert.equal(issue.sectionName, 'Research');
    assert.equal(issue.articles.length, issue.officialResearchEntryCount);
    assert.deepEqual(issue.articles.map(a => a.issueResearchOrder), issue.articles.map((_, n) => n + 1));
    for (const a of issue.articles) {
      assert.match(a.doi, /^10\.1038\/s41929-026-[0-9]{5}-[0-9a-z]$/);
      assert.equal(a.publisherArticleUrl, 'https://www.nature.com/articles/' + a.doi.split('/')[1]);
      assert.ok(a.title.length > 20);
      assert.ok(['Article', 'Analysis'].includes(a.publisherArticleType));
    }
  }
  assert.equal(new Set(entries.map(a => a.doi)).size, 28);
});

test('Analysis remains in the Research section without becoming automatic include or non-original', () => {
  const analysis = entries.filter(a => a.publisherArticleType === 'Analysis');
  assert.equal(analysis.length, 1);
  assert.equal(analysis[0].doi, '10.1038/s41929-026-01559-y');
  assert.equal(reviewed.get(analysis[0].doi).publisherArticleType, 'Analysis');
  assert.match(reviewed.get(analysis[0].doi).independentChallengeReason, /原创实验/);
});

test('three June online papers are not silently shifted into Q3 by July issue date', () => {
  const early = entries.filter(a => !isQ3(a));
  assert.equal(early.length, 3);
  assert.deepEqual(early.map(a => a.publisherIssueListedDate).sort(), ['2026-06-26', '2026-06-30', '2026-06-30']);
  assert.ok(early.every(a => a.q3DateCohort === 'outside_Q3_not_an_academic_exclusion'));
  assert.equal(q3.length, 25);
  assert.equal(receipt.counters.firstOnlineQ3, 15);
});

test('frozen catalog and review authority exactly match recorded provenance', () => {
  assert.equal(blobSha(receipt.formalSnapshot.source), receipt.formalSnapshot.sha);
  assert.equal(blobSha(receipt.academicSnapshot.source), receipt.academicSnapshot.sha);
  assert.equal(blobSha(review.scopeCorrectionsFile), review.scopeCorrectionsBlobSha);
  assert.equal(blobSha(review.scopeRulesFile), review.scopeRulesBlobSha);
  assert.equal(formal.articles.length, 1087);
  assert.equal(papers.size, 1087);
  assert.equal(manifest.accepted.length, 116);
  assert.equal(manifest.pending.length, 2);
  assert.equal(manifest.accepted.filter(a => !papers.has(a.doi.toLowerCase())).length, 25);
});

test('all Q3 issue dates and exact formal membership are reconciled without re-admission', () => {
  for (const a of q3) {
    const existing = papers.get(a.doi);
    assert.equal(Boolean(existing), a.formalCatalogReadback.present, a.doi);
    if (existing) {
      assert.equal(existing.date, a.publisherIssueListedDate, a.doi);
      assert.equal(existing.date, a.formalCatalogReadback.storedDate, a.doi);
    }
  }
  assert.equal(q3.filter(a => papers.has(a.doi)).length, 10);
  assert.equal(q3.filter(a => !papers.has(a.doi)).length, 15);
  const additional = receipt.issues.flatMap(i => i.articles).filter(isQ3);
  assert.equal(additional.filter(a => papers.has(a.doi)).length, 7);
});

test('fifteen supplemental assessments exactly cover the Q3 absent DOI set', () => {
  assert.equal(reviewed.size, 15);
  const absent = q3.filter(a => !papers.has(a.doi));
  assert.deepEqual([...reviewed.keys()].sort(), absent.map(a => a.doi).sort());
  for (const a of absent) {
    const r = reviewed.get(a.doi);
    assert.equal(r.date, a.publisherIssueListedDate);
    assert.equal(r.issue, a.issue);
    assert.equal(r.publisherArticleType, a.publisherArticleType);
    assert.equal(r.publisherPage, a.publisherArticleUrl);
  }
});

test('paper-specific contribution evidence and distinct challenge are retained', () => {
  assert.match(review.reviewMethod, /Same assistant/);
  for (const r of reviewed.values()) {
    assert.equal(r.reviewPasses, 2);
    assert.equal(r.firstPassDecision, r.decision);
    assert.equal(r.challengeDecision, r.decision);
    for (const key of ['primaryContribution','preparativeTransformation','generalityEvidence','firstPassReason','independentChallengeReason']) {
      assert.ok(typeof r[key] === 'string' && r[key].length > 20, r.doi + ':' + key);
    }
    assert.notEqual(r.firstPassReason, r.independentChallengeReason);
  }
});

test('fourteen scope exclusions and one evidence pending are not source-type guesses', () => {
  assert.equal(review.assessments.filter(a => a.decision === 'exclude').length, 14);
  const pending = review.assessments.filter(a => a.decision === 'pending');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].doi, '10.1038/s41929-026-01608-6');
  assert.equal(pending[0].missingEvidenceMustNotMeanNoEvidenceExists, true);
  assert.ok(pending[0].nextAction.length > 50);
  assert.match(pending[0].independentChallengeReason, /分离收率/);
  assert.equal(review.assessments.filter(a => a.decision === 'include').length, 0);
});

test('no assessment collides with formal, admitted, original pending or owner-correction authority', () => {
  const authority = new Set([
    ...papers.keys(), ...manifest.accepted.map(a => a.doi.toLowerCase()),
    ...manifest.pending.map(a => a.doi.toLowerCase()), ...corrections.items.map(a => a.doi.toLowerCase())
  ]);
  for (const doi of reviewed.keys()) assert.ok(!authority.has(doi), doi);
});

test('evidence-only ledger cannot silently decrement generated quarterly counters', () => {
  assert.equal(review.mode, 'academic_assessment_only_not_admission_authority');
  assert.equal(review.accounting.integratedIntoQuarterReconciliation, false);
  assert.equal(review.guards.notOwnerPermanentExclusionList, true);
  assert.equal(review.guards.doNotModifyApprovedAdmissions, true);
  assert.equal(receipt.guards.notGlobalQuarterPublisherComplete, true);
  assert.equal(receipt.guards.notPublicationAuthority, true);
  for (const doc of [receipt, review]) {
    assert.equal(doc.guards.zeroProductionD1, true);
    assert.equal(doc.guards.noMediaPdfBodySiAcquisition, true);
    assert.equal(doc.guards.noNewTodayHotWechat, true);
  }
});

test('August indexed evidence is not misreported as successful live canonical access', () => {
  assert.match(receipt.accessEvidence.august.kind, /search_index/);
  assert.equal(receipt.accessEvidence.august.directLiveFetch, 'login_redirect_or_cache_miss');
});
