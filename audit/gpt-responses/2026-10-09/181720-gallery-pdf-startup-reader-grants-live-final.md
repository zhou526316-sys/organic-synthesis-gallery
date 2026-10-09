# Gallery PDF startup and owner-scoped reader grant — terminal response

Beijing time: 2026-10-09 18:17:20
Project conversation: Organic Synthesis Gallery PDF performance and verified-account restricted grant.
Main fixes: PR #449 -> 196b2614a1810df15da1ef53575f4eeac91f6b68; PR #450 -> 17bffaa8b37e82f7d581fb3a1b4d9d2467874d7a.
Production: Worker #37915186682 success; Pages #37915186746 success; PDF Vault live #37916315084 success; anonymous grant #37916507305 success.
Account email redacted to avoid publishing a third party's identifier in a public git repository. No live user grant performed; requires authenticated owner action and license confirmation.

## Completed user-visible response (sensitive email redacted)

**正式部署和线上校验已通过。**

[Worker 部署 #37915186682](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37915186682) 与 [Pages 部署 #37915186746](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37915186746) 均成功；[PDF Vault 线上资源核验](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37916315084) 通过，另外 [只读权限接口的公网安全检查](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37916507305) 确认未登录用户不能自行授权。

**现在请使用站长账号登录 Gallery，打开 [PDF 权限管理页面](https://gallery.gczhouwld.com/private-pdf-owner-setup.html)。** 在“PDF 阅读权限管理”区域填写 `[用户在当前会话指定且已确认验证的 QQ 邮箱]`，确认有权分享相应文献，点击“授予阅读权限”。成功后页面应显示“已拥有 PDF 阅读权限”。对方刷新或重新登录 Gallery 后即可使用已授权的站内 PDF 阅读功能。该权限可在同一页面撤销，不包含抓取、处理或管理员权力。

**目前目标账号仍未实际赋权**：这个最后操作需要你的站长登录会话，我无法代替你通过未经验证的管理员身份写入生产数据库。现有 `private_pdf_read` 也允许下载 PDF；它不是只能查看、不能保存的 DRM 限制。

关于加载慢，新版首屏读取策略已正式部署，隔离测试中 2.86 MB PDF 在后续分段被延迟 5.5 秒的情况下，第一页约 0.56 秒可显示。但**你的实际 Edge／校园网络尚未复测**，国内 Cloudflare 传输仍可能很慢；腾讯独立备用网关的 HTTPS 证书问题也尚未解决，不能宣称所有网络都已恢复。
