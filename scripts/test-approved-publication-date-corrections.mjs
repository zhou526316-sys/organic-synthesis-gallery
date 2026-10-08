import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyApprovedPublicationDateCorrections } from './lib/approved-publication-date-corrections.mjs';

const manifest = JSON.parse(readFileSync('audit/approved-publication-date-corrections.json','utf8'));
const doi = '10.1126/sciadv.aed4187';
const orig = () => new Map([
  [doi, { doi, journal:'Science Advances', title:'Optical resolution of H/D isotopic chirality via asymmetric C–H amination',
    date:'2026-10-09', addedDate:'2026-10-08', toc:'unchanged' }],
  ['10.5555/untouched', { doi:'10.5555/untouched', journal:'JACS', date:'2026-10-08', addedDate:'2026-10-08' }],
]);

test('approved metadata is exact DOI, backed by publisher evidence and user approval', () => {
  assert.equal(manifest.corrections.length,1);
  assert.deepEqual(Object.entries(manifest.corrections[0]).filter(([k]) =>
    ['doi','expectedOldDate','correctDate','preserveAddedDate','earliestPublicationSlot','publisherDisplayedDate'].includes(k)),
    [['doi',doi],['expectedOldDate','2026-10-09'],['correctDate','2026-10-07'],
     ['preserveAddedDate','2026-10-08'],['earliestPublicationSlot','2026-10-09T08:00:00+08:00'],
     ['publisherDisplayedDate','7 Oct 2026']]);
});

test('cannot mutate protected records before the next fixed 08:00 slot', () => {
  const rows=orig();
  const result=applyApprovedPublicationDateCorrections(rows,manifest,'2026-10-08T08:00:00+08:00');
  assert.equal(result.applied,0);
  assert.equal(rows.get(doi).date,'2026-10-09');
});

test('next 08:00 applies only one date, preserving original addedDate and other records', () => {
  const rows=orig(),other={...rows.get('10.5555/untouched')};
  const result=applyApprovedPublicationDateCorrections(rows,manifest,'2026-10-09T08:00:00+08:00');
  assert.equal(result.applied,1);
  assert.equal(result.conflicts,0);
  assert.equal(rows.get(doi).date,'2026-10-07');
  assert.equal(rows.get(doi).addedDate,'2026-10-08');
  assert.equal(rows.get(doi).toc,'unchanged');
  assert.deepEqual(rows.get('10.5555/untouched'),other);
});

test('repeat publisher correction is idempotent and repairs accidental re-admission date reset', () => {
  const rows=orig();
  applyApprovedPublicationDateCorrections(rows,manifest,'2026-10-09T08:00:00+08:00');
  let result=applyApprovedPublicationDateCorrections(rows,manifest,'2026-10-10T08:00:00+08:00');
  assert.equal(result.reports[0].status,'already_correct');
  rows.set(doi,{...rows.get(doi),addedDate:'2026-10-10'});
  result=applyApprovedPublicationDateCorrections(rows,manifest,'2026-10-10T08:00:00+08:00');
  assert.equal(result.applied,1);
  assert.equal(rows.get(doi).addedDate,'2026-10-08');
});

test('unexpected publisher date or registration date conflict does not rewrite other metadata', () => {
  const rows=orig();
  rows.set(doi,{...rows.get(doi),date:'2026-10-08'});
  const result=applyApprovedPublicationDateCorrections(rows,manifest,'2026-10-09T08:00:00+08:00');
  assert.equal(result.conflicts,1);
  assert.equal(rows.get(doi).date,'2026-10-08');
});

test('invalid approval or duplicate DOI cannot be accepted', () => {
  const duplicate={...manifest,corrections:[manifest.corrections[0],manifest.corrections[0]]};
  assert.throws(()=>applyApprovedPublicationDateCorrections(orig(),duplicate,'2026-10-09T08:00:00+08:00'));
  const unapproved={...manifest,corrections:[{...manifest.corrections[0],userApproval:''}]};
  assert.throws(()=>applyApprovedPublicationDateCorrections(orig(),unapproved,'2026-10-09T08:00:00+08:00'));
});
