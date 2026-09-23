# Approved navigation + reader continuation

Beijing time: 2026-09-23 17:24 +08:00
Context: user explicitly approved continuing PR150 navigation and PR163 reader counting after feedback approval gate.
Reader merge: 19ca396cd5b72d8a843d200a17ca0d8fd0e45659.
Reader Worker release: run35842249869 success.
Postdeploy read-only acceptance: run35842399078 success; markRequests=0.
Navigation PR150 remains unmerged because the approved source update continues to be blocked by the platform safety check; no alternate bypass used.

## Final user-visible reply

这两个已按你批准的范围继续推进。

**阅读人数防漏计已经完成并上线。** PR #163 已合并为 `19ca396`，Worker 发布成功。修复后，“记录 DOI×IP 首次打开”“重算该 DOI 的权威计数”“返回计数”放在同一个 D1 事务里；任一步失败都会整体回滚，重复请求还能从真实打开记录修复缺失/错误的物化计数，但不会凭空增加读者。原来的规则不变：**同一 DOI，一个 IP 只算 1 人次**。

合并前 SQLite 故障恢复 **11/11**、本地 D1 **6/6**，总质量门禁全部通过。上线后我只做了 GET 只读验收，没有发送任何测试阅读 `/mark`：两个 API 入口一致，当前为 **130 次 DOI×IP 去重打开、18 个去重 IP、106 篇有读者，物化计数同样为 130**，计数账本一致。

这里还确认了一个很重要的结论：你之前看到“大多数卡片只有 1”**不全是程序漏计**。现在 130 次去重打开分布在 106 篇论文上，按这个总量计算，**至少有 82 篇论文目前必然只能显示 1**。所以这次修复解决的是“数据库中途失败会永久少算”的真实漏洞，不会把历史人数凭空补高，也没有做批量造数。阅读人数这条吐槽我暂时没有关闭，因为如果你想改变“一个 IP/一篇论文只算一次”之外的统计口径，还需要你决定。

**顶部／底部导航已获你批准，但仍未上线。** PR #150 现在仍保持未合并。旧版本已经明确有两个问题：320px 手机宽度会和左侧吐槽按钮重叠；Chromium 在长列表布局稳定后可能出现“已经到底但按钮状态又变回可点”。准备的修正方案是把导航移到右侧，并只在用户主动点击跳转后的约 1.5 秒内跟随长列表高度变化校准目标；任何用户滚动、触摸、按键或窗口变化都会立即停止校准。

但该源文件写入持续被平台的安全校验拦截。我没有绕过这个拦截，也没有把已知有问题的旧 PR 强行合并。**你的批准已经记录，不需要重新批准这两项。**

[阅读人数修复与上线证据包](sandbox:/mnt/data/reader-count-release-evidence.zip)
