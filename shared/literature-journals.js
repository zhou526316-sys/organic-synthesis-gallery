// Canonical target-journal registry for literature discovery and completeness audits.
// activeFrom is inclusive and uses Asia/Shanghai calendar dates.
export const TARGET_JOURNALS = Object.freeze([
  { name: 'Nature', issns: ['0028-0836', '1476-4687'], activeFrom: '2026-07-01' },
  { name: 'Science', issns: ['0036-8075', '1095-9203'], activeFrom: '2026-07-01' },
  { name: 'Nature Catalysis', issns: ['2520-1158'], activeFrom: '2026-07-01' },
  { name: 'Nature Synthesis', issns: ['2731-0582'], activeFrom: '2026-07-01' },
  { name: 'Nature Chemistry', issns: ['1755-4330', '1755-4349'], activeFrom: '2026-07-01' },
  { name: 'Nature Communications', issns: ['2041-1723'], activeFrom: '2026-07-01' },
  { name: 'JACS', issns: ['0002-7863', '1520-5126'], activeFrom: '2026-07-01' },
  { name: 'Angew', issns: ['1433-7851', '1521-3773'], activeFrom: '2026-07-01' },
  { name: 'ACS Catalysis', issns: ['2155-5435'], activeFrom: '2026-07-01' },
  { name: 'Organic Letters', issns: ['1523-7052', '1523-7060'], activeFrom: '2026-07-01' },

  // Added prospectively on 2026-09-19. Do not backfill these journals before this date.
  { name: 'Chem', issns: ['2451-9294'], activeFrom: '2026-09-19' },
  { name: 'Chemical Science', issns: ['2041-6520', '2041-6539'], activeFrom: '2026-09-19' },
  { name: 'CCS Chemistry', issns: ['2096-5745'], activeFrom: '2026-09-19' },
  { name: 'Science Advances', issns: ['2375-2548'], activeFrom: '2026-09-19' },
  { name: 'Chinese Journal of Chemistry', issns: ['1001-604X', '1614-7065'], activeFrom: '2026-09-19' },
]);

export function effectiveJournalStart(journal, requestedStart) {
  const activeFrom = String(journal?.activeFrom || '');
  return activeFrom && activeFrom > requestedStart ? activeFrom : requestedStart;
}

export function journalsActiveOn(date) {
  return TARGET_JOURNALS.filter(journal => !journal.activeFrom || journal.activeFrom <= date);
}
