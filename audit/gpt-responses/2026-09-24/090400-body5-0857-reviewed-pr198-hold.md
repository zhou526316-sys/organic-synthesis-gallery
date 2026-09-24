本轮有新的实质增量，但仍没有把未部署图片标记为 `published`。我先刷新了只读 R2/暂存证据：run `35940167412` 成功，artifact `10785035374`，归档 SHA256 `50111715ccf2bec19296e27fac2403a557ab45f8f2308626b7cd4999acebd9ba`。快照为 `stageRows=525`、`boundRows=514`、`unpublishedBoundRows=132`、37 个 DOI、`errors=[]`。这里的 132 张包含之前已经逐图核验但仍停留在 draft PR 的图片，因此不能解释为 132 张“新图”，本轮只从其中继续挑选未做过语义审核的增量。

本轮按“最新优先、同等条件 JACS 优先”完成 **5 篇、14 张正文图**的逐图审核：
- `10.1021/jacs.6c12613`：Figure 1、Scheme 1–4，共 5 张；文章级抓取仍是 5/7，只批准这 5 张。
- `10.1021/jacs.6c16346`：Figure 1、Scheme 1、Scheme 4，共 3 张；文章级抓取仍是 3/5，只批准这 3 张。
- `10.1021/acs.orglett.6c03733`：Scheme 1–2，共 2 张。
- `10.1021/acs.orglett.6c03394`：Scheme 4，1 张；Scheme 1–3 已属于之前的审批批次，没有重复审批。
- `10.1021/jacs.6c15393`：Figure 1、Scheme 1–2，共 3 张；未抓到的其余正文图没有被推定放行。

这 14 张都核对了 DOI/report/page 绑定、原始图号、独立图注、真实冻结字节与完整 SHA256、来源证据、文章主题与图像角色、同号/重复风险和清晰度；SVG 全部做了渲染及自包含检查，PNG 均实际解码。三个 Figure 1 都明确作为**正文 Figure 1**处理，没有冒充 TOC。部分报告中的 `partial/success` 只作为来源证据，没有代替语义审核。

审批 packet `body5-20260924-0857` 已由现有受控流程物化。run `35940736101` 成功，验证结果为 `files=14`、`articles=5`、`captionMutationRejected=14`、`productionWrites=0`、`r2Writes=0`、`publisherRequests=0`；canonical batch 为 `body5-20260924-0857-01`，冻结媒体 commit 为 `13ef8c2da43d6c6909d49a4dc2ce2f7896706651`，materialization artifact `10785045652`，ZIP SHA256 `c30f9686b29d26558b650b08c921c24ccd97e1af494f8f9687b46c5a743f6c54`。构建回归同时确认 `retainedDifferentFile=[]`、`notInCurrentCorpus=[]`、`quarantineUnchanged=true`，static-media integrity failures 为 0；隔离世代仍是 `1790082000000`。

已建立新的 **draft PR #198：`Media: preserve 14 newly reviewed body figures`**。正文媒体门禁 run `35940918004` 已通过；PR 在 Git 层面可合并，但 Site quality gate run `35940917983` 仍然非绿，其中 `Frontend build and typecheck` job `107448379465` 再次准确失败于既有的 `src/card-share.ts(52,10): TS6133: 'galleryDeepLink' is declared but its value is never read.`。Production API smoke 和 Worker dry-run 已通过；本媒体任务没有修改这个无关前端问题，也没有降低门禁。另一个 reviewed-vs-auto ownership handoff PR #192 仍未合并，因此本轮没有触发生产 Pages 部署。

与上一轮不同的是，08:00 正式文献发布链已经独立完成：当前 main 的 `literature-update-state` 为 `phase=synced_with_pending`、`activeRun=null`，08:00 网站同步在 2026-09-24 08:39:29 北京时间完成并记录为 `success-live-verified`。因此“正式文献任务仍在并行写 main”已不再是本轮阻断；当前阻断集中在媒体 PR 的既有质量门禁和 #192 controller handoff。

当前准确状态是：**本轮新增 `reviewed_pending_merge = 14 张 / 5 篇`，新增 `published = 0`**。没有生产部署，所以没有把物化成功或 PR 状态冒充上线；之前的 `approved_waiting_deploy`、其他 draft 媒体批次、held 和污染隔离子集都保持原状态。完整审核已同步到 `audit/media-acceptance/2026-09-24-090300-body5-0857-reviewed-pr198-hold.md`，本次回报已同步到 `audit/gpt-responses/2026-09-24/090400-body5-0857-reviewed-pr198-hold.md`。这仍只是本轮受控增量审核，不代表正文图全库已经复核完成。