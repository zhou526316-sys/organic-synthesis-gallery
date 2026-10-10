# User-facing response sync — live Edge campus/Ghelper US PDF failure

Beijing time: 2026-10-10 08:52:37
Project chat: Organic Synthesis Gallery owner PDF transport
User supplied image: 2026-10-10 08:48, DOI 10.1021/acscatal.6c05658; 27.1 s parse-stage transfer timeout, authorize 3492 ms, PDF component 1386 ms, 3 Range requests, last response 8642 ms, primary authorization route.
Network context: campus Wi-Fi/network, Edge browser with Ghelper extension using U.S. proxy node; precise proxy routing unknown.
Read-only repo check: main src/private-pdf-reader.mjs blob 043397a98f04bed55b8c94d130c0db4b0e38eb4a; 12s first + 15s alternate request budgets, document content hash failover.
Recent production release: Pages #38007112591 success; PDF Vault live #38007998720 success; these do not verify user Edge signed PDF transfer.
No code changes, no credentials / raw signed PDF URLs / IPs requested. Follow project verify-first feedback hold for any new repair.

## User-visible partial

这张截图提供了比之前更明确的故障信息。**你不需要告诉我学校名称、校园网账号或公网 IP。** 目前已知的“校园网 + Edge + Ghelper 美国节点”已经足够进行第一轮针对性排查。

我从截图中读到以下数据：

| 项目 | 本次结果 |
|---|---|
| 论文 DOI | `10.1021/acscatal.6c05658` |
| 失败阶段 | `parse`（PDF 解析期间仍在读取数据） |
| 错误 | `pdf_transfer_timeout` |
| 总耗时 | 27.1 秒 |
| PDF 授权 | 3492 ms |
| 阅读组件加载 | 1386 ms |
| 分段请求 | 3 次 |
| 分段响应耗时 | 8642 ms |
| 使用线路 | `primary` |

这说明**账号授权和 PDF 组件都已完成加载，主要问题发生在 PDF 文件分段传输期间**。单纯增加等待时间并不能解决。

Ghelper 的美国节点是一个重要线索：Edge 的请求可能先经过美国代理节点，再到 Cloudflare。若代理链路不稳定，或不同 API 域名未按相同规则代理，都可能造成这种情况。但目前还不能认定一定是 Ghelper 导致的。

## User-visible completion

我也核对了当前线上源码：新版本给首次 Range 请求约 **12 秒**、后续重试约 **15 秒**的预算。截图中的 **27.1 秒**与这一过程的耗时量级吻合，但不能仅凭截图确定具体是哪一次请求超时。“授权线路：primary”指的是取得授权的入口，**不代表实际 PDF 数据始终走了哪条代理路径**；截图也没有显示一次成功的文件线路切换。

为了确认究竟是校园网直连问题、Ghelper 美国节点，还是 Cloudflare 文件接口问题，请做下面这组对照，不需要改动学校 VPN：

1. **Ghelper 保持美国节点**，分别用 Edge 打开这两个*公开健康检查链接*：[主 API](https://api.gczhouwld.com/api/_healthcheck) 和 [备用 Worker](https://organic-synthesis-gallery.zhou526316.workers.dev/api/_healthcheck)。记录各自能否显示 `"ok":true`，以及大概需要几秒。它们没有账号令牌，不会读取私人 PDF。
2. **仍用相同校园网，暂时关闭 Edge 的 Ghelper 扩展**（地址栏输入 `edge://extensions`），刷新 Gallery，再试同一篇 `10.1021/acscatal.6c05658`。告诉我能否在 30 秒内显示第一页、实际耗时或报错。如果关掉扩展后网站本身无法访问，也直接告诉我。这一步无需提供校园网名称或 IP。
3. **如果仍然失败**，在 Edge 按 `F12`，进入“网络(Network)”，筛选 `private-pdf/file`，重新打开 PDF。请只记录失败请求的 **HTTP 状态码**（例如 206、401、503 或 `(failed)`）与 “时间(Timing)”里的等待／下载耗时；也可只截图这一小块。**不要发送 HAR、完整 Request URL、`token=`、Cookie 或 Authorization。**

这组对照能直接区分浏览器代理与校园网出口。你如果知道 Ghelper 使用的是“全局代理”还是“智能/按网站分流”，也一并告诉我；**不需要学校名称、公网 IP 或账号信息**。

如果关闭 Ghelper 后明显恢复，下一步应重点检查 Ghelper 对 `api.gczhouwld.com` 与 `*.workers.dev` 的代理规则和美国节点质量；如果两种方式都超时，我会继续针对同一 DOI 的 Range 文件路径核查服务端和线路，不能因为此前的模拟回归通过就判定问题已解决。
