# D1 quota fix deployment status

Beijing time: 2026-09-23 20:52
Context: Gallery statistics backend / Cloudflare D1 quota remediation

这批已经完成，而且现在可以确认：**确实是 Cloudflare D1 免费额度打满，不是推测。**

GitHub Actions 的真实日志返回了：

> `Your account has exceeded D1's free tier daily row read limit.`  
> `code: 7500`

也就是说，当前 D1 的每日 rows-read 已耗尽，所以统计接口以及依赖 D1 的部分动态功能会在今天剩余时间继续返回 500/1101；免费额度要到 **UTC 00:00，也就是北京时间明天 08:00** 重置。

已经完成的修复：

- 给 `paper_open_readers_v3(ip_hash)` 新增了专用索引，避免统计查询按 IP 关联时反复扫描整张 reader 表。这个 schema 步骤已经在生产 D1 上**成功执行**。
- `site-stats.html` 已从旧的 `workers.dev` 地址切换到正式 API：`https://api.gczhouwld.com`。
- 删除了后台原来的 `setInterval(load, 60000)`，现在只在首次打开时读取一次，之后只有你主动点击“刷新”才会重新查询 D1。
- `site-stats` 和 `reader-stats` 已拆开容错。以后即使阅读统计单独异常，PV/UV 页面也不会整页卡死；反过来也一样。
- GitHub Pages workflow 现在会监听 `public/site-stats.html` 的改动，之后修改后台页会自动重新部署，不需要额外手工触发。
- 新版 GitHub Pages 已部署成功，run `35862598872` 为 success。

对应提交：
- `335ab809` — reader IP 索引
- `25be65d0` — 正式 API + 删除一分钟轮询 + 分开容错
- `f95ce58a` — 后台页改动自动触发 Pages

需要注意：Worker 部署流程最后显示 failure，但**不是修复失败**。日志显示 schema 已应用成功、Worker 也已部署成功；失败发生在后面的注册冒烟测试和清理步骤，因为那时 D1 已经正式触发每日 row-read 限额，所以所有后续 D1 查询都被 Cloudflare 拒绝。

因此现在最合理的做法是：**今晚不要再反复刷新统计后台。** 等北京时间明天 08:00 配额重置后，再做一次生产验收。届时重点检查后台是否恢复、`reader-stats` 是否恢复，以及优化后 rows-read 是否明显下降。

我暂时没有做“按天预聚合表”，因为先验证这轮低风险优化是否已经足够；如果明天仍然消耗过快，再进入第二阶段，把 PV/UV 趋势改成预聚合，基本可以把统计页读取成本再压一个数量级。
