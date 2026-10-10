# Organic Synthesis Gallery 2026-10-11 08:00 预发布主审核回报

## 结论

- 状态：`ready_to_publish`
- 完整候选：69
- include：21
- exclude：48
- pending：0
- `reviewComplete=true`
- `readyToPublish=true`
- `snapshotFreshForSlot=true`
- 生产数据、TOC demand、Pages：均未修改

## 发布白名单

1. `10.1002/anie.7133146` — 可见光三重态氮烯转移模块化构建环状与链状季碳中心
2. `10.1021/jacs.6c12007` — Birch型还原咔唑阴离子实现氧化还原自适应超强还原光催化
3. `10.1021/jacs.6c15886` — 镍催化烯烃双碳官能团化实现气态烷烃的区域与对映选择性转化
4. `10.1021/acs.joc.6c01491` — N-(2-羟乙基)磺酰胺发散式构建官能化中环N,O-杂环
5. `10.1021/acs.orglett.6c04085` — 1,4-二氧六环自由基缓冲促进钯催化吲哚酮肟C2区域选择性酰基化
6. `10.1021/acs.orglett.6c03635` — 手性羧酰胺调控铑催化不对称C–H活化/环化合成手性1,2-苯并噻嗪
7. `10.1021/acs.orglett.6c04009` — 金属光氧化还原催化对映汇聚脱羧交叉偶联合成α-芳基酮
8. `10.1021/acs.orglett.6c03819` — 重氮丁二酸酯参与的对映选择性苄位C–H插入
9. `10.1021/acs.orglett.6c03480` — Rugonidines A–F的N-烷氧基胍基螺缩酮核心合成
10. `10.1021/acs.orglett.6c03470` — 瞬态导向基促进的锰催化C–H烷基化
11. `10.1002/anie.6516584` — ω-异氰基醛的宏环化
12. `10.31635/ccschem.026.202608189` — 钴催化经支链烯基金属物种实现炔烃氢烷基化
13. `10.31635/ccschem.026.202608019` — 钯催化酮烯氟化双官能团化立体选择性合成酰氟
14. `10.1021/acscatal.6c06578` — 重新定义光电化学体系的价值：选择性化学合成的独特反应调控维度
15. `10.31635/ccschem.026.202608090` — 电场催化亚胺鎓化学
16. `10.31635/ccschem.026.202607590` — 张力[8]–[9]对环芳烷的对映选择性合成与表征
17. `10.31635/ccschem.026.202607612` — 螺硫吡喃光门控动态共价化学实现成键与交换的时空调控
18. `10.31635/ccschem.026.202608472` — 从非水到水相：水参与的咔唑原位电化学重构
19. `10.31635/ccschem.026.202608262` — 电催化二氧化碳还原耦合醇氧化
20. `10.1016/j.chempr.2026.103076` — 碳–磷键轴阻异构
21. `10.1039/d6sc06879k` — Lewis酸性阴离子增强阳离子光催化剂向碱性底物的能量转移

其中第12–21项来自用户在 `audit/scope-rechecks/2026-10-10-user-12-pending-decisions.json` 作出的10项明确纳入决定，并仅在本次合法08:00槽进入白名单。另两项用户明确排除 `10.1021/acs.joc.6c01600`、`10.1016/j.chempr.2026.103025` 已在纠错清单登记且未与拟发布集合相交。此前12项历史pending全部完成本轮复核，未静默清空。

## 范围与证据

- scope rules：`scope-2026-10-02-v1`
- scope rules blob：`d3507dde0d44c4482ce9866ff81c73f0f97b0a92`
- corrections blob：`74978d92a16d353271f16f111425d09e4de84f07`
- handoff commit：`a4bba8eff16bf547ef2bca8f65a614abcc23a978`
- handoff/compact blob：`2a9ad6a916a2348a152d797029ec9ac361312517`
- latest blob：`25fbfeeb7c6bd1e648026d55a89b39ac3ab0cf9d`

纠错清单相对上一轮变化，因此触发受影响历史结论重审。所有69个compact候选均保留一遍判断与反向挑战；21个include均保存文章特定 `scopeAssessment` 与中文题名。`10.1021/acs.orglett.6c03480` 按核心路线/砌块纳入，未误称为完成全合成。高相关材料、能源、诊断、机理及无机配合物论文均按主要贡献反向挑战后排除。

## 发现层与机器审计

- fresh audit run：<https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38094032954>
- snapshot generatedAt：`2026-10-10T23:10:26.020Z`
- 北京主窗口：2026-10-09 至 2026-10-11；七天安全尾扫及catch-up保留
- active journals：16，全部覆盖
- gallery DOI：938
- source records：2578
- `criticalSourceFailures=0`
- `sourceFamilyGaps=0`
- `historicalCoverageLosses=0`
- `sourceCoverageAnomalies=4`
- `closureCoverageAnomalies=4`
- `verifiedThrough`继续保持在2026-09-18，未因健康警告而前移

出版社目录未被伪报为完整实查：16个 `sourceChecks` 保留 `blocked`/`unavailable` 真实状态，并与Crossref/OpenAlex机器健康分开记录。

## 质量门

- staging commit：`2320d3e06018b40ae573c16eb9431f77952d92f9`
- staging blob：`801cd50bc25a94dd8156585630d1ca75d40116fb`
- final gate run：<https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38094754470>

最终run全部步骤成功，包括：

- `validate-prepublish-review.mjs --allow-deferred --require-ready`
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`
- deterministic formal conversion preview
- strict release bundle build without publishing
- bilingual title and explicit scope-correction tests

最终记录：`recordValidationPassed=true`、`semanticReady=true`、`snapshotFreshForSlot=true`、`publicationReady=true`、`blockers=[]`。

初次远端提交因大JSON在连接器传输时被截断而解析失败，第二次因审计时间戳误写为未来时间导致转换预演拒绝；均未进入生产。最终文件已使用完整JSON和真实早于转换时刻的证据时间修复，并由上述最终run全绿确认。

## 交接

白名单已交给08:00唯一正式writer。本任务没有提前新增文献，没有修改生产卡片、媒体、TOC demand或Pages，也没有停用、改期或新增任何定时任务。
