# Private PDF reader/session fix checkpoint

这一个小批次已完成，范围只处理你刚才的两个问题，没有继续扩任务。

已经修好的内容：
1. 私有 PDF 阅读不再依赖浏览器自带 PDF 插件。现在 `/pdf/` 使用 Gallery 自己固定版本的 PDF.js，在 Canvas 中实际绘制 PDF 页面；测试已经验证第一页真实绘制成功。
2. 返回 Gallery 后不会因为一次或两次瞬时 `authenticated:false` 就把本地登录 token 删除。只有明确的用户退出登录才主动清除持久会话。
3. 私有 PDF owner 回归已通过；普通用户 P1 本地 PDF/OPFS/PDF.js 回归也独立通过，因此两套功能没有互相破坏。
4. 测试门禁已经重新拆分：owner 私有 PDF/登录由 Private PDF access 回归负责，本地 PDF 由 P1 回归负责，不再让两套大测试挤在同一个 Chromium 进程里。

关键实现提交：
- `9dc3ea4`：修复登录状态保护并改掉跨域直接嵌 PDF 的路径。
- `125e77d`：把 owner 私有 PDF 页改成 Gallery PDF.js Canvas 阅读器。
- `77db64d`：把 owner 与普通用户本地 PDF 门禁分开，覆盖没有删除。

已通过的正式回归：
- Private PDF access v1 regression：成功。
- PDF Vault P1 local storage and reader：成功。

目前唯一还没报“完成上线”的原因是最新 GitHub Pages 发布仍在仓库原有的 TOC/正文媒体合并步骤运行，尚未进入最终发布完成状态；这不是 PDF 代码错误。为了按你的要求控制任务长度，我这批就停在这里，不继续叠加其他改动。

下一小批只需要做一件事：等这一版主站发布完成后，核对线上 `/pdf/` 实际交付的是 PDF.js Canvas 版本，然后你再刷新页面实测 PDF 和返回登录状态。

Runs:
- Private PDF access: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37621751652
- P1 local PDF: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37621751026
- Pages publish: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37621751062
