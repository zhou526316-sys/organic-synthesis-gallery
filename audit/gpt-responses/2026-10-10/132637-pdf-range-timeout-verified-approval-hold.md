# GPT response synchronization: reported PDF full-reader failures after 16-byte Tencent validation

Beijing time: 2026-10-10 13:26:37 +08:00
Project chat context: architecture/PDF, user uploaded two screenshots saying multiple papers still fail.
Related read-only evidence commit: a466ef800af2f502a7bcb0a451c2c921ed220cc5
Evidence report: audit/pdf/2026-10-10-live-reader-range-timeout-after-tencent-16b-pass.md
Repair status: approval pending; no implementation, production switch or merging performed this turn.

## First partial final message

你说得对。**前面的 16 字节验收通过，并不代表 PDF 已经能够正常阅读。** 从你这两张截图看，实际阅读功能仍然存在明确故障，而且连续测试多篇文献都没有解决。

第一张截图给出了关键证据：

| 诊断字段 | 实际结果 |
|---|---|
| 错误代码 | pdf_transfer_timeout |
| 失败阶段 | parse（PDF 解析阶段） |
| 总耗时 | 25.6 秒 |
| 授权耗时 | 2,943 ms |
| 阅读组件加载 | 507 ms |
| 分段请求次数 | 3 次 |
| 授权线路 | primary |

这里有一个重要区别：**你刚才通过验收的是腾讯 PDF 网关，但截图中实际 PDF 阅读器使用的仍然是 primary 主线路，并没有切换到腾讯线路。**

所以，目前不能认为“腾讯网关已经修复了 PDF 打开问题”。它证明了另一条线路可以完成授权和小范围文件读取，而现有网页仍然在完整阅读阶段超时。

我会核查当前正式版阅读器的分段传输、超时和线路选择逻辑，找出导致多篇 PDF 卡住的共同原因，再给出针对性的修复方案。

## Second partial final message

我查到的主线代码与截图吻合：当前阅读器会先取得授权，再通过 PDF.js 按需请求正文前部和尾部的数据块。它对单次分段传输设置了约 12 秒的首轮期限，失败后再进行一次受限重试或线路切换。

截图里的约 25.6 秒、3 次分段请求与这一失败路径相符。它提示我们问题更可能发生在较大文件分段的获取或交付，而不是登录授权或 PDF.js 加载本身。接下来我会把已有的备用文件线路规则也核对清楚，避免把重复重试误当成真正切换成功。

## Final answer

进一步核实：现在 main 的 PDF 阅读器源码只声明 API_BASE(api.gczhouwld.com) 与 API_BACKUP(workers.dev)，没有连接腾讯的 API_TENCENT。已经合并的 PR #455 的文件备用授权仅在两条仍共用 Cloudflare Worker/R2 的地址间跳转；原先部署成功的腾讯 PR #420 仍未合并，enabled:false。截图中的授权线路 primary 表示 /open 的授权来源，不代表文件数据已完整返回；无文件切换/已读字节记录，不足以断言是哪一个 Range 响应失败。前 16B 206 成功无法代表 1MiB 正文/末尾片段可用。

已经验证并登记问题，但没有自行合并/修改反馈修复。提出获批后的范围：用同一篇 DOI 10.1021/jacs.6c17448 和另外一两篇失败文献，分别在原 Worker 与腾讯入口的独立合法授权票据下测试头尾较大 Range，采集每段 HTTP status、Content-Range、耗时和完整字节验证，不暴露 token/PDF；根据真实结果把腾讯线路的受控文件回退移植至最新 main（不覆盖新授权响应、连续滚动优化），要求内容 SHA-256 和文件长度一致、权限 401/403 严格拒绝、网关 256MiB 每月额度控制。先隔离测试、真实第一页第二页与手机独立账号验收，再考虑开启 feature flag。

用户当前可在一篇代表论文上手动尝试一次“整份下载后阅读”区分按需分段与整体传输，但不保证成功，也不建议重复大量下载。其余正式改动和开关均保持不动。

需要用户明确批准上述这个已核实的批次修复，符合项目反馈先核实后批准规则。
