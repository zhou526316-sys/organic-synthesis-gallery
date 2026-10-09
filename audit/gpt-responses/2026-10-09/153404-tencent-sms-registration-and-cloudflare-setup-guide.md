# Gallery 腾讯云手机号短信开通与 Cloudflare Secrets 配置说明

北京时间：2026-10-09 15:34:04
会话：前端优化 / 用户提问“怎么注册和配置”，对应已合并 PR #437、#438、#440 的手机验证码注册与登录尚未完成腾讯云资质和真实短信启用。

## 核验
- GitHub main docs/user-auth-device-phone-otp.md 与 cloudflare/worker/src/phone-otp.js：生产 Worker 使用 6 个既定变量（名称见用户可见正文）；SMS OTP 请求使用 Tencent Cloud SendSms 2021-01-11，TemplateParamSet 只有一项。
- GitHub main .github/workflows/deploy-worker-frontend.yml：生产 Worker 名为 organic-synthesis-gallery，使用 wrangler.frontend.toml；不得误配置测试 Worker。
- 实时只读 https://api.gczhouwld.com/api/user-ui/integrations：local=true, google=true, email=true, phone=false。
- Tencent Cloud 官方 2026-09-18 实名资质规则不支持个人自用短信签名，个人如有中国大陆企业合法授权可申请他用；国内签名需运营商报备，通常 7-10 工作日或更长。
- 国内签名只支持公司、商标或机构（网站/公众号签名不再支持）。模板只含一个 {1} 变量，官网要求按参数个数发送；Cloudflare Worker Secrets 在 Settings -> Variables and Secrets -> Add -> Secret，完成后 Deploy。
- 不涉及任何用户账号、第三方平台注册、Secret 的真实写入；不得将公用文档当作用户已配置成功的证据。

## 本轮用户可见部分回复
Gallery 的手机号验证码注册功能，代码已经部署，但**腾讯云短信发送通道还没有开通**。要让用户真正收到验证码，需要完成腾讯云短信审核，并将配置安全地接入网站后台。

建议按 **腾讯云注册与实名认证 → 短信资质审核 → 签名和验证码模板 → 创建短信应用与密钥 → Cloudflare 配置 → 实际测试** 的顺序进行。

有一个重要的前提：**腾讯云目前不支持以个人身份申请新的国内自用短信签名**。如果你的腾讯云账号是个人实名，需要提供中国大陆企业的授权资质，或者使用符合要求的企业认证主体。只有个人身份证、没有企业或授权材料，暂时无法直接走通国内短信申请。<Cite refs={["turn305680search0","turn305680search5"]}/>

## 本轮用户可见后续完整正文
### 具体操作

1. **登录并开通腾讯云短信。** 打开 [腾讯云短信控制台](https://console.cloud.tencent.com/smsv2)。已有腾讯云账号直接登录；没有则先注册并完成实名认证。首次进入短信控制台，按照提示同意服务协议，点击“开始接入”。<Cite ref="turn305680search3"/>

2. **申请国内短信实名资质。** 进入“国内短信 → 实名资质管理 → 新增资质”。企业实名认证账号通常选择“自用资质”；个人实名认证账号若有企业授权，可按实际情况申请“他用资质”，准备相应企业证明和授权材料。提交后等状态变为“已通过”。不能使用无权代表的企业资质。<Cite refs={["turn305680search0","turn305680search2"]}/>

3. **申请短信签名和验证码模板。** 在“国内短信 → 签名管理”创建签名，选择符合资质的**公司、商标或机构**类型，不要按旧教程选择“网站/公众号”签名。签名应与真实企业或商标证明相符；例如依法使用的企业简称，而不是直接填未经证明的 Gallery 品牌名称。随后在“国内短信 → 正文模板管理”创建类型为“验证码短信”的模板。<Cite refs={["turn305680search5","turn864391search16","turn850928search2"]}/>

   可以提交以下正文示例（不需要自己输入短信签名的方括号）：

   > 您正在登录 Organic Synthesis Gallery，验证码为{1}，5分钟内有效。如非本人操作，请忽略。

   **必须只有 `{1}` 这一个变量**，因为现有网站后端只传入一项：六位验证码。不要用包含 `{2}` 的双变量模板。模板审核通过后保存其“模板 ID”；签名还需要完成运营商实名报备，通常可能耗时 **7–10 个工作日或更久**。<Cite refs={["turn305680search7","turn850928search0"]}/>

4. **创建短信应用和 API 密钥。** 在“应用管理 → 应用列表 → 创建应用”，应用名称可设为 `Organic Synthesis Gallery`，记录生成的 **SDK AppID**。然后进入 [腾讯云访问管理](https://console.cloud.tencent.com/cam)，建议创建专用子用户并仅授予短信发送所需权限，再为子用户创建 API 密钥。保存其 **SecretId / SecretKey**；SecretKey 创建后不能再次查看。当前网站使用新版短信 API，不需要旧版短信 AppKey。<Cite refs={["turn864391search0","turn850928search1","turn864391search9"]}/>

5. **在 Cloudflare 配置网站后端。** 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，依次进入 **Workers & Pages → `organic-synthesis-gallery` → Settings → Variables and Secrets → Add**。将下表六项逐一添加，类型选择 **Secret**，最后点击 **Deploy**。务必选中这个生产 Worker，而不是测试 Worker，也不要写入公开 GitHub 源码。<Cite ref="turn305680search1"/>

6. **验证是否开通。** 先打开 [Gallery 登录方式状态接口](https://api.gczhouwld.com/api/user-ui/integrations)，检查返回的 `auth.phone` 是否为 `true`。这只表示配置字段齐全，**不代表短信实际能送达**。再到 [Gallery 正式网站](https://gallery.gczhouwld.com/) → 用户中心 → 手机验证码登录，使用获授权的中国大陆手机号完成一次发送、收码、登录测试。新手机号验证成功会自动注册；已有邮箱账号应先登录并在用户中心绑定手机号，避免产生两个账号。

### Cloudflare 需要填的 6 个字段

| 变量名 | 填写什么 |
|---|---|
| `TENCENT_SMS_SECRET_ID` | 腾讯云子用户的 SecretId |
| `TENCENT_SMS_SECRET_KEY` | 腾讯云子用户的 SecretKey |
| `TENCENT_SMS_SDK_APP_ID` | 短信应用的 SDK AppID |
| `TENCENT_SMS_SIGN_NAME` | 已通过审核的短信签名原文，**不含〖〗** |
| `TENCENT_SMS_TEMPLATE_ID` | 已通过审核的单变量验证码模板 ID |
| `SMS_OTP_PEPPER` | 自行随机生成的至少 32 字节高强度字符串，用于服务端验证码哈希 |

最后一项 `SMS_OTP_PEPPER` 可在 Windows PowerShell 本地生成：

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[BitConverter]::ToString($bytes).Replace('-', '')
$rng.Dispose()
```

复制生成的字符串，仅粘贴到 Cloudflare 对应 Secret 的 Value 框。**不要在这里发送 SecretId、SecretKey、验证码或生成的密钥字符串。** 正式开通前也请在腾讯云检查短信额度、费用和告警限额，避免验证码被滥用产生费用。

我刚核对了正式 API，目前仍是 **`auth.phone=false`**。如果你还没办理国内短信资质，优先做第 1–3 步即可，暂时不用配置 Cloudflare。

**你现在的腾讯云账号是“个人实名认证”还是“企业实名认证”？** 这决定了接下来资质申请页面该选择哪条路径。
