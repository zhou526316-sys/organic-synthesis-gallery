# Gallery PDF parse-stage persistent stall — reply sync

Beijing time: 2026-10-10 09:25:08
Context: Organic Synthesis Gallery; the user reports still cannot open PDF and supplies a screen showing the parse-stage progress message.
Read-only evidence: latest reader still downloads 1MiB chunks and only releases a completed arrayBuffer to PDF.js, with 9-second warmup and 12-second first Range deadlines.
No credentials, session tokens, signed file URLs, private PDF contents or school/VPN IDs accessed or logged.
Production code changes: none; feedback repair approval required by PROJECT_RULES.md.
Diagnostic audit: audit/pdf-reader/2026-10-10-parse-waits-entire-range-body-under-campus-vpn.json, commit 0d18465cc7f6c335aac9eab444d10ed9588175be.

## Complete intended user-visible reply

这张截图确认：PDF 已经进入 **解析阶段（parse）**，但还没有收到足以完成 PDF 目录与第一页解析的数据。这不是“PDF 权限尚未开通”的典型表现。

结合你之前的 F12 记录（3 个 `206`，分别耗时约 9、9、12 秒）和我刚核对的线上代码，找到一个直接的性能瓶颈：

- 阅读器仍按 **1 MiB** 为单位请求 PDF 数据，并在加载时预取首、尾分段，预取最长只等 **9 秒**，首次分段最长 **12 秒**。
- 实际代码使用 `await response.arrayBuffer()`：只有**完整下载整个 Range 分段**后，才把数据交给 PDF.js 解析。哪怕网络面板已有部分下载字节，画面仍可能一直停在“正在按需读取目录和第一页…”。
- 先前增加的切换机制仍然主要是在 **两个 Cloudflare 地址之间**尝试，无法保证绕开校园网、学校 VPN 与 Ghelper 组合下的网络瓶颈。

因此，这次不应该再要求你反复切换 VPN 或重新登录，也不应该单纯把超时时间拉长。

**下一项应该修的就是首屏数据传输粒度和可观测性**：把首屏的 1 MiB 请求改为较小的 128–256 KiB 分段（以浏览器测试确认合适大小），逐段验证 `206`、`Content-Range`、文件身份和实际字节长度；在读取过程中展示已收到的真实字节数，明确区分“收到响应头”“下载进行中”“下载中断”“正在切换线路”。权限验证、连续纵向滚动、原图框选和本地 PDF 功能保持不变。

对于你已经保存过的 PDF，暂时优先使用“本地 PDF”打开，可以避开这条实时跨境传输路径。

**目前我只完成了问题核实，没有再次修改生产代码。是否批准我实施这项“首屏小分段读取 + 实时传输进度”修复，经过慢速/中断网络浏览器回归后再上线？**
