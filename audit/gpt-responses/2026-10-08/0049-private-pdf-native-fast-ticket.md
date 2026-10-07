# Private PDF native viewer + stateless fast ticket

- Beijing time: 2026-10-08 00:49 +08:00
- User report: even after 512 KiB range tuning, the reader remained stuck for a long time at “正在读取 PDF 目录…”.
- Root cause: remaining latency was dominated by client-side PDF.js xref/catalog parsing and multiple browser-to-Worker range round trips. Each prior range also depended on the opaque access-token D1 lookup.
- Functional commit: `11db4ff8926d1fe33f762e6e59e915f7cab047d3`
- Frontend change:
  - default private-PDF route now hands the authorized PDF to the browser-native PDF engine in an iframe;
  - PDF.js remains available only through the explicit “兼容模式” control;
  - default path no longer enters the site’s “读取 PDF 目录” phase.
- Backend change:
  - `openPrivatePdf` issues an AES-GCM encrypted, five-minute stateless v2 ticket when `PRIVATE_PDF_TICKET_SECRET` or domain-separated `BRIDGE_WRITE_TOKEN` key material is available;
  - ticket contains encrypted DOI/R2 key/byte length/expiry and therefore does not expose the private R2 key;
  - range/HEAD reads decrypt the ticket locally and skip per-range D1 access-token/document/capability lookup;
  - legacy D1-backed opaque tokens remain supported as fallback;
  - legacy immediate revocation semantics remain covered; the fast ticket is intentionally bounded by its short expiry.
- Production healthcheck after Worker deploy reports `privatePdf.fastTicketEnabled=true`.
- Pages prepublication owner-PDF gate passed and logged **18/18** browser cases, including:
  - native viewer default;
  - PDF.js compatibility mode with bounded range reads;
  - owner visibility/session outage behavior;
  - logout/account-switch/late-response isolation.
- Worker deploy run 37653671619 — success.
- Worker/frontend sync run 37653671542 — success.
- GitHub Pages run 37653671528 — success.
- Live delivery audit `925f18843c7f8800e7438e26a6b5e1125c807076` records sourceCommit `11db4ff8...` and `success-live-verified`.
- Direct live fetch of `https://gallery.gczhouwld.com/pdf/` shows the new “兼容模式” control, confirming the new viewer shell is on the custom domain.

## Final user-visible response

你这次指出的“读取 PDF 目录”慢，我没有继续调分片参数，而是把这一层直接绕掉了。

现在主站已经正式切换到新路径：默认点击 PDF 后，不再由网页里的 PDF.js 解析 xref/目录，而是直接把授权后的私有 PDF 交给 Edge/Chrome 自带的 PDF 引擎。原来的 PDF.js 只保留在“兼容模式”里，因此正常情况下你不会再看到“正在读取 PDF 目录…”这一步。

同时后端也换成了短时加密快速票据。以前每个 Range 分片都要拿临时 token 查 D1、再定位文档；现在 v2 票据把所需元数据加密后由 Worker 本地验证，Range/HEAD 不再逐段查 D1。生产健康检查已经确认 `fastTicketEnabled=true`。

这版的发布前浏览器回归是 **18/18 全部通过**，其中专门验证了“默认原生查看器”和“PDF.js 兼容模式”两条路径；Worker、前端同步和 GitHub Pages 均已发布成功，正式线上记录绑定 `11db4ff8`，状态 `success-live-verified`。

请关闭你截图中的旧 PDF 标签页，再从 Gallery 卡片重新点一次 PDF。新版页面顶部会有“兼容模式”按钮；默认不要点它。若你仍看到“正在读取 PDF 目录…”，那就说明打开的仍是旧标签页/旧页面，而不是当前默认路径。
