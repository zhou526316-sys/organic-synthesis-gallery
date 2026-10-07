# Resume private PDF range fix

- Beijing time: 2026-10-07 22:57:51 +08:00
- Context: user reported the connection interrupted while continuing investigation of private PDF reads that were extremely slow and ended in "读取失败".
- Core range-streaming implementation: `5a784b40c6091d5dae1e7f872db2883131bdf9b9`
- Range fixture correction: `f96e3c61e76c00ca84bfe933ba60f23445e40eae`
- Safe staged diagnostics: `9e9abfd55e1b22bfbc763714296580ef7c84400e`
- Private PDF regression for range version: run 37637189601 — success, 15/15 browser cases.
- PDF Vault regression for range version: run 37637189716 — success.
- Worker frontend sync for range version: run 37637189592 — success.
- GitHub Pages range version: run 37637189627 — success.
- Pages delivery audit: `94909ea177ab348f152510cf4aed8d415050210c` records sourceCommit `f96e3c61...` and `success-live-verified`.
- Safe diagnostic regression: run 37640807194 — success.
- Diagnostic Worker/Pages deployment was still in progress at the time of this checkpoint; the core range fix does not depend on it.

## Final user-visible response

接上了。刚才中断时，真正解决“非常慢，最后读取失败”的核心修复已经完成正式上线，不需要重新开始。

我确认的根因是：旧阅读器会先把整份 PDF 下载成 `arrayBuffer()`，整份下载完才交给 PDF.js，因此文件稍大或网络稍慢时就会长时间空等，最后失败。现在已经改成 **HTTP Range 分段读取**：PDF.js 可以先读取目录和第一页需要的字节，不再等待整份 PDF 下载完成。

这次不是只看构建成功。新的浏览器门禁明确要求发生 Range 请求，修正测试文件尺寸后已经 **15/15 通过**；对应正式 Pages 发布也是 `success-live-verified`，线上来源提交是 `f96e3c61`。

另外我又加了一个安全的分阶段诊断层：如果仍失败，会区分“权限确认 / 分段读取 / PDF 目录解析 / 页面绘制”，并给出安全错误码，不会暴露临时 PDF token。这个诊断层本身的回归也已通过；它的最终 Worker/Pages 发布当时仍在运行，但不影响已经上线的 Range 核心修复。

现在请把之前已经打开的旧 PDF 标签页关闭，然后从 Gallery 卡片重新点一次 PDF。旧标签页不会自动换成新阅读器代码。
