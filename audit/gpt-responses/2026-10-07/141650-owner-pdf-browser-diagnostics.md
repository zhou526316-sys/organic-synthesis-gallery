# Owner PDF browser validation checkpoint

Beijing time: 2026-10-07 14:16:50 +08:00

Related implementation: `8e032f570e5bb5d49452fd337287a6e92b3c7b4c`

Context: preserve strict browser checks and collect missing diagnostics before correcting the observed page errors.

## Progress reply 16

这一小批已提交为 `8e032f5`，断线也不会丢失。正式网页发布流程将检查 16 个架构场景、10 个账户同步场景和 13 个 PDF 按钮场景；通过后再发布到主站。我继续核对这一轮结果。

## Progress reply 17

现有 PDF 权限测试和网站打包已经通过，新按钮正在进入真实浏览器检查。正式发布也已确认使用本次提交；完成后我会明确告诉你主站是否已更新，以及哪些 PDF 仍处于待核验状态。

## Progress reply 18

浏览器检查捕捉到了 5 条页面错误，发布门槛已将这一版拦住。旧测试流程没有上传错误明细，我正在补齐诊断输出，先拿到具体原因再修复；目前还不能把按钮报成已上线。
