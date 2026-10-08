import test from 'node:test';
import assert from 'node:assert/strict';
import { correctedPublisherDateForDisplay } from '../shared/publisher-date-display-fix.mjs';

const original = () => ({
  doi: '10.1126/sciadv.aed4187',
  journal: 'Science Advances',
  title: 'Optical resolution of H/D isotopic chirality via asymmetric C–H amination',
  date: '2026-10-09',
  addedDate: '2026-10-08',
  dateUnverified: true,
  authors: ['Tatsuya Uchida'],
  other: 'untouched',
});

test('publisher date is corrected immediately in display model without editing incoming data', () => {
  const source = original();
  const display = correctedPublisherDateForDisplay(source);
  assert.equal(display.date, '2026-10-07');
  assert.equal(display.dateUnverified, false);
  assert.equal(display.addedDate, '2026-10-08');
  assert.equal(display.title, source.title);
  assert.equal(display.other, source.other);
  assert.equal(source.date, '2026-10-09');
  assert.equal(source.dateUnverified, true);
});

test('does not alter other DOIs, other journals, or other admission dates', () => {
  const variants = [
    { ...original(), doi: '10.1126/sciadv.other' },
    { ...original(), journal: 'Science' },
    { ...original(), addedDate: '2026-10-09' },
    { ...original(), date: '2026-10-08' },
  ];
  for (const source of variants) assert.strictEqual(correctedPublisherDateForDisplay(source), source);
});

test('already-correct source is idempotent and clears stale unverified tag', () => {
  const source = { ...original(), date: '2026-10-07', dateUnverified: true };
  const corrected = correctedPublisherDateForDisplay(source);
  assert.equal(corrected.date, '2026-10-07');
  assert.equal(corrected.dateUnverified, false);
  assert.strictEqual(correctedPublisherDateForDisplay(corrected), corrected);
});

test('other old-date papers remain untouched, even with future-facing metadata', () => {
  for (const doi of ['10.1021/jacs.6c14748', '10.1038/s41467-026-78459-z']) {
    const record = { ...original(), doi };
    assert.strictEqual(correctedPublisherDateForDisplay(record), record);
  }
});
