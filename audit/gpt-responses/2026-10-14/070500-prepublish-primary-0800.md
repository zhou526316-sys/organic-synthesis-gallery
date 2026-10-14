# Organic Synthesis Gallery 2026-10-14 08:00 预发布主审核回报

## 结论

- 状态：`ready_with_pending`
- `readyToPublish=true`
- `publicationReady=true`
- `recordValidationPassed=true`
- `snapshotFreshForSlot=true`
- `semanticReady=true`
- `reviewComplete=false`（2 篇有真实文章级证据缺口）
- 完整候选 124 篇：纳入 24、排除 98、待补证 2。
- 唯一允许 08:00 正式 writer 新增的是 `publishableDois` 中的 24 篇；2 篇 pending 不进入生产。
- 本任务没有修改生产卡片、TOC demand、媒体或 Pages，没有执行部署，也没有执行 scope-removal。

## 发现层与固定基线

- 主基线及恢复审计快照提交：`4569c66adce5b7568171e52900cf9854bc13c8ea`
- 恢复审计 Actions：<https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38482335843>，结论 `success`
- 生成时间：`2026-10-13T23:09:49.225Z`（北京时间 2026-10-14 07:09:49）
- 审计窗口：`2026-09-19` 至 `2026-10-14`；主窗口为北京时间 10 月 12–14 日，含七天安全尾扫和 verifiedThrough catch-up。
- 16 个 active journals 全部来自 canonical registry；Crossref/OpenAlex 机器源无关键失败、无 source-family gap、无 historical coverage loss。
- 同代完整性：`audit/latest.json` 与 `audit/unresolved-latest.json` 的 `generatedAt` 相同；两者 `summary.unresolved=124`，并与完整 compact 数组长度一致。
- 机器统计：gallery 984 DOI、source records 2826、missing/unresolved 124、potential gaps 74、source coverage anomalies 4、closure coverage anomalies 7。
- 出版社实时枚举没有被冒充为完整证明：16 行 `sourceChecks` 中 blocked 2、unavailable/partial 14，未知候选数保持 `null`，未填 0。

## 范围与并发引用

- `scopeRulesVersion`: `scope-2026-10-02-v1`
- scope file/blob: `docs/literature-scope-contract.md` / `d3507dde0d44c4482ce9866ff81c73f0f97b0a92`
- corrections file/blob: `audit/literature-scope-corrections.json` / `74978d92a16d353271f16f111425d09e4de84f07`
- compact handoff commit/blob: `4569c66adce5b7568171e52900cf9854bc13c8ea` / `11f55818db861c12658df42c5c141040e21f74a3`
- latest diagnostic blob: `86386b7c5a17c2d91791b54aa061ab08403fe60f`
- canonical registry blob: `07de2cf052f55e91b3b1bb2554235ad2697d1838`
- protocol blob: `f60ecda25f4346539d46add94230be7596c71bf9`
- fixed-slot handoff doc blob: `63853aa74fd25aa1313b38303569c1eb6a98ae41`
- capability blob: `fbb0ecbf97a7ffde789b28264a83473901e8c9c9`
- 8 项明确 DOI 纠错与拟发布集合无交集；规则与纠错 blob 未变化，但 124 篇候选仍逐篇双遍审核，没有只更新版本号。

## 24 篇发布白名单

### JOC

1. `10.1021/acs.joc.6c01792` — 醋酸铜(II)催化 N-(2-芳基乙酰基)-1,3-噁唑烷-2-酮的有氧氧化制备 1,2-二羰基化合物
2. `10.1021/acs.joc.6c01506` — 2-(2′-酮烷基)-1,3-茚满二酮与三氟甲基亚胺酰硫氧鎓叶立德高度非对映选择性合成三氟甲基螺环丙烷
3. `10.1021/acs.joc.6c01769` — 连续流中无金属非均相光脱羧氟化实现实用 C(sp³)–F 键构建
4. `10.1021/acs.joc.6c01159` — 偕二氟烯烃与硫醇经亲核取代的立体选择性脱氟硫化
5. `10.1021/acs.joc.6c01796` — 水介导炔烃电化学磺酰化：可切换制备炔基或烯基砜
6. `10.1021/acs.joc.6c01870` — MPAThio 配体加速的钯催化芳烃非导向氢同位素交换
7. `10.1021/acs.joc.6c01630` — CsPbBr₃ 钙钛矿纳米晶使能的 6-氮杂尿嘧啶光化学自由基级联环化

### ACS Catalysis

8. `10.1021/acscatal.6c05786` — 非特异性过氧合酶催化的对映选择性醇氧化反应
9. `10.1021/acscatal.6c06095` — 表面富集氧空位稳定的铂/氧化铈催化醛基选择性氘代

### Angewandte Chemie

10. `10.1002/anie.2518487` — 分级序列控制实现具有优选手性的三股螺旋组装
11. `10.1002/anie.2910902` — 原位金属螯合调控共价有机框架拓扑并构建单原子位点

### JACS

12. `10.1021/jacs.6c15392` — 光氧化还原/铑催化对映选择性 C–H 活化分歧合成硫手性亚砜亚胺
13. `10.1021/jacs.6c17662` — 铁氢催化烯丙胺迁移氢胺化

### Nature Communications / Nature Synthesis

14. `10.1038/s41467-026-78512-x` — 分子氮解锁 γ-氧化铝的高活性氢化催化能力
15. `10.1038/s44160-026-01184-4` — 双功能导向基使能色氨酸交联大环肽的通用合成
16. `10.1038/s44160-026-01172-8` — 镍催化烯胺同系化的区域与对映选择性合成手性烯丙胺

### Organic Letters

17. `10.1021/acs.orglett.6c03780` — Tricrilactone D 与 F、Crispatumine I 及 2,3-反式 Crispatumine I 的仿生全合成
18. `10.1021/acs.orglett.6c03922` — Calix[n]BODIPY：一步组装低张力亚甲基桥连荧光大环
19. `10.1021/acs.orglett.6c03200` — 通过环化并同步引氟构建二氟官能化杂环
20. `10.1021/acs.orglett.6c03999` — 自由基触发烷基–酰基键断裂实现酮的脱酰官能团化
21. `10.1021/acs.orglett.6c03637` — 多硝基叠氮化物原位环化/还原制备钝感高能化合物
22. `10.1021/acs.orglett.6c03973` — 动态动力学拆分下锰催化 α-取代四氢萘酮不对称氢化
23. `10.1021/acs.orglett.6c03692` — 光催化三氟甲基酰胺化开环双环[1.1.0]丁烷制备三氟甲基酰胺基环丁烯

### Chemical Science

24. `10.1039/d6sc06571f` — 由生物基大宗化学品简便合成闭环可回收且结晶的立体规整聚(醚-交替-酯)

每篇纳入项均保存独立的 `reason`、`evidenceBasis`、两遍结论、`challengeReason` 和五字段 `scopeAssessment`；中文题名均含中文内容，不是英文缓存或占位。

## 2 篇待补证

1. `10.31635/ccschem.026.202608538` — *Regioselective ortho-B-H Functionalization of nido-Carboranes via Intramolecular Iodonium Activation Strategy*
   - 已取得题名、DOI 和 CCS Chemistry 官方目录记录，但官方文章页返回 403，compact 摘要为空。
   - 需要正文/摘要/SI确认实际亲电体或偶联伙伴、carborane 底物范围、分离产物与普适性。
   - `nextReviewSlot=2026-10-15T08:00:00+08:00`。
2. `10.1021/acs.joc.6c01296` — *Synthesis of Pyrido[2,3-d]pyrimidin-4(3H)-ones via SNAr/Tandem Cyclization*
   - 摘要确认无金属/无配体 SNAr-串联环化，但只明确一个烟酰胺前体和氰胺/甲酰胺两种小氮源，不能把“new method”措辞当成充分底物范围。
   - 需要正文/SI中的取代前体范围、分离收率与代表性放大。
   - `nextReviewSlot=2026-10-15T08:00:00+08:00`。

两项均保存原日期、两遍证据、`evidenceNeeded`、`attemptedEvidencePages`、`nextAction` 和来源 review；它们只暂缓自身，不阻挡 24 篇完整白名单。

## 重要边界复核

- 纳入 `10.1038/s41467-026-78512-x`：Nature Communications 官方摘要明确显示 γ-氧化铝在分子氮存在下催化醛、酮和 α,β-不饱和醛羰基氢化，具有跨三类底物的实际制备贡献，不只是催化材料机理。
- 纳入 `10.1002/anie.2518487` 和 `10.1002/anie.2910902`：依据分别是合成寡聚链的分级序列/三股螺旋架构控制，以及可拓展至 Cu/Ni/Co 的 COF 原位螯合拓扑控制；不是因为一般材料性能。
- 排除 `10.1038/s41586-026-11255-3`：确有聚乙烯表面 C–H 氧化与后续修饰，但主要贡献是单一聚合物表面/黏附功能，不是一般有机制备范围。
- 排除 `10.1038/s41467-026-78271-9`：机器人平台确实发现并测绘四种不对称反应，但主要一般性是强化学习/自动化平台，而不是一项独立、可发布的通用制备方法。
- 排除 `10.1002/anie.5172217`：Ge(II) 二阳离子表现多类基础反应性，但主要是低配位主族离子/配合物化学，未建立一般有机底物—产物制备范围。
- 排除 `10.1021/acs.joc.6c01955`：实际 Diels–Alder 反应已承认；现有摘要主要解析溶剂笼内螯合重组与环加成竞争，没有充分一般制备范围。
- 排除 `10.1039/d6gc05746b`：HMF 到 DFF 是真实转化，但文章以单一生物质底物的微液滴三相异相催化过程为主，没有一般底物范围。

## 历史待定与纠错

- 3 篇既有卡片 scope recheck 均重读并继续 `retain_while_pending`，没有执行下线：
  - `10.1021/acs.orglett.6c03499`
  - `10.1021/acs.orglett.6c03386`
  - `10.1021/acscatal.6c05520`
- 它们的最初日期、证据需求和来源记录均保留，下一复核槽统一为 2026-10-15 08:00。
- 本轮未发现满足最终证据与授权门禁的新增 confirmed-scope-removal，因此没有进行 deletion-only 事务。

## GitHub Actions 门禁

- 预发布记录提交：`0704bf8a9c6728162ee3e391e7e442895836f5fc`
- 首次专用门禁：<https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38483634565>，17 个实质步骤全部成功。
- 门禁回执提交：`423b91cd068d216db4120cc999e025769c579249`
- 最终专用门禁：<https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38483827890>，17 个实质步骤全部成功。
- 实际执行并通过：
  - `validate-prepublish-review.mjs --allow-deferred --require-ready`
  - `check-prepublish-readiness.mjs --allow-deferred --require-ready`
  - 确定性正式转换预览
  - 固定槽新鲜度检查
  - 严格 release bundle 构建（不发布）
- 通用站点质量门禁在 pre-writer 阶段仍以 2026-10-13 正式 review/marker 对照 2026-10-14 fresh audit，因此诚实失败于“正式 pending/backlog 尚未原子转换”和“124 个 fresh unresolved 尚未进入正式 review”。这是专用门禁已验证的 staging 到正式 writer 的待执行事务，不被伪装为成功；08:00 writer 必须原子生成正式 review/marker、合并 pending backlog 后再允许生产写入。

## 交付文件

- `audit/prepublish-review-2026-10-14-0800.json`
- `audit/literature-update-state.json`

正式 writer 只能消费审计文件中的 24-DOI `publishableDois` 白名单，并必须保留 2 篇 `deferredDois` 与 3 篇既有卡片 scope pending；不得从 98 篇排除集合、2 篇 pending 或其他候选中新增卡片。
