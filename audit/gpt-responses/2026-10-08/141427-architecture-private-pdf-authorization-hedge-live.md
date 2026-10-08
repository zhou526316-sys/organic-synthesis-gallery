# Gallery 私有 PDF 授权超时修复：正式交付与对话同步

北京时间：2026-10-08T14:14:27.131+08:00
对话：Organic Synthesis Gallery 架构续作，用户上传阅读器错误截图（authorize，15011ms，阅读组件 676ms）。
仓库：zhou526316-sys/organic-synthesis-gallery，main 基线。
授权优化 PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/411
合并 SHA：acdeeb49cb57a1b421051b53e84eabd453fc2f3c
发布工作流：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37735432769
前端同步工作流：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37735432857
部署校验：Pages success；release-delivery.json.sourceCommit=acdeeb49cb57a1b421051b53e84eabd453fc2f3c；公开 /pdf/ 页面可读取；公开 Worker healthcheck ok:true。
七组 PR 相关 GitHub CI 检查通过。
技术范围：主 API 3.5 秒后的有界备用 Worker 授权请求、15 秒总限时、精确 URL 校验与备用域名 CSP、明确错误码。所有已授权会话仍由 Worker 验证；无公开 R2、无 PDF 下载权限扩大；不修改 Tampermonkey、媒体抓取、权威文献数据或固定槽位。
问题证据边界：15 秒是客户端授权请求硬超时，无法仅凭截图确定是 CORS 预检、网络路由、D1 还是 R2 内部哪个阶段。公众节点的健康检查不代表用户真实校园网。浏览器回归使用模拟会话/PDF，不能宣称真实 DOI 秒开。
PR 浏览器回归首次失败：备用域名被 PDF 页 CSP 阻止。修正 CSP 精确白名单和测试夹具 OPTIONS 后，浏览器专项通过，随后全站 CI 通过，正式合并部署。

## 已向用户展示的回答片段一

## 已定位到新的故障阶段

这张截图提供了关键证据：

| 诊断指标 | 实际结果 |
|---|---|
| 出错阶段 | `authorize`（授权请求） |
| 错误代码 | `pdf_transfer_timeout` |
| 授权耗时 | **15,011 ms** |
| PDF 阅读组件加载 | 676 ms |
| 是否进入文件传输 | 尚未进入 |

**这次并不是 PDF 文件下载太慢，而是获取 PDF 访问授权的请求在 15 秒后超时。**

上一轮的并行分段下载优化无法解决这个问题，因为浏览器根本还没有拿到授权后的文件地址。

需要优先检查 Worker 的 `/private-pdf/open` 接口、身份验证及 R2 文件校验，而不是继续增加下载并发数。

## 已向用户展示的回答片段二

### 修复方案已提交测试

新的修复位于 [PR #411](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/411)，目前尚未合并。

它保留正式 API 为主线路；若授权等待超过 3.5 秒，会尝试经过验证的备用 Worker 入口。授权总等待上限仍为 15 秒，不会简单延长超时。

两条线路都必须独立验证账号权限。正式接口明确拒绝授权时，不允许通过备用线路绕过。

同时已修正错误分类，后续授权超时会明确显示 `pdf_authorize_timeout`，不再误报文件传输超时。

## 最终用户可见回答

**本轮授权超时修复现已正式上线。** [PR #411](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/411) 已合并。GitHub Pages 已成功部署，主站发布标记确认对应提交 `acdeeb49`，Worker 健康检查正常；七组相关 CI 均通过。

针对截图中 **15.0 秒停在 authorize** 的问题，新版会在正式授权线路等待超过 3.5 秒时，尝试同项目经过验证的备用 Worker，并把总授权等待限制在 15 秒内。阅读页 CSP 已精准开放备用 Worker 域名；授权超时和文件传输超时也不再混淆。账号权限检查与 PDF 私有存储没有改变。

请关闭旧 PDF 标签页，从 [Gallery 主站](https://gallery.gczhouwld.com)重新打开同一篇论文。**实际是否提速仍需要你的网络验收**：我无法在你的校园网或个人账号下测量真实 DOI。如果仍慢，请告诉我 DOI、等待秒数，以及报错行中的「阶段」和「授权线路」，不需要提供含 token 的链接。
