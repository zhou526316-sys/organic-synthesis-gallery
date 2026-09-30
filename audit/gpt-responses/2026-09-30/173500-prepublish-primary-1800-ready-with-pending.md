本轮 18:00 发布前主审核已完成，状态为 `ready_with_pending`。45 篇 fresh compact 候选全部完成双遍审核：16 include、27 exclude、2 pending。未修改生产卡片、TOC/媒体数据，也未请求或触发 Pages 文献部署。

### 16 篇发布白名单

1. `10.1021/jacs.6c14997` — Miophytocen D、Roridin E、Verrucarin J与Verrucarol的不对称发散式合成
2. `10.1021/acs.joc.6c01197` — 铝阳离子催化吲哚C2–H活化与对映选择性Michael加成
3. `10.1021/acs.joc.6c01925` — 活化烯烃或炔烃的氢氰胺化合成功能化氰胺衍生物
4. `10.1021/acs.joc.6c01880` — 共轭不饱和内酯重排构建三环呋喃并吡咯烷酮
5. `10.1021/acs.orglett.6c03451` — 未保护肽中不同二硫键的构象导向顺序编辑
6. `10.1021/acs.orglett.6c03878` — 非共价作用促进的手性芳硫酚催化烯烃不对称氢二氟烷基化
7. `10.1021/acs.orglett.6c03250` — 光氧化还原/镍双催化实现烷基硼酸酯的去硼不对称Suzuki–Miyaura偶联
8. `10.1021/acs.orglett.6c03717` — 镍催化醛亚胺与非活化烷基碘化物的还原烷基化
9. `10.1021/acscatal.6c06753` — 光氧化还原/钴双催化Kharasch加成与共调聚合成α-氯羰基化合物
10. `10.1002/anie.6888467` — Pd(0)催化噻唑N-氧化物分子间C–H芳基化不对称合成轴手性杂联芳基
11. `10.1002/anie.6111891` — 钴催化环状酸酐去对称氢化
12. `10.1002/anie.8317220` — 三重态–三重态湮灭上转换驱动的绿光光点击反应
13. `10.1002/anie.8267819` — Pd催化不对称双烯丙基化构建含邻位叔碳/季碳中心的类固醇骨架
14. `10.1002/anie.4546692` — 与Ruminococcus gnavus多糖相关的支化葡鼠李聚糖的合成、构象与促炎活性
15. `10.1021/acs.joc.6c01817` — 去甲基Amycomycin类似物的汇聚合成
16. `10.1021/acs.orglett.6c03465` — 可见光介导的呋喃到哒嗪骨架编辑

每个 include 均保存准确中文标题、文章特定 `scopeAssessment`、实际摘要证据和针对最可能越界理由的 challenge。对高相关排除项也做了反向挑战：例如 `10.1002/anie.7984934` 的苄醇氧化只是单原子光催化剂LMCT探针，`10.1021/jacs.6c17136` 的尿素生成以能源电催化位点工程为主，`10.1002/anie.3848864` 仅有单一专门设计分子的表面反应，均未达到一般制备范围门槛。

### Pending 与历史边界项

- `10.1021/acscatal.6c05520`：继续 pending。摘要确认无碱N-烷基化，但未给出胺/醇底物表、分离产物或收率；需通过既有 Tampermonkey/VPN Bridge 读取正文或 SI。
- `10.31635/ccschem.026.202608472`：继续 pending。当前仅有“水参与的咔唑原位电化学重构”题名与元数据，缺少具体键变化、底物范围及分离证据。
- 窗外持久 pending `10.31635/ccschem.026.202608262` 已保留原日期、来源 review、取证记录和下一步，没有因越窗丢失。
- `10.1021/acs.joc.6c01559`、`10.1002/anie.9519061` 继续 retain/include。
- `10.1021/acs.orglett.6c03499`、`10.1021/acs.orglett.6c03386` 继续 retain while pending；未把排查记录当作排除决定。

### 审计与范围契约

- 范围契约：`scope-2026-09-24-v1`
- fresh snapshot：北京时间 2026-09-30 17:15:29
- active 期刊：16 本，完整覆盖
- gallery DOI：694；source records：751
- compact 候选：45，latest/compact 同代且计数一致
- `criticalSourceFailures=0`
- `sourceFamilyGaps=0`
- `sourceCoverageAnomalies=0`
- `closureCoverageAnomalies=7`
- `verifiedThrough` 保持 `2026-09-20`

16 本期刊的出版社完整实时列表本轮如实记录为 10 个 `unavailable`、6 个 `blocked`，候选计数保持 `null/unknown`；没有把 Crossref/OpenAlex 健康或单篇文章页核验冒充出版社列表实查。

[机器审计 run 36694769736](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36694769736) 成功。审计触发提交为 `3e9662b76fd57a475cce07d45d810956230cd2e3`，快照提交为 `368839f361fcf2b15d912718f1e5fc260ae12e8f`；compact blob 为 `5f22aef980f7cf13895d87f63787f2ee22c8daac`。

### 质量门与提交

[预发布质量门 run 36696723599](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36696723599) 成功：

- `validate-prepublish-review.mjs --allow-deferred --require-ready`：通过
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：通过
- `publicationReady=true`
- `releaseStatus=ready_with_pending`
- `reviewComplete=false`
- `conversionValid=true`
- 严格发布包：通过
- `productionDataModified=false`

首次门检准确发现 `openEvidenceGaps` 把窗外持久 pending 也计入当前 handoff 的口径错误；修正为当前 compact 的 2 项后复跑成功，逐篇结论和白名单未改变。

[查看最终预发布审核文件](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-09-30-1800.json)

提交链：

- 初始 staging：`2b419c0a1d9972c839d0a1918c0c643fb05d5e70`
- 计数口径修正/最终 staging：`577f122910453542f66d3d92db2facd9f0a3bf82`
- 最终 staging blob：`7b0acf9f2aceaa3e741f5f2a88db4ae4a0ff8bc8`
- 最终 state：`341a5ce600653a1131ab465ae57ad0f673595b82`

