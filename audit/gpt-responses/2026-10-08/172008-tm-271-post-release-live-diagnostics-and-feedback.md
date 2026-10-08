# Tampermonkey 2.2.71 authenticated post-release diagnostics

Beijing: 2026-10-08 17:20:08 +08:00

Conversation context: user said 已上传日志 after overwriting official VPN Bridge 2.2.71, read-only live assessment.

## Read-only evidence
Latest owner log GET /api/media/local-diagnostics uploaded 2026-10-08T09:13:59.858Z, run ID manual:6bf2f976-c517-4ca0-92b7-38209ccfd81d, started 2026-10-08T08:27:09.064Z.
Scope 177, 25 unresolved, 9 result attempts, 6 actual publisher tabs, 0 fully resolved; PDF owner lease active, status 148 ready, 2 missing, 27 unknown.
PDF third chunk of 27 articles timed out; TOC, media, figures, evidence inventory encounter browser native 12s timeout. Unknown does not equal missing.
RSC DOI 10.1039/d6gc04458a and 10.1039/d6gc05783g etc. have runtime installRevision 6.2.52, rsc_silverchair_article page classification, 7–9 image nodes, zero figure/figcaption, and zero usable official TOC/figure; PDF preview excluded. Discovery 18–19s vs previous 40s.
RSC evidence_capture failed with gm_request_timeout and fallback controller_native_timeout_4000ms. Older partial fulltext storage cannot be equated with complete fulltext.
ACS DOI 10.1021/acs.joc.6c01708: GET /api/toc?doi=... available true reason imported SVG image hash recorded, actual production TOC stored; same jobId e64003c3-dc08-4713-84e0-8aae636dd4b2 delivered repeated failure final records. Latest progress record came after final and superseded it despite same jobId.
Server cloudflare/worker/src/local-captures.js importTampermonkeyReport currently writes index.items[doi] from most recently ARRIVED report, with no jobId/final precedence or dedup; no code change authorized for new report-order bug.
No publisher access, file changes, private PDF downloads, or production dataset modification as part of read-only diagnosis.

## User-visible reply (first partial)

已读取你在**北京时间 17:13:59** 上传的新日志。正式版更新后的抓取效果仍不理想，不能因为版本已上线就认定问题已经解决。

| 本轮指标 | 结果 |
|---|---:|
| 10 月 1 日以来收录文献 | 177 篇 |
| 当前待补齐 | 25 篇 |
| 抓取尝试 | 9 次 |
| 实际打开出版社任务页 | 6 篇 |
| 完全补齐 | **0 篇** |
| PDF 云端确认已存储 | 148 篇 |
| PDF 确认缺失 | 2 篇 |
| PDF 库存尚未确认 | 27 篇 |

PDF 库存有改善：此前 177 篇全部显示未知，这次已经核实 150 篇的状态。但**仍有 27 篇库存核查失败**，不能当作需要重新下载的 PDF。

本轮 ACS 仍出现访问验证阻断，RSC 多篇论文继续出现 TOC 未找到、正文图 0 张；库存接口也仍有超时。接下来需要根据逐篇轨迹区分真正的脚本缺陷与出版社页面限制。

## User-visible reply (second partial)

还有一项重要进展：**正式版确实已经在你的浏览器里运行**。新日志中的运行标识为 `6.2.52`，对应 VPN Bridge 2.2.71，而不是旧版本。

并且 ACS 的一篇 JOC 文献 `10.1021/acs.joc.6c01708` 已在后续尝试中成功将 TOC 导入生产端。我直接检查了服务器，确认该 DOI 的 TOC 状态是 `available: true`，有实际图片存储记录。

所以，**ACS 的 TOC 获取有实际改善，但整篇文献的补齐任务仍未完成**。RSC 则不同：新版 Silverchair 页面已经被正确识别为 `rsc_silverchair_article`，但页面实际提供的可识别图片中仍没有合格的 TOC 或 Figure 1，说明之前的路径识别修复还不足以解决抓图问题。

## User-visible reply (terminal)

进一步核对逐篇轨迹后，确定了三个后续需要处理的点：

1. **RSC 抓图仍未恢复。** 新版 Silverchair 页面确实被识别，但日志中只有 7–9 个图片节点、没有编号图或图注。新版将无效页面扫描由约 40 秒缩短到 18–19 秒，却仍没有找到真正的 TOC 或正文图。同时，正文文本上传出现 `gm_request_timeout` 和浏览器回退请求 **4000 ms 超时**。不能用 PDF 首页预览图冒充 TOC，也不能把部分摘要当成完整正文。
2. **库存读取仍不稳定。** PDF 前两批共 150 篇成功核验，第三批 27 篇超时；TOC、正文图和全文库存也出现浏览器 **12000 ms 超时**。需要对失败批次进一步小批量核验，并分清浏览器请求、扩展请求以及后端响应耗时。
3. **发现一个新的回执统计缺陷。** ACS 那篇 JOC 的多条 `publisher_access_gate` 记录其实来自**同一个任务 ID 的重复回执**，不是连续打开了多次出版社。服务器又把后来抵达的 `progress` 回执放到已经存在的 `final` 回执之上，导致“最新状态”不一定代表最终结果。这一问题已在服务器记录处理代码中得到核实。

因此，**25 篇未闭环不等于 25 篇内容或 PDF 丢失**，也不代表整个系统毫无进展；但目前距离可验收的完整抓取确实还有差距。你现在无需重新安装或反复点击“开始”。

RSC 和库存问题属于此前已批准的修复范围；**第 3 项回执乱序是这次新增发现的问题**。是否批准把“最终回执优先于延迟进度回执”的修复一并纳入下一轮？我会坚持只提供真正发布并回读通过的正式版，不再反复发送测试安装链接。