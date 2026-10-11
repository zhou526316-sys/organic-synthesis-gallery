本轮正文图媒体任务取得新增审核结果，但没有生产上线，因此新增 `published=0`。

新增逐图通过 4 篇/16 张：`10.1021/jacs.6c12740` Figure 1/2/3/4/6/7；`10.1021/acs.orglett.6c03300` Figure 1–3；`10.1021/acs.orglett.6c03347` Scheme 1–3；`10.1021/acs.orglett.6c03508` Scheme 1–4。继续复用 immutable read-only evidence run `35940167412` / artifact `10785035374` / archive SHA256 `50111715ccf2bec19296e27fac2403a557ab45f8f2308626b7cd4999acebd9ba`，未重新访问出版社。

16 张均完成 task/page/article/source DOI、原始图号/图注、真实冻结字节与 full SHA256、主题/角色、重复/推荐图风险、格式和清晰度核对。15 个 SVG 实际渲染且未发现 script、foreignObject、事件处理器或外部资源 href；1 个 PNG（Org. Lett. 6c03347 Scheme 2）正常解码为 520×602。Figure 1 均按正文图处理，已有 TOC 是独立来源/哈希，没有被替换。JACS `10.1021/jacs.6c12740` 的 article-level 抓取历史仍为 partial，因此只批准实际存在且逐字节绑定的这 6 张，不推定缺失图通过，也不对既往传输/服务器失败臆测 VPN/R2/配额原因。

审批 packet 为 `body4-20260924-1047`。现有受控 `Materialize approved body assets` run `35949497407` / job `107474760767` 已成功：`EXACT_REVIEW_PACKET_VERIFIED files=16`，caption mutation 16/16 被拒绝；物化结果 `materialized=0 / reused=16`，`productionWrites=0`、`r2Writes=0`、`publisherRequests=0`。canonical batch 为 `body4-20260924-1047-01`，bot commit `fc16fe17b853a70ddc14773cb470d4a1219d7e65`；artifact `10788336244` digest `sha256:ef511ea88ea143521d76b7032b0a7cb6f099e55713ecff161d56d53d82eef55c`。原媒体构建/回归给出 `retainedDifferentFile=[]`、`notInCurrentCorpus=[]`、`quarantineUnchanged=true`、static-media-integrity failures=0，protected literature diff 通过。

已建立 draft PR #201 `Media: preserve 16 reviewed body figures`。PR 的 `Body review markers and incremental publication` run `35949722817` 已通过。Site quality gate run `35949722681` 中 Worker dry-run 与 Production API smoke 已通过；Frontend build and typecheck 再次失败于 main 既有错误 `src/card-share.ts(52,10): TS6133: 'galleryDeepLink' is declared but its value is never read.`，Playwright interaction regression 在本次同步时仍在运行，但无论其结果如何，现有 Site quality gate 已不是全绿。

创建 PR 时 main 已从本批分支基线 `62c6dcc22335f556295a029f594337c7e8b5b456` 前进到 `3adf5f4bf70f42422e31a9c7be9c34da6c217ff4`；该单一新增 main commit 只加入 `audit/gpt-responses/2026-09-24/105800-gallery-custom-domain-cutover-staged.md`，没有改 protected literature。PR #192 reviewed-vs-auto controller handoff 仍未合并，最新读取为 `mergeable=false`，当前 main 仍缺其 exact reviewed-over-auto handoff 逻辑。因此 #201 保持 draft，不合并、不触发生产 Pages，不把 build-time `added` 当成 published。

当前状态：本轮新增 `reviewed_pending_merge=16` / 4 篇，新增 `published=0`；quarantine generation 继续为 `1790082000000`。此前 pending/draft/held/污染隔离子集均不在本轮被强制处理。该结果仅代表本轮受控增量，不代表正文图全库复核完成。
