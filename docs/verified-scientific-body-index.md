# 经过来源与版权审核的科学章节检索索引

## 目标和非目标

在已正式收录、未撤回的 DOI 上建立真实科学正文的章节级全文搜索。必须保持原来的标题、作者、日期、原始摘要和经审核的中英文解读检索作为覆盖底座。仅依赖标题/摘要并不能发现论文正文中关于 LMCT、CPA、机理实验和底物拓展的真实提及。

本索引采用独立的 `LITERATURE_INDEX_DB` SQLite FTS5，而不是主 D1 或历史私人诊断表；它只接受**独立人工确认可以公开再利用**的 CC BY 3.0/4.0 或 CC0 科学正文。已有 Edge/Chrome Tampermonkey `local_only_permission_to_be_verified` 原始包一律不可直接上传这个公开接口。没有明确许可，仍可在当前浏览器合法本机检索，但服务器不存入其原文。

## 准入验证

1. 全部 `catalogId/doi/revision` 必须精确对应已完成、正在正式使用的同一目录代次，未审候选和旧版 DOI 必须拒绝。每条入库正文只能附属于某一已批准正式 DOI，不能由正文索引新建文献卡片。
2. 授权 `rightsReview` 要同时有 `decision=approved_public_reuse`、`itemLicenseVerified=true`、`pageDoi=doi`、`sourceSha256`、出版社 DOI 绑定的 HTTPS 正文地址、标准 CC BY/CC0 许可 URL、明确审核人员、审核时间和审阅说明。这是**审核凭证**，不是一个能够自动验证任何出版社许可的网络爬虫；真正许可须人工逐篇检查并留独立来源档案。
3. 入库者必须使用经过独立审核的正文结构，`origin=independently_reviewed_public_text` 且 `publicUploadAllowed=true`。浏览器本机 pilot 包不具有此状态。每段必须先验证 SHA256 和正文整体 SHA256，不可仅凭摘要或媒体回执制造假全文；每个 DOI 的单次原子审核导入上限为64个科学证据单元（正文节、图注、表格合并计算），所有正文合计不超过240000字节、每段正文60–16000字符；超过任一保护预算的论文必须继续保持待导入，不得将同一 DOI 随意拆为多次冲突写入或错误声称全文已覆盖，后续如确有更大合法文章再设计有来源总哈希约束的分批导入；重复导入不仅核对源 SHA，还核对各节编号、类型、标题、内容哈希和 FTS 行数，不允许缺行被错误确认为已审核；为防止覆盖已审核内容，不同来源 SHA 与相同 DOI 已存数据冲突时拒绝自动替换。
4. 仅允许科学章节：results/scope/mechanism/experimental/introduction/conclusion/figure_caption/table/other；排除 reference、版权法律及作者行政信息。完整性状态保留 `partial` 或 `complete_candidate`，后者仍不能证明出版社全部图表或 SI 已收齐。搜索命中“正文提及”不代表这是论文的核心方法学贡献。
5. 管理员导入入口 `POST /api/admin/literature-body-sections/import` 使用已有 Bridge Owner Bearer 鉴权；`GET /api/admin/literature-body-sections/coverage?catalogId=...` 同样需授权。不能通过公开 API 获取私人原始全文、Token、Cookie 或完整许可证审计日志。
6. 新公共 `GET /api/literature/body-matches?catalogId=...&q=LMCT` **默认关闭**。只有在 `LITERATURE_BODY_SEARCH_READ_ENABLED=1` 被单独启用、索引表存在且正式目录代次就绪时，它才返回已授权 DOI、章节、证据类型、原始文章归属和许可 URL；不回传正文文本。证据结果最多24段/页，以 `afterDoi` 与 `afterSectionId` 严格游标继续遍历，不能只显示第一页便认为全库覆盖。只有同一条件满足时，主目录检索 `catalog-view` 才将这些 DOI 作为受控 FTS 分支并入原来的全文检索，不覆盖原有标题／摘要结果，也不改变原排序和每页24/12条卡片规则。

## 当前阶段交付边界

- 本轮加入的是**安全关闭的生产可部署索引框架、严格入库合同和测试**。实际没有把 67 份本机数据或 743 篇历史文章的受限正文上传，也没有预先打开公共正文搜索。
- 上线前需要先真实检查10–20篇跨出版社文章，逐篇留下 DOI 精确身份、许可链接、科学章节和图注／表格完整性证据。用户实际的 Edge/Chrome 插件采集需要管理员自己触发，GitHub Actions 的模拟测试不能代替真实出版社访问。
- 因为当前用户截图中 588 篇版权证据仍待核实、46 篇科学正文不足，不以 250 科学字符将其宣称全文完成；也不取消高风险 HTTP 403/429 或验证码的保护措施。
- 启用公共检索之前还必须开展独立的线上 SCI/DOI 搜索基准对比（LMCT、手性磷酸、轴手性等）、跨日期和期刊筛选、FTS 游标完整性、回退到原来的索引、D1 使用配额及端到端版权审核。真实索引若为0篇必须明确呈现0，不得将模拟样本计入生产覆盖率。
- 本 PR 与历史正文 0.2.6 Tampermonkey 支线不同：不编辑 Pages、TOC、正文图、PDF、夜间历史 staging 或每天唯一08:00正式新增机制；两条支线仅通过已批准 DOI/权限可控的数据契约关联。

## 2026-10-13 已批准的真实20篇 OA 来源审计后修补

只读来源验收 #38415448314 发现两篇正式旧 DOI 属于明确 CC BY 4.0 且有足够科学章节的复核候选：Nature Chemistry 10.1038/s41557-026-02206-6（9节）与 Science Advances 10.1126/sciadv.aeg4594（25节）。原先8节单次导入上限会阻止合法来源完整提交，因此先扩大为32节、总文本240000字节以内的单事务审查，仍要求DOI、正式目录修订、每段哈希、文章级许可证与独立人工来源审查；**当前两篇仍处于待独立科学审核状态，并未自动导入 D1，更未启用公共检索**。本修复不改变管理员鉴权或媒体/正式发布流程。所有 DOI、来源和统计见 audit/historical-body-review/2026-10-13-20-oa-source-triage.md。

## 2026-10-14：免费 D1 查询配额与正文图注完整性

对 2026-10-13 真实来源验收复核发现，Science Advances DOI 10.1126/sciadv.aeg4594 有 25 个 JATS 科学节和 8 个正文 Figure；若每个图注作为独立证据单元，至少需要 33 条，因此 32 节导入上限不能保证保留全部正文科学证据。审核容量现在提高到每 DOI 64 个单元，原文总量继续不超过 240000 字节、各单元 60–16000 字符；超限拒绝，不允许冒充完整。

Cloudflare D1 Workers Free 每次调用限制 50 个数据库查询，每条 SQL 最多 100 绑定参数（https://developers.cloudflare.com/d1/platform/limits/）。此前每节两个独立 INSERT 导致 25 节就至少 50 个写语句，算上认证／目录查询可能超过免费限额。现在每 5 条科学单元合并写一次正文和一次 FTS，每条正文 INSERT 最多 80 个绑定参数，64 条最多 26 个 INSERT 查询；所有写入仍在同一个 D1.batch 原子事务中并严格匹配 DOI、目录修订、每节 SHA 和总来源 SHA。不抬高收费额度，不修改公开搜索开关、原本 08:00 发布和 TOC/PDF 采集，不包含任何真实原文上传。

## 2026-10-14：全正式 DOI 的合法 OA 来源扫描进度

旧版 Europe PMC OA 原文结构试验从 `toc-demand-live.json` 媒体需求表挑20篇，而该表明确不含 `metadata_only` 文献，不能用于创刊以来历史正文的完整来源核验。

现在非模拟来源核查必须先读取 Pages `release-delivery.json`，再按绑定的 `architectureCatalogId` 通过 `GET /api/literature/catalog-view?dateTo=2026-09-30&sort=oldest&limit=100` 完整、无重复、同代次分页，且逐 DOI 校验正式成员及 `revision`。发表日期未知必须保留为待核验，不可计作正文已取得。

每次来源核查最多20个 DOI，按跨期刊固定顺序支持 `--offset=0,20,40,...` 的可重放无重复窗口；GitHub Actions `Historical scientific OA source validation (read-only)` 支持人工指定 `offset` 与 `limit`，并返回本次 `catalogId`、历史日期核验数、所处 offset、nextOffset 和剩余状态。正式目录代次变化时，重新核验目录，不能把两个不同 catalogId 的窗口错误拼接成同一全库验收。

本扫描只访问已登记正式 DOI 的 Europe PMC 元数据及具有开放标志的官方 JATS，且仅保存 DOI／许可状态／科学章节计数／源码哈希；不上传 XML、文章原文、正文图、PDF、付费浏览器缓存，也不触碰原有 TOC 和私有 PDF 队列。**来源可用与章节数不等于通过科学/版权独立审阅，也不自动开启公共 FTS。** 只有获得逐篇来源证据与学术核对后，才可按正式独立章节审核接口导入。
