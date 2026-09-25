# GPT Response Sync

- Beijing time: 2026-09-25 17:31:41 +08:00
- Context: Tampermonkey daily 12:00 no-API summary migration and scheduled publication
- Related commits: 6d0bc66cf3ef1ce2981e4d590fad041a49676979, f08ea05dd86ddd5ec7d435d7efc493d1b749077c
- Deployment run: 36118402851 (success)

## User-visible reply

已经按你确认的方案全部切换完成。

现在 **Gallery 摘要不再依赖 `OPENAI_API_KEY`**。Tampermonkey 2.2.34 继续全天抓 TOC、正文图和文字 Evidence；Evidence 仍只保存在私有 R2。系统只向每日摘要任务提供经过 **RSA-OAEP + AES-256-GCM** 加密的 handoff，出版社正文不会以明文暴露到公开接口或 GitHub。

每天 **北京时间 12:00** 的摘要任务已经创建并启用，首次执行是 **2026 年 9 月 26 日 12:00**。它会读取当天待审加密 Evidence，在任务内部解密，按我们现有的文献阅读标准生成中英文摘要并做第二遍证据审核；通过后只更新 `public/scheduled-article-summaries.json`，随后触发网页部署。证据不足、数字冲突、机理无法确认或解密失败的文章会跳过并留到下一轮，不会为了赶 12 点强行发布。

历史积压也已经接上：旧 Evidence 的加密 backfill 已部署成功，线上 handoff 已实际出现加密待审条目；部署 run **36118402851** 最终为 success。核心切换对应提交为 `6d0bc66`，历史 Evidence backfill 为 `f08ea05`。

原来的 **08:00 / 18:00 文献卡片发布机制完全不变**。12:00 只发布“派生摘要”，不会新增、删除或重分类文献，也不会改 TOC demand。以后正常流程就是：**全天抓取 → 次日/当日 12:00 集中审核摘要 → 审核通过后上线**。
