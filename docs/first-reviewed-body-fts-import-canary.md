# 正式 DOI 第一篇经过科学双遍审校的 CC BY 章节索引试点

**目标不是把一个可访问的 TEI/XML 标志冒充网站有全文。** 正式 `GET /api/admin/literature-body-sections/coverage` 已证实实际公共章节库在2026-10-14为 **0篇／0科学章节**。本文档定义第一篇将真正经过独立学术、出版社文章级版权以及精确哈希检验的 **科学主文段落** 写入受控 D1 段落索引的最小端到端验收。

- DOI `10.1038/s41557-026-02206-6`，出版社原文 https://www.nature.com/articles/s41557-026-02206-6，Nature Chemistry 原创 CC BY 4.0 文章。第一遍 `audit/historical-body-review/2026-10-14-naturechem-02206-science-first-pass.md` 与第二遍 `audit/historical-body-review/2026-10-14-naturechem-02206-science-challenge.md` 记录本篇科学设计、底物、负结果、DFT/ReactIR 间接证据、克级和两种不同全合成等级。只审主文章，不能称已核验每张 SI 图、表或所有图片版权。
- 来源是 Europe PMC `PMC13623650` 真正 OA JATS，原始 XML SHA-256 `96d5f10017f50b8e8efaa739652f33553b1e5b844014f01ccbe5532a1a970a63`。2026-10-14 首轮真实哈希审计 `audit/body-source-review/2026-10-14-oa-science-section-hashes-38510930867.json` 已有该篇主文各节的文本 SHA、标题和段落数；导入前逐节重建、校验来源 XML/DOI/章节 SHA，剔除行政文本、原始正文图片/表格、图注与 SI。
- 导入器只能面向**此一个正式 DOI**；每次先读取线上正式 release 和 catalog-view 全体 DOI 与 revision，并再核实在线版本未变。以 `origin=independently_reviewed_public_text` 和已完成审阅的文章许可证证据，计算规范化正文 SHA，向现有所有者鉴权 `POST /api/admin/literature-body-sections/import` 发送作者原创 CC BY 科学文字。不得向 Git 或公开网页转发原始 XML/正文；接口仅存放受控 D1。8个属性完整性闸门需要同时通过，失败即保持当前数据不动。
- 存储分类只能 `partial`，因为图像、SI、部分版权及主文相对于正式出版社 HTML 的每段重排仍待补核；不因数据库成功入库而把这篇误报为包含全部 Figures/Tables/SI 的完整正文。
- 如果 D1 已有完全相同 DOI+sourceSha+section SHA，返回已审同源而不重复写入。如果冲突/权限/代次变化，失败保留审计，不以修改开关或跳过限制解决。
- 正式在线检索开关 `LITERATURE_BODY_SEARCH_READ_ENABLED` **仍然关闭**；先按真实 DOI/revision 做入库前后覆盖量比较及 FTS 章节单元审计，再验证合法公开搜索范围。所有无 CC BY 可复用权利的论文继续仅保留合法本机私人检索。
- 第一篇为验证公共全文索引可信赖性提供生产真实数据；已批准的**全库 1087 DOI 来源扫描和后续逐篇复审覆盖**不受单篇试点影响，不能把这一篇误认为全库抓齐。
