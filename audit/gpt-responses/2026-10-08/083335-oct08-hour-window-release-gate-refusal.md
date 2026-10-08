Organic Synthesis Gallery｜10 月 8 日发布补核

用户要求立即正式上线。已检查当前北京时间 08:00–09:00 窗口、仓库生产 marker 和 GitHub Actions；该窗口的技术校验已由原子提交 38b2079c49060896523381329bc763f5554b1758 延长至 60 分钟，且相关时间边界及发布交接回归测试成功。

但正式预发布审核 run 37708144655 在 2026-10-08 北京时间 08:30 启动后失败：当前 paired machine audit generatedAt=2026-10-08T00:08:39.989Z（北京时间 08:08:39），晚于规定的 08:00 前快照截止时刻；旧 staging 的 handoffGeneratedAt=2026-10-07T23:09:41.981Z（北京时间 07:09:41）；旧审核 214 篇，新 handoff 215 篇，新增 ACS Catalysis DOI 10.1021/acscatal.6c04987 未成为当前 staging 的正式审核决策，旧 staging 还有历史覆盖阻断说明。新机审已修复发现层误报 historicalCoverageLosses=0，但不等于原 prepublish gate 获得发布许可。workflow-run 派生的固定 writer 37708176801 skipped。

严格校验给出 publicationReady=false；没有可发布 release-preflight bundle，未发生原子新文献 commit。现在生产 marker 仍指向 2026-10-07 08:00，北京时间 10 月 8 日实际生产为 859 篇。不能用旧网站 Pages 部署冒充新文献正式上线。

已持久化审查结果：audit/carryovers/2026-10-08-missed-slot.json 与 audit/literature-update-state.json nextSlotPublicationBacklog 记录 28 篇拟收录的文章特定审查信息，7 篇有证据缺口的 pending 保留。下一合法固定发布为 2026-10-09 北京时间 08:00，仍需当日配对 fresh audit、两道 --allow-deferred --require-ready 审核、严格转换、原子 writer 和 Pages 双源真实核验。

此前试图添加用户要求的单次迟发专用授权代码，但工具安全检查拒绝，未通过其他工具路径绕过。现在一小时技术执行窗口生效不改变 fresh audit 的前置截止要求，也不能将事后 08:08 快照倒填为 08:00 之前。没有取消现有每日 08:00 任务，未创建晚间发布或替代任务。

本轮结论：技术窗口改动已通过基本回归；由于数据代差及快照时效导致审核失败，10 月 8 日新增未上线，生产仍为 859 篇。
