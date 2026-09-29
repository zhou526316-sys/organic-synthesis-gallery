# Organic Synthesis Gallery — 长期数据生命周期架构日审（2026-09-29）

本轮先按要求完成仓库对齐和上一版架构结论对齐。当前 main 为 48a487ac7e5ba0e73ca4580a46c6f89c519907cb，相对上一轮基线 a1bf7fbe4b4c2ee565337a7fe9a86fe49cead34a 前进 43 个 commit。三个月热区、Canonical 单一事实源、Hot/Archive 不物理搬 DOI、Asset Catalog / Active Work Index、历史媒体入 R2、前端虚拟化、摘要与文献独立 generation 等主方向继续成立。

## 今日新增核心判断

18:00 真实发布链证明：内容快照身份和部署授权 ref 身份必须分开建模。release writer 已成功把 16 篇审核通过文献写入 main，production marker 与 TOC demand 均为 676；reusable Pages workflow 的 literature authorization 和 build 成功，但 deploy 因 github-pages environment 不允许 automation/release-20260929-1800 branch 而失败。当前诊断记录显示线上仍是 660。

因此发布 generation 除了 PREPARED / COMMITTED / DEPLOYED / VERIFIED，还必须显式保存 requestRef、productionCommit、artifactSnapshotCommit、deploymentAuthorizationRef。exact deployment_ref 不等于部署资格。

推荐的未来控制链是：automation release branch 仅提交槽位请求；固定槽 runner 把 release/TOC commit 推到 main；再通过 main-ref 的显式部署入口启动 Pages，并传入 exact toc commit；最后线上验证并 finalization。此处只做架构建议，没有修改 workflow。

## Release Ledger 必须改为 append-only

当前几套 mutable latest 状态已经实际分叉：
- publication-release-state / release-execution：2026-09-29 18:00，676；
- literature-update-state：仍 ready_with_pending，lastWebsiteSync 停在 2026-09-28 08:00 的 633；
- release-finalization-result：仍停在 2026-09-27 18:00 的 627；
- 18:07 诊断中的 live site：660。

因此不再建议继续强化单个 latest status 文件。长期应使用 append-only release event ledger，按 slot 追加 PREPARED、REQUESTED、COMMITTED、DERIVED_READY、DEPLOY_ATTEMPTED、DEPLOYED、VERIFIED，或 DEPLOY_FAILED / EXPIRED / CARRYOVER。每个事件绑定 slot、DOI-set hash、source generation、相关 commit 和前一事件 hash。

只维护可重建的小指针 latestPrepared、latestCommitted、latestDeployed、latestVerified、currentReviewClosure。公开网页和所有公开派生数据只认 latestVerified。literature-update-state 可继续做运行协调兼容层，但不应是完整发布历史的唯一权威。

## 三个月边界进入临界期

2026-09-29 的自然三个月 cutoff 是 2026-06-29。现有正式范围从 2026-07-01 起，因此当前生产记录仍全部属于 Hot；首批 2026-07-01 记录会在 2026-10-02 第一次进入 Archive。

当前 TOC demand summary：676 DOI；当日新增 43；local captures 589；media records 611；visible/no-visual gap 62；official-upgrade backlog 104；Worker figureGapTotal 与 zeroFigureGapTotal 均为 676。no-visual sample 中已有 2026-07-02、07-03 文献，因此 pre-archive drain 已是现实需求。

媒体健康以后不能只看 gap 总数。每次批量新增都会让总 backlog 突增。应按 cohort 监控 freshGap24h/72h、agedGap7d、preArchiveGap、archiveRepairGap、officialUpgradeBacklog、hotCoverageRatio。到 cutoff 时即使仍缺媒体也必须归档，pre-archive drain 只能提供低优先级收尾，不得延长 Hot。

三个月仍只约束默认可见集和默认主动维护集。semantic-pending、scope correction、late-deposit/historical discovery 是年龄豁免项，必须处理到闭合。VisibilityLifecycle 与 WorkEligibility 要分离。

## Asset Catalog 仍是 Archive 前置

589 个 local captures、611 个 media records 与 Worker 仍把 676/676 计为 zero-figure gap 的结果互相矛盾，证明 Local Capture、Pages 静态媒体和 D1 inventory 仍不是同一资产事实源。因此当前 figureGapTotal 不能作为 Archive freeze 或重抓的权威依据。

最终要明确 Unified Asset Catalog 回答“这个 DOI 已有什么”，Active Acquisition Index 回答“下一步还缺什么”。media-index、toc-demand 和 Tampermonkey queue 只做派生快照。

## Tampermonkey 事实修正

上一轮把当前 Controller 说成 2.2.41；当前 main 实际 public/toc-mainline.user.js 为 userscript 6.2.20，CONTROLLER_REVISION=2.2.39，build-bridge-loader 也按 2.2.39 打包。刷新记录表明 2.2.40/2.2.41 曾部署，但 9 月 28 日 23:38 又恢复到 installed Bridge 2.2.39 兼容状态。以后日审必须只以当日 main 为准。

长期仍建议以 DOI Acquisition Envelope 为调度单元，一次 publisher visit 尽量补 TOC、figures、Evidence。Tampermonkey 本机 GM storage 也需要三个月 GC：Hot 留完整 checkpoint/trace，普通 Archive 只留最小 receipt/hash，显式 repair 时再重建。

## Evidence / Summary

scheduled-summary-handoff.js 仍对 Evidence/Handoff R2 prefix 最多扫描 10 页 × 1000 object。超过约 10,000 objects 后，“全 backlog”发现会失真，这是 correctness risk，不只是性能问题。Active Evidence Index 仍应作为正式架构要求；R2 保存 immutable evidence bytes，索引层只保存 active DOI 与 hash/state/lifecycle。

scheduled-article-summaries.json 当前仍是 163 篇、约 208 KB，暂时无压力，但长期仍应按月 content-addressed shard。

## 未被推翻的前端 / Pages / D1 结论

前端仍为 filteredPapers → list.map().join() → gallery.innerHTML；TOC 仍对全部候选创建 eager image 并立即赋 src，只是前 24 个高优先级；正文图才真正使用 IntersectionObserver。因此三个月以内“保持原样”应指 UX 原样，内部仍应窗口化到约 60–100 个真实 card DOM、12–24 个首屏 eager TOC，其余接近视口才请求。

Pages 仍处理全历史媒体且 authorization 使用 fetch-depth:0；长期仍应 Hot-only media，Archive master/body figures/Evidence 留 R2。

user_library_state 仍是单用户一个最多约 1.5MB JSON；长期拆成 per-DOI user_paper_state。Analytics 仍对 raw site_pageviews_v1 做 COUNT / DISTINCT / EXISTS 全历史查询；长期仍要 materialized global/daily stats 和 visitor state。

## Git 审计

当前 repo API size 105226 KB；当前 Git tree 中 audit 约 252.0 MB，audit binary 约 243.5 MB，body-batches/assets 约 213.3 MB / 403 files，gpt-responses 约 0.75 MB，public 当前工作树约 1.36 MB。audit binary 相比上一轮基本没有继续增长，因此仍不建议现在 history rewrite。继续保持新增审核媒体 binary=0，先去掉未来 full-history checkout 依赖，再评估历史重写。

## 今日修正摘要

上一版“Prepared/Deployed/Verified 足够”需要增加 requestRef / deploymentAuthorizationRef；mutable latest status 应升级为 append-only Release Ledger；绝对 media gap 应改成年龄/cohort SLO；当前 controller 应从上一轮所述 2.2.41 修正为当前 main 的 2.2.39；Active Work Index 必须先建立在统一 Asset Catalog 上，否则归档冻结会使用错误资产事实。

## 推荐最终结构

Canonical Literature Catalog 使用 monthly content-addressed shards，Hot/Archive 只做派生视图、DOI 永不搬家。

Release Event Ledger 使用 PREPARED → REQUESTED → COMMITTED → DERIVED_READY → DEPLOYED → VERIFIED 的追加事件，并绑定 slot、DOI-set hash、productionCommit、artifactSnapshotCommit、requestRef、deploymentAuthorizationRef。latestVerified 是公开事实的唯一基线。

Search、Summary、Asset Snapshot 都声明 sourceLiteratureGeneration 和 sourceDoiSetHash。

Unified Asset Catalog 统一 TOC / primary / figures / Evidence / summary provenance；Active Work Index 按 DOI Acquisition Envelope 管 lifecycleClass、needsToc、needsFigures、needsEvidence、priority、reactivateUntil。

Git/Pages 只承载 metadata、manifest、search、Hot 必要静态资产和轻量 audit；R2 承载 Archive media、Evidence、handoff、review binaries；D1 承载 active indexes、user rows、reader counters 和 materialized analytics。

长期目标仍是：日常操作成本只随 Hot/Active Set 增长，而不随 All-Time Dataset 增长。

## 性能预算

Hot metadata gzip 目标 <2MB；单 Archive shard 约 1–2MB；单 Search segment <5MB gzip；真实 Card DOM 约 60–100；首屏 eager TOC 约 12–24；普通 Pages build 不读 Archive body/master；日常 Evidence discovery 禁止全 R2 prefix scan；Git audit 新增媒体原始字节预算 0；普通动态请求禁止无界扫描增长型 raw event 表；Media health 至少拆 fresh / aged / preArchive / upgrade 四类。

如后续获批实施，优先级应为：Shadow Release Ledger + main-origin deployment dispatcher 设计验证 → Shadow Canonical → Unified Asset Catalog + cohort gap metrics → Active Acquisition/Evidence Index + Tampermonkey 本地 GC → Hot/Archive 前端、summary/search 分片、Pages Hot-only media → user state / Analytics 拆分。

今天相较昨天最关键的一句话是：**三个月约束数据生命周期，VerifiedGeneration 约束公开事实，而 Git ref/environment 约束谁有资格把该事实真正部署出去；三者必须完全分离。**

本轮没有修改生产文献、生产架构、媒体队列、摘要内容或部署逻辑，只进行了仓库对齐、上一版回忆对齐和架构复审。
