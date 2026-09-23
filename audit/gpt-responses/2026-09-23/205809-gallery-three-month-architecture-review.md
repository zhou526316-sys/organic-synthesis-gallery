Beijing time: 2026-09-23 20:58:09 +08:00
Context: Gallery long-term three-month hot-window architecture review
Related Git commit SHA: c3b697408829e992faed56bfee77e7b87d25e269

是的，这个架构值得先定清楚再动代码。我刚重新检查了当前 main：生产卡片已经到 542 篇，`public/toc-demand-live.json` 约 634 KB，首页目前仍是把筛选结果整体生成 DOM，而 GitHub Pages 构建还会镜像媒体。因此我现在会修正上一版里一个最关键的思路：

**“三个月”应该是展示和运行策略的边界，不应该是文献物理搬家的边界。**

如果每篇论文满三个月后都从“热数据库”搬到“历史数据库”，以后最容易出现的恰恰是边界日期错误、重复 DOI、漏卡片、缓存旧版本、补录文献被放错位置，以及发布失败时两边状态不一致。更稳的设计是：**全站始终只有一个规范化的文献事实源；最近三个月只是由事实源实时派生出来的 Hot View，Archive 也是同一事实源的另一种读取方式。** 文献满三个月时不搬、不复制、不删除，只是下一次发布时不再进入 Hot View。

我现在推荐的最终骨架是：

```text
                 Canonical Literature Store
                 唯一文献事实源
                        │
          ┌─────────────┼──────────────┐
          │             │              │
     Recent Hot View   Archive       Search Index
       ≤ 3个月         分月读取        全历史轻索引
          │             │              │
          └─────── Frontend ───────────┘

媒体另行分层：
Hot media queue → Tampermonkey主动补全
Archive media   → 已有资产永久保留、按需读取、默认停止主动重试

动态功能另行分层：
D1 / Worker → 阅读人数、账户、吐槽、统计
任何动态服务故障都不得阻止文献卡片浏览
```

### 三个月边界要严格定义

我建议全站统一使用北京时间和 first-online date：

`hot = firstOnlineDate >= BeijingToday - 3 calendar months`

这里用“自然月倒推三个月”，不是固定 90 天。2026 年 9 月 23 日的 cutoff 是 2026 年 6 月 23 日，含 6 月 23 日。按你现在文献范围主要从 7 月 1 日开始，当前 542 篇基本都仍属于 Hot；采用这个规则的话，7 月 1 日文献到 10 月 2 日才第一次真正退出 Hot。正好给我们一个很安全的上线观察窗口。

`addedDate` 必须和 `firstOnlineDate` 分开。前者只表示“什么时候被 Gallery 收录”，后者决定生命周期。这样以后发现一篇三个月以前漏掉的文献时，它直接写入对应历史月份，但可以额外进入一个 **“最近补录”** 视图，例如展示 7 天并标“补录”。这个视图只保存 DOI 引用，不复制整篇数据。这样晚入库文献不会悄悄埋进 Archive，也不会因为今天刚发现就错误地重新变成“近三个月文献”。

### 文献数据层：从多份运行时补丁，逐步收敛成一个事实源

你现在生产数据由 `papers.gz.b64`、total/manual/final-audit/curated/automation/rolling 等多份输入合并。这在项目早期很灵活，但长期会增加重复、覆盖顺序和一致性成本。

我不建议现在立刻把发布链全部推倒重写。更安全的是先增加一个“影子 canonical materializer”，把现有生产结果无损地整理成：

```text
data/literature/
  manifest.json
  2026/
    07.<content-hash>.json.gz
    08.<content-hash>.json.gz
    09.<content-hash>.json.gz
```

每篇 DOI 在 canonical 层只能出现一次。现有 08:00 / 18:00 发布机制先继续作为权威写入口，canonical 先做派生产物；等一段时间证明 DOI 集合、数量和字段完全一致，再考虑让 canonical 反过来成为正式生产源。

最关键的是：**Archive 本身不需要另一套数据库。** 月份 shard 就是历史读取单元；Hot View 只是从这些 canonical shard 中选出最近三个月生成一个轻量运行时文件。因此“老化”只改变 manifest，不搬数据。

### 首页三个月“维持原样”，应该理解为体验原样，而不是实现原样

最近三个月仍然保留你现在所有能力：完整卡片、TOC、正文图、全文摘要、中英文标题、阅读人数、收藏、已读状态、期刊/日期筛选、搜索和排序。

但是内部实现应改成窗口化渲染。即使 Hot 以后因为增加期刊涨到 1000–2000 篇，浏览器也只维持大约 60–100 张真实卡片 DOM；滚动时替换窗口。用户视觉和操作不变，但页面复杂度不再和三个月内的文献数量线性增长。

TOC 也应从“全部 slot 扫描后设置图片”改成真正的 IntersectionObserver：首屏少量 TOC 高优先级，其余接近视口才设置 `src`。正文图继续保持按需加载。这样“三个月以内维持原样”不会成为未来性能包袱。

### Archive 的正确形态不是“旧网页”，而是按月读取的静态数据库

历史入口仍可以保持 Gallery 风格，但默认只加载年月目录和当前选择的月份。例如用户打开 2026 年 7 月，只请求 2026/07 的 shard。

历史卡片建议保留标题、作者、期刊、日期、类型、DOI、TOC thumbnail 和用户状态。正文图、全文摘要、高分辨率图和阅读人数都按需取。这样历史库即使以后有 30,000 篇，也不会因为打开 Archive 就创建 30,000 张卡片。

全局搜索必须覆盖 Hot + Archive，但不能靠加载所有历史卡片实现。应生成独立的轻量 search index，仅包含 DOI、英文/中文标题、作者、期刊、日期、类型和必要关键词。默认可以按年份分 shard；有日期过滤时只加载相关 shard。Worker/D1 可以将来作为搜索加速器，但**静态搜索索引必须保留为 fallback**，避免 Cloudflare 故障导致“数据库能看、却搜不到”。

### 媒体层需要比文献层更严格地冷热分离

Hot ≤ 3 个月：Tampermonkey 继续主动抓 TOC、Figure、正文图，允许 retry、upgrade、repair，最新文献优先。

超过三个月：已有 TOC、正文图和高清图都保留，不删除；但自动任务默认停止持续重试。正在处理的任务可以给一个短 grace period 完成，之后未解决项目进入 `archive_hold` 一类状态。只有用户举报、人工请求或后续审核明确要求时才重新激活。

卡片永远优先使用 thumbnail；放大才读取 preview/master。你现在 D1 已经有 `primary_visual_variants` 的 master/thumbnail/preview 设计，这个方向是对的。

这里还有一个比上一版更重要的风险：**GitHub Pages 现在构建时会把 Worker 媒体镜像到静态产物。这个机制不能无限镜像全部历史正文图。** 否则几年后即使首页只展示三个月，Pages 每次发布仍然会复制几万张旧图，构建时间和 artifact 大小照样会爆。

因此长期应该变成：Pages 静态快照只保证 Hot 媒体和必要的 archive thumbnail；历史高分辨率正文图留在 R2 的 content-hash immutable key 下，点击时读取。R2 故障时，历史图片可以暂时不可用，但标题、DOI、搜索和文献卡片必须正常。

同理，当前已经约 634 KB 的 `toc-demand-live.json` 不应该继续承担“全历史注册表”。它长期只应该是 Hot unresolved / active jobs 的兼容导出；真正任务状态由 D1 `media_jobs` 管理。Resolved 且已超过三个月的条目不应该继续塞在实时 demand 文件里。

### D1、用户系统和统计必须永远是“附加层”

文献浏览不能依赖 D1。Worker 或 D1 用完额度时，首页仍应该完整显示三个月文献；只是阅读人数、登录同步、吐槽等动态功能降级。

站点统计必须改为日聚合/物化计数，不能随着 pageview 增长不断执行全表 `COUNT(DISTINCT ...)`。原始 pageview 只保留有限时间，长期保留 daily aggregate。

阅读人数现在已经有 materialized count 表，这是正确方向；Archive 只对当前可见 DOI 批量读取，绝不一次请求整个历史库。

用户收藏/阅读状态长期也应该从单个大 `state_json` 逐步拆成按 `(user_id, doi)` 的行式状态。这样用户有几千篇收藏以后，修改一篇不会重新同步一个巨大 JSON。

### 发布必须采用“内容先写、manifest 最后切换”的原子模型

08:00 / 18:00 固定发布槽不需要改变。每次接受新 DOI 后，理想流程是：先写受影响月份的新 content-hash shard，再生成 Hot View、Search Index、Hot Media Queue 和各自校验值；全部验证通过后，最后一步才更新小型 manifest 指向这些新文件。

这样即使构建在 80% 的地方失败，线上仍然指向上一版完整 manifest，不会出现“一半新数据、一半旧数据”。

发布前至少要验证这些不变量：Canonical DOI 唯一；Hot 与 Archive 不重叠；Hot ∪ Archive 等于 canonical；Hot 中没有早于 cutoff 的文献；最近补录的 DOI 必须真实存在于 canonical；Archive shard 校验和正确；Hot media queue 不得重新塞入普通历史任务；生产 manifest 指向的每个 shard 都已存在。

文件名使用 content hash 后，旧资源可以长期强缓存；修改历史月份时生成新 shard，而不是原地覆盖旧文件。这样缓存问题和回滚都会简单很多。

### 还有一个与“网页崩溃”不同、但长期必须处理的增长点：Git 仓库本身

`audit/review-*.json`、prepublish evidence、机器审计和现在的 GPT response logs 都会持续增长。它们不会直接拖慢用户首页，但几年后会拖慢 checkout、GitHub Actions、clone 和仓库维护。

这个问题不能通过删当前文件简单解决，因为 Git 历史仍保存旧对象。长期应该把 main 保持为“当前协调状态 + 一段活跃审计窗口”，更老的不可变审计按月打包到 GitHub Release、专门 audit archive repo 或其他不可变归档中，main 只保存索引和 SHA。这个涉及现有审计治理规则，我建议单独设计并经你确认后再改，不能顺手动。

### 我建议设置明确的长期性能预算

这些不是 Cloudflare 配额，而是我们自己的 CI 红线。首页真实 DOM 建议始终控制在约 100 张卡片以内；首屏 eager TOC 控制在十几张量级；Archive 默认一次只读一个月；单个 archive shard 如果压缩后明显超过约 1–2 MB，就自动再按半月或期刊拆分；任何 Pages 构建都禁止重新打包“全部历史正文媒体”；site-stats 禁止走全历史原始事件扫描。

这比等页面开始变慢再优化可靠得多，因为 CI 可以在架构退化的第一次提交就阻止它。

### 最终我认为最稳的方案

不是“3 个月后把旧文献搬走”，而是：

**一份 canonical 全历史事实源 + 一个始终只有三个月的完整 Hot View + 分月 Archive + 全局轻量 Search Index + Hot 主动媒体队列 + Archive 冻结媒体 + D1 动态功能可降级。**

这个方案还有一个很大的优点：你以后即使把期刊从现在的十几本扩到几十本，只要三个月 Hot 太大，我们仍然只需要进一步把 Hot 的“数据读取”按月/按块切分；用户看到的三个月完整 Gallery 体验完全不用改变。

我现在明确不建议采用“两套文献数据库之间每天搬家”、一个无限变大的 `archive.json`、首页加载全部历史 metadata 后再隐藏、Pages 每次镜像全部历史正文图、以及三个月一到就删除旧媒体这几种方案。它们短期简单，长期都会成为第二次重构的来源。

我已经按北京时间为接下来 4 天安排了每天一轮架构复审，约在早晨运行。每一版都会专门挑战前一版的失败模式，而不是只换措辞；重点继续检查迟到文献、历史纠错、媒体构建膨胀、搜索规模、审计仓库膨胀和故障降级。在你明确批准最终架构以前，我不会因为这些复审自行改生产架构。
