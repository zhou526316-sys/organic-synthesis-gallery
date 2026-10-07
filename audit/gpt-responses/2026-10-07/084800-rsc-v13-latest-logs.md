# Response synchronization

北京时间：2026-10-07 08:48 +08:00
上下文：RSC v13 部署后最新 Tampermonkey 日志核验。

## Final response

最新日志核验结论：

1. RSC v13 优先重试 workflow 已成功完成，run 37554237736。
   - 两篇 DOI 都已写入 media_jobs 与 media_repair_state。
   - next_retry_at=0。
   - last_root_cause=rsc_v13_priority_retry。
   - reported_priority=1。
   - D1 写入 changes=2 + changes=2。
2. bridge queue 当前已同时包含：
   - 10.1039/d6sc06421c
   - 10.1039/d6gc03161g
   两篇均 status=missing、tocMissing=true、figureCount=0、nextRetryAt=0、reportedPriority=true。
3. 但这两篇最新 Tampermonkey 回执仍是旧客户端：
   - installRevision=6.2.37
   - publisherMediaRevision=20261006-rsc-preview-reject-v12
   - controllerRevision=2.2.41
   - Chemical Science: toc=already_available（旧回执时点）、figures=0/0、PDF=403
   - Green Chemistry: toc=not_found、figures=0/0、PDF=403
4. 全站最新实时回执（10.1021/jacs.6c11144，updatedAt=1791334398679）也明确在 diagnostic_context 中写着 installRevision=6.2.37、publisherMediaRevision=v12。这证明当前活跃浏览器客户端尚未切换到 6.2.38/v13。
5. 线上 canonical userscript 已独立验证为 Bridge 2.2.57，且 bundle 包含 6.2.38 与 20261007-rsc-issue-pdf-v13。当前阻塞点因此是本机 Tampermonkey 更新尚未生效，而不是服务器版本未部署。

下一步：用户需要让当前浏览器 Tampermonkey 更新/覆盖安装 canonical Bridge 2.2.57；更新后两篇优先队列任务即可用 v13 逻辑重跑。
