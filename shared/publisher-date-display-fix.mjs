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

/** Apply the verified date only to the in-memory display object.
 * It does not change source files, release markers, or publisher capture data.
 */
export function correctedPublisherDateForDisplay(paper) {
  if (!paper || typeof paper !== 'object') return paper;
  const doi = String(paper.doi || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  if (doi !== CORRECTION.doi
    || String(paper.journal || '').trim() !== CORRECTION.journal
    || paper.addedDate !== CORRECTION.addedDate
    || (paper.date !== CORRECTION.oldDate && paper.date !== CORRECTION.publisherDate)) return paper;
  if (paper.date === CORRECTION.publisherDate && paper.dateUnverified !== true) return paper;
  return { ...paper, date: CORRECTION.publisherDate, dateUnverified: false };
}
