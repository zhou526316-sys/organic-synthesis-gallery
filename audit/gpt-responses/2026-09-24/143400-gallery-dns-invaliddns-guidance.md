Beijing time: 2026-09-24 14:34 +08:00
Context: Diagnose GitHub Pages custom-domain InvalidDNSError from user screenshots

Reply body:

从这两张图看，原因已经很明确：**GitHub 这边你已经把 Custom domain 填成 `gallery.gczhouwld.com` 了，但 Cloudflare DNS 里还没有 `gallery` 这条记录。** 所以 GitHub 才报 `InvalidDNSError` / `DNS check unsuccessful`。

你现在只需要在第一张图这个 Cloudflare DNS 页面新增 **1 条记录**：

- Type：`CNAME`
- Name：`gallery`
- Target / Content：`zhou526316-sys.github.io`
- Proxy status：**DNS only（灰云）**
- TTL：`Auto`

然后点 **Save**。

注意两点：Target 只能填 `zhou526316-sys.github.io`，**不能**填 `zhou526316-sys.github.io/organic-synthesis-gallery`；也先不要开橙云代理。你现有的 `api.gczhouwld.com` 和 `relay.gczhouwld.com` 都不要改。

保存以后通常等几分钟，再回 GitHub Pages 页面点 **Check again**。正常的话，红色 `DNS check unsuccessful` 会消失；随后 GitHub 会签发 HTTPS 证书，`Enforce HTTPS` 会从 unavailable 变成可用。到那时把 **Enforce HTTPS** 打开。

所以你现在的状态其实是：**GitHub 这一步已经做了，差的就是 Cloudflare 里这条 CNAME。** 你把它加好后截图给我，或者直接告诉我“CNAME 已加”，我继续帮你检查下一步，不要先合并 PR #200。

Related PR:
- #200 (draft; do not merge yet)
