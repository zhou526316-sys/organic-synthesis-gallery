# Architecture PDF/session production repair response

- Beijing time: 2026-10-07 21:31 +08:00
- User context: continuation of the architecture task; the previously reported PDF unreadable / returning-to-Gallery appears logged-out problem was still observable.
- Functional commit: `44baa3e6a59ae6bfd0fecc31fb322e30dde03a5a`
- Private PDF regression: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37627365255 — success
- PDF Vault regression: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37627365611 — success
- Worker deployment: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37627376785 — success
- Worker/frontend sync verification: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37627365552 — success
- GitHub Pages deployment: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37627365290 — success
- Live smoke: gallery PDF shell responds; API health reports private PDF bucket/read/capture/processing enabled.
- Existing production inventory evidence remains 154 ready / 154 active / 0 raw / 0 failed; the repair does not alter capture inventory or Tampermonkey acquisition.

## Final user-visible response

已经重新按真实生产路径处理完了，这次不是只看“测试通过”。

根因确实有两层：一是 PDF.js 阅读器和生产 PDF 验证器的容错配置不一致，而且首屏渲染结束后 `renderTask` 没有释放，真实出版社 PDF 更容易读失败，翻页/缩放也会被卡住；二是返回 Gallery 时登录 token 往往还在，但用户界面先按“未登录”渲染，再去确认服务端会话，所以视觉上会像自动退出。

现在已经修复并正式上线，功能提交是 `44baa3e6a59ae6bfd0fecc31fb322e30dde03a5a`。这次同时通过了 Private PDF 浏览器回归、PDF Vault 回归、Worker 正式部署和 GitHub Pages 正式部署；Pages 发布前的 owner PDF/账号隔离门禁也实际通过。后端已有的 154 份 PDF 仍是 154 ready / 154 active，并没有重新抓取或改动 Tampermonkey 链路。

你现在刷新 `gallery.gczhouwld.com` 后重新打开一篇已抓取的 PDF 即可。若旧 PDF 标签页是在本次部署前打开的，关闭旧标签再从卡片重新点一次，避免继续运行旧的前端代码。
