# GPT reply synchronization — mobile Nature Communications PDF partial Range timeout

Beijing time: 2026-10-10 13:49:52 +08:00
Project conversation: Architecture and private PDF gateway, user uploaded Android mobile in-app browser screenshot and asked '先看看这个'
Related PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/464
Evidence commit: f7cfa58bf016a77cdafa987f0599ff9cf742a52e
Evidence document: audit/pdf/2026-10-10-mobile-partial-range-timeout-natcomm.md

## Streamed partial final

## 这张手机截图提供了更关键的故障证据

这次的情况比之前更明确：**手机已经成功授权，而且确实收到了部分 PDF 数据，但在读取后续分段时超时，导致第一页无法显示。**

截图对应 Nature Communications DOI `10.1038/s41467-026-78405-z`。

| 项目 | 真实结果 |
|---|---|
| 错误 | pdf_transfer_timeout |
| 阶段 | range |
| 耗时 | 20.8 秒 |
| 授权耗时 | 1750ms |
| 阅读组件 | 478ms |
| 分段请求 | 3 |
| 最近记录的分段响应 | 438ms |
| 已读字节 | 524288B (512KiB) |
| 传输字节 | 524288B |
| 授权线路 | primary |

三个结论：当前不是典型 401/403/授权超时；已有完整的数据段成功抵达；正式阅读器仍未接入独立腾讯线路，`primary` 是授权线路而不是文件完毕证明。与电脑上 JACS PDF 超时是不同设备/文献的共同现象，但不能单独证明 Cloudflare 是唯一根因。

## Final response, to be sent

我又检查了主线代码中数据统计的定义：`传输字节`仅在一个 Range 响应体完整转换为字节数组后累加；`已读字节`是在 PDF.js 接纳这个分段后累加。截图里二者同为 524288 B，因此**确有 512KiB 的完整有效文件片段交给 PDF.js**，不只是收到一个 HTTP 206 状态。

但 `分段响应 438ms` 只记录响应头阶段的最近一次耗时，并不代表其余 Range 数据已经在 438ms 内传完。截图没有每次请求的偏移量、完整内容耗时或最终成功的文件切换记录，所以目前不能确定是正文前段、尾段还是另一项按需读取阻塞。

与此前电脑 JACS 的 25.6 秒 / 3 次 Range 超时相比，手机 Nature Communications 的 20.8 秒 / 3 次 Range 超时、且已收到 512KiB，进一步支持优先排查共同的主/备 Cloudflare 文件传输路径；但手机内置浏览器行为、移动网络本身也必须留在备选原因中。此截图并不是腾讯大段文件读取失败的证明，因为正式版尚未开启腾讯文件回退。

已把这次证据写入 PR #464 的 `audit/pdf/2026-10-10-mobile-partial-range-timeout-natcomm.md`。PR #464 仍是草稿，路由开关 `enabled:false`；不修改主站也不动腾讯服务器。下一步唯一有判别力的是真实授权下同一 DOI 的主线路与腾讯线路各自独立签发票据，验证完整 1MiB 的头部/尾部 Range，再做手机第一页、第二页和跨账号权限隔离。不要再重复前 16 字节的健康检查，也不必在手机内置浏览器打开开发者工具。

User-visible safety: do not share token-bearing PDF URLs, cookies or Authorization request headers.
