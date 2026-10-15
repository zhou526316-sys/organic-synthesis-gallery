# Tampermonkey owner 新日志审计 · 2026-10-15 15:28 北京时间

**对话**：用户“新日志已上传”，接续 PR #552/660。
**审计类型**：只读 R2 最新诊断 + 源码检查 + 正式 DOI 媒体查询。
**R2 读取任务**：[GitHub Actions #38699137996](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38699137996)
**本次只读触发提交**：`aaa33bad6005c980449bc4993bbe9b2e7e2ba166`。

## 最新诊断原始标量（脱敏）
- uploadedAt: `1792049282112` (=2026-10-15 15:28:02.112 +08:00)
- protocol version: `6.2.20`; installed engine: `6.2.66`; controller: `2.2.41`
- run state: `running`; startedAt: `2026-10-15T05:07:36.942Z`; queueGeneratedAt: `2026-10-15T04:50:01.849Z`
- architecture membership verified: `true`; memberCount `1151`; hotCount `1013`; archiveCount `122`
- scopeCount `1151`, historical `851`, recent `294`, excluded `6`; candidateCount `1145`
- planned `340`, visited `29`, attempts `30`
- fullyResolved `9`; inventoryAlreadySatisfied `118`; unresolved `213`, blocked `6`, pending `207`
- tocStored `5`, figuresStaged `0`, evidenceStored `9`
- run results `30`: success `4`, partial `10`, failed `16`
- owner PDF inventory {"ready":265,"pending":5,"failed":0,"missing":24,"unknown":851}; remaining needs among pending {"toc":207,"figures":0,"evidence":0,"pdf":24}; inventoryErrors []
- note: uploaded while batch running; no final completion inference.

## 当前用户可见结论
# 2026-10-15 15:28 新日志已读取：6.2.66 确认运行

已从 R2 读取 owner 新上传诊断，GitHub Actions 只读读取任务 #38699137996 成功。上传时间为 2026-10-15 北京时间 15:28 左右，`installRevision=6.2.66`, controller `2.2.41`。协议版本 `6.2.20` 不是引擎版本。

最新正在运行的任务：340 项；访问 29 DOI、尝试 30 次；库存核实已齐 118；完整补齐 9；未完成 213（当前 blocked6，pending207）；已保存 TOC5、正文图新暂存0、全文证据9。任务范围由上轮 1,087 篇扩大到 1,151 篇，新旧剩余总量不能直接相减。

正式 API `/api/toc?doi=...` 逐项核实 5 篇返回 `available=true`, `reason=imported`：`10.1021/acs.joc.6c01479`, `10.1021/acs.joc.6c01552`, `10.1021/acs.joc.6c01777`, `10.1021/acs.orglett.6c03859`, `10.1021/acs.orglett.6c03862`。

30 条已返回的逐 DOI 运行结果：4 success、10 partial、16 failed；13 篇 `bound_publisher_heartbeat_missing`；其中 ACS25 条、Nature4 条、CCS1 条，没有 RSC，故新版 RSC 优化尚不能用真实回执验收。

正文图阶段多篇发现图但上传 HTTP500 `stage_storage_index_read_index_invalid`，新图存储=0。Worker `stage-storage.js` 的 `readIndex()` 将 JSON 读取/解析失败、大小超过 6 MB、或索引结构无效合并为 `index_invalid`，需要确认具体原因，不能猜成唯一是大小或永久损坏。也有 GM 请求超时、传输中断。私人 PDF 已齐265、待确认5、缺失24（851 历史 `toc_only` 不要求 PDF）；已读回执含 `private_pdf_upload_deadline`、`gm_request_timeout`、`background shutdown`。TOC 与正文图、正文、PDF 的各层状态必须分开算，`success` 不等于四层全部完整。

上轮独立 Pages 问题已由 PR #676 合并，部署 #38686679234 的 build、响应式分页测试、Pages deploy 全部成功；无需重新修复此处。

没有清空 Tampermonkey 状态、重装脚本、删除私人 PDF、绕过出版社授权、写媒体、修改抓取代码、取消当前批次或开启额外发布日期。

下一步建议：优先对 `stage_storage_index_read_index_invalid` 做真实 R2 对象长度/etag/JSON 完整性、索引竞争的只读诊断；对于连续出版社无心跳，核查页面脚本注入、Tab binding、导航/验证及后台休眠，并考虑早期熔断，不能机械拉长等待；对私人 PDF 的 GM 超时、native fallback 和后台关闭保留相同 PDF 已取到内容的断点并有界重试。RSC 必须在新版实际访问后评估，不根据未覆盖作结论。功能修复需独立批准。

## 实际问题 DOI / 服务端代码依据

### 13 次没有匹配的出版社脚本心跳
这些 DOI 是控制器按没有收到有效 `jobId` 心跳分类。不能直接判定出版社 403，也不能强行延长超时时间。
- `10.1021/acs.joc.6c02150`
- `10.1021/acs.orglett.6c03872`
- `10.1021/acs.orglett.6c03912`
- `10.1021/acs.orglett.6c04101`
- `10.1021/acs.orglett.6c04116`
- `10.1021/acs.orglett.6c04162`
- `10.1021/acs.orglett.6c04271`
- `10.1021/acscatal.6c06300`
- `10.1021/acscatal.6c06572`
- `10.1021/acscatal.6c06668`
- `10.1021/acs.joc.6c01296`
- `10.31635/ccschem.026.202608538`
- `10.1021/acs.joc.6c01813`

### 新日志中的正文图服务端 500
`stage_storage_index_read_index_invalid` 从 `cloudflare/worker/src/stage-storage.js` 返回；该函数读取 R2 `local-captures/article-figures/stage-index.json`，`object.text()`、`JSON.parse`、6 MB 长度上限、`index.items` 结构检查可能任一引发这一归因。真实来源尚须只读分解诊断。
受影响示例：`10.1021/acs.joc.6c01777`、`10.1021/acs.joc.6c01479`、`10.1021/jacs.6c08713`、`10.1021/acs.joc.6c01740`。

### 当前剩余阻塞预览
- `10.1021/acs.joc.6c01481`：PDF 权限或获取受阻＋媒体传输或上传失败＋正文图待核实；combined_capture;toc=already_available;figures=0/6;evidence=not_requested;published=0;pdf=private_pdf_upload_deadline;private_pdf_upload_deadline;private_pdf_failed;upload_http_500
- `10.1021/acs.joc.6c01717`：PDF 权限或获取受阻＋媒体传输或上传失败＋正文图待核实；combined_capture;toc=already_available;figures=1/5;evidence=stored;published=0;pdf=private_pdf_upload_deadline;private_pdf_upload_deadline;private_pdf_failed;gm_request_timeout
- `10.1021/acs.joc.6c02068`：PDF 权限或获取受阻＋TOC/主图未获取＋媒体传输或上传失败＋正文图待核实；combined_capture;toc=failed;figures=0/6;evidence=stored;published=0;pdf=private_pdf_upload_deadline;gm_request_timeout;private_pdf_upload_deadline;private_pdf_failed
- `10.1021/acs.orglett.6c03795`：出版社访问验证＋PDF 权限或获取受阻；publisher_access_gate;pdf=private_pdf_not_found;private_pdf_not_found
- `10.1021/acs.orglett.6c03859`：PDF 权限或获取受阻＋媒体传输或上传失败＋正文图待核实；combined_capture;toc=stored;figures=0/3;evidence=stored;published=0;pdf=private_pdf_upload_deadline;private_pdf_upload_deadline;private_pdf_failed;upload_http_500:stage_storage_ind
- `10.1038/s41586-026-11242-8`：TOC/主图未获取；combined_capture;toc=not_found;figures=0/0;evidence=stored;published=0;no_usable_official_or_figure1;owner_pdf_verification_pending;private_pdf_skipped

### 补图真实生产状态
正式 API 直接复核五篇如下；HTTP 响应在审计时为 200、`available=true`、`reason=imported`，未读取私人数据。
- `10.1021/acs.joc.6c01479`：`available=true`
- `10.1021/acs.joc.6c01552`：`available=true`
- `10.1021/acs.joc.6c01777`：`available=true`
- `10.1021/acs.orglett.6c03859`：`available=true`
- `10.1021/acs.orglett.6c03862`：`available=true`

## 30 条 DOI 原始脱敏摘要
| DOI | 状态 | TOC | 正文图存储/发现 | 全文 | 私有PDF | 失败归因 |
| --- | --- | --- | ---: | --- | --- | --- |
| 10.1038/s44160-026-01171-9 | partial | failed | 6/6 | not_requested | skipped | owner_pdf_verification_pending |
| 10.1038/s44160-026-01193-3 | failed | - | 0/0 | - | - | 控制器超时 |
| 10.1038/s41586-026-11242-8 | failed | not_found | 0/0 | failed | skipped | owner_pdf_verification_pending |
| 10.1038/s41586-026-11242-8 | partial | not_found | 0/0 | stored | skipped | owner_pdf_verification_pending |
| 10.1021/jacs.6c08713 | success | already_available | 3/7 | stored | stored | combined_capture;toc=already_available;figures=3/7;evidence=stored;published=0 |
| 10.1021/acs.joc.6c01282 | partial | already_available | 0/3 | not_requested | failed | private_pdf_upload_budget_exhausted |
| 10.1021/acs.joc.6c01479 | success | stored | 0/4 | not_requested | skipped | owner_pdf_verification_pending |
| 10.1021/acs.joc.6c01481 | partial | already_available | 0/6 | not_requested | failed | private_pdf_upload_deadline |
| 10.1021/acs.joc.6c01552 | success | stored | 0/4 | not_requested | skipped | owner_pdf_verification_pending |
| 10.1021/acs.joc.6c01717 | partial | already_available | 1/5 | stored | failed | private_pdf_upload_deadline |
| 10.1021/acs.joc.6c01777 | success | stored | 0/3 | stored | stored | combined_capture;toc=stored;figures=0/3;evidence=stored;published=0 |
| 10.1021/acs.joc.6c01857 | partial | failed | 0/3 | stored | failed | private_pdf_upload_transport_failed:gm=gm_request_timeout;native=controller_native_timeout_5025ms |
| 10.1021/acs.joc.6c02023 | partial | failed | 0/4 | stored | stored | combined_capture;toc=failed;figures=0/4;evidence=stored;published=0 |
| 10.1021/acs.joc.6c02068 | partial | failed | 0/6 | stored | failed | private_pdf_upload_deadline |
| 10.1021/acs.joc.6c02150 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |
| 10.1021/acs.orglett.6c03795 | failed | pending | 0/0 | pending | not_found | publisher_access_gate;pdf=private_pdf_not_found |
| 10.1021/acs.orglett.6c03859 | partial | stored | 0/3 | stored | failed | private_pdf_upload_deadline |
| 10.1021/acs.orglett.6c03862 | partial | stored | 0/3 | stored | failed | private_pdf_upload_budget_exhausted |
| 10.1021/acs.orglett.6c03872 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |
| 10.1021/acs.orglett.6c03912 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |
| 10.1021/acs.orglett.6c04101 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |
| 10.1021/acs.orglett.6c04116 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |
| 10.1021/acs.orglett.6c04162 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |
| 10.1021/acs.orglett.6c04271 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |
| 10.1021/acscatal.6c06300 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |
| 10.1021/acscatal.6c06572 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |
| 10.1021/acscatal.6c06668 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |
| 10.1021/acs.joc.6c01296 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |
| 10.31635/ccschem.026.202608538 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |
| 10.1021/acs.joc.6c01813 | failed | - | 0/0 | - | - | 出版社未返回匹配心跳 |

## 下一步批准边界
- 未获得本轮对新故障代码修复的独立授权。本次仅将用户已上传日志读出、核查与留档。
- 建议专项审查后单独批准 1) stage index 500 恢复 2) tab 心跳连续失联时熔断与根因观测 3) PDF 上传预算/断点且有界恢复 4) 四层完成状态真实统计。
- 保留旧版媒体和 PDF、单一 08:00 发布槽、7—9 月 toc_only 范围及 10.1+ 同次出版社访问四层尝试策略。
