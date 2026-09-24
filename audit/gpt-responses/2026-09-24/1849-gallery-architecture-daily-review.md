我今天重新按“长期运行十年”的标准审了一遍当前 main。结论比昨天更收敛：**三个月热区继续作为硬约束，但不再建议维护独立的 Hot 数据库或把满三个月的论文物理搬家。最终结构应是“一份 Canonical Catalog + 按月内容寻址分片 + 三个月运行视图 + 最近补录覆盖层 + 分段搜索索引 + 两级媒体生命周期”。**

当前仓库已经给出几个很明确的信号。9 月 24 日 18:00 发布后生产卡片已经是 **566 篇**；`toc-demand-live.json` 已约 **640 KB**。首页仍然把全部筛选结果一次性 `map().join()` 写进 `gallery.innerHTML`，虽然媒体请求只取邻近可视区域，但 DOM 本身仍是全量。静态加载也仍然先读整套 baseline/supplements，再叠加 Worker supplement。`toc-demand-live.json` 的 `articles` 目前仍包含整个 Gallery，而 `merge-worker-media.mjs` 会枚举所有 Gallery DOI、从 Worker 拉取全部可用媒体并加入 Pages 构建。也就是说，如果不改，历史数据即使从首页“隐藏”，Pages 构建体积和媒体任务仍会继续跟总库线性增长。fileciteturn54file0L2-L2 fileciteturn55file0L2-L2 fileciteturn57file0L2-L2 fileciteturn66file0L2-L2 fileciteturn68file0L2-L2

今天新增的一个重要风险是 **Git 仓库自身**。GitHub API 当前报告仓库 `size=92315` KB，仓库 9 月 16 日才创建；这个数字不能简单按天线性外推，也不能仅凭它判断具体是哪类历史对象占用，但它已经说明“审计证据、响应日志、频繁生成文件和历史提交”不能再被当作无限容量控制面。GitHub 官方仍建议 Pages 源仓库控制在 1 GB 左右，已发布 Pages 站点上限也是 1 GB，单次部署超过 10 分钟会超时，另有 100 GB/月的软带宽限制。因此，我现在把“仓库/构建体积治理”从昨天的后期事项提升为架构的一等约束。fileciteturn69file0L2-L2 citeturn893151search0

## 今天修正昨天的几个观点

第一，**不再建议额外生成一份完整的 Hot 文献数据文件**。三个月滚动窗口按自然月计算时，任意时刻最多跨越 4 个日历月。因此更干净的方式是：Canonical Catalog 本身按发表月份分片，首页只加载覆盖 cutoff 的 4 个逻辑月份，再按 `firstOnlineDate >= hotCutoff` 过滤。Hot 和 Archive 从一开始就读同一份文献事实，不存在“双份数据同步”。如果某个月以后大到超过预算，再由 manifest 把该月拆成 `2028-05-a / 2028-05-b`，前端无需知道物理拆分细节。

第二，昨天说“历史月份封账”需要更精确。**逻辑月份可以封账，但物理文件不能被认为永远不可修改。** 历史 DOI 仍可能发生范围纠错、标题修正、发表日期修正，甚至从一个月份移动到另一个月份。正确做法是内容寻址版本：`2026/07.<hash>.json.gz`。正常情况下不重建；有历史纠错时生成新的 hash 版本，再由新 manifest 指向它。旧版本不覆盖，天然可回滚。

第三，昨天建议 Archive 保留 Pages 缩略图，这个方向长期仍会累积。今天我更倾向于：**Pages 只保证三个月 Hot 区的必要缩略媒体；Archive 的 thumbnail/preview/master 全部转为 DOI 隔离、内容寻址的 R2 对象。** Archive 文本元数据和搜索仍是静态可用的，所以 R2 故障只让历史图片暂时不可看，不会让历史文献消失。R2 本身允许非常大的对象和对象数量，且标准存储无出站流量费，适合作为长期媒体数据面。citeturn893151search2turn893151search8

第四，昨天提出 `archive_hold` 媒体状态，我现在认为不应靠每天批量改状态实现。当前 `media_jobs` 的领取只看 mode/state/priority/next_retry_at，没有发表日期或冷热资格，因此历史任务会永久参与轮询。更好的模型是给任务增加生命周期资格，例如 `first_online_date`、`lifecycle_tier`、`reactivate_until`，领取条件直接变成“Hot，或显式重新激活的 Archive”。这样跨过三个月边界时不需要大规模状态迁移。fileciteturn64file0L2-L2

第五，昨天说“原始 pageview 保留 30–90 天然后删”还不完整。当前 `siteAnalyticsStats()` 仍会对 `site_pageviews_v1` 做全量 `COUNT(*)/COUNT(DISTINCT)`，并用 `EXISTS` 关联阅读表；虽然今天已经新增了 `paper_open_readers_v3(ip_hash)` 索引，这是正确改进，但统计主体仍然随原始事件增长。若直接删旧 pageview，又会丢失累计 UV。正确方案应先建立 `site_global_stats`、`site_visitors`、`site_daily_stats` 等物化状态，再给原始事件设置保留期。Cloudflare D1 免费层目前是 500 MB/库、每天 500 万 rows read、10 万 rows written；即使以后升级付费，避免全表统计仍是正确架构。fileciteturn58file0L2-L2 fileciteturn62file0L2-L2 citeturn893151search1turn893151search5

第六，用户资料的“大 JSON”问题应比昨天更早处理。当前 `user_library_state` 仍是一个用户一行 JSON，Worker 明确把单份状态限制为 1.5 MB。随着收藏、已读、标签、笔记增长，这会先出现同步冲突和整包读写成本，不一定要等到几万篇以后。因此最终应拆成 `user_paper_state(user_id, doi, ...)`，而账户级配置另表保存。fileciteturn59file0L2-L2 fileciteturn60file0L2-L2

## 推荐的最终数据模型

我现在推荐把文献层固定成以下逻辑：

```text
catalog/current.json                 ← 很小的 generation 指针
catalog/generations/<generation>/manifest.json
catalog/shards/2026/07.<hash>.json.gz
catalog/shards/2026/08.<hash>.json.gz
catalog/shards/2026/09.<hash>.json.gz
...
search/<generation>/2026.idx.gz
search/<generation>/2027.idx.gz
recent-additions/<generation>.json.gz
```

每篇文献只在 Canonical Catalog 中有一个规范记录，至少保存 DOI、英中标题、作者、期刊、`firstOnlineDate`、`addedDate`、类型、article URL、记录 revision 和来源 review 标识。逻辑归属由 `firstOnlineDate` 决定；`addedDate` 永远不影响 Hot/Archive 归属。

“三个月”定义也要固定为**北京时间、自然月减 3 个月、包含 cutoff 当日**。cutoff 不由浏览器各自计算，而由发布 generation 写入 manifest，避免用户电脑时钟和时区造成不同结果。现有 08:00/18:00 固定发布机制可以继续承担 generation 更新；不需要另开一套发布通道。

一个重要的新结论是：**Hot 页面实际上只需加载最多 4 个逻辑月份，不需要独立 Hot 数据库。** 例如 cutoff=2026-07-02 时，只需要 7、8、9、10 月相关 shard，再过滤掉 7 月 1 日。Archive 也读取这些同样的 shard，只是按月份/年份浏览。

## 迟到文献需要独立“最近补录”覆盖层

迟到文献不能破坏三个月规则。假设 12 月才发现一篇 7 月论文：它写入 7 月 canonical shard，直接属于 Archive，绝不因为 `addedDate=12 月` 回到 Hot。但 homepage 可以有一个很小的“最近补录”入口，按 `addedDate` 展示最近 7–14 天新纳入但发表日期较早的 DOI，并明确标注“补录”。这个 feed 只保存 DOI/必要摘要，不复制文献事实。

如果未来修正 `firstOnlineDate` 并跨月，只生成受影响月份的新 hash shard，同时重建搜索索引和 manifest。若确认误收，则从可见 catalog 中移除，但审计层保留 tombstone/纠错记录，防止旧 supplement、缓存或历史 shard 把它重新带回来。

## 搜索应独立于卡片加载

当前数据量还不需要复杂搜索后端，但不能把未来全历史卡片重新加载到浏览器。推荐做静态、generation-versioned 的搜索索引，并放进 Web Worker。初期一个索引即可；达到约 2–5 MB gzip 后按年份拆。搜索结果本身携带 DOI、标题、作者、期刊、日期、类型和 `docRef`，因此用户搜索 10 万篇历史数据时，也不必先加载对应 archive shard；只有展开/打开某条结果时才取真正卡片。

另外，当前浏览器 `resolvedTitleCache`/中文标题 cache 是长期 localStorage 缓存。未来必须让这类缓存带 `catalogGeneration` 或 `recordRevision`；缓存只能补未解析字段，不能覆盖已经审核过的 Canonical 标题，否则历史纠错后某些用户仍可能长期看到旧标题。fileciteturn55file0L2-L2

## 媒体层应彻底分成 Hot 数据面和 Archive 数据面

Hot ≤ 3 months：维持现在的完整体验，TOC、正文图、摘要、阅读人数都可用；但 DOM 要窗口化，图片只在进入视口前设置 `src`。Pages 构建最多镜像 Hot 的必要 thumbnail/preview，不再把全历史正文图重新打进 artifact。

Archive > 3 months：已有媒体不删，R2 永久保留；卡片默认只拉 thumbnail，正文图/高清图点击才取。R2 key 不应只按全局 content hash 去重，考虑到项目已经发生过跨 DOI 媒体污染，建议 key 至少包含 DOI 身份和 content hash，例如 `media/<doi-hash>/<content-hash>.webp`，只在同 DOI 内去重，避免“相同 hash/错误引用”把两个 DOI 再次串起来。

`toc-demand-live.json` 下一代应该只包含 Hot unresolved + Hot upgrade + 显式重新激活的 Archive repair，不再把 `articles: [...papers.values()]` 的全历史表重复塞进去。当前约 640 KB 还不危险，但结构上已经明确是线性增长。Tampermonkey 获取任务则以 D1 `media_jobs` 的 lease 为主，实时 demand 只承担兼容和轻量发现。fileciteturn52file0L2-L2 fileciteturn66file0L2-L2

## D1 必须从“核心依赖”继续降级为“交互增强”

核心规则仍然是：**没有 Worker/D1，文献仍然能浏览、筛选、搜索和打开 DOI；只有阅读人数、账户同步、吐槽和实时统计降级。** 当前静态 snapshot 在 Worker literature supplement 请求失败时仍可继续使用，这一点应保留。fileciteturn57file0L2-L2

如果后续访问量上来，我建议把 analytics 从核心 D1 逻辑上隔离，至少做到独立表和独立接口，最好最终使用独立数据库绑定。统计服务额度耗尽不应该影响账户、用户状态或媒体元数据。`readerStats` 的全表 COUNT 也应像单 DOI reader count 一样做物化汇总。

## GitHub Pages / Git 仓库应设内部预算，而不是等官方上限

官方上限不能作为目标值。建议内部预算先定为：Pages 部署 artifact 目标长期 < 250 MB；部署构建目标 < 5 分钟，超过 7 分钟告警；Archive 正文原图进入 Pages artifact 的数量必须为 0；Hot metadata 总 gzip 目标 < 2 MB，超过则继续分片；单个搜索索引 gzip 超过约 5 MB 就按年份/前缀拆；真实 Card DOM 同时保持约 60–100 张；首屏 eager 图片不超过约 12 张。GitHub 官方 Pages 1 GB/10 分钟应该只作为硬边界。citeturn893151search0

仓库层则要把“控制面”和“大体积历史证据”区分。Canonical 文献 metadata 本身很小，可以继续版本化；真正不适合无限留在 main 的是大量历史审计全文、重复机器快照、媒体二进制和长期响应日志。现有 `PROJECT_RULES.md` 仍要求 GPT 回答写入 `audit/gpt-responses`，所以今天不改变；但长期需要你批准后把较老的完整审计包迁入专门的 audit archive/Release/R2，只在 main 留 index、SHA 和近期活跃窗口。当前仓库已经约 92 MB，这件事不应该拖到接近 1 GB 才处理。

## 原子发布模型也需要再收紧

未来一次发布应先生成所有新 shard、search index、recent-additions 和媒体引用，做完完整验证后才产生新的 generation manifest。对于 R2，先上传内容寻址、不可变对象；对于 Pages，则整包构建成功后一次部署。任何中间步骤失败，旧 generation 仍是线上真相。

发布前至少强制验证这些不变量：Canonical DOI 唯一；所有 docRef 可解析；可见 DOI 与 scope correction 不冲突；Hot cutoff 计算正确；Hot 与 Archive 在同一 generation 下互斥且并集等于可见 Catalog；搜索索引 DOI 集等于 Catalog DOI 集；跨月日期修正后旧 shard 不再被 current manifest 引用；Hot media queue 只能是 Hot DOI 或明确 reactivated archive DOI；任一媒体对象的 DOI 身份必须与引用记录一致。失败即不切换 generation。

## 今天识别出的主要失败模式

| 失败模式 | 如果沿用当前结构 | 新结构处理 |
|---|---|---|
| 满三个月物理迁移中断 | Hot/Archive 重复或丢 DOI | 不迁移，只改变视图 |
| 旧论文迟到收录 | 要么污染 Hot，要么用户看不到 | Archive + 最近补录 feed |
| 历史发表日期改月 | 两边出现重复记录 | 新 hash shard + manifest 原子切换 |
| R2/Worker 故障 | 图片/动态 API 影响整个体验 | 静态 metadata/search 正常，图片降级 |
| D1 统计表膨胀 | 后台全表扫描耗尽 row reads | 物化全局/日统计 + raw TTL |
| Tampermonkey 永久重试旧文献 | 新文献抓取被旧债务淹没 | claim 时按 lifecycle eligibility 过滤 |
| Pages 构建持续镜像全部历史图 | artifact 和构建时间线性增长 | 只镜像 Hot 必要媒体 |
| 浏览器缓存旧标题 | 历史纠错对部分用户不生效 | generation/revision 缓存失效 |
| 用户状态长期增长 | 1.5 MB JSON 上限/合并冲突 | user_paper_state 行级存储 |
| Git 审计历史持续增长 | clone/Actions/维护越来越重 | 老审计包外置，main 留索引和 SHA |

## 我现在推荐的最终结构

```text
Git / Pages：控制面 + Canonical metadata

catalog manifest
    │
    ├── monthly content-addressed shards ──┐
    │                                      ├─ Hot = 最多4个月 shard + cutoff过滤
    │                                      └─ Archive = 按月/年按需读取
    ├── segmented static search index
    └── recent-additions overlay

Media Data Plane
    ├── Hot thumbnail/preview → Pages 可做静态镜像
    └── Archive thumbnail/preview/master/figures → R2 immutable DOI-scoped objects

Dynamic Plane
    ├── D1 Core: auth / user state / reader counters / media metadata
    ├── D1 Analytics: 独立统计域，物化汇总
    └── Worker: 可失效的增强 API

Acquisition Plane
    └── Tampermonkey/VPN → 只 claim Hot + 显式 archive repair
```

和昨天相比，今天最大的进步不是增加了更多组件，而是**减少了重复真相**：不再需要单独 Hot 数据库，不需要物理归档迁移，不需要 Archive 每天改 job state，也不需要 Pages 保留全历史媒体。这样三个月硬边界只决定“哪些数据处于活跃运行层”，而不决定“数据存在哪里”。

如果后续批准实施，我建议第一阶段也不要立即切生产。当前 7 月 1 日起的数据在 **2026 年 10 月 2 日**才会出现第一批真正超过三个月的记录，所以还有一周左右的安全窗口。最稳的是先做 shadow materializer：用当前 566 个生产 DOI 生成 canonical month shards、search index 和模拟 cutoff，连续验证 DOI 集/字段/搜索完全一致；再用未来 cutoff（例如 2026-07-02）演练第一批 Archive，但线上仍保持旧逻辑。只有影子结果稳定后才切前端，然后再切媒体队列和统计。今天仍只做架构审查，没有修改生产架构。