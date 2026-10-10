# Project reply sync — Tencent-first PDF priority request

Beijing: 2026-10-10 18:42 Asia/Shanghai.
Conversation: continue PDF full-library / PR #484 owner authorization repair; user asks "既然腾讯线路那么稳定，那能不能优先腾讯线路。"
Related audit: `audit/pdf/2026-10-10-tencent-priority-routing-feasibility.md`, commit `5565279c28769fa2158a0e47300522cf8dd2404d`.
PR #484 merged as `a011c9870d1d1d7fc9c38173c78cbd195862e0ab` with Worker/Pages still in progress at this review, not yet confirmed successful in production.

## Complete user-visible answer (streamed plus terminal, preserved substantially)

**可以把腾讯线路设为 PDF 阅读的优先入口，而且这可能更适合中国用户。**

但不建议直接将所有 PDF 流量无条件切换到腾讯。原因是：腾讯目前通过了部分真实文件请求测试和浏览器模拟测试，尚未证明大量 PDF 在不同国内网络下都能稳定打开；此外，现有腾讯网关还有每月约 256 MiB 的中转流量预算。

更合理的是采用 **腾讯优先、Cloudflare 备用、自动故障切换** 的架构，同时保留账号权限、文件哈希校验和流量保护。

核查后，腾讯优先有两个关键限制：现有网关仍通过 Cloudflare 后端完成账号授权和读取 R2 文件，并不是完全独立的第二套 PDF 存储；而 256 MiB/月的网关预算不适合直接承接所有用户的默认流量。

因此我倾向于先做**管理员账号腾讯优先**，腾讯超时、5xx 或流量配额耗尽时回退 Cloudflare，401/403 权限拒绝则立即停止。待真实手机网络、两页阅读和配额监控验收后，再决定是否扩大到普通授权用户。

**进一步核实**：当前网站的配置仍是 `enabled:false`、`manualCanary:true`。现有代码即使直接打开全站 Tencent 开关，也只是让腾讯成为延迟约 5 秒才可能启动的候选，并不是「腾讯首选」。要真正腾讯优先，必须改变授权请求优先级，同时加上流量配额和失败回退保护。

PR #484 的 PDF 授权修复已合入 `main`，但本轮核查时 Worker 与 Pages 生产部署仍在执行；我不会把合并等同于线上修好。本次没有擅自开启腾讯全站流量。

**请确定实施范围：你希望先仅对管理员账号启用腾讯优先，还是直接对所有已有 PDF 阅读权限的账号启用？** 前者便于先验证实际国内阅读，后者需要先解决月度配额不足的问题。
