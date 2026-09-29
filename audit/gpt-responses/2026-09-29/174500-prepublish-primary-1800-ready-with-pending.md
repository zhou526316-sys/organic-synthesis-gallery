# Organic Synthesis Gallery 2026-09-29 18:00 发布前主审核

## 结论

- 状态：`ready_with_pending`
- compact候选：64篇，全部完成双遍审核
- include：16篇；exclude：46篇；current pending：2篇
- `reviewComplete=false`，但`publishableSubsetReady=true`；仅允许发布显式`publishableDois`白名单
- 生产文献数据、TOC/媒体和Pages部署均未修改或触发

## 权威规则与快照

- 范围契约：`scope-2026-09-24-v1`，`docs/literature-scope-contract.md`，blob `f3102cd8a21d5b9dcd31a4f8d7d1a19e3c4e89e8`
- 纠错清单：`audit/literature-scope-corrections.json`，blob `040902a773f72057dff59de5c66d27f568984813`
- handoff：commit `3a8db42cee8538c6b8e23de275fb96b1a7f44d00`，compact blob `60ea88afe46aa1b3bc23cd303a8c72de1297a981`
- fresh audit：`2026-09-29T09:14:53.762Z`；run [36547662875](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36547662875)，job `109337847551`，结论`success`
- 审计触发：commit `6eba3f49482621c8650fed15c37c083e04efcd17`；快照commit `3a8db42cee8538c6b8e23de275fb96b1a7f44d00`
- gallery DOI：660；source records：790；unresolved：64
- criticalSourceFailures=0；sourceFamilyGaps=0；sourceCoverageAnomalies=0；closureCoverageAnomalies=7
- active期刊：16本，registry blob `57050105998284ccbf87b1a5fe513b256b648949`，完整覆盖
- verifiedThrough保持`2026-09-20`，未跨越closure警告或pending

## 16篇发布白名单

1. `10.1021/jacs.6c17816` — 通过双重动态动力学拆分对无环1,4-二酮进行不对称转移氢化以合成多样化环状产物
2. `10.1021/jacs.6c13570` — 中断式氮删除实现机理无关的脂肪族 N–H 骨架转化
3. `10.1021/jacs.6c14230` — 复杂核苷抗生素 Ezomycin A1 与 A2 的全合成
4. `10.1021/acs.joc.6c00301` — Rh₂(esp)₂催化烯丙基叠氮化物与重氮丙二酸酯反应并经DBU环化的一锅法合成1-吡咯啉
5. `10.1021/acs.joc.6c01671` — Rongalite促进的1-(2-硝基苯基)吡咯一锅还原环化构建吡咯并[1,2-a]喹喔啉
6. `10.1021/acs.orglett.6c03682` — 调控1,3-二酰基-2-金卡宾反应性：优先于Wolff重排的外加亚胺[3+2]环化
7. `10.1021/acs.orglett.6c03726` — 邻炔基芳基腈经Pd(II)催化级联反应直接合成二苯并环庚三烯酮
8. `10.1021/acs.orglett.6c03598` — 光氧化还原催化异戊二烯的区域与立体选择性1,4-(杂)芳基烷基化
9. `10.1002/anie.9432471` — 捕获[Cp*Co(烯丙基)CO]+配合物并用于未活化烯烃的催化烯丙位C–H酰胺化
10. `10.1002/anie.4322109` — 铜(I)催化3,3-二取代环丙烯的不对称氢锗化
11. `10.1002/anie.6732152` — 共价预组织的(硫)脲–烷氧基有机催化剂实现高分子量聚乙交酯的可控合成
12. `10.1002/anie.7937631` — PLP启发的仿生醛醇反应直接不对称合成手性β-羟基-α-氨基酰胺
13. `10.1002/anie.2320378` — 无金属一锅法制备苯并呋喃砌块用于高效窄带蓝–青发光体
14. `10.1002/anie.2743830` — 级联环化构建单层与双层含氮纳米石墨烯
15. `10.1002/anie.7845758` — 光催化跨环迁移合成立体明确的环丁烷和苯环生物电子等排体双环[2.1.1]己烷
16. `10.1002/anie.5853261` — 以环状三羰基前体的分子内氧杂Diels–Alder反应为关键步骤全合成(−)-Penostatin G、B与C

每篇include均保存文章特定`scopeAssessment`（主要贡献、制备转化、一般性证据、实际来源证据、边界挑战），并记录`reason/evidenceBasis/firstPassDecision/challengeDecision/challengeReason`。

## 2篇当前pending

- `10.1021/acscatal.6c05520` — 酒精驱动构筑单膦配位Ru单原子催化剂实现无碱N-烷基化
  - 原因：摘要证实存在胺与醇的无碱N-烷基化，但主要篇幅为单原子Ru配位结构、TOF和结构–性能关系，未给出胺/醇底物范围或分离产物证据，暂不能确认其主要贡献达到一般制备方法门槛。
  - 待补证：出版社正文或SI中的胺与醇底物表、分离产物和收率，以及主要贡献相对催化剂结构性能研究的权重。
  - 后续：通过现有Tampermonkey/VPN Bridge读取ACS正文或SI反应范围；若跨多类胺/醇并有分离产物则纳入，否则按催化剂结构–性能研究排除。
- `10.31635/ccschem.026.202608472` — 水参与的咔唑原位电化学重构：从非水体系到水体系
  - 原因：题名显示水参与的咔唑原位电化学重构，可能是骨架编辑方法，但仍无摘要、反应式、底物范围或分离收率。
  - 待补证：出版社摘要或正文/SI中的咔唑起始物、重构产物、具体键变化、底物范围和分离收率。
  - 后续：通过现有Tampermonkey/VPN Bridge读取CCS正文或SI，确认是否为一般性咔唑骨架重构方法。

## 持久backlog与历史边界复核

- `10.31635/ccschem.026.202608262`：继续pending；配对醇氧化可能构成一般电有机合成，不能因能源主题直接排除；同样不能仅凭题名纳入，故保留原日期和来源review继续pending。
- `10.1021/acs.joc.6c01559`：include/retain；Photophysics and antifungal imaging are substantial downstream studies, but the article also establishes a broad multicomponent preparation across distinct reaction-partner classes; fluorescence therefore does not erase the preparative method.
- `10.1002/anie.9519061`：include/retain；High melting temperature is an application/property outcome, but the article's explicit new catalyst-activation strategy unlocks polymerization across multiple difficult monomers. This is genuine polymer synthesis methodology under the contract, not merely property optimization.
- `10.1021/acs.orglett.6c03499`：pending/retain_while_pending；The work may be a useful reagent-activation method, yet the available abstract is dominated by kinetics and reactive-intermediate control. Without product/preparative scope, a final mechanism-only exclusion or method inclusion would both overclaim.
- `10.1021/acs.orglett.6c03386`：pending/retain_while_pending；A single fragment cannot be labeled total synthesis, yet a fragment route may independently qualify if it introduces a transferable building-block strategy. The available evidence does not decide that question.

## 46篇明确排除

- `10.1002/anie.8288920` — 主要贡献是CPP-3Y作为三元有机太阳能电池形貌调节剂及器件效率/稳定性，不是一般有机制备方法。
- `10.1002/anie.2929190` — 主要贡献是线粒体靶向DNA–肽纳米组装、ROS和反义核酸协同诱导凋亡，属于生物医学递送/治疗研究。
- `10.1002/anie.3726851` — 主要贡献是BODIPY水合门控PET光物理与活细胞/类器官寿命成像，未建立一般制备反应。
- `10.1002/anie.1085066` — 主要贡献是W掺杂MoS₂单原子位点对HMF加氢脱氧的催化材料结构–性能关系，只有特定原料/燃料产物体系。
- `10.1002/anie.1881662` — 主要贡献是Azacitidine天然生物合成基因簇和酶促通路阐明，未建立可推广的制备底物范围或实际合成平台。
- `10.1002/anie.7366799` — 主要贡献是Bi₂WO₆空位簇控制1-丁烯吸附构型与氧化脱氢机理，缺少一般有机制备范围。
- `10.1021/jacs.6c11635` — 以PFAS/含氟聚合物销毁和氟固定为目的的机械化学环境修复研究，不是有机产物制备。
- `10.1021/jacs.6c10140` — 研究固态紫外单光子发射色心与宿主离子性的材料设计规则，不涉及一般有机合成。
- `10.1021/jacs.6c17599` — 通过噬菌体展示发现靶向Keap1的可逆共价环肽配体，主要是生物配体筛选与结合机制。
- `10.1021/jacs.6c11481` — 利用单分子结研究VeCas9构象动力学和基因编辑机制，未报告一般制备转化。
- `10.1021/jacs.6c16361` — 解析Fe(III)光敏剂电子转移后笼逃逸的Marcus理论与溶剂效应，属于纯机理/光物理。
- `10.1021/jacs.5c21965` — 以机器学习分子动力学解释固体酸电解质质子传导，属于能源材料机理。
- `10.1038/d41586-026-02961-z` — Nature评论/观点文章，不是原始合成研究。
- `10.1038/d41586-026-03056-5` — Nature评论/观点文章，不是原始合成研究。
- `10.1038/d41586-026-02960-0` — Nature评论/观点文章，不是原始合成研究。
- `10.1038/d41586-026-03054-7` — Nature评论/观点文章，不是原始合成研究。
- `10.1038/d41586-026-03053-8` — Nature评论/观点文章，不是原始合成研究。
- `10.1038/d41586-026-03055-6` — Nature评论/观点文章，不是原始合成研究。
- `10.1038/s41467-026-77993-0` — 研究酵母配子发生期间选择性内质网自噬与寿命重置，属于细胞生物学。
- `10.1038/s41467-026-77673-z` — 以叶绿素交联构筑高压缩水凝胶，主要贡献是功能材料的力学工程。
- `10.1038/s41467-026-78263-9` — 围绕水净化中动态电子结构演化与稳定性能，属于环境功能材料。
- `10.1038/s41467-026-77582-1` — 研究cohesin耗竭下三维染色质接触与增强子–启动子调控，属于基因调控生物学。
- `10.1021/acs.orglett.6c03814` — 仅为一个全四唑基取代咪唑异构体的路线及含能性能比较，未证明可推广的底物/砌块方法。
- `10.1021/acscatal.6c04621` — 主要解析Pd–Bi电极上乙二醇电氧化机理与载体效应，未给出一般有机产物范围。
- `10.1002/anie.9550662` — 主要贡献是本征导电开壳层共轭聚合物的电子结构和电输运性能，而非聚合反应或链结构控制方法。
- `10.1002/anie.3790761` — 主要贡献是硫掺杂SnO₂在安培级CO₂制甲酸中的电催化性能与电解质适用性。
- `10.1002/anie.4217363` — 主要贡献是Pt₃簇/Cu单原子接触结构对乙炔半氢化性能的调节，缺少一般有机底物范围。
- `10.1002/anie.1300481` — 主要贡献是PtO₂/Pt₁–In₂O₃光催化剂对丙烷脱氢的相结构与性能，属于单一模型转化的材料催化。
- `10.1002/anie.5129987` — 校正文章，不是新的原始合成研究。
- `10.1002/anie.3591838` — 软多孔晶体的动态调控与轻烃分离性能研究，不是一般有机制备。
- `10.1002/anie.8728174` — Ir(III)配合物共组装的顺序能量传递与可编程发光研究，未建立一般制备方法。
- `10.1002/anie.6505397` — 面向光免疫治疗的光敏剂激发态扭曲、单线态氧和ROS性能研究，属于生物医学光功能。
- `10.1002/anie.1019904` — 有机锡-多金属氧酸盐用于倒置钙钛矿太阳能电池埋界面调控，属于器件材料。
- `10.1002/anie.2026-m2509035600` — 期刊内封面元数据，不是研究论文。
- `10.1002/anie.2026-m2509034700` — 期刊内封面元数据，不是研究论文。
- `10.1002/anie.6514261` — 长寿命有机室温磷光流体的限域与光物性研究，主要目标是柔性电子材料。
- `10.1002/anie.8483841` — 宏环主客体固体的电荷转移演化、客体释放和响应功能研究，不是一般制备方法。
- `10.1002/anie.5513729` — 通过原位聚合调节锂离子溶剂化与电池界面，主要贡献是锂金属电池性能。
- `10.1002/anie.7259832` — Bi-MOF纳米片用于酸性CO₂电还原制甲酸的催化材料和电流密度性能研究。
- `10.1002/anie.1718450` — 硼掺杂BiVO₄光阳极的极化子传输与水氧化动力学研究，属于水分解能源材料。
- `10.1002/anie.5768814` — WO₃/Cu₂O异质结储放电实现全天CO₂光还原，主要是光催化能源系统。
- `10.1002/anie.4606031` — 主要贡献是Ru/Ir配合物在芳香胶束中的远程静电封装与光功能；苯乙烯光聚合只是该主客体体系的应用。
- `10.1002/anie.5141626` — Sm掺杂CeO₂抑制陷阱态并提升整体水分解量子效率，属于光催化能源材料。
- `10.1002/anie.3346028` — 研究明确铬–铝氢化物配合物的化学计量N₂活化/质子化和金属核重排，未建立一般有机制备方法。
- `10.1002/anie.9224223` — 虽直接生成HMTA，但仅有硝酸盐/PET废物这一单一配对电解体系，主要评价Fe–Ni₂P催化剂、法拉第效率和碳选择性，尚不构成一般有机制备方法。
- `10.1021/jacs.6c16288` — 以COF孔道柔性调控ATP/核苷酸识别和荧光响应，主要是传感功能材料。

## 逐刊来源检查

- 出版社完整列表实查：checked 0；blocked 6（Chem、Chemical Science、CCS Chemistry、Science Advances、Green Chemistry、JOC）；unavailable 10（Nature、Science、Nature Catalysis、Nature Synthesis、Nature Chemistry、Nature Communications、JACS、Angew、ACS Catalysis、Organic Letters）。
- blocked/unavailable候选数均保持`null/unknown`；没有把Crossref/OpenAlex机器健康冒充出版社实查。
- 机器source coverage warning：0；closure coverage warning：7（Nature、Nature Communications、JACS、Angew、ACS Catalysis、Organic Letters、JOC）。

## 质量门

- 最终预发布质量门：[run 36550892094](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36550892094)，job `109348511375`，结论`success`。
- `validate-prepublish-review.mjs --allow-deferred --require-ready`：通过
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：通过
- `publicationReady=true`；`releaseStatus=ready_with_pending`；`conversionValid=true`；`blockers=[]`
- 正式转换预演及严格发布包：通过
- `productionDataModified=false`

## 提交链

- 审计触发：`6eba3f49482621c8650fed15c37c083e04efcd17`
- 机器快照：`3a8db42cee8538c6b8e23de275fb96b1a7f44d00`
- 最终staging：`3a50507f29d1e815a601887c2c8ebfde29325fdc`
- 最终staging blob：`8a3f473c024608d5f801c0c4a4396db97c8e61d6`
- state：`a610c8d19844a1c2c20d800c9768ec7239a56c6c`

## 生产隔离声明

本任务仅更新目标staging review、audit state及本执行回报。未新增、修改或删除生产文献卡片；未修改TOC/正文图；未请求Pages部署。媒体补取继续交由既有Tampermonkey/VPN Bridge。
