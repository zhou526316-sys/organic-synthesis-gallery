本轮我先按你规定的顺序完成了“仓库对齐 → 回忆对齐 → 当日复审”，没有直接实施任何架构变更。

当前 main 是 **e965ebd1b4fddc80791ab67469f7d0e807cf6dcb**。相对上一轮日审使用的 **f37f59ae72fdc5008a5b67fd2e4ba82efdda90fa**，main 已向前 **65 个 commit**。我重新读取了 PROJECT_RULES.md、docs/literature-update-protocol.md、18:00 release marker、latest/unresolved audit、GitHub Actions 运行状态、TOC demand、Tampermonkey、Pages 构建、D1 schema、用户状态、统计、Evidence/摘要契约和相关 Worker 实现；然后再与上一版结论核对。上一版的核心原则——三个月热区不物理搬 DOI、Canonical 单一事实源、Hot/Archive 只是派生视图、媒体与摘要独立于文献发布、Pages 只应承担热媒体、D1 动态功能可降级——仍然成立。

## 先说今天最重要的新结论

**现在最需要再拆开的，不只是 PublishedGeneration 和 ReviewClosure，而是 PreparedGeneration、DeployedGeneration、VerifiedGeneration 三个状态。**

今天 18:00 的真实运行刚好暴露了这个问题：固定槽 release writer 已成功，仓库中的 release marker 已经是 **627 张卡片**，本轮 3 篇 accepted、2 篇 deferred；18:11 的 post-release audit 也成功，当前 unresolved 正好就是这两个 deferred DOI，critical source failure、source-family gap、coverage anomaly 都是 0。

但是 18:12 的 quality gate 明确失败，日志里的实际原因是：

**deployed DOI count 624 != expected 627**

而且当前还没有对应 18:00 槽位的成功 Pages 部署和 finalization；audit/release-finalization-result.json 仍然停留在 08:00 那一版的 **624 张**。

所以现在不能把“仓库里已经写入 627”理解为“线上已经验证发布 627”。

这比昨天的抽象讨论更有价值，因为它证明长期控制面应该正式存在三个指针：

PreparedGeneration = 已经在仓库生成并通过预发布验证；

DeployedGeneration = 已经进入静态部署产物；

VerifiedGeneration = 已经经过线上数量、DOI 集、质量门禁核验。

**用户端和运维判断“当前正式版本”时，只认 VerifiedGeneration。** 如果后两步失败，PreparedGeneration 可以留在仓库等待恢复，但不能污染“当前正式线上版本”的定义。

这也意味着我今天会把昨天的“PublishedGeneration”进一步拆细，不再用一个 status 承担所有发布语义。

## 当前仓库相较上一轮的关键变化

| 项目 | 当前状态 | 对长期架构的意义 |
|---|---:|---|
| main | e965ebd… | 相比上一轮 +65 commits |
| 仓库 release marker | 627 张 | 18:00 数据写入已完成 |
| 最后已验证线上数量 | 624 张 | 18:00 quality gate 发现部署仍是旧 generation |
| post-release unresolved | 2 | 恰好等于两个正式 deferred DOI |
| Tampermonkey Controller | 2.2.37 | “一次 DOI 访问同时补 TOC/正文图/Evidence”方向进一步成熟 |
| visible TOC gap | 67 | 比前几轮继续下降 |
| missing official TOC | 167 | 其中 100 篇已有 fallback、只是待升级官方图 |
| local captures | 533 | 大量媒体已经存在于另一条资产链 |
| Worker figureGapTotal | 627 | Worker inventory 仍认为所有 DOI 都没有可用正文图 |
| scheduled summaries | 163 篇，约 208 KB | 单文件开始显现长期线性增长特征 |
| Git repo size | 104,352 KB | 仍远低于平台边界，但 full-history checkout 成本会持续存在 |
| audit 当前树 | 约 250.2 MB | 主要仍是历史媒体证据 |
| audit 二进制 | 约 243.5 MB | 相比上一轮 **0 增长**，说明“止住新增二进制”目前有效 |
| 最近一次成功 Pages build job | 约 3 分 15 秒 | Vite 构建仅约 7 秒，主要时间消耗其实在媒体合并/验证 |

最后一行很重要。最近一次成功 Pages build 中，“Merge D1-free local VPN captures”约 52 秒，“Validate and atomically merge completed TOC plus body packets”约 79 秒，而真正 npm build 只有约 7 秒。也就是说：

**未来真正会把 Pages 构建拖到超时的，更可能是全历史媒体处理，而不是文献 JSON 或前端 TypeScript。**

GitHub 当前仍建议 Pages 源仓库控制在约 1 GB，已发布站点不能超过 1 GB，部署超过 10 分钟会超时。citeturn983588search2turn983588search3

## 今天需要修正昨天的第二个观点：三个月不是“所有后台工作的绝对上界”

昨天我把“三个月”进一步推广成默认 Active Work 上界，这个方向对媒体、正文 Evidence、摘要和普通补图是正确的，但今天重新对照 literature-update-protocol 后需要加一个非常重要的例外：

**语义审核 pending、范围纠错和晚入库候选，不能因为论文已经进入 Archive 就自动冻结。**

协议已经明确要求 durable pending backlog 即使移出 rolling window 也必须继续带入后续审核。因此三个月应该约束：

前端 Hot 展示；

普通媒体抓取；

普通 Evidence 补全；

普通摘要升级；

常规媒体质量升级。

但不约束：

尚未做出最终 include/exclude 的 semantic pending；

已登记的 scope correction/recheck；

按 late-deposit rescue 发现、但发表日期已经较老的真实新候选。

所以最终后台资格应拆成至少这几类：

hot-default；

archive-recent-addition；

archive-repair；

semantic-pending；

scope-correction；

frozen。

其中 semantic-pending 和 scope-correction 是年龄豁免项，直到真正闭合。

## 三个月边界本身也要定义得更严谨

今天是 2026-09-27，北京时间按自然月倒推三个月，Hot cutoff 是 **2026-06-27**。现有正式基线从 2026-07-01 开始，所以目前全部 627 个仓库记录仍处于 Hot 范围；第一批 2026-07-01 文献仍然应该在 2026-10-01 当天属于 Hot，并在 **2026-10-02** 第一次进入 Archive。

我建议以后不要让浏览器自己用 JavaScript Date.setMonth 去算这个边界，因为 31 日、2 月、夏令时/本地时区都可能制造边界歧义。更稳的是在每次 Literature Generation 中直接生成：

hotCutoff；

每篇记录的 hotThrough；

generationDateAsiaShanghai。

hotThrough 使用“firstOnlineDate + 3 calendar months，含到期日”的 LocalDate 语义；遇到目标月份没有对应日期时，明确钳到该月最后一天。浏览器只读 manifest，不自行推导。

这样上海、美国、欧洲客户端和电脑时钟异常都不会产生不同 Archive 结果。

## 文献事实源：今天进一步收敛为“构建时 Canonical”，而不是“浏览器端合并”

当前前端仍然会读取 papers.gz.b64、total-synthesis、manual、final-audit，再从 Worker supplement 补一遍，然后在浏览器里 merge。

这在 627 篇时没有性能问题，但长期最大的问题不是速度，而是**同一 DOI 的事实可能同时存在于多个输入面**。

因此我现在更明确建议：

正式迁移完成后，浏览器不要再承担 Canonical merge。

08:00 / 18:00 的 release pipeline 在构建时把现有权威输入统一 materialize 成一个 Canonical Catalog Generation；浏览器只读取这个 generation。

每个月 shard 是 content-addressed、不可变的。历史纠错只生成一个新的该月 shard hash，并让新 manifest 指向它；旧 shard 保留用于回滚/审计。

三个月 Hot View 只加载覆盖 cutoff 的最多四个日历月 shard，并按 hotCutoff 过滤。Archive 打开某个月时才加载对应 shard。

这仍然不要求现在立刻废弃现有生产输入。最安全的第一阶段仍然是 Shadow Canonical：让它与当前 627 DOI、标题、作者、日期、中文标题、分类做逐字段一致性验证，连续稳定后才切读取路径。

## 今天发现 Asset Catalog 的优先级比 Archive UI 更高

当前媒体状态给出了一个非常清楚的异常：

live queue 知道有 **533 个 local capture**，静态 media index 有 **555 个 media record**，但 Worker media inventory 对 627 个 DOI 的 figureCount 全部仍然是 0，因此 figureGapTotal = zeroFigureGapTotal = 627。

这并不意味着网页上 627 篇真的都没有正文图。真正含义是：

**Local Capture / Pages 静态媒体 / D1 Worker Inventory 还不是同一个资产事实源。**

所以在真正启用 Archive 冻结规则之前，必须先把 Asset Catalog 统一。否则系统可能把“实际上已经有图的历史论文”误判成长期缺图，也可能在归档前无意义重复抓取。

最终应该是：

Asset Catalog 回答“这个 DOI 已经有什么资产”；

Active Work Index 回答“这个 DOI 下一步还缺什么”。

所有通过审核并正式发布的 local capture，都最终登记到统一 Asset Catalog；Pages 的 media-index.json 只是某个 generation 的静态 snapshot，不再是另一套事实源。

媒体对象本身继续适合放 R2。Cloudflare 当前 R2 单 bucket 的存储容量和对象数量均不设总量上限，更适合长期保存 Archive thumbnail、preview、master、正文图和 Evidence。citeturn983588search1

## Tampermonkey：我现在建议把 media_jobs 最终升级成 Acquisition Job

当前 Controller 已经到 2.2.37，而且一次页面访问会越来越多地同时处理 TOC、正文图和 Evidence；但 D1 的 media_jobs schema 仍然主要描述视觉媒体，并且 claim 条件仍只有 mode、state、next_retry_at、priority，没有 firstOnlineDate、hotThrough 或 lifecycle eligibility。

因此最终更自然的抽象不是“TOC job”“Figure job”“Evidence job”，而是：

**一个 DOI = 一个 Acquisition Envelope。**

它至少知道 publisher、firstOnlineDate、hotThrough、needsToc、needsFigures、needsEvidence、priority、reactivateUntil、失败状态与 lease。

调度器只决定“下一篇打开哪个 DOI”。文章已经打开后，只要当前出版社页面允许，就一次补齐所有仍缺的层。

Archive 普通记录因为 hotThrough 已经过期，自然不再参与 claim；晚发现旧文献可以临时给 reactivateUntil；人工修复同理；归档前 7 天可以提高一次 retirement-drain 优先级。

这样不需要每天批量把数千条 job 状态 UPDATE 成 archive_hold。

## 摘要体系今天出现了两个需要提前解决的规模问题

当前 public/scheduled-article-summaries.json 已经有 **163 篇，约 208 KB**。继续单文件线性增长，在几万篇时一定会变成第二个 archive.json。

更重要的是，当前 Evidence inventory、pending scheduled handoff 和 handoff backfill 都使用 R2 list，并且代码显式只循环：

**最多 10 页 × 每页 1000 个对象。**

也就是说，Evidence/Handoff prefix 一旦超过约 **10,000 个对象**，当前“全量 backlog 发现”就存在截断风险。

这是今天新增确认的一个真正的长期硬问题。

所以长期不应继续用“扫描整个 R2 prefix”发现待审核项，而应建立一个很小的 D1/R2 Active Evidence Index，例如只记录 DOI、evidencePacketHash、capturedAt、summaryState、lifecycleClass、updatedAt，并针对 pending + capturedAt 建索引。

R2 负责存不可变 Evidence/Handoff 字节；

Active Index 负责告诉 12:00 日审“今天真正需要处理哪些 DOI”。

已经有摘要或已经 frozen Archive 的 Evidence 不再参与日常扫描，但仍可按 DOI 直接读取。

scheduled summaries 也建议在第一次真实 Archive 开始后，逐步从单大文件转为按月 shard；Hot 区仍可以维持一个小的当前索引，Archive 点击摘要时按需读取对应月。

## Search：今天建议再分成“元数据搜索”和“深度摘要搜索”

默认全局 Search Index 只放 DOI、英文/中文标题、作者、期刊、日期、类型和 shardRef。

Hot 搜索直接在已加载 Hot metadata 上完成；Archive 搜索通过 Web Worker 读取 content-addressed 的年份或月份 segment。

精确 DOI 搜索可以额外维护一个极小的 DOI → shardRef 索引，这样不必为了找一个 DOI 加载全部历史全文索引。

如果以后要让用户搜“反应条件、机理、限制”等摘要内容，不要把摘要全文塞进默认搜索索引。单独建立 Deep Summary Search，只有用户明确选择深度搜索时才加载。

这样普通文献追踪界面不会被摘要体量拖重。

## Pages 构建：今天的结论更明确了

现在 merge-worker-media.mjs 仍然先得到 ALL GALLERY DOI，再逐批调用 /api/media/batch，然后下载所有能找到的 TOC、primary visual 和正文图进入 media-mirror。

因此即使前端明天已经完美切成“三个月 Hot + Archive”，Pages 构建仍会随着全历史媒体线性增长。

最终 Pages 只应该处理：

Hot 三个月需要的 thumbnail/preview；

必要的当前 share asset；

明确请求的 Archive repair/share asset；

前端、metadata、search manifest。

Archive master、Archive body figures、Evidence 和历史高清图不应再参加每次 Pages 构建。

当前成功 build job 大约 3 分 15 秒，距离 GitHub 的 10 分钟超时还很远，但其中真正 Vite build 只有约 7 秒；绝大多数增长风险都在媒体处理链。因此 Hot-only media 比单纯继续优化前端 bundler 更重要。

## D1、用户状态和统计：上一版判断仍成立

user_library_state 仍然是“一个用户 = 一个 state_json”，Worker 仍设 MAX_LIBRARY_STATE_BYTES = 1,500,000。现在 merge 已经有 per-paper updatedAt，冲突处理比早期好，但根本问题仍然存在：改一篇文献状态会同步整份库。

长期仍应拆为 row-per-DOI 的 user_paper_state；账户偏好、自定义状态定义等留在单独 account settings。

Analytics 也仍然会直接扫描 site_pageviews_v1 做 COUNT(*)、COUNT(DISTINCT ip_hash) 和 EXISTS。Cloudflare 当前 Workers Free 的 D1 单数据库上限仍为 500 MB，Free 额度是每天 500 万 rows read、10 万 rows written；并且 2026-09-01 起这些每日额度已经实际执行，超出后查询会失败直到 UTC 午夜重置。citeturn983588search0turn983588search5turn983588search8

所以 site_global_stats、site_daily_stats、site_visitors、daily_referrers、daily_devices 等物化统计仍然应该做，raw pageview 只保留有限周期。

## Audit/Git：今天不再建议优先做 history rewrite

当前 audit 树约 250.2 MB，其中二进制约 243.5 MB；但和上一轮基线相比，media-recovery、body-batches/assets、audit binary **一个字节都没有继续增长**。

这说明当前最重要的“不要再往 Git 放新的媒体审核原始字节”已经至少在这一时间段内成立。

所以正确顺序仍然是：

先持续阻止新增 binary；

再让 Pages authorization 不依赖 fetch-depth:0；

最后才评估历史 rewrite 是否值得。

现在直接改写 Git 历史风险大、收益还不是最高优先级。

## 今天新增确认的失败模式

当前体系最值得防的不是单纯“数据太多”，而是几种状态面彼此失真：仓库 generation 已经前进但线上 generation 未前进；local capture 已有资产但 Worker inventory 仍判缺失；Evidence 已经存在但日常发现依赖有限页数的 R2 prefix 扫描；旧论文离开 Hot 后如果没有 late-addition/semantic-pending 例外，会被错误冻结；摘要如果保持单文件，会把 Archive 增长重新带回每次部署；Pages 如果继续处理 ALL GALLERY DOI，即使 UI 已经归档，构建仍然线性变重。

因此“规模化”的真正目标不是简单拆文件，而是保证：

**任何一个日常操作的成本都只随 Hot/Active Set 增长，而不是随 All-Time Dataset 增长。**

只有全库搜索、明确历史月份访问、历史纠错这几类行为才允许按需碰 Archive。

## 我现在推荐锁定的最终结构

1. **Canonical Literature Catalog**：按月 content-addressed shard；浏览器不再 merge 多套生产输入。Literature manifest 保存 hotCutoff、record count、DOI-set hash 和 shard hashes。

2. **Release Ledger**：明确 PreparedGeneration、DeployedGeneration、VerifiedGeneration、ReviewClosure；用户端正式版本只认最后一个 VerifiedGeneration。当前 627/624 的真实错位就是这个设计的直接依据。

3. **Lifecycle Layer**：Hot/Archive 只由 firstOnlineDate + 三个 calendar months 决定；不移动 DOI。另有 archive-recent-addition、archive-repair、semantic-pending、scope-correction 等后台资格。

4. **Unified Asset Catalog**：TOC、primary visual、正文图、Evidence、reviewed summary 都通过 DOI + hash + provenance 登记；Pages media-index 只是 snapshot。

5. **Active Acquisition Index**：Tampermonkey 按 DOI lease；一次 publisher visit 尽量补完 TOC + figures + Evidence。普通 Archive 不再进入主动队列。

6. **Derived Content**：Search Index 与 Literature Generation 同步分段；Summary Generation 独立 12:00 原子发布；Archive summaries 分月，Evidence backlog 由显式 active index 驱动。

7. **Static/Dynamic 分层**：GitHub Pages 保证文献 metadata、Hot 浏览和搜索的基本可用；R2 保存长期媒体/Evidence；D1 做小而有索引的动态状态。D1/R2 故障不能让核心文献库整体不可用。

8. **User/Analytics 分层**：用户文献状态最终 row-per-DOI；Analytics 物化汇总，不再用 raw event 全表统计。

9. **Audit Layer**：轻量 JSON/Markdown/provenance 可以继续 Git；媒体原始字节预算为 0；等 release authorization 去掉 full-history checkout 后，再决定是否重写旧历史。

## 内部性能预算我建议保持这些线

Hot metadata 压缩后目标低于约 2 MB；单 Archive shard 目标低于约 1–2 MB，超过就再分片；单 Search segment 目标低于约 5 MB；真实 Card DOM 控制约 60–100；首屏 eager TOC 控制约 12–24，其余接近视口才设置 src；普通 Pages build 不读取 Archive 正文媒体；日常 R2 backlog discovery 不允许全 prefix 扫描，目标只查询 active index；Git audit 新增 PNG/WebP/SVG/PDF 原始字节预算为 0；Pages build 目标低于 5 分钟，超过 7 分钟预警、超过 9 分钟进入强制治理；普通用户请求不允许对不断增长的 event table 做无界全表扫描。

这些都是我们自己的内部预算，不是平台极限。平台真正的 Pages 硬边界仍远高于当前规模。citeturn983588search2

## 实施优先级今天也有一个调整

如果以后你批准实施，我现在会先做 **Shadow Canonical + Release Ledger**，因为今天已经实际出现 627 repository / 624 deployed 的状态错位；随后做 **Unified Asset Catalog**，先解决 figure inventory 与已发布媒体事实不一致；第三步做 **Active Acquisition / Evidence Index**，消灭全历史队列和 10k R2 扫描上限；然后才切 Hot/Archive 前端、summary/search 分片和 Pages Hot-only media；用户状态和 Analytics 拆分可以稍后，但不能等碰到 D1 配额才做。

第一批 7 月 1 日论文要到 **2026-10-02** 才真正离开三个月 Hot，所以目前仍有一个很好的影子验证窗口。

今天相较上一版最关键的一句话是：

**三个月应该限定“默认可见集和默认主动维护集”，但不能冻结未闭合的语义审核；同时正式发布必须从“仓库里写了什么”升级为“Prepared → Deployed → Verified”的显式代际状态机。**

本轮没有修改生产文献、生产架构、媒体队列、摘要内容或部署逻辑；只进行了读取、对齐和架构复审。