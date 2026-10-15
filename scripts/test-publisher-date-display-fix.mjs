import test from 'node:test';
import assert from 'node:assert/strict';
import { correctedPublisherDateForDisplay, publicationDateForDisplay } from '../shared/publisher-date-display-fix.mjs';
import { readFileSync } from 'node:fs';

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

const pendingJocDois = [
  '10.1021/acs.joc.6c01792',
  '10.1021/acs.joc.6c01506',
  '10.1021/acs.joc.6c01769',
  '10.1021/acs.joc.6c01159',
  '10.1021/acs.joc.6c01796',
];

test('future date is not displayed as an already-published day on the 14 Oct snapshot', () => {
  assert.deepEqual(publicationDateForDisplay('2026-10-15', '2026-10-14', true),
    { date: '', unverified: true, reason: 'future_unverified' });
  assert.deepEqual(publicationDateForDisplay('2026-10-15', '2026-10-14', false),
    { date: '', unverified: true, reason: 'future_unverified' });
});

test('the same DOI does not automatically become verified on the next calendar day', () => {
  const p=publicationDateForDisplay('2026-10-15', '2026-10-15', true);
  assert.equal(p.date,'');
  assert.equal(p.unverified,true);
  assert.equal(p.reason,'unverified');
});

test('an unverified past calendar date is not shown as a fake published day', () => {
  assert.deepEqual(publicationDateForDisplay('2026-10-14','2026-10-15',true),
    {date:'',unverified:true,reason:'unverified'});
  assert.deepEqual(publicationDateForDisplay('2026-10-14','2026-10-15',false),
    {date:'2026-10-14',unverified:false,reason:'confirmed'});
});

test('official Nature DOI and six authors repair the precisely matched Oct 15 public card', () => {
  const publisherEvidence=JSON.parse(readFileSync('audit/publisher-date-evidence/2026-10-15-nature-s41586-026-11242-8.json','utf8'));
  const raw=JSON.parse(readFileSync('public/rolling-supplement.json','utf8')).papers
    .find(x=>x.doi==='10.1038/s41586-026-11242-8');
  assert(raw && raw.dateUnverified === true && raw.authors.length===0);
  assert.equal(raw.title,publisherEvidence.canonicalTitle);
  assert.equal(raw.date,publisherEvidence.firstOnlineDate);
  const repaired=correctedPublisherDateForDisplay(raw);
  assert.equal(repaired.date,'2026-10-14');
  assert.equal(repaired.dateUnverified,false);
  assert.deepEqual(repaired.authors,publisherEvidence.authors);
  assert.equal(publicationDateForDisplay(repaired.date,'2026-10-15',repaired.dateUnverified).date,'2026-10-14');
  assert.strictEqual(correctedPublisherDateForDisplay(repaired),repaired);
  assert.equal(raw.dateUnverified,true); // the protected input remains unchanged
});

test('Nature first-online repair rejects all non-exact identity / title / admission variants', () => {
  const original={doi:'10.1038/s41586-026-11242-8',title:'Catalytic transfer of carbon atoms enables spirofusion of C–C σ-bonds',journal:'Nature',date:'2026-10-14',addedDate:'2026-10-15',dateUnverified:true,authors:[]};
  for(const mutated of [
    {...original,doi:'10.1038/s41586-026-11243-8'},
    {...original,journal:'Nature Chemistry'},
    {...original,addedDate:'2026-10-14'},
    {...original,title:'Entirely different paper'},
    {...original,date:'2026-10-13'},
  ])assert.strictEqual(correctedPublisherDateForDisplay(mutated),mutated);
});

test('a confirmed past date remains visible, but invalid calendar days cannot be displayed', () => {
  assert.deepEqual(publicationDateForDisplay('2026-10-13','2026-10-14'),
    {date:'2026-10-13',unverified:false,reason:'confirmed'});
  assert.equal(publicationDateForDisplay('2026-02-29','2026-10-14').date,'');
  assert.equal(publicationDateForDisplay('2026-10-99','2026-10-14').date,'');
  assert.throws(()=>publicationDateForDisplay('2026-10-13','not-a-date'));
});

test('Chemical Science created-only metadata remains first-online date unknown', () => {
  assert.deepEqual(publicationDateForDisplay('', '2026-10-14', true),
    {date:'',unverified:true,reason:'missing_or_invalid'});
  // The Crossref 2026-10-13 createdDate must never fill publication date.
  const row={doi:'10.1039/d6sc06571f',journal:'Chemical Science',date:'',
    createdDate:'2026-10-13',dateUnverified:true,addedDate:'2026-10-14'};
  assert.strictEqual(correctedPublisherDateForDisplay(row),row);
});

test('all five exact JOC unverified dates survive the derived presentation layer', () => {
  for(const doi of pendingJocDois) {
    const source={doi,journal:'JOC',date:'2026-10-15',addedDate:'2026-10-14',
      dateUnverified:false,title:'DOI-verified test article'};
    const corrected=correctedPublisherDateForDisplay(source);
    assert.equal(corrected.date,'2026-10-15'); // preserve Crossref source bytes
    assert.equal(corrected.dateUnverified,true);
    assert.strictEqual(source.dateUnverified,false);
    assert.strictEqual(correctedPublisherDateForDisplay(corrected),corrected);
  }
});

test('DOI-scoped override never changes a different journal, admission day, or published date', () => {
  const base={doi:pendingJocDois[0],journal:'JOC',
    date:'2026-10-15',addedDate:'2026-10-14',dateUnverified:false};
  const alternatives=[
    {...base,doi:'10.1021/acs.joc.other'},
    {...base,journal:'Organic Letters'},
    {...base,date:'2026-10-13'},
    {...base,addedDate:'2026-10-13'},
  ];
  for(const item of alternatives)assert.strictEqual(correctedPublisherDateForDisplay(item),item);
});

test('original Oct 14 formal review confirms publisher date was unverified for every affected JOC DOI', () => {
  const review=JSON.parse(readFileSync('audit/review-2026-10-14-0800.json','utf8'));
  const rows=(review.accepted||[]).filter(x=>pendingJocDois.includes(x.doi));
  assert.equal(rows.length,5);
  for(const row of rows) {
    assert.equal(row.dateUnverified,true);
    assert.equal(row.date,'2026-10-15');
    assert.equal(row.createdDate,'2026-10-13');
    assert.equal(row.journal,'JOC');
  }
});

test('next fixed-slot writer propagates unverified status even when review has a nonempty future date', () => {
  const source=readFileSync('scripts/apply-fixed-slot-literature-release.mjs','utf8');
  assert(source.includes("row.dateUnverified === true ? {"));
  assert(!source.includes("row.dateUnverified === true && !row.date"));
});
