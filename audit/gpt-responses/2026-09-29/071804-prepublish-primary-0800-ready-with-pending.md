# 2026-09-29 08:00 发布前主审核回报

状态：`ready_with_pending`。当前 compact 的 112 篇候选已全部完成双遍范围审核，形成 27 篇发布白名单、83 篇排除、2 篇文章级 pending。发布子集已经 GitHub 预发布质量门验证；本轮未修改任何生产文献、TOC/媒体数据，也未请求 Pages 部署。

## 权威输入与快照

- 范围契约：`scope-2026-09-24-v1`
- scope contract：`docs/literature-scope-contract.md`，blob `f3102cd8a21d5b9dcd31a4f8d7d1a19e3c4e89e8`
- corrections：`audit/literature-scope-corrections.json`，blob `040902a773f72057dff59de5c66d27f568984813`
- canonical registry：`shared/literature-journals.js`，blob `57050105998284ccbf87b1a5fe513b256b648949`
- fresh audit：[run 36495887519](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36495887519)，成功
- handoff commit：`e0cd6e816d89ce11092b63223588239a01d04ea2`
- compact blob：`9aedcfaa9eb6b5446ed47012e5b6d338370d920f`
- latest blob：`a4da350aeb1b16d165e7629b6235acbd1b6067f0`
- generatedAt：`2026-09-28T23:04:39.977Z`（北京时间 2026-09-29 07:04:39）
- 16 本 active 期刊完整覆盖；latest/compact 同代，两个 `summary.unresolved=112`，与 compact 完整数组长度一致。

机器审计摘要：gallery DOI 633、source records 728、raw missing 627、历史已审排除 515、missing from gallery 112、potential gaps 48；`criticalSourceFailures=0`、`sourceFamilyGaps=0`、`sourceCoverageAnomalies=0`、`historicalCoverageLosses=0`。有 7 个 closure coverage anomaly（Nature、Nature Communications、JACS、Angew、ACS Catalysis、Organic Letters、JOC），因此 `verifiedThrough` 保持 `2026-09-20`，未虚假前推。

范围规则与纠错 blob 较上一槽未变化。31 个当前候选与上一槽逐 DOI 匹配后，在相同规则下兼容复用；81 个新候选重新完成双遍判断。四个历史 scope recheck 与越窗 CCS pending 均刷新读取，未把未定案排查记录当作排除决定。

## 27 篇发布白名单

1. `10.1021/acscatal.6c06622` — 不稳定氨基醛中间体的直接隧道传递实现转氨酶逐步二胺化
2. `10.1021/jacs.6c15246` — 模式识别与自由基环化赋能的（−）-甲基 gummiferolate 汇聚式全合成
3. `10.1021/jacs.6c12163` — 硝酸碘介导的反离子控制碘环化：功能化三亚苯与全苯型石墨烯量子点的模块化合成
4. `10.1021/jacs.6c10628` — 金催化芳香热塑性塑料升级改造
5. `10.1021/jacs.6c16630` — 重塑Wolff–Kishner还原：无强碱光驱动羰基脱氧
6. `10.1021/jacs.6c10893` — 通过全合成消除结构歧义：Secalosides A和B合成策略的演进
7. `10.1021/acs.joc.6c01679` — （杂）金刚烷合成：三重烷基化反应
8. `10.1021/acs.joc.6c01488` — PyFluor/DBU介导脂肪醇脱氧氟化：机理、反应性与底物选择性
9. `10.1021/acs.joc.6c02130` — C–H硼化/羧化实现CO₂参与的一锅芳基C–H内酯化
10. `10.1021/acs.joc.6c01670` — 钯催化吲哚C7三氟甲基化环化制备含CF₃的Lilolidines
11. `10.1021/acs.joc.6c01536` — 以碳化钙为无机 C2 源的骨架编辑合成 2-甲基喹唑啉酮
12. `10.1038/s41467-026-77771-y` — 经亚烷基卡宾合成氟稳定的四元和五元半饱和杂环
13. `10.1021/acs.orglett.6c03825` — 仿生Fe(Pytacn)催化分子内C(sp³)–H胺化构建磺内酰胺
14. `10.1021/acs.orglett.6c03679` — 邻炔基苯甲醛与丙烯酰胺级联环化合成苯并[e]异吲哚啉酮骨架
15. `10.1021/acs.orglett.6c03765` — DNA 兼容 Doebner 反应构建喹啉-4-羧酸
16. `10.1021/acs.orglett.6c03876` — 铜催化吩噻嗪级联 C–H 活化构建有机二氟硼发光材料
17. `10.1021/acs.orglett.6c03898` — 光氧化还原/钴肟催化吡咯烷脱氢芳构化
18. `10.1021/acs.orglett.6c03573` — 氮杂芳烃的高选择性去芳构化 C3 氘代与 N-官能团化
19. `10.1021/acs.orglett.6c03662` — 配体控制的钴催化二取代二烯立体发散式氢硼化
20. `10.1021/acs.orglett.6c03909` — 以Halon-1301为CF₃源的（杂）芳烃光催化C–H三氟甲基化
21. `10.1021/acs.orglett.6c03493` — 光氧化还原催化烯烃区域选择性硫酯化/二硫化
22. `10.1021/acs.orglett.6c03148` — AgF/AgF₂控制的选择性脱硝氟化与脱硫氟化
23. `10.1021/acs.orglett.6c03954` — 噻蒽盐介导芳烃与烯炔酮的位点选择性偶联
24. `10.1021/acs.orglett.6c03657` — 统一铜催化级联策略实现天然吡喃并[3,2-a]咔唑全合成
25. `10.1021/acs.orglett.6c03328` — PhSiH₃介导硝酮转移氢化制备羟胺衍生物
26. `10.1021/acs.orglett.6c03550` — NHC 有机催化可见光促进脂肪胺 γ-C(sp³)–H 酰基化
27. `10.1002/anie.8666577` — Co(II) 催化位点选择性捕获双环[1.1.0]丁烷双自由基的 [2σ+2π] 环加成

每篇 include 均保存非占位中文题名、`primaryContribution`、`preparativeTransformation`、`generalityEvidence`、`sourceEvidence`、`boundaryChallenge`，以及首遍/挑战结论。完整文章级证据见 [staging review](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-09-29-0800.json)。

## 当前 compact pending

- `10.1021/acscatal.6c05520` — *Engineering Highly Active Single-Phosphine-Coordinated Ru Catalysts for Heterogeneous N-Alkylation without Base-Additive*。摘要证明无碱胺/醇 N-烷基化、TOF 323 h−1、10 次循环和二氢化物机理，但没有给出胺/醇底物表、分离产物或收率；无法判断主要贡献是否超出单原子催化剂结构–性能研究。下一步仅通过现有 Tampermonkey/VPN Bridge 读取 ACS 正文或 SI。
- `10.31635/ccschem.026.202608472` — *From Non-Aqueous to Aqueous: Water-Engaged In Situ Electrochemical Reconstruction of Carbazoles*。CCS 摘要/正文仍不可得，缺少咔唑起始物、重构产物、键变化、范围与分离收率；不能凭“electrochemical reconstruction”题名纳入或排除。

越窗持久 pending `10.31635/ccschem.026.202608262` 继续保留原日期和来源 review；仍缺醇底物、氧化产物、范围、分离收率及主要贡献证据。它不在本轮 compact，因此没有被伪造为当前候选决策。

现有卡片 scope recheck 保持：`10.1021/acs.joc.6c01559`、`10.1002/anie.9519061` retain/include；`10.1021/acs.orglett.6c03499`、`10.1021/acs.orglett.6c03386` retain while pending。

## 高相关排除复核

- `10.1021/acscatal.6c04894` — 主要贡献是多目标训练集设计与机器学习采样策略，并未报告可推广的有机底物转化或合成路线。 挑战结论：最强纳入理由是该方法可服务催化研究，但范围契约要求实际制备转化；算法工具本身不足以纳入。
- `10.1021/acscatal.6c05031` — 原子分散Bi位点/CdS纳米棒的光催化材料设计与甘油选择氧化性能为主，只有单一甘油体系，缺少一般有机制备范围。 挑战结论：甘油到甘油酸确有有机转化，但现有摘要未展示多底物或分离制备；材料结构—性能与机理占主导，反向挑战后仍排除。
- `10.1021/acscatal.6c04010` — 主要贡献是Ir纳米簇界面水重构对酸性析氧路径与稳定性的调控，属于能源电催化。 挑战结论：虽然涉及催化和机理控制，但反应目标是析氧性能而非有机合成，反向挑战后仍排除。
- `10.1021/acscatal.6c05444` — 主要贡献是等离子体条件下Cu/硅铝催化剂酸性、负载量与CO₂制甲醇性能关系。 挑战结论：甲醇是有机产物且确有转化，但研究轴心是C1能源催化剂性能与结构–性能关系，不是一般有机制备方法。
- `10.1021/acscatal.6c05035` — 主要贡献是Ru单原子/纳米粒子界面调控CO₂加氢在CO与CH₄之间的选择性反转。 挑战结论：存在明确化学转化，但产物为能源型C1燃料且没有一般有机底物制备范围；反向挑战后仍排除。
- `10.1021/acscatal.6c05264` — 工业水煤气变换Cu/ZnO界面活性位研究，不是有机制备方法。 挑战结论：催化研究并非一律排除，但该反应不制备目标有机产物，无法形成有机合成纳入理由。
- `10.1021/jacs.6c09621` — 主要贡献是Ti₃C₂ MXene衍生TiO₂提高Pt/C氧还原催化剂稳定性。 挑战结论：JACS载体和催化题名不能替代范围证据；其核心是燃料电池ORR材料性能，排除。
- `10.1021/jacs.6c14162` — 主要贡献是带电微滴中雪崩驱动蓝光和活性物种形成的物理化学现象。 挑战结论：活性物种可能触发化学反应，但文章未交付一般制备方法；纯现象/机理不能纳入。
- `10.1021/jacs.6c12923` — 有机单晶多腔微胶囊的生长、载荷封装与光触发释放为核心，属于功能材料。 挑战结论：晶体内部发生光反应，但它服务于释放功能，未建立可推广有机产物制备方法，反向挑战后仍排除。
- `10.1021/jacs.6c14563` — 主要贡献是在星际冰模拟物中用电子辐照生成并光谱识别吡啶，以解释前生物天体化学。 挑战结论：确实“合成”了有机杂环，但主要贡献是天体化学形成机理且无通用制备证据，反向挑战后排除。
- `10.1021/acs.joc.6c01881` — 主要贡献是Kinetin自由基清除机理、动力学及pH/溶剂效应。 挑战结论：尽管自由基清除涉及明确化学反应，但文章没有交付可用于制备有机化合物的通用转化、底物范围或分离产物，因此反向挑战后仍排除。
- `10.1038/s41467-026-78277-3` — Nature Communications Comment，讨论氮饥饿时合成代谢下降与抗生素持留，不是原始合成研究。 挑战结论：题名含synthesis但指细胞代谢砌块合成；反向检查确认无有机合成路线。
- `10.1038/s41467-026-77702-x` — 主要贡献是细胞乳酸触发局部水凝胶化并重塑表型，用于生物材料/细胞环境。 挑战结论：凝胶形成包含化学/组装过程，但其主要贡献是生物功能材料而非可推广小分子或聚合合成，排除。
- `10.1038/s41467-026-78035-5` — 主要贡献是人细胞有丝分裂后DNA合成及调控的生物学表征。 挑战结论：“DNA synthesis”是细胞生物学过程，不能仅凭synthesis一词纳入。
- `10.1038/s41467-026-77459-3` — 主要贡献是防范合成DNA订单拆分规避的安全检测方法。 挑战结论：synthetic DNA为对象背景而非文章的有机合成贡献，排除。
- `10.1038/s41467-026-77883-5` — 主要贡献是灵长类视网膜水平细胞非线性与纹理信号处理。 挑战结论：可能使用化学探针或样品制备，但不足以改变其纯生物机制主贡献，排除。
- `10.1038/s41467-026-78116-5` — 主要贡献是低温气相/天体化学条件下三种氰基环戊二烯异构体的形成及星际PAH意义。 挑战结论：题名使用synthesis且生成三个异构体，但主要贡献是天体化学形成机制，不是可推广有机制备方法，排除。
- `10.1038/s41467-026-77899-x` — 通过产物清除剂和生物分子凝聚体提高核酸酶周转，核心是生物分子修饰动力学与相分离控制。 挑战结论：其框架提到cleavage/synthesis且可编程，但没有一般小分子制备或明确可分离有机产物范围；反向挑战后仍归为生物分子工程。
- `10.1038/s44160-026-01163-9` — 主要贡献是red拓扑分级多孔MOF用于氢气和甲烷储存的结构与性能。 挑战结论：材料确经合成，但范围契约明确排除以储能/储气性能为主且无一般制备方法的论文。
- `10.1038/s44160-026-01174-6` — 该DOI是Nature Synthesis的Research Highlight，介绍另一项可持续吡咯合成工作，并非原始研究论文。 挑战结论：报道的方法本身高度相关，但综述/研究亮点按契约排除；不能把被评论的原始方法当作本DOI的研究贡献。
- `10.1021/acs.orglett.6c03327` — 主要贡献是两种二茂铁侧链纳米环的构象、主客体组装、晶型和光电性质调控。 挑战结论：最强纳入理由是存在shotgun macrocyclization制备；但仅两个目标且文章主轴为结构–性能/超分子材料，缺少一般合成方法范围，排除。
- `10.1002/anie.4411028` — N桥连Zn–Co原子对催化剂的轨道设计与木质纤维素炼制性能为主，产物是混合单酚和保留碳水化合物。 挑战结论：木质素Cβ–O断裂和规模化是真实化学转化，但主要贡献仍是多相催化剂/生物质性能与混合物流，缺少一般有机制备方法。

另有新闻、校正、封面、卷期元数据、纯生医、器件/电池/能源、材料性能及无一般制备证据的普通低相关候选逐篇排除；83 条完整证据均在 staging 中。Angew 卷期 DOI `10.1002/anie.v65.40` 的机器题名为空，质量门据其卷期元数据要求补充可识别描述性标题后，仍按卷期聚合元数据排除，没有虚构单篇论文题名。

Nature 官方页另行确认：[Deep reduction in electrosynthesis](https://www.nature.com/articles/s41557-026-02249-9) 为 Review Article，[Sustainable pyrrole synthesis](https://www.nature.com/articles/s44160-026-01174-6) 为 Research Highlight；两者主题相关但不是原始研究。

## 来源检查与质量门

16 本期刊的出版社完整实时列表均未形成可审计的候选计数：10 本记为 `unavailable`、6 本记为 `blocked`，候选数保持 `null/unknown`；没有把 Crossref/OpenAlex 机器健康或单篇官方页面核验冒充完整出版社实查。

[预发布质量门 run 36496974347](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36496974347)成功：

- `validate-prepublish-review.mjs --allow-deferred --require-ready`：成功
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：成功
- 记录验证、112 DOI 完整分区、目标槽新鲜度：成功
- 正式转换预演与严格发布包：成功
- `publicationReady=true`
- `releaseStatus=ready_with_pending`
- `conversionValid=true`
- `productionDataModified=false`

首个门禁 run 36496868311 准确拦截了空题名卷期记录；补充卷期描述后最终门禁通过。state 提交后附带的生产级通用质量门 [run 36497115852](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36497115852)仍读取 2026-09-28 08:00 正式 review，因尚未进行 08:00 固定槽转换而报告旧正式 pending/backlog 不一致；这不覆盖已经通过的目标 staging 门，也未触发任何生产写入。

## 提交与并发保护

- 审计触发：`c5d207bbad759346f75375506bd20092c0feec42`
- 机器快照：`e0cd6e816d89ce11092b63223588239a01d04ea2`
- 最终 staging：`eccb5eafc2d9390b9e8bc0011cf9f223483763d5`
- staging blob：`dcf83e6dadf0e340c49ce6029e0be02d6ac3bda6`
- state：`65e07c011bbd59928048836668a55a43ad2296d5`
- state blob：`f73042be0cc6328f1e265069de7963fe4fe5d87d`

从机器快照到 state 仅新增/修改 `audit/prepublish-review-2026-09-29-0800.json` 与 `audit/literature-update-state.json`；未触碰 public 文献、生产卡片、TOC、媒体或部署文件。
