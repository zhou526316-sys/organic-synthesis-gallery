# 个人从零搭建：账号与环境清单

## GitHub
1. 注册账号并开启 2FA。
2. 新建仓库。
3. AI Connector 能 OAuth 时优先 OAuth，不要把 PAT 发给 AI。
4. 本地脚本确实需要 Token 时，创建 Fine-grained PAT，只给目标仓库最小权限。
5. Token 存环境变量或 GitHub Actions Secrets，不提交仓库。

## 域名
1. 可先不用域名，先让 GitHub Pages 跑通。
2. 需要正式分享时购买域名。
3. 在 GitHub 仓库 Settings → Pages 添加 custom domain。
4. 再到 DNS 服务商配置对应记录；子域通常使用 CNAME。
5. 等 HTTPS 正常再作为正式入口。

## Cloudflare
推荐用于 DNS、Worker、R2。
1. 注册 Cloudflare。
2. 添加域名并核对 DNS。
3. 需要时按提示修改 nameserver。
4. R2 → Create bucket。
5. Worker 内部访问 R2 时优先用 R2 binding。
6. 外部脚本需要 S3-compatible API 时才创建 R2 API Token。
7. Access Key ID / Secret Access Key 创建后立刻保存到密码库或 Secrets；不要发给 AI。

## 微信公众号
1. 注册公众号并完成平台要求的管理员/主体验证。
2. 在开发者设置中确认 AppID/AppSecret 与接口权限。
3. AppSecret 由用户本人放入安全 Secrets，绝不贴给 AI。
4. 先探测 access_token，再素材上传，再草稿，再单独检查发布权限。
5. “能写草稿”不等于“有自动发布权限”。

## 本机
建议安装：
- Git
- Node.js LTS
- Python 3.11+
- Chrome 或 Edge
- Tampermonkey（只有需要 Browser Bridge 时）
- VS Code
- 可选 Wrangler CLI

检查命令：
~~~
git --version
node --version
npm --version
python --version
~~~

## 环境变量模板
只放变量名：
~~~
GITHUB_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=
WECHAT_APP_ID=
WECHAT_APP_SECRET=
WECHAT_API_BASE=https://api.weixin.qq.com
~~~

.gitignore 至少包含：
~~~
.env
.env.*
*.secret
secrets/
~~~

## 微信接口最小探测
1. access_token；
2. 修好 IP 白名单/权限/secret 后再继续；
3. 上传测试图片/封面；
4. 创建明显标 TEST 的草稿；
5. draft/get 回读；
6. 删除测试草稿；
7. 再接真实文章；
8. 发布接口单独探测。

## VPN / Browser Bridge
只有需要机构订阅时才做。
用户：安装官方 VPN/aTrust，手动确认出版社可访问，安装 Tampermonkey，遇到 CAPTCHA/二次认证本人完成。
AI：生成缺口队列和 Bridge，不读取密码，不绕过访问控制，自动提取 DOM/上传，失败跳过继续。

## 上线前
- 仓库无 Secret；
- Pages 构建正常；
- 自定义域 HTTPS 正常；
- 状态文件存在；
- 可回滚；
- 至少一次 dry-run；
- 至少一次手机验收；
- 微信草稿先人工验收一段时间，再决定是否扩大自动发布权限。
