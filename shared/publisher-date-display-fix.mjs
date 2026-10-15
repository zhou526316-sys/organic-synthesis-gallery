// A temporary, DOI-scoped PRESENTATION correction only.
// This is not a mutation of the fixed-slot-authorized literature dataset.
// Publisher article https://www.science.org/doi/10.1126/sciadv.aed4187
// displays "7 Oct 2026". Crossref-derived 2026-10-09 is inaccurate.
// The authorized 08:00 literature writer separately handles the source update.
const CORRECTION = Object.freeze({
  doi: '10.1126/sciadv.aed4187',
  journal: 'Science Advances',
  oldDate: '2026-10-09',
  publisherDate: '2026-10-07',
  addedDate: '2026-10-08',
});

// Official Nature first-online page confirms both the precise DOI and the
// date 2026-10-14. The fixed-slot Oct 15 card retained dateUnverified=true
// and lost its authors. Keep this presentation-only repair exactly DOI/title/
// journal/addedDate-bound; see audit/publisher-date-evidence/2026-10-15-
// nature-s41586-026-11242-8.json. No other DOI gains publication evidence.
const NATURE_OFFICIAL = Object.freeze({
  doi: '10.1038/s41586-026-11242-8',
  title: 'Catalytic transfer of carbon atoms enables spirofusion of C–C σ-bonds',
  journal: 'Nature',
  date: '2026-10-14',
  addedDate: '2026-10-15',
  authors: Object.freeze([
    'Hayato Fujimoto', 'Masayuki Mizutani', 'Kazuya Imachi',
    'Teruki Nishioka', 'Reona Ikeda', 'Mamoru Tobisu',
  ]),
});

// Five JOC DOI were admitted on 2026-10-14 with Crossref published/online
// date 2026-10-15 and createdDate 2026-10-13. The publisher first-online
// date was NOT independently verified. The 2026-10-14 formal review records
// dateUnverified=true for all five, but the old release writer accidentally
// dropped that flag when the prospective date was nonempty.
// This exact DOI/date/addedDate overlay repairs DISPLAY provenance only until
// the next authorized fixed-slot data correction. Never backdate publication
// using Crossref created/deposited dates.
const JOC_FUTURE_DATE_PENDING = Object.freeze(new Set([
  '10.1021/acs.joc.6c01792',
  '10.1021/acs.joc.6c01506',
  '10.1021/acs.joc.6c01769',
  '10.1021/acs.joc.6c01159',
  '10.1021/acs.joc.6c01796',
]));

function realCalendarDay(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Return only a date that is safe to SHOW as a publication-day claim.
 * Future publisher claims stay unknown until the actual calendar day.
 * Existing DOI-specific unverified flags remain visible as uncertainty
 * even after the date passes; this never promotes a provisional date.
 */
export function publicationDateForDisplay(date, asOfBeijingDay, unverified = false) {
  if (!realCalendarDay(asOfBeijingDay)) throw new Error('invalid_beijing_as_of_date');
  if (!realCalendarDay(date)) return {date: '', unverified: true, reason: 'missing_or_invalid'};
  if (date > asOfBeijingDay) return {date: '', unverified: true, reason: 'future_unverified'};
  // A candidate calendar date is not a first-online claim until publisher-
  // specific evidence clears the unverified flag. Elapsed time cannot verify it.
  if (unverified === true) return {date: '', unverified: true, reason: 'unverified'};
  return {date, unverified: false, reason: 'confirmed'};
}

/** Apply the verified date only to the in-memory display object.
 * It does not change source files, release markers, or publisher capture data.
 */
export function correctedPublisherDateForDisplay(paper) {
  if (!paper || typeof paper !== 'object') return paper;
  const doi = String(paper.doi || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  if (doi === NATURE_OFFICIAL.doi
    && String(paper.journal || '').trim() === NATURE_OFFICIAL.journal
    && String(paper.title || '').trim() === NATURE_OFFICIAL.title
    && paper.addedDate === NATURE_OFFICIAL.addedDate
    && (paper.date === NATURE_OFFICIAL.date || !paper.date)) {
    if (paper.dateUnverified !== true && paper.date === NATURE_OFFICIAL.date
      && Array.isArray(paper.authors) && paper.authors.length) return paper;
    return { ...paper, date: NATURE_OFFICIAL.date, dateUnverified: false,
      authors: Array.isArray(paper.authors) && paper.authors.length
        ? paper.authors : [...NATURE_OFFICIAL.authors] };
  }
  if (JOC_FUTURE_DATE_PENDING.has(doi) && String(paper.journal || '').trim() === 'JOC'
    && paper.date === '2026-10-15' && paper.addedDate === '2026-10-14') {
    return paper.dateUnverified === true ? paper : { ...paper, dateUnverified: true };
  }
  if (doi !== CORRECTION.doi
    || String(paper.journal || '').trim() !== CORRECTION.journal
    || paper.addedDate !== CORRECTION.addedDate
    || (paper.date !== CORRECTION.oldDate && paper.date !== CORRECTION.publisherDate)) return paper;
  if (paper.date === CORRECTION.publisherDate && paper.dateUnverified !== true) return paper;
  return { ...paper, date: CORRECTION.publisherDate, dateUnverified: false };
}
