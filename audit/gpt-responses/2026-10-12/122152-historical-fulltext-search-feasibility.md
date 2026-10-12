# Organic Synthesis Gallery — 历史正文检索与 PDF 容量方案核验

- 北京时间：2026-10-12 12:21:52（Asia/Shanghai）
- 工作线：摘要统一采集、全文检索、历史回溯 / 方案核实（未批准实施、未改生产代码）
- 仓库：zhou526316-sys/organic-synthesis-gallery；main 唯一生产基线
- 正式 DOI：964（main: audit/publication-release-state.json，slot 2026-10-12T08:00:00+08:00，blob cb38f6d75a2b27f78dd10f37dc101e32d0c5c3f4；public/toc-demand-live.json 964）
- 历史覆盖率 904/938、423/443 是 2026-10-11 的旧审计快照，不得直接冒充 964 篇的今天实时摘要覆盖。
- 审计状态：read_only_only / proposed / historical-contract-amendment-needs-approval

## 用户问题与主结论

用户认为大部分文献卡片要么无摘要、要么摘要非常短，对阅读与文献检索贡献不足，考虑对 16 刊未来全历史库扩展全文来源；2026-10-01 前旧论文只保留 Markdown 或更轻量的可检索正文而不必保存 PDF，询问服务器承载与可行性。

**技术上可行，最佳解不是“抓齐所有历史 PDF 并永存”，而是“优先合法的机器可读全文 + 结构化正文段落索引 + 可信双语解释”。旧论文不新增无必要 PDF；2026-10-01 之后仍保留原有 PDF 阅读策略，新增检索索引不改变其采集授权。**

现有已核实架构：docs/search-abstract-recall-contract.md；cloudflare/literature-catalog-index-v1.sql；cloudflare/worker/src/literature-catalog-index.js；cloudflare/worker/src/literature-search-enrichment.js。现有 D1 SQLite FTS5 trigram 仅覆盖标题元数据、原始 Abstract、已审核解读，没有逐 DOI 正文段落索引；原始摘要在后台与公开 200 字符 abstractExcerpt 是不同层次，公开节选不得冒充全文。摘要改善与全文召回需要分别规划。

用户既定历史媒体契约 docs/historical-backfill-media-contract.md 在 2026-07 前 metadata_only、2026-07 至 09 toc_only 之外明确不准抓历史正文、SI、PDF。要实施新方案，需用户明确批准增设“历史合规正文检索索引”例外，而不是暗改 Tampermonkey 历史 PDF 抓取。历史 DOI 必须先经既有 scope 双遍审核正式纳入；23:00 历史候选 staging 不能自动进入公开搜索。原有真实资产不删除。

## 容量与花费（估算不冒充当期配额）

2026-10-08 用户腾讯主机资源证据：2核、2GB RAM、40GB 磁盘、当时约7.3GB 已用 /32.7GB 未用。参阅 audit/private-pdf/2026-10-08-tencent-instance-resource-screenshot-assessment.md。2026-10-12 当前实际空闲磁盘、R2 实际使用量未经直接账号查询，不能保证所有历史 PDF 能存入原服务器。

仅用于方案测算：每篇 PDF 假设 5MB；1000篇≈5GB、10000篇≈50GB、50000篇≈250GB。正文纯文本/精简 Markdown 假设 100KB/篇；10000篇≈1GB、50000篇≈5GB，不含 FTS 索引冗余、版本、结构元数据、备份。FTS5 trigram 索引可能增加数倍空间，须以100-300篇样本测算，不能把未压缩Markdown大小等同总系统占用。40GB VM 不适合无上限长期存历史 PDF，2GB RAM 不宜直接重度GROBID/OCR/神经全文解析。以既有 GitHub runner/被许可的远程结构化全文作为提取来源，任务有界分批。国内腾讯PDF网关 256MiB/月是**主动设置的转发保留上限**，不是机器硬盘大小或 Cloudflare R2 容量，不应让批量 PDF 获取走该阅读网关；参考 docs/pdf-tencent-owner-first-pilot-20261010.md。

R2 和腾讯 VM 是两套存储：Cloudflare R2 Standard 官方每月免费10GB-month，超过 $0.015/GB-month，加请求费用；若50GB均由当前账户存储且免费层未被别的对象占用，纯存储约$0.60/月；250GB约$3.60/月，账户现有已用容量、操作数及计费舍入都影响实际账单。官方 https://developers.cloudflare.com/r2/pricing/ 。D1 免费单库500MB、账户总5GB（其他配额另算），不宜把无限制的全文 Markdown 和重型 trigram FTS 填入现有数据库；官方 https://developers.cloudflare.com/d1/platform/limits/ 。

## 推荐架构

来源优先级：1) OpenAlex 已存在的开放获取 TEI GROBID XML (content_urls.grobid_xml)——很多论文不必下载PDF，可直接取得已解析正文标题/章节/段落/图注。官方 https://help.openalex.org/access/fulltext/ ；2) Europe PMC/PMC 允许重复利用的 OA XML，核实逐篇许可 https://pmc.ncbi.nlm.nih.gov/tools/textmining/ ；3) Crossref metadata 的TDM链接以及出版社官方 XML / HTML，仅在当前论文授权和 API 条款允许时使用 https://www.crossref.org/documentation/retrieve-metadata/text-and-data-mining/ ；4) 用户合法持有且权利允许的 PDF 在授权环境一次性解析，不默认上传存储旧 PDF。开放获取不等于可任意转载；OpenAlex PDF 保留原版权。403、登录、付费、反爬、无许可等情况保留 reason，不绕过访问限制也不宣称全文覆盖率100%。

统一的条目结构：DOI、articleVersion、section、paragraph、figure/scheme caption、sourcePage/URL、license、source SHA256、text version、index status、snippet rights。只为已正式入库 DOI 发布索引，旧 DOI 实施上以原始发表日期划界，避免用户新近补录让旧文章被误判 Oct1+。将允许保存的正文转成结构化段落 JSONL.gz / TEI.gz，或合规 Markdown.gz，保存在低频归档对象/受控存储；D1保留轻量倒排/FTS和 DOI-章节定位，不将整篇正文塞到返回页面。大库可按期刊年代分片、多D1或独立 SQLite；不能假设 D1免费单库持续装得下。

检索升级：化学同义词与双语别名（LMCT、ligand-to-metal charge transfer、配体到金属电荷转移；Ni(I)/Ni(II)、CO2/CO₂；CPA；ee/dr；1,1-/syn-）；标题、摘要、正文、机理、图注分别赋权；保留每条命中实际的正文章节与来源位置、版本及审查状态。优先稳定 FTS5 关键词召回；中长期加入可审核的语义检索、反应类型/产物/键构建索引，避免仅靠embedding误判化学结构。PDF文字层可能缺失Scheme化学结构，单纯Markdown无法保证结构检索完整；未能核实的数据不可编造。公开搜索结果只按许可显示合规短片段、原文链接或有来源的科学概述；不能因为自己有校园VPN就对所有账号公开版权全文。

卡片阅读同步改进：对已有可信摘要来源优先双遍审核形成较完整、独立的中文/英文研究概述（研究问题、反应类型、创新、关键证据、局限仅在来源支持时），明确“基于Abstract”或“基于Fulltext”，不是把200字符节选改标为完整摘要。含真人审核的当前Evidence v2必须按 sourceHash/evidencePacketHash，20个不匹配不得直接换哈希。

## 风险/逐步验收与状态

先按全部 964 正式 DOI 加合法的历史候选清单做只读来源可用性与许可清查，按16期刊、年份、OA状态、TEI/XML能力、PDF-only、license pending 分类并预测样本大小；再做100–300篇跨刊跨年合规OA小批量索引独立试验，实测提取正确率、原文DOI、FTS空间、中文检索、首屏速度、来源位置、重复文献、网站行为。原有每日上午北京时间08:00唯一正式新增不变；不新建冲突定时任务；历史索引不会造成新文献上线、热门/当天新增改变。全文提取失败不得令原有搜索降级或停止。

工作状态：本轮只有只读核查与方案文档；没有实际批量采集、转换、存储、改搜索/摘要页面、改历史媒体契约或合并/部署功能。后续实施需用户明确批准“历史合规全文文本检索专用例外；不必为旧论文永久保存 PDF”，且先统计真实许可证和容量，避免自称有全库全文来源。

## 参考
- https://help.openalex.org/access/fulltext/
- https://help.openalex.org/data/works/open-access/
- https://pmc.ncbi.nlm.nih.gov/tools/textmining/
- https://www.crossref.org/documentation/retrieve-metadata/text-and-data-mining/
- https://dev.springernature.com/docs/api-endpoints/fulltext-api/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
