// Distinguish publication date from today's Gallery admission, including late
// reviews of 2026-07-01..2026-09-30. This is a read/display/acquisition policy,
// NOT authority to admit an old DOI outside the sole 08:00 release.
const JUL_SEP_START = '2026-07-01';
const JUL_SEP_END = '2026-09-30';
const OCT_FULL_START = '2026-10-01';

const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';

export function isHistoricalBackfill(paper) {
  return paper?.ingestionChannel === 'historical_backfill' || paper?.paper?.ingestionChannel === 'historical_backfill';
}

export function isJulSepPaper(paper) {
  const published = day(paper?.firstOnlineDate || paper?.date);
  return Boolean(published && published >= JUL_SEP_START && published <= JUL_SEP_END);
}

// Explicit historic records are always out of the October body/PDF bundle;
// a late-entered July–September paper is TOC-only even if addedDate is in Oct.
export function isJulSepTocOnly(paper) {
  // User rule applies to all July–September papers needing newly acquired media,
  // not only newly backfilled DOI rows. Existing assets are left untouched.
  return isJulSepPaper(paper);
}

export function paperMediaPolicy(paper) {
  if (isJulSepTocOnly(paper)) return 'toc_only';
  if (isHistoricalBackfill(paper)) return 'metadata_only';
  return 'standard';
}

export function shouldShowDailyNew(paper, asOfDay) {
  return !isHistoricalBackfill(paper)
    && Boolean(day(paper?.addedDate) && paper.addedDate === asOfDay);
}

export function isOctoberFullCapturePaper(paper) {
  return paperMediaPolicy(paper) === 'standard'
    && day(paper?.addedDate) >= OCT_FULL_START;
}
