# 2026-10-17 08:00 预发布主审核完整回报

记录时间：2026-10-17 07:20:51 北京时间。上下文：Organic Synthesis Gallery prepublish primary。唯一基线：main。

## 用户可见完整回复

10 月 17 日 08:00 预发布主审核：`ready_with_pending`。

180 篇：20 纳入、138 排除、22 待定。真实 GitHub 两项严格门禁及转换通过，已交给 08:00 writer；本任务未新增生产文献。

全站质量尚未闭合，日期缺口和来源覆盖告警均保留。[完整回报](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/gpt-responses/2026-10-17/072051-prepublish-primary-0800-ready-with-pending.md)

## 真实状态与发布边界

- 本轮完整 compact：180 DOI，全部逐项阅读实际标题及可取得摘要，并进行同一审核者的两遍实质判断；不是不同模型/审核者。
- 20 include、138 exclude、22 pending。22项含原有10项与新增12项真正证据缺口；未审候选0，未把未读工作伪装成pending。
- 新include有文章特定的主要贡献、具体转化、一般制备证据、来源和边界挑战，20个titleZh已逐项核对。只使用实际取得的事实，不虚构SI、范围数或分离产率。
- 真实预发布门禁通过并生成严格发布包；不等于已正式上线。唯一正式writer运行 [38980804255](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38980804255)，已下载该次成功门禁证据，当前Arm步骤等待08:00，原子生产提交步骤尚未执行。
- 本轮写入仅为审计触发、staging、相关协调状态与本回报；生产数据、TOC demand、媒体和Pages均未被本任务写入；没有新增、修改或停用任何任务。
- 生产唯一DOI仍1186；昨日35项已由既有线上回执核实，未重复新增。本次20项均不在当前生产集合；12条明确纠错DOI与20项白名单交集为空，生产中也未发现该12项回流。

## 发现与固定blob完整性

原有main审计结束于10月16日，当前Actions无健康的同日审计，故仅通过既有push trigger请求一次；未取消或重启健康审计。

- 触发提交：3a5c0564d7e670c09a320e86d814f18a7eed4311。
- 真实审计：[38979605276](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38979605276)，job 117237099736，success；能力guard、DOI发现、artifact和成对持久化步骤均成功。
- snapshot提交：a0bdcb877984dac42872a998ef84e9a5c03f963f。
- generatedAt：2026-10-16T23:07:56.389Z，即10月17日07:07:56北京；latest/compact同代，endDate均10月17日，summary.unresolved=完整compact数组长度=180。
- latest blob：2f1ec3462ba1b3f52950129736be0db29e6347c7；compact blob：439978d6103c64509d55a8b09864ae8155ba6f16。
- 大JSON按固定blob完整解析并以32768字节块重组核验；staging.inputReadManifest保存所有块的偏移、长度和SHA256，不基于截断文本猜数量或DOI。
- 主窗口10月15–17日：162个已知发表日候选；另外1个10月14日历史待定；17个首次在线日未知。合计180。未知日不冒充主窗口已核实日期。
- 所有16本active期刊均来自唯一registry。三天主窗、七天机器安全尾扫、Crossref多ISSN online/published/created/deposited、OpenAlex及verifiedThrough catch-up均由现行稳定runner执行；catch-up自9月19日，七天救援自10月11日。
- sourceRecords=3404；criticalSourceFailures=0、sourceFamilyGaps=0、historicalCoverageLosses=0。
- sourceCoverageAnomalies=4，closureCoverageAnomalies=7；前者为健康来源家族间覆盖深度告警，按现行契约不阻断已证据审核的子集，但两者继续阻止闭合日期前推。
- 出版社真实RSS：13本部分可达、3本列表不可达；这不是完整TOC覆盖。16条sourceChecks的完整候选数/合成题数均为null，部分RSS观察数另列；blocked/unavailable未填0。Crossref/OpenAlex健康单独记录。
- 稳定能力fingerprint：66368e1bfc14d01fa3523874efa4d82c66fbd83dc68257ca7bf12c22b61174f7；能力registry blob：965365c7a2a5085fa7dc39591f36585164a46794。真实runner与本地21项date checks及6项OpenAlex回归均通过。

## 规则绑定与历史审核

- scopeRulesVersion：scope-2026-10-02-v1；文件docs/literature-scope-contract.md；blob d3507dde0d44c4482ce9866ff81c73f0f97b0a92。
- corrections：audit/literature-scope-corrections.json；blob 109be3cc5abedc62f744431e34faa0552564782d；完整items共12条，不用历史固定数代替。
- 范围/纠错blob与昨日正式review一致；已逐项处理当前180候选（含4个机器重开的旧结论），不是仅替换版本号。全站全部历史卡片重新审核未完成，也未作此宣称。
- 八个用户批准范围include保持有效：四个有准确日期者已在生产；d6sc06226a、d6sc05550h、d6sc07058b、d6sc06967c四项仍是独立first-online-date hold。最新精确DOI机器复核无日期，RSC页面403，注册/deposit日不替代首发日。
- 旧scope pending三项均保留当前卡片；从9月23日历史triage恢复joc.6c01559的未闭合制备问题，既有卡片范围待定共4项，与新文献22项分开记录。
- anie.9519061本轮完整Crossref摘要提供ATMS预活化Hf后44DMP、VCH和3-methyl-1-butene的聚合证据，独立支撑既有方法学纳入；只是保留现有卡片，不是新增或改生产数据。
- 10月12日历史排除挑战的四个未定案问题仍保留，不视为用户永久排除：jacs.6c11537、acscatal.6c06150、anie.2052342、acscatal.6c07255；没有伪称取得新SI或最终改判。
- 01192-4梯度COF膜的初始include/pending分歧原样保留于priorPasses。再审官方摘要与范围契约后，两遍最终均同意具体共价转化及独立制备证据仍不足，故pending；没有为转换通过伪造最终include或抹去分歧历史。
- verifiedThrough保持2026-09-18，不因子集就绪推进。

## 拟发布20项（未在本任务正式上线）

| DOI | 核验中文题名 |
| --- | --- |
| 10.1021/acscatal.6c07098 | 以炔扩展硅烯醇醚为亲核试剂的不对称烯丙基取代合成手性联烯 |
| 10.1021/acscatal.6c06352 | 深度学习驱动亚胺还原酶的发现与改造，高效合成手性冠瘿碱衍生物 |
| 10.1021/acscatal.6c05744 | 胺和醇导向稠合芳烃的非对映选择性多相氢化 |
| 10.1002/anie.7366839 | 催化不对称合成螺[3.3]庚烷型轴手性α-氨基酸 |
| 10.1021/jacs.6c15425 | 区域与立体双重控制实现间同立构交替聚乳酸-共-羟基乙酸的合成 |
| 10.1021/jacs.6c14402 | Cu–N₃单原子催化剂实现芳基亲电试剂的高周转C–N和C–O交叉偶联 |
| 10.1021/jacs.6c17862 | 经烷基锆自由基中间体实现非活化烯烃与α-亚胺酯的对映选择性偶联 |
| 10.1021/jacs.6c13913 | 手性辅助一锅合成形状稳定的纳米带并获得高不对称因子 |
| 10.1021/acs.joc.6c01258 | 布朗斯特酸催化2-三氟乙酰氨基-1,3-二烯的亚硝基Diels–Alder反应 |
| 10.1021/acs.joc.6c01860 | Selectfluor介导N-炔基氨基甲酸酯的串联内酯化—硒化 |
| 10.1021/acs.joc.6c02121 | 串联双催化结合铜催化不对称共轭加成与分子内钯／铱催化烯丙基烷基化 |
| 10.1038/s41467-026-78679-3 | 钴催化拉链式炔键迁移—硼氢化合成β-烯基硼酸酯 |
| 10.1038/s44160-026-01180-8 | 通过氢键催化合成共价有机框架 |
| 10.1021/acs.orglett.6c04098 | MnBn(CO)₅催化C–H活化／环化串联合成桥连含氮杂环 |
| 10.1021/acs.orglett.6c03691 | 二乙烯基甲醇经周环串联模块化合成高取代苯 |
| 10.1021/acs.orglett.6c03880 | N-(2-炔基芳基)-N-磺酰基氰胺与水一锅串联环化合成2-氨基-3-羰基吲哚 |
| 10.1021/acs.orglett.6c03959 | 有机催化N-酰基次磺酰胺与Morita–Baylis–Hillman碳酸酯的不对称N-烯丙基化 |
| 10.1021/acs.orglett.6c03360 | 噁唑啉外向导向实现苯丙氨醇衍生物的C(sp²)–H活化卤化 |
| 10.1021/acs.orglett.6c03751 | β-硼效应控制Baeyer–Villiger氧化的区域选择性C–C键断裂 |
| 10.1126/sciadv.aeh2683 | 苯胺N-氧化物在无邻基参与条件下实现高β选择性SN2糖基化 |

## 22项真实待定

每项均保留初始日期/未知精度、两遍证据、attemptedEvidencePages、evidenceNeeded、nextAction、sourceReviewFile；本轮未定项nextReviewSlot均为2026-10-18T08:00:00+08:00。详细证据和真实403/429/超时回执见staging，不把访问失败当作无范围证据。

| DOI | 本次仍缺证据 |
| --- | --- |
| 10.1021/jacs.6c13196 | 须取得具体单体、成键/编织锁定步骤与不同链/产物的制备证据，区分普适聚合拓扑方法与单体系自组装材料。 |
| 10.1021/jacs.6c11697 | 须读正文/SI吲哚和芳基亲电体系列、实际分离产物/收率，判断是否有独立一般制备方法而非单反应的材料再生研究。 |
| 10.1021/acs.joc.6c01920 | 取得查尔酮结构范围、环丁烷/烯烃的分离制备表与方法新颖性，区分敏化剂光物理控制和可推广的双分支合成。 |
| 10.1038/s44160-026-01192-4 | 需实际反应结构/转换条件与跨单体/连接类型制备证据，说明独立可迁移共价转化还是主要为膜空间梯度制样；不否认已报道四类连接。 |
| 10.1021/acs.orglett.6c03900 | 读取香豆素/碳硼烷反应伙伴表、分离产物与收率和新反应模式，区分通用砌块制备与发光结构少量变体。 |
| 10.1002/anie.4309009 | 需取得底物—分离产物/收率及实际制备实验，判定中心贡献是否为通用萜类制备平台而非仅新天然生物合成和环化机理。 |
| 10.31635/ccschem.026.202608330 | 取得出版社摘要/正文/SI，确认色原酮/含磷反应伙伴、立体控制与实际制备范围；在证据前保持未上线的逐篇pending。 |
| 10.31635/ccschem.026.202608307 | 须取得摘要/正文的具体S/O结构、聚合/交换反应与单体适用性，判明新制备方法是否独立于自修复性能。 |
| 10.1021/jacs.6c17009 | 需正文或SI的苯胺/马来酰亚胺底物表、分离产物与合成新能力，区分催化剂光物理展示与一般制备方法。 |
| 10.1038/s41586-026-11136-9 | 需官方正文/SI多类烯烃到醛的可分离制备证据，以及材料位点工程之外的可迁移反应能力；不得把l/b或转化率当底物范围。 |
| 10.1039/d6sc06226a | 已批准范围纳入不变；仅需官方准确First published日或等效独立准确online证据。继续补全原文制备证据，但不得把注册/存入日期冒充首发日期。 |
| 10.1039/d6sc06539b | 需完整光催化转移/环丙基化反应范围、分离制备证据及官方First published日；保留现有短摘要而不补造产物。 |
| 10.1039/d6sc05550h | 已批准范围纳入不变；仅需官方准确First published日或等效独立准确online证据。继续补全原文制备证据，但不得把注册/存入日期冒充首发日期。 |
| 10.1039/d6sc06729h | 需完整摘要/正文/SI明确氮杂环丙烷化底物、碱作用及分离产物范围，并取得准确First published日期。 |
| 10.1039/d6sc06546e | 需RSC正文/SI明确官能化转化、试剂/聚合物/链段适用性、产物表征及准确首次在线日；当前published-online仅年份。 |
| 10.1039/d6sc07058b | 已批准范围纳入不变；仅需官方准确First published日或等效独立准确online证据。继续补全原文制备证据，但不得把注册/存入日期冒充首发日期。 |
| 10.1039/d6sc05491a | 需完整摘要/正文/SI底物与产物范围和分离证据，以及官方准确First published日期；注册日不得代替首发日。 |
| 10.1039/d6sc06967c | 已批准范围纳入不变；仅需官方准确First published日或等效独立准确online证据。继续补全原文制备证据，但不得把注册/存入日期冒充首发日期。 |
| 10.1039/d6gc05574e | 需官方文章类型、完整摘要和具体底物到产物/制备范围，并核实准确首次在线日；若为综述或仅机理讨论则排除。 |
| 10.1039/d6gc04938a | 需实际烯烃到氯-甲酰氧基化产物的条件、范围、分离证据与准确First published日；不要将PVC回收论述当作反应验证。 |
| 10.1039/d6gc05296g | 需实际不同底物/反应的产物、分离与连续制备证据，确认是否新方法平台而非仅工程性能，并查准确First published日。 |
| 10.1039/d6gc05191j | 需完整摘要/正文/SI底物/产物分离及可推广路线证据，区分单一标杆催化剂性能，并核实准确First published日。 |

## 真实GitHub门禁、writer及未闭合项

审核提交：[e6f3b9be9de6a0d9a41565c8d3030215bf2298c5](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/e6f3b9be9de6a0d9a41565c8d3030215bf2298c5)。审核blob：422847c6e5072674ebe05d0360c02f2a977dbd1a。

严格门禁：[38980759729](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38980759729)，job 117240827664，success。

实际runner命令：

- node scripts/validate-prepublish-review.mjs audit/prepublish-review-2026-10-17-0800.json --allow-deferred --require-ready：success。
- node scripts/check-prepublish-readiness.mjs audit/prepublish-review-2026-10-17-0800.json --allow-deferred --require-ready：success。
- node scripts/convert-prepublish-review.mjs audit/prepublish-review-2026-10-17-0800.json --require-ready：success；正式review preview与严格bundle成功，未做canonical production writes。

| 指标 | 实际结果 |
| --- | --- |
| readyToPublish | true |
| publicationReady | true |
| recordValidationPassed | true |
| snapshotFreshForSlot | true |
| semanticReady | true |
| conversionValid | true |
| reviewComplete | false |
| 本任务productionDataModified | false |
| 本任务Pages部署 | 未请求 |

另一个全站质量检查 [38980759739](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38980759739)，job117240827798，failure。实际失败包括今日state pending与昨日formal不等、180个unresolved尚未进入formal pending/下一槽carryover、昨日formal七项未知首发日校验，以及首次提交phase=preparing。成功回执写入后phase转ready_with_pending，但未知日期和全站正式验收并未因此解决。前两项具有发布前对齐性质，未知首发日校验是独立真实未闭合项，不能概括为全部预期差异，更不能编造日期或修改validator为绿灯。

只将20项完全审核白名单交给现有writer；22项待定不准进入本次新增卡片。writer/Pages/线上交付须在08:00链路另行核实，本回报不宣称今日已正式发布、已部署或全站闭合。
