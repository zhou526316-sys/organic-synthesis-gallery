# Response synchronization

北京时间：2026-10-07 09:35 +08:00
上下文：RSC v13 更新后控制器/队列状态核验。

## Confirmed state

- Canonical userscript live: Bridge 2.2.57 / install 6.2.38 / RSC media v13.
- 最新 RSC 回执已明确来自 installRevision=6.2.38、publisherMediaRevision=20261007-rsc-issue-pdf-v13。
- Worker Silverchair CDN private-PDF allowlist 已以 commit bc5701b2 移植到 main，并已完成 Deploy frontend assets。
- 两篇目标 DOI 仍在 bridge queue：
  - 10.1039/d6sc06421c：position 6
  - 10.1039/d6gc03161g：position 10
- 两篇均 reportedPriority=true、nextRetryAt=0。
- 当前 collector 仍在产生新回执，但最新回执来自旧队列中的其他 Nature/RSC 条目；目标 DOI 尚未生成新的 v13 attempt。
- /api/media/local-diagnostics 当前无控制器诊断记录，无法直接证明主 Gallery tab 的 in-memory queue revision。

## Required local action

刷新 Gallery 主页面，使 Tampermonkey 主控制器重新加载 2.2.57 / 6.2.38，并从当前 bridge queue 重新取任务；随后使用 Tampermonkey 菜单“立即运行媒体抓取队列”（等价于 forceStartFromHead）。

不需要再次安装脚本。
