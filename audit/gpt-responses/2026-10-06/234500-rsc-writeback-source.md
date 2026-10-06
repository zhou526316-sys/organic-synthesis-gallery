# Response synchronization

北京时间：2026-10-06 23:45 +08:00
上下文：定位 Chemical Science 错误 RSC TOC 被 quarantine 后重新写回生产的来源。

## Diagnostic evidence

```json
[]
```

## Final response

本轮只做写回来源定位，不修改生产数据。

GitHub 代码检索结果显示，错误 TOC 的自动回写链路与 “local capture → promote-local-tocs → toc_assets” 相关。当前生产部署流程会在 Worker 部署后执行 “Promote verified official TOCs into production”，调用 /api/admin/media/promote-local-tocs；对应实现会从 local capture index 中挑选 kind=official 的候选，并在 toc_assets 没有“当前可用 TOC”时重新 importToc(..., replace:true)。

这解释了为什么刚才 quarantine workflow 把 10.1039/d6sc06421c 的 toc_assets.available 改为 0 后，线上又恢复成同一个 imported GIF：旧的 RSC 错误 GIF 仍然存在于 local capture index，并且仍被标记为 official。随后自动 promotion 把它重新写回 toc_assets。

因此真正需要隔离的不是最终 toc_assets 行，而是这篇 DOI 在 local capture index 中那条错误 official 记录；同时 promotion gate 也应该拒绝 RSC *.pdf.gif 页面预览类 sourceUrl，防止历史错误资产再次进入生产。

下一步应只做一件事：定位 10.1039/d6sc06421c 在 local capture index 中的具体 sourceUrl/r2Key/kind，然后对该条记录做定点 quarantine，并增加 promotion gate 的 RSC pdf-preview 拒绝规则。
