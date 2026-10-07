# User-library control hardening — final local review

Beijing time: 2026-10-07 13:51
Context: continue architecture; China-first PDF Vault implementation scope.
Baseline commit: b2a8b3fc63998af71a4d093bf9ce33d109bb4f7b
Production writes for ordinary users remain disabled.

## Progress reply 7

线上首迁验收会预置一份两篇文献的测试文库：修改其中一篇，同时确认另一篇原样保留，并核对迁移前后的账户数量。这样可以实际覆盖这次新增的首迁检查。代码和回归结果已保存，接下来等待这项验收脚本完成后一起发布。

## Progress reply 8

两篇文献的首迁验收脚本已通过本地 SQL 验证。交叉审查还发现一个读取边界：迁移瞬间，旧接口可能把“旧文档已移除”误报为空文库。我正在让这个分支明确返回暂时不可读，避免客户端把它当成空库同步下来。
