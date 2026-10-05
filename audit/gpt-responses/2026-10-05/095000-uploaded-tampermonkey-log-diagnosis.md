# Response synchronization

北京时间：2026-10-05 09:50 +08:00
上下文：检查用户通过 Gallery/Tampermonkey 上传的实时日志，重点核对 private PDF capture、missing-only 队列及 Chem/RSC/Wiley 抓取状态。

## Final response

我看完了。你这次日志上传是成功的，而且信息足够定位当前状态。

当前抓取主线本身在正常运行。上传快照里是 `missing_only` 模式，目录成员约 798 篇，其中实际未完成项是 **603 篇**，不是把全部文献重新抓一遍。当前这轮已经访问 5 篇、产生 8 次尝试：**1 篇完整成功、4 篇 partial、3 次失败**；已经暂存 **21 张正文图**、保存 **4 篇文本证据**。上传时控制器仍是 running，没有暂停，publisher heartbeat 也正常。

PDF 这部分则可以明确判断：**还没有真正开始抓 PDF。** 这轮已经完成的 5 篇不同论文——JACS 1 篇、Angew 4 篇——我逐篇对了队列，它们的 `addedDate` 全都是 **2026-10-05**，所以全部满足 `addedDate >= 2026-10-01` 的 PDF 条件；而这些结果里没有任何 `privatePdf` 字段，trace 也没有 `private_pdf_discovery`、`private_pdf_fetch`、`private_pdf_upload`。日志上传之后新完成的 Angew 任务仍然如此。

我又检查了代码路径：`addedDate` 没有丢，确实会从队列原样进入 job。因此对于这些合格任务，`maybeCapturePrivatePdf()` 在完成阶段仍然直接返回，最符合代码逻辑的原因就是：**运行 Tampermonkey 的这个浏览器当时没有有效的 PDF capture lease。**

这里分两种情况：
- 如果你只是“上传了日志”，但还没在 `private-pdf-owner-setup.html` 里点 **“授权本浏览器抓取 PDF（7 天）”**，那现在的表现完全正常；授权以后下一篇合格任务才会开始 PDF discovery。
- 如果你在这轮 09:38 左右开始抓取之前，已经点过这个按钮，而且页面明确显示绿色的 **“PDF 捕获授权成功”**，那就不是操作问题，而是 **lease 没有被当前运行的 Tampermonkey 实例读到**。这时我会直接修 lease handoff/可观测性，不需要再猜。

另外日志里还有两个值得注意的问题：

**Chem** 的新 DOI `10.1016/j.chempr.2026.103220` 已经正确解析到了 ScienceDirect PII 页面 `S245192942600286X`，说明 v9 的 DOI→PII 路由确实在工作；但浏览器页面标题是 **“请稍候…”**，最终报 `page_doi_unverified`。这说明当前失败点已经不是旧的 PII/job binding，而是 ScienceDirect 给当前浏览器返回了中间等待/访问验证页面。

**Green Chemistry** 的 `10.1039/d6gc03816f` 也已经正确进入 RSC 的 `/articlelanding/2026/gc/d6gc03816f`，但同样页面标题是 **“请稍候…”**，随后 `page_doi_unverified`。所以 RSC 当前也属于“正确 URL 已到达，但浏览器没有拿到真正文章 DOM”，不是 RSC 路由写错。

Wiley/Angew 的情况不同：正文图和全文抓取得很好，多篇是 **4–7 张图全部成功 + 文本 stored**；但是部分 TOC 在把已经拿到的 GA 上传到 `api.gczhouwld.com/api/media/local-capture/import` 时出现 `Failed to fetch`。这属于**上传链路瞬时失败**，不是 Wiley 页面没抓到图。

还有一点不用担心：日志里看到 `version=6.2.20 / controllerRevision=2.2.39` 不代表你又退回旧版。这两个是刻意保留的 capture protocol/controller 兼容标记；当前发布脚本的安装 revision 是另一套版本字段。

所以现在最关键的是 PDF 授权状态。**如果你刚才已经看到过“PDF 捕获授权成功”，告诉我这一点即可；那我就按“授权已成功但 lease 未被抓取实例读取”继续修。** 如果还没点授权，就先点一次，当前抓取任务不用停。
