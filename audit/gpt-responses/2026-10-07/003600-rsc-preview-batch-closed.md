# Response synchronization

北京时间：2026-10-07 00:36 +08:00
上下文：RSC PDF 首页预览错误 TOC 批次最终线上验收。

## Final response

这一个批准批次已经闭环完成。

Chemical Science DOI 10.1039/d6sc06421c 的根因与修复结果：
- 根因：旧 Tampermonkey 将 RSC 的 d6sc06421c.pdf.gif “Article PDF first page preview” 错标成 kind=official，并写入 raw local-capture index；自动 promoteOfficialLocalTocs() 因而会把它反复写回生产。
- 主修复 commit：007ff545effb553958737606aa9cd9945af8c1d1。
- 新 Worker 防线：RSC PDF 首页预览在 intake、公开 local-capture index、自动 promotion 三层共用同一拒绝规则。
- 新 purge 管理接口已部署，可删除错误 raw local-capture 记录和对应 R2 object；只在 contentHash 匹配时 quarantine 生产 toc_assets，并将 DOI 重新置为优先缺口。
- RSC PDF preview guard 回归：success。
- Worker 主部署：completed / success。
- Repair confirmed RSC preview TOC workflow：completed / success。
- 独立线上验收：raw local-capture index 已不再包含 10.1039/d6sc06421c；/api/toc 已返回 available=false、reason=rsc_pdf_preview_quarantined。
- /api/media/bridge-queue?mode=coverage 已确认目标 DOI 重新进入队列：status=missing，tocMissing=true，tocStored=false，lastRootCause=rsc_pdf_preview_quarantined，nextRetryAt=0，reportedPriority=true。

因此旧错误 GIF 不会再被 promotion 自动复活；这篇现在是真实缺口，等待新版 Tampermonkey 从 RSC 页面重新抓真正的 graphical abstract/TOC。

本批没有处理 Green Chemistry 10.1039/d6gc03161g、RSC 正文图 0 张和 owner-private PDF 实际覆盖，这些属于下一批修复范围。
