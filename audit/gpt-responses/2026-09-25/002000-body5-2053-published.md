本轮有实质进展：上一轮仍停留在 `reviewed_pending_merge` 的 `body5-20260924-2053-01` 已完成 exact-blob 安全重放、生产部署和独立线上验收，因此这批 **5 篇、12 张正文图现在可以正式标记为 `published_verified`**，不再只是 approved/staged/merged。

这 12 张是：`10.1021/acs.joc.6c01846` 的 Scheme 1–3；`10.1021/acs.joc.6c01939` 的 Scheme 1、4；`10.1021/acs.orglett.6c03443` 的 Figure 3；`10.1021/acs.orglett.6c03851` 的 Scheme 1–5；`10.1021/jacs.6c13635` 的 Figure 1。原始逐图审核、完整 SHA256 和 evidence fingerprint 均未改变，继续复用原只读证据 run `36001020325` / artifact `10808132140`、受控 materialization run `36002940494` 以及 frozen commit `fb81bebb23c3162f8eba07b8a696bfb161b2fbe3`。其中 `10.1021/jacs.6c13635` 的 Figure 1 仍明确作为正文 Figure 1，不是 TOC；此前正确的 Figure 3、4 继续保留。

用于解决旧 PR 分叉问题的 exact replay PR #229 已合并，merge commit 为 `32f77b21a5b85a5b5997b8d7a455ca25da8dc150`；随后媒体部署触发 commit 为 `938a18d05f96e1c461e07db426b1bcdfc973584c`。生产 Pages run `36024077770` 已全部通过，其中 `literature_authorization` job `107716023329`、build job `107716125810`、deploy job `107717259397` 均为 success，因此没有绕过文献授权边界，也没有抢写 08:00/18:00 的生产文献流程。

部署后的专用只读线上验收 run `36024530321` / job `107717571095` 也已 success，返回：`BODY_LIVE_ACCEPTANCE {"result":"passed","checkedAt":"2026-09-24T16:04:10.013Z","files":328,"cards":5,"browserRenderingVerified":true}`。这里的 `files=328` 是当前全部已批准 reviewed-body 的线上精确验收总数，不是本轮新增 328 张；**本轮新增真正上线仍是 12 张**。验收 artifact 为 `10819236875`，digest 为 `sha256:999c5f386b2572a45d216f26a9cf80057c92a9de5b8e773d350d56489228e204`。验收快照显示 `approvedItems=328`、`publishedExact=328`、`retainedDifferentFile=0`、`notInCurrentCorpus=0`、`productionWrites=0`。

5 张目标真实卡片均在线可见，所有目标正文图均在浏览器中成功解码，5 张卡片的独立 TOC 均仍存在；单独的 restored-TOC live verifier run `36024530314` 也已通过。没有用正文 Figure 1 或 Scheme 冒充 TOC，也没有覆盖已有更好且正确的 TOC/正文图。

因此本批当前准确状态是：**`published_verified = 12 张 / 5 篇`，本批 `reviewed_pending_merge = 0`**。文章级抓取仍为 partial 的条目仍不做“整篇完整”推断，只对上述 DOI + 图号 + 完整 SHA256 + evidence fingerprint 精确绑定的 12 张晋级为已发布。

隔离世代继续保持 `1790082000000`。本轮没有重新向出版社批量下载，没有触发 server-side direct import/repair，没有修改 R2 原对象、用户本机设置或 userscript，也没有新增/删除/修改文献卡片、中文标题、收录范围或生产文献数据。完整发布验收已写入 `audit/media-acceptance/2026-09-25-001100-body5-2053-published.md`。本结果仍只是这一受控小批次的完成状态，不代表正文图全库已经复核完成。