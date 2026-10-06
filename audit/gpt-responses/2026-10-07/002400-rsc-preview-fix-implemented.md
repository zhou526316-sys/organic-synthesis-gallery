# Response synchronization

北京时间：2026-10-07 00:24 +08:00
上下文：实施用户批准的 RSC PDF 首页预览错误 TOC 修复。

## Final response

已完成批准批次的代码实现：RSC PDF 首页预览现在会在 Worker intake、公开 local-capture index、自动 promotion 三层统一拒绝；新增定点 purge 接口，可删除错误 raw local-capture 与对应 R2 object，并仅在 contentHash 匹配时 quarantine 当前生产 TOC，再把 DOI 立即重新入队。专用回归和自动清理 workflow 已一并准备。
