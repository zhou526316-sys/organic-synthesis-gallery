# Response synchronization

北京时间：2026-10-05 09:36 +08:00
上下文：核对 Tampermonkey 私有 PDF 抓取是否已开始。

## Final response

目前状态是：**PDF 抓取能力已经开启，但实际 PDF 抓取还没有开始。**

我刚查了实时状态：

- Worker 端：`privatePdf.bucket=true`、`readEnabled=true`、`captureEnabled=true`，说明私有 PDF 存储和抓取接口都已经上线。
- `processingEnabled=false`：现在只负责原始 PDF 抓取/保存，还没有开启后续 PDF 自动处理；这是预期状态。
- 最近 200 条真实 Tampermonkey 回执中，**没有一条出现** `private_pdf_discovery`、`private_pdf_fetch`、`private_pdf_upload` 或 `stored=1`。
- 更关键的是，最新 CCS 任务已经确认在跑 v9，且该论文 `addedDate >= 2026-10-01`，本来具备 PDF 抓取资格，但仍完全没有进入 PDF 阶段。

原因已经定位：当前逻辑只有本浏览器取得 **owner-only PDF capture lease** 后才会开始找 PDF；没有 lease 时会直接跳过，而且不影响 TOC、正文图、全文文本继续抓。

你现在需要在当前跑 Tampermonkey 的同一个浏览器里打开：

https://gallery.gczhouwld.com/private-pdf-owner-setup.html

如果页面显示你已经是 private PDF owner，就点击 **“授权本浏览器抓取 PDF（7 天）”**。授权成功后，不需要再改脚本，再点一次 **“立即开始任务（只补缺项）”** 即可。

之后正确日志应该依次出现：

`private_pdf_discovery` → `private_pdf_fetch` → `private_pdf_upload`

成功保存时会出现 `stored=1` 和 `documentId`。

所以现在准确地说是：**PDF 抓取功能已部署并开启，但还差你当前浏览器这一次 7 天抓取授权，因此尚未真正开始下载 PDF。**
