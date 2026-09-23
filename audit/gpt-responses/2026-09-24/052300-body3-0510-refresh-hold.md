本轮有实际新增审核结果，但仍没有新的正文图满足 `published` 条件。

我先做了一次新的受控只读快照，run `35921664450` 已成功完成，artifact 为 `10777122857`，归档 SHA256 为 `f6278d35ec2f6d2583b94d8dba7224816900fd1337624f2877b45311b7a3e3f4`。这次在北京时间 2026-09-24 05:19 读取到 `stageRows=525`、当前世代记录 514、有效绑定记录 514、尚未上线绑定记录 44 张/12 篇，`errors=[]`。这些数量和 12 篇候选 DOI 与上一份有效证据完全一致，所以在现有受控索引可见范围内，没有发现新的 R2 staged 增量；我没有重复抓出版社、没有写 R2/D1，也没有启动 direct import/repair。

上一轮回报后新增完成了一小批逐图审核，现已形成 draft PR #194，批次 `body3-20260924-0510-01`。3 篇/3 张分别是：
- `10.1021/acscatal.6c04996` — Scheme 1，SHA256 `bc0eb1d6b74e28318772bc3bbb1cd61cb46f79ab56c90143602cd0583aa47003`；
- `10.1021/acscatal.6c05422` — Figure 2，SHA256 `eca02545934303579ae86c5704d8fe65717d7f0e32e67e8b08f8e4ff83fe90ce`；该文目前 article-level 抓取仍是 2/5 的部分覆盖，因此只批准这一张，没有把缺失图片推定为通过；
- `10.1021/acs.orglett.6c03543` — Scheme 1，SHA256 `3822099b1e601c3ef0e04f866454f55c3dfe95d40aaaa712e354141afccb0889`。

三张都已绑定 DOI、原始图号、完整 SHA256、独立图注和 evidence SHA256。受控物化 run `35920487676` 成功，artifact `10777061296` 的 digest 为 `2fa5349cb2260b48ff73d0b1eeb7cb78ad91d8c4570cb07d641b2f81547e19fa`；PR #194 的正文媒体门禁 run `35920605639` 也通过。PR 当前 head 为 `2a6c2158bd80554e7791fb29bdea6264adf0757b`。

但 #194 仍保持 draft、没有合并。Site quality gate run `35920605962` 依旧在 `Frontend build and typecheck` 的 Type-check 阶段失败；Worker dry-run、Production API smoke 和 Playwright interaction regression 均通过。这仍是前面已经确认的仓库级前端 typecheck 阻断，因此本媒体任务没有修改无关 UI 代码、没有绕过门禁，也没有强行合并 #192/#193/#194。

所以当前新增状态是：这 3 张为 `reviewed_pending_merge`，本轮新增 `published=0`。此前 18 张 `approved_waiting_deploy`、PR #193 的 11 张 reviewed/pending merge，以及之前 held 的单张疑问图均保持原状态；没有生产部署，就没有把 staged/物化成功冒充上线。隔离世代仍为 `1790082000000`，08:00/18:00 文献任务、卡片、中文标题、收录范围和生产文献数据均未改变。

本轮完整审计已经先写入 `audit/media-acceptance/2026-09-24-052200-body3-0510-refresh-hold.md`，对应审计 commit 为 `e2a2ddee1f69909a432580a40a8f4223cbfba2b3`。这只表示当前已审核增量和部署阻断状态，不代表正文图全库复核完成。