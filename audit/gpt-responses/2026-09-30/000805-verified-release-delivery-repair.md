# Organic Synthesis Gallery：已授权文献上线链路修复及真实验收

## 最终结论

用户要求：把更新未正常上线的问题彻底解决。

已修复发布后的部署交接，并完成真实线上验收和自动状态回写。最终验证时间为北京时间 **2026-09-30 00:08:05.748**（UTC 2026-09-29T16:08:05.748Z）；验证对象是 **2026-09-29 18:00** 槽已正式授权的生产集合，不是提前发布9月30日的新文献。

生产集合676篇；本槽16篇纳入项全部存在，46篇排除项及2篇暂缓项均不在生产集合；本槽纳入项中文标题验证通过。构建的完整DOI集合与授权仓库集合逐项一致，实际线上发布清单及10个文件的字节摘要与构建结果一致。

最终 Pages run：**36594801525**，authorization、build、deploy 全部成功；实际HTTP验收、CSS检查及回执保存步骤均成功。实际部署源提交：`6eeae108bc77ad9055443d3f1228af0d1f551826`。

成功回执由 GitHub Actions 自动提交到 main：`daf472c74ae2a0f5f611c4a945b58fa799ff8f18`。重读该提交确认 `phase=synced_with_pending`、`lastWebsiteSync.deployment=success-live-verified`，不是手工把状态改成成功。

## 原故障的可验证事实与诊断边界

初始 main：`70ca079f8680b62969854dfe8d28303270627d8c`。排查开始前，本槽16篇已经正式写入main，生产marker为676篇；不是重新抓取或重新决定这16篇才能解决的问题。

原 writer run `36553009865` 的 release、refresh_toc、deploy_pages / literature_authorization、deploy_pages / build 均成功；`deploy_pages / deploy`（job `109356900114`）失败且没有执行步骤。原调用方分支为 `automation/release-20260929-1800`，并在该上下文中复用Pages工作流。

GitHub官方文档明确，可复用工作流的github上下文属于调用方。checkout main不等于改变工作流运行分支身份。旧交接因此存在确定的分支上下文缺陷；改用main直接部署后成功，支持这一修复方向。本环境未取得原失败作业的两条环境注释全文，不把具体环境拒绝字符串写成已读取事实。

旧state最近完整线上验收记录仍停在9月28日早间，说明交接和验收回写没有可靠闭合。该过时记录本身不等于排查开始时每个浏览器实际显示的文献数，本报告不据此推断当时线上必为633篇。

参考机制：GitHub Docs《Reusing workflow configurations》的github context说明，以及《Events that trigger workflows》的workflow_run默认分支说明。

## 已落地的修复

### 1. 正式文献写入与Pages部署正确交接

已有 `Fixed-slot literature release writer` 继续完成原来的原子文献写入和TOC队列刷新，但不再从automation/release分支身份直接调用Pages。

已有 `Deploy GitHub Pages frontend` 接收writer成功完成的workflow_run事件，在默认main身份下执行。校验上游工作流名称、路径、仓库、分支、事件、结论、提交及槽位；过期槽位不覆盖当前生产。没有新增或改期定时任务，也不依赖机器人push自动再触发push工作流。

### 2. 授权、构建、部署绑定同一真实快照

保留原文献授权门禁、原冻结预审核证据、逐DOI分区及发布槽检查。authorization解析出的提交SHA传递给build和deploy。部署前重读main，核对marker及全部受保护输入，防止已被新发布替代的旧快照覆盖生产。

Pages并发组设置为不取消正常运行。本文献修复没有取消或反复重启同一正常审计。

### 3. 以实际线上内容作为成功条件

新增 `release-delivery.json`，包含来源提交、marker提交/BlobSha、发布槽、完整排序DOI集合及其SHA-256、本槽分区、纳入项中文标题、10个实际发布文件的SHA-256。

构建时校验仓库集合与dist集合完全相等，不仅比较676这个数字；校验纳入项存在、排除和暂缓项不存在；中文标题必须含中文且与授权数据一致。

部署后实际HTTP请求并核验以下文件：`papers.gz.b64`、`total-synthesis.json`、`manual-supplement.json`、`final-audit-supplement.json`、`curated-supplement.json`、`automation-supplement.json`、`rolling-supplement.json`、`literature-supplement.json`、`title-translations-zh.json`、`index.html`。检查发布清单的字节一致性和所有文件的摘要一致性；对传播延迟采用有界重试，不以HTTP 200或构建成功替代内容验收。

验收入口为 `https://gallery.gczhouwld.com/` 和 `https://zhou526316-sys.github.io/organic-synthesis-gallery/`。后者实际重定向至前者；这是两个入口的检查，不是两个独立站点后端。最终两个入口均在第一次检查通过。

### 4. 成功和失败均自动记录，不覆盖并发审核

已有finalization工作流接收Pages结果，验证上游运行ID/尝试次数、来源提交、marker和分区，下载该次实际HTTP验证回执后回写状态。

写前重读main；推送冲突时只重新合并部署结果，保留新的审核记录、运行锁和持久pending。成功才更新lastWebsiteSync；失败保留上次真实成功记录，并归档失败事件，避免再次出现“已提交被当成已上线”。

回执保存在 `audit/deployment-delivery-latest.json` 及按run/attempt命名的不可覆盖档案。本次最终不可变回执为 `audit/deployment-deliveries/36594801525-1.json`。

### 5. 保留正文图工作流对Pages的正常复用

已有正文图工作流也会复用Pages，且继承调用方的workflow_run事件。解析器现已区分“Pages自身收到的writer完成事件”与“媒体调用方事件”，避免把正常媒体更新误判成文献发布请求。增加专门回归测试；原媒体采集、审核和批量策略未修改。

## 实际测试与提交过程

1. 部署-only恢复提交：`2c13b81571ba11477bc4ec39683b9aa44ecffd67`，只追加PAGES_REFRESH，触发run `36591647383`，main部署与CSS检查成功，没有新增文献。
2. 主修复提交：`d055e839d62ce469da46ca9544b23b4c84ee4b26`。首轮run `36593009810` 被旧测试对YAML字段顺序的正则断言阻断，不是生产论文授权失败；其失败回执已由自动链实际保存。
3. 测试兼容修复：`c58df783f19878b8d89b1c041ee250b6c535f030`。改为验证真实作业、依赖、授权命令与失败行为，而非字段必须相邻。保留全部原文献授权测试和生产验证。
4. 首次全量线上验证：run `36593214094`，UTC `2026-09-29T15:55:03.172Z`；bot自动回写提交 `022e90d844a3e6a049b5d520cc34f755753d1ffe`。
5. 最终媒体调用兼容修复：`6eeae108bc77ad9055443d3f1228af0d1f551826`；最终run `36594801525` 中，19项交接/数据/状态测试及14项原授权测试全部通过，共33项，无失败、跳过或取消。authorization job `109496826443` 的实际日志确认测试数量和原冻结审核门禁通过。
6. 最终build job `109496906745` 成功；deploy job `109498864289` 的防旧快照检查、实际部署、线上文献验收、回执保存、CSS检查全部成功。
7. 最终回执artifact：`11045168220`，名称 `pages-delivery-verification`，所属run `36594801525`、attempt1。最终bot回写提交：`daf472c74ae2a0f5f611c4a945b58fa799ff8f18`。

## 最终快照与可追溯证据

- 正式发布marker提交：`b3f5e5570b0ab1dbd5a1b50bcd2da60e95ee3476`。
- marker BlobSha：`bfe2890c4b46fece8c861b6f74c651caa374bf21`，修复前后未变。
- 正式review：`audit/review-2026-09-29-1800.json`，BlobSha `7e2ab8bba13b06a52ad72d5e048ec625520c47d1`。
- staging BlobSha：`8a3f473c024608d5f801c0c4a4396db97c8e61d6`。
- 冻结handoff BlobSha：`60ea88afe46aa1b3bc23cd303a8c72de1297a981`。
- 冻结audit BlobSha：`932512b3d24a1e6ee1093c277b684a4fc72f62f7`。
- 完整DOI集合SHA-256：`2effaa084aa9e4575de5f8fd7ac43a6b59ab55b3d726a07f58ed0565cd1df797`。
- 最终线上回执BlobSha：`e1c3b06d2b601fc46f1dd7db98d74965a08d8ef9`。
- 最终协调state BlobSha：`70f3fada43f99530f73c169e28fbde6d5a288909`。
- TOC队列 `webpageDoiCount=676`；仅验证队列覆盖计数，不把它说成所有676篇均有图片。

从初始main到最终bot回写提交的GitHub compare已读取完整12个变更路径：仅3个工作流、PAGES_REFRESH、2个新增脚本、1个原测试修正、协调state及部署回执。没有生产文献、范围规则、期刊注册表、正式/staging审核、媒体获取代码或媒体政策文件变更。本报告为随后单独追加的审计文件，不改旧树。

## 未改变的边界与不能冒称的结果

这是已授权生产快照的部署修复，不是新的逐篇范围审核。本轮新增文献0、下线文献0，不能把46项排除说成此次删除了46张卡片。

固定07:05/17:05审核及08:00/18:00发布时刻未调整，没有停用既有任务，没有新增替代定时任务；未执行workflow_dispatch。TOC/正文图仍沿用Tampermonkey/VPN Bridge及现有审核链路，没有加入OA提图。构建时既有媒体归并可正常运行，因此不宣称线上所有媒体二进制字节都未变化。

本槽暂缓 `10.1021/acscatal.6c05520`、`10.31635/ccschem.026.202608472` 未发布；越窗历史pending及现有卡片的待补证记录继续保留。`verifiedThrough`仍为`2026-09-20`，`reviewComplete`不因部署成功被改成true。`synced_with_pending`表示合格文献已上线、部分文章证据仍待补充，不表示部署仍未完成。

本次线上证据为GitHub runner实际HTTP响应及内容摘要，不是浏览器DOM截图或用户本机缓存检查。原环境报错注释全文未取得。未提前重放未来固定槽来制造定时成功记录；当前已完成最终代码的真实部署、线上内容验收和自动状态回写，不据此承诺GitHub或网络永不出现未来故障，也不宣称全站发现/范围排查闭合。
