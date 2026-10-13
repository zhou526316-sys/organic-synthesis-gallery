# Organic Synthesis Gallery｜每日08:00正式发布任务（2026-10-13交接版）

**执行方式与唯一时刻**：每天北京时间08:00执行一次，目标仓库 `zhou526316-sys/organic-synthesis-gallery`，`main` 为唯一正式基线。本任务不仅汇报，也须在合法窗口内实际完成批准文献的固定发布、TOC交接、Pages部署、线上验收和发布后质量核查。08:00–09:00仅为同一固定发布槽的常规技术执行窗口，不是09:00的第二次发布。2026-10-11曾临时延至12:00，**该特例只适用于10月11日，未来不得沿用**。18:00已永久取消；不得停用/更改/新增替代定时任务、重新补发晚间文章或重复触发同槽writer。只有“确认误收”的既有 `confirmed-scope-removal`（schema3、deletion-only、只删已证实DOI）是独立例外，不能用于新增。

## 1. 每轮必读的真实权威与恢复点

第一步读取 `audit/literature-update-state.json`，确认 `activeRun`、phase、最新已完成主审、持久化 `pendingReviewBacklog`、次槽 `nextSlotPublicationBacklog`、`lastPublication`、`verifiedThrough` 和上次网站验收。再从当前 `main` 读取：
- `PROJECT_RULES.md`；`docs/literature-update-protocol.md`；`docs/fixed-slot-release-handoff.md`；`docs/literature-scope-contract.md`；`docs/publication-release-contract.md`；`docs/formal-review-conversion.md`；
- `audit/literature-capability.json`、`audit/literature-scope-corrections.json`、`audit/scope-removal-authority.json`、`audit/publication-release-state.json`、`shared/literature-journals.js`；
- 当日 `audit/prepublish-review-YYYY-MM-DD-0800.json`、`audit/latest.json`、完整 `audit/unresolved-latest.json`、最近正式 `audit/review-*.json` 和 `audit/pending-review-*.json`、`audit/scope-rechecks/`、`audit/historical-reviewed/approved-admissions.json`、生产7份文献数据、`public/toc-demand-live.json`、实际GitHub Actions runs。
所有规则以最新用户指令和当前 `main` 为准，旧文件的18:00/历史过渡规则不得重新激活。大文件用同一Git blob SHA连续完整读取，不得截断后猜数。任何共享字段变化必须重审受影响DOI，不能单纯替换版本或哈希。最先判断**本槽原writer是否已armed/running/committed/deployed**；若已存在则继续复用和验收，不重复启动、取消、重置或抢占锁。

## 2. 上游发现与查全（不得只检索关键词）

既有上游链路为06:55机器审计 → 07:05主语义审核 → 07:35补审 → **08:00唯一正式发布**；本08:00任务不得重建这些调度或反复取消正常运行的Actions。审计用北京时间3个日历日主窗口，另有7日独立机器安全尾扫、Crossref所有注册ISSN的 `online/published/created`、OpenAlex、迟到创建/存入登记救援及 `verifiedThrough` 落后时的追溯补扫；不应因标题关键词、跨来源只出现一次或“机器来源0篇”而静默排除。优先复用主线经回归验证的最新稳定capability；capability变化应触发重扫，但不要盲目采用实验版本。

日期为当天的paired `latest/compact` 必须 `endDate` 相同且 `generatedAt` 完全相同，时间处于本槽06:55到09:00法定快照窗口，staging的 `handoffGeneratedAt` 同代；全量 `unresolved.length` 与两份summary严格相等；覆盖 `shared/literature-journals.js` 中全部16种当日active期刊及各自 `activeFrom`。**以registry为准**：原10刊从2026-07-01，Chem/CCS Chemistry/Science Advances从09-19，JOC从09-22，Chemical Science/Green Chemistry从10-01。逐刊真实记录出版社 `sourceChecks`（checked/blocked/unavailable、查询页和取得的数量）；出版社访问受阻是未知而不是0，也不能用Crossref机器健康冒充出版社已查全。机器 `criticalSourceFailures`、`sourceFamilyGaps`、`historicalCoverageLosses`、候选缺项、时间戳不一致或权威并发冲突阻断；两个机器来源家族健康时可明示保留 `sourceCoverageAnomalies`、`closureCoverageAnomalies` 警告，而不阻止已逐篇批准DOI，且不得越过缺口推进 `verifiedThrough`。说明3日主窗与7日救援的各自数量，真实多少是多少。

## 3. 全候选双遍学术审核与pending管理

每个候选（包含新出现的尾扫/迟登记、历史pending、用户单篇复核和次槽carryover）必须有真实第一遍与独立反向挑战，精确分为 `include/exclude/pending`。按**论文主要贡献与一般制备证据**判断，绝不可只凭有机产物、关键词、很多蛋白变体、少量性能演示自动纳入；真正的有机反应方法、全合成/形式全合成、有一般性的砌块路线、酶催化制备和聚合反应方法可以纳入。纯材料/电极能效、膜/抗菌、仅生物结构或NRPS工程、只谈机制/器件的研究一般排除，**但不能整类排除真实多相有机制备**。标题与摘要足以支持时不要求机械式取得全文/SI；访问失败不能被写成“没有底物范围”。缺正文图、PDF、TOC是另一个媒体问题，不能当成范围pending。

每条include保存经过核实的 `titleZh`、`reason/evidenceBasis`、`firstPassDecision/challengeDecision/challengeReason` 以及文章独立的 `scopeAssessment` 五字段：`primaryContribution`、`preparativeTransformation`、`generalityEvidence`、`sourceEvidence`、`boundaryChallenge`。禁止统一模板“考虑过材料/机理”“已展示底物拓展”冒充实证；不得编造收率、底物数量、SI图号或放大实验。高相关exclude也要反向检查是否具有一般制备贡献。最终DOI级已确认排除以**完整**corrections registry为准；未定案scope-rechecks不自动排除，用户明确的DOI级例外必须保留实际文章类型和不确定性，不伪造科学证据。

`pending` 仅用于真实审过且仍有特定证据缺口或实质分歧的单篇，保留原日期、两遍观点、`evidenceNeeded`、`attemptedEvidencePages`、`nextAction`、`nextReviewSlot`、`sourceReviewFile`；与旧backlog取并集，不丢条目，不把pending改exclude、也不让1篇pending卡住其余合格include。未审核候选不能伪装成pending；pending转最终结论需回应旧证据缺口和来源。所有变化留痕。

## 4. 唯一08:00合法发布与原子提交

先确认同槽有效Gate及原固定writer状态。既有 `Validate prepublish literature review` Gate必须在main上真实执行：
`scripts/validate-prepublish-review.mjs <当日staging> --allow-deferred --require-ready` 和 `scripts/check-prepublish-readiness.mjs <当日staging> --allow-deferred --require-ready`；核实 `readyToPublish`、`publicationReady`、`snapshotFreshForSlot`、`semanticReady`、`recordValidationPassed` 全为true。正式 `scripts/convert-prepublish-review.mjs <当日staging> --require-ready` 或完全同输入SHA成功的 `release-preflight` artifact 必须 `conversionValid=true`、`publicationReady=true`；preview-only、测试通过、过期证据、未核实的原始摘要不能代替许可。

检查 `scopeRulesVersion/file/blob`、`scopeCorrectionsFile/blob`、`handoffCommitSha/blob`、`qualityControl.scopeContract`、全部DOI partition及确认排除交集为零。正式review与pendingQueue应按 `JSON.stringify(value,null,2)+'\n'` 精确UTF-8序列化并核对Git blob SHA；**即使0 pending，也要生成真实的空队列SHA**，避免历史writer故障。writer需在合法窗口内从最新main重新获取实际8项 `protectedBlobs` 和 `productionCards`，在**同一非force Git commit**原子写入正式review、pending queue、生产文献、schema2 slot-release/per-DOI marker，提交前检查当前main、锁、版本和全部SHA；绝不拆开逐文件发布或篡改bootstrap。

历史已完成独立双遍审核并授权的文献，如符合 `audit/historical-reviewed/approved-admissions.json` 和最新marker规则，只能同一08:00事务另列 `historicalAdmittedDois` 与 `dailyPublishableDois`，不能重复入库或把历史补录计入Today/Hot/公众号每日新增。2026-07-01以前历史文章 `metadata_only`；7—9月已有文献仅补官方TOC，不新抓正文/PDF；10月1日起新文献的媒体采集仍交给Tampermonkey/VPN Bridge。没有官方TOC不阻止合格文献，禁止另起OA PDF/HTML提图发布链路。TOC队列 `public/toc-demand-live.json` 在正式提交后由已有作业派生，必须 `webpageDoiCount=productionCards`。

只在**尚处合法窗口**且不存在同槽writer时才允许主线合同已有的受控触发兜底，绝不绕过工具安全拒绝。过期槽 `expired_slot`、无提交的no-op、测试成功不等于正式发布；若无许可记 `publication_missed`/`incomplete_review`，不得从18:00或次日槽外补发。若writer已成功但TOC/Pages失败，可按现有授权路径只重新同步**同一个不变的生产快照**，不得再新增任何DOI。

## 5. Pages真实交付、发布后查漏和状态

固定writer→刷新TOC demand→现有Pages链。Pages的 `literature_authorization` 必须先于build/deploy成功；验证main-context部署、8项受保护SHA、真实marker提交、中文标题、生产DOI全量及排除/待定缺席；不能假设GITHUB_TOKEN提交自动触发下游。真实成功部署后，从 `https://gallery.gczhouwld.com/release-delivery.json` 和网站实际资源核对 `productionCards`、唯一 DOI集合、每个accepted/retained、拒收缺席、版本SHA及搜索/定位，取得真实 `pagesRunId`、线上时间与回执；旧版被并发保护拒绝时不要错报成功。`synced` 只表示达到其严格闭合条件；有合法待审则 `synced_with_pending`、`publicationChecksPassed=true`、`reviewComplete=false`；部署不一致才 `sync_failed`。不得把仓库提交、CI success、TOC需求表或媒体缺图冒充完整网站交付。

实际发布后再运行 DOI-union 机器审计和 `scripts/validate-literature-quality-gate.mjs` 的真正GitHub质量Gate。晚于固定槽才发现的DOI必须逐篇核对：exclude有具体证据就登记；符合纳入的另存 **`nextSlotPublicationBacklog`**（include，两遍证据、发现版本、原发表日期、`nextPublicationSlot`），不可在槽外补发，也不可冒充pending。最终未闭合的机器 `unresolved` 必须精确等于有效formal pending与次槽carryover的DOI并集，不能按数量容差放行；同步和历史closure分别核验，`verifiedThrough` 不越过覆盖缺口。失败的独立Gate须明确列出，不可用Pages成功替代。

## 6. 断线、超时与最终报告

先做超时风险预评估；一次只查必要SHA、单个run/job步骤或小范围日志，长文件按固定blob分段读取；运行中不反复取消重启，不因连接超时重新发布。阶段结果与检查点及时写入Git（在允许范围内），跨聊天窗口以main及实际runner记录恢复，不凭历史助手回答猜数。任何技术修复、PR合并、no-op success与真实上线都须区别记录。

每日必须汇报：北京时间日期/窗口、每刊审核与新增篇数、三日/七日来源覆盖、include/exclude/pending及逐DOI证据缺口、常规与历史补录各自数量、原子提交SHA、review/marker/TOC SHA、prepublish Gate和writer及Pages和独立postrelease audit/quality Gate的**实际run ID与结论**、准确生产总数、双来源线上核验与部署时间、`verifiedThrough` 和来源异常、次槽carryovers与真正未完成工作。不猜数字、不称“明天再修”即已修好。

**发送报告之前**先将与用户可见正文相同的完整报告保存到 `audit/gpt-responses/YYYY-MM-DD/<HHMMSS>-daily-0800-release.md` 并回读确认。Git写入拒绝时标记 `response_sync_pending` 或 `response_sync_failed`，不绕过安全拒绝；绝不在公开网站或Git报告输出密钥。

## 7. 首次承接快照（不得硬编码）

截至2026-10-13上午：main正式marker为 `2026-10-13T08:00:00+08:00`，生产 **979** 篇；该槽 **7篇日常 + 8篇历史补录**；当日主审98篇（7 include / 86 exclude / 5 pending）；持久化pending **5** 篇、次槽carryover **2** 篇。Pages已真实交付979篇，phase=`synced_with_pending`。`verifiedThrough` 仍在 **2026-09-18**，不可因生产同步自动前推。任何运行必须重读main和最新实际数据，不沿用这里的定值。

**唯一成功判据：合法08:00原子入库 + 真实Pages一致交付 + 发布后未知 DOI 缺口得到诚实处理 + 质量Gate实际结果及Git报告同步。**
