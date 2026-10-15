# Organic Synthesis Gallery 2026-10-15 一次性临时手动预发布审核及 GitHub 同步回报

- 项目与任务：Organic Synthesis Gallery / one-time manual execution of 08:00 prepublish primary review after missed automation
- 时间：北京时间 2026-10-15 09:35:10（本次人工运行时间，非07:05定时作业）
- 唯一正式发布槽：每日北京时间 08:00；10月15日的60分钟技术宽限为08:00—09:00；18:00永久取消。本次在宽限期后执行，仅审计和证据承接，不提前或延后增加生产文献。

## 一、实际 GitHub Actions 和来源诊断

- 06:55 审计未在既定时间生成可交接的完整同日快照；当天早先手动恢复触发见 `audit/automation-triggers/literature-audit-request.json`。
- 成功 DOI-union 机器审计：run 38664760054，https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38664760054 。
- 09:18:13 北京时间同代快照：audit/latest.json blob `34da183f65eb5ee5f68312832a05214f3faeebf1` 与 audit/unresolved-latest.json blob `ae0c49d6213156abc2cbd0e38a2cb1ff6e2a43a6`，generatedAt `2026-10-15T01:18:13.403Z`；handoff 持久提交 `61d4ca9a9631009dedd45d0181e8174d6e4b4ab2`，endDate=2026-10-15，16活跃期刊完整存在，summary.unresolved=compact.unresolved.length=latest.missingCandidates.length=209，DOI去重后为209。
- 3030 来源候选记录，其中209个尚未在 Gallery 正式收录且未最终处理；机器关键来源失败 `0`、sourceFamilyGaps `0`、historicalCoverageLosses `0`。另外 sourceCoverageAnomalies `4`、closureCoverageAnomalies `5`，出版社feed为13个不完整列表和3个不可访问；29条 publisher first-online date 未核实。不能把blocked/unavailable记为0篇。数据包含46条元数据 publicationDate=2026-10-16 的 Science Advances、43条日期缺失及1条10月12日，属于安全救援/无日期候选，不代表今日新增。
- 较早 run 38664760080 的质量门禁失败：其执行时消耗了旧一代207个 unresolved 且5项关键来源失败的快照；后续成功机器审计不等于完整语义审核或原门禁已成功。

## 二、人工双遍审核的诚实边界

- 完整 compact 共209条。本次已记录17条实质审核决策：有明确制备证据的 include 15条、明确非最终证据的旧pending 2条、exclude 0条。其余192条尚未逐篇完成双遍审核，原样记为unreviewed而不是pending，更不是exclude。
- 15条已审核 include 全部保存 DOI专属的 primaryContribution、preparativeTransformation、generalityEvidence、sourceEvidence、boundaryChallenge，以及reason/evidenceBasis、firstPassDecision、challengeDecision、challengeReason和非英文占位的中文标题。其中2条 Nature Synthesis 使用出版社官方摘要/正文验证；其余以本次固定blob中对应 DOI 的实际摘要为依据，未编造底物数量和实验收率。它们只保留于次日08:00的审查承接，不构成今天的放行名单。
- 两条已存 pending：`10.31635/ccschem.026.202608538` 和 `10.1021/acs.joc.6c01296`。保留首次日期、原审双遍证据、attemptedEvidencePages、sourceReviewFile和缺失SI/制备范围问题；仅把 nextReviewSlot 改为 `2026-10-16T08:00:00+08:00`。无新证据不能认定已解决。
- 已批准的用户精准排除 `10.1038/s41467-026-78512-x`、`10.1002/anie.2910902`、`10.1021/acscatal.6c06095`、`10.1002/anie.2518487` 均未进入本轮已审纳入集合。
- 现行范围契约 `scope-2026-10-02-v1` blob `d3507dde0d44c4482ce9866ff81c73f0f97b0a92`，纠错清单 blob `109be3cc5abedc62f744431e34faa0552564782d`；唯一 registry blob `07de2cf052f55e91b3b1bb2554235ad2697d1838`。

## 三、仓库确实写入的文件和状态

1. `audit/prepublish-review-2026-10-15-0800.json`：提交 `001da9e262bf554070e17860c43a223744f5e3da`，blob `bf171b1d1f47d16dd38825cf7af7d3b6383c129e`。status=`incomplete_review`，reviewComplete=false、readyToPublish=false、recordValidationPassed=false、snapshotFreshForSlot=false、semanticReady=false、publicationReady=false；publication allowlist为空，剩余192条 DOI 列表完整保留。
2. `audit/literature-update-state.json`：提交 `7a3d52429bcb71e40a49ccf53ced0b50cb0b3fe4`，保留15条 `status=ready_for_next_slot` 的逐篇两遍证据承接和2条原 pending 的补证历史。既有 phase=`sync_failed` 及生产发布记录均未伪造为成功。
3. GitHub 自动严格预发布门禁：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38666195429 。对当前不完整 staging 执行的普通 `validate-prepublish-review.mjs --allow-deferred` 失败，后置 `check-prepublish-readiness.mjs --allow-deferred --require-ready` 失败；中间的 `validate-prepublish-review.mjs --allow-deferred --require-ready` 因先决失败被跳过，不能谎称它已实际成功执行。源代码回归测试/转换测试独立通过不等于发布通过。
4. writer：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38666259892 ，已跳过，未触发生产写入。附加文献质量检查 run 38666304218 仍不通过，记录为预期的全局未审及交接未闭合状态，而非强行绿灯。

## 四、安全发布事实

- 本次没有新增/删除正式生产卡片，没有修改 TOC demand、PDF、正文图、Pages、既有定时任务，没有人工触发第二个新增出版槽。
- 现有正式 publication marker 仍为2026-10-14日期的已确认 scope-correction deletion-only 状态，productionCards=1087，并非今日新发布。
- 需要下一次合法 `2026-10-16T08:00:00+08:00` 窗口的 fresh 同代来源审计、全部候选的两遍审核、日期及范围核对、两项严格 `--allow-deferred --require-ready` Actions 成功，方能由唯一 writer 决定是否正式发布。不得把这份未完成手动补审变成 off-slot admission。

## 对用户的直接回报

今日机器抓取已重新成功且209 DOI 完整可追踪，但人工主审核只完成17条并保留剩余192条未审。15条证据充分的纳入决策只承接次日槽；2条真实 pending 延续补证。今日仍为 incomplete_review，不具备发布资格；GitHub 写入成功，严格 CI 正确拒绝放行。本次不增设新任务或改变日程。
