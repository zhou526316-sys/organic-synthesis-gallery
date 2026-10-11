本轮有新增实质结果，但仍没有把新的正文图标记为 `published`。

本轮完成了 `10.1021/acs.orglett.6c03543` 最后两张 deferred 正文图的逐图审核：Scheme 2 与 Scheme 3，共 1 篇/2 张。Scheme 2 的冻结 SVG 为 1,120,914 bytes，SHA256 `54c9e1ce24ce43c597c10755d417bf7b06dc059ccef3fc6f302cc35f5c184808`；Scheme 3 为 415,170 bytes，SHA256 `e9c419fca2650c3745851b8eb4ff6e546c245d8f5aaaa2ac46cd35bf8a58b359`。两张均重新核对了 page/article/source DOI、原始图号和独立图注、真实冻结字节、完整 SHA256、文章主题和图像角色；均为自包含 SVG，没有 script、`foreignObject`、javascript/external href/event-handler 内容。视觉内容分别对应 Bi(OTf)3 催化 2-deoxyrhamnosylation/late-stage glycosylation scope 和 conformational-locking mechanistic rationale，与该文主题/图注一致，清晰且互不重复，也都明确是正文 Scheme，不是 TOC。此前已经审核的 Scheme 1 没有重复加入。

我继续复用了 immutable evidence run `35933700007` / artifact `10781649022`，archive SHA256 `73f5281cbf04a6443168a03b154881ebe37894b01b7c7070903e188e3ed930c9`；没有重新访问出版社。报告链最终是同一 DOI 的 `figures=3/3` 成功记录，两个文件来自直接 ACS Silverchair SVG；早先 status 0/transport 失败只保留为历史，没有据此推断 VPN、R2 或配额原因。

审核 packet `body1-20260924-0814` 已写入独立媒体分支，首个 packet commit 为 `52ac9346e44bb053c18a001fa5007de550f2a4b1`。现有 `Materialize approved body assets` run `35937524074` 成功，生成 canonical batch `body1-20260924-0814-01` 和两份 full-SHA frozen assets，bot commit 为 `24300d2314b7fee61e31620f94286367b386cbab`。materialization artifact 为 `10783616288`，digest 为 `sha256:76b9263163881c8a60bf3080384e98078926c0c747f68d40f9b96758df421891`。现有日志明确给出 `EXACT_REVIEW_PACKET_VERIFIED files=2`、`productionWrites=0`、`r2Writes=0`、`publisherRequests=0`；batch build 为 `retainedDifferentFile=[]`、`notInCurrentCorpus=[]`、`quarantineUnchanged=true`，所以没有覆盖现有更好媒体，也没有改变隔离世代 `1790082000000`。

已建立 draft PR #197 `Media: preserve two reviewed Organic Letters body images`。正文媒体门禁 run `35937591720` 已通过；Site quality gate run `35937591702` 已结束为 failure，具体仍是 main 上已有的 frontend typecheck 错误：`src/card-share.ts(52,10): TS6133: 'galleryDeepLink' is declared but its value is never read.`。Worker dry-run 和 Production API smoke 已通过。本媒体任务没有修改这个无关前端问题，也没有降低门禁。

与此同时，08:00 正式文献流程在本轮期间持续改动 main：我看到 main 从 `69af8d4788297a8c52a4e6d0416e33361de05720`、`b215a5e0b9341f1ac55cce1e7522fa6b2c74376b` 继续前进到 `d0d0892a2a0fb8a50082772b59fde918b34cc6dd`；最新观察到的 prepublish gate run `35937638326` 已通过，但 main 仍在继续写入正式文献审计修正，所以本媒体任务没有把正式发布/部署链视为已经完全脱离并行冲突。按你的规则，本轮只保留审批和 draft PR，不合并、不触发生产 Pages，也不碰 #192 的 reviewed-vs-auto controller 修复。

因此当前准确状态是：本轮新增 `reviewed_pending_merge = 2 张 / 1 篇`，新增 `published = 0`。没有生产部署，所以没有把 materialized/PR 状态冒充上线；之前的 `approved_waiting_deploy`、其他 draft 媒体批次、held 和污染隔离子集均保持原状态。没有修改文献卡片、中文标题、收录范围、生产文献数据、08:00/18:00 任务或 userscript。

本轮完整记录已先同步到 `audit/media-acceptance/2026-09-24-0818-body1-0814-reviewed-pr197-hold.md` 和 `audit/gpt-responses/2026-09-24/0819-body1-0814-reviewed-pr197-hold.md`（PR #197 分支）。下一轮只有在正式文献部署冲突确认结束、最新 main/SHA 重新读取、#197 质量门禁与既有 controller 条件都安全后，才考虑合并及生产部署；部署后仍需逐个核验线上 URL、完整哈希、图号、真实卡片解码和原 TOC 保留，届时才能把这两张改成 `published`。这不是全库正文图复核完成的声明。
