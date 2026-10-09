# Tampermonkey 今日文献抓取范围的进一步核验
日期：2026-10-09 北京时间上午，接续 Tampermonkey 对话的补充回复同步
证据：仓库 main 的 public/toc-demand-live.json，generatedAt=2026-10-09T00:00:22.125Z
只读操作，没有重派发文献任务，没有访问/写入 owner PDF。
实际新增文献 28（addedDate=2026-10-09），按出版社：ACS 19（含 JACS 7、OL 6、JOC 4、ACS Catalysis 2）；Nature 2；Science 1；Wiley 2；Elsevier Chem 2；RSC 2。
08:00 静态正式队列所有 28 篇均在 visibleGaps、allMissingOfficial 中、状态 no_visual。10月1日—8日新增范围还剩13篇 visibleGaps。合并后，2026-10-01 起的准入 no_visual 恰为41篇。队列全站 visibleGaps 为52，其中11篇的 addedDate 在十月一日之前或为空，不属于此 Tampermonkey 新范围，不能用 52 代替 41。
上述是 08:00 生成的静态快照，不代表08:00之后的实时抓取结果；PDF/private库存不应从此 JSON 推断，正文 figureGapTotal=915 也不能当成私有已暂存图缺口，必须交叉核验服务器正确库存。
因此新版正式版不能只凭前夜 13 无 TOC 宣称当日已经补完。后续 owner-VPN 浏览器真实日志需要覆盖新增加的28篇，并以 41 的静态待抓基线计算 TOC 真正减少数量；随真正缺口触发顺带尝试编号正文图、完整HTML、owner授权的PDF，不复访已有安全回执的 DOI。
用户可见结论：今天08:00已发布的28篇在当时快照全部缺主图；10月1日以来当时共41篇缺主图（早先13篇+今日28篇）。正式2.2.73没有被本次审计改动；Chem PR #424仍未上线。
