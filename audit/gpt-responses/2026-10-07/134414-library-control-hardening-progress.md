# User-library control hardening — progress

Beijing time: 2026-10-07 13:44
Context: continue architecture work; clarify China-first PDF Vault v1 implementation boundary.
Related baseline commit: b2a8b3fc63998af71a4d093bf9ce33d109bb4f7b
State: local changes under review; ordinary-user rollout remains zero.

## Progress reply 1

我继续收尾个人文献库迁移。这一批先核对生产状态、迁移条件和回退路径，再推进实际切换；按可恢复的步骤执行，控制单次调用和等待时间。

## Progress reply 2

你贴的这份是**完整的个人 PDF／知识库规划**。我刚才说的“个人文献库迁移”，只对应其中“用户控制层”的按行存储基础，不能等同于 P0–P5 已经实现。

我会以这份 China-first 规则核对实现范围。当前底层迁移检查已发现并发写入和暂停后恢复的缺口，需要先修好；PDF 功能则按你列出的 P0 → P1 顺序推进。

## Progress reply 3

核对后可以确定：你贴的 PDF Vault 方案目前还是“架构定稿”，P0–P5 尚未整体落地。我先完成正在检查的控制层修复：首次迁移的并发保护、迁移前后两类账户的校验，以及暂停同步后的自动恢复；这些通过后，再按 P0 → P1 实施 PDF 功能。

## Progress reply 4

这次复现了两个可能丢失或误读修改的竞态：空账户首次迁移时，旧写入可能被清掉；迁移完成后，迟到的旧同步可能覆盖兼容读取内容。我正在补事务内保护和回归测试，也会把账户同步测试接入正式前端的发布门槛。普通用户写入比例仍保持 0%。

## Progress reply 5

首轮回归已通过：84 项检查覆盖了首次迁移、旧同步交错、账户校验和发布门槛。客户端也已补上“停写后自动恢复”与“分批保存中断后续传”的用例。现在做最后的交叉检查，随后由正式构建验证浏览器行为。

## Progress reply 6

本地验证已汇总为 114 项全部通过，新增检查还覆盖了响应丢失和保存途中切换账号。上线验证会使用专用测试账户，确认旧文库迁移后未修改的文献仍完整保留；PDF Vault 文档也已补充实施状态，明确区分“方案定稿”和“功能完成”。
