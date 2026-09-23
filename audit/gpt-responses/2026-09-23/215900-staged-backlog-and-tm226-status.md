# GPT response — staged body backlog publication + Bridge 2.2.26 status

- Beijing time: 2026-09-23 21:59
- Context: TOC/body-image Tampermonkey capture continuation; continuously publish previously staged body figures; Bridge 2.2.26 real-client validation
- Related commits: 373a68b69b1ef0ebdc3411bb888e35a4b8c29cba, b6b98ce4616aac630e7f67c2b8d875f43bf1c7e4, 2e27955d58b4a77421aa10206cc0f763eeeeaddc, e56cc28a8a5826e79b5fdab4cddd9cbb9fb26e0f

继续完成了。这一轮有两个明确结果。

**第一，之前暂存的正文图现在会持续上线，不再被持续进入的新图“饿死”。** PR #180 已合并到 main。发布规则现在是：
- 20–25 篇合格文章：优先立即发布；
- 少于 20 篇且连续 15 分钟没有新的合格图进入：按 quiet tail 发布；
- 即使 Tampermonkey 一直在抓新图，只要最老的合格、尚未公开的 staging 记录已经等待 30 分钟：触发 `aged_backlog` 发布，并优先消费这些旧暂存记录。

官方 TOC、同 DOI/source 绑定、当前 generation、SHA256、浏览器图片解码、每卡最多 10 图、单批最多 25 篇/250 图这些限制都没有放松。

这个规则已经不是只通过测试，而是完成了第一次真实生产发布。该批的生产状态为：
- `releaseMode = aged_backlog`
- `eligibleIdleMinutes = 3.68`，说明当时新图仍在持续进入；
- `oldestEligibleAgeMinutes = 57.13`，超过新的 30 分钟上限；
- 发布 **12 篇、49 张正文图**；
- `held = 0`；
- 12 篇全部存在官方 TOC；
- 自动发布快照现有 172 个文件；
- 当前生产 media-index 共 395 个正文图条目。

第一次 live verifier 因为仍硬编码“少于 20 篇就是失败”而报红，但逐文件 SHA256 实际全是正确的。我随后只修了 verifier，使它按 `target_batch / quiet_tail / aged_backlog` 三种合法模式分别校验，未降低任何文件、TOC 或身份门槛。重跑后 live acceptance **success**：172 个自动发布文件全部通过字节身份检查，12 个本批卡片全部实际渲染，12 个官方 TOC 配对通过，`browserRenderingVerified=true`，`browserErrors=[]`。

发布完成后下一轮 backlog consumer 已经自动再次运行：`inspect=success`、`publish=skipped`。这说明刚刚的 49 张不会重复发布；5 分钟调度继续保留，以后旧 staging 和新抓取都会按上面三条规则持续出队。

**第二，Bridge 2.2.26 已经线上部署并通过固定安装包验收，但你的本机实际仍在跑 2.2.25。** 2.2.26 的线上 live verifier 已全部通过：installer version、controller、capture protocol、TIFF/currentSrc fallback、队列顺序、跨 DOI guards、no-eval 全部为 true。

2.2.26 这次解决的是另一类问题：ACS 正文图 lazy-load 较晚时，2.2.25 可能因为 TOC 先出现而过早结束正文图发现。2.2.26 对正文任务加入了更稳定的发现窗口：正文任务至少观察约 8 秒，并要求最后一次 Figure/Scheme 集合变化后再静默约 4 秒；如果始终没有正文图，则保留有界的约 18 秒观察窗口。它没有降低图片清晰度门槛，也没有放松 TIFF/currentSrc 的身份约束。

我又检查了最新自动报告索引：已经有 182 个 DOI，其中 146 个 DOI 有自动报告。但那个名为“read first actual Bridge 2.2.26 client reports”的任务标题具有误导性——逐条解析实际报告后，**0 条是 2.2.26，当前最新真实 context 全部仍是 `controllerRevision=2.2.25`**。因此现在不应该继续做 2.2.27。

你现在只需要把本机脚本再次原位更新到 2.2.26：

https://zhou526316-sys.github.io/organic-synthesis-gallery/gallery-vpn-bridge.user.js?v=2.2.26

仍按原来的安全顺序：暂停当前抓取，等当前出版社任务页关闭；原位更新；不要卸载旧脚本，不要清空 Tampermonkey 存储、密钥或断点；刷新唯一 Gallery 控制页后继续。看到脚本版本 **2.2.26** 即可；内部继续显示 `captureVersion=6.2.20` 是正常的。

下一步判断标准保持严格：必须先收到真实 `controllerRevision=2.2.26` 报告，再比较 Figure/Scheme discovery 数量、完整成功率以及仍残留的 TIFF/520px 问题。在此之前不继续盲升版本。
