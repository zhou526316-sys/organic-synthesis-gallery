// One-time owner-approved 2026-10-11 technical deadline extension.
// User instruction: "那就把窗口延长到12点！然后正式上线。"
// Still one daily 08:00 Asia/Shanghai publication slot. All other dates: 60min.
export const SPECIAL_SLOT = '2026-10-11T08:00:00+08:00';
export const slotGraceMinutes = slot => slot === SPECIAL_SLOT ? 240 : 60;
