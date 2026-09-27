# Feedback #36 completion

Beijing time: 2026-09-27 14:29 +08:00
Context: user asked to resolve newly arrived feedback while old unresolved items remain paused.

## Queue verification
- Export run 36299233993 showed 13 open items.
- Only new item versus the post-#35 baseline was #36: “建议加个不看某期刊按钮”.
- Post-implementation export run 36300142142 still showed the same 13 items; no additional new feedback arrived.

## Implementation
- PR #260 merged as adde4d4ef5a2f5e69410935b7d9013901b4c9a37.
- Added persistent per-journal Hide/不看 and Restore/恢复 controls in the journal picker.
- Hidden journals are removed from normal browsing/search results but not from literature data.
- Exclusions persist in existing browser filter preferences.
- Hiding clears a conflicting positive selection for that journal.
- “All journals” and “Clear journal/date filters” reset exclusions.
- Direct DOI share links remain reachable.

## Validation
- Cloudflare migration CI 36299452488: success.
- Validate Gallery authors and site data 36299452493: success.
- Card sharing CI 36299452509: success.
- Site quality gate 36299452495: success.
- Playwright covered hide -> reload persists -> restore.
- Worker frontend deployment 36299692686: success.
- GitHub Pages deployment 36299687242: success.
- Both deployed main bundles contain data-journal-exclude and excludedJournals persistence.
- Live workflow 36300032672 final run: Chromium + WebKit success on gallery.gczhouwld.com.
- Initial live run failure was test-harness accounting: normal pageview/read-only POST traffic was incorrectly counted as unsafe writes; functional hide/persist/restore steps had succeeded.
- Cloudflare Pages fallback remains independently blocked by existing API token authentication error code 10000; primary custom-domain and Worker deployments are healthy.

## Closeout
- Feedback apply run 36300190877 succeeded.
- #36 -> reviewed.
- Remaining open count: 12.
- Remaining IDs: 8,20,21,22,23,24,25,28,31,32,34,r2:bd1346e7-aab7-40af-9ec5-0b031e750f0f.
- All remaining items stay paused per user instruction.

## Final user-visible reply
新的吐槽已经解决。今天新增的只有 #36：“建议加个不看某期刊按钮”。

现在期刊筛选里，每本期刊右侧都有“**不看**”按钮。点后该期刊会从正常浏览和搜索结果里隐藏，并自动记住；刷新网页后仍然保持。被隐藏的期刊不会从数据库删除，在同一位置会变成“**恢复**”，随时可以重新显示。“全部期刊”和“清除期刊/日期筛选”也会解除隐藏。

PR #260 已合并并上线。合并前四组检查全部通过；上线后在 gallery.gczhouwld.com 上又用 Chromium 和 WebKit 实测了“隐藏 → 刷新仍隐藏 → 恢复”，两路均通过。

#36 已标记为 reviewed。当前还剩 12 条旧吐槽，继续按之前要求保持暂停，没有动它们。