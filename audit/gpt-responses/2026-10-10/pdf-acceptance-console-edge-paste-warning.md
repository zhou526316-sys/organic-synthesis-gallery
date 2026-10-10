# PDF owner acceptance: Edge DevTools paste warning
Beijing date: 2026-10-10
Chat context: user screenshot shows Edge Console self-XSS paste protection, typed Chinese "允许粘贴" but not yet pressed Enter, with unrelated Gallery media AbortError and image ERR_HTTP2_PING_FAILED.

## User-visible response
从截图看，**你已经正确打开了 Edge 的 Console（控制台），但 PDF 验收代码还没有执行。**

现在只差一步：
1. 你已经在最下方输入了 `允许粘贴`。
2. **现在按一次 Enter（回车键）**，解除 Edge 的粘贴限制。
3. 复制我上一条消息提供的完整 JavaScript 验收代码。
4. 点击 Console 最下方的 `>` 输入区域，按 `Ctrl + V` 粘贴代码，再按 `Enter` 执行。
5. 浏览器会弹出输入 DOI 的窗口，输入一篇确认已经存储 PDF 的论文 DOI，然后点击确定。

执行完成后，应该出现包含 `gatewayHealth`、`authorizeHTTP`、`fileHTTP`、`range206` 和 `pdfMagic` 的结果表。

### 截图里的其他红色报错

这些目前不是 PDF 网关验收结果：

- `AbortError`：Gallery 媒体实时索引请求中断，页面保留静态快照。
- `ERR_HTTP2_PING_FAILED`：TOC 图片请求发生 HTTP/2 连接错误。
- `original graphic image failed to load`：某篇论文的原始图片加载失败。

它们属于网页媒体加载问题，暂时不影响我们先验证腾讯 PDF 网关。

## Security
Script should be run only after user reviews and trusts it. Do not share session tokens or signed file URLs.
