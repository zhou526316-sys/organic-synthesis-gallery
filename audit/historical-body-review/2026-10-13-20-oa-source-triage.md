# 2026-10-13：20篇正式历史论文的开放全文与科学章节来源验收

- 实际来源：Europe PMC 官方开放全文检索及 DOI 绑定 JATS XML；仅原始出版社 DOI 目前正式目录成员。
- 运行记录：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38415448314
- 产物：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38415448314/artifacts/11824910774
- 当前正式 catalogId: `11b5e8ad61449437bf0016077aa0191a5bceeeadb6d70cd9e37fc87a7cc9848c`
- 审核状态：**仅来源许可与文章结构核查**。尚无逐章节原文独立审核通过，`approved_public_reuse=0`，无 D1 全文写入、无原始 XML 上传，也未启用公共全文搜索。
- 本次 20 篇：`needs_independent_review=2`、`reuse_restricted=6`、`pmc_oa_missing=6`、`metadata_doi_missing=5`、`license_unknown=1`。
- `pmc_oa_missing` 只代表本次 OA 全文来源条件不满足，不能证明出版社正文不存在；`metadata_doi_missing` 不能自动当论文不存在。

| DOI | 期刊 | 本次独立 OA 来源状态 |
| --- | --- | --- |
| 10.1038/s41467-026-75059-9 | Nature Communications | reuse_restricted |
| 10.1038/s41467-026-75338-5 | Nature Communications | pmc_oa_missing |
| 10.1038/s41467-026-75499-3 | Nature Communications | reuse_restricted |
| 10.1038/s41467-026-74319-y | Nature Communications | reuse_restricted |
| 10.1038/s41467-026-75432-8 | Nature Communications | reuse_restricted |
| 10.1038/s41467-026-75467-x | Nature Communications | reuse_restricted |
| 10.1038/s41467-026-75644-y | Nature Communications | reuse_restricted |
| 10.1038/s44160-026-01096-3 | Nature Synthesis | metadata_doi_missing |
| 10.1038/s44160-026-01116-2 | Nature Synthesis | metadata_doi_missing |
| 10.1038/s41557-026-02195-6 | Nature Chemistry | pmc_oa_missing |
| 10.1038/s41557-026-02206-6 | Nature Chemistry | needs_independent_review; CC BY 4.0 |
| 10.1038/s41929-026-01560-5 | Nature Catalysis | metadata_doi_missing |
| 10.1126/sciadv.aeg4594 | Science Advances | needs_independent_review; CC BY 4.0 |
| 10.1021/jacs.6c07102 | JACS | pmc_oa_missing |
| 10.1021/jacs.6c10123 | JACS | pmc_oa_missing |
| 10.1021/jacs.6c08483 | JACS | pmc_oa_missing |
| 10.1021/acscatal.6c02761 | ACS Catalysis | metadata_doi_missing |
| 10.1021/acscatal.6c03020 | ACS Catalysis | metadata_doi_missing |
| 10.1021/acs.orglett.6c02216 | Organic Letters | pmc_oa_missing |
| 10.1021/acs.orglett.6c02234 | Organic Letters | license_unknown |

## 待独立科学审阅的两篇

### 10.1038/s41557-026-02206-6 · Nature Chemistry

- 官方文章：https://www.nature.com/articles/s41557-026-02206-6
- 官方 PMCID：PMC13623650；JATS DOI 完整核验，正文 XML SHA256 `96d5f10017f50b8e8efaa739652f33553b1e5b844014f01ccbe5532a1a970a63`。
- 文章本身的出版社版权声明明确为 CC BY 4.0；该授权受署名、来源及第三方图像单独声明的约束。
- 文章结构：9个 sec、30个 p、3个 fig、3个 table-wrap、约28666正文字符；包含 Results/Scope、Mechanism、Methods、Conclusion；结构状态是 `complete_candidate`，**不等于正文语义和 SI/图表逐一核实完毕**。
- 初步科学实质（来源正文，不是已审核摘要）：DPPH 诱导 alkenyl boronate complex 的亲电氨化-1,2-迁移以构建 `β-amino boronic esters`；反应设计兼顾游离胺后续副反应；DFT 与原位 ReactIR 支持先 aziridinium 形成再迁移的分步机理；通过 Shapiro 反应拓展酮原料合成。此说法必须在正式入库前逐项核对正文与补充材料，不能把计算支持说成直接观察中间体。

### 10.1126/sciadv.aeg4594 · Science Advances

- 正式 DOI：https://doi.org/10.1126/sciadv.aeg4594
- 官方 PMCID：PMC13614368；JATS DOI 完整核验，正文 XML SHA256 `5fbe546e96e4bca53d7e0a19660239f8be0216ce2400b5b4da9e78ced4c3a95e`。
- 来源 JATS 声明 CC BY 4.0。25个 sec、44个 p、8个 fig、无 table-wrap、约55275正文字符；Results/Mechanism/Methods 命中，Conclusion 标题未识别，故结构结果仅为 `partial`。
- PubMed 原始摘要涉及 Cr 催化醇、醚、羰基化合物脱氧转化得到 C-Si/C-Ge/C-Sn/C-B；低价 Cr 经 C–O 双电子氧化加成是机理研究支持的提案，不可声称已直接证明。其 25 个子章节及全文中实际科学结构、后续图表与限制条件必须进一步逐项审阅。

## 下一道上线门禁

这20篇里**没有任何一篇已经获得自动公共全文导入许可**。两篇候选需要来源完整性、正文各科学章节、引用归属和真实许可证的独立复审，合法通过后，按 DOI/revision/section SHA/source SHA 做原文归属的分批导入，并重新跑公开/私人检索隔离回归。对未提供允许公开再利用全文许可证的其他18篇，应优先查证合法替代 OA 来源或保留私人合法范围内的搜索，不得以校园 VPN 的可阅读性自动推断公开全文存储授权。

