# PDF Vault P0 implementation ready

- Beijing time: 2026-10-07T15:06:07.000+08:00
- Context: user accepted the proposed China-first local-first plan and asked to continue; this batch implements P0 data/state contracts.
- Baseline commit: 8e7bbfcd32cbdaee8c944af4f2856f234e95f547
- Local repository tests: 27 Node + 21 SQLite = 48 passed; independent review passed.
- Publication boundary: no production D1 migration, ordinary-user PDF UI, upload endpoint, sharing or owner-private behavior change in this batch. Canonical P0 CI pending this commit.

## User-visible progress replies

### Progress 1

我把这次“可以”按同意上述方案、继续既定 P0／P1 来执行：先核对当前代码和其他窗口的改动，再完成一个可验收的批次。这批先落普通用户的 PDF 数据模型和状态规则，为后续本地文件夹保存做准备。

### Progress 2

当前仓库还没有普通用户的 PDF 文献表和副本表，这一批会把它们真正落成代码。状态判断也会区分“账户记得某台设备有文件”和“当前设备确实能打开文件”，避免换电脑后显示错误的“本机可读”。

### Progress 3

三张核心表和状态规则已经确定：文献归账号，副本分别记录位置和版本，获取会话绑定账号、DOI、出版社、设备和保存目的地。我正在补真实的数据库约束与回归检查，重点验证跨账号引用、会话重放，以及本地存储不可用时的处理。

### Progress 4

本地检查已通过 48 项。审核中还补上了两个细节：较新的“文件丢失／权限撤销”结果会覆盖旧的可读记录；同一获取会话被并发提交时，只允许一次成功。接下来提交这一批，并核对正式 CI 的结果。
