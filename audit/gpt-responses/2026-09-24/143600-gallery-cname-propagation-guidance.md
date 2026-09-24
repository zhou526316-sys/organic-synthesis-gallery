Beijing time: 2026-09-24 14:34 +08:00
Context: Confirm newly added gallery CNAME and explain GitHub DNS propagation delay

Reply body:

现在这一步是对的。第二张图里已经明确看到：

- `gallery.gczhouwld.com`
- 类型：`CNAME`
- 目标：`zhou526316-sys.github.io`
- 状态：`DNS only`
- TTL：`Auto`

这正是 GitHub Pages 对自定义子域名要求的配置；目标也正确地没有带 `/organic-synthesis-gallery`。GitHub 官方也说明，DNS 变更可能需要一段时间传播，最长可到 24 小时；Windows 上可用 `Resolve-DnsName` 检查。现在 GitHub 页面仍显示 `InvalidDNSError`，更像是**刚添加记录后的 DNS 传播/负缓存尚未刷新**，不是你这条记录填错了。

现在不要再改 Cloudflare，也不要点 Remove。建议：

1. 先等 5–15 分钟。
2. Windows PowerShell 运行：
   ```powershell
   Resolve-DnsName gallery.gczhouwld.com -Type CNAME
   ```
   正常应看到 `zhou526316-sys.github.io`。
3. 如果 PowerShell 已经能查到，再回 GitHub Pages 点一次 **Check again**。
4. GitHub 显示 DNS check successful 后，继续等 HTTPS 证书生成；`Enforce HTTPS` 变为可选时勾上。

如果 30–60 分钟后 PowerShell 已经能正确解析，但 GitHub 仍然报同一个 `InvalidDNSError`，再发我截图，我继续查 GitHub Pages 侧，而不是继续改 DNS。

PR #200 现在仍应保持 draft，不合并。等 GitHub 这里先变绿，再进行正式切换。

Related PR:
- #200 (draft; do not merge yet)
