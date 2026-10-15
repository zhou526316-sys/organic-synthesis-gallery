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
  const fixture={doi:publisherEvidence.doi,title:publisherEvidence.canonicalTitle,
    journal:publisherEvidence.journal,date:'2026-10-14',dateUnverified:true,
    authors:[],addedDate:'2026-10-15'};
  const raw=JSON.parse(readFileSync('public/rolling-supplement.json','utf8')).papers
    .find(x=>x.doi===publisherEvidence.doi)||fixture;
  assert.equal(raw.title,publisherEvidence.canonicalTitle);
  assert.equal(raw.date,publisherEvidence.firstOnlineDate);
  const repaired=correctedPublisherDateForDisplay(raw);
  assert.equal(repaired.date,'2026-10-14');
  assert.equal(repaired.dateUnverified,false);
  assert.deepEqual(repaired.authors,publisherEvidence.authors);
  assert.equal(publicationDateForDisplay(repaired.date,'2026-10-15',repaired.dateUnverified).date,'2026-10-14');
  assert.strictEqual(correctedPublisherDateForDisplay(repaired),repaired);
  assert.equal(raw.doi,publisherEvidence.doi); // the protected input remains unchanged
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
  const row={doi:'10.1039/d6sc00000x',journal:'Chemical Science',date:'',
    createdDate:'2026-10-13',dateUnverified:true,addedDate:'2026-10-14'};
  assert.strictEqual(correctedPublisherDateForDisplay(row),row);
});

test('all five publisher-evidenced JOC dates are verified only after exact DOI and title match', () => {
  const sourceEvidence=JSON.parse(readFileSync('audit/publisher-date-evidence/2026-10-15-acs-five-joc-first-online.json','utf8'));
  assert.equal(sourceEvidence.records.length,5);
  const publicRows=JSON.parse(readFileSync('public/rolling-supplement.json','utf8')).papers;
  for(const evidence of sourceEvidence.records) {
    assert(pendingJocDois.includes(evidence.doi));
    assert.equal(evidence.verifiedFirstOnlineDate,'2026-10-15');
    assert(evidence.publisherArticleUrl.startsWith('https://pubs.acs.org/'));
    const raw=publicRows.find(x=>x.doi===evidence.doi)||{
      doi:evidence.doi,journal:'JOC',title:evidence.title,date:'2026-10-15',
      addedDate:'2026-10-14',dateUnverified:true,authors:['Author']
    };
    assert.equal(raw.title,evidence.title);
    const corrected=correctedPublisherDateForDisplay({...raw,dateUnverified:true});
    assert.equal(corrected.date,'2026-10-15');
    assert.equal(corrected.dateUnverified,false);
    assert.strictEqual(correctedPublisherDateForDisplay(corrected),corrected);
    assert.equal(publicationDateForDisplay(corrected.date,'2026-10-15',corrected.dateUnverified).date,'2026-10-15');
    assert.equal(publicationDateForDisplay(corrected.date,'2026-10-14',corrected.dateUnverified).date,'');
  }
});

test('DOI-scoped ACS evidence never changes a different title, journal, admission day, or published date', () => {
  const title=JSON.parse(readFileSync('audit/publisher-date-evidence/2026-10-15-acs-five-joc-first-online.json','utf8')).records[0].title;
  const base={doi:pendingJocDois[0],journal:'JOC',title,
    date:'2026-10-15',addedDate:'2026-10-14',dateUnverified:true};
  const alternatives=[
    {...base,doi:'10.1021/acs.joc.other'},
    {...base,title:'a different JOC article'},
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

test('all ten RSC publisher-first-online dates resolve on the exact protected DOI title and journal only', () => {
  const evidence=JSON.parse(readFileSync('audit/publisher-date-evidence/2026-10-15-rsc-ten-first-online.json','utf8'));
  const pending=JSON.parse(readFileSync('audit/publisher-date-evidence/pending-latest.json','utf8'));
  const protectedPapers=JSON.parse(readFileSync('public/rolling-supplement.json','utf8')).papers;
  assert.equal(evidence.publisher,'Royal Society of Chemistry');
  assert.equal(evidence.records.length,10);
  assert.equal(evidence.sourceQueueBlobSha,'05de691ba05b0f76d3376b9ca44727a5afb21817');
  assert.equal(pending.unresolvedPublisherFirstOnlineDates,10);
  assert.equal(evidence.sourceCatalogCount,1151);
  assert.deepEqual(
    evidence.records.map(x=>x.doi).sort(),
    pending.issues.map(x=>x.doi).sort(),
    'officially checked DOIs must cover precisely the previously unverified ten'
  );
  for(const source of evidence.records){
    const original=protectedPapers.find(x=>x.doi===source.doi);
    assert(original,'missing released RSC paper '+source.doi);
    assert.equal(source.title,original.title);
    assert.equal(source.journal,original.journal);
    assert.equal(source.addedDate,original.addedDate);
    assert(source.publisherArticleUrl.includes(source.doi.toUpperCase())
      || source.publisherArticleUrl.toLowerCase().includes(source.doi));
    assert.match(source.publisherArticleUrl,/^https:\/\/pubs\.rsc\.org\//);
    assert.equal(source.originalDateEvidenceStatus,'missing_or_invalid');
    assert.equal(original.date,'');
    assert.equal(original.dateUnverified,true);
    const display=correctedPublisherDateForDisplay(original);
    assert.equal(display.date,source.verifiedFirstOnlineDate,'date mismatch '+source.doi);
    assert.equal(display.dateUnverified,false,'still provisional '+source.doi);
    assert.equal(display.addedDate,original.addedDate);
    assert.equal(display.title,original.title);
    assert.equal(display.journal,original.journal);
    assert.equal(publicationDateForDisplay(display.date,'2026-10-15',display.dateUnverified).date,
      source.verifiedFirstOnlineDate);
    assert.strictEqual(correctedPublisherDateForDisplay(display),display,'must be idempotent');
    const changes=[
      {...original,doi:'10.1039/d6scinvalid'},
      {...original,title:original.title+' 2'},
      {...original,journal:original.journal==='Chemical Science'?'Green Chemistry':'Chemical Science'},
      {...original,addedDate:'2026-10-10'},
      {...original,dateUnverified:false},
      {...original,date:'2026-10-06'},
    ];
    for(const row of changes)assert.strictEqual(correctedPublisherDateForDisplay(row),row,
      'unexpected provisional date upgrade for altered article identity '+source.doi);
    assert.equal(original.date,'');
    assert.equal(original.dateUnverified,true,'frozen source was mutated');
  }
});
