## 08:00 发布前补审：语义审核已完整，机器发现门禁仍阻断发布

本轮没有把已有的 123 篇重新制造一套审核记录。`audit/prepublish-review-2026-09-24-0800.json` 已经按当前 `scope-2026-09-23-v1` 完成完整 compact 的两遍语义审核：123 篇中 **15 篇 include、106 篇 exclude、2 篇 pending**，所有 15 篇 include 均已保存准确 `titleZh` 和文章特定 `scopeAssessment`；受范围契约影响的历史边界集合也已经核查，其中 `10.1021/acs.joc.6c01559`、`10.1002/anie.9519061` 已确认保留，`10.1021/acs.orglett.6c03499`、`10.1021/acs.orglett.6c03386` 继续作为既有卡片的 scope pending，不作删除。两篇未上线的 admission pending 仍为 `10.1038/s41467-026-78015-9` 与 `10.31635/ccschem.026.202608262`。fileciteturn36file0L2-L4

本槽原 fresh audit 虽位于 08:00 前有效窗口，但 `sourceCoverageAnomalies=2`，因此属于**机器审计完成、发现门禁失败**，而不是可以继续放行的正常 fresh audit。07:35 补审开始时没有正在运行或排队的同轮 literature audit，我据此只触发了 **一次**恢复审计，没有取消或反复重启正常 run。恢复 run `35934774504` 的 capability guard、DOI-union audit、artifact 与 snapshot persistence 全部成功；新一代 `latest/compact` 的共同 `generatedAt` 为 `2026-09-23T23:41:25.964Z`（北京时间 07:41:25），`summary.unresolved=123`，与完整 compact 候选数一致。它仍覆盖 16 本 active 期刊、activeFrom、三日主窗口、7 日机器安全尾扫、多 ISSN Crossref online/published/created、OpenAlex、晚入库救援和 `verifiedThrough` catch-up。fileciteturn33file0L2-L4 fileciteturn35file0L2-L4

恢复审计**没有清掉全局异常**：仍为 `criticalSourceFailures=0`、`sourceFamilyGaps=0`、`historicalCoverageLosses=0`，但 `sourceCoverageAnomalies=2`，涉及 **Nature 与 CCS Chemistry**；同时 `closureCoverageAnomalies=8`，涉及 Nature、Nature Chemistry、Nature Communications、JACS、Angew、Organic Letters、CCS Chemistry 和 JOC。`verifiedThrough` 因此继续停在 **2026-09-20**。Publisher sourceChecks 与 machine sourceHealth 仍分开保存：出版社整刊核验为 `checked=0 / blocked=6 / unavailable=10`，无法读取的候选数保持 `null/unknown`，没有写成 0。fileciteturn47file0L2-L4

恢复 generation 与已审核 generation 做差后，候选集合、metadata 和语义证据都**没有实质变化**；Git compare 显示 `audit/latest.json` 与 `audit/unresolved-latest.json` 都只有生成时间一行变化。因此本轮复用了已经按相同范围契约完成的 123 篇真实首审/challenge 结果，没有重复创造“两遍审核”。15 篇当前仍只是**拟发布 include**，并非授权白名单：

```text
10.1021/acscatal.6c04954
10.1021/acscatal.6c05820
10.31635/ccschem.026.202608315
10.1021/jacs.6c16323
10.1021/jacs.6c14601
10.1021/acs.joc.6c01347
10.1021/acs.joc.6c01498
10.1038/s41586-026-11169-0
10.1038/s41557-026-02247-x
10.1021/acs.orglett.6c03346
10.1021/acs.orglett.6c03455
10.1021/acs.orglett.6c03520
10.1021/acs.orglett.6c03276
10.1021/acs.orglett.6c03373
10.1021/acs.orglett.6c03854
```

由于恢复 audit 仍然失败于同一 discovery gate，我没有把 staging 强行重绑定到一个“看起来更新但仍不健康”的 generation，也没有把 `publishableDois` 从空数组改成上述 15 篇。当前状态应继续解释为 `phase=preparing / status=incomplete_review / publishableSubsetReady=false / reviewComplete=false`；不是 `ready_with_pending`，也不是“零新增”。恢复 checkpoint 已写入 `audit/prepublish-recovery-2026-09-24-0735.json`，提交 `b0e1bcc977d47e573608fe807fdb4a5b1fb0d6ed`。fileciteturn47file0L2-L4

GitHub 实际门禁也保留了真实失败。此前 gate run `35933876677` 的基础 `validate-prepublish-review.mjs --allow-deferred` 已因非零 `sourceCoverageAnomalies` 失败；`check-prepublish-readiness.mjs --allow-deferred --require-ready` 实际执行并 fail closed。需要特别纠正的是：当前 workflow 是 fail-fast 排序，因此 `validate-prepublish-review.mjs --allow-deferred --require-ready` 在前一步失败后**被跳过，而不是实际执行失败**。我没有修改或弱化 workflow、删除 global blocker 来伪造“两条严格命令都通过/都运行”。所以本轮仍不能声称已经满足“两个 strict 命令均实际完成”的验收条件；这本身也是发布前应保留的真实门禁事实。fileciteturn38file0L2-L4

此前 4 个 confirmed scope removals（`10.1021/jacs.6c13517`、`10.1021/jacs.6c10701`、`10.1038/s41467-026-77963-6`、`10.1002/anie.7784614`）仍沿用已核验的 deletion-only 下线记录；本轮没有新增 confirmed exclusion，也没有新增实际下线。没有修改生产 `public` 文献、没有触发 Pages、没有执行 OA/TOC/正文图提取，Tampermonkey/VPN Bridge 媒体链保持不变；07:35/17:35 与 08:00/18:00 既有时刻也没有被停用、改期或替代。

**结论：2026-09-24 08:00 槽目前必须 fail closed。** 语义审核本身已完整，15 篇拟纳入和 2 篇 admission pending 都有明确归属；阻断原因是机器发现完整性仍存在 `sourceCoverageAnomalies=2`，且 recovery retry 已经复现该异常。正式 08:00 发布任务不应把这 15 篇写入生产，除非在槽前出现一个新的、同 generation 配对且清除全局 discovery blocker 的有效快照并完成相应严格门禁。
