# GPT response synchronization

- Beijing time: 2026-09-23 22:00
- Context: body-image staged backlog anti-starvation publication and Bridge 2.2.26 real-client status
- Related acceptance commit: e56cc28a8a5826e79b5fdab4cddd9cbb9fb26e0f

继续完成了。当前两条主线都已经收敛：

1. **之前暂存的正文图现在会持续上线，不会再被新抓取“饿死”。**
   - PR #180 已合并进 main。
   - 发布规则现在是：20–25 篇优先立即发布；不足 20 篇且最新合格记录静默 15 分钟则发尾批；即使新图持续进入，只要最老合格未发布记录等待达到 30 分钟，也会以 `aged_backlog` 模式发布。
   - 第一轮新规则已经真实触发并部署：**12 篇、49 张正文图**上线。
   - 线上验收最终 success：当前 172 张自动发布正文图全部通过字节/hash/evidence 校验；本批 12/12 张卡片实际可见，所有预期图片均成功解码，label/URL 精确匹配，12/12 都有官方非 fallback TOC，browserErrors=0。
   - 当前站点正文图总数达到 **395 张**。
   - 第一批发布后，下一轮只剩 **2 篇、9 张**合格未发布图；当时最新记录静默 1.17 分钟、最老等待 5.56 分钟，因此正确保持 waiting。系统仍每 5 分钟继续检查；达到 20 篇、15 分钟静默或 30 分钟最老等待中的任一门槛，就继续发布。不是一次性发布。

2. **Bridge 2.2.26 线上已经就绪，但你本机还没真正切过去。**
   - 2.2.26 固定安装包已经通过 dedicated live verifier 和 live-progress verifier。
   - 但最新真实自动报告仍写的是 `controllerRevision=2.2.25`，所以现在看到的 ACS `application/octet-stream`、TIFF、transport failure 等仍是 2.2.25 真机行为，不能用来评价 2.2.26。
   - 2.2.26 主要修的是“正文图发现过早结束”：会等 Figure/Scheme DOM 稳定后再开始抓，避免页面尚未完全加载时就把正文图数量定死。

你现在只需要原位更新到 Bridge 2.2.26：
https://zhou526316-sys.github.io/organic-synthesis-gallery/gallery-vpn-bridge.user.js?v=2.2.26

仍按原来的安全方式操作：暂停当前抓取，等当前出版社任务页关闭；原位更新；**不要卸载旧脚本，不要清空 Tampermonkey 存储、密钥或断点**；刷新唯一 Gallery 控制页后继续。内部 `captureVersion=6.2.20` 保持不变是正常的。

下一步判断也很明确：收到第一批真正的 `controllerRevision=2.2.26` 报告后，重点比较正文图 `discovered/stored` 是否比 2.2.25 更完整；然后再单独处理仍残留的 ACS TIFF/520 px 高清资源问题。服务器端旧暂存正文图发布不需要等你更新 2.2.26，会继续独立向前消费。

本轮 aged-backlog 生产验收已记录在提交 `e56cc28a8a5826e79b5fdab4cddd9cbb9fb26e0f`。
