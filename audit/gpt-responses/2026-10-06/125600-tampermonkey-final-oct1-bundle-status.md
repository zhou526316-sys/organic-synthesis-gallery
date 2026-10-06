# Response synchronization

北京时间：2026-10-06 12:56 +08:00
上下文：Tampermonkey/VPN Bridge；继续 10 月 1 日后四路同页抓取、旧 controller 自动接管与今日 29 篇补抓验收。

## Final response

继续后的最终状态如下。

正式链路现在已经切到最终版：canonical Gallery 和 Worker 两边都是 VPN Bridge 2.2.55 / TOC 6.2.36，controller 统一为 2.2.41；Oct-1 live acceptance 已通过，Media delivery integrity 重新跑也已经通过。也就是说服务器、正式网页和回归测试已经对齐，不再是代码“写了但没上线”。

我又逐篇核了今天 29 篇。目前生产端 26/29 有主视觉记录，3 篇仍缺生产主图：10.1021/acscatal.6c06318、10.1021/acs.joc.6c01869、10.1039/d6gc03161g。正文图库存方面，21/29 已经有至少一张有效暂存正文图，8 篇仍完全没有正文图回执；而且这 21 篇目前 expectedFigureCount 都还没有被完整确认，因此不能把“有图”当成“正文图已抓全”。按最新 Tampermonkey 报告可见的全文记录只有 7 篇 stored，其中 3 篇 complete；这只是报告层可见值，最终补抓时会再读取受保护的全文库存核对。

最关键的一点仍然是：截至我刚才最后一次在线检查，今天 29 篇里 controller 2.2.41 的新浏览器回执仍是 0/29；现存的 15 条最新报告全部还是旧 2.2.40。也就是说现在已经不是服务器停滞，而是你当前浏览器里的旧页面尚未重新载入最终 userscript。旧标签页不会在运行中自动换成新代码。

现在你只需要让本机切到新版。先关闭或刷新截图里那个显示“2.2.40”的 Gallery 控制页，以及它之前打开但还没关掉的出版社任务页；然后重新打开 Gallery。如果 Tampermonkey 已自动更新，面板应显示 controller 2.2.41，并运行 Bridge 2.2.55。若仍显示旧版，请打开 `https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js` 重新更新/安装一次，再回到 Gallery 刷新。

这次不需要再手工清锁。6.2.36 启动时会识别遗留的 2.2.40 active job / lease，自动将旧 controller 淘汰，并自动重新生成缺项队列；若识别到旧状态，会出现“已自动淘汰旧 controller … 正在按最新规则重新生成缺项队列”一类提示。正常情况下也不需要再反复点“立即开始”；如果刷新后没有自动启动，再只点一次即可。

10 月 1 日后的规则现在也已经补完整：只要一篇论文因为真实缺项被打开，同一次页面访问会顺带处理 TOC（若缺）＋正文图＋全文＋PDF。已有正文图回执会按 DOI/标签复用，不重复下载；旧版本已经抓到 PDF 的论文也不会被直接跳过——PDF 文件本身复用，但仍会再开页一次补正文图和全文，完成新版 bundle 后才停止重复访问。组合任务里 PDF 抓取失败会显示 partial，而不是再出现“顶层 success、PDF 实际失败”的假成功；今后的服务器回执也会单独记录 privatePdfStatus 和 privatePdfBytes。

相关核心提交：`4c5324a`（旧 PDF 迁移到 10/1 bundle、PDF partial 语义、独立 PDF 回执字段）、`3ff5ee2`（旧 controller 自动接管）、`5121ca1` / `6ac6401`（媒体回执历史回归与触发修复）。正式 Pages 部署 run `37415600597` 已成功完成；最终 live acceptance `37415600535` 成功。

你现在刷新/重开 Gallery 即可。新面板一旦出现 2.2.41，我下一步就按今天这 29 篇逐篇盯新的四路回执，直到把剩余 TOC、正文、全文和 PDF 缺口列到 0 或明确记录为出版社访问受阻。
