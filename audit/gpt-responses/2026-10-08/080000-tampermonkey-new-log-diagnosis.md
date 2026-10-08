# Tampermonkey 2.2.66 / 6.2.47 新日志诊断

北京时间：2026-10-08 约 08:00 +08:00
用户要求：查看新版诊断日志中的问题；先诊断，不直接修改。

## 当前状态

新版 observability 已生效，最新回执可见 installRevision=6.2.47 / captureObservabilityRevision=20261007-capture-observability-v1。库存 warm-start 也生效：最新本地快照在 fresh inventory 仍后台核对时已经进入 running，TOC/正文图库存约 1.15s 完成，说明启动已不再是唯一主瓶颈。

## 已确认的主要问题

1. ACS 高分辨率图片获取失败
- 10.1021/acs.joc.6c01847：TOC not_found，正文图 2/4。
- TOC 候选 m_jo6c01847_0010.png 为 520x71，被质量阈值拒绝。
- Scheme 1/2 的 m_ PNG 分别约 520x351 / 520x431，也被判 low。
- DownloadFile/DownloadImage.aspx 路由通过 GM 返回 403；view-large 路由是 HTML/TIFF viewer，现有逻辑直接跳过 HTML viewer，未提取其中更高分辨率资产。
- 10.1021/acs.joc.6c00301 同样只保存 1/6，多个 520px m_ PNG 被判低清。

2. ACS 上传/暂存阶段是当前显著耗时源
- 10.1021/acs.joc.6c01671：discovery 仅约 8.1s，但 totalMs=379053（约 6分19秒）。
- 日志显示 R2 upload 网络失败，以及 Scheme 2/3/4 的 figure_stage 发生几十秒级等待；Scheme 4 最后以 background shutdown / aborted 失败。
- 因此该篇慢并不是“找图慢”，而是图找到后下载/上传/暂存回执链路拖慢。

3. 完成状态语义错误：正文图缺漏会被整体 success 掩盖
- 10.1021/acs.joc.6c01671 最终 status=success，但 figures=4/6。
- 10.1021/acs.joc.6c00301 最终 status=success，但 figures=1/6。
- 当前 coverage 仍把正文图/全文视为 opportunistic，不作为独立待办，所以 TOC 成功后可能整体判 success，剩余正文图不继续成为可见缺口。
- 这直接违背“补充缺漏”的目标，也是用户感觉“几乎没收获”的重要原因。

4. Elsevier 全文失败是明确的代码 provenance bug
- Chem 10.1016/j.chempr.2026.103282：正文图 14/14 已成功；10.1016/j.chempr.2026.103220：正文图 7/7 已成功。
- 两篇全文上传均失败 HTTP 400 publisher_source_mismatch。
- Worker 对 Elsevier 只接受 sciencedirect.com / cell.com。
- 客户端 evidenceArticleUrl(job) 调用 articleUrl(job)，但 articleUrl() 没有 Elsevier 分支，会回退到 https://doi.org/<doi>。
- 实际 sourceUrl 是 ScienceDirect，但 articleUrl 是 doi.org，因此 provenance 校验必然失败。
- 这是可直接修复的明确 bug。

5. Elsevier PDF 仍未解决
- /pdfft 在浏览器会话返回 HTML viewer，不是有效 PDF。
- GM 请求同一 /pdfft 返回 403。
- 因此需要从 viewer / 下载按钮 / 响应中提取真实 PDF 资源，而不是重复请求 /pdfft。

6. RSC 当前主要被 access gate 挡住
- 10.1039/d6gc04087j 最新任务约 13 秒后 publisher_access_gate。
- 当前 blockedPreview 中有多篇 RSC access/rate-limit。
- 此时连 DOM discovery 都没开始，因此本轮无法用这些条目判断 RSC 选择器是否已正确识别正文图。
- 先前已知的代码问题仍存在：全文 bundle 路由判断遗漏 opportunisticFigures / opportunisticEvidence，因此恢复访问后仍应先修成 articlehtml/full 路由，再看 DOM 识别。

7. 诊断本身仍有两个缺口
- route_plan / initial dom / filter summary 是较早 trace 事件；ACS 候选事件很多时，会被最后保留的 trace 窗口挤掉。
- diagnostic_context 的 JSON message 受长度限制，会被截断，routePlan 等字段可能无法解析。
- 因此下一版应把 route/dom/filter/timing 摘要直接放到 final report 顶层，或在 finish 前重新追加一次关键摘要，而不是只依赖 trace 尾部。

8. 一个异常长 controller timeout
- 10.1021/acs.orglett.6c03682：startedAt 2026-10-07T16:29:48Z，finishedAt 23:43:36Z，跨度约 7小时13分，最终 controller_timeout。
- 这说明浏览器/页面执行被长时间挂起后，8分钟 deadline 只能在恢复执行后才被检查。它不是当前大多数 10–60 秒任务的主瓶颈，但说明浏览器睡眠/挂起会导致 wall-clock timeout 失效。

9. architecture_membership_serial_conflict 反复出现在诊断里，但当前没有证据表明它导致媒体抓取失败；应视为旁路诊断噪声，不与抓图故障混为一谈。

## 建议的下一小批（需用户确认后实施）

优先修“抓不到”和“补不全”，不优先隔离：
A. 修 Elsevier evidence articleUrl provenance，直接解决明确的全文 400。
B. 修 ACS 高分辨率资产提取：解析 view-large / DownloadImage viewer 中的真实原图或可转换资源，避免只剩 520px m_ 图。
C. 修正文图 completeness：4/6、1/6 不能整体 success；对用户要求范围内的正文图缺漏继续保留为待补项。
D. 修 figure_stage / R2 上传的长等待与 background shutdown，保留已成功图并快速推进剩余图。
E. 把关键 route/dom/filter/timing 摘要持久化到 final report，避免被 trace 截断。
F. RSC 先修 opportunistic bundle 的 articlehtml/full 路由；等有一次无 access gate 的新回执后，再针对实际 DOM 结构修 selector。

本轮未修改生产抓取逻辑。