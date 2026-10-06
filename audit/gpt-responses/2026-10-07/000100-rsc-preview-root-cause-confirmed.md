# Response synchronization

北京时间：2026-10-07 00:01 +08:00
上下文：Chemical Science RSC PDF 首页预览被错误标为 official TOC 的根因确认。

## Final response

已完成 Chemical Science 错误 TOC 写回源的精确定位。

目标 DOI：10.1039/d6sc06421c

local capture index 中的真实记录：
- kind: official
- r2Key: local-captures/images/9d12ac0aab6a978495320e40-official-da1fc0b53216c2a1.gif
- contentHash: da1fc0b53216c2a1c1e1311fc39711b0
- contentType: image/gif
- sourceUrl: RSC Silverchair CDN 的 d6sc06421c.pdf.gif
- caption 明确包含 “First page … Article PDF first page preview”
- capturedAt: 2026-10-06T01:31:10.317Z

因此根因已经定案：旧版本 Tampermonkey 把 RSC PDF 首页预览 GIF 错标成 official TOC；该错误记录仍保存在 raw local capture index。生产 D1 quarantine 后，promoteOfficialLocalTocs() 从 raw index 读取 kind=official 候选并重新 importToc(..., replace:true)，于是同一错误 GIF 被重新写回生产。

建议批准的修复批次：
1. Worker intake 增加 RSC PDF-preview 防线：10.1039 DOI 的 *.pdf.gif/png/jpg/webp 或明确 first-page/PDF-preview 语义不得作为 official TOC 写入 local capture index。
2. getLocalCaptureIndex 与 promoteOfficialLocalTocs 共用同一拒绝函数，防止“公开过滤规则”和“promotion 规则”再次分叉。
3. 定点删除该 DOI 的错误 raw local-capture index 记录及对应 R2 object。
4. 再次 quarantine 该 DOI 的 toc_assets，并将 media_repair_state 置为立即重抓。
5. 增加回归：RSC *.pdf.gif first-page preview 必须 reject；真正 graphical abstract 仍允许。
6. 修复后只验收该 DOI：local capture 不再含错误 official、/api/toc 不再返回旧 GIF，并重新进入 Tampermonkey 缺口队列。

本批不处理 Green Chemistry、正文图或 PDF 私有库存，避免扩大变更面。
