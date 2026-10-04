# Response synchronization

Beijing time: 2026-10-04 20:15:12 +08:00
Context: Gallery long-term architecture status after user corrected that the 18:00 release is cancelled
Current main: 297a1973d20f60cab5b1b428c16f3caf4bbfc6dd

---

对，已纠正。**当前正式契约是每天只在北京时间 08:00 发布一次，18:00 已取消。** 最新 `main` 顶部协议已经写成单日单槽：06:55 机器审计 → 07:05 语义复核 → 07:35 recovery → 08:00 正式发布。后面所有架构设计我都按这个节奏，不再把 18:00 视为生产槽。

仓库里仍有少量“历史兼容残留”需要清掉：`docs/literature-update-protocol.md` 后半段还保留旧的“08:00 / 18:00”章节，`prepublish-review-gate.yml` 的历史文件匹配仍接受 `0800|1800`，`literature-release-failure-state.yml` 还有“18:00 release”旧提交文案；`audit/literature-update-state.json` 里记录的 2026-10-04 18:00 是历史已发生交付记录，不代表当前调度仍有效。当前 `literature-audit.yml` 已只保留 06:55 晨间审计。

按最新 `main = 297a1973d20f60cab5b1b428c16f3caf4bbfc6dd` 和当前线上状态，整个长期架构现在是下面这个状态：

| 模块 | 当前状态 | 实际情况 |
|---|---|---|
| 单日 08:00 文献发布链 | **已落地** | 当前生产契约已改成单槽；fixed-slot writer、TOC refresh、Pages delivery receipt、finalization/failure state 这套链已经存在。需要做的是清理旧 18:00 文案/兼容代码，而不是再保留双槽。 |
| Canonical Literature Catalog | **已上线，但仍是 shadow read model** | `architecture-v1` 已随 Pages 正式发布并做对象级 SHA256 校验。当前线上 **786 篇 = 763 Hot + 23 Archive**，北京时间 cutoff 为 **2026-07-04**。 |
| 月度/容量分片、DOI Locator、分段 Search | **数据层已落地** | content-addressed shards、locator、search segments、all-time membership、acquisition-basis、title-presentation 都已经在线。 |
| Hot / Archive 生命周期规则 | **计算层已落地** | “北京时间 D−3 个自然月、包含 cutoff 当日”已成为统一规则；但目前 `architecture-v1/current.json` 仍明确是 `productionActivation:false`。 |
| 当前成员/撤下防护、旧缓存 fencing | **代码和验收已落地** | Membership fence、revision fencing、withdrawal sticky、防旧缓存复活、双浏览器显示 parity 都已验证。 |
| 前端真正切到 Hot / Archive | **未落地** | 当前 `src/main.ts` 仍没有消费 `architecture-v1` / `FencedCatalogReader`。因此用户现在看到的主站仍是旧数据读取路径，不是“默认只加载三个月 Hot、历史按需加载”。 |
| Tampermonkey 三个月 Active Work | **未激活** | 当前正式 userscript 仍是 `ARCHITECTURE_MEMBERSHIP_REVISION = ...shadow-v1`，只有 observer，没有 `activeDois` 过滤。全站 registry 仍完整，Archive 尚未真正退出普通新抓取任务。C2b 代码曾完成 staging 验证，但没有切入当前生产 userscript。 |
| C2a/C2a.2 浏览器 membership observer | **已上线** | standalone 6.2.23 / Bridge 2.2.41 已发布，observer/失败诊断已具备；但审计里真实浏览器仍没有形成满足 C2b 的 current-runtime `verified_snapshot` 门禁，所以 C2b 没有被放行。 |
| Unified Asset Catalog D1 | **shadow 已落地，生产消费未落地** | 已能把 Worker/D1、静态 Pages、R2 captured、completeness 分开。最近一次完整 shadow 基线显示：正文图 captured 约 581 DOI、静态 Pages 约 324 DOI；238 已证明完整、117 明确不完整、430 完整度未知。它现在仍是验证/诊断层，没有成为正式 Active Work 真源。 |
| Evidence Index D2a/D2a.1 | **生产 shadow 已落地** | D1 Evidence metadata index 已开启，历史 Evidence 回填曾完成 **560/560** 全量对账；随后新 Evidence dual-write 后生产 shadow 已到 **561 vs legacy 561** 且继续一致。**readPathActive=false**，R2 仍是 Evidence 字节真源。 |
| Summary Candidate Index D2b1/D2b2 | **生产 shadow 已落地** | summary job metadata index、cursor backfill、D1 selector、legacy↔D1 comparator 已上线。生产部署 run `37201045319` 的 migration、backfill、comparison 全部成功。部署脚本要求连续稳定 comparison、candidate-set hash 一致和 preferred DOI 复核。**生产 `runSummaryReviewCycle()` 仍使用旧 R2 `selectReviewCandidate()`，没有切读。** |
| Historical handoff readiness index | **部分落地** | 新 handoff 会 dual-write，但历史 handoff readiness 还没有完成独立全量 backfill，因此还不能把 handoff discovery 切到 D1。 |
| Summary 发现的 10k R2 扫描风险 | **基础设施已解决一半，正式读路径未切** | Evidence/job index 已能避免未来无限前缀扫描，但现有 Evidence inventory、scheduled handoff、summary-review production selector 仍保留旧 R2 扫描，作为当前权威读路径。 |
| 前端图片懒加载 | **已改进** | 当前 TOC/正文图使用 `loading='lazy'`，早期“全部 eager”问题已经改善。 |
| 前端卡片虚拟化 | **未落地** | `renderCards()` 仍然是 `filteredPapers().map(...).join('') -> gallery.innerHTML`，也就是过滤结果多少张就一次性创建多少张真实 DOM；还没有 60–100 卡的 windowed/virtual list。 |
| 新架构 Search 真正接管 UI | **未落地** | Search shards 已在线，但当前搜索仍走旧的前端 papers 集合；历史搜索并没有真正实现“按需加载 shard”。 |
| Pages Hot-only 媒体 | **未落地** | 现有 Pages build 仍继续运行完整静态媒体/正文图合并管线；尚未变成“Pages 只承担 Hot 缩略图/必要分享资产，Archive master/evidence 主要留 R2”。 |
| Summary 月度分片 | **未落地** | 当前摘要仍保留单一 `scheduled-article-summaries.json` 形态；还没有按月 content-addressed summary shard。 |
| 用户收藏/阅读/笔记状态拆表 | **未落地** | 当前仍是 `user_library_state(user_id, state_json, revision...)`，并保留约 1.5 MB 的整块 JSON 上限；还没有转成 row-per-DOI 的 `user_paper_state`。 |
| Analytics 聚合表 | **未落地** | 当前仍向 `site_pageviews_v1` 写原始事件，并在查询时使用 `COUNT(*)`、`COUNT(DISTINCT ip_hash)` 等扫描；还没有 `site_global_stats/site_daily_stats/site_visitors` 这一层物化聚合。 |
| Append-only Release Event Ledger | **未落地** | 当前已经有 release marker、delivery receipt、finalization 和 fail-closed 链，可靠性比以前高很多；但还没有我们设计的 `PREPARED → REQUESTED → COMMITTED → DERIVED_READY → DEPLOYED → VERIFIED` 追加事件账本及 `latestVerified` 派生指针。 |
| Git audit 二进制历史治理 | **尚未完成最终迁移** | 新架构已经尽量不再把生成物作为永久数据湖写进 Git，但历史 audit 二进制债务、review asset 全量迁 R2、是否重写 Git history 仍没有走到最终阶段。 |

所以，如果把整个新架构分成四层，现状可以概括成：

**第一层“事实模型”已经基本完成。** Canonical Catalog、三个月生命周期、all-time membership、Locator/Search shards、Asset Catalog、Evidence Index、Summary Candidate Index 都已经建出来了。

**第二层“影子验证”也完成了大部分。** 786 篇 catalog 已在线；D1 Asset Catalog 跑过真实数据；Evidence Index 已在生产 shadow 全量回填；Summary Candidate Index 也已在生产 shadow 做 parity comparison。

**第三层“真正生产切流”还没有完成，这是现在最关键的缺口。** 目前前端仍读旧 papers，Tampermonkey 仍没有按三个月 active set 派任务，summary candidate 仍由旧 R2 selector 决定，Unified Asset Catalog 仍不驱动抓取。

**第四层“长期规模化治理”大部分还没做。** 用户状态拆表、analytics 物化、Pages Hot-only media、summary shards、DOM virtualization、Release Event Ledger、Git audit 历史治理都在这一层。

接下来最合理的顺序我建议固定为：

1. **先彻底清理所有仍会被误解成 active 的 18:00 旧契约**，所有 carryover 一律指向次日 08:00。
2. **解决 C2b 的真实浏览器门禁并启用三个月 Active Work**，这是“三个月热区”从“会算”变成“真正工作”的关键一步。
3. **把前端切到 architecture-v1**：默认 Hot，Archive 按需；DOI deep-link、收藏、摘要、分享、搜索全部回归后再逐步下掉 legacy papers 聚合读取。
4. **把 Unified Asset Catalog 从 shadow 变成 Active Work 的唯一资产事实输入**，再处理那批“已 captured 但 Pages 未完整展示”的正文图。
5. **Evidence/Summary index 再从 shadow 切读**：先补历史 handoff readiness，连续 parity 为零后，才替换旧 R2 10×1000 扫描。
6. 再做 **用户状态拆表 + analytics 物化**。
7. 最后做 **Pages Hot-only media、summary shards、DOM virtualization、Release Event Ledger、Git audit 历史清理**。

所以现在不是“新架构还没做起来”，而是：**底层事实层和 shadow 验证已经做得比较完整，真正还没完成的是生产切流和最后的规模化治理。**其中最重要的两个未落地点是 **C2b 三个月抓取资格真正启用** 和 **前端真正切到 Hot/Archive reader**。

另外，我已经把你的更正作为当前硬约束：**以后所有架构讨论只认每日 08:00，一个正式发布槽；18:00 不再作为任何未来设计的发布节点。**
