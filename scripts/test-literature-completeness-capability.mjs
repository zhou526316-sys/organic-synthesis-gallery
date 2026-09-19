import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TARGET_JOURNALS, effectiveJournalStart } from '../shared/literature-journals.js';

const auditSource = await readFile(new URL('../cloudflare/scripts/audit-literature.mjs', import.meta.url), 'utf8');

const names = TARGET_JOURNALS.map(journal => journal.name);
assert.equal(TARGET_JOURNALS.length, 15, 'Completeness audit must cover exactly the current 15 target journals');

for (const name of [
  'Nature', 'Science', 'Nature Catalysis', 'Nature Synthesis', 'Nature Chemistry',
  'Nature Communications', 'JACS', 'Angew', 'ACS Catalysis', 'Organic Letters',
  'Chem', 'Chemical Science', 'CCS Chemistry', 'Science Advances', 'Chinese Journal of Chemistry',
]) {
  assert.ok(names.includes(name), `Missing target journal: ${name}`);
}

for (const name of ['Chem', 'Chemical Science', 'CCS Chemistry', 'Science Advances', 'Chinese Journal of Chemistry']) {
  const journal = TARGET_JOURNALS.find(item => item.name === name);
  assert.equal(journal?.activeFrom, '2026-09-19', `${name} must remain prospective from 2026-09-19`);
  assert.equal(effectiveJournalStart(journal, '2026-09-13'), '2026-09-19', `${name} must not be backfilled before activation`);
}

const jacs = TARGET_JOURNALS.find(item => item.name === 'JACS');
assert.equal(effectiveJournalStart(jacs, '2026-09-13'), '2026-09-13', 'Existing journals must retain the full safety lookback');

assert.match(auditSource, /DEFAULT_LOOKBACK_DAYS\s*=\s*3/, 'Default publication rescan must remain three days');
assert.match(auditSource, /DEFAULT_LATE_DEPOSIT_RESCUE_DAYS\s*=\s*7/, 'Late-deposit rescue must remain at least seven days');
assert.ok(auditSource.includes('catchupStart'), 'Audit must automatically catch up from verifiedThrough when closure falls behind');
assert.ok(auditSource.includes("mode === 'created' ? journalRescueStart : journalStart"), 'Crossref created-date rescue must use the wider rescue window independently of the 3-day publication rescan');
assert.ok(auditSource.includes("['online', 'published', 'created']"), 'Crossref discovery must union online, published and created dates');
assert.ok(auditSource.includes('createdDiscovered'), 'Late-deposit rescue must remain enabled');
assert.ok(auditSource.includes('lateIndexed'), 'Late-indexed records must remain observable in the audit report');
assert.ok(auditSource.includes('sourceFamilyHealth'), 'Per-journal source-family health must remain reported');
assert.ok(auditSource.includes('sourceFamilyGaps'), 'Source-family gaps must remain explicit');
assert.ok(auditSource.includes('.map(compactCandidate)'), 'All unresolved DOI differences must flow into review output');
assert.ok(!auditSource.includes('.filter(retainForReview)'), 'Keyword screening must not silently remove DOI differences from review');

console.log(JSON.stringify({
  targetJournals: TARGET_JOURNALS.length,
  prospectiveFrom: '2026-09-19',
  lookbackDays: 3,
  lateDepositRescueDays: 7,
  verifiedThroughCatchup: true,
  crossrefModes: ['online', 'published', 'created'],
  openAlex: true,
  lateDepositRescue: true,
  sourceFamilyHealth: true,
  silentKeywordExclusion: false,
}));
