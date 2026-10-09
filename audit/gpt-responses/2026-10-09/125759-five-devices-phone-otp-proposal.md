# Gallery auth 5 devices + SMS OTP: verification and approval hold

北京时间：2026-10-09 12:57:59

用户原话：我认为一个账号最多能登陆5个设备，多了就强制其中一个下线。以及加上手机号和验证码的快速注册和登陆流程。



## Read-only code evidence

- cloudflare/schema.sql user_sessions fields are token_hash, user_id, created_at, expires_at, with no device_id and no last_seen_at; users.email is nullable.

- cloudflare/worker/src/integrations.js creates user_sessions in exchangeAuth and createUserSession, has no limit, existing revokeOtherSessions is a manual all-other-sessions logout; integrationStatus has no sms capability.

- src/user-ui/library-shell.ts has password login, email verification, existing manual revoke-other-sessions, but no phone login; refreshSession should distinguish confirmed revocation from network loss.

- cloudflare/worker/src/user-ui.js authenticates account library mutations from user_sessions token_hash. Deleted sessions deny new authenticated requests.

- cloudflare/worker/src/private-pdf.js supports stateless PDF fast tickets and legacy D1 tickets independently of the current login session; must prevent residual PDF access after kicked session while preserving range performance.

- Tencent Cloud current SMS docs require reviewed identity qualification, sender signature and verification template; self-service individual qualifications are restricted; relevant docs: https://cloud.tencent.cn/document/product/382/108274 and https://cloud.tencent.cn/document/product/382/37745.

- Cloudflare D1 batch docs indicate multiple statements run as a transaction with rollback on failure: https://developers.cloudflare.com/d1/worker-api/d1-database/.



## Proposed features

- Maximum 5 concurrent active browser/app identities per account, session lease refreshed on login; sixth log-in evicts the least recently active other browser/app identity; no invasive fingerprinting.

- One central atomic session issuer for password, social, email and mobile; migrate legacy session rows safely, concurrent sign-ins never exceed 5, same browser re-login reuses device slot.

- Device center displays active entries, marked current, last seen, revoke individual; client safe logout on revoked sessions, not on transient API outage; preserve unsynced local state.

- SMS OTP +86 with 6-digit one-time 5-minute code, 60s cooldown, invalid attempt threshold, per-IP and per-phone rate controls, non-enumerating error response, validated ownership and explicit bind flow; no silent cross-account merges.

- SMS delivery only activated once provider qualification, sender, templates and server-side secrets are configured, retain existing login methods.

- Verify 1 through 6 sign-ins, concurrent sign-ins, same browser, revoked API and PDF ticket, OAuth, password reset, anti-replay, abuse protection, fail-closed provider offline, mobile and desktop UI; release only after live acceptance.



## Scope and approval

User request recorded, no changes made to login code, D1 schema, sessions, SMS provider, deployment or feedback resolution. The precise automatic eviction rule and Tencent SMS provider are proposed defaults, awaiting explicit approval under PROJECT_RULES.md.



## User-visible reply

这两项可以一起做成 Gallery 的**账号安全与快速登录升级**。已经核对现有代码：目前**尚未实现设备上限，也没有短信登录接口**，原有账号体系需要保留。

**设备限制：**建议每个账号最多保留 5 个有效登录设备。第 6 个设备成功登录时，自动下线**最久未活动的旧设备**，而不是随机踢人。用户中心增加“登录设备管理”，可查看当前设备、最后活动时间，手动退出任一旧设备。设备按浏览器/App 的独立登录环境识别；同一电脑上的 Edge、Chrome 算两台，不使用侵入性硬件指纹。

**手机号快速注册/登录：**默认支持中国大陆 +86，填写手机号并获取 6 位短信验证码；新号码验证成功即注册并登录，已注册号码直接登录。验证码建议 5 分钟有效、60 秒后可重发，限制错误尝试和发送频率。现有邮箱用户可在登录后验证并绑定手机号，原有收藏、备注、阅读状态和权限保持不变；不同账号不会仅凭手机号或邮箱相似而被自动合并。已有邮箱密码、邮箱验证码及第三方登录继续保留。

**需要一起处理的安全细节：**当前 D1 会话表只有令牌与有效期，且账号密码登录和第三方登录分别签发会话；需要统一设备限额并保障并发登录时也不会超过 5 个。被下线设备的受保护 API 要立即拒绝访问，前端在下一次检查时显示明确的退出原因；已签发的私有 PDF 临时阅读凭证也需要相应撤销机制，避免“页面退出、凭证仍可用”。

**短信服务前置条件：**建议优先接入腾讯云短信，因为网站主要面向中国用户且已有腾讯云资源。腾讯云国内短信目前需要实名资质、短信签名和验证码模板审批；个人主体办理国内自用签名存在限制，可能需要企业或授权资质。短信服务审核和密钥配置完成前，保留原有登录，不显示不能使用的“发送成功”。官方说明：https://cloud.tencent.cn/document/product/382/108274 与 https://cloud.tencent.cn/document/product/382/37745。

**本轮已完成现有实现核查，但没有改动生产登录、数据库或设备会话。** 涉及强制下线和新的账号验证渠道，按之前的项目规则，先由你确认实施策略。

**是否批准按“第 6 台登录自动下线最久未活动设备 + 腾讯云短信验证码”实施？**