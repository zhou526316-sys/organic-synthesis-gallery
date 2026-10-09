# Gallery 前端账号五设备、手机号短信及私有 PDF 会话撤销上线验收

北京时间：2026-10-09 14:27:39
上下文：Gallery 前端优化工作线。用户批准“最多五台设备，第六台自动踢最久未活跃 + 腾讯云短信验证码”；后续用户说“继续”，本轮完成原账号 PR 上线以及独立 PDF 安全补丁。

## 本次真实部署与约束
- D1 schema PR #437 merged as 84c7620f205668b98df7a94e367e01753270a369; maintenance run 37889567444 completed success.
- Account feature PR #438 merged as 5169ea88387c8b7df834ef9a0ec0ab4a408cdd9a; exact merged code had 20/20 CI workflows successful; Worker deploy run 37891130014 success; Pages 37891130021 success; Worker frontend sync run 37891130035 success.
- Later main Tampermonkey commit 3ccbc574... was deployed successfully by Pages run 37891611357 and Worker run 37891611368; comparison confirms no replacement of auth files.
- Independent private PDF revocation PR #440 merged as fc4081d283b0b673470eb89d2a1ab250bcb1e554 after 7/7 final checks; production Worker run 37893141558 completed success with 61 steps. No PDF bytes or frontend reader change.
- Current production GET /api/_healthcheck reports ok=true, d1=true, r2=true, privatePdf.bucket/readEnabled/captureEnabled/processingEnabled/fastTicketEnabled all true; anonymous GET /api/user-ui/auth/session returns authenticated=false; anonymous GET /api/user-ui/auth/sessions returns HTTP 401.
- Current live /api/user-ui/integrations.auth: local=true, email=true, google=true, wechat=false, qq=false, phone=false. SMS is intentionally not enabled without approved provider signature/template and secure server secrets; no actual SMS send has been attempted.
- PDF newly issued fast and D1 fallback tickets bind to the originating bearer session; subsequent Range requests check active session before R2 read. Previous unbound fast-view tickets may continue to function up to their original 90-minute absolute lifetime; already downloaded local PDFs are unaffected.
- Tests were repository CI plus read-only production anonymous/API checks; not a real six-phone/user-account trial or real paid SMS test. Do not claim such tests were completed.
- Project governance: one official 08:00 literature admission slot only; no 18:00 revival, Tampermonkey capture or media inventory modified by these auth changes.

## User-visible partial responses (substantially exact)
### Part 1
账号升级已取得新的进展：**PR #438 最终合并版本的 20 项 GitHub 工作流检查全部通过**，包括设备数量限制、短信验证码逻辑、前端编译、Worker 检查、PDF 兼容性和浏览器交互回归。

此前 PR #437 的数据库迁移也已部署成功。现在可以进入账号功能的正式合并与上线验收阶段。

### Part 2
账号功能 [PR #438](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/438) 已通过全部检查并合并至 `main`，提交为 `5169ea88387c8b7df834ef9a0ec0ab4a408cdd9a`。

现有发布流程已自动启动 Worker 和 GitHub Pages 部署。下一步重点是确认正式网站和 API 都更新到这一版本，并验证旧登录方式没有受到影响。

### Part 3
**生产 Worker 部署已成功**：[运行 #37891130014](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37891130014)。

正式 API 已确认运行正常，并返回新增的手机号登录配置状态。目前 `phone=false`，表示短信渠道尚未开通，因此不会向用户错误地宣称验证码可以发送。现有邮箱和 Google 登录渠道仍保持可用。

### Part 4
**正式网站的前端部署也已成功**：[GitHub Pages 运行 #37891130021](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37891130021)，对应的 Worker 前端同步检查同样成功。

至此，设备上限、设备管理界面和手机号登录的程序部分已经进入正式发布链路。手机号短信仍需腾讯云配置后才能实际发送验证码。

### Part 5
私有 PDF 会话撤销补丁 [PR #440](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/440) 的首轮 **7 项工作流检查全部通过**。我已将它安全地合并最新 `main` 的非相关改动到开发分支，保留了并行的文献和架构更新。

补丁的正式合并仍要等待这次同步后的最终检查，避免在 PDF 权限上绕过质量门槛。

### Part 6
PDF 权限补丁 [PR #440](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/440) 已在 7/7 项检查通过后正式合并，提交为 `fc4081d283b0b673470eb89d2a1ab250bcb1e554`。

它会让**新签发的在线 PDF 凭证随原登录会话撤销而失效**；已有的旧凭证保留原有限期兼容。正式 Worker 部署已触发，尚待上线回执确认。

## User-visible terminal final response
**正式验收结果**：独立 PDF 安全补丁 PR #440 已成功部署，Worker 运行 #37893141558 的 61 个步骤全部通过。再次检查线上 API，D1、R2、私有 PDF 读取和处理服务均正常；未登录用户查询登录设备返回 401。

本轮已交付：**最多 5 个有效登录环境，第 6 个登录自动下线最久未活动的设备**；用户中心可查看并手动退出设备；新增手机号验证码注册、登录及已登录账号绑定流程；新签发的在线私有 PDF 链接会随着原登录会话失效而拒绝后续读取。旧版 PDF 链接仍可能在原有效期内使用（连续阅读最长 90 分钟），已经保存到本地的 PDF 不会被删除。上述核心流程有自动化回归，但没有冒用真实用户账户进行六设备实操。

**唯一尚未开通的是实际短信发送。** 正式 API 目前返回 `phone=false`，现有邮箱及 Google 登录仍可用。下一步需要在腾讯云完成国内短信主体资质、签名和单参数验证码模板审核，并把 6 项服务端配置安全写入 Cloudflare Worker Secrets（见 [账号部署文档](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/docs/user-auth-device-phone-otp.md)）。请不要把 SecretId、SecretKey 或验证码发到聊天中。配置完成后再用经同意的手机号进行真实短信验收；短信发送会产生腾讯云服务费用。

这次没有调整每天 08:00 的正式文献上线任务，也没有覆盖 Tampermonkey 的并行修复。
