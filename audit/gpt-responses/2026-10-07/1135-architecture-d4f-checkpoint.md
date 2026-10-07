Beijing time: 2026-10-07 11:35
Context: architecture continuation — analytics D4f repair checkpoint
Base: 3c60fedc0e21f65f0dc345fec6b07d1b1032cad1

## User-visible progress replies

我先接续上一轮架构进度，核对当前仓库和未完成项，重点看网页打开、TOC 加载与三个月冷热分流。这轮会按可恢复的批次推进，避免把操作串成容易超时的长任务。

我会用 personal-context 技能恢复上一轮交接，再与 `main` 上的实际代码核对。Tampermonkey 的抓取支线仍按既定分工推进，我这里接续架构和加载性能。

已接上实际进度：三个月冷热分流、首屏限量加载，以及统计快照都已有实现和上线记录。不过最新一次提交又改回了部分统计就绪条件，与刚通过验收的规则有冲突。我先核实它是否会让统计再次不可用，再继续后续架构，避免带着这个问题往下叠加。

问题已确认：一项测试允许“维护计数慢一拍”，另一项却把同样的情况判为故障，而且部署流程没有先运行这组测试。我会统一判定规则，用真实事件账本检查快照完整性，并补上部署前回归检查。检查放在后台快照生成阶段，保持用户打开网页时的读取量固定。

修复后的 39 项针对性检查已通过，还补住了一个相关缺口：关闭快照主读取时，旧回退路径仍会扫描整张访客表。现在正常读取和回退都只读单份快照；真实数据不一致或过期时会明确报错。接下来提交并验收正式部署，同时保留检查点，避免中断后重做。

## Recoverable checkpoint

The local implementation and its 39 tests are complete. Canonical deployment and its exact-generation D4c/D4d proof are the remaining terminal gate. No claim of a new production deployment is made by this checkpoint. The environment's direct API probes returned a non-API Site Unavailable page, so production evidence must come from canonical Actions proof rather than that response.
