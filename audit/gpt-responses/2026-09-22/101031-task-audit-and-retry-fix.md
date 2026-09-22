# 2026-09-22 10:10:31 +08:00 — 定时主更新任务核查与脚本修复

核查结论：当前启用的“Gallery 主更新（Work · High）”在规则层面已经基本合格，但不能称为“完全可证明合格”。计划本身为 Asia/Shanghai 每日 08:00/18:00、exact_schedule，当前已启用；最近一次运行时间对应 2026-09-22 08:02 左右。

我已经补了三个硬门槛。第一，开始语义审核前必须核对 `phase`、`lastCompletedFetch.dataCommitSha`、`lastCompletedReview.dataCommitSha`、`lastWebsiteSync.dataCommitSha` 与当前权威数据是否一致；当前仓库实际就存在 `phase=synced`，但最新 fetch/review 的 data commit 已经是 `f2f74fcf...`，而 `lastWebsiteSync.dataCommitSha` 仍是 `9d33e945...` 的不一致，因此下一轮不能直接宣称“已全部上线”，必须先完成同步或报告 `state_inconsistent/sync_failed`。第二，除了 `criticalSourceFailures/sourceFamilyGaps`，现在明确把 `sourceCoverageAnomalies/closureCoverageAnomalies` 列为 closure 门槛；最新 audit 的 closureCoverageAnomalies=6、verifiedThroughEligible=false，所以即使 unresolved=0，也不能推进 verifiedThrough。第三，GPT 回复同步 Git 已升级为终局步骤：完整用户可见回复先写入 `audit/gpt-responses/YYYY-MM-DD/<HHMMSS>-<context>.md` 并提交，再发送同一回复；若 Git 暂时不可写，必须明确报告 `response_sync_pending` 或 `response_sync_failed`。

项目全局规则已写入 `PROJECT_RULES.md`，相关规则提交为 `6595cdf81f4368f384d9a1b685197c4c325cf789`。当前启用的主任务 prompt 也已加入上述三个硬门槛，定时频率没有改动。

仍有一个平台级限制：Scheduled Task 的任务对象本身没有可审计的“模型/思考强度”字段，所以我无法从调度元数据独立证明未来每次都真的运行在 Work + High。现在能做的最严谨处理就是你提示词里的自检门槛：只要执行环境无法明确确认或保持 High，就必须停止最终决策并报告 `incomplete_review`。因此如果你的“合格”定义要求“系统层可证明 High”，那它仍然不能算完全合格；如果接受“无法确认即硬停止”的守门策略，则任务逻辑合格。

另外，`RUN-LOCAL-VPN-RETRY.ps1` 的仓库版已经是平衡花括号的修正版。你本机仍是旧文件，所以才出现第 30 行 `Missing closing '}'`。直接覆盖本机文件即可：

```powershell
cd C:\Users\asus\organic-synthesis-gallery-main\toc-collector

Invoke-WebRequest \
  -Uri "https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/main/toc-collector/scripts/RUN-LOCAL-VPN-RETRY.ps1" \
  -OutFile ".\scripts\RUN-LOCAL-VPN-RETRY.ps1" \
  -UseBasicParsing

powershell.exe -NoProfile -Command "[void][scriptblock]::Create((Get-Content '.\scripts\RUN-LOCAL-VPN-RETRY.ps1' -Raw -Encoding UTF8)); Write-Host 'PowerShell syntax OK' -ForegroundColor Green"
```

如果最后看到 `PowerShell syntax OK`，再运行 retry 脚本即可。

今天 08:00 的实际执行也说明“只看 prompt 是否漂亮”不够：仓库里的 `audit/review-2026-09-22-am.json` 明确写着是“08:00 automation failed to persist a completed review”后的人工补做，所以这条任务需要以上一致性门槛和回复同步门槛来约束实际执行，而不是只靠自然语言要求。

本回复已按新的项目规则同步到 Git。
