# Fixed-release repair progress

北京时间：2026-10-01 晚间；上下文：固定发布未上线的根因修复。实际 Git commit 时间以 GitHub 为准。本记录不宣称尚未运行的 CI 或新文献发布成功。

已确认生产仍停在早上 08:00 的 726 篇，发布请求文件也没有更新到 18:00。这次尚未走到 Pages 部署；另外，本次交互会话已成功写入审计记录，不能把它归因于仓库普遍失去写权限。

发布前审核确实通过了，但现有流程仍要靠聊天任务在整点额外写一次触发文件，才能启动正式发布。我会补上审核成功到发布器的自动交接：保留原发布器和 08:00/18:00 时刻，到点重验；过期或证据变化就拒绝新增。

修复会区分“审核通过”“到点写入”“网站已验证上线”三个状态，避免再次把门禁成功当成上线成功。重复触发、过期快照和等待期间输入变更都会纳入回归测试；Pages 仍从受信任的 main 上下文部署。

证据：原 main=6c089c74c90545b2821868f1ec017a377e76eed2；原 marker=13bb6adbe5d0b08c8c2442d40ea5edd1ccd7b5fb；18:00 gate run=36842621094，validate job=110305045404，strict evidence artifact=11152135472。读取 ZIP 实际确认 15 include / 40 exclude / 5 pending，以及两套 require-ready 和 strict conversion 的成功字段。此修复事务不修改生产文献、marker、review、pending、TOC demand 或范围规则。
