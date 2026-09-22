# Scheduled task repair

Beijing time: 2026-09-22 10:24:15 +08:00
Context: Organic Synthesis Gallery scheduled-task repair
Automation id: 6aafcf84ef7481919d285caa33ebe93d

已核查并修复这条定时任务。

当前状态：
- 任务名称已从“Gallery 主更新（Work · High）”改为“Gallery 权威主更新”，避免标题本身继续暗示必须自证某个模型或思考档位。
- 你刚才提供的完整执行规则已经写入任务正文，核心修复是：只要必要来源、GitHub 写入权限和逐篇语义审核工具可用，就必须继续执行；不能因为无法自证“Work/High/具体模型”而提前终止，也不能把未完成审核误报为 0 篇。
- 任务仍为启用状态。
- 我保留了当前已有的北京时间 08:05 / 18:05 精确触发，没有擅自改回整点。这样也能与 GitHub 侧 08:07 / 18:07 的机器审计错开，减少同一时刻的并发和调度拥堵。
- 下一次计划触发是北京时间 2026-09-22 18:05。

另外，任务正文现在明确要求：读取 main 最新规则与状态、3 天主窗口 + 7 天安全尾扫、Crossref/OpenAlex/出版社实时源交叉核验、逐篇 include/exclude/pending、accepted=0 时二次证明、同轮完成 Git 写入/部署/线上核验/TOC 队列、并发保护、activeRun 防重复，以及最终回报必须先同步到 audit/gpt-responses/。

因此，之前最关键的“任务触发了但因为无法证明运行环境是 Work + High 而自行停止”的自阻断条件已经去掉。后续如果它再次没有完成，就应该留下明确的 incomplete_review / source_gap / blocked_by_concurrent_change 证据，而不是静默结束或错误报告 0 篇。
