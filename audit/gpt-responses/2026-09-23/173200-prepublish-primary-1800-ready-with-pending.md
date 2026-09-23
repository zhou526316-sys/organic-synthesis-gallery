# Organic Synthesis Gallery 发布前主审核（18:00 槽）

本轮发布前审核已完成，最终阶段为 `ready_with_pending`。北京时间 2026-09-23 17:31，已为 18:00 固定发布槽形成 10 篇 DOI 白名单；2 篇新候选与 2 篇历史边界卡片仍待补证。本任务没有修改生产文献、TOC 或媒体数据，也没有触发 Pages 部署。

## 快照与窗口

- 范围契约：`scope-2026-09-23-v1`
- 契约文件/blob：`docs/literature-scope-contract.md` / `4ca6a9343ee46c617f08166062940f8919e311de`
- 纠错清单/blob：`audit/literature-scope-corrections.json` / `040902a773f72057dff59de5c66d27f568984813`
- 主窗口：2026-09-21～2026-09-23；7 日安全尾扫起点：2026-09-17
- active 期刊：16
- fresh audit：`2026-09-23T09:13:15.174Z`（北京时间 17:13:15）
- handoff commit/blob：`fab9edda8c988db12f23fc9e77d7f1673b05afcc` / `4f6a8643700fc9854fb261ebfdede5a512f9a635`
- 3 日主窗口机器记录：272；7 日尾扫额外记录：258；机器并集：530
- gallery DOI：532；compact unresolved：44；`potentialGaps=22`
- `criticalSourceFailures=0`、`sourceFamilyGaps=0`、`sourceCoverageAnomalies=0`
- `closureCoverageAnomalies=1`（Angew）；`verifiedThrough` 保持 2026-09-20，未越过异常或 pending

机器审计 run [35841359058](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/35841359058) 成功；latest/compact 同代，两个 summary 的 unresolved 都为 44，且等于完整 compact 数组长度。

## 审核结果

完整 44 篇候选均完成第一遍和独立 challenge：

- reviewed：44
- accepted：10
- rejected：32
- pending：2
- release status：`ready_with_pending`
- `publishableSubsetReady=true`
- `reviewComplete=false`

### 18:00 发布白名单

全部拟上线日期为 2026-09-23；每篇的 article-specific `scopeAssessment`、证据、challenge 和中文标题均已写入 staging。

1. JACS — `10.1021/jacs.6c16346`  
   *Biocatalytic Redox Cascade Enabled Site-Selective Direct β-Alkylation of Cyclopentanones*  
   中文：生物催化氧化还原级联实现环戊酮位点选择性直接 β-烷基化
2. JACS — `10.1021/jacs.6c17163`  
   *Electrochemical Upgrading of Lignin-Derived Phenolics via Vanadium Redox-Mediated Decoupling*  
   中文：通过钒氧化还原介导的解耦实现木质素来源酚类的电化学升级转化
3. JACS — `10.1021/jacs.6c12613`  
   *Isocyanoalkynes: Leveraging a High-Energy Interstellar Lead for Unique Multi-Bond-Forming Cascades*  
   中文：异氰基炔：利用高能星际线索实现独特的多键形成级联反应
4. JACS — `10.1021/jacs.6c16766`  
   *Tyrosinase-Catalyzed Tyr–Aniline Coupling Enables Peptide Editing, Macrocyclization, and Phage-Display-Based Selection*  
   中文：酪氨酸酶催化的酪氨酸–苯胺偶联实现肽编辑、宏环化及基于噬菌体展示的筛选
5. JOC — `10.1021/acs.joc.6c01866`  
   *Photosensitizer-Free Synthesis of Arylsulfonated 4,5-Fused Polycyclic Coumarin Derivatives via Photoinduced Cascade Sulfonylation/Cyclization of 4-(N-Alkyl-N-acrylamido)coumarins*  
   中文：无光敏剂条件下 4-(N-烷基-N-丙烯酰胺基)香豆素光诱导磺酰化/环化级联合成芳基磺酰化 4,5-稠合多环香豆素衍生物
6. Organic Letters — `10.1021/acs.orglett.6c03733`  
   *Construction of Tetrahydropyridobenzimidazoles via Ni–Al Bimetal-Catalyzed Tandem C(sp²)/C(sp³)–H Annulation*  
   中文：Ni–Al 双金属催化串联 C(sp²)/C(sp³)–H 环化构建四氢吡啶并苯并咪唑
7. Organic Letters — `10.1021/acs.orglett.6c03301`  
   *Palladium-Catalyzed Site-Selective C–H Arylation of Arenes: Using Diaryl Disulfides as an Arylation Reagent*  
   中文：钯催化芳烃位点选择性 C–H 芳基化：以二芳基二硫化物为芳基化试剂
8. Organic Letters — `10.1021/acs.orglett.6c03166`  
   *Stereoselective Polyglucuronic Acid Assembly via the Iron-Catalyzed Stereospecific Glycosylation with Glycal Epoxides*  
   中文：铁催化糖烯环氧化物立体专一性糖基化实现聚葡糖醛酸的立体选择性组装
9. Organic Letters — `10.1021/acs.orglett.6c03732`  
   *Trifluoroallyl Sulfonium Salts: Reagents for Highly Regioselective Trifluoroallylation*  
   中文：三氟烯丙基锍盐：用于高区域选择性三氟烯丙基化的试剂
10. Organic Letters — `10.1021/acs.orglett.6c03574`  
    *Visible Light-Mediated Dearomative Remote Functionalization of Arenes via a Tandem Strain-Release Spirocyclization Relay*  
    中文：串联应变释放螺环化接力实现可见光介导的芳烃去芳构化远程官能团化

### 本槽 pending

- `10.1038/s41467-026-78015-9` — *Solid–vapor synthesis of dynamic crystalline one-dimensional supramolecular polymers from amorphous macrocycles*。出版社列表证明存在固–汽主客体驱动的超分子聚合物合成，但尚未取得单体/主客体范围和可迁移架构控制证据，因此不能仅按“材料”排除，也不能从 teaser 纳入；交给现有浏览器/VPN 路径补正文证据。[Nature Communications 实时页](https://www.nature.com/subjects/physical-sciences/ncomms)
- `10.31635/ccschem.026.202608262` — *Electrocatalytic Carbon Dioxide Reduction Coupled with Alcohol Oxidation*。仍缺醇底物、产物、范围及分离/制备证据；能源索引不足以排除，标题也不足以纳入，继续 deferred。

### 规则变化触发的历史复核

- `10.1021/acs.joc.6c01559`：retain/include。新取得摘要显示一锅多组分、温和无金属条件，并覆盖伯/仲胺与伯苯甲酰胺，构成可推广制备方法；荧光/成像用途不抹去该方法学贡献。[ACS JOC Latest Articles](https://pubs.acs.org/joceah/latest-articles)
- `10.1002/anie.9519061`：retain/include。Wiley 原文显示 ATMS 原位预活化铪催化剂，并用于多个困难 α-烯烃单体的聚合，属于真正聚合方法学。[Wiley 文章页](https://onlinelibrary.wiley.com/doi/10.1002/anie.9519061)
- `10.1021/acs.orglett.6c03499`：继续 pending。摘要证明质子门控开环、动力学窗口及 [4+2] 捕获，但没有产物/捕获伙伴范围；保持现有卡片不动。[ACS 资料页](https://acs.figshare.com/articles/journal_contribution/Protonation-Gated_Strain-Release_Generation_of_Amino_o_quinodimethanes/33965903)
- `10.1021/acs.orglett.6c03386`：继续 pending。当前仅能确认 Chasmanine AF 环片段路线；单一片段不是完成的全合成，且尚不足以证明通用砌块方法，保持现有卡片且不标“全合成”。[ACS 资料页](https://acs.figshare.com/articles/journal_contribution/Synthesis_of_a_Fully_Functionalized_Chasmanine_AF-Ring_Fragment/33962722)

主要排除原因：MOF/HOF/电极/电池/太阳能/OER/传感器等材料与能源性能研究；生物、临床与转录组研究；新闻/社论；纯计算或机理研究；单一笼体、卟啉、双蒽等目标特定制备；以及缺乏一般有机制备贡献的通路重编程。高相关排除均完成反向 challenge，没有把额外底物或衍生物存在误写成“完全没有”。

## Publisher sourceChecks

出版社实查与机器健康分开记录，所有 blocked/unavailable 的计数均为 `null`，未冒充 0：

| 期刊 | 状态 | 出版社候选数 |
|---|---:|---:|
| Nature | unavailable | unknown |
| Science | unavailable | unknown |
| Nature Catalysis | unavailable | unknown |
| Nature Synthesis | unavailable | unknown |
| Nature Chemistry | unavailable | unknown |
| Nature Communications | unavailable（取得单篇实时 teaser，未取得完整分页） | unknown |
| JACS | unavailable | unknown |
| Angew | unavailable | unknown |
| ACS Catalysis | unavailable | unknown |
| Organic Letters | unavailable（仅有部分 ACS 摘要证据） | unknown |
| Chem | blocked | unknown |
| Chemical Science | blocked | unknown |
| CCS Chemistry | blocked | unknown |
| Science Advances | blocked | unknown |
| Green Chemistry | blocked | unknown |
| JOC | blocked（单篇摘要另行取得） | unknown |

## 质量门、提交与生产状态

质量门 run [35843296908](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/35843296908) 全部成功：

- `validate-prepublish-review.mjs --allow-deferred --require-ready`：成功
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：成功
- 正式转换预演：成功
- 严格 release bundle：`conversionValid=true`、`publicationReady=true`
- `publishableDois=10`、`deferredDois=2`、`reviewComplete=false`、`blockers=[]`

提交链：

- 审计触发：`1ba2f62cab2427fba4dcccd03f9ca69fd53a3784`
- 机器快照：`fab9edda8c988db12f23fc9e77d7f1673b05afcc`
- staging 初次审核：`b240fbb192e166f8b2601f806b33644e2c706269`
- 审计时间对齐与最终 staging：`2a80aa2c7f5d83964d229d916c0b98715fe76cac`
- state：`f213b92f46d9c5fe4fcbeb332707b8d24cf40d10`

最终 staging：[prepublish-review-2026-09-23-1800.json](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-09-23-1800.json)

本轮没有执行发布、生产卡片新增/删除、TOC 修改、媒体抓取或部署；当前生产基线仍为机器快照读取到的 532 个 DOI。此前已确认的 scope deletion-only 纠错不属于本轮新增动作，本轮也未恢复任何已下线误收项。
