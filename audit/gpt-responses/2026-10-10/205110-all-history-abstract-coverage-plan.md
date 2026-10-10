# 2026-10-10 20:51 Asia/Shanghai — 全历史文献摘要覆盖核验与拟议改造

会话：用户询问“现在的要求是所有文献都要有摘要，包括未来抓取的所有历史文献；目前卡片几乎没有摘要，怎么实现？”
状态：只读核验和实施方案；尚未修改修复代码、生产数据库、摘要记录、发布计划或正式网站。

## 已经向用户反馈的首轮结果

目前的问题不是单纯摘要抓取数量不足，而是 Gallery 的摘要采集、检索索引和卡片展示分为不同数据链路，没有统一覆盖。GitHub main 公开注册表 public/toc-demand-live.json 含 938 条 DOI；public/scheduled-article-summaries.json 有 443 条已批准且中英文非空的解读，占 47.2%。这是仓库静态记录，并非线上真实可打开比例。原始英文摘要经 OpenAlex / Crossref 同步至搜索专用 D1；卡片按钮只读取 Evidence 校验的 /api/user-ui/article-summary。

## 进一步核验

- 938 条正式 DOI 中，443 条有已批准解读文件、495 条没有。
- 442 条没有 addedDate，其中 76 条有批准解读、366 条没有。
- 228 条 addedDate >= 2026-10-01，其中 129 条有批准解读、99 条没有。
- 其余 268 条有较早 addedDate，其中 238 条有批准解读、30 条没有。
- docs/scheduled-summary-contract.md 与 audit/summary-publication-policy.json 将未来深度解读范围限定为 addedDate >= 2026-10-01；历史摘要需求需要独立于深度解读。
- scripts/historical-nightly-discovery.mjs 对候选只存摘要可用性和 source，storedText:false；没把摘要文字作为入库后卡片的持久交付。
- cloudflare/worker/src/article-summary.js 在无可用 Evidence 时直接返回 available:false；src/user-ui/shared.ts 的 articleSummary 只读这个接口，paper-actions.ts 因而显示“缺失证据/待处理”。
- cloudflare/worker/src/literature-search-enrichment.js 的 /api/literature/abstract 仅返回至多200个字符的 original abstract excerpt，考虑版权，不能充作完整公开摘要。
- 尚无在线 D1 完整来源覆盖率 / 逐 DOI 线上响应抽样核验；不可据仓库443条声称线上真正可用443条。
- Crossref 明确指出存储的部分原文摘要仍受出版社或作者版权保护；OpenAlex 倒排摘要也不授予完整转载许可。来源：
  https://www.crossref.org/documentation/retrieve-metadata/rest-api/
  https://www.crossref.org/documentation/retrieve-metadata/
  https://help.openalex.org/data/works/attributes/

## 对用户建议的实施方案（待该修复批次明确批准）

1. 建立独立的双语基础摘要记录层，和 Article Evidence / 12:00 深度解读区分。键为 DOI + 正式目录 revision，保留摘要来源、来源URL、原文证据指纹、展示许可证或使用状态、核验日期、已审核中文/英文事实概述、缺失理由和下次重试时间。不能把 AI 概述标为官方原文摘要。
2. 元数据抓取优先精确 DOI 匹配的官方文章页面、Crossref JATS、OpenAlex 倒排摘要；缺失再尝试 Europe PMC / Semantic Scholar / 合法作者版本。正文或私有PDF不因历史摘要而新抓，原始摘要展示需许可审核；无法许可时只显示来源链接及有证据支持的独立研究概述。
3. 调整独立公开卡片 API，确保没有 R2 Evidence 的历史 DOI 也能返回已核验基础摘要；有 current-hash verified 深度解读时可在独立标签显示。前端使用“中文摘要 / English / 深度解读”，注明“原文摘要/研究概述”来源；未授权不返回受限全文。原有200字符摘录不冒充完整摘要。
4. 回补全938条的缺口，分类统计：可展示原摘要、可发表审核概述、来源缺失、版权限制、源接口失败、当前Evidence失效。优先给495条无批准解读的 DOI 建立基础摘要；443条要检验线上可读，而非不加核验地批量重生成。
5. 未来夜间23:00历史任务保持staging-only；仅通过范围双遍审核并按08:00正式发表的 DOI 加入展示和检索。7—9月仍仅新抓官方 TOC，2026-07-01以前 metadata-only；没有TOC/正文图/PDF的历史论文也能独立显示摘要。保留现有23:20缺失元数据重试及12:00深度解读，不新建冲突发布槽；历史摘要靠持久分页游标续跑，避免超时和重复请求。
6. 上线门禁按正式 DOI 集合计算 summary_display_coverage、source_provenance_coverage 和 pendingMissing，回归测试全时段检索（如 LMCT）、跨刊分页、日期筛选、卡片内容一致性、历史文献不会进入每日新增/热门/公众号新增。不因源缺失编造100%；无法验证的古老文献要有可追踪未完成原因。
7. 生产日报唯一新增时刻仍为北京时间08:00，不因个别文献摘要短缺错误更改、停发。项目反馈规则要求核验并取得本批改动明确批准后才能实施修复。

## 即将向用户展示的结论

最优先的不是重抓所有PDF，而是接通“摘要数据库→卡片显示”的独立读取链，并为全部正式 DOI 做持久补漏；基础摘要应覆盖历史与未来全部收录文献，深度解读继续按授权证据流程运行。无法从合法可信信息获取内容的旧文献只能列为未完成核验，不能从标题臆造化学内容。已核验方案但未部署修复，待用户明确批准。
