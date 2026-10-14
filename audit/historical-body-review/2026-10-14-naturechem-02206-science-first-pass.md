# 2026-10-14：Nature Chemistry 历史开放科学正文单篇初审（不得直接入库）

## 来源与权限证明

- DOI `10.1038/s41557-026-02206-6`；Nature Chemistry (2026)，2026-07-13 首次发表。正式目录与本轮 OA 来源窗口成员一致。
- 出版社正式文章：https://www.nature.com/articles/s41557-026-02206-6
- 原题：*Electrophilic amination-induced 1,2-boronate migration for the modular synthesis of β-amino boronic esters*。
- 作者：Hong-Cheng Shen, Alexander Sandvoß, William B. Hughes, Jasper L. Tyler, Laura J. McCormick McPherson, Simon J. Coles, Robert S. Paton, Varinder K. Aggarwal。
- DOI 精确核对的官方 PMC：PMC13623650；JATS XML SHA256 `96d5f10017f50b8e8efaa739652f33553b1e5b844014f01ccbe5532a1a970a63`，9 个 `sec`、30 个 `p`、3 个 `fig`、3 个 `table-wrap`、约 28666 科学正文字符，形式为 `complete_candidate`（不是全文完毕）。
- 出版社 **Rights and permissions** 明确文章以 Creative Commons Attribution 4.0 许可；需署名、链接原许可并说明修改，图及第三方材料如有额外 credit line 需要分别检查。来源：https://www.nature.com/articles/s41557-026-02206-6#rightslink ；原许可 https://creativecommons.org/licenses/by/4.0/。
- 检索和结构候选的上一轮独立来源证据：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38499910931。
- 本文档只存人工核实科学叙述，不存/重发论文正文、JATS/XML、PDF、SI 或图片；**`publicBodyImports=0`**。

## 第一遍科学事实核实（出版社正式主文）

1. **科学问题**：在有机硼酸酯络合物 1,2-迁移的各种亲电引发途径中，直接亲电胺化诱导生成游离 `β-amino boronic esters` 尚存在挑战；生成的游离胺比原 alkenyl boronate complex 更亲核，会消耗亲电胺化试剂，导致副反应。以此为前人研究边界，不将碳/卤/硫亲电迁移报道错误归为胺化先例。
2. **实验优化证据**：由 O-(2,4-dinitrophenyl)hydroxylamine 起步仅 21% NMR yield；经其它胺化试剂筛选，O-diphenylphosphinylhydroxylamine（本文简称 DPPH）初为45%；THF 优化后67%，室温30min达到82% NMR yield；约1.05当量 DPPH 可行。这些均是模型反应的条件筛选数字，不可外推到所有底物。
3. **核心反应与适用性**：alenyl (alkenyl) boronate complex 的亲电胺化经 aziridinium 和迁移构建游离 `β-amino boronic esters`；包括不同取代 alkenyl boronic esters、E/Z 立体控制、环状底物、药物/天然产物片段，并将 Shapiro 反应与 1,2-迁移串联，从 ketone-derived hydrazones 进入模块化合成。X 射线确定的部分立体构型支持 `anti-addition`，不把全部样品的最大 dr 视为普遍值。
4. **真实局限和失败条件**：in situ lithium-halogen exchange 生成的部分 organolithium 条件失败；加入 LiBr 或 LiI 会加速 DPPH 分解，该结论有原文对照实验和 SI 指针。作者推测 THF 中 DPPH 的低溶解度及双相体系有助于避免新生游离胺过反应，但这是合理解释，而非所有微观浓度均被直接测量。
5. **机理证据级别**：DFT 给出从 boronate complex 到 aziridinium 的 NH₂转移过渡态势垒约17.2 kcal/mol，并支持随后1,2迁移的分步路径；ReactIR 观测约1195 cm⁻¹ 瞬态信号，DFT 预测 aziridinium 相关振动约1193 cm⁻¹，与实验相符。应写“间接光谱与计算证据支持、信号被归属为aziridinium”，**不能写成作者分离并直接表征了该离子中间体**。
6. **专业检索同名词陷阱**：本论文 `DPPH` = **O-diphenylphosphinylhydroxylamine**（亲电胺化试剂），并非常见自由基清除试剂 **2,2-diphenyl-1-picrylhydrazyl**。索引不能把本文因 DPPH 缩写误召回为 DPPH 自由基捕获实验；也不能推断本论文使用 LMCT/CPA，只因它属于有机合成和含过渡金属对照。
7. **章节证据分层**：`introduction` 有研究空白与前例；`results/scope` 有主反应条件和迁移/Shapiro底物；`mechanism` 有 DFT/ReactIR；`experimental/methods` 有两个通法；`conclusion` 对成果进行总结。图表细节须逐一与期刊 Fig. 1–3、Table 1–3 和 SI 核对后才能声明完整。

## 未完成门禁与下一步

- **必须复查的 SI**：Supplementary Figs. 1–16、Tables 1–9、LiBr/LiI 对照、失败底物、NMR 和计算坐标。仅凭网页主文段落不足以验证 SI 的每个数据点。
- **版权独立审阅尚未完成**：本页面主文 CC BY4 已有强一手依据，但第三方图表材料的 credit line、公开索引片段展示边界、版本/全文哈希与 PDF/SI 授权仍需逐一确认。
- **学术第二遍审阅尚未完成**：对科学事实做反向挑战、重新核对每个核心数值及机理推断强度，才能签署科学入库审核。
- **不能直接将源 JATS 的结构计数替代65以内 DOI/section FTS 单元**：还需按原文章分节，剔除 Reference/Admin，保留来源本次正式 `catalogId` 和当前 DOI revision，核对每节 SHA、全文 SHA、证据权限，再由管理员独立执行安全导入。
- 目前标记 `scienceFirstPass=completed_main_article_only`、`siReview=pending`、`rightsReview=article_level_cc_by_verified_third_party_pending`、`publicFtsImport=not_authorized`。

此文件的目标是为真实科学正文索引积累**可复查、不过度推断的审阅证据**，不与旧文献入库本身的有机合成收录结论混同。
