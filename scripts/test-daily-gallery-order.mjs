import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDailyGalleryCards, dailyGalleryJournalPriority } from '../shared/daily-gallery-order.mjs';

const card = (doi, journal, addedDate, date = '2026-10-07') =>
  ({ doi, journal, addedDate, date });

test('newly admitted same-day cards follow the requested journal sequence', () => {
  const addedDate = '2026-10-08';
  const journals = [
    'Green Chemistry', 'ACS Catalysis', 'Nature Communications', 'JACS',
    'Science', 'Chem', 'JOC', 'Nature Catalysis', 'Science Advances',
    'Angew', 'Nature', 'Nature Synthesis', 'Organic Letters',
    'Nature Chemistry', 'CCS Chemistry', 'Chemical Science',
  ];
  const shuffled = journals.map((journal, n) =>
    card(`10.5555/fixture-${n}`, journal, addedDate));
  const actual = [...shuffled].sort(compareDailyGalleryCards).map(row => row.journal);
  assert.deepEqual(actual, [
    'Nature', 'Science', 'Nature Catalysis', 'Nature Synthesis',
    'Nature Chemistry', 'Nature Communications', 'Science Advances',
    'JACS', 'Angew', 'Chem', 'ACS Catalysis', 'Organic Letters',
    'Chemical Science', 'CCS Chemistry', 'Green Chemistry', 'JOC',
  ]);
  assert.ok(dailyGalleryJournalPriority('Nature') < dailyGalleryJournalPriority('Science'));
  assert.ok(dailyGalleryJournalPriority('Chem') < dailyGalleryJournalPriority('ACS Catalysis'));
});

test('actual admission day precedes journal priority and first-online day', () => {
  const cards = [
    card('10.5555/older-nature', 'Nature', '2026-10-07', '2026-10-07'),
    card('10.5555/new-joc', 'JOC', '2026-10-08', '2026-10-05'),
    card('10.5555/new-science', 'Science', '2026-10-08', '2026-10-06'),
    card('10.5555/new-jacs', 'JACS', '2026-10-08', '2026-10-09'),
  ];
  assert.deepEqual([...cards].sort(compareDailyGalleryCards).map(x => x.doi), [
    '10.5555/new-science', '10.5555/new-jacs',
    '10.5555/new-joc', '10.5555/older-nature',
  ]);
  assert.equal(cards[3].date, '2026-10-09'); // Sorting cannot rewrite metadata.
});

test('Hot head is selected from the whole ranked daily admission, not the first 24 by DOI', () => {
  const low = Array.from({ length: 28 }, (_, n) =>
    card(`10.5555/other-${String(n).padStart(2,'0')}`, 'JOC', '2026-10-08', '2026-10-08'));
  const high = card('10.5555/nature-old-online', 'Nature', '2026-10-08', '2026-10-01');
  const head = [...low, high].sort(compareDailyGalleryCards).slice(0, 24);
  assert.equal(head[0].doi, high.doi);
  assert.equal(head.length, 24);
  assert.equal(head.filter(x => x.doi === high.doi).length, 1);
});

test('the comparator handles architecture records and stable tie-breaks', () => {
  const make = doi => ({
    doi, addedDate: '2026-10-08', firstOnlineDate: '2026-10-07',
    paper: { journal: 'Angewandte Chemie International Edition' },
  });
  assert.ok(dailyGalleryJournalPriority('Angewandte Chemie International Edition') < dailyGalleryJournalPriority('Chem'));
  assert.deepEqual([make('10.5555/z'), make('10.5555/a')].sort(compareDailyGalleryCards).map(x=>x.doi),
    ['10.5555/a', '10.5555/z']);
});

test('missing historic addedDate does not invent a release date', () => {
  const legacy = card('10.5555/legacy', 'JACS', undefined, '2026-09-21');
  const recent = card('10.5555/recent', 'Angew', '2026-10-08', '2026-09-25');
  assert.equal([legacy, recent].sort(compareDailyGalleryCards)[0].doi, recent.doi);
  assert.equal(legacy.addedDate, undefined);
});
