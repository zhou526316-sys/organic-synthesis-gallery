# Response synchronization

Context: User screenshot showed private PDF owner already bound, but browser displayed “无法读取 PDF 捕获状态：Failed to fetch”.

## Final response

已经定位并修复。截图中的 owner 绑定其实已经成功，失败的是后面的“读取 PDF 捕获状态”预检查。

根因是 owner 页面从 gallery.gczhouwld.com 跨域请求 api.gczhouwld.com/api/_healthcheck；这个健康检查接口不是浏览器 CORS 路由，所以浏览器直接报 Failed to fetch。账号权限、PDF_PRIVATE、Tampermonkey 都没有坏。

修复已经合并并完成正式 Worker 部署：
- owner 页面不再依赖 /api/_healthcheck；
- 只要当前账号已经有 private_pdf_capture 权限，就直接启用“授权本浏览器抓取 PDF（7 天）”；
- 点击按钮后由 /api/user-ui/private-pdf/capture-lease 做真正的服务器权限和开关校验；
- 新增 Chromium 回归：即使 healthcheck 故意不可访问，owner 仍能正常拿 capture lease；
- Private PDF access v1、capture v2、Site quality gate 均通过；
- 线上健康状态仍为 bucket=true、readEnabled=true、captureEnabled=true、processingEnabled=false。

请直接打开：
https://gallery.gczhouwld.com/private-pdf-owner-setup.html?fix=20261004-owner-cors

不需要重新绑定 owner。刷新后应看到“授权本浏览器抓取 PDF（7 天）”按钮可点击，不再出现“无法读取 PDF 捕获状态：Failed to fetch”。

点击后正常状态应依次显示：
1. 正在签发 PDF 捕获授权…
2. 授权已发送给 Tampermonkey…
3. PDF 捕获授权成功，本浏览器有效至……

如果停在第2步，说明网页已经修好，但 Tampermonkey 没有收到 postMessage；那时再查脚本注入/版本即可，不再需要碰账号或服务器权限。

本次只修改 owner 授权页，未改 TOC、正文图、全文、文献范围、08:00/18:00、公众号或 PDF 处理规则。
