北京时间 2026-09-24 07:43，本轮正文图媒体任务已有实际新增审核结果，但没有进行生产合并/部署，因此没有新增图片被标记为 `published`。

本轮从现有 R2 暂存证据做了受控只读刷新。完整冻结证据 run 为 `35933700007` / job `107425861726`，artifact `10781649022`，ZIP SHA256 为 `73f5281cbf04a6443168a03b154881ebe37894b01b7c7070903e188e3ed930c9`。快照仍是 stage rows 525、current-generation/bound 514、unpublished 44 张/12 篇、`errors=[]`，固定隔离世代继续是 `1790082000000`。本轮没有重新访问出版社、没有 R2 写入、没有 direct import/repair。

在 5 篇/30 张的语义审核上限内，本轮新增逐图通过 5 篇 ACS Catalysis、共 12 张：

- `10.1021/acscatal.6c05029`：Scheme 1、Scheme 2；
- `10.1021/acscatal.6c05787`：Scheme 2、Scheme 3、Scheme 4；
- `10.1021/acscatal.6c05293`：Figure 3、Figure 4、Figure 5、Figure 6；
- `10.1021/acscatal.6c04996`：Scheme 2、Scheme 3；
- `10.1021/acscatal.6c05422`：Figure 4。

这 12 张均按 task/page/article/source DOI、原始图号、独立图注、真实冻结字节、完整 SHA256、文章主题、图像角色、重复/同号覆盖风险、格式与清晰度重新核对；SVG 做了自包含和危险活动内容检查，PNG 做了签名与尺寸检查。partial article-level capture 没有向未实际检查的图扩张。冻结证据中剩余的 `10.1021/acs.orglett.6c03543` Scheme 2/3 因本轮已达到 5 篇上限，仅延期到下一轮，不属于 rejected/held。

已建立 review packet `body5-20260924-0734`，packet commit `7c9b285afed08a9103695482d1994dd74ff562ae`。现有 `Materialize approved body assets` run `35934356443` / job `107427922347` 成功，生成 canonical batch `body5-20260924-0734-01`，分支最终 head `a67a9334e83fe8c087deb7f4f7e97343fbff3101`。物化 artifact 为 `10781859733`，ZIP SHA256 `541ea2e5cc4a5edbb105be361d30f07acb1aabfe0a3a78026fb042d6f8e21062`。工作流明确报告 `EXACT_REVIEW_PACKET_VERIFIED files=12`、`productionWrites=0`、`r2Writes=0`、`publisherRequests=0`、`retainedDifferentFile=[]`、`notInCurrentCorpus=[]`、`quarantineUnchanged=true`，static media integrity failures 为 0。构建中显示的 added/figure counts 只是 staging/build preview，不作为线上 published 证据。

新的 draft PR 为 #196：`Media: preserve 12 reviewed ACS Catalysis body images`。它相对 main 仅保留 review packet、canonical batch manifest 与 12 个冻结批准资产；没有生产文献数据、卡片、中文标题、范围、userscript 或隔离世代改动。正文媒体门禁 run `35934540404` / job `107428507303` 已成功。

Site quality gate run `35934540443` 仍不是全绿：Production API smoke 与 Worker dry-run 已成功，但 Frontend build/typecheck job `107428507722` 继续准确失败于 main 已存在的无关问题 `src/card-share.ts(52,10): TS6133: 'galleryDeepLink' is declared but its value is never read.` 本媒体任务没有修改该前端文件、没有削弱门禁。Playwright interaction regression 在本记录写入时仍在运行，但由于 typecheck 已失败，不能把 Site quality gate 视为通过。

同时，main 在本轮合并判断前重新读取为 `b5102cf6adc660fa0e4dfbeffa9b08b4a3d7146b`，其最新正式 08:00 发布前记录保持 `preparing / incomplete_review`。因此本轮按媒体并行冲突规则只保留审批，不抢写 main、不合并 #196、不触发 Pages；也没有触碰现有 #192 reviewed-vs-auto handoff 控制器问题。

当前准确状态：本轮新增 `reviewed_pending_merge=12` / 5 篇，新增 `published=0`。这 12 张还不能称为 `approved_waiting_deploy`，因为 canonical approval 仍只在 draft PR 分支、尚未安全合并；此前各批次维持原状态。只有以后在正式发布窗口之外、main/SHA 与并行改动重新确认、所有既有门禁通过后安全合并，并完成生产 Pages 部署和逐张线上 URL/完整哈希/图号/卡片解码/原 TOC 保留验收，才可把相应图片标记为 `published`。

本轮媒体接受记录已写入 `audit/media-acceptance/2026-09-24-074200-body5-0734-reviewed-pr196-hold.md`，对应 main audit commit `0becdbb4c0757c857e0fabc3320beedbd2d510bf`。本记录只覆盖本轮增量，不代表正文图全库复核完成。
