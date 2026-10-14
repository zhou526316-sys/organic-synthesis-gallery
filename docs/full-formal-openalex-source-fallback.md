# 全部正式 DOI：OpenAlex 第二来源正文可用性核验

2026-10-14，官方 Europe PMC 第一来源实际完成 `1087/1087` 个正式 DOI，47 篇为许可与结构待复审候选，662 篇该来源 DOI 未匹配、319 篇无符合条件的该来源 OA 全文，其他许可受限/科学结构问题另列。只完成来源核验，不是 1087 篇正文入库。

鉴于第一来源不可能独立满足全部正文检索目标，已批准在同一正式 DOI 集（包含 10 月新增和日期不明）上运行 **OpenAlex 第二来源独立交叉核验**。新工具不是再从旧的 `toc-demand-live.json` 挑选 20 或 50 篇；读取正式 `release-delivery.json` 与 `catalog-view` 全量成员及 revision，同一任务自动分成约100 DOI 的技术分片；拒绝目录代次改变、缺 DOI、重复等虚假完成。

只调用单篇 DOI 的 OpenAlex Work 元数据接口；已有项目 `OPENALEX_API_KEY` 若配置则通过 GitHub Actions Secrets 环境变量注入，不回显、不上传，未配置时使用允许的匿名调用并明确报告限流。记录每篇精确 DOI、OA 标志、TEI/GROBID 结构化全文是否存在、开放版许可证标志、工作记录身份及失败代码。结果写入 Git 审计，**不自动下载 OpenAlex PDF/TEI、无付费下载、无订阅出版页访问、无图片、无SI，也不把 OA 声明当作正文公共转载许可**。

明确的后续分流：
- TEI 可用 + 开放许可信号：进入逐 DOI 许可证、DOI归属、科学章节和完整性审核；审核前不导入公共 FTS。
- TEI 可用但许可不明/受限：仍保留线索，不上传公开全文。
- DOI 未匹配或没有 TEI：转出版社开放网页、机构库等其他合法来源验证，或受权浏览器本机检索。
- OpenAlex 官方文档提醒，GROBID/PDF-to-TEI 可能遗漏正文或错误识别 DOI；即使取得 XML 也必须逐篇核验，不能用 `has_content` 替代完整性证据。

本增量流程不改变唯一每日 08:00 新文献正式发布、历史23:00 staging、TOC/正文图/PDF 主采集，也不自动打开公共全文查询开关。

OpenAlex 2026 年官方说明：
- https://help.openalex.org/access/fulltext/
- https://help.openalex.org/api/authentication/
