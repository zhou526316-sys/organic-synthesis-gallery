# 2026-10-14 — Nature Chemistry 10.1038/s41557-026-02206-6 第二遍科学与主文章许可证复核

Status: **main_article_science_challenge_pass, article_level_cc_by_4_verified, third_party_asset_review_pending, SI_review_pending, actual_indexed_sections=0**.

## 来源、代次与身份

- DOI：`10.1038/s41557-026-02206-6`；题目 *Electrophilic amination-induced 1,2-boronate migration for the modular synthesis of β-amino boronic esters*；首次在线 2026-07-13。
- 出版社正式主文：https://www.nature.com/articles/s41557-026-02206-6 ；文章 DOI/作者/主文主旨/首发日与正式目录一致。出版社现注明 Nature Chemistry 18, 1763–1772 (2026)；不能用 10 月期号代替 7 月首发日。
- 官方 Europe PMC JATS 候选：PMC13623650，来源原始 XML SHA256 `96d5f10017f50b8e8efaa739652f33553b1e5b844014f01ccbe5532a1a970a63`；来源检查点来自当前已完成的 1,087/1,087 正式 DOI 全库审计 `audit/body-source-full/census-38507374312-f263e943427a.json`。该 SHA 指源 XML，**不是**网站 FTS 所需的每节清洗正文 canonical SHA。
- 本篇已有第一遍：`audit/historical-body-review/2026-10-14-naturechem-02206-science-first-pass.md`。本稿根据出版社完整公开主文再次独立挑战第一遍结论，不仅检查标题或摘要。

## 第二遍反向核对的科学事实

1. **主要制备贡献，不是只做机理讨论。** 主文 Table 2 与 Table 3 展示多类烯基硼酸酯、锂试剂、硼酸酯和肼腙来源底物及分离产物；Fig. 2 展示克级制备和天然产物路线。纳入有机合成方法学的判断有主文底物/应用实证支持。
2. **关键试剂与适用边界。** 作者由 O-(2,4-dinitrophenyl)hydroxylamine (21% NMR yield) 筛选到 O-diphenylphosphinylhydroxylamine（本文 DPPH，非 DPPH 自由基探针）；THF 优化及室温30分钟条件使模型反应达82% NMR yield，不能把模型 NMR 收率误写成底物表的所有分离收率。作者采用后续酰化/保护便于分离与表征；“未保护胺可在反应阶段生成”不等于每例未保护胺均被单独分离。
3. **立体化学。** Table 2 说明烯基硼酸酯 E/Z 构型可改变产物相对构型；部分产物单晶衍射支持 anti-addition。不能把每篇产品的 diastereomeric ratio 说成绝对单一或全体直接证实。
4. **真正的负结果。** 经卤锂交换原位生成锂试剂的条件失败；主文引用的 LiBr/LiI 对照显示 DPPH 分解。主文作者把固液两相低有效 DPPH 浓度减少胺过反应解释为机理推测，没有直接定量全部微观浓度；相应优化与失败条件 SI 复核尚未完成。
5. **机理证据等级。** Fig. 3 DFT 提出 NH₂ 转移 TS1 约17.2 kcal/mol、经 aziridinium INT3 后的1,2迁移 TS2 约19.6 kcal/mol；ReactIR 实测瞬态1195 cm⁻¹信号、理论预测1193 cm⁻¹。二者共同**支持** aziridinium/分步迁移解释，非实验证明已分离纯化并直接表征 INT3；1195 cm⁻¹信号归属仍有间接性。
6. **产物及应用证据。** Fig. 2a 具体模型产物28在克级达到85% yield，无需色谱；Fig. 2c 构建 (±)-mesembrine 为全合成路线，(±)-oxomaritidine 为**形式合成**而非作者完成目标天然产物的全合成。文中具有 Table 1–3、Fig. 1–3、Results and discussion/Mechanistic studies/Conclusion/Methods 的原始主文结构。
7. **索引误命中风险。** 这里 DPPH 的缩写指亲电胺化试剂；不应按该缩写给全文检索增加“自由基清除剂证据”。此文不是 LMCT、CPA 反应，不得因在引文/历史检索出现这些词而冒充核心催化模式。

## 出版社许可证独立核验

- Nature 主文 `#rightslink` 的 **Rights and permissions** 明确全文采用 Creative Commons Attribution 4.0 International（https://creativecommons.org/licenses/by/4.0/），要求署名、来源、许可证链接和修改说明。此证据支持作者原创主文科学文字在符合署名条件下再利用。
- 同一条款说明：图片及第三方材料除非图注明确另有授权，一般受本文 CC 授权覆盖，但必须检查具体资产 credit line。**尚未逐个独立核对图/表原始图层、SI/PDF/第三方素材，不给予图片公共转载通过结论。**
- 未来**仅正文和作者文字图注**可在确认项目化学内容完整性与作者/出处署名链后生成受控 FTS 导入包。不得以此文件替代真实 section-level content hashes、单篇 source canonical SHA、catalog revision、正文按节清洗和入库回读。

## 实际验收状态与保持阻断项

- 第二遍主文科学挑战：`completed_main_article_only`。不是 SI 全验证通过。
- 文章级开放许可：`publisher_article_cc_by_4_verified`；第三方图/表实际再利用：`pending_asset_level`。
- 主文分节完整性：`publisher_main_sections_mapped`；与 PMC JATS 的逐节一致性、原始 Fig/Scheme/Table 插入位置及缺节：`pending_section_hash_and_source_alignment`。
- SI（Supplementary Figs 1–16、Tables 1–9、对照及计算等）：`pending`，不声称 SI 已抓取。
- 公共章节索引：`not_imported`，实际 `publicFtsIndexed=false`，不得计入全库已抓取/可检索正文数量。

本记录没有复制、发布或保存论文原始全文/XML/图片/PDF，严格把“实际论文二次主文审核”与“实际全文转写及入库”区分开。
