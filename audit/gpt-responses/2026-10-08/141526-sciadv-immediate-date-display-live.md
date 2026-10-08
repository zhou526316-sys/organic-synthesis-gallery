Beijing time: 2026-10-08 14:15:26
Conversation: User requested '现在就改掉' for incorrect 2026-10-09 display of Science Advances DOI 10.1126/sciadv.aed4187.
Publisher page screenshot, previously provided by user, says 7 Oct 2026; Gallery original addedDate 2026-10-08.

Change: presentation-only immediate display correction, PR #410 merged at 7be71318cde7d474d2b69b7cff7eef909ac02cc8. Exact match by DOI, journal, source old/new date and addedDate. In-memory date shows 2026-10-07, dateUnverified false. No protected public/rolling-supplement.json nor audit/publication-release-state.json modified by PR.
Tests: 4 targeted unit tests pass; 17 architecture Hot/Archive Playwright tests pass including new exact DOI card data-date test; site Required quality gate, build/typecheck, mobile and WebKit and Chromium pagination retry all pass.
Pages release: GitHub Actions run 37735432769, literature_authorization/build/deploy all success. Canonical and Pages literature verification success. Worker frontend deploy run 37735478219 success, Worker sync run 37735432857 success.
Direct canonical-domain browser read-only acceptance: TinyFish run 7e39c907-fc56-45fd-8022-c6d70caf4166 confirmed on https://gallery.gczhouwld.com/ article card data-doi exact, data-date='2026-10-07', visible date tag 'Oct 7, 2026', no 2026-10-09, no '待核实', no '(unverified)'.
Current underlying protected repository source remains date='2026-10-09', addedDate='2026-10-08'; a previously approved next-slot data correction is pending under existing authorized 08:00 fixed literature release contract. Never claim that authoritative source was changed immediately.

User-visible partial final #1:
这次不再等待明早才修正网页显示。
已完成 DOI `10.1126/sciadv.aed4187` 的**即时日期展示补丁**，前端构建和类型检查已通过。补丁会将卡片上的“2026-10-09（待核实）”改为 **2026-10-07**，并保留原来的 10 月 8 日收录日期。
正式文献数据仍由固定发布流程更正，不会绕过文献发布保护。即时补丁目前正在完成浏览器回归和上线部署。

User-visible partial final #2:
**即时修正已合并到 `main`**，提交为 `7be71318`，对应 [PR #410](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/410)。
完整浏览器回归和必需质量门均已通过。接下来进行 Pages/Worker 发布以及正式域名验收，确认不是仅在测试环境显示正确。

Terminal final body:
**已修复并正式上线。** [Organic Synthesis Gallery](https://gallery.gczhouwld.com/) 的 `10.1126/sciadv.aed4187` 卡片现在显示 **2026 年 10 月 7 日**，不再显示 10 月 9 日或“待核实”。
已在正式域名实际核验：卡片 `data-date=2026-10-07`，日期标签为 `Oct 7, 2026`。Pages 发布、Worker 同步和相关回归全部通过。
本次是立即生效的网页展示更正；底层受保护文献记录仍按已批准的下一次固定 08:00 正式发布流程更新，收录日期 2026-10-08 不变。若浏览器仍显示旧缓存，请 `Ctrl + F5` 强制刷新。
