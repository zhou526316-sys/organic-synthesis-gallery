# Gallery current feedback — read-only verification and approval hold

- Beijing observation window: 2026-10-08 23:17–23:21 (+08:00), with later static/browser checks
- Export workflow: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37800022262
- Export artifact: 11560207011, generatedAt 2026-10-08T15:21:05.968Z
- Open queue: 15 total (D1: 14; R2 fallback: 1)
- Compared with 2026-10-08 07:58 +08:00 export (14 open); #42 is the newest new arrival.
- No feedback statuses changed. No functional code, journal data, media inventory, or publishing schedules changed.

## Feedback #42 — status popup chooses wrong direction
**Verbatim:** 这些状态栏点开之后明明有时候上面空间更大反而弹窗在下面，展示不完全，很不好选择

**Evidence:** The submitted image shows the reading-status editor expanding below the status button with a scrollbar and lower controls out of view. `src/user-ui/paper-actions.ts`, `positionPanel()`, currently uses `below >= Math.min(initialRect.height, 220) || below >= above` to choose downward expansion. This OR condition can choose below whenever it has ~220px even if above has materially more room. It also forces `maxHeight >= 96px` even when actual available room is less. The screenshot and code confirm the defect mechanism. A read-only live browser probe could not click the dynamically re-rendered status control because references became stale, so this is **screenshot-and-code confirmed**, not an independent completed live-browser reproduction.

**Proposed repair, held:** Calculate usable top and bottom viewport space; first choose a side that can contain the popup at intended height, otherwise prefer the side with more usable space. Clamp popup height and position to the visual viewport rather than forcing a 96px minimum. Keep internal scroll when necessary. Regression tests: desktop/mobile, scroll position top/center/bottom, short/tall status lists, browser zoom/visual viewport, status/favorite/note/more drawers. Leave summary drawer positioning and user data untouched.

**Risk:** Unintended popup overlap in small viewports or while browser UI/keyboard is visible. Scope is purely UI.

## Feedback #40 — hide '正文图待抓取' on public cards
**Verbatim:** 不要显示正文图待抓取这种字样

**Evidence:** Main-branch `src/main.ts` does not contain that exact string in inspected source. It does define `fetching: '正在获取原始 TOC / Figure'`, while a live read-only browser pass on the English UI saw `Fetching original TOC / Figure` in some cards where TOC was missing. Thus the **exact phrase has not been reproduced**, but the user-visible acquisition-progress copy remains confirmed in the English locale.

**Proposed repair, held:** Do not expose internal acquisition-queue status to visitors. Use a nonverbal/loading graphic or reserved image area rather than "待抓取" or equivalent acquisition text; retain acquisition diagnostics in internal tools and accurate card data. Separate genuine missing TOC from an image still loading. Test both Chinese and English UI plus accessibility labels.

**Risk:** An entirely blank image slot reduces transparency and may be mistaken for broken rendering. Requires user design decision.

## Feedback #41 — slow phone initial load and TOC
**Verbatim:** 手机加载速度太慢，toc显示太慢

**Evidence:** A user performance report, **not yet quantitatively reproduced** under mobile/network throttling. Code review of `src/gallery-performance.ts` shows unconditional `media-index.json` fetch at module initialization and a hydration loop over both near-viewport and offscreen TOC slots using `image.loading='eager'`. `src/main.ts` separately has a bounded visible DOI media-batch path. Possible redundant manifest work and excess offscreen image requests are hypotheses only; cache, image payload sizes and real mobile network waterfall still need checking.

**Proposed scope, held:** Instrument at 390x844 with representative slow network and cached/uncached runs; report main content render, first TOC paint, TOC bytes and duplicate requests. If evidence supports it, defer offscreen media, avoid redundant manifest fetch on normal batch path, prioritize visible TOC. Do not alter publisher acquisition, Tampermonkey, DOI admission, owner PDF or release schedule.

**Risk:** Overaggressive lazy loading can worsen scroll experience or suppress available art. Measure before changing.

## Gate
PROJECT_RULES.md requires explicit item- or enumerated-batch approval after presenting verified scope and risks. `解决新吐槽` identifies an intent but not an ID-specific selection from the queue prior to verification. Status: **approval_hold**. Do not change code, deploy, or mark statuses reviewed/closed until user selects #42 and/or #40, and decides on #41 investigation.
