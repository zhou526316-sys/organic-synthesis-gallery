import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TARGET_JOURNALS, effectiveJournalStart } from '../shared/literature-journals.js';

const auditSource = await readFile(new URL('../cloudflare/scripts/audit-literature.mjs', import.meta.url), 'utf8');

const names = TARGET_JOURNALS.map(journal => journal.name);
assert.equal(TARGET_JOURNALS.length, 15, 'Completeness audit must cover exactly the current 15 target journals');

for (const name of [
  'Nature', 'Science', 'Nature Catalysis', 'Nature Synthesis', 'Nature Chemistry',
  'Nature Communications', 'JACS', 'Angew', 'ACS Catalysis', 'Organic Letters',
  'Chem', 'Chemical Science', 'CCS Chemistry', 'Science Advances', 'Green Chemistry',
]) {
  assert.ok(names.includes(name), `Missing target journal: ${name}`);
}

for (const name of ['Chem', 'Chemical Science', 'CCS Chemistry', 'Science Advances', 'Green Chemistry']) {
  const journal = TARGET_JOURNALS.find(item => item.name === name);
  assert.equal(journal?.activeFrom, '2026-09-19', `${name} must remain prospective from 2026-09-19`);
  assert.equal(effectiveJournalStart(journal, '2026-09-13'), '2026-09-19', `${name} must not be backfilled before activation`);
}

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
assert.ok(auditSource.includes('.map(compactCandidate)'), 'All unresolved DOI differences must flow into review output');
assert.ok(!auditSource.includes('.filter(retainForReview)'), 'Keyword screening must not silently remove DOI differences from review');

const capabilityRegistry = JSON.parse(
  await readFile(new URL('../audit/literature-capability.json', import.meta.url), 'utf8'),
);

const fingerprintComponents = [
  ['literatureAudit', '../cloudflare/scripts/audit-literature.mjs'],
  ['literatureWorkflow', '../.github/workflows/literature-audit.yml'],
  ['journalRegistry', '../shared/literature-journals.js'],
  ['completenessGuard', '../scripts/test-literature-completeness-capability.mjs'],
  ['tocCollector', '../toc-collector/src/background.mjs'],
  ['publisherFallback', '../.github/scripts/toc_collector_015_publisher_fallback.py'],
];

function gitBlobSha(content) {
  const bytes = Buffer.from(content);
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest('hex');
}

const componentBlobShas = {};
for (const [label, relativePath] of fingerprintComponents) {
  const content = await readFile(new URL(relativePath, import.meta.url));
  componentBlobShas[label] = gitBlobSha(content);
}

const fingerprintPayload = fingerprintComponents
  .map(([label]) => `${label}:${componentBlobShas[label]}`)
  .join('\n');
const currentMainFingerprint = createHash('sha256').update(fingerprintPayload).digest('hex');
const registeredStableFingerprint = String(capabilityRegistry.currentKnownStableFingerprint || '');
const pendingValidation = Array.isArray(capabilityRegistry.pendingValidation)
  ? capabilityRegistry.pendingValidation
  : [];

if (registeredStableFingerprint === currentMainFingerprint) {
  assert.equal(
    capabilityRegistry.currentKnownStable?.literatureAudit?.blobSha,
    componentBlobShas.literatureAudit,
    'Stable literature-audit SHA must match the current main component',
  );
  assert.equal(
    capabilityRegistry.currentKnownStable?.literatureWorkflow?.blobSha,
    componentBlobShas.literatureWorkflow,
    'Stable workflow SHA must match the current main component',
  );
  assert.equal(
    capabilityRegistry.currentKnownStable?.journalRegistry?.blobSha,
    componentBlobShas.journalRegistry,
    'Stable journal-registry SHA must match the current main component',
  );
  assert.equal(
    capabilityRegistry.currentKnownStable?.completenessGuard?.blobSha,
    componentBlobShas.completenessGuard,
    'Stable completeness-guard SHA must match the current main component',
  );
  assert.equal(
    capabilityRegistry.currentKnownStable?.tocCollector?.primaryBlobSha,
    componentBlobShas.tocCollector,
    'Stable TOC collector SHA must match the current main component',
  );
  assert.equal(
    capabilityRegistry.currentKnownStable?.tocCollector?.publisherFallbackBlobSha,
    componentBlobShas.publisherFallback,
    'Stable publisher fallback SHA must match the current main component',
  );

  const stableJournalText = JSON.stringify(capabilityRegistry.currentKnownStable?.journalRegistry || {});
  assert.match(stableJournalText, /Green Chemistry/, 'Stable registry metadata must name Green Chemistry');
  assert.doesNotMatch(
    stableJournalText,
    /Chinese Journal of Chemistry/,
    'Stable registry metadata must not retain the superseded CJC target',
  );
} else {
  assert.ok(
    pendingValidation.some(item => item?.fingerprint === currentMainFingerprint),
    `Capability drift is unregistered: main=${currentMainFingerprint}, stable=${registeredStableFingerprint}. Update the stable registry or add an explicit pendingValidation entry before merging.`,
  );
}

console.log(JSON.stringify({
  targetJournals: TARGET_JOURNALS.length,
  prospectiveFrom: '2026-09-19',
  lookbackDays: 3,
  lateDepositRescueDays: 7,
  verifiedThroughCatchup: true,
  multiSourceSafetyTail: true,
  crossrefModes: ['online', 'published', 'created'],
  openAlex: true,
  lateDepositRescue: true,
  sourceFamilyHealth: true,
  silentKeywordExclusion: false,
  capabilityRegistryAligned: registeredStableFingerprint === currentMainFingerprint,
  currentMainFingerprint,
}));
