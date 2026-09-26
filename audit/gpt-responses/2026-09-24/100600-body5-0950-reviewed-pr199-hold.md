本轮有新的实质增量，但没有把未部署图片标记为 `published`。

本轮复用只读证据 run `35940167412` / artifact `10785035374` / archive SHA256 `50111715ccf2bec19296e27fac2403a557ab45f8f2308626b7cd4999acebd9ba`，继续按“最新优先、同等条件 JACS 优先”从尚未语义审核的增量中处理 5 篇、17 张正文图：`10.1021/jacs.6c05496` Scheme 1；`10.1021/jacs.6c10408` Figure 2；`10.1021/jacs.6c14557` Figures 1–6；`10.1021/acs.orglett.6c03870` Schemes 1–5；`10.1021/jacs.6c10183` Figures 1–4。全部核对 DOI/page/source 绑定、原始图号、独立图注、真实冻结字节和完整 SHA256、文章主题、图片角色、重复/推荐图风险、格式与清晰度。16 个 SVG 均实际渲染且没有 script/foreignObject/event-handler/external href/external CSS/data URL；1 个 PNG 实际解码。三个 Figure 1 均明确作为正文 Figure 1 处理，现有 TOC 来源/哈希不同且保持不变。

其中 `10.1021/jacs.6c05496` 与 `10.1021/jacs.6c10408` 后续 article-level 报告仍为 partial，并出现 transport/stage failure；这里只批准已经存在于当前世代、逐字节验证且 DOI 绑定正确的 Scheme 1 / Figure 2，没有把缺失图片推定为通过，也没有从 HTTP 503/status failure 推断 VPN、R2 或配额原因。

审核 packet `body5-20260924-0950` 已写入媒体分支，packet commit `8dcea71c8022be89715d8d27714c72ad670e05eb`。现有受控 `Materialize approved body assets` run `35945328491` 成功，job `107461894720` 成功，生成 canonical batch `body5-20260924-0950-01` 和 17 个冻结资产，bot commit `0a1a36be7aed415d9876c606fe19fcdcad404f30`。materialization artifact `10785964520`，digest `sha256:a0392795df9c8050e583e055cdee06175a4d589c4aa0a2168aa6c206518ae756`。工作流报告 `EXACT_REVIEW_PACKET_VERIFIED files=17`、`captionMutationRejected=17`、`productionWrites=0`、`r2Writes=0`、`publisherRequests=0`，且 exact bytes 全部复用（`materialized=0,reused=17`）；构建回归为 `retainedDifferentFile=[]`、`notInCurrentCorpus=[]`、`quarantineUnchanged=true`，static media integrity `failures=0`。

已建立 draft PR #199 `Media: preserve 17 newly reviewed body figures`。冻结媒体 head `0a1a36be7aed415d9876c606fe19fcdcad404f30` 上，正文媒体门禁 run `35945516220` 已成功。Site quality gate run `35945516144` 中 Worker dry-run 和 Production API smoke 已成功，但 Frontend build/typecheck job `107462450138` 已失败，仍是 main 上既有错误 `src/card-share.ts(52,10): TS6133: 'galleryDeepLink' is declared but its value is never read.`；Playwright 在最后观察点仍运行中。该前端问题不属于本媒体任务，本轮没有修改或绕过。reviewed-vs-auto ownership handoff PR #192 仍开放、未合并；虽然最新读取显示可合并，既有质量门禁仍非绿，因此没有合并 #192 或 #199，也没有触发生产 Pages。

当前 main 仍为 `ef4550778c0d40513fc038d2d249bc4c7067b586`，08:00 正式文献发布已完成且本轮未修改任何文献卡片、中文标题、收录范围、生产文献数据、08:00/18:00 任务或 userscript。隔离世代仍为 `1790082000000`。

当前准确状态：本轮新增 `reviewed_pending_merge = 17 张 / 5 篇`，新增 `published = 0`。之前的 `approved_waiting_deploy`、其它 draft 媒体批次、held 和污染隔离子集保持原状。本轮完整媒体审计已同步到 `audit/media-acceptance/2026-09-24-100500-body5-0950-reviewed-pr199-hold.md`。这只代表本轮受控增量审核，不代表正文图全库复核完成。
