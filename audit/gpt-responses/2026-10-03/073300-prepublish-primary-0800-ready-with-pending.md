# Organic Synthesis Gallery 发布前主审核回报 — 2026-10-03 08:00

## 结论

本轮状态为 `ready_with_pending`。fresh compact 的 83 篇候选均完成逐篇双遍范围审核：14 include、63 exclude、6 pending。14 篇白名单可独立进入正式转换；6 篇当前候选的证据缺口不阻断其余白名单，因此 `reviewComplete=false`、`publishableSubsetReady=true`。

本轮只写入预发布 staging 与协调 state。未新增生产卡片，未修改生产文献、中文标题数据或媒体数据，未请求或触发 Pages 部署，也没有宣称完成全站无差别排查。

## 发布白名单

1. `10.1021/jacs.6c16285` — 邻位碳硼烷B(4)–H键选择性烷氧基化：Cu(I)光催化1,5-HAT与硼自由基–极性交叉
2. `10.1021/acs.joc.6c01674` — 碱促进异构苯并呋咱与2-(2-氨基苯基)乙腈合成吲唑并[2,3-a]喹啉
3. `10.1021/acs.joc.6c01138` — 萜类深共熔溶剂中热氮杂环丙烷–烯烃环加成合成吡咯烷
4. `10.1038/s44160-026-01162-w` — 利用天然官能团的光电化学C(sp³)–C(sp³)交叉偶联
5. `10.1021/acs.orglett.6c03409` — 烯烃与双亲核试剂电化学环化构建哌嗪和1,4-二氮杂䓬骨架
6. `10.1021/acs.orglett.6c03963` — 锰介导异腈与二芳基氧膦级联环化合成单/双杂原子取代吲哚并喹喔啉
7. `10.1021/acs.orglett.6c03861` — 无光催化剂可见光合成β-(三氟甲基)烯基酮肟
8. `10.1021/acs.orglett.6c03908` — 光氧化还原催化脱氢丙氨酸及其二肽二氟甲基化：不对称概念验证
9. `10.1021/acs.orglett.6c03980` — 铑催化不对称1,4-迁移/双环化级联合成螺内酯
10. `10.1021/acs.orglett.6c03808` — 尿苷双膦酸酯-碳半乳糖：稳定的α-1,4-半乳糖基转移酶抑制剂
11. `10.1021/acs.orglett.6c03881` — 可见光驱动Brønsted酸催化烯胺酮环化模块化合成咪唑并[1,2-a]氮杂芳烃
12. `10.1021/acs.orglett.6c03905` — 分子内EDA配合物可见光环化及其在柯楠因型生物碱全合成中的应用
13. `10.1021/acscatal.6c05151` — 铜催化烯炔线性远程双官能团化
14. `10.1021/acscatal.6c04883` — 光加速铱催化C–H硼化

所有新 include 均带有文章特定的 `primaryContribution`、`preparativeTransformation`、`generalityEvidence`、`sourceEvidence` 与 `boundaryChallenge`，并准备了非占位中文标题。

## 当前 compact pending

- `10.1021/acscatal.6c06578`：仅取得题名与元数据；需确认 ACS 文章类型、摘要、原创反应实例及底物/产物范围，避免把 Perspective/Review 或无范围观点稿误纳入。
- `10.31635/ccschem.026.202608090`：缺亚胺底物、产物、反应数量、分离收率及电场催化的一般制备证据。
- `10.31635/ccschem.026.202607590`：官方索引片段支持“高度对映选择性合成”，但仍缺起始物类别、产物系列、分离收率和可迁移性。
- `10.31635/ccschem.026.202607612`：缺光控成键/交换的底物、产物与通用动态共价制备范围。
- `10.31635/ccschem.026.202607659`：缺环氧树脂氧化–Cope消除的具体产物、分离/物料衡算和聚合物化学可推广范围。
- `10.31635/ccschem.026.202608472`：缺咔唑水参与电化学重构的具体底物、产物、数量和分离证据。

此外，越窗待证 `10.31635/ccschem.026.202608262` 继续保留原始日期与来源；没有因超出当前发现窗口而丢弃。现有卡片范围复核 `10.1021/acs.orglett.6c03499`、`10.1021/acs.orglett.6c03386`、`10.1021/acscatal.6c05520` 均继续 `retain_while_pending`，未下线也未借本轮补新增。

## 范围依据与兼容性

- scope version：`scope-2026-10-02-v1`
- scope file/blob：`docs/literature-scope-contract.md` / `d7e163da1167917d2d6e9b9ba4d070b46e6253e5`
- corrections file/blob：`audit/literature-scope-corrections.json` / `4df5fb1fb5c25804846c70eee555e9ae798c5d99`
- handoff commit/blob：`c54b6140f2b67b4620782c04cfed9240ea476a98` / `141a0109fbb6ee255ed0b2450eb45de4c0803691`
- canonical registry blob：`57050105998284ccbf87b1a5fe513b256b648949`

scope 与 corrections blob 相对上一正式槽未变化。本轮仍重新读取规则、纠错和相关 scope-rechecks，并逐项确认 11 条目标历史结论的兼容性；未将排查记录当作排除决定。明确排除且已线上验证删除的 `10.1038/s44160-026-01164-8` 保持 `removed/deployed_verified`，没有从旧树恢复。

## fresh audit

机器审计 [run 37076447655](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37076447655) 成功，生成于 2026-10-03 07:13:07（北京时间）：

- active journals：16，canonical registry 全部覆盖
- gallery DOI：765
- source records：764
- unresolved/full compact：83
- `criticalSourceFailures=0`
- `sourceFamilyGaps=0`
- `sourceCoverageAnomalies=1`（CCS Chemistry）
- `closureCoverageAnomalies=5`（Nature Communications、Angew、ACS Catalysis、Organic Letters、JOC）
- `verifiedThrough=2026-09-20`，因 closure 覆盖告警未推进

latest 与 compact 的 `generatedAt` 一致，两份 summary 的 unresolved 均为 83，并与完整 compact 数组长度相等。没有取消或重启健康的同槽运行。

## GitHub 预发布质量门

最终预发布检查 [run 37077581939](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37077581939) 成功，job `111070792427`：

- `validate-prepublish-review.mjs --allow-deferred --require-ready`：通过
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`：通过
- staging 语义决策集完整，`semanticFieldFailures=0`
- `snapshotFreshForSlot=true`
- `publicationReady=true`
- 正式转换预演：通过
- strict release bundle：通过
- `productionDataModified=false`

此前两次失败运行仅用于定位 staging 语义/转换字段问题；最终成功运行已经在修正后的 blob 上完整重跑并取代诊断结果。

## 提交与未部署边界

- staging file：[`audit/prepublish-review-2026-10-03-0800.json`](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-10-03-0800.json)
- staging commit：`d2ed1839922c022f75f8196e3dc97ca5009e56ef`
- staging blob：`fff0a29ed56637b00184ac00665988379b195834`
- state commit：`a865a9f5b72d77998cd916ee16809e81adc8830e`
- state blob：`d8e772a9db607e841a11f1dc7703de1e6b35529b`

本轮结果是预发布白名单与待证队列，不是已发布或已部署声明。生产卡片、媒体与线上站点仍保持上一已验证快照。
