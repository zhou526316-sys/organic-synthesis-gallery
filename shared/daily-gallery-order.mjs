// Display priority for cards admitted in the SAME Beijing 08:00 release.
// This affects the Gallery's daily-newest card display, not TOC acquisition,
// publisher metadata, DOI membership, or the user's reader-count/oldest sorts.
export const DAILY_GALLERY_JOURNAL_ORDER = Object.freeze([
  'Nature',
  'Science',
  'Nature Catalysis',
  'Nature Synthesis',
  'Nature Chemistry',
  'Nature Communications',
  'Science Advances',
  'JACS',
  'Angew',
  'Chem',
  'ACS Catalysis',
  'Organic Letters',
  'Chemical Science',
  'CCS Chemistry',
  'Green Chemistry',
  'JOC',
]);

const ranks = new Map(DAILY_GALLERY_JOURNAL_ORDER.map((name, index) => [name.toLowerCase(), index]));
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function dailyGalleryJournalPriority(journal) {
  const value = String(journal || '').trim().toLowerCase();
  if (/^(?:angew\b|angewandte chemie)/i.test(value)) return ranks.get('angew');
  return ranks.get(value) ?? DAILY_GALLERY_JOURNAL_ORDER.length;
}

function publicationDate(row) {
  const value = row?.firstOnlineDate ?? row?.date;
  return validDate(value) ? value : '';
}

function additionDate(row) {
  // For historical records without a stored admission date, use a consistent
  // fallback. Never persist that fallback as an actual addedDate.
  return validDate(row?.addedDate) ? row.addedDate : publicationDate(row);
}

export function compareDailyGalleryCards(a, b) {
  const added = additionDate(b).localeCompare(additionDate(a));
  if (added) return added;
  const priority = dailyGalleryJournalPriority(a?.journal ?? a?.paper?.journal)
    - dailyGalleryJournalPriority(b?.journal ?? b?.paper?.journal);
  if (priority) return priority;
  // Within one journal and release batch, show the most recently published
  // article first. DOI is the final tie-breaker to avoid unstable pagination.
  const online = publicationDate(b).localeCompare(publicationDate(a));
  if (online) return online;
  return String(a?.doi || '').toLowerCase().localeCompare(String(b?.doi || '').toLowerCase());
}
