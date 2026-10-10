# Gallery PDF API availability follow-up — VPN and Ghelper rule proxy

Beijing time: 2026-10-10 09:18:33
Project chat context: PDF troubleshooting, user reports API URL is now reachable using Ghelper rule proxy and previously noted simultaneous campus VPN.
No assumption that campus VPN was disconnected: user did not indicate that.
No production code or infrastructure edits. No secret, token, HAR, user IP or VPN identity included.
Relevant earlier user screenshot: three signed Range responses status 206, durations ~8.99/9.01/12 seconds, incomplete actual PDF loading.
Next requested acceptance: same DOI 10.1021/acscatal.6c05658, same Edge/Ghelper campus-VPN network configuration, first page timing and sanitized error if any.

## User-visible response

这说明情况有变化：**在目前的 Edge + Ghelper 规则代理环境下，至少截图所示的 API 接口现在能访问了。** 如果学校 VPN 仍处于连接状态，那么此前“关闭 Ghelper 也打不开 API”的结果，不能直接证明校园网对 Cloudflare 持续封锁；网络可达性可能随 VPN 路由、代理节点和时间变化。

但要区分两件事：**API 健康检查能打开，不代表私有 PDF 数据可以完整下载。** 你上一张 F12 截图里，PDF 请求均返回了 `206`，却分别耗时约 9、9 和 12 秒，恰好对应阅读器的超时预算。问题仍更集中在 **Range 分段数据传输**，不是单纯的账号权限校验。

**现在先不要改 VPN 或代理设置。** 保持当前“校园网 + 学校 VPN + Ghelper 规则代理（美国节点）”完全不变，在 Edge 对 Gallery 按 `Ctrl+F5` 刷新，然后重新打开 `10.1021/acscatal.6c05658`。

请告诉我：**这次第一页能否打开、用了多少秒？** 如果仍失败，保留 F12「网络」里 `private-pdf/file` 请求的状态、大小、时间截图即可。不要分享完整请求 URL、`token=`、Cookie 或 HAR。这样我们才能在**同一网络条件**下判断 API 已恢复后，PDF 文件传输是否仍然卡住。
