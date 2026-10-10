/** Keep recently admitted papers findable on the Hot landing when Crossref's
 * first-online date is absent or claims a future issue date.
 * Date uncertainty stays unchanged; this is display eligibility, not date repair. */
import { classifyDate, parseDate, shiftDays } from './literature-lifecycle.mjs';
import { isHistoricalBackfill } from './historical-literature-policy.js';

export function isHotLandingEligible(row, asOfDate) {
  // Historical catalog admissions never appear on the rolling Hot landing,
  // even when their publication date is recent or addedDate is today.
  if (isHistoricalBackfill(row)) return false;
  const category = classifyDate(row.firstOnlineDate, asOfDate, row.datePrecision);
  if (category === 'hot') return true;
  if (category !== 'date_unknown' && category !== 'future') return false;
  const added = row.addedDate;
  return Boolean(parseDate(added) && added <= asOfDate && added >= shiftDays(asOfDate, -6));
}

export function hotLandingSortDate(row, asOfDate) {
  return classifyDate(row.firstOnlineDate, asOfDate, row.datePrecision) === 'hot'
    ? String(row.firstOnlineDate)
    : String(row.addedDate || '');
}
