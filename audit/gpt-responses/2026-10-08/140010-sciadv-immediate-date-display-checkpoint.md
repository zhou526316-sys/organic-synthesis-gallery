Beijing time: 2026-10-08 14:00:10
Context: user explicitly requested '现在就改掉' for the previously confirmed SciAdv date error, DOI 10.1126/sciadv.aed4187.

User-visible partial answer #1:
这次不再等待明早才修正网页显示。
已完成 DOI `10.1126/sciadv.aed4187` 的**即时日期展示补丁**，前端构建和类型检查已通过。补丁会将卡片上的“2026-10-09（待核实）”改为 **2026-10-07**，并保留原来的 10 月 8 日收录日期。
正式文献数据仍由固定发布流程更正，不会绕过文献发布保护。即时补丁目前正在完成浏览器回归和上线部署。

User-visible partial answer #2:
**即时修正已合并到 `main`**，提交为 `7be71318`，对应 [PR #410](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/410)。
完整浏览器回归和必需质量门均已通过。接下来进行 Pages/Worker 发布以及正式域名验收，确认不是仅在测试环境显示正确。

Implementation:
- PR #410: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/410
- Merge SHA 7be71318cde7d474d2b69b7cff7eef909ac02cc8.
- src/main.ts normalizes Paper then applies shared/publisher-date-display-fix.mjs with exact DOI/journal/date/addedDate matcher. Changes only in-memory display date + clears unverified label. No protected production literature data mutated.
- src/main.ts rendering and search date attribute data-date show corrected 2026-10-07 in preview.
- 4 Node invariants success; Playwright architecture Hot/Archive 17 tests success including new rendered-card test; required Site quality gate success; Chromium pagination rerun success, WebKit success.
- Publisher authoritative date fix PR #408 already merged and remains scheduled within the next authorized 08:00 writer, preserving original addedDate.

Publication checkpoint:
- New Pages run 37735192209 pending behind earlier Pages run 37734637548 (in progress). Do not cancel healthy older deploy.
- Worker asset run 37735211529 queued; Worker frontend sync 37735192222 in progress.
- No claim of live deployment until Pages successful and canonical domain checked.
