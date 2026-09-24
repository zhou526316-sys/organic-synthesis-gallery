# Organic Synthesis Gallery 2026-09-24 17:35 发布前补审

本轮补审完成，18:00 槽继续保持 `ready_with_pending`，没有出现需要重开机器审计或重写 staging 的晚到增量。恢复检查前后 `main` 均为 `44408a8694771444db1e0dd13cc6b563dd5ecf54`；相对于已通过门禁的 staging 提交 `1b7666fdd57ea6475b40723e4c85f1bf1f7fdc09`，后续只改了 audit/state 与上一轮 GPT 回报，没有改动 `audit/latest.json`、`audit/unresolved-latest.json`、目标 staging、scope contract、scope corrections 或生产文献权威数据。检查时 main 没有 in-progress 或 queued GitHub Actions，因此按“优先复用 fresh audit、正常同轮不重启”的规则没有再次写 audit trigger。

当前机器快照仍是 18:00 槽有效 fresh generation：`generatedAt=2026-09-24T09:10:17.928Z`（北京时间 17:10:17），latest blob `5b397f604f545792e7a9a99c7eed76612644ef83`、compact blob `8ba092dab22861b27d77e5bb1757de4a269d0579`，handoff commit `4069131ff4fb4d8e24e3dd0b0360e1654ef4fe71`。latest/compact 同代，双方 `summary.unresolved=41`，完整 compact 为 41 篇；16 本 active 期刊及 activeFrom、3 天主窗口、7 天机器尾扫、多 ISSN Crossref online/published/created、OpenAlex、晚入库救援和 verifiedThrough catch-up 均保留。`criticalSourceFailures=0`、`sourceFamilyGaps=0`、`historicalCoverageLosses=0`；`sourceCoverageAnomalies=2`（Nature、CCS Chemistry）和 `closureCoverageAnomalies=8` 按当前 `scope-2026-09-24-v1` 属于 closure/verifiedThrough 警告，不清空已经发现且完成双遍审核的 DOI 白名单，`verifiedThrough` 继续停在 2026-09-20。

完整 41 篇语义分区没有变化：9 篇 include、30 篇 exclude、2 篇 admission pending，`unfinishedHandoffDois=[]`。9 篇 18:00 发布白名单仍为：

```text
10.1021/jacs.6c16625
10.1021/acs.joc.6c01939
10.1021/acs.joc.6c01846
10.1021/acs.orglett.6c03443
10.1021/acs.orglett.6c02955
10.1002/anie.3415969
10.1002/anie.5648702
10.1002/anie.9855820
10.1021/acs.orglett.6c03851
```

其中 `10.1021/acs.orglett.6c03851` 是 08:00 槽关闭后才完成证据审核的 next-slot carryover，本轮已在 fresh 18:00 compact 与当前 scope contract 下重新绑定并进入正式白名单；不是越时回填。所有新 include 均已有准确 `titleZh`、文章特定 `scopeAssessment`、`reason/evidenceBasis` 以及真实 first-pass/challenge 结论。

两篇 admission pending 仍是 `10.1038/s41467-026-78015-9` 与 `10.31635/ccschem.026.202608262`。前者仍缺宏环/客体变化与可迁移的一维超分子聚合架构控制证据；后者仍缺醇底物、氧化产物、范围及分离/制备证据。两条都保留原日期、首次记录时间、来源 review、attemptedEvidencePages、evidenceNeeded 和 nextAction，未为转绿强行 exclude。历史范围重审中，`10.1021/acs.joc.6c01559` 与 `10.1002/anie.9519061` 已保留；`10.1021/acs.orglett.6c03499` 与 `10.1021/acs.orglett.6c03386` 继续作为既有卡片的 scope pending/retain，后者仍不得标为完成全合成。此前 4 个 confirmed scope removals 已实际下线并核验，本轮没有新增 confirmed exclusion 或 deletion-only 事务。

出版社 sourceChecks 与机器 sourceHealth 继续分开：当前 publisher rows 为 `checked=0 / blocked=6 / unavailable=10`，受阻/无法完整枚举的 candidateCount 保持 unknown/null，未写成 0。机器 Crossref/OpenAlex 两个来源家族保持健康；因此覆盖异常只阻止 closure/verifiedThrough 前推，不阻止上述 9 篇经过双遍审核的白名单。

GitHub prepublish gate run `35980675436` / job `107571529234` 已在当前 staging blob `341ce72e85285dfb50be5a253458e5744c83d112` 上完整成功：`validate-prepublish-review.mjs --allow-deferred --require-ready` 成功，`check-prepublish-readiness.mjs --allow-deferred --require-ready` 成功，`recordValidationPassed=true`、`semanticReady=true`、`snapshotFreshForSlot=true`、`publicationReady=true`、`releaseStatus=ready_with_pending`、`blockers=[]`；strict conversion bundle 亦为 `conversionValid=true / publicationReady=true`。本轮恢复检查确认这些绑定输入之后没有发生权威并发变化，所以没有无意义地重复跑门禁。

范围绑定保持为 `scope-2026-09-24-v1`，scope blob `f3102cd8a21d5b9dcd31a4f8d7d1a19e3c4e89e8`，corrections blob `040902a773f72057dff59de5c66d27f568984813`，并已存在于 `qualityControl.scopeContract`。本轮没有修改生产 public 文献、没有请求 Pages、没有修改 TOC/正文媒体需求、没有执行 OA 自动提图，也没有停用、改期或新增任何替代任务。

结论：18:00 正式发布任务可在槽位执行时再次做权威 SHA 防并发校验后，仅发布上述 9 个 `publishableDois`；两篇 admission pending 和两篇历史 scope pending 均继续保留。`reviewComplete=false` 是真实状态，不影响 per-DOI 已验证子集发布。
