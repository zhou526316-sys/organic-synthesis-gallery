# Gallery 2026-10-16 08:00 预发布主审核完整回报

记录时间：北京时间2026-10-16 07:25后；任务上下文：发布前主审核。main唯一生产基线。审核提交：0a9e9a4c9120e1a654e5b2c2de6354ec837709b9；review blob：846ae3994d6aad2d8a57cb6ee4bd4639e5342262。

## 实际结果与边界

225个完整compact DOI均先逐篇判断，再逐项反向挑战；同一审核者两遍，不冒称不同模型或独立人员。35 include，180 exclude，10有真实证据缺口的pending；另3项既有卡片scope recheck保留原证据与现有卡片，不算10项新候选pending，也不擅自下线。没有跳过候选或把未审项伪装pending。

拟纳入分刊：Science 1、JACS 6、Angew 6、Nature Communications 3、ACS Catalysis 2、Organic Letters 10、JOC 7。全部35项准备经检查的中文题名及文章特定primaryContribution/preparativeTransformation/generalityEvidence/sourceEvidence/boundaryChallenge。COF顺序合成一篇凭独立的小分子一锅反应、底物范围和克级天然产物中间体制备纳入，不凭COF/TOF；CHST1一篇凭糖底物广谱性及实际硫酸化糖链制备纳入，不凭蛋白表达或Siglec活性。单一生物途径机制、材料性能、纯DFT等排除均保留真实发生的有机转化，不编造“完全没有合成”。

12项明确DOI纠错不回流。实际仓库全量静态DOI联合集1151，35拟纳入与现有目录交集0；纠错清单与可见生产目录交集0。当前范围规则与最近formal一致，未无差别重审全站；相关scope-recheck中的4项开放问题仍不是永久排除或本轮新增定案。

## 发现与时窗

07:05附近没有同日06:55审计或有效同槽运行；通过已有trigger提交e9935ed6501760e12fcf5f08a028ea5568b762ac请求一次恢复，没有取消正常审计。实际审计38821722018成功，配对快照提交0384dfd231e48647c90851c3953b588a845e4c33：

- latest blob：cbdddcca42dfd6c37c3e1208c829f4696e0678c4。
- compact blob：dbfe00b92f2f1485f044a8f3450d9b42e02d1d5e。
- generatedAt均2026-10-15T23:09:40.165Z，endDate均2026-10-16，完整JSON读入并按固定SHA分段核查225项；两份summary.unresolved均225，无截断猜测。
- 三日主窗2026-10-14至10-16，202项有日期候选在主窗；额外1项有日期旧文和22项最初日期未知的注册/feed救援候选另列，不把它们全称为三日新增或七日尾扫。created/deposit救援起点10-10，verifiedThrough catch-up实际查询从9-19。
- 3239来源记录；16 active journals；criticalSourceFailures=0，sourceFamilyGaps=0，historicalCoverageLosses=0。
- sourceCoverageAnomalies=4（Chem、Chemical Science、CCS Chemistry、Green Chemistry）且来源家族健康；closureCoverageAnomalies=5。保留告警且verifiedThrough仍9-18，不为发布白名单虚构全闭合。
- 真实官方publisher feed 13刊部分可达、3刊不可达；sourceChecks与Crossref/OpenAlex健康分开，完整候选数和syntheticTitleCount对无法完整枚举的出版社均null而非0。没有声称出版社逐期目录已查全。
- 选择registry最新已验证能力fingerprint 66368e1bfc14d01fa3523874efa4d82c66fbd83dc68257ca7bf12c22b61174f7；实际runner能力guard成功，本地21项日期检查和6项OpenAlex回归也通过；全轮未热换能力。

## 用户8项决定与日期

8篇DOI级人工include均已记录在audit/scope-rechecks/2026-10-15-user-approved-eight-pending-includes.json，blob 6e6e98c1919a8fc09168518ca7acdebfe12dc61b。acscatal.6c06572、acs.orglett.6c04101、ccschem.026.202608538和acs.joc.6c01296已在昨日获准恢复批次实际上线，今天不重复添加。4项RSC范围include不撤销，但准确First published仍无证据，本轮精确重试均HTTP403；created/deposited不是首发日。

通过真实HTTP200的Nature页面独立补全：s41467-026-78484-y的电化学卤胺化（芳基/杂芳基/脂肪等底物，Ellman辅助基而非催化不对称）；s41467-026-78630-6的水相烯烃/腙氧化[3+2]（多样1-吡唑啉、环丙烷衍生及生物缀合）。两篇dc.date都为2026-10-15，题名/DOI相符；后一篇原为仅feed日期未知，review另附日期reconciliation，不改写机器生成时刻。KRh@MFI那篇也取得真实摘要，但其多底物分离制备贡献仍待SI；不凭单一1-癸烯性能定案。

## 10项pending（统一下槽2026-10-17 08:00）

- 10.1002/anie.4309009｜A Sesterterpene Synthase for Tibonene and a Cytochrome P450 for Its Oxidation to Tibonone From Streptomyces sp. YIM 121038：需取得底物—分离产物/收率及实际制备实验，判定中心贡献是否为通用萜类制备平台而非仅新天然生物合成和环化机理。
- 10.1021/jacs.6c17009｜Excited-State Engineering of Viologen Photocatalysts via Synergistic Through-Space and Through-Bond Electronic Coupling：需正文或SI的苯胺/马来酰亚胺底物表、分离产物与合成新能力，区分催化剂光物理展示与一般制备方法。
- 10.1038/s41586-026-11136-9｜Rh3+ stabilized in KRh@MFI catalyses regioselective hydroformylation：需官方正文/SI多类烯烃到醛的可分离制备证据，以及材料位点工程之外的可迁移反应能力；不得把l/b或转化率当底物范围。
- 10.1039/d6sc06226a｜3-SF 5 -Bicyclo[1.1.1]pentyl Alcohol: Practical Synthesis and Precursor for 3-SF 5 -Bicyclo[1.1.1]pentyl Ethers (Esters)：已批准范围纳入不变；仅需官方准确First published日或等效独立准确online证据。继续补全原文制备证据，但不得把注册/存入日期冒充首发日期。
- 10.1039/d6sc05550h｜Convergent Synthesis of Azabicyclo[4.1.1]octanes through the Formal Cycloaddition of Bicyclobutanes with 2-Azadienes：已批准范围纳入不变；仅需官方准确First published日或等效独立准确online证据。继续补全原文制备证据，但不得把注册/存入日期冒充首发日期。
- 10.1039/d6sc06546e｜Functionalization of strong C(sp 3 )–H bonds in the presence of weak C(sp 3 )–H bonds enables the block-selective modification of thermoplastic elastomers：需RSC正文/SI明确官能化转化、试剂/聚合物/链段适用性、产物表征及准确首次在线日；当前published-online仅年份。
- 10.1039/d6sc07058b｜Lewis acid-like catalysis enabled by electrophilic nitrogen radical cations：已批准范围纳入不变；仅需官方准确First published日或等效独立准确online证据。继续补全原文制备证据，但不得把注册/存入日期冒充首发日期。
- 10.1039/d6sc05491a｜Practical Asymmetric Hydrogenation of Tetrasubstituted Cyclic Enamides for Enantioenriched 3-Amino-4-Methylpiperidines：需完整摘要/正文/SI底物与产物范围和分离证据，以及官方准确First published日期；注册日不得代替首发日。
- 10.1039/d6sc06967c｜Taming Nitrogen Stereogenicity: Enantioselectivity Control at a Reluctant Center：已批准范围纳入不变；仅需官方准确First published日或等效独立准确online证据。继续补全原文制备证据，但不得把注册/存入日期冒充首发日期。
- 10.1039/d6gc05574e｜Beyond Reactive Motifs: Functional-Group-Regulated Selectivity in Electrocatalytic Biomass Conversion：需官方文章类型、完整摘要和具体底物到产物/制备范围，并核实准确首次在线日；若为综述或仅机理讨论则排除。

每项保留原始日期或真实未知、两遍理由、实际尝试的来源URL、所需证据、重试动作、最初sourceReviewFile。新Wiley、ACS和三项RSC边界页面均实际HTTP403；未把访问失败当没有底物范围。3项既有卡片范围pending（acs.orglett.6c03499、acs.orglett.6c03386、acscatal.6c05520）继续retain_while_pending。

## 实际GitHub门禁和交接

最终预发布门禁38823346248 / job116724916330 / source 0a9e9a4c9120e1a654e5b2c2de6354ec837709b9完整成功：两项--allow-deferred --require-ready、正式转换预览、strict release bundle及artifact均成功。readyToPublish=true、publicationReady=true、recordValidationPassed=true、snapshotFreshForSlot=true、semanticReady=true；reviewComplete=false、pending=10。

首次门禁38823044079也成功；随后仅校正Wiley证据入口并附实际HTTP回执，225项决策集合未变，最终上述运行重新验证准确字节。没有以旧CI绿灯代替新字节检查。

对应现有writer38823403641已下载最终成功gate证据、通过handoff/timing测试，Arm/prepare步骤在08:00之前运行；尚未执行production commit。没有手动重复触发writer，没有本轮新建/关闭/改期任务、媒体获取、TOC写入或Pages部署。10-15一次性人工时间例外不延续到10-16，今日正常08:00–09:00技术宽限。

全站质量运行38823346223仍failure；首次对应job116723935431日志实际确认：今日state pending集合与昨日formal不一致、fresh unresolved尚不属于旧formal pending/carryover，以及4个旧RSC pending原发表日期缺失。前两项需writer原子转换后重验；日期未知要求与当前全站validator仍有实际未闭合点，不能将所有失败都称作预期，更不能编日期或改门禁以绿灯。本任务未获授权改此代码。35项严格可发布子集通过与全站验收成功是不同结论。

## 用户可见最终回复全文

10月16日08:00预发布主审核已完成，状态为 `ready_with_pending`。

- 完整双遍审核 **225 篇**：35 篇纳入、180 篇排除、10 篇待补证。
- [GitHub严格预发布门禁](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38823346248)通过，35篇白名单已交给08:00 writer；本任务未新增生产文献。
- 你批准的8篇中，4篇已上线；另4篇RSC仍核验首发日期，范围纳入决定保留。

全站质量检查仍有正式记录转换及未知日期校验未闭合，不能表述为“已发布”或“全站验收通过”。

[完整审核记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-10-16-0800.json)
