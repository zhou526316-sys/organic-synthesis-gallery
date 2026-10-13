import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TARGET_JOURNALS, effectiveJournalStart } from '../shared/literature-journals.js';
import { isStandaloneRepositoryDoi } from './lib/literature-doi-provenance.mjs';
import { OFFICIAL_PUBLISHER_FEEDS,parseOfficialPublisherFeed } from './lib/publisher-feed-discovery.mjs';
import { exclusionEvidenceRecheckReason } from './lib/literature-exclusion-recheck.mjs';
import { CROSSREF_DATE_MODES, crossrefModeQuery } from './lib/crossref-discovery-date-modes.mjs';
import { publisherOnlyReviewEligible,exclusionRecheckBelongsToPrimaryWindow } from './lib/literature-review-queue-guard.mjs';

const auditSource = await readFile(new URL('../cloudflare/scripts/audit-literature.mjs', import.meta.url), 'utf8');

const names = TARGET_JOURNALS.map(journal => journal.name);
assert.equal(TARGET_JOURNALS.length, 16, 'Completeness audit must cover exactly the current 16 target journals');

for (const name of [
  'Nature', 'Science', 'Nature Catalysis', 'Nature Synthesis', 'Nature Chemistry',
  'Nature Communications', 'JACS', 'Angew', 'ACS Catalysis', 'Organic Letters',
  'Chem', 'Chemical Science', 'CCS Chemistry', 'Science Advances', 'Green Chemistry', 'JOC',
]) {
  assert.ok(names.includes(name), `Missing target journal: ${name}`);
}

for (const name of ['Chem', 'CCS Chemistry', 'Science Advances']) {
  const journal = TARGET_JOURNALS.find(item => item.name === name);
  assert.equal(journal?.activeFrom, '2026-09-19', `${name} must remain prospective from 2026-09-19`);
  assert.equal(effectiveJournalStart(journal, '2026-09-13'), '2026-09-19', `${name} must not be backfilled before activation`);
}
for (const name of ['Chemical Science', 'Green Chemistry']) {
  const journal = TARGET_JOURNALS.find(item => item.name === name);
  assert.equal(journal?.activeFrom, '2026-10-01', `${name} must remain prospective from 2026-10-01`);
  assert.equal(effectiveJournalStart(journal, '2026-09-13'), '2026-10-01', `${name} must not be backfilled before activation`);
}

const joc = TARGET_JOURNALS.find(item => item.name === 'JOC');
assert.equal(joc?.activeFrom, '2026-09-22', 'JOC must be prospective from 2026-09-22');
assert.equal(effectiveJournalStart(joc, '2026-09-13'), '2026-09-22', 'JOC must not be backfilled before activation');

const jacs = TARGET_JOURNALS.find(item => item.name === 'JACS');
assert.equal(effectiveJournalStart(jacs, '2026-09-13'), '2026-09-13', 'Existing journals must retain the full safety lookback');

assert.match(auditSource, /DEFAULT_LOOKBACK_DAYS\s*=\s*3/, 'Default publication rescan must remain three days');
assert.match(auditSource, /DEFAULT_LATE_DEPOSIT_RESCUE_DAYS\s*=\s*7/, 'Late-deposit rescue must remain at least seven days');
assert.ok(auditSource.includes('catchupStart'), 'Audit must automatically catch up from verifiedThrough when closure falls behind');
assert.ok(auditSource.includes('sourceQueryStartForJournal'), 'Source queries must use the earlier of catch-up and safety-tail starts');
assert.ok(auditSource.includes('queryStart:journalQueryStart'), 'Crossref online/published/created must use verifiedThrough catch-up query window');
assert.ok(auditSource.includes('rescueStart:journalRescueStart'), 'Crossref deposit rescue must use bounded seven-day machine safety tail');
assert.ok(auditSource.includes('from_publication_date:${sourceQueryStartForJournal(journal)}'), 'OpenAlex must widen to verifiedThrough catch-up when it predates the seven-day tail');
assert.ok(auditSource.includes('safetyTail'), 'Safety-tail records must remain observable without becoming routine re-review work');
assert.deepEqual(CROSSREF_DATE_MODES,['online','published','created','deposited']);
assert.ok(auditSource.includes('for (const mode of CROSSREF_DATE_MODES)'), 'Crossref must union online, published, created and redeposited');
assert.equal(crossrefModeQuery('deposited',{queryStart:'2026-09-19',rescueStart:'2026-10-07',endDate:'2026-10-13'}).modeStart,'2026-10-07');
assert.ok(auditSource.includes('createdDiscovered'), 'Late-deposit rescue must remain enabled');
assert.ok(auditSource.includes('createdDate'), 'Crossref created date must be retained independently of publication date');
assert.ok(auditSource.includes("if (!Array.isArray(p) || !p[0] || !p[1] || !p[2]) return '';"), 'Partial Crossref dates must stay unknown instead of being coerced to January/day 1');
assert.ok(auditSource.includes('datePrecision'), 'Audit must retain Crossref date precision for incomplete publisher metadata');
assert.ok(!auditSource.includes("String(p[1] || 1)"), 'Audit must never fabricate a missing Crossref month');
assert.ok(!auditSource.includes("String(p[2] || 1)"), 'Audit must never fabricate a missing Crossref day');
assert.ok(auditSource.includes('createdInQuery'), 'Created/deposit rescue must survive publication-date filtering when within active coverage');
assert.ok(auditSource.includes('dateConflict'), 'Future issue-date conflicts discovered by current deposits must remain explicit');
assert.ok(auditSource.includes('lateIndexed'), 'Late-indexed records must remain observable in the audit report');
assert.ok(auditSource.includes('sourceFamilyHealth'), 'Per-journal source-family health must remain reported');
assert.ok(auditSource.includes('sourceFamilyGaps'), 'Source-family gaps must remain explicit');
assert.ok(auditSource.includes('sourceCoverageAnomalies'), 'Crossref/OpenAlex coverage regressions must remain explicit');
assert.ok(auditSource.includes('rawSourceCandidateCounts'), 'Raw source candidate counts must be retained before post-filtering');
assert.ok(auditSource.includes('rawToUnionCollapse'), 'Nonzero raw source data collapsing to zero post-filter candidates must be flagged');
assert.ok(auditSource.includes('closureCoverageAnomalies'), 'Closure-day source coverage regressions must remain explicit');
assert.ok(auditSource.includes('const byDate = {}'), 'Audit must expose per-day source union counts for historical regression checks');
assert.ok(auditSource.includes('row.byJournal'), 'Per-day audit counts must retain journal attribution');
assert.ok(auditSource.includes('blocked-source-coverage-anomaly'), 'Severe closure-day source collapse must block verified-through eligibility');
assert.ok(auditSource.includes('closureCoverageAnomalies.length === 0'), 'verifiedThrough eligibility must require healthy closure-day source coverage');
assert.ok(auditSource.includes('loadReviewedHistory'), 'Audit must load historical review decisions for DOI-level regression checks');
assert.ok(auditSource.includes('historicalCoverageLosses'), 'Audit must expose historical DOI coverage losses');
assert.ok(auditSource.includes("audit/unresolved-latest.json"), 'Compact semantic-review handoff must be emitted for Scheduled Tasks');
assert.ok(auditSource.includes('const reviewInput = {'), 'Audit must construct a compact semantic-review input');
assert.ok(auditSource.includes('AUDIT_REVIEW_INPUT'), 'Audit must report compact review-input generation in logs');
assert.ok(auditSource.includes('blocked-historical-coverage-loss'), 'Known DOI disappearance must block closure eligibility');
assert.ok(auditSource.includes('closureHistoricalCoverageLosses.length === 0'), 'verifiedThrough eligibility must require zero closure-day historical DOI losses');
assert.ok(auditSource.includes('const compact=compactCandidate(candidate)'), 'All unresolved DOI differences must flow into review output');
assert.ok(auditSource.includes('fetchOfficialPublisherFeeds'), 'Independent official publisher DOI candidates must enter machine audit');
assert.ok(auditSource.includes('fetchPublisherMetadataAbstract'), 'Blank-abstract synthesis candidates must receive DOI-verified publisher abstract rescue attempts');
assert.ok(auditSource.includes('pubAbstractResults'), 'Publisher abstract rescue successes and failures must be logged, not silently reported as zero gaps');
assert.ok(auditSource.includes('publisherDateVerificationBacklog'), 'Unverified publisher-only DOI must remain visible beyond RSS rotation');
assert.ok(auditSource.includes('historicalEvidenceChallenges'), 'Historical changed-evidence exclusions must be visible without overwhelming primary review');
assert.ok(auditSource.includes('publisherOnlyDois'), 'Publisher-only DOI differences must be reported');
assert.ok(auditSource.includes('previousExclusionsReopened'), 'Prior exclusions must be reconsidered on substantive new evidence');
assert.ok(auditSource.includes('publisherDateUnverifiedDois.length === 0'), 'Unverified publisher feed dates must block closure, not per-DOI publication');
assert.ok(!auditSource.includes('.filter(retainForReview)'), 'Keyword screening must not silently remove DOI differences from review');


// Regression: a review-file journal label cannot turn a standalone Zenodo
// repository DOI into a missing primary journal article; real journal DOI
// disappearance remains covered by the historical DOI safety guard.
assert.equal(isStandaloneRepositoryDoi('10.5281/zenodo.23098201'), true);
assert.equal(isStandaloneRepositoryDoi('10.5281/ZENODO.23098201'), true);
assert.equal(isStandaloneRepositoryDoi('10.1038/s41467-026-78459-z'), false);
assert.equal(isStandaloneRepositoryDoi('10.1021/jacs.6c14748'), false);
assert.ok(auditSource.includes('isStandaloneRepositoryDoi(item.doi)'), 'Non-journal provenance must be assessed within historical loss detection');
assert.ok(auditSource.includes('historicalNonJournalRecords,'), 'Historical non-journal corrections must remain auditable');

// These functional checks also run in the unchanged 06:55 machine-audit job.
const olFeed=OFFICIAL_PUBLISHER_FEEDS.find(row=>row.journal==='Organic Letters');
const synthFeed=OFFICIAL_PUBLISHER_FEEDS.find(row=>row.journal==='Nature Synthesis');
assert.ok(olFeed&&synthFeed,'Independent official publisher feeds must cover at least ACS and Nature Synthesis');
const exactPublisher=parseOfficialPublisherFeed(
  '<rss><item><guid>https://www.nature.com/articles/s44160-026-01189-z</guid></item></rss>',
  synthFeed,{startDate:'2026-10-11',endDate:'2026-10-13'});
assert.equal(exactPublisher.records[0]?.doi,'10.1038/s44160-026-01189-z',
  'Known Nature Synthesis omission must have an independent DOI discovery route');
assert.equal(exactPublisher.records[0]?.date,'',
  'RSS packaging must not fabricate authoritative first-publication date');
const beforeExclude={doi:'10.1038/s44160-026-01189-z',decision:'exclude',title:'Skeletal editing',
  abstract:'',date:'2026-10-12'};
const afterEvidence={...beforeExclude,abstract:'A'.repeat(180)};
assert.equal(exclusionEvidenceRecheckReason(afterEvidence,beforeExclude),
  'new_substantive_abstract_after_previous_exclusion');
assert.equal(exclusionEvidenceRecheckReason(afterEvidence,beforeExclude,{confirmedExcluded:true}),'',
  'Confirmed DOI exclusions must remain authoritative despite metadata changes');

const oldFeed={publisherFeedUrl:'https://onlinelibrary.wiley.com/feed/15213773/most-recent',date:'',feedDate:'2026-10-10',sources:['publisher-feed:Angew']};
assert.equal(publisherOnlyReviewEligible(oldFeed,'2026-10-11','2026-10-13'),false);
assert.equal(exclusionRecheckBelongsToPrimaryWindow({date:'2026-09-19'},'2026-10-11','2026-10-13'),false);

console.log(JSON.stringify({
  targetJournals: TARGET_JOURNALS.length,
  prospectiveFrom: { existingAdditions: '2026-09-19', rscAdditions: '2026-10-01', JOC: '2026-09-22' },
  lookbackDays: 3,
  lateDepositRescueDays: 7,
  verifiedThroughCatchup: true,
  multiSourceSafetyTail: true,
  crossrefModes: CROSSREF_DATE_MODES,
  openAlex: true,
  lateDepositRescue: true,
  sourceFamilyHealth: true,
  sourceCoverageRegressionGuard: true,
  rawToUnionCollapseGuard: true,
  catchupQueriesActuallyWiden: true,
  partialDatesNeverFabricated: true,
  historicalDoiRegressionGuard: true,
  silentKeywordExclusion: false,
}));
