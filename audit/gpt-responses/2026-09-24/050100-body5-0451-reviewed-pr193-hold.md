本轮有新的逐图核验结果，但没有把任何新图片冒充为已经上线。

新增完成逐图语义核验的是 **5 篇、11 张正文图**：

- `10.1021/acs.orglett.6c03258`：Scheme 1–5，共 5 张；
- `10.1038/s41929-026-01600-0`：Figure 2–4，共 3 张；
- `10.1021/acscatal.6c05029`：Figure 2，1 张；
- `10.1021/acscatal.6c05787`：Scheme 1，1 张；
- `10.1021/acscatal.6c05293`：Figure 1，1 张；该图明确按正文 Figure 1 处理，没有当作 TOC。

本轮复用了受控只读证据 run `35901029985` / artifact `10769101601`，证据 ZIP SHA256 为 `d2225a7cef8bb4f8ed363460502716f419e9c9a7ddcce5a94987126f146503c2`。11 张图均核对了 DOI 任务/page/article/source 绑定、原图号与独立图注、真实冻结字节和完整 SHA256、固定世代、图像内容与论文主题、图像角色、重复风险、清晰度和既有同号图片覆盖风险；8 个 SVG 也检查了自包含性，3 个 Nature WebP 做了解码核验。抓取 success/marker 没有被当成语义批准。ACS Catalysis 三篇中报告的 article-level 抓取并不完整，因此这里只批准实际逐图核验的各 1 张，不批准缺失的其它图。

现有受控 `Materialize approved body assets` 工作流已经成功把这 11 张的冻结副本和规范审批清单物化到媒体分支：run `35919253279` 成功，生成 canonical batch `body5-20260924-0451-01`，asset commit 为 `e9cc38a0d3677c109d82dca12d11018c6da705b9`；materialization artifact 为 `10775728544`，digest 为 `sha256:c3e6da23c8195054f324b3f4d00752b98041dfe5a99cb95064f22344998b7d55`。该路径没有 R2 写入，也没有重新访问出版社。

已建立媒体 draft PR **#193**。它严格只有 13 个变更文件：11 个冻结正文图、1 个 canonical batch manifest、1 个 review packet；没有触碰受保护文献数据或前端源码。PR 上的 `Body review markers and incremental publication` run `35919366799` 已通过。

但 PR #193 仍保持 draft、未合并、未部署。Site quality gate run `35919366790` 的 `Frontend build and typecheck` job `107379073545` 在 Type-check 步骤失败；该分支基于仍含此前已确认的 `src/card-share.ts` 未使用 `galleryDeepLink` TypeScript 问题的同一 main 基线。`Worker dry-run` 与 `Production API smoke` 已通过，但既有质量门禁并非全绿；本媒体任务没有去修改无关 UI 源码来绕过门禁。同时 reviewed-vs-auto ownership handoff 的独立 PR #192 仍未合并，因此没有抢先合并 #193 或触发生产部署。

当前准确状态是：**本轮新增 11 张 = individually reviewed + materialized on draft PR #193，pending merge；本轮新增 published = 0**。之前 `body5-20260924-0011-01` 的 **18 张 `approved_waiting_deploy`** 和 **1 张 held** 保持不变；已隔离的 DOI/report-chain 污染子集也没有被重试或 promotion。隔离/媒体世代仍为 `1790082000000`。

完整审计先写入 `audit/media-acceptance/2026-09-24-050000-body5-0451-approved-pr193.md`，审计 commit 为 `b8a5e0e0f38c3bf4a954bf2f80146141300dfd0a`。本文件是本轮用户回报同步；因为该审计提交本身只新增 audit 文件，PR #193 后续在任何合并前仍必须重新读取最新 main/SHA、并行媒体变更和 protected literature，再按正常门禁更新/重放并完成上线后的逐图 URL/hash/卡片解码/TOC 保留验收。这里不宣称全库正文图复核完成。
