# Organic Synthesis Gallery 预发布主审核（2026-09-25 18:00）

## 结论

本轮状态为 `ready_with_pending`。fresh compact 的 37 篇候选全部完成逐篇双遍审核：10 include、26 exclude、1 pending。10 篇已形成固定槽发布白名单；单篇 pending 仅暂缓自身。没有写入生产文献卡片、TOC/媒体数据，也没有请求 Pages 部署。

## 权威输入与可追溯引用

- scopeRulesVersion: `scope-2026-09-24-v1`
- scopeRulesFile: `docs/literature-scope-contract.md`
- scopeRulesBlobSha: `f3102cd8a21d5b9dcd31a4f8d7d1a19e3c4e89e8`
- scopeCorrectionsFile: `audit/literature-scope-corrections.json`
- scopeCorrectionsBlobSha: `040902a773f72057dff59de5c66d27f568984813`
- canonical registry blob: `57050105998284ccbf87b1a5fe513b256b648949`
- handoffCommitSha: `8acf5b79e92fcbd1d41951b235e32902031a8ea1`
- compactHandoffSha / handoffBlobSha: `7e416311a41166fab6441e01ca86a80f362b16bd`
- latestBlobSha: `e8d159d4a3448ed09c747a97be7071a7798e47d9`

scope 与 corrections blob 均与 08:00 槽一致；已重新检查兼容性，并重读四项历史 scope recheck。没有只替换规则版本号，也没有无差别重抓已决全站论文。

## 机器发现闭环

16:55 独立审计未留下适用本槽的新快照，且没有同槽正常运行锁，因此经规定的 push bridge 提交 `a2d3c964a2a003357fa026d6292f5dcd77a1fd7e` 触发 literature-audit。run [36116440444](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36116440444) 成功，快照提交为 `8acf5b79e92fcbd1d41951b235e32902031a8ea1`。

- generatedAt: `2026-09-25T09:06:42.635Z`（北京时间 17:06:42）
- 主窗口: 2026-09-23～2026-09-25
- 7日机器尾扫起点: 2026-09-21
- created/deposit救援起点: 2026-09-19
- galleryDois: 585
- sourceRecords: 675
- potentialGaps: 20
- unresolved: 37
- latest/compact 同代且两个 summary.unresolved 均为 37，完整 compact 数组长度也是 37
- activeJournals: 16，覆盖 canonical registry 全部 active 期刊
- criticalSourceFailures: 0
- sourceFamilyGaps: 0
- sourceCoverageAnomalies: 1（Science）
- closureCoverageAnomalies: 7
- historicalCoverageLosses: 0
- verifiedThrough 保持 `2026-09-20`

Science 的 source warning 和七项 closure warning 继续阻止 closure/verifiedThrough 前推，但不清空已发现并完成双遍审核的 per-DOI 白名单。

## 10 篇发布白名单

1. `10.1021/jacs.6c15890` — 光驱动苄基腈去消旋化中的乘法立体控制
2. `10.1021/acs.joc.6c01742` — 可见光诱导膦鎓盐催化芳香C–H键位点选择性卤化与硫属化
3. `10.1021/acs.orglett.6c03171` — 台架稳定[TBA][PS₂Cl₂]平台顺序组装非对称三硫代和四硫代磷酸酯
4. `10.1021/acs.orglett.6c03850` — 基于Janus苷元的发散策略合成可缀合PGL-I表位
5. `10.1021/acs.orglett.6c03528` — 环氧化物介导的茚酮向异香豆素可控形式氧插入
6. `10.1021/acs.orglett.6c03794` — 氧杂环丁烷到环丙烷的脱氧骨架编辑
7. `10.1021/acscatal.6c06303` — 可见光与Lewis酸催化的烯烃–芳香醛分子内(3+2)环加成
8. `10.1002/anie.2810612` — Artocarpus communis中神经保护性香叶基查尔酮的发现与仿生合成
9. `10.1002/anie.7009966` — 卤键辅助的手性镍催化反式选择性Henry反应
10. `10.1002/anie.4976267` — 可调谐硫烯基氮烯实现呋喃向含氮杂环的骨架跃迁

每篇均保存非占位中文标题、`primaryContribution`、`preparativeTransformation`、`generalityEvidence`、`sourceEvidence`、`boundaryChallenge`，以及独立 first pass / challenge 结论。

## Pending 与边界挑战

### 新候选 pending

`10.31635/ccschem.026.202608262` — *Electrocatalytic Carbon Dioxide Reduction Coupled with Alcohol Oxidation*

fresh compact 仍无摘要。题名同时支持“能源电催化”排除假设和“配对醇氧化可能是一般电有机合成”纳入假设；缺少醇底物、氧化产物、底物范围、分离收率及论文对主要贡献的表述，因此两遍均维持 pending。已尝试 DOI、CCS Chemistry文章页和PDF入口，官方入口当前未返回可用摘要/正文；下一步继续由 Tampermonkey/VPN Bridge 补证，不使用OA自动提图。

### 高相关排除的反向挑战

- `10.1021/jacs.6c12662`：承认真实四嗪–硫醇共价交换与多种硫醇环境，但主要贡献是负反馈系统与微流控行为，不是分离产物导向的一般制备方法。
- `10.1002/anie.8769472`：承认光电化学体系真实生成环己酮肟，但核心是ZnOx/黑硅光阴极电子动力学与器件指标，且缺一般底物范围。
- `10.1002/anie.3377029`：承认合成了三种SAM分子，但论文以钙钛矿器件效率和稳定性为主要贡献。
- `10.1038/s41467-026-78033-7`：Nature官方页确认文章类型为 Perspective，按综述性文章排除：[official page](https://www.nature.com/articles/s41467-026-78033-7)。
- `10.1002/anie.4866271`：Wiley官方页确认核心是tRNA门控生物合成通路与生态/发育效应，未建立工程酶通用制备路线：[official page](https://onlinelibrary.wiley.com/doi/10.1002/anie.4866271)。

### 历史边界项

- `10.1021/acs.joc.6c01559`：retain/include。
- `10.1002/anie.9519061`：retain/include。
- `10.1021/acs.orglett.6c03499`：retain while pending，等待捕获反应的产物/伙伴范围。
- `10.1021/acs.orglett.6c03386`：retain while pending；不得标作完成全合成，等待路线通用性与原始日期证据。

## 出版社与机器源

16本期刊的 `sourceChecks` 均保留机器源健康和出版社实时检查的明确区分。完整出版社列表页未形成可靠可审计计数，因此 10 项记为 unavailable、6 项记为 blocked，candidateCount 保持 unknown/null；没有把 Crossref/OpenAlex 健康冒充出版社实查。对需要边界裁决的 Nature 与 Wiley 单篇官方页另行取得并记录，但不把单篇取证扩张成完整列表覆盖。

## 质量门

最终 GitHub 预发布门 [run 36117322293](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36117322293) 成功（job `108014366570`）：

- `validate-prepublish-review.mjs --allow-deferred --require-ready`: success
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`: success
- recordValidationPassed: true
- semanticDecisionSetComplete: true
- snapshotFreshForSlot: true
- publicationReady: true
- conversionValid: true
- formalConversionPreview: success
- strictReleaseBundle: success
- blockers: []
- productionDataModified: false

初次落盘门已通过记录和语义校验，但转换预演发现 pending 的 `evidenceNeeded` 使用了数组而不是既有字符串 schema；修正为与历史耐久 pending 相同的字符串字段后，run 46 与最终 run 48 均完整成功。之后一次门失败仅由 `updatedAt` 短暂晚于runner转换时间数秒引起，调整为真实证据时间后最终门成功；未改变任何文章结论。

## 提交与不变项

- audit trigger: `a2d3c964a2a003357fa026d6292f5dcd77a1fd7e`
- snapshot: `8acf5b79e92fcbd1d41951b235e32902031a8ea1`
- initial staging: `056d2ff8032868b2a862013125592644c20e564c`
- normalized staging: `47140da206b0edf2b9252c9577f438e9efce5041`
- gate-evidence staging: `45c1e64b3f16e7a65c24e4ecd014b6d071591624`
- final staging: `564928d656bef6b010a3d19475a112838f9df9b6`
- final staging blob: `6b28fd72a4e66d2b99cb9609a024e42b6f9d3acf`
- state: `703ab5203cfc987e1a3881cbff1a547f6a819d05`
- state blob: `b1939eaf4a1f95fe42e96d08f966b7e9d9e1304b`

本任务未新增、修改或删除任何生产卡片；未改变TOC/正文媒体；未请求或触发Pages生产文献部署；也未执行confirmed-scope-removal事务。
