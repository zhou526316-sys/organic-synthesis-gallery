# User-facing response sync — mainland tests and pending PDF read access

Beijing timestamp: 2026-10-09 17:09:45
Context: Organic Synthesis Gallery — user requested China multi-ISP network probes and PDF reader entitlement for a named QQ email.
Email intentionally redacted/omitted from public audit where possible; target provided in current private chat, not written into repository code, trigger, or DB.
Production permission change: none.
Rationale: no owner-authenticated read-only grant endpoint; identity/email verification and legal account ownership not yet established; private_pdf_read grants entire owner-private PDF library.
China probe evidence: ITDOG run 5a335360... blocked by CAPTCHA; 17CE healthcheck e5ec4439... 181 nodes, carrier averages ~2.23s/3.26s/2.26s with some timeouts; 17CE public reader e4d268c6... untrustworthy identical node timing; none tested authenticated PDF downloads.
Audit source: audit/pdf-reader/2026-10-09-china-network-and-entitlement-readonly-check.json.

## Earlier user-visible content (sensitive email elided)

我已核对 PDF 权限机制：private_pdf_read 并非只允许阅读某一篇论文，而是可以访问站点现有的整套私有 PDF 文献库。它与普通用户保存的本地 PDF 权限不同。

目前系统只有经过验证的站长账号绑定流程，没有可以直接按邮箱安全添加只读用户的现成管理接口。因此，指定邮箱暂时还没有被授予权限；需要先确认账号及授权范围，避免意外开放整个私有文献库。

中国大陆网络测试会独立进行，不涉及任何私人 PDF 内容或登录凭据。

## 中国大陆网络实测结果

第二家测速平台 17CE 成功执行了中国大陆多节点测试，目标为 Gallery 公开的 https://api.gczhouwld.com/api/_healthcheck。

2026 年 10 月 9 日 · 181 个监测节点 · 覆盖多个地区和运营商

| 运营商 | 平均响应时间 | 最慢节点 |
|---|---:|---:|
| 中国电信 | 2.23 秒 | 8.79 秒 |
| 中国联通 | 3.26 秒 | 8.49 秒 |
| 中国移动 | 2.26 秒 | 9.04 秒 |

测试中有节点成功返回 HTTP 200，也出现了 CURLcode:28 超时和下载耗时异常，无法据此认定全部节点成功。

这说明国内访问 Cloudflare 的延迟确实值得重视。连只有约 0.45 KB 的健康检查都可能需要数秒，PDF 的多次分段请求就更容易出现累积等待。不过，这次测试没有传输真实 PDF，不能直接推算 PDF 的下载速度。

查看 17CE 测试执行记录：https://agent.tinyfish.ai/runs/e5ec4439-6610-4036-8a9c-05f4770c3973

## Final continuation

对公开 PDF 阅读器 `https://gallery.gczhouwld.com/pdf/` 也进行了第二次 17CE 检测，返回了 HTTP 200；不过工具给出的 181 个节点耗时完全相同，明显不足以当作可靠的逐节点测速证据。我将这一项只记录为公开页面可访问的辅助信息，不据此判断真实 PDF 文件的下载速度或“全国都能访问”。[公开页面测试记录](https://agent.tinyfish.ai/runs/e4d268c6-a77f-48ea-a9e4-543a38e13786)

关于账号权限：我检查了 `user_capabilities` 和私有 PDF 服务端。**目前没有可直接按邮箱安全添加第二个只读账号的管理接口，我也尚未验证该地址在 Gallery 的注册及邮箱验证状态，因此没有修改权限。** 现有站长权限会开放整套私有 PDF，而系统原有规则要求不同账号的付费文献权限隔离。直接按一个邮箱在数据库中赋权不符合这套安全规则。

**请确认：`[user-provided QQ email]` 是你本人控制，并已在 Gallery 完成邮箱验证的第二个账号吗？** 如果是，我会按站长本人验证、只授予阅读、可以撤销和审计的方式推进，不给它 PDF 抓取、处理或管理员权限。
