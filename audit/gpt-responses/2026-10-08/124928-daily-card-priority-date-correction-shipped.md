Beijing time: 2026-10-08 12:49:28
Conversation: approved SciAdv first-publication date fix and new request for same-day Gallery card display ordering.
Relevant source changes: PR #406 merged as 3674039e14ae8462a28c9eaf6301b74ba6e53cf6; PR #408 merged as c031bcd055483d259537ae90689d131fe697b417.
Production Pages deploy run 37728275355: literature authorization/build/deploy all success; canonical and Pages DOI validation success. Worker frontend deploy run 37728301872 and Worker sync run 37728275404 success. TinyFish read-only live inspection (run e67b4b0b-1062-4ccb-9b38-70af445c9d79) saw priority order Nature Chemistry, Nature Communications, Science Advances, JACS, ACS Catalysis, Organic Letters. Nature/Science main journals and Angew/Chem did not occur in that day's sampled batch; not a priority violation.
2026-10-08 publication row for DOI 10.1126/sciadv.aed4187 remains date=2026-10-09, addedDate=2026-10-08 pending scheduled correction. Approved date manifest at audit/approved-publication-date-corrections.json, writer wired in scripts/apply-fixed-slot-literature-release.mjs. Earliest authorized application 2026-10-09T08:00:00+08:00, only if a valid fixed-slot release executes. All six unit tests and required quality gate passed. No off-slot protected literature mutation, no new scheduled release, no new DOI added.

User-visible partial final already sent:
**同一天上线文献的卡片排序已经修改并合并到 `main`**，对应 [PR #406](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/406)。

新的默认顺序为：

**Nature → Science → 子刊（Nature 系列、Science Advances）→ JACS → Angew → Chem → ACS Catalysis → 其他期刊。**

排序使用 `addedDate`（Gallery 实际收录日期）划分每日批次，同批次按期刊优先级排列。首屏数据生成也采用相同规则，避免 Nature、Science 等优先期刊被提前截取到下一页。原有发表日期、TOC 抓取顺序、手动选择“最早优先”和“阅读人数最多”的行为不变。

代码和相关测试已通过，正式网页部署仍在验收中。

Terminal final supplement:
**正式网页已经上线并完成验收。** GitHub Pages 发布及正式域名验证通过，Worker 前端同步成功。实测 10 月 8 日上新卡片按 Nature Chemistry → Nature Communications → Science Advances → JACS → ACS Catalysis 排列；当天没有 Nature、Science 主刊或 Angew、Chem 的上新卡片时，会自然跳过这些期刊，不会插入空位。

另外，先前获批的 Science Advances `10.1126/sciadv.aed4187` 日期纠错已经以 [PR #408](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/408) 合并，执行条件严格限定在 **10 月 9 日 08:00 或之后的下一次有效固定发布**。届时把发表日期从 `2026-10-09` 更正为 `2026-10-07`，保留 `addedDate=2026-10-08`。当前网站仍显示旧日期是预期状态，不代表日期纠错已经执行。如果该发布槽未能通过正式门禁，纠错会保持待处理，不会强制离槽发布。

可刷新 [Organic Synthesis Gallery](https://gallery.gczhouwld.com/) 查看新排序。
