# Organic Synthesis Gallery — historical literature continuation
- Task: 接续历史文献回溯；独立接管历史文献发现、审查与最终可检索架构。
- Beijing time: 2026-10-10 20:34:15 (Asia/Shanghai)
- Repo: `zhou526316-sys/organic-synthesis-gallery`; main is the sole authoritative production branch.
- Related merges: PR #468 `b27c80d2bd741499ab6662a954bacc0d0348f54f`; PR #492 `e672904760ab21b8a433bdb2d9c0dbc9bd2ad7e1`; PR #495 `f090b9ae208f24e927c48e93785eb20f3543554d`.

## User-visible response — complete material
已承接 Organic Synthesis Gallery 的**历史文献全库回溯任务**，包括此前确定的收录规则、检索目标、夜间抓取架构、历史数据分层，以及 PR #468、#492、#495 的修复工作。

我已重新连接 GitHub 仓库 `zhou526316-sys/organic-synthesis-gallery`，核实了三个 PR 的合并状态。

有一项进展可以先确认：**此前等待上线的 Pages 部署 #38048981114 已于北京时间 10 月 10 日 19:53 成功完成。** 相关的 TOC 队列重建工作流 #38048854371 也已成功完成。这意味着之前“Pages仍在排队”的状态已经过时。但部署成功与正式域名返回最新队列是两项不同的验收，需要继续核对。

### 已恢复的关键状态
- 正式目录：938 篇 DOI。
- 7—9 月队列：733 篇，所有题名字段非空，且全部 `toc_only`。
- 历史扫描窗口：0 个完成。首轮尚未运行。
- 7—9 月仍有 118 篇缺少经确认的官方 TOC，其中 107 篇只有替代图、11 篇无可用主视觉。此前 83 条队列空英文标题已修复。
- 23:40 北京时间“Gallery 历史回溯验收”独立循环定时任务已启用，不必重新创建或重复发起历史抓取。
- 首轮真实抓取将于 2026-10-10 北京时间 23:00 由 GitHub cron 尝试启动；GitHub cron 可延迟，不把首轮 staging 初始化冒充采集成功。
- 历史论文若审核通过必须纳入所有日期 Archive/全库检索，绝不混入每日新增/热门/微信公众号每日上新，正式准入只在每天 08:00 北京时间进行；取消 18:00 的决定继续有效。
- 2026-07-01 之前历史条目只保存元数据、可合法展示摘要和引文，不新增图片/PDF；7—9 月只补真正官方 TOC，不新增正文图/全文/SI/PDF，旧有已核验媒体不得删除或重复下载。10 月份正常新文献沿用各自独立媒体策略。

### 查明的长期工程缺口
从当前 `scripts/historical-nightly-discovery.mjs` 统计：1850–2026 范围按现有日期窗口规划共约 460 个日期分片；16 刊合计约 7,360 个“期刊×日期窗口”。目前 `MAX_UNITS=8` 每晚，在无失败的理想情况下仍约需 920 次夜间运行（约 2.5 年），明显不足以快速建成创刊以来的全库。
当前 staging 故意只记 `abstract.available`，不复制原始摘要文本。候选发现之后还缺少与两遍学术范围审核、标题/作者核对、引用格式、可合法索引的原始摘要、双语同义词扩展搜索、全历史 DOI 去重和 08:00 正式准入互联的完整生产链。只发现 DOI != 已审查、已正式收录、已被搜索到。
Crossref/OpenAlex 分页上限为 10 页×100 条/源/时间窗，旧的宽时间窗口可能遇到分页不完整，必须安全拆分并持久化断点，不能误报已完整。
以上缺口已登记 GitHub Issue #498：https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498 。今晚生产 collector 保留原样，先验收真实来源、DOI、错误、提交分支与保护文件不变的基线，再通过独立小 PR 提升性能与索引能力。

### 分开的实时检索风险
GitHub Actions `Gallery all-time search live acceptance` #38050057174 的纯 API 校验通过，桌面和手机浏览器验收均失败。成功部分为 LMCT、配体到金属电荷转移、手性磷酸等查询各能返回 11 个 D1-index 匹配。对“轴手性”检索时 POST 网络出现多次 net::ERR_FAILED，页面降级 static-segments，45s 超时；不能据此宣称全站复杂搜索或历史文献检索已全部验收通过。它是独立于历史 DOI 候选采集的搜索稳定性问题。
正式站点 `https://gallery.gczhouwld.com/` 的新静态队列本轮未取得成功的直接 HTTP 字节回读（本环境网络/DNS受限），不能把 Main+Pages 证明当作生产域名逐字段验证成功；下一次正常部署/浏览器验收应读回 DOI、生成时间、83 条标题及代表性 TOC。

### 下一次执行与状态边界
今晚 23:00 GitHub Actions `historical-nightly-discovery.yml` 在 staging 分支作候选采集；23:40 启用的独立任务负责读取来源健康、覆盖窗口、候选记录、索引字段、审查缺口及断点并回报（遇延迟/失败不能虚报）。该工作不主动再抓一次、不改变主线 08:00 及已部署媒体、不提前发布历史 DOI。
本次已核实 PR/主线队列/定时任务/第一轮 staging，且创建 Issue #498；未修改正式文献、未触发新的历史采集，也未申称 TOC 118 篇已补完。
