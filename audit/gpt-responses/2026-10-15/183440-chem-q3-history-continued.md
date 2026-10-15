# 2026-10-15 | 18:34 Beijing | 历史回溯：Chem 日期核验、恢复合法发布快照、季度 staging 复算

Conversation/task context: project 抓取有机合成文献并持续更新网页; 用户要求“继续历史回溯，先承接全部记忆”，续做 PR #686/#687/#688/#691、出版社首次在线日期、16刊 2026 Q3 审核。下文保存本轮可见答复的完整技术结论；本轮细节亦写入 Issue #498 #issuecomment-6190037523。所有发布规则均按 main/固定北京时间08:00唯一正式新增，不新增18:00任务。

## 一、已核实阻塞的根本原因

重新连接 GitHub，检查四个 PR 和 Actions 失败日志。#686 的 5 项专项 CI 通过、#687 的 4 项专项 CI 通过、#691 的 4 项专项 CI 通过，三个历史 PR 同时被站点质量门禁挡住；#688 专项站点质量先已成功，但 Chromium 320px 手机分页鼠标按下回归失败。

三个历史 PR 同一个未授权冻结数据 SHA 冲突：`public/rolling-supplement.json` 在旧 main 上 SHA `28f3238f45b380855f68fc7ab79da03ba4c9f181`，但 `audit/publication-release-state.json` 授权 SHA `f0e4b18a3be71e52fb07e84e291f51f652cd03ae`。不得关闭/绕过门禁或以历史 PR 改写受保护正式文献。

## 二、受保护数据合法修复

只重跑 #688 失败的 Chromium job `116343873077` 后，Chromium、WebKit 都成功，Site gate 成功。已把 #688 合并为 `a44c01e4f3a9cb1f2a91906ef378fe0782956485`（https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/688），重新读取 main 的 `public/rolling-supplement.json` SHA 为合法的 `f0e4b18a3be71e52fb07e84e291f51f652cd03ae`。本修复不新增正式文献、不开放额外发布时段，保留1,151 DOI冻结数据和出版社跳转、日期显示修复。

## 三、原 Q3 季度基线

从 `staging/historical-archive-nightly` 回读原配对文件：
- `audit/historical-staging/quarter-2026-q3-coverage.json` blob `9e27b052b72c685b44466bbfce838445b583aeec`。
- `audit/historical-staging/quarter-2026-q3-review-worklist.json` blob `e0385af2793be11c4ecdc4cc224d5aeeab510a23`。
- 两份文件的 generatedAt 均为 `2026-10-15T03:59:10.506Z`（北京时间11:59:10），16刊192/192元数据根、12,286个唯一来源DOI、851正式Q3、11,275未完成；94/Research季度目录闭环尚未证明（真实旧值为82个非原创；下文新统计为94）。

## 四、Chem 四篇真实日期与科学范围分账

直接对照 ScienceDirect 官方 Article 记录（原始源 DOI 保留）：
- `10.1016/j.chempr.2026.102966` = 2026-03-30, Q1，非Q3。
- `10.1016/j.chempr.2026.103034` = 2026-04-20, Q2。
- `10.1016/j.chempr.2026.103026` = 2026-04-17, Q2。
- `10.1016/j.chempr.2026.103242` = 2026-09-09, Q3。

PIDA `103242` 从碘苯制PhI(OAc)2，官方原文 Results 有优化**批式**约96%产率，不应未经核实称为独立分离收率；连续流实际1.4 kg/7h、约99% FE、电流密度44.4 mA/cm²和36吨/年**设计/技术经济容量**属于不同指标。缺乏可证实跨底物普适性时保持单篇SCIENCE evidence-pending，不把日期通过变成学术准入。证据：https://www.sciencedirect.com/science/article/pii/S2451929426003086 ，以及另外三篇官方ScienceDirect PII；详情见 #691 和本轮 Issue #498 留档。

## 五、PR #691 正式合并

经5/5 CI 通过、带head SHA lease合并为 `d233fee83e8dba257c99b75661de97aeedff64bf`，正式代码保留出版社在线日和独立科学范围审计。PR https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/691 。日期证据入 main 不等于已重新计算季度 staging，亦不代表文献上线。

## 六、PR #686 正式合并

正式树不变的验证提交 `237228cfec6bc227281b47c60a06010bae937cd4` 触发 CI，通过后合并 PR #686 为 `39d7edb3f06910cfa29ae8bacf3fdebfa3be06c8`。Chem `103146` 和 `103219` 官方都是 Preview，源头原始研究 DOI 分别保留，不能把评论变成另篇原创实验方法。

## 七、PR #687 正式合并

修复确认后重跑旧 #687 全套 5 组 CI；在 #687 上追加实质集成提交 `7820145b927fa8d0d64388ea8d8b0a8187c242b5`，使 `runQuarterAudit` 读取#691新增四篇 Chem 真实首发日期、PIDA科学证据待核，与NIPU `103145` 原有真实日期 2026-07-08 和科学范围待核一起核验。5/5 CI（含完整站点Playwright、历史研究核对、PDF与TM）成功，合并主分支 `fe6316a7204a3f5510ba7d0b466663bb68af9835`，PR https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/687 。其中 PIDA 和 NIPU 都没有被批准自动收录。

## 八、真实的新版季度审计

更新唯一既有 staging-only Q3 triage 触发文件，正式 commit `d7a45d145166f37f41ff8e8840bc2b91f4dc3ba0`；GitHub 真实运行 `38720889816`：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38720889816 SUCCESS。

读取 staging 两份生成时间完全一致：
- `audit/historical-staging/quarter-2026-q3-coverage.json`, Git blob `9e0e0b1d47380197cd2d7d3d50690af3c2ecb3ef`.
- `audit/historical-staging/quarter-2026-q3-review-worklist.json`, Git blob `a1c1d642d5c0eab93de0df273f542a47720f0a98`.
- generatedAt=`2026-10-15T10:31:58.924Z`，北京时间18:31:58。

新旧值：
- 来源DOI 12,286→12,286；192/192根完成。
- 正式Q3 851→851；正式全站仍1,151文献；已审待唯一08发布6→8。
- 未完成候选 11,275→11,254（减少21）。
- 非原创学术类型审定82→94；科学范围排除49→49；独立学术范围待核5→8。
- 出版社日期差异11→20；首次在线已证实不属于Q3者5→9。
- 旧正规 manifest date-pending 2 不变，科学待核单列。
- 这些是两个快照间合计差异；期间 main 有其他并行更新，不可把全部计数变化归功于这几个 PR。
- `publisherIssueResearchReconciliationComplete=false`：完整16刊 Research 出版社目录和首次在线日期仍待核，不能把候选来源等同于应收录论文或凑1000篇配额。
- 新队列记录 Chem `103162`、`103145`、`103242` 为独立科学范围待核；日付正确且未自动include。

## 九、下一批仅完成只读识别的候选

- Chem `10.1016/j.chempr.2026.103244` 官方ScienceDirect PII `S2451929426003104` 是 Review article；`10.1016/j.chempr.2026.103254` PII `S2451929426003207` 为 Perspective，两者从同一Q3冻结元数据根 `2026-09-22_2026-09-30_chem` 检索，source SHA256 `a4d0fc7868cd95b14a923cefff8f1ab6c376d60c99247418957ef4df586a3b2d`，原review shard Git blob `2b27bf95e5d71bc7f530d301e211efc79c3aeb24`。冻结来源 09-24 和09-25不可冒充出版社在线首发。只读分类不等于双遍审核入账；不得预先从11,254个候选中扣除。
- Chem `10.1016/j.chempr.2026.103199` 属原创 Article，但摘要重点为operando单量子点光致发光及催化剂动力学，涉及C–C偶联和C(sp3)–H溴化案例；仍需特定方法学贡献证据二次审核，不进行标题关键词自动排除。
- 下轮仍优先16刊官方Research逐期目录/DOI逐篇补缺、首先在线真实性及科学方法学证据，不更改历史仅08发布、不得Today/Hot/公众号混入，不自行下载受限PDF/SI或操作D1。

相关证据已经同步至 Issue #498 https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6190037523。本回复记录本身是永久的Git留痕，不包含密钥或隐私内容。