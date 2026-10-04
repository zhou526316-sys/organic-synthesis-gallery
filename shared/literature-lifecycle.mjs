/** Pure date/eligibility contract. No network, storage, clock mutation or production writes. */
export const LIFECYCLE_RULE = 'rolling-three-calendar-months-v1';
export const TIME_ZONE = 'Asia/Shanghai';
export function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    ? { year, month, day } : null;
}
function formatDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function cutoffFor(asOfDate) {
  const p = parseDate(asOfDate);
  if (!p) throw new Error('invalid_as_of_date');
  const index = p.year * 12 + p.month - 1 - 3;
  const year = Math.floor(index / 12), month = index % 12 + 1;
  if (year < 1) throw new Error('as_of_date_before_supported_range');
  let day = p.day;
  while (!parseDate(formatDate(year, month, day))) day--;
  return formatDate(year, month, day);
}
export function classifyDate(firstOnlineDate, asOfDate, precision = 'day') {
  const cutoff = cutoffFor(asOfDate);
  if (!firstOnlineDate || precision !== 'day') return 'date_unknown';
  if (!parseDate(firstOnlineDate)) return 'date_invalid';
  if (firstOnlineDate > asOfDate) return 'future';
  return firstOnlineDate < cutoff ? 'archive' : 'hot';
}
export function shiftDays(date, offset) {
  const p = parseDate(date);
  if (!p || !Number.isSafeInteger(offset)) throw new Error('invalid_day_shift');
  const d = new Date(0);
  d.setUTCFullYear(p.year, p.month - 1, p.day);
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  const result = d.toISOString().slice(0, 10);
  if (!parseDate(result)) throw new Error('day_shift_out_of_range');
  return result;
}
/** The caller supplies a trusted epoch. Never turn an uncertain clock into deletion. */
export function beijingDate(epochMs) {
  if (!Number.isFinite(epochMs)) throw new Error('trusted_epoch_required');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(epochMs));
  const p = Object.fromEntries(parts.map(item => [item.type, item.value]));
  const result = `${p.year}-${p.month}-${p.day}`;
  if (!parseDate(result)) throw new Error('invalid_trusted_epoch');
  return result;
}
/** Work permission is not membership, nor proof that an asset is missing. */
export function acquisitionEligibility(record, asOfDate, grants = []) {
  const lifecycle = classifyDate(record.firstOnlineDate, asOfDate, record.datePrecision);
  if (record.status === 'withdrawn') return { lifecycle, eligible: false, reason: 'withdrawn' };
  if (lifecycle === 'hot') return { lifecycle, eligible: true, reason: 'hot-default' };
  if (lifecycle !== 'archive') return { lifecycle, eligible: false, reason: 'date-review-required' };
  const repair = grants.find(g => g.doi === record.doi && g.kind === 'archive-repair'
    && typeof g.authorizationRef === 'string' && g.authorizationRef.trim()
    && typeof g.reason === 'string' && g.reason.trim()
    && parseDate(g.validFrom) && parseDate(g.validThrough)
    && g.validFrom <= asOfDate && asOfDate <= g.validThrough);
  if (repair) return { lifecycle, eligible: true, reason: 'archive-repair' };
  if (parseDate(record.addedDate) && record.addedDate <= asOfDate
      && record.addedDate >= shiftDays(asOfDate, -6)) {
    return { lifecycle, eligible: true, reason: 'archive-recent-addition' };
  }
  return { lifecycle, eligible: false, reason: 'archive-idle' };
}
