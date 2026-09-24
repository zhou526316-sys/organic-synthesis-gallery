本轮完成了新的正文图增量核验：**5 篇、15 张正文图已逐图通过并冻结审批，但新增真正上线 `published=0`**。没有修改任何文献卡片、中文标题、收录范围、生产文献数据、08:00/18:00 文献任务或 userscript，隔离世代继续保持 `1790082000000`。

本轮先刷新了受控只读证据。`Read incremental media review evidence` run `35979551527` 成功，artifact `10799289278`，归档 SHA256 为 `a1931f8275c8ecc89c2e950515f4213b5dffe40f73d670b9a1699da253b156af`。冻结快照为 `stageRows=575`、`postCutoverRows=564`、`boundRows=564`、`unpublishedBoundRows=80`、`unpublishedBoundDois=22`、`errors=[]`。本次优先队列中有 5 个 DOI 已在旧 PR #208 完成不可变逐图审核但尚未合并，这 5 个结论直接复用并跳过，没有重复审核或重抓；随后按最新优先/JACS 同日优先继续取下一批真正未审候选。

本轮实际通过的是：`10.1021/jacs.6c14601` Figure 1；`10.1021/jacs.6c16323` Figure 4；`10.1021/acs.joc.6c01347` Scheme 4、Scheme 7；`10.1021/acs.orglett.6c03373` Scheme 1–5；`10.1021/acscatal.6c05820` Figure 1、Scheme 1–5。前两篇 JACS 的 article-level 报告仍分别为 partial 1/6，JOC 为 partial 2/8，因此只批准这些真实存在、逐字节核验通过的文件，没有推定其余缺图；Organic Letters `6c03373` 为最终 5/5，ACS Catalysis `6c05820` 为最终 6/6。历史 transport/format checkpoint 仅保留为来源证据，没有据此推断 VPN、R2、配额或出版社原因。

15 张均重新核对 task/page/article/source DOI、原始图号和独立图注、captureVersion/jobId、固定 media generation、content-addressed R2 key、真实字节长度/格式/尺寸、完整 SHA256、跨 DOI 重复来源/哈希风险、当前 public same-ID 状态和 TOC 分离。构成为 **11 个 SVG + 4 个 PNG**；SVG 全部实际渲染并检查 script、`foreignObject`、事件处理器、javascript/external href 与外部 CSS URL，PNG 全部实际解码并校验尺寸。15 张视觉内容均与文献主题和所属图注一致，没有发现推荐图/错文献污染或跨 DOI 复用。每篇现有官方 TOC 都是独立对象并保留；涉及 Figure 1 的项目明确仍是正文图，没有冒充 TOC。

审批 packet 为 `body5-20260924-1714`。现有 `Materialize approved body assets` run **`35980120431` 成功**，artifact `10799707524`，digest `sha256:66a161ef1c89675fd3c8289179611a860e66a53d962b151a8495b44b4df5cfc0`；生成 canonical batch `body5-20260924-1714-01`，冻结媒体分支 commit 为 `b8639b161260e16472d0c832a0a3294102e5731b`。工作流确认 `EXACT_REVIEW_PACKET_VERIFIED files=15`、`captionMutationRejected=15`、`productionWrites=0`、`r2Writes=0`、`publisherRequests=0`，并保持 `retainedDifferentFile=[]`、`notInCurrentCorpus=[]`、`quarantineUnchanged=true`、`stagingWrites=0`、`stagingDeletes=0`。

已建立 **draft PR #215：`Media: preserve 15 newly reviewed body figures`**。其 `Body review markers and incremental publication` run `35980278574` 已通过；Site quality gate run `35980278603` 也已全部通过，包括 Frontend build/typecheck、Worker dry-run、Production API smoke、Playwright interaction regression 和最终 Required quality gate。也就是说，本批媒体自身及现有站点质量门禁当前没有失败项。

但本轮仍没有合并或生产部署。原因是 2026-09-24 18:00 正式文献发布链已经开始准备并持续移动 `main`：本轮期间 main 从 `92c00db4c31f588d42195bc8068c722d581b49c8` 前进到 `4069131ff4fb4d8e24e3dd0b0360e1654ef4fe71`，最新提交是新的 literature completeness snapshot，正式槽位正在处理显著扩大的 unresolved 集合。按照媒体/正式发布并行冲突规则，#215 保持 draft，本轮只完成不可变审批、物化和完整门禁，不去抢写 main，也不触发 Pages。

因此当前准确状态为：**本轮新增 `reviewed_pending_merge=15 张 / 5 篇`，新增 `published=0`**。完整逐图 SHA256/证据指纹和 R2 对象绑定已记录在 `audit/media-acceptance/2026-09-24-172100-body5-1714-reviewed-pr215-hold.md`；这仍只是本轮受控增量审核，不代表正文图全库复核完成。