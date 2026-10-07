# Owner PDF entry — interrupted-connection continuation

Beijing time: 2026-10-07 14:12:10 +08:00

Context: resume the architecture batch, validate control-layer migration, add an independent owner PDF button.

Related control-layer commit: `6efc8144a58312635ceca335cb93670e1d7bfdf6`

## Progress reply 13

已接上，进度还在。上一批控制层修复已经提交并通过 Worker 生产验收；独立 PDF 按钮的代码也已完成，我正补浏览器检查并保存这一小批改动，接着从这里继续。

## Progress reply 14

线上首迁测试已经通过，测试账户也已清理。网页发布检查拦住了两个账户同步用例：恢复逻辑的断言已通过，但测试漏模拟了登录和访问统计接口。我正在补齐这两个接口，并保留原来的严格检查；PDF 按钮会一起通过正式浏览器验收后上线。

## Progress reply 15

PDF 按钮和权限切换逻辑已经完成，浏览器检查也已补好，正在做提交前复核。你的账号会看到独立 PDF 入口；退出或切换账号时会撤销显示，翻页后新卡片也会继承正确的权限。存储仍沿用现有的 R2 文件库和 D1 记录。
