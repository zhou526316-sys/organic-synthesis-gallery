# Architecture continuation — owner PDF entry and migration validation

Beijing time: 2026-10-07 14:03:35 +08:00

Context: architecture continuation, first-migration validation, and an independent owner PDF button.

Related control-layer commit: `6efc8144a58312635ceca335cb93670e1d7bfdf6`

## Progress reply 9

这批修复已提交为 `6efc814`，本地共 **116 项检查全部通过**。现在进入正式 Worker 和网页发布流程；网页发布前会实际运行 10 个 WebKit 账户同步场景。随后再用专用测试账户做线上首迁验收，并确认测试数据清理完成。

## Progress reply 10

Worker 的部署前回归、打包检查和代码部署已通过，正在做生产数据一致性验收。网页这边已通过文献发布范围检查，正在构建静态资源，之后才会运行浏览器回归。线上检查完成前，我会继续保留“待验收”状态。

## Progress reply 11

可以，把卡片上的 PDF 入口统一成一个按钮：你的账号接现有的自动抓取和私有 PDF，点击就打开已保存的副本。

“全储存在 Git”这一点需要纠正：**目前站长私有 PDF 的原文件存放在 R2，文档记录在 D1；Git 保存代码和配置。** 我会核对现有按钮，把你的读取入口接好。普通用户的本地优先方案仍按前面的 PDF Vault 设计推进。

## Progress reply 12

已核实：现在你的“原文”链接会被私有 PDF 逻辑接管，我正把它拆成独立的 **PDF** 按钮，让两个入口各自清楚。

还发现一个需要说明的边界：自动抓取保存的是待核验文件，当前阅读器只打开已核验并启用的副本。因此，“抓取成功”还不能直接等同于“点击即可阅读”；这次按钮会沿用现有的读取权限和核验规则。
