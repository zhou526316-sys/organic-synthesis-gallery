# New automatic report receipts — user response

Context: current TOC/article-figure capture; user asks whether new reports have arrived.
Evidence read completed: 2026-09-23 10:36:08 +08:00.
Successful read: workflow 35811000350, job 107022330354; authenticated R2 GET only.
Detailed evidence commit: 1f3be96001d07f82b15b3af569e21f4b16868dfd.
Only the audit-reader workflow and audit records changed. No capture-runtime, media-object, literature-data or publication-gate changes; no background assistant monitoring task created.

## Commentary

我现在查服务器最新报告，确认是否已有 **2.2.22 的自动上报**，并核对接收时间、具体失败原因和最终保存结果，不把旧的手动日志算作新报告。

公开报告接口这次返回了 403。我改用已有授权读取 R2 中的报告原件；这个 403 是**我这次读取被拒绝**，不能据此判断你的抓图或报告上传失败。

## Final response

**收到了。这次确认是 2.2.22 自动送达的新报告，不是之前的手动日志，也不是测试数据。** 我在北京时间 **9 月 23 日 10:36** 读取服务器：已有 **11 个 DOI 的自动报告**，其中 10 个已有最终结果，另 1 个仍是过程中上报的失败检查点。已取得的详细报告明确包含 `controllerRevision: 2.2.22`。fileciteturn636file0L2-L2

### 自动上报已经实际打通

最新的 OL `6c03636` 检查点在本机记录于 **10:35:55.869**，服务器接收时间为 **10:36:00.125**，两者相差约 **4 秒**。这说明可以在文章还没处理完时取得具体失败证据，不必等整批结束；这只是本次样本，不能保证每次都在 4 秒内送达。fileciteturn636file0L2-L2

几个刚收到的结果如下，时间均为北京时间：fileciteturn636file0L2-L2

| 服务器接收时间 | 文献 | 报告结果 |
|---|---|---|
| 10:35:00 | OL · `6c03418` | 保留已有 TOC，正文图 **9／9**，最终成功 |
| 10:33:10 | OL · `6c03340` | 正文图 **5／7**，部分完成 |
| 10:31:40 | Angew · `anie.9519061` | 未发现 TOC，正文图 **0／0**，失败 |
| 10:31:11 | OL · `6c03335` | 正文图 **2／4**，部分完成 |

这里的图数是脚本报告的“已保存／已发现图号”，不是已经独立核验的全文总图数；`0／0` 也不能解释成文章没有正文图。上述正文图报告仍标记为未发布。fileciteturn636file0L2-L2

### 新报告已指出下一批该先修什么

**第一优先级是正文图上传阶段的 503。** OL `6c03340` 的 **Scheme 5**、OL `6c03335` 的 **Figure 1** 都已经进入 `figure_stage` 保存步骤，却收到 `HTTP 503 / upload_http_503`。这与出版社图片地址的 403 是两回事：**现在部分图片的问题不是找不到，而是提交保存时失败。** 报告尚未给出足以确定后台根因的响应正文，不能直接归因于配额或 Worker 内部错误。对应方案应是先核对这两个请求的服务端错误，再做有次数上限的“只重试上传”，避免重新打开整篇文章重抓。fileciteturn636file0L2-L2

其次是减少 ACS 的无效候选请求。`6c03418` 虽然中途有预览地址 403、格式拒绝和普通请求失败，最后仍完成 **9／9**；因此应把已验证成功的同 DOI 图片来源排前面，而不是把每个候选错误都当成整篇失败。Angew 的 `0／0` 则需单独检查页面是否完整加载、是否停在验证页，以及图注选择器是否匹配，不能盲目延长超时。fileciteturn636file0L2-L2

**你不用再手动上传这批日志。自动报告接收已经得到真实验证；但抓取链路仍有上述缺口。本轮完成了实报核对和修复优先级定位，尚未把这些新问题宣称为已修好。**
