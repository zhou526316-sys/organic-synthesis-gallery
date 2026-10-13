# 经过来源与版权审核的科学章节检索索引

## 目标和非目标

在已正式收录、未撤回的 DOI 上建立真实科学正文的章节级全文搜索。必须保持原来的标题、作者、日期、原始摘要和经审核的中英文解读检索作为覆盖底座。仅依赖标题/摘要并不能发现论文正文中关于 LMCT、CPA、机理实验和底物拓展的真实提及。

本索引采用独立的 `LITERATURE_INDEX_DB` SQLite FTS5，而不是主 D1 或历史私人诊断表；它只接受**独立人工确认可以公开再利用**的 CC BY 3.0/4.0 或 CC0 科学正文。已有 Edge/Chrome Tampermonkey `local_only_permission_to_be_verified` 原始包一律不可直接上传这个公开接口。没有明确许可，仍可在当前浏览器合法本机检索，但服务器不存入其原文。

## 准入验证

1. 全部 `catalogId/doi/revision` 必须精确对应已完成、正在正式使用的同一目录代次，未审候选和旧版 DOI 必须拒绝。每条入库正文只能附属于某一已批准正式 DOI，不能由正文索引新建文献卡片。
2. 授权 `rightsReview` 要同时有 `decision=approved_public_reuse`、`itemLicenseVerified=true`、`pageDoi=doi`、`sourceSha256`、出版社 DOI 绑定的 HTTPS 正文地址、标准 CC BY/CC0 许可 URL、明确审核人员、审核时间和审阅说明。这是**审核凭证**，不是一个能够自动验证任何出版社许可的网络爬虫；真正许可须人工逐篇检查并留独立来源档案。
3. 入库者必须使用经过独立审核的正文结构，`origin=independently_reviewed_public_text` 且 `publicUploadAllowed=true`。浏览器本机 pilot 包不具有此状态。每段必须先验证 SHA256 和正文整体 SHA256，不可仅凭摘要或媒体回执制造假全文；每批 ≤8 个章节、每段正文 60–16000 字符，超过须拆批但不能绕开单 DOI 来源一致性；为防止覆盖已审核内容，不同来源 SHA 与相同 DOI 已存数据冲突时拒绝自动替换。
4. 仅允许科学章节：results/scope/mechanism/experimental/introduction/conclusion/figure_caption/table/other；排除 reference、版权法律及作者行政信息。完整性状态保留 `partial` 或 `complete_candidate`，后者仍不能证明出版社全部图表或 SI 已收齐。搜索命中“正文提及”不代表这是论文的核心方法学贡献。
5. 管理员导入入口 `POST /api/admin/literature-body-sections/import` 使用已有 Bridge Owner Bearer 鉴权；`GET /api/admin/literature-body-sections/coverage?catalogId=...` 同样需授权。不能通过公开 API 获取私人原始全文、Token、Cookie 或完整许可证审计日志。
6. 新公共 `GET /api/literature/body-matches?catalogId=...&q=LMCT` **默认关闭**。只有在 `LITERATURE_BODY_SEARCH_READ_ENABLED=1` 被单独启用、索引表存在且正式目录代次就绪时，它才返回已授权 DOI、章节、证据类型、原始文章归属和许可 URL；不回传正文文本。只有同一条件满足时，主目录检索 `catalog-view` 才将这些 DOI 作为受控 FTS 分支并入原来的全文检索，不覆盖原有标题／摘要结果，也不改变原排序和每页24/12条卡片规则。

## 当前阶段交付边界

- 本轮加入的是**安全关闭的生产可部署索引框架、严格入库合同和测试**。实际没有把 67 份本机数据或 743 篇历史文章的受限正文上传，也没有预先打开公共正文搜索。
- 上线前需要先真实检查10–20篇跨出版社文章，逐篇留下 DOI 精确身份、许可链接、科学章节和图注／表格完整性证据。用户实际的 Edge/Chrome 插件采集需要管理员自己触发，GitHub Actions 的模拟测试不能代替真实出版社访问。
- 因为当前用户截图中 588 篇版权证据仍待核实、46 篇科学正文不足，不以 250 科学字符将其宣称全文完成；也不取消高风险 HTTP 403/429 或验证码的保护措施。
- 启用公共检索之前还必须开展独立的线上 SCI/DOI 搜索基准对比（LMCT、手性磷酸、轴手性等）、跨日期和期刊筛选、FTS 游标完整性、回退到原来的索引、D1 使用配额及端到端版权审核。真实索引若为0篇必须明确呈现0，不得将模拟样本计入生产覆盖率。
- 本 PR 与历史正文 0.2.6 Tampermonkey 支线不同：不编辑 Pages、TOC、正文图、PDF、夜间历史 staging 或每天唯一08:00正式新增机制；两条支线仅通过已批准 DOI/权限可控的数据契约关联。
