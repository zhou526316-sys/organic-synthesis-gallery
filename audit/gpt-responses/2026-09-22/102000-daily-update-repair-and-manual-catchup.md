已继续完成，这次“每日自动更新没有工作”的原因和手动补更都已经处理完。

今天实际上有两条自动链路同时出了问题。第一，ChatGPT 的 Gallery 主更新任务在北京时间 08:02 左右确实被触发了，但约 20 秒后结束，没有生成 review、数据提交或部署。任务原提示词要求运行时必须能够“自证 Work + High/指定模型”，否则立即停止；这个条件过于脆弱，很可能导致任务触发后直接退出。现在我已经移除这个不合理的硬停止条件：以后只在必要来源、工具或 GitHub 写入确实不可用时才报告 incomplete_review，不能因为无法自证模型标签而停止，也不能把未完成误报为 0 篇。

第二，GitHub Actions 原本北京时间 08:00/18:00 的 schedule 今天 08:00 根本没有生成 scheduled run。GitHub 的公开接口没有给出这次未入队的确定根因，所以不能断言一定是平台拥堵；但为降低整点调度拥堵风险，我已经把 GitHub 审计改为北京时间 08:07/18:07，提交为 `6e33e2fd0442dd94f7fdf681e3e9c9e4212b5952`。ChatGPT 主更新任务则改为 08:05/18:05，两条链路错开。

手动更新已经完整执行。3 天主窗口为 2026-09-20 至 2026-09-22；最新机器审计共发现 501 条源记录。本轮累计逐篇审核 62 条未决候选，最终收录 11 篇、排除 51 篇、pending 0，最终 `missingFromGallery=0`、`unresolved=0`。这 11 篇主要是 9 月 21 日晚到索引，而不是 9 月 22 日当天刚发布；9 月 22 日当前新出现的候选均不属于有机合成方法学。

本轮新增 11 篇为：
- `10.1021/acscatal.6c05381`
- `10.1002/anie.3685338`
- `10.1021/jacs.6c16373`
- `10.1021/jacs.6c10810`
- `10.1038/s41467-026-77981-4`
- `10.1021/acs.orglett.6c03740`
- `10.1021/acs.orglett.6c03340`
- `10.1021/acs.orglett.6c03243`
- `10.1021/acs.orglett.6c02993`
- `10.1021/acs.orglett.6c03335`
- `10.1021/acs.orglett.6c03418`

生产 GitHub Pages 已直接核验：11 个 DOI 全部可以在线找到，网页总卡片数已从 488 增至 **499**。文献数据提交为 `9c90449c05c7af030c9cfe5fbdb1b7daa9e52cfa`；最终 review 在 `audit/review-2026-09-22-am.json`，最新 review 修正提交为 `474ef2f392b84c087d6bd7f641cc6cf0de92d88f`；自动链路修复状态已写入 `audit/literature-update-state.json`，提交为 `8fce169a14d1ba3e5229dc31f7a9740da8a4089c`。

目前 `verifiedThrough` 仍保持在 2026-09-20，没有强行推进到 9 月 21 日。这不是还有漏审：9 月 21 日候选已经全部处理完，closure 的 `missingFromGallery=0`。原因是 OpenAlex 对 9 月 21 日仍明显滞后，Nature、Nature Communications、JACS、Angew、ACS Catalysis、Organic Letters 共 6 个期刊触发 closure coverage anomaly。系统现在会等第二来源追上后再允许闭合，这是防止“Crossref 已有而另一来源未同步时误宣布完整”的保护机制。

TOC 队列也已经重建：当前 `visibleGapTotal=11`、`missingOfficialTotal=76`、`officialUpgradeTotal=65`。这 11 篇新卡片即使暂时没有 TOC 也已经正常上线，图片补全继续交给 Tampermonkey/VPN Bridge，不会再阻塞文献发布。

因此现在的状态是：**手动补更已完成、线上 499 篇、未决 0；ChatGPT 主更新改为 08:05/18:05，GitHub 审计改为 08:07/18:07。** 下一次自动更新会按这套修正后的链路运行。
