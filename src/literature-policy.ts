import policy from '../config/literature-policy.json';

const DAY_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizePolicyDoi(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
}

export const EXCLUDED_DOIS = new Set(policy.excludedDois.map(normalizePolicyDoi));

export function isExcludedDoi(value: string | null | undefined): boolean {
  const doi = normalizePolicyDoi(value);
  return Boolean(doi && EXCLUDED_DOIS.has(doi));
}

export function normalizeAddedDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return DATE_RE.test(clean) ? clean : undefined;
}

export function earliestAddedDate(left: unknown, right: unknown): string | undefined {
  const a = normalizeAddedDate(left);
  const b = normalizeAddedDate(right);
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

export function shanghaiDate(now = Date.now()): string {
  return new Date(now + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function isNewToday(addedDate: unknown, now = Date.now()): boolean {
  const normalized = normalizeAddedDate(addedDate);
  return Boolean(normalized && normalized === shanghaiDate(now));
}

export function msUntilNextShanghaiDay(now = Date.now()): number {
  const shifted = now + SHANGHAI_OFFSET_MS;
  const nextBoundary = (Math.floor(shifted / DAY_MS) + 1) * DAY_MS;
  return Math.max(250, nextBoundary - shifted + 50);
}
