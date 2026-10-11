本轮有新的实质增量，但按并行部署保护规则没有抢写生产环境：**新增逐图通过 12 张 / 5 篇，新增 `published=0`，当前为 `reviewed_pending_merge`。**

本批通过的是：
- `10.1021/acs.joc.6c01846`：Scheme 1–3，共 3 张；最新 article-level 报告仍不能证明整篇完整，因此只批准这 3 个有精确 DOI/source/字节绑定的对象。
- `10.1021/acs.joc.6c01939`：Scheme 1、Scheme 4，共 2 张；抓取仍为 partial 2/5。
- `10.1021/acs.orglett.6c03443`：Figure 3，共 1 张；抓取仍为 partial 1/4。
- `10.1021/acs.orglett.6c03851`：Scheme 1–5，共 5 张；该组为完整 5/5。
- `10.1021/jacs.6c13635`：Figure 1，共 1 张；明确作为正文 Figure 1，不冒充 TOC，之前已发布的 Figure 3/4 保持不变；抓取仍为 partial 3/4。

本轮复用新的只读冻结证据 run `36001020325` / artifact `10808132140`，证据归档 SHA256 为 `1d02f0347b1fb3e53b7f8b56f2c3756010a5044e47389eac503349b94a1014e6`。12 张均完成 task/page/article/source DOI、原始图号和独立图注、真实字节、完整 SHA256、content-addressed R2 key、capture/job identity、主题/图片角色、跨 DOI 重复风险、格式和清晰度核验。格式为 **7 个 SVG + 5 个 PNG**；SVG 均实际渲染并检查 active/external content，PNG 均实际解码；没有发现跨 DOI source/hash 冲突。五篇文章现有官方 TOC 都保持独立，没有用正文图替换 TOC。缺失图片没有推定通过，也没有根据历史 HTTP/transport/controller 状态推断 VPN、R2、配额或出版社原因。

审批 packet `body5-20260924-2053` 的首个 commit 为 `8d360204606722d8b04d297a0bfd0a67261432ad`。现有受控 `Materialize approved body assets` run **`36002940494` / job `107643777469` 已成功**，生成 canonical batch `body5-20260924-2053-01` 和冻结资产 commit `fb81bebb23c3162f8eba07b8a696bfb161b2fbe3`；artifact `10808673450`，digest `sha256:8f3d52ec659c6b0d9af852d4624ea0a06c9c86d025a614e08ed7c5c664f3ec9e`。工作流确认 `EXACT_REVIEW_PACKET_VERIFIED files=12`、`captionMutationRejected=12`、`productionWrites=0`、`r2Writes=0`、`publisherRequests=0`，并且 12/12 都复用精确冻结字节；`retainedDifferentFile=[]`、`notInCurrentCorpus=[]`、`quarantineUnchanged=true`、static-media integrity failures 为 0。隔离世代继续保持 `1790082000000`。

已建立 **draft PR #223 — `Media: preserve 12 newly reviewed body figures`**。PR 文件清单只有 12 个冻结媒体文件、canonical batch、review packet 和两类审计记录，没有生产文献数据、卡片、中文标题、收录范围、TOC 或 userscript 改动。`Body review markers and incremental publication` run `36003428862` 已通过；Site quality gate run `36003428887` 在本次记录时仍在执行，已完成的 Frontend build/typecheck、Worker dry-run 和 Production API smoke 均为成功，因此本轮没有绕过未完成门禁去合并。

同时 main 已进入另一条 Bridge/TOC 媒体发布链并前进到 `c319e5d6d57b3edbec6fc6b898a76d5202f07f53`。该并行链的 `Verify night capture release live` run **`36003469398` 已失败**：失败发生在“Verify public installer and backend are the same release”线上验收步骤，12 次重试均得到 HTTP 403；日志没有把 403 精确隔离到具体被请求端点，因此这里只记录为**并行发布线上验收 HTTP 403、具体来源未定**，不归因于 VPN、R2、额度、候选下载、上传或索引写入。按你的“媒体并行部署冲突/重大连续失败时不抢写”规则，本轮因此保持 #223 为 draft，不合并、不触发新的 Pages 部署，也不把 materialized/staged 状态冒充上线。

完整逐图验收已经写入 `audit/media-acceptance/2026-09-24-210500-body5-2053-reviewed.md`。当前准确状态是：**本轮 `reviewed_pending_merge=12 张 / 5 篇`，新增 `published=0`**。后续只在并行媒体发布状态稳定、#223 所有质量门禁完成、再次重读最新 main 并确认 protected literature 不变后，才进入合并和生产上线；上线后仍必须逐个核验 URL、完整哈希、图号、真实卡片解码及原 TOC 保留。这仍只是本轮受控增量审核，不代表正文图全库复核完成。
