# Gallery 0.2.1 历史正文补抓失败状态与实时上报差距：只读核验

- 北京时间：2026-10-13 08:57:28（Asia/Shanghai）
- 项目：抓取有机合成文献并持续更新网页
- 聊天上下文：历史正文一键补抓 0.2.1 / 用户要求确认失败原因可见性，参考最新 TOC/正文图的逐 DOI 实时服务器诊断
- 仓库：zhou526316-sys/organic-synthesis-gallery，main 为唯一生产基线；只读核验时 main commit 2f251aafe474dbcb53e9e000056753676ff0b039（main 可能继续推进）
- 本轮核查：GitHub main `public/gallery-historical-text-pilot.user.js` blob SHA 20a19c9ce27fb1d9fd0765b82180b4eea14ce57d；`public/toc-mainline.user.js` @version 6.2.65；`cloudflare/worker/src/local-captures.js`；`cloudflare/worker/src/index.js`；PROJECT_RULES.md；线上历史脚本由 TinyFish live fetch `ttl=0` 实际确认 @version 0.2.1、没有 HTTP POST diagnostics
- 不读/不假称有用户本机 Edge/Chrome 的 IndexedDB 或 Tampermonkey 浏览器抓取会话；无真实历史正文按 DOI 失败回执，不能说已查明某一篇的真正根因。
- 工作状态：只读诊断+建议，未改脚本，未建 PR，未部署，待用户按项目“吐槽先核实我决定”规则明确批准修复。

## 用户问题

“补抓怎么看失败以及怎么失败的呢？你能确定吗？抓取脚本可以参考最新的toc正文图等的抓取脚本，他们会实时上传失败原因。”

## 已核实的具体代码事实

1. 正式历史脚本 `0.2.1` 的 UI `batchPanel.refresh` 只显示状态、已尝试/总数、本机新增、已存在、无许可数量、其他受阻数量与最近 DOI；不显示逐 DOI 失败行、`lastError` 文本、HTTP 状态、失败阶段或详细 message。见历史脚本约 401–453 行。
2. `batchOpenDb` 建两个 store `packets`（正文成功）和 `attempts`。`attempts` 仅存 `{doi,status,checkedAt}`；来自 publisher worker 的 `result.reason` 未保存，无法事后追溯。见约 369–395、550–575 行。当前临时查看办法：相同浏览器 Gallery 页面按 F12 → Application/应用程序 → IndexedDB → `gallery-historical-text-local-v2` → `attempts`。只能查看状态码/时间，不能查看完整真实原因。
3. 每篇 `batchAwaitResponse` 最多等 24,000ms，无响应统一 `timeout`；打不开标签页 `publisher_unreachable`；授权声明不明 `license_not_verified`；身份 metadata 匹配失败 `doi_unverified`；文本不足 `body_missing`。无法区分导航时实际 403、429、验证码、身份登录跳转、用户脚本未运行、跨标签页通信断开和页面慢加载，严禁凭 `timeout` 猜想具体 HTTP。
4. `BATCH_RETRY_MS=24*3600*1000` 与 `attempts` 缓存逻辑会跳过大多数失败（包括瞬时 timeout）24 小时；`skipped` 虽被记录在 status，但界面未显示细分，导致用户不知下次任务为何未重试。用户此前明确反对人为延长等待/冷却，后续必须按已证实原因和访问限制分类处理，不引入反爬规避/无限重试。
5. `response_hash_mismatch` 在验证 `sourceSha256` 后被 `catch(_){status='storage_failure'}` 吞掉，导致哈希证据问题与本机 IndexedDB 写入问题混为一类。保存 `packets` 的 IDBRequest success 早于整个事务 oncomplete，应该为已落盘完成加独立真实性门禁。
6. 历史脚本只做 GET 正式 DOI 与本机处理，`@grant GM_xmlhttpRequest` 用于 GET；没有 `POST /api/...report`、服务器上传 outbox、server ack，也没有管理员可查询的历史失败 endpoint。线上 @version 0.2.1 自身没有 HTTP POST 事件报告；不能宣称服务器已有历史全文批量失败日志。
7. 最新 TOC mainline `@version 6.2.65` 实现了 `captureLiveUpdate`、`captureDiagnosticEvent`、`enqueueCaptureReport`、`sendAutomaticReport`、`drainAutomaticReports`：失败 checkpoints / final 包含 DOI、jobId、controller revision、trace 和 reason，保留本机有界 outbox，Gallery 页面约 10s 周期排队 POST `/api/media/tampermonkey-report/import`，HTTP/存储回执 `stored=true` 且 DOI/attemptId 一致后才标记送达，失败退避重试；GET `/api/media/tampermonkey-reports` 可查近期记录。
8. Worker 的媒体 report import 路由需要写授权，并严格检查 `controllerRevision='2.2.41'`；写入媒体 `local-captures/tampermonkey` 命名空间。历史全文不能直接套用媒体上报入口，否则会混淆 TOC 正文图/PDF 失败与历史正文；且媒体 report GET 是否适合 owner-only 必须独立评估，不允许向公开 API 传播正文、作者访问会话或密钥。

## 修复建议（未获批准，因此不改生产或 branch）

- 作为独立的历史诊断线，在 `历史正文 · 独立补抓` 面板增加 `失败详情`，支持按 DOI/期刊/失败阶段/原因/时间筛选；每篇记录可证明的上游状态（HTTP 仅在实际有证据时记录）、正文提取科学段落数、权限判定、重试状态。批次统计严格分开 `已成功且本机落盘`、`无本文授权`、`未知/网络`、`本机存储失败`、`已跳过`、`待上传`；权限不明不能直接称没有访问权限。
- 仿照 TOC 的 checkpoint+final + 本机 durable outbox + 幂等 `eventId` + 服务器 `stored/attemptId` 确认 + 指数退避上报；专建 **owner 身份鉴权**的 `/api/admin/historical-text/reports` 或隔离命名空间（最终路由应审核当前后端契约）。严格只上传诊断 metadata：DOI、刊名、runId/attemptId、捕获脚本版本、阶段、有限 reasonCode、证实过的 httpStatus、脱敏出版社主机/正文科学字符数、时间和回执状态，不传全文、PDF、图片、SI、cookie、token、带 query 的出版方 URL。浏览器关闭前未上传的诊断留本机重试。
- 避免一律 24 小时跳过：不可接入/未知理由保留真正失败类别；限流明确响应才按 `Retry-After` 或保守有界访问策略，403/登录不反复撞墙；有界手工重试“只重试可重试项”。主采集运行不依赖诊断上报是否成功（采集与上报隔离）。
- 完整验收使用真 Chromium：代表性无 DOI、CC许可缺失、只有Abstract、body不足、标签页超时、网络断开、IDB事务中止、上报 5xx/401、掉线续传、跨媒体任务隔离与每篇 HTTP/阶段是否有证据；特别回读后端独立 report+ack，不能仅以 UI 有数字宣布已上传。
- 未修改媒体工作线、每日北京时间唯一 08:00 入库、历史 DOI scope、PDF 功能，也不共享媒体 controller/token/state。

## 用户已发送可见答复

**已经核实：目前历史正文补抓 0.2.1 的失败诊断确实不完善，不能像最新 TOC／正文图脚本那样查看逐篇失败详情并实时上传服务器。**

我对照了 GitHub 当前 main 和正式安装入口，线上历史正文脚本仍是 0.2.1。

现有状态如下：

| 功能 | 历史正文 0.2.1 | TOC／正文图主脚本 |
|---|---|---|
| 显示成功、失败总数 | 有 | 有 |
| 保存每篇 DOI 的结果状态 | 本机保存 | 有 |
| 显示逐篇失败原因 | 没有 | 有诊断记录 |
| 记录失败发生在哪个抓取阶段 | 不完整 | 有 |
| 实时上传失败报告 | **没有** | 有 |
| 确认服务器已收到报告 | 没有 | 有回执与重试机制 |

历史正文脚本目前在本机 IndexedDB 的 `gallery-historical-text-local-v2 → attempts` 中，只保存 `doi`、`status` 和 `checkedAt`。面板却仅显示“无权限/无许可 × 篇”“其他受阻 × 篇”，不提供可点击的失败明细。

因此，**我现在不能确定你浏览器中每篇文章究竟为什么失败**，也不能读取其完整历史抓取日志，因为这些结果根本没有上传到历史正文专用服务器接口。

### 还发现三处会让失败原因失真的问题

| 当前状态 | 实际可能发生的情况 | 为什么不能据此下结论 |
|---|---|---|
| `timeout` | 论文页没加载、登录跳转、脚本没运行、跨标签页通信中断 | 现在只知道约 24 秒内未收到结果，不知道具体是哪一环失败 |
| `license_not_verified` | 未找到本文明确许可、网页仍未加载完成、文章页面结构不兼容 | 不能直接判断为“你没有阅读权限” |
| `body_missing` | 只有摘要、正文容器识别失败，或 Results/Methods 提取不足 | 没有保存完整的页面检查过程 |

此外，历史脚本还有一项不合理的重试行为：**大部分失败状态在本机记录后，24 小时内再次启动也会被跳过**。这包括暂时性超时。面板只把它统计为“跳过”，没有清楚区分“已成功”“等待重试”和“永久不可获取”。

这确实需要调整。应根据真正的失败原因决定是否重试，而不是统一冷却一天。

## 拟发最终回答主体

**目前看失败的唯一临时办法**：在装有同一历史脚本并运行过补抓的 Edge/Chrome 打开 Gallery 首页 → F12 → Application/应用程序 → IndexedDB → `gallery-historical-text-local-v2` → `attempts`，查看 DOI/status/checkedAt，`packets` 是本机保存的成功文本。但目前 `reason` 丢弃、无阶段/HTTP证明，不能判断每篇真实根因；不能装作我已经拿到你电脑中的失败日志。

**最新 TOC 做法值得复用，但要隔离数据**：mainline 6.2.65 使用 checkpoint→本机耐久上传队列→约10秒循环上传→服务端 stored/attemptId确认→失败重传并可按DOI读取历史；既有接口 `/api/media/tampermonkey-report/import` 写入媒体报告且限制 controllerRevision，不能用历史正文直接复用该路径，否则污染媒体及权限。为历史正文新建独立、管理员鉴权的轻量 metadata 日志和回执，不上传正文、PDF、SI、图片和任何token/cookie。

**建议一并改4项**：一键面板失败明细（DOI、期刊、阶段、真实reason、时间、HTTP已知/未知、当前处理）；诊断轻量化近实时上传及回执状态，离线上报入 outbox；按原因重试不再粗暴24小时；仅完成IDB事务且哈希核验后算成功、修正hash mismatch被误归本机存储失败的问题。保留独立命名空间和队列，严格不碰TOC/正文图/PDF。

基于该项目“反馈先核实、用户决定”规则，本次只读核验且未改代码、PR或部署。待用户批准上述明确范围再实施。
