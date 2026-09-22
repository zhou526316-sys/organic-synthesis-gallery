已经更新好，当前链路是“可发布待命”状态。

当前 GitHub 权威状态：
- phase = ready_to_publish
- nextPublicationSlot = 2026-09-23 08:00（北京时间）
- compact handoff 已正常生成并完整读取：
  - unresolved summary = 8
  - unresolved[] 实际长度 = 8
  - active journals = 16
- 自动 compact handoff 复测：success
- 8 条候选已全部完成双遍语义审核：
  - reviewed = 8
  - accepted = 3
  - rejected = 5
  - pending = 0
  - remainingUnresolved = []
  - secondPassCompleted = true
  - unresolvedDisagreements = 0
- staging review 状态 = ready_to_publish
- productionMutation = false，说明这次测试没有提前改生产网页。

三个正式自动任务目前都已启用：
1. 发布前主审核：07:05 / 17:05
2. 发布前补审：07:35 / 17:35
3. 正式发布：08:00 / 18:00

正式发布时间规则没有变化：只有 08:00 / 18:00 的正式发布任务可以修改生产文献数据并触发网页文献更新；其它时段只能准备 staging review。

当前这轮已经为 2026-09-23 08:00 准备好 3 篇 accepted、5 篇 rejected 的 staging 决策。到 08:00 时，正式发布任务会再次核对 handoff generation、候选覆盖、双遍审核、sourceChecks 和 quality gate 条件，满足后才写入生产数据；若条件不满足则 fail closed，保留上一版生产站。
