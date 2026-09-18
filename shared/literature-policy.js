// Single source of truth for literature exclusions and added-date merge semantics.
export const EXCLUDED_DOIS = new Set([
  '10.1038/s41467-026-77616-8',
  '10.1021/jacs.6c13738',
]);

export function normalizePolicyDoi(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
}

export function isExcludedDoi(value) {
  const doi = normalizePolicyDoi(value);
  return Boolean(doi && EXCLUDED_DOIS.has(doi));
}

export function validAddedDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

export function earliestAddedDate(...values) {
  const dates = values.map(validAddedDate).filter(Boolean).sort();
  return dates[0] || '';
}

export function beijingDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
