# Tampermonkey current uploaded diagnostics — confirmed access/route/inventory failures
Beijing: 2026-10-08 15:26:03 +08:00
User turn: “已上传” after instruction to upload local TOC diagnostics; project Tampermonkey 2.2.70.99 preview.
Mode: read-only diagnosis. No source, cloud media, PDF, policy, release or user data modified. Only this reply log committed.

## Live evidence
- GET /api/media/local-diagnostics: uploadedAt 2026-10-08T07:20:02.263Z (15:20:02 Beijing), controllerRunId manual:be64b0f3-95d8-41a1-a67c-aeefa06bf5c7, startedAt 07:09:20.760Z, phase=running, scopeRevision 20261008-added-date-only-v1, 177 in-scope, 23 unresolved; 4 opened/attempted, 4 blocked after visit, 8 publisher-cooldown deferred (until 07:40:27.390Z Beijing 15:40:27), 19 still pending including 8 deferred, 0 fully resolved.
- DOI ACS 10.1021/acs.joc.6c01708: publisher_access_gate, page text length 114, no discovery, ~13s, ACS full route. This proves an access-verification page was detected, not cause of publisher-side limitation.
- RSC DOI 10.1039/d6gc04458a, 10.1039/d6gc05783g, 10.1039/d6sc03717h: partial runs, toc=not_found, 0/0 body figures, partial text packet. Public latest reports for d6gc04458a and d6gc05783g updated at 07:18:29.094Z and 07:20:21.379Z; DOM route rsc_other, ~2600-3000 text chars, 7 IMG nodes, zero figure/figcaption, blank iframe fallbacks, TOC filter noContext=5/noKind=2; two PDF page-preview assets rejected correctly. Do not equate partial text with full publisher article.
- Owner PDF capture lease state=active/present=true; ownerPdfInventoryState=read_failed; 177 status unknown, not proof missing. TOC, figures, evidence, media and PDF layers all encountered “signal is aborted without reason” including media fallback shard and first owner PDF batch. This is likely client-side network lifecycle/transport interruption but precise trigger unverified.
- Independent GET /api/_healthcheck: ok=true, d1=true, r2=true, privatePdf captureEnabled/readEnabled true. GET /api/media/capture-capabilities: captureVersion=6.2.20, mediaControllerRevision=2.2.41, mediaGeneration=1790082000000, mode=verified-staging. Does not establish owner's browser network success.
- PR #412 draft remains unmerged; no publication or scraping repair released. Current diagnostic user script metadata 2.2.70.99 not independently represented by internal captureVersion/INSTALL_REVISION; verified in previously supplied preview source.

## User-visible partial answer 1
已成功读取你刚上传的 **15:20（北京时间）Tampermonkey 日志**。这次获得了完整的运行统计，确认测试版仍有明显问题。

## 本轮实际抓取情况

| 指标 | 数量 |
|---|---:|
| 10 月 1 日后收录文献 | 177 篇 |
| 本轮待补齐 | 23 篇 |
| 实际访问出版社 | 4 篇 |
| 确认完全补齐 | **0 篇** |
| 访问后受阻 | 4 篇 |
| 出版社冷却等待 | 8 篇 |
| 尚在待办队列 | 19 篇（含冷却等待） |

这次不是完全没有打开出版社，而是**已打开的 4 篇全部未完成，另外 8 篇 ACS 文献处于访问冷却期**。

还有一个重要发现：虽然你的 PDF owner 授权仍然有效，但 PDF 库存读取失败，导致 177 篇全部显示“未知”。这不是原来的 PDF 消失了。

## User-visible partial answer 2
## 已确认的三个故障点

**第一，ACS 被出版社访问验证拦截。** DOI `10.1021/acs.joc.6c01708` 在约 13 秒内始终没有进入论文正文。脚本因此设置了出版社级冷却，8 篇 ACS 待办要等到北京时间 15:40:27 后才有资格重新尝试。冷却结束不代表出版社一定会恢复访问。

**第二，RSC 没有进入可正常识图的页面。** 三篇本轮访问的 RSC 论文全部没有取得 TOC。日志反复出现 `rsc_other`，页面虽然有约 2600–3000 字文本和 7 个图片节点，但没有标准正文 Figure 节点。备用页面扫描也为空，且检测到的 PDF 预览图不能直接冒充论文 TOC。这更像页面路径、跳转或页面内容获取异常，不能仅通过放宽图片筛选解决。

**第三，库存读取存在独立的连接故障。** 日志显示 TOC、正文图、全文和 PDF 库存接口均出现 `signal is aborted without reason`。我另外核对了线上 API：健康检查正常，D1、R2 和抓取协议均显示可用。因此当前证据更指向浏览器端请求传输或请求生命周期问题，而不是服务器整体宕机；具体是哪一层中止了请求，还需要进一步验证。

## User-visible terminal answer
进一步核对后，问题范围已经明确：**不是所有出版社都拒绝访问，而是 ACS 访问验证、RSC 页面/图源异常和浏览器端库存请求中止三类故障叠加。**

本轮实际失败的 DOI 分别是 ACS 的 `10.1021/acs.joc.6c01708`，以及 RSC 的 `10.1039/d6gc04458a`、`10.1039/d6gc05783g`、`10.1039/d6sc03717h`。其中 RSC 页面扫描反复出现相同的特征：没有编号图或有效 TOC 候选，两个 PDF 预览图被正确拒绝；现有的“抓到部分文本”不能等同于获得完整论文。

**建议下一批只做三个针对性修复，先在独立分支验证：**

1. **RSC**：先判明 `rsc_other` 的实际跳转页面，修复 Article Landing/HTML 页面识别和真实 TOC、Figure 1 提取，保留图源和 DOI 校验，不拿 PDF 预览图充数。
2. **ACS**：区分文章 Landing 与 Full-text 路径，验证可访问的 TOC 页面；遇真实访问验证仍保留冷却、正常等待，不绕过出版社权限。
3. **库存请求**：定位 `signal is aborted without reason` 的触发点，限制并发及重复传输，保障 TOC/正文图/PDF 库存状态可核验；未知 PDF 不得重复下载。

现在不应反复点击「立即开始任务」，也不要清理已有记录或重新安装旧版。我目前**没有修改代码或发布新版本**。这是此前调度修复以外的新问题，按项目规则需要你明确授权。**是否批准这三项最小范围的针对性修复？** 批准后才实施，必须有真实抓取回执才交付更新链接。
