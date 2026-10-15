// Fixed 08:00 Asia/Shanghai publication with explicit historical date-only exceptions.
// 2026-10-11: owner requested the technical window through noon.
// 2026-10-15: owner requested a one-time manual recovery after the missed release.
// Neither exception creates a second daily release slot. All other dates: 60min.
export const SPECIAL_SLOT = '2026-10-11T08:00:00+08:00';
// One-time owner-authorized 2026-10-15 manual recovery after a missed 08:00 release.
// The logical publication slot remains 08:00. Allow only this day's audited/manual
// release through 23:59 Beijing; the ordinary 60-minute limit returns on Oct 16.
// This does not waive complete DOI review, source health, immutable SHA checks,
// non-force atomic writes, Pages literature_authorization or deployment QA.
export const OWNER_MANUAL_RECOVERY_SLOT = '2026-10-15T08:00:00+08:00';
export const slotGraceMinutes = slot => slot === OWNER_MANUAL_RECOVERY_SLOT ? 959 : slot === SPECIAL_SLOT ? 240 : 60;
