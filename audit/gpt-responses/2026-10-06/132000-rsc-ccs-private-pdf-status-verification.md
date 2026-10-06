# Response synchronization

北京时间：2026-10-06 13:20 +08:00
上下文：Tampermonkey/VPN Bridge；用户询问 Chemical Science 错图、CCS TOC 与 Private PDF 呈现是否均已解决。

## Final response

没有，当前不能说“三个都解决了”。

1. **Chemical Science / RSC：仍未解决。**
   用户截图对应的 `10.1039/d6sc06421c` 已实时核验。生产 `/api/toc` 当前仍把
   `d6sc06421c.pdf.gif` 作为 TOC，旧 2.2.40 报告测得它为 794×1039；这就是截图中那种期刊/文章页面式大图，并非应展示的真正 graphical abstract。与此同时生产 `/api/article-figures` 对该 DOI 返回 0 张正文图，staged 也为 0。截图“正文图片”再次出现同一张错误图，因此还存在展示层把 TOC/兜底图重复当正文图的问题。不能宣称已修复。

2. **CCS Chemistry 的官方 TOC 主问题：当前已基本闭环。**
   当前 live registry 有 10 篇 CCS Chemistry。逐篇读取生产 `/api/toc`，10/10 均已有生产 TOC；进一步读取 local-capture-index，10/10 均已有 `kind=official` 的 CCS `keyimage`，包括之前最有问题的 `10.31635/ccschem.026.202507094`。该 DOI 当前生产 TOC 已是 `keyimage.png` 对应缓存；同时它有 6 张正文图暂存在 verified staging。这里的“CCS TOC 抓到了但仍显示 Figure 1/Fetching”的核心问题可以视为已解决，但 staged 正文图是否全部进入生产显示是另一层，不应混为一谈。

3. **Private PDF：底层链路已修，但最终呈现/实际覆盖没有完全闭环。**
   当前前端 `src/private-pdf-access.ts` 已实现 owner-only 原文链接拦截：账号有 `private_pdf_read` 且该 DOI 私有 PDF 已存储时，点击原文会调用 `/api/user-ui/private-pdf/open` 并跳到一次性 `/api/user-ui/private-pdf/file?token=...` 的 inline PDF；如果没有已存 PDF，则会回退出版社链接。当前实现并不是独立的 `/pdf/` 页面。
   Tampermonkey 6.2.36 的实时面板已经有独立 PDF 状态行，并区分等待/发现/下载/校验/上传/stored/failed。
   但是今天 29 篇截至本轮核验仍没有新的 controller 2.2.41 浏览器回执，所以不能证明新版 PDF bundle 已在本机跑通。旧 2.2.40 实例里，Chemical Science `10.1039/d6sc06421c` 的 PDF 下载仍为 403；CCS `10.31635/ccschem.026.202507094` 的 ePDF viewer 返回的约 38 KB 内容不是有效 PDF，GM fallback 也曾 403。因此“点击必定打开私有 PDF、而不是出版社”目前仍不能宣称对这些 DOI 已解决。

所以当前状态是：**CCS TOC = 已解决；Chemical Science/RSC 错图 + 正文图重复 = 未解决；PDF 捕获状态逻辑 = 已改，PDF 实际覆盖与卡片最终呈现 = 尚未完全验收。**

下一步应继续修 RSC：拒绝 `*.pdf.gif` 这类页面预览型候选作为 TOC，重新解析 RSC 真正 graphical abstract；正文图片区只允许真实 Figure/Scheme/Chart receipts，禁止 TOC fallback 复制进去。PDF 则继续以新版 2.2.41 的 `privatePdfStatus/privatePdfBytes` 为准逐篇验收，未 stored 的 DOI 不再冒充完成。
