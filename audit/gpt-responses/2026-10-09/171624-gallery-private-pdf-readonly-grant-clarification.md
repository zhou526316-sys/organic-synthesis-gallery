# Gallery owner-private PDF read-only grant — follow-up

Beijing time: 2026-10-09 17:16:24
Conversation context: user restricted requested third-party QQ-email access to PDF reading only.
Target email omitted from repository audit for privacy. No account data queried. No change to production permissions or authorization.
Code evidence: cloudflare/worker/src/private-pdf.js defines private_pdf_read, private_pdf_capture, private_pdf_process, private_pdf_owner; only existing owner bootstrap endpoint, no arbitrary-email reader grant.

## User-visible response

确认。目标账号的授权范围严格限定为 **`private_pdf_read`**，不给 `private_pdf_owner`、`private_pdf_capture`、`private_pdf_process` 或任何管理员权限。

需要注意：目前这个权限可以打开和下载**已有的整套站长私有 PDF**，不是仅限在线查看、也不是按单篇授权；涉及付费文献仍须符合相应共享许可。

**目前尚未对该邮箱执行数据库授权**：站点缺少经过站长身份验证的“按邮箱授予只读权限”入口，我也无法直接确认该账号的验证状态。

请确认一下：**这个邮箱已经在 Gallery 注册，并完成邮箱验证了吗？**
