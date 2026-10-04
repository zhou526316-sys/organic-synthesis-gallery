# Organic Synthesis Gallery daily summary publication — 2026-10-04

本轮每日摘要发布已完成并闭环。健康门禁与 scheduled handoff 合约均通过；未修改生产文献卡片、权威文献数据、TOC demand、08:00/18:00 文献发布状态或 Tampermonkey 媒体链路。

本次会话按 Evidence 完成双遍审核并闭环 180 个 DOI。摘要数据提交依次为：`e16241be1646b9200d7e393669f13d6f6fb0c5ce`（59 条：51 新增、8 刷新）、`63e2a523343eac0625c2692bae5eef02c823ea95`（60 条刷新）、`050a29a30256141af8926b2f5b05657d2b20662a`（20 条新增）、`deea8472479e82e727bb284a13828d91bf15d5a1`（20 条刷新）、`c6a40ba030c21801fc0113769c820b3a9397b81c`（20 条：15 新增、5 刷新），以及最终并发写入且经本轮独立 Evidence 复核通过的 `6c53e16c5dd1dca98100ec433e59ff6d499233d8`（`10.31635/ccschem.026.202607659`，1 条新增）。

对应 `Deploy Worker frontend assets` runs 分别为 `37192818301`、`37194873925`、`37198083058`、`37198913291`、`37199260891`、`37199918166`，均为 `success`。分层线上抽查覆盖 complete / partial / abstract_only 以及 scientific sourceHash 变化场景，抽查 DOI 包括 `10.1021/acs.orglett.6c03473`、`10.1021/acs.joc.6c01696`、`10.1021/acs.orglett.6c03434`、`10.1038/s41467-026-78226-0`、`10.31635/ccschem.026.202608392`、`10.1126/sciadv.aeg4594` 和 `10.31635/ccschem.026.202607659`；均返回 `available=true`、`state=published`、`source=scheduled_reviewed_evidence_v2`，且 sourceHash/evidencePacketHash 与本轮记录一致。

最终冻结 handoff 显示生产范围为 303 篇；最终 CCS 发布前为 290 篇当前 hash 已匹配、1 篇 Evidence-backed pending、12 篇缺 Evidence。该唯一 Evidence-backed pending 已由 commit `6c53e16c5dd1dca98100ec433e59ff6d499233d8` 上线，因此当前可归为 291 篇当前摘要已匹配、0 篇“已有 Evidence 但缺摘要”、12 篇仍缺 Evidence。缺 Evidence DOI 为：`10.1021/acs.orglett.6c03612`、`10.1021/acs.orglett.6c03636`、`10.1021/acs.orglett.6c03279`、`10.1021/acs.orglett.6c02993`、`10.1021/acs.orglett.6c03418`、`10.1021/acs.orglett.6c03921`、`10.1021/acs.joc.6c01302`、`10.1021/acs.joc.6c01469`、`10.1021/acs.joc.6c01295`、`10.1021/acs.joc.6c01270`、`10.1021/acs.orglett.6c03386`、`10.1016/j.chempr.2026.103282`；这些保持 pending，未猜测摘要。

cutoff 门禁正常执行：`10.1021/jacs.6c12832` 的 canonical article date 为 2026-09-19，早于 2026-09-20，未回填摘要。当前静态摘要 store 共 389 条记录，其中包含按合约保留的较早历史摘要；它与“303 篇当前生产范围”的统计口径不同。

response_sync: success
