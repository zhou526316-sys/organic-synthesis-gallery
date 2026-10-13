# 历史正文独立补抓 0.2.2 — 72/743 真实服务器诊断截图分析（只读）

北京时间：2026-10-13 10:36:18（Asia/Shanghai）
聊天窗口：抓取有机合成文献并持续更新网页 / 历史正文一键补抓 / 真实失败上报与许可识别
用户附件：`image(20261013-023225).png`（本聊天中的新截图），仅分析截屏与只读源码及外部开放书目元数据。
当前政策：用户此前批准过 0.2.2 日志系统；针对本轮新暴露的许可识别/失败分类错误，遵守 PROJECT_RULES.md “吐槽先核实、用户决定”，**没有直接修复代码、PR、媒体队列或正式文献数据**。

## 一、截图中的可核实事实

- 运行中，已尝试 72/743。
- 本轮本机新增 2，已有正文 40，未核实许可 46，其他受阻 24。2/72=约2.8% 本轮尝试成功率；不代表全网站总覆盖率或每篇不可访问。
- 当前阶段 publisher_open，当前/最近 DOI `10.1021/acs.joc.6c01696`；“本地错误 未核实本文许可”可能是**前一篇**失败状态，不能直接归因当前 DOI。
- 诊断「服务器已确认 · 待发1」，真正说明已有上报完成和回执，本机还有一条诊断事件尚待发送。
- 「服务器已保存25条最近记录（只读）」：这25条是服务器**事件行**，不是25篇不同 DOI；checkpoint 和 final 可能按相同 DOI 出现多条。
- 可见行：
  - `10.1002/anie.7471740`，`未核实本文许可`，stage license，2026-10-13 10:15:54；
  - `10.1021/acscatal.6c03898`，`采集回执结构无效`，stage publisher_page，2026-10-13 10:15:49；
  - 同一 DOI `10.1021/acscatal.6c03898`，`已观察到页面 HTTP 错误`，stage finished，10:15:48；
  - `10.1126/science.aef0766`，连续两条 `未核实本文许可`，stage license，10:15:46 和10:15:45。
- Server reports list currently shows no numeric HTTP code or checkpoint/final label; cannot tell ACS DOI experienced actual 403 vs 429 from screenshot alone.

## 二、核对 0.2.2 main 源码：确定的分类错误

文件：`public/gallery-historical-text-pilot.user.js` 只读 SHA `4f6e6e59eaab02ba0d3d24acac1d90c7d7f65716` (main 当前可能继续更新)。
- `BATCH_ERRORS`（约226—229行）包含 `invalid_response` 但**遗漏** `page_http_error`、`page_access_blocked`。
- 出版社 worker `observedPageHttpStatus()` 识别导航响应 403/429，即 `storeResult({status:'page_http_error',stage:'publisher_page'})`（约980—983行）。
- 主队列 `let status=BATCH_ERRORS.has(result.status)?result.status:'invalid_response'`（约879行），所以真实 `page_http_error` 被改写为假 `invalid_response`，UI 显示“采集回执结构无效”。可对上 ACS Catalysis 截图 10:15:49 的 final。
- 上报 checkpoint `batchStageForStatus('page_http_error')` 未定义此状态，直接落入兜底 `finished`，导致 ACS Catalysis 10:15:48 的 stage finished；对应截图中同一 DOI 的两条行应视为可能是 checkpoint+final，而非必然两次独立访问。该 bug 足以证明 24 条“其他受阻”里存在虚假的回执结构错误；**不能推断24条全部如此**。
- `page_access_blocked` 同样缺于 BATCH_ERRORS，亦可能被改写成 `invalid_response`。若 HTTP429证实，后续应尊重 Retry-After / 访问限制；如果403则要判断是受限还是自动化被拦，不能绕过。
- `batchShowServerReports` 只展示 DOI、翻译原因、stage、收到时间，不展示 API 内本来有的 `httpStatus`, `kind` (failure_checkpoint vs final_result), `jobId`，造成“25条日志”难区分最终状态与过程回执。
- `batchLicenseEvidence`（约341行）仅接纳出版社 DOM 中明确 CC BY 3.0/4.0 或 CC0 文章许可；`batchWorker` 在 700ms*几轮后就可能认定 `license_not_verified`。该状态不意味着用户当前 VPN 无阅读权、也不等同法律上确认未授权。先确认 DOM 加载与文章级权利。
- `batchRetryAllowed`（约555行）对缺明确许可、无法访问等未获验证状态默认普通一键跳过；“复查受阻项”才会主动再访问，这次高拒绝率意味着继续不经分析地逐篇访问性价比低。

## 三、针对截图 DOI 的书目来源交叉核验（只读，不获取全文/PDF）

- `10.1002/anie.7471740` Crossref 存在合法 DOI，2026-07-10，标题 `Lewis Acid/Base Au–Mn Pairs in Metal Nanoclusters for Enhanced Photocatalytic C(sp2)–H Arylation`；Crossref licence URLs 主要是 Wiley 一般 terms/TDM licence，不是 CC BY 正文再利用授权；OpenAlex `primary_location.license=null`, is_oa=true。不能断言这是可公共复制文章。
- `10.1126/science.aef0766` Crossref 真实 DOI，OpenAlex is_oa=true、`primary_location.license=null`、GROBID XML 可用；仅 OA 标记不构成 CC BY 授权证明，网页 DOM 可能因没有声明而判为未核实。
- `10.1021/acscatal.6c03898` Crossref 合法 DOI `Radical 1,5-Carbonyl Migration Enabled by Energy-Transfer Catalysis`，2026-07-03；OpenAlex `open_access.is_oa=false`，`primary_location.license=null`，但这些公开元数据也不能证明用户浏览器必定403或者429。出版社真实HTTP数字只在本机详细失败记录/API JSON里查。
- 来源 API：
  `https://api.crossref.org/works/{doi}`
  `https://api.openalex.org/works/https://doi.org/{doi}`
- 不能因为 OpenAlex 能给某些 DOI OA/CC许可标记就把付费受限正文上传或公开检索，需绑定正式文章版本/具体许可。

## 四、建议而未实施的修复，等待用户明确批准

1. **优先修复确定 bug**：统一 source worker `page_http_error` / `page_access_blocked` 等 status 枚举与主队列 `BATCH_ERRORS`，让 checkpoint 和 final 同样忠实、阶段应为 publisher_page 而非 finished。回归用 mock 403/429 和页面挑战测试，确保实际拒绝可区分。不要延长/绕过拒绝。
2. **改善报告阅读**：服务器列表按 DOI+jobId/attempt 聚合显示最后 final 与中途 checkpoints；保留事件历史但展示真实 `httpStatus`/kind、已知与未知分开。保存、显示中文原因+英文代码，区分同一 DOI 重复事件，不再造成误判。
3. **排查许可过早失败**：先验证页面完整加载、唯一 DOI、有效的 Article body 容器、授权声明位置，区分 `license_dom_missing`, `page_not_ready`, `publisher_access_blocked`，对未获得当前许可的全文继续拒绝存储，Crossref/OpenAlex 只用于佐证和查官方落地版许可。对限流/403不撞墙或无穷等待，不触碰 TOC、正文图、PDF 采集队列。
4. **控制批次无效访问**：先暂停当前批量，免得再出现70/72不可用继续刷743篇；用已收到的服务器真实诊断分类引导下一轮选择性复查而不是全库盲扫。

## 本轮实际已发送的用户可见部分

### 第一段：
“这张截图已经证明：**历史正文诊断日志成功上传到服务器了。** 现在能够查看逐篇失败记录，不再只是本地统计。
但批量抓取的实际效果明显不理想。
当前指标：72/743；新增2；已有40；许可未核实46；其他受阻24；待上传诊断事件1。
本轮尝试成功率为 **2/72，约 2.8%**。... 服务器已保存25条最近记录（只读），同 DOI 可多条，不是25篇。”

### 第二段：
“已定位一处确定的脚本错误：`10.1021/acscatal.6c03898` 的 10:15:48 page HTTP error 和10:15:49 invalid response 两行由 `BATCH_ERRORS` 缺 `page_http_error`、`batchStageForStatus` 无映射直接引起。**该 DOI 的采集回执结构无效属于已确认误分类**，应查看实际 HTTP 状态。不能把过程和终态两行当两篇失败。”

### 拟继续的终结答复：
“我还抽查三个 DOI 的 Crossref/OpenAlex 许可信息：10.1002/anie.7471740 真实存在，Wiley书目一般许可/TDM不等于本文CCBY；10.1126/science.aef0766 OA标志但license字段空；10.1021/acscatal.6c03898 OpenAlex非OA，不足说明用户本机403/429。46条许可未核实≠无权限；24条其他中确认至少有误分类。‘当前/最近’与‘本地错误’可能来自不同篇，不要凭同一行判断。建议先暂停当前批次，调整状态映射、前端报告按DOI+attempt聚合显示HTTP和事件类型，以及出版社许可异步等待，保持不碰TOC/正文图/PDF。请用户批准这组新反馈修复。授权前不修改代码。”
