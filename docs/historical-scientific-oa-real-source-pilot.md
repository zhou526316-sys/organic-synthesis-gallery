# 20 篇正式 DOI 开放科学正文来源实证审计

此项为用户批准的第三阶段验收，不是新的无限制正文爬虫，也不将已有浏览器私人文献包上送服务器。

**范围：** 从正式发布清单以及当前正式 TOC 媒体清单交集中选出 20 篇已核验 2026-10-01 前发表的 DOI，覆盖 Nature Communications、Nature Synthesis、Nature Chemistry、Nature Catalysis、Science Advances、JACS、ACS Catalysis 和 Organic Letters。优先较早发表者，以减少仓储入库延迟偏差。

**访问：** 仅使用欧洲 PMC 官方 `GET /search` 和开放全文子集 `/{PMCID}/fullTextXML`，严格验证 API 返回 DOI 是否与正式 DOI 匹配、`isOpenAccess=Y`、合法 PMCID、JATS 内层 article DOI 与 CC BY 3.0/4.0 或 CC0 的文章授权元信息一致。其他权限/存档缺项必须如实标记。若服务方返回429，停止余下访问，绝不使用代理、验证码绕过或身份 Cookie。检验段落总数、章节、科学结果、机理、方法、结论、图注和表格是否存在。该指示仅为**人工审核候选**，不能自行赋予 `approved_public_reuse`。

**输出：** 每篇只保留 DOI、期刊、正式在线日期、PMCID、来源 XML SHA256、明确的许可证类别、科学结构字段、字符数和状态。绝不保存 XML、段落、摘要、版权文本、PDF 或密码；不请求出版社文章站点，公共 FTS 导入次数始终为0。GitHub Actions 运行与7天产物可用于后续的合法版权/科学审阅。模拟测试不能充当真实来源证据。

**现存生产能力：** 历史本机采集0.2.6已有正文结构与权限拆分；独立的公共章节索引默认禁用，已通过 SQLite/FTS5测试。此试点不修改两个现存组件，不打开公开搜索。只有实际论文版权及科学专家独立审核完成，才能在另一授权事务中按 DOI/章节/sha 提交可再使用的正文，并进行真实线上召回率验收。

来源：Europe PMC 官方 [REST API](https://europepmc.org/RestfulWebService) 与 [Developer resource](https://europepmc.org/developers)；各文献最终需核实 JATS 中的文章级真实使用许可。
