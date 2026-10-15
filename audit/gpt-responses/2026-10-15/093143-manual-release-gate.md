# Organic Synthesis Gallery｜2026-10-15 单次手动发布门禁授权

- 记录时间：2026-10-15 09:31:43 北京时间（Asia/Shanghai）
- 对话：用户在 Gallery 正式发布关联对话提出“我会手动运行一下今天的定时任务，你把发布门禁打开。”
- 仓库：zhou526316-sys/organic-synthesis-gallery
- 当前正式基线：main
- 审核范围：仅 2026-10-15 原08:00发布槽的手动重试；不更改每日08:00唯一发布时点
- 关联 PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/666
- 合并 commit：https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/acc8fc0f2d424cc5fc600528ed2ec043af917b60

## 用户可见完整回报

已提交一次性发布授权修复：[PR #666](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/666)。

授权范围限定为 **2026年10月15日原08:00发布槽，执行截止北京时间23:59**。10月16日起自动恢复08:00—09:00的常规窗口。

保留完整学术审核、预发布验证、原子提交、Pages 文献授权和防重复发布检查。**这不是永久关闭发布门禁。**

**PR #666 已通过全部7项CI，并合并到 main。**

合并提交：[acc8fc0](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/acc8fc0f2d424cc5fc600528ed2ec043af917b60)。

**门禁已在 main 生效。**

生产代码回读确认，10月15日的时间限制已放宽，10月16日仍为60分钟。

但目前仍缺少：

`audit/prepublish-review-2026-10-15-0800.json`

今天的机器审计已生成209条待核查 DOI，关键来源失败与来源家族缺口均为0。**放宽时间不代表这209条已获学术收录批准。**

手动操作顺序应为：先执行今天的07:05主审核（必要时再执行07:35补审），待当日 staging 审核文件完整并通过严格门禁后，再手动执行08:00正式发布任务。

合并后的实际 prepublish 检查：[Actions #38666069051](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38666069051)。其中固定槽交接、时窗、逐DOI发布、形式转换及纠错回归步骤均通过；“Validate complete handoff and documented decisions”和“Require fresh snapshot”失败，原因是今天的 staging 审核尚不存在、沿用旧审核无法通过。这个失败是预期的发布阻断，**不是时间例外代码回归失败，更不是今天已发布**。

生产目录仍为1087篇；未将候选 DOI、pending 或未审文献直接写入生产。没有创建18:00新增任务、没有修改其他独立定时任务、没有绕过 Pages `literature_authorization`。

## 审计细节

时间许可集中于 `scripts/lib/literature-slot-window.mjs`，对 `2026-10-15T08:00:00+08:00` 返回959分钟，其他日期仍为60分钟（原先2026-10-11由用户批准的历史例外仍按原记录240分钟）。同一天只允许固定08:00逻辑槽，第一次真正写入后已发布状态阻止重复执行。审计的 generatedAt 必须当日、不能伪造或倒填；`publicationReady`必须真实通过双重 `--allow-deferred --require-ready`和严格 conversion。

PR修改了4个文件：中央时间函数、fixed-slot测试、prepublish时窗测试和授权说明文档；未修改任何文献数据集、scope排除决定、TOC媒体或每日任务时刻。经 GitHub 7项PR检查均为success，并在合并后主线workflow对所有专项测试实际运行通过。主线 postmerge gate 最终因没有当前日完整预发布输入而failure，严格限制仍有效。

## 后续状态

- 本轮状态：`manual_window_open_review_missing`
- 本次发布：`not_published`（待用户手动运行完整审核与正式发布链路）
- GitHub回报同步：本文件即为完整脱敏中文记录
- 只在今天北京时间23:59前有效；次日没有单次许可继承
