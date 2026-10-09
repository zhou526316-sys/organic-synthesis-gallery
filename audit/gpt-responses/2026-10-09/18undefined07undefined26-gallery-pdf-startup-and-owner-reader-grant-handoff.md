## Gallery PDF startup & owner-scoped reader grant — approved continuation
Beijing time: 2026-10-09 18:07:26

User approved fixing slow/unreadable owner PDF and enabling a strictly reader-only privilege for a verified second account.
Target email intentionally not placed into public git or workflow inputs; no live entitlement has been modified.

### Durable user-visible intermediate answer
目前两项改动都已完成代码合并：

- PR #449：PDF 首屏加载优化，按需读取第一页，隔离浏览器回归 32/32 通过。
- PR #450：PDF 只读账号授权，站长验证邮箱、撤销和审计，不授予抓取或管理权限。

代码已合并不等于目标账号已获得权限，仍需站长本人通过认证管理界面授予。正式部署和线上验证继续核对。

### Technical evidence
- PDF slow user screenshot: 92.3 s stalled transport with four range requests; authorization 2.318s; engine 109ms.
- Fix commit (PR #449): 196b2614a1810df15da1ef53575f4eeac91f6b68.
- Isolated Chrome first-page run #37914677651: 32/32 success; 2.86MiB synthetic PDF first page 564ms despite later page 5500ms delayed.
- Read-only grant code merge PR #450: 17bffaa8b37e82f7d581fb3a1b4d9d2467874d7a.
- Isolated reader-grants CI #37914882885: success; D1 schema, owner-only grants, read capability only, audit, revoke; signed Range tickets revoked with capability.
- Owner UI: /private-pdf-owner-setup.html, requires existing owner bearer and private_pdf_owner; enter verified email manually and acknowledge sharing rights. It is not a site-wide automatic grant.
- Production Worker deploy #37915186682 and Pages deploy #37915186746 pending/in-progress at time of this record. No claim of live completion.
- Tencent independent PDF TLS still not ready; separate draft PR #420 remains disabled.

### Risk boundaries
- Do not publicly share read capability or embed any real email, user ID, auth bearer, or signed PDF URL in git.
- The existing private_pdf_read permission also enables download, despite its "read" name. Do not claim DRM or per-document limits.
- Third-party sharing of paywalled documents requires the owner to have redistribution rights; manager asks explicit confirmation before grant.
- Do not bypass existing Worker and Pages deployment gates, primary literature schedule, or media integrity checks.
