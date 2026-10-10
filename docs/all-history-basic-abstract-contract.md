# 全历史文献基础摘要契约（2026-10-10 批准）

## 覆盖与边界

- 范围是 Gallery **所有已正式审核且仍在库的 DOI**：现有 938 篇，未来所有新收录及按期刊范围审核通过的历史文献。不能把夜间历史候选、pending 或已排除论文当成正式卡片。
- 摘要的取得不限制于 2026-10-01。历史采集媒体规则不变：2026-07-01 以前 `metadata_only`，2026 年 7–9 月 `toc_only`；不得为摘要需要重新获取历史正文图、付费全文、SI 或 PDF。
- 唯一正式新增仍为北京时间每日 08:00；23:00 历史发现仅 staging，23:20 缺摘要元数据追补只更新索引，12:00 深度解读路径仍是独立工作，不能视为自动全文翻译。
- 可追溯与展示遵循三类：A `scheduled_reviewed_evidence_v2` / `reviewed_evidence_v2` 为经过文章证据校验的深入解读；B `reviewed_metadata_abstract_v1` 是经双遍事实审查的原始摘要依据的双语**独立概述**；C `abstractExcerpt` 是 DOI 绑定、来源可追溯的**至多 200 字符英文原始摘要节选**，并不代表完整摘要或中文翻译。
- 公开端不能原样输出 D1 存储的完整 Crossref/OpenAlex 原摘要，除非单独验证转载许可。OpenAlex 倒排索引、Crossref metadata 字段、已登录期刊内容均不自动授予全文转载权。
- 某 DOI 没有可信摘要或有版权、网络、元数据缺失，应列为 pending / source_missing / rights_unverified；不能凭论文标题想象反应条件、收率、选择性、范围或机理，也不能编造“全部 100%”。

## 读取优先级

1. `GET /api/user-ui/article-summary?doi=...` 首先走现有 Evidence v2 深度解读及其严格的 sourceHash/evidencePacketHash 验证。
2. 若深度解读缺失、待审核或证据版本过期，则尝试独立的当前正式目录 `literature_search_enrichment`。只按最新 ready 的正式 catalog generation、DOI 和 revision 一致的成员读取，绝不从已经撤下/失效的旧版本兜底。
3. 如存在 `literature_basic_abstract_reviews`、中英文本均非空、来源类型和 DOI/revision 一致，且当前原始摘要 SHA-256 与审核时完全一致，才返回独立基础双语概述，页面标注“基于原始 Abstract 的审核概述”。
4. 若尚无审核双语概述但有来源原始摘要，返回至多 200 字符的原文节选及 DOI 来源。页面明确说明中文概述待审核；不要包装为全文解读。
5. 仍无来源时返回原来的 missing/pending 状态。失败不应篡改每日文献上线或关闭旧的可用搜索。

## 独立审批写入流程

管理员身份的 GET `/api/admin/literature-basic-abstracts/candidates?catalogId=<64hex>&afterDoi=<doi>&limit=8` 可分页读取最新正式目录的可用原始元数据摘要用于审核；此接口返回完整检索摘要，严格禁止对公众开放、提交到公开 Git/日志。

对照 DOI、原题、来源和原始摘要逐篇两遍核对，只描述摘要确实支持的研究策略、转化、限定条件；未见正文不得发明底物范围或机理。完成后每条提交 `doi,revision,abstractSource,abstractSha256,zh,en,status:"approved",reviewPasses:2,reviewedAt` 到受管理员鉴权保护的 POST `/api/admin/literature-basic-abstracts/import`，最多每批 8 条。SHA256 应对**现存的来源英文摘要文本**计算，不对浏览器显示的 200 字符摘录计算。写入前服务端重新核实正式目录 DOI/revision、来源和完整文本 SHA，源更改则拒绝。记录只存审核后中英文独立概述和指纹，不复制全文元数据摘要到新的公开表。

`GET /api/admin/literature-basic-abstracts/coverage?catalogId=<64hex>` 给出目录总数、已收集原始摘要数、缺失来源数、具有双语审核记录的候选数。聚合计数不逐条重新计算 SHA，只有按 DOI 真实读取成功才计为**已核验可展示**。原有 `/api/admin/literature-search-enrichment/coverage` 继续独立统计原始摘要覆盖率，不混同“已存储解读 443 篇”。

## 未来回溯与规模

- 已存在的 `literature-abstract-incremental.yml` 北京时间 23:20 检查正式 DOI 的空缺并轮换缺口窗口，继续保留，并在新增历史 DOI 正式入库后处理；不新建重叠 cron。原始元数据采集仍通过 OpenAlex、Crossref，更多受许可的来源需独立验证后再加入。
- 对快速增长的长历史目录，需要优化首次重建时的旧 DOI 源缓存复用及可恢复分批，不允许凭成功导入空字符串宣布完整；每轮须报告 `originalAbstracts`、`missingOriginalAbstracts`、`reviewedBilingualCandidates` 和实际通过 DOI 抽查的显示数。
- 全库检索继续基于原始英文摘要和已经审核的解读索引；本次基础双语概述存放在独立审核表，不自动冒充 Deep Evidence 的已批准记录，也不擅自修改文献收录范围或每日热门数据。
