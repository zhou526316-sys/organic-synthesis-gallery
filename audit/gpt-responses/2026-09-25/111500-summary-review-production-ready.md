# GPT response sync

Beijing time: 2026-09-25 11:15
Context: Evidence v2 + GPT reviewed-summary production readiness
Related main before sync: 38599d55e265b63ddd298c58208f5ec93efd058b

当前执行状态：
- Bridge 2.2.32 / Evidence v2 已生产上线并通过 live verifier。
- Tampermonkey 当前用户端最近报告仍为 2.2.31，因此需原位更新到 2.2.32。
- GPT reviewed-summary 后端已部署：gpt-5.6-terra Draft -> deterministic validation -> gpt-5.6-sol Audit -> approved cache。
- Responses API 使用 store:false + strict json_schema Structured Outputs；public summary GET 仍只读。
- PR #240 已合并，审计状态一致性及 OpenAI response/usage provenance 已修复。
- 生产 SUMMARY_REVIEW_ENABLED=1、SUMMARY_ALLOW_UNKNOWN_POLICY=1；OPENAI_API_KEY 当前仍未配置，因此 GPT 调用安全禁用。
- OpenAI Platform key setup 已启动，可用 Personal / Default project；原始 key 不进入聊天。
用户下一步：
1) Tampermonkey 原位更新：https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js
2) 在 OpenAI key setup 中创建 Organic Synthesis Gallery summaries key。
3) GitHub 仓库 Settings -> Secrets and variables -> Actions -> New repository secret，Name=OPENAI_API_KEY，粘贴该 key。
4) 不需要设置 SUMMARY_* 变量；默认已启用。
用户回复“已添加”后：更新 WORKER_FRONTEND_REFRESH 触发 Worker 部署，验收 review-status 与首个 Evidence -> Draft -> Audit -> public summary 链。
