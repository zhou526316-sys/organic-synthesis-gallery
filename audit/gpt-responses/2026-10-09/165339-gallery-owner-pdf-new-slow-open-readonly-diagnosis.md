# Gallery PDF slow-open complaint — response sync

Beijing time: 2026-10-09 16:53:39
Context: organic-synthesis-gallery architecture, screenshot plus complaint that PDF has become slow again.
Source evidence: PR #440 merged at 2026-10-09 06:21 UTC; network probe #37907269828; Tencent TLS rerun #37891507915; source code and schema; audit/pdf-reader/2026-10-09-1642-slow-pdf-open-diagnosis.json.
Privacy: no owner token, private DOI or signed file URL accessed.
Production changes this conversation: none.

## User-visible answer part 1

已经确认两个关键变化：

1. **今天的 PDF 阅读器前端代码并没有再次换回旧版。** 连续滚动、按需读取和首次页面超时保护都还在。
2. **今天 14:21（北京时间）合并的 PR #440 改动了 PDF 服务端。** 为了保证退出登录或设备被强制下线后不能继续读取私有 PDF，现在每次分段读取都要额外检查一次 D1 登录会话。

第二项增加了请求处理开销，在网络延迟较高时可能放大等待时间，但目前还不能确认它就是这次变慢的根因。

同时，腾讯云独立 PDF 网关仍未上线。当前主、备用线路都经过 Cloudflare，因此尚未真正解决国内部分网络访问不稳定的问题。

## User-visible answer part 2

刚完成新一轮真实公网探测，结果进一步缩小了问题范围：

| 检查项目 | 主线路 | Cloudflare 备用线路 |
|---|---:|---:|
| 公开健康接口首字节时间（中位数） | 25 ms | 18 ms |
| 无效登录会话查询（中位数） | 76 ms | 67 ms |
| 未授权 PDF 请求（中位数） | 73 ms | 67 ms |

18 次请求全部返回预期状态。[查看本轮网络诊断](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37907269828)。

这组数据来自海外 GitHub Runner，不是你的校园网络。而且未授权请求不会实际读取 R2 文件。它至少表明 Cloudflare 的公开接口并非在所有地区都异常缓慢。

**目前没有证据表明新增的 D1 检查本身足以造成数分钟的等待。** 更需要怀疑的是国内网络到 Cloudflare 的 PDF 文件传输，以及 PDF.js 等待第一页所需数据的过程。

## Terminal user-visible answer

继续追查后，**今天 16:50 的再次检测还确认：腾讯 PDF 域名仍返回错误的 HTTPS 证书**（只包含 `relay.gczhouwld.com`），所以独立备用网关实际上仍不可用。此次不是连续滚动功能被撤销，而是跨境 Cloudflare 文件链路还没有真正的独立备援。[证书复测记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37891507915)。

目前代码还存在一个能够解释长等待的结构：PDF 权限确认最长 15 秒；对于需要整份获取的小 PDF，文件传输最长可等 90 秒；拿到字节后第一页解析和绘制又可等 45 秒。**这些时限是分阶段计算的，不是整个 PDF 45 秒就能打开。** 如果网络连续卡住，单次打开就可能耗费很长时间，调高超时无法真正提速。

我把问题归为**已确认的高延迟风险，但尚未定位你这一次截图对应的确切慢请求**，也没有擅自回滚五设备登录的安全校验。下一步建议先让阅读器在加载过程中直接显示不含隐私的授权、Range 响应与第一页耗时，再针对实际最慢阶段减少跨境请求；腾讯证书与真实国内网络验收仍须独立完成。未获这项反馈的修复批准前，我先不更改生产代码。

暂时可以试一下 PDF 页面已有的“浏览器阅读”入口：若明显快于网页内连续阅读，问题更偏向 PDF.js／分段读取；若一样慢，则更偏向授权或文件网络路径。
