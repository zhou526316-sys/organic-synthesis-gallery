import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TARGET_JOURNALS, effectiveJournalStart } from '../shared/literature-journals.js';

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

for (const name of ['Chem', 'Chemical Science', 'CCS Chemistry', 'Science Advances', 'Green Chemistry']) {
  const journal = TARGET_JOURNALS.find(item => item.name === name);
  assert.equal(journal?.activeFrom, '2026-09-19', `${name} must remain prospective from 2026-09-19`);
  assert.equal(effectiveJournalStart(journal, '2026-09-13'), '2026-09-19', `${name} must not be backfilled before activation`);
}

const joc = TARGET_JOURNALS.find(item => item.name === 'JOC');
assert.equal(joc?.activeFrom, '2026-09-22', 'JOC must be prospective from 2026-09-22');
assert.equal(effectiveJournalStart(joc, '2026-09-13'), '2026-09-22', 'JOC must not be backfilled before activation');

const jacs = TARGET_JOURNALS.find(item => item.name === 'JACS');
assert.equal(effectiveJournalStart(jacs, '2026-09-13'), '2026-09-13', 'Existing journals must retain the full safety lookback');

assert.match(auditSource, /DEFAULT_LOOKBACK_DAYS\s*=\s*3/, 'Default publication rescan must remain three days');
assert.match(auditSource, /DEFAULT_LATE_DEPOSIT_RESCUE_DAYS\s*=\s*7/, 'Late-deposit rescue must remain at least seven days');
assert.ok(auditSource.includes('catchupStart'), 'Audit must automatically catch up from verifiedThrough when closure falls behind');
assert.ok(auditSource.includes('const modeStart = journalRescueStart'), 'All Crossref source modes must retain the seven-day machine safety tail behind the 3-day review window');
assert.ok(auditSource.includes('from_publication_date:${rescueStartForJournal(journal)}'), 'OpenAlex must retain the seven-day machine safety tail behind the 3-day review window');
assert.ok(auditSource.includes('safetyTail'), 'Safety-tail records must remain observable without becoming routine re-review work');
assert.ok(auditSource.includes("['online', 'published', 'created']"), 'Crossref discovery must union online, published and created dates');
assert.ok(auditSource.includes('createdDiscovered'), 'Late-deposit rescue must remain enabled');
assert.ok(auditSource.includes('lateIndexed'), 'Late-indexed records must remain observable in the audit report');
assert.ok(auditSource.includes('sourceFamilyHealth'), 'Per-journal source-family health must remain reported');
assert.ok(auditSource.includes('sourceFamilyGaps'), 'Source-family gaps must remain explicit');
assert.ok(auditSource.includes('sourceCoverageAnomalies'), 'Crossref/OpenAlex coverage regressions must remain explicit');
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
assert.ok(auditSource.includes('.map(compactCandidate)'), 'All unresolved DOI differences must flow into review output');
assert.ok(!auditSource.includes('.filter(retainForReview)'), 'Keyword screening must not silently remove DOI differences from review');

console.log(JSON.stringify({
  targetJournals: TARGET_JOURNALS.length,
  prospectiveFrom: { existingAdditions: '2026-09-19', JOC: '2026-09-22' },
  lookbackDays: 3,
  lateDepositRescueDays: 7,
  verifiedThroughCatchup: true,
  multiSourceSafetyTail: true,
  crossrefModes: ['online', 'published', 'created'],
  openAlex: true,
  lateDepositRescue: true,
  sourceFamilyHealth: true,
  sourceCoverageRegressionGuard: true,
  historicalDoiRegressionGuard: true,
  silentKeywordExclusion: false,
}));
