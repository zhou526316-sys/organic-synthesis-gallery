# Gallery 用户登录设备限制与手机验证码（2026-10-09）

## 变更范围
- 同一正式 Gallery 账号最多保留 5 个尚未过期的浏览器/App 登录环境；新登录保留，淘汰最久未活动的旧会话。会话上限由 D1 `trg_gallery_session_five_limit` 原子触发器实施，不能只在前端计算。
- 浏览器在本站 localStorage 保存随机生成的 128 位设备标识，同一设备重新登录不增加槽位；不同浏览器环境分别计数。不采集硬件设备指纹。
- 用户中心提供可查看、手动撤销的登录设备列表。被撤销会话不可再次访问受保护的读写接口。**私有 PDF 会话撤销已通过独立 PR #440 完成审核和部署。新签发的 fast/legacy 在线 PDF 凭证绑定原登录会话，后续分段读取将校验该会话；被强制下线后拒绝继续读取。此前签发的旧凭证仍按原有效期兼容，不能宣称旧凭证也被即时撤销。**
- 手机短信接口：`POST /api/user-ui/auth/phone/start` 与 `POST /api/user-ui/auth/phone/verify`。新 +86 手机号 OTP 验证成功直接注册并登录；已存在手机号直接登录；已登录用户可通过 `purpose=bind` 显式绑定尚未使用的号码，不会自动合并其他账号。
- 旧邮箱密码、邮箱验证码、Google/微信/QQ 等登录方式保留。

## 数据库与发布顺序
1. 先将 `cloudflare/schema.sql` 的幂等 CREATE TABLE/INDEX/TRIGGER 通过既有 Cloudflare D1 schema maintenance workflow 应用到正式 D1。迁移完成前不要部署依赖新表的 Worker 账号代码。
2. 运行 `node --test scripts/test-auth-session-limit.mjs scripts/test-auth-device-issuer.mjs`，再通过既有 Site quality gate / Worker dry-run / 账户与 PDF 专项回归。
3. 确认生产 D1 已存在 user_session_devices、user_phone_links、phone_otp_challenges、phone_sms_send_attempts、user_pdf_ticket_session_refs，随后由原 Worker deployment authority 发布后端和前端；校验 login/session/sessions 及带权限 PDF Range。
4. 腾讯云短信资质、签名、模板、环境密钥未准备好时，`integrations.auth.phone=false`，不允许短信发件或手机号登录。旧登录继续工作。正式配置完成后再真实手机验收，不能伪报已成功发件。

## 腾讯云短信配置（仅服务端，不要向 GitHub 写入真实密钥）
用户须开通国内短信并通过主体资质、短信签名和验证码模板审核。签名需与申报资质匹配；模板必须只有 **1 个参数占位符**（六位验证码）。

在 Cloudflare Worker **Secrets** 配置以下字段；仅使用中文占位说明，不将任何真实密钥记录到仓库：
- `TENCENT_SMS_SECRET_ID`：填写经授权的腾讯云 API SecretId。
- `TENCENT_SMS_SECRET_KEY`：填写对应腾讯云 API SecretKey。
- `TENCENT_SMS_SDK_APP_ID`：填写腾讯云短信应用 SdkAppId。
- `TENCENT_SMS_SIGN_NAME`：填写已审核通过的短信签名原文。
- `TENCENT_SMS_TEMPLATE_ID`：填写已审核通过、只有一个验证码参数的模板 ID。
- `SMS_OTP_PEPPER`：填写随机生成的长字符串，仅供服务端验证码 HMAC 和频控哈希使用。

不要暴露 `SMS_OTP_PEPPER`，不要在代码中插入真实 API Key、实际验证码或真实手机号。账号资料只向已登录用户返回脱敏手机号。腾讯云 API 调用使用官方 SendSms 2021-01-11、TC3-HMAC-SHA256；正式文档：https://cloud.tencent.com/document/product/382/55981 。

验证码：6 位，一次使用，5 分钟有效，60 秒发送冷却、每手机号每小时最多 5 次、每来源 IP 每小时最多 20 次，错误输入最多 6 次。失败不记录验证码与真实手机号至日志。

## 兼容性与风险
- 未过期旧登录同样纳入上限；非真实设备指纹，浏览器清空站点数据会被认为是新设备。
- 在 PR #440 发布前已签发、未绑定会话的旧 PDF 凭证维持原有效期；老版连续阅读凭证的绝对有效期最长 90 分钟。新凭证按原会话撤销，用户已下载的本地文件不受远程撤销影响。
- 如果 SMS 资质尚未获批、短信配额不足或 Tencent API 故障，登录页只能展示尚不可用状态，不应误称功能正式上线。

## 2026-10-09 发布验收
- 数据库保护 PR #437、D1 迁移运行 37889567444：成功。
- 账号功能 PR #438：20/20 项 CI 成功，生产 Worker 运行 37891130014 成功，正式 Pages 运行 37891130021 成功，后续 Tampermonkey 合并后的 Pages 运行 37891611357 亦成功。
- PDF 会话撤销 PR #440：7/7 项 CI 成功；Worker 运行 37893141558 成功（61 步）。新 PDF Range 请求增加恰好 1 次索引化会话有效性校验；仍需未来真实大文件性能观察。
- 线上只读观察：D1、R2、私有 PDF 服务正常，匿名设备列表拒绝访问（401），`integrations.auth.phone=false`；国内短信签名、模板和凭证未配置，不得声称真实短信发件已可用。
