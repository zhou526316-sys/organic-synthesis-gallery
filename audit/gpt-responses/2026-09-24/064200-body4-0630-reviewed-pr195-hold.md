本轮新增完成了 **4 篇文献、16 张正文图**的逐图语义核验和受控物化，但没有把任何一张标记为 `published`。

本批为 `body4-20260924-0630-01`。新增逐图通过的是：`10.1021/acs.orglett.6c03356` 的 Scheme 3/4；`10.1021/acs.orglett.6c03494` 的 Scheme 1–4；`10.1021/acs.orglett.6c03078` 的 Scheme 1–4；`10.1021/acs.orglett.6c03248` 的正文 Figure 1 与 Scheme 1/3/4/5/6。`10.1021/acs.orglett.6c03248` 的 Figure 1 明确按正文图处理，不作为 TOC；该文当前冻结证据仍是 6/7，缺失的 Scheme 2 没有被推定为通过。`10.1021/acs.orglett.6c03356` 的 article-level 报告仍为 partial，因此也只批准实际逐图检查的 Scheme 3/4，原先已经上线的 Scheme 2 保持不动。

本轮复用了受控只读证据 run `35921664450` / artifact `10777122857`，归档 SHA256 为 `f6278d35ec2f6d2583b94d8dba7224816900fd1337624f2877b45311b7a3e3f4`。16 张均重新核对 task/page/article/source DOI、原始图号和独立图注、真实冻结字节与完整 SHA256、文章主题匹配、正文图角色、重复/同号覆盖风险、格式与清晰度；所选 SVG 均确认无 active script、foreignObject 和外部 href。没有重新向出版社抓取，也没有 R2/D1 写入、direct import/repair、userscript 或文献数据改动。

现有受控 `Materialize approved body assets` 工作流 run `35929258040` 已成功完成，fingerprint 校验、明确对象读取、reviewed-media 构建/回归、static-media-integrity、protected-literature diff 和 canonical manifest 提交均通过。materialization artifact 为 `10780406189`，digest 为 `sha256:98b58ed6b82e30d92968faa9ee44ec194f0be36ceb4ed0b685c37f94345b3ed7`；生成 branch commit 为 `f2f1cb2eba953d2449adb303b72f73c9571513eb`。对应 draft PR 已建立为 **#195**，其 Body review gate run `35929343442` 已通过。

但是 #195 仍不能合并。Site quality gate run `35929343423` 的 frontend typecheck job `107411951090` 再次在 `src/card-share.ts(52,10)` 失败，错误仍是 `TS6133: 'galleryDeepLink' is declared but its value is never read.`；这是此前已经确认的 main 级前端阻断，不是本媒体批次引入。Worker dry-run 和 Production API smoke 已通过；本媒体任务没有修改无关前端代码或绕过门禁。reviewed-vs-auto ownership handoff PR #192 也仍未安全解决，因此本轮没有尝试生产合并和部署。

所以当前准确状态是：**本轮新增 16 张 = `reviewed_pending_merge`，新增 `published = 0`**。此前 `body5-20260924-0011-01` 的 18 张仍为 `approved_waiting_deploy`，PR #193 的 11 张和 PR #194 的 3 张仍为 reviewed/pending merge；原 held 与隔离污染子集状态不变。隔离世代继续保持 `1790082000000`。

完整审核记录已先写入 `audit/media-acceptance/2026-09-24-064100-body4-0630-reviewed-pr195-hold.md`，audit commit 为 `67df6a2ed945b7e25a2c3b3a02fc7f91db1fd628`。本次只覆盖上述受控增量，不代表正文图全库已经复核完成。
