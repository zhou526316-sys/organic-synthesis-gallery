# Gallery PDF native browser recurring slow/unavailable — user-visible response sync
Beijing time: 2026-10-09 22:42:39
Context: User feedback "PDF现在打开还是很慢，特别是浏览器上经常打不开"
Feedback id: PDF-20261009-2234-NATIVE-BROWSER-SLOW
Related diagnostic: audit/pdf-reader/2026-10-09-2234-native-browser-slow-verified-gaps.json
User credentials, target account email, DOI, signed URLs: not accessed and not logged.
Production repair code in this turn: none; awaiting explicit repair-batch approval.

## Supported partial answer content

### Part 1

已核查当前线上版本：连续滚动及首屏按需读取仍在，但“浏览器阅读”会将页面直接跳转至同一个 Cloudflare 私有 PDF 令牌链接。浏览器接管之后，Gallery 无法继续提供错误解释或自动重新签发令牌；相关回归只检测了请求被发起，未实际验证原生 PDF 第一页显示。

### Part 2

进一步确认：授权请求对主备 Worker 存在竞速机制，但真正的 PDF 文件分段请求，在超时或 5xx 时通常只重试已选中的文件线路；401 才重新获取授权地址。历史截图记录了长达 92 秒的传输超时，因此这是优先调查和修复的代码缺口。

### Part 3

本轮只读公网验证：公开 PDF 页面约 6.1 秒、API 健康接口约 4.1 秒（单次外部测试，不代表用户国内网络），腾讯独立健康接口不可访问。最新 Pages、Worker 与 PDF Vault 静态验收通过，仍无法证明真实账号的 Edge 原生 PDF 可成功加载。

## Terminal user-visible continuation

下一步建议针对两个已确认的代码缺口做专项修复，而不是继续单纯增加超时时间：

1. **文件传输级切换**：当 Range 请求遇到网络超时或 502/503/504，重新向允许的备用 Worker 申请短时票据，验证 PDF 文件身份、长度和分段响应一致后，再有限次数续取；401/403、权限撤销、错误文件绝不绕过。
2. **浏览器原生阅读恢复**：跳转前确认真实的 206 分段响应和会话续读条件，失败时保留 Gallery 的诊断、重试和返回入口；补上 Edge/Chrome 的超时、票据过期及第二页实际显示测试。

这两项可能增加失败场景下的一次额外网络请求，且两条 Cloudflare 路线都故障时仍无法保证成功；腾讯独立线路的证书问题需另行验收。此外，私有 PDF 目前采用 `no-store`，重复打开可能重新跨境下载，后续还应完善用户自愿保存的本地副本。

**按照你此前要求的“先核实，再决定修复”，以上两项已经定位到具体代码路径。是否批准我按这两项实施，并在回归通过后部署、验证真实网络效果？**
