# Private PDF Phase 3a production completion

已接上，Phase 3a 已经开发完成并在生产环境跑通。

你截图里“只剩 9 篇 PDF 没补齐、但一篇都打不开”的根因已经解决：以前抓到的 PDF 全部停在 raw/inactive，阅读器只认 ready/active。

本次实际库存处理结果：
- 第一轮：153 份 raw，50 份验证通过；103 份被拦下，其中 98 份是首版 SI 规则过严导致的误判，5 份是文本里没有提取到 DOI。
- 第二版验证器修正了这个问题：把出版社 PDF 来源、标题强匹配、DOI 和 SI 文档身份分开判断，不再因为正文第一页出现 “Supporting Information” 字样就把整篇文章当 SI。
- 第二轮：104 份重新验证，104/104 通过，0 失败。
- 最终生产状态：154 ready、154 active、0 raw、0 failed。

因此，你当前已经抓到的 154 份 PDF 现在都应该能由你的私有 PDF 阅读入口打开。面板里的“PDF 9”现在真正表示只剩 9 篇还没有抓到 PDF，而不是还有 9 篇没有验证。

验证没有采取“raw 全部强行 active”的做法。每份 PDF 都要经过对象大小/hash、PDF.js 解析、Gallery 标题/DOI、出版社来源及 SI 身份判断；只有通过才写 ready + active=1。正文全文没有因此写入公共数据库或媒体链路。

正式 Worker 部署：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37613929158
最终 154/154 库存处理：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37614880671
完整验收记录：https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/architecture/private-pdf-phase3-readable-20261007.json

你现在可以刷新 Gallery，再点任意一篇已抓到 PDF 的卡片 PDF 按钮试一下。若浏览器还显示旧的“尚无已验证 PDF”，优先强制刷新一次页面，因为旧 PDF 页面可能还留在浏览器缓存/旧标签页里；后端库存本身已经是 154/154 可读。
