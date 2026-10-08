Beijing time: 2026-10-08 12:40:08
Conversation: user reports Science Advances 10.1126/sciadv.aed4187 publication date is 2026-10-07 (not 10-09), approves correction next authorized 08:00 slot; then asks to prioritize card display for all papers admitted on the same day.

Approved publisher date correction: next valid fixed-slot 08:00 only, expected 10-09 -> verified 10-07, preserve addedDate=2026-10-08. No immediate production metadata edit permitted by existing deletion-only exception.
PR #408 (open during this checkpoint): fix/approved-sciadv-publisher-date-next-slot; staged audit/approved-publication-date-corrections.json and scripts/lib/approved-publication-date-corrections.mjs, integration into scripts/apply-fixed-slot-literature-release.mjs, isolated tests and site quality gate. Dates remain unchanged in main. Earliest slot=2026-10-09T08:00:00+08:00. Unit tests 6/6 passed via Frontend build and typecheck; full browser regression still running. Any metadata conflict is logged and skipped. No new release schedule created.

Display sorting approved by explicit user request: Nature, Science, Nature Catalysis, Nature Synthesis, Nature Chemistry, Nature Communications, Science Advances, JACS, Angew, Chem, ACS Catalysis, others. Group by actual addedDate descending, journal priority within day, online date and DOI tie-breaks; oldest and readers sorts unchanged. The 24-card Hot-head is sorted before slicing.
PR #406 merged to main as 3674039e14ae8462a28c9eaf6301b74ba6e53cf6. Required quality gate success; frontend/typecheck and unit test new-order five cases success; Chromium/WebKit pagination success; mobile/TOC, private PDF, card sharing, data validations success. One unrelated optional paired-media source-string assertion failure remains (existing expectation for github-pages deployment_ref). Pages push run 37728275355 and Worker sync run 37728275404 still running at checkpoint.

User-visible partial final substantially recorded:
同一天上线文献的卡片排序已经修改并合并到 main，对应 PR #406。新的默认顺序为 Nature → Science → 子刊（Nature 系列、Science Advances）→ JACS → Angew → Chem → ACS Catalysis → 其他期刊。排序使用 addedDate（Gallery 实际收录日期）划分每日批次，同批次按期刊优先级排列。首屏数据生成也采用相同规则，避免 Nature、Science 等优先期刊被提前截取到下一页。原有发表日期、TOC 抓取顺序、手动选择‘最早优先’和‘阅读人数最多’的行为不变。代码和相关测试已通过，正式网页部署仍在验收中。
Do not claim date corrected on production until next slot's authorized data+marker release and deployment verification complete.
