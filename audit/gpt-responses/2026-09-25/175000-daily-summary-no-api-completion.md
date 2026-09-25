# Response sync — daily summary no-API completion

- Beijing time: 2026-09-25 17:50
- Context: Tampermonkey / daily reviewed-summary architecture
- Related production commit: 22479cfc53709819eafd8e8ea6ab50f914634214
- Related deploy run: 36120213955

## User-visible response

已完成，这套方案已经正式切换为“每天北京时间 12:00 集中生成并发布摘要”。

当前生产状态：
- Gallery 不再需要 `OPENAI_API_KEY` 来生成摘要。线上 health 已确认 `summaryMode=scheduled_chatgpt_daily_no_api`、`summaryReviewEnabled=false`、`summaryReviewReady=true`。
- Tampermonkey 仍然全天抓 TOC、正文图和 Evidence；抓取完成后只进入待审队列，不会实时调用模型。
- Evidence 仍保存在私有 R2。给 12:00 任务的交接数据已经改成 gzip + AES-256-GCM + RSA-OAEP(SHA-256) 加密，并按小分片读取；公开 manifest 不包含正文，也不包含完整密文。
- 旧 handoff 已加入自动重新加密/backfill。线上已经验证新 keyId、gzip 和分片接口正常，部署 run 36120213955 为 success。
- 每天 12:00 的任务会读取待审 Evidence，逐篇解密，做两遍证据审核，生成中英文摘要，只把通过审核的结果写入 `public/scheduled-article-summaries.json`，随后等待 Worker 部署成功并抽查线上摘要。
- `abstract_only` 只允许生成明确标注“基于 Abstract / Abstract-based”的摘要；`partial` 会说明证据不完整；数字、条件、ee/dr、收率、底物趋势、机理证据等没有 Evidence 支撑就不发布。
- 单篇失败不会阻塞其它文章；失败项留到下一轮继续处理。

相关生产提交：PR #252 已合并；安全/分片加固 PR #254 已合并到 commit `22479cfc53709819eafd8e8ea6ab50f914634214`。

每天 12:00 的正式定时任务已经创建并启用。由于今天北京时间 12:00 已经过，第一轮自动运行时间是 **2026 年 9 月 26 日 12:00**。08:00/18:00 的文献卡片发布机制保持原样。
