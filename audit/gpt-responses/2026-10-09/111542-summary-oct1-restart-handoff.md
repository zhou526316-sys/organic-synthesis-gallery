# Gallery 摘要重新上线：10 月 1 日起新收录文献

北京时间：2026-10-09 11:15:42。对应项目会话：抓取有机合成文献并持续更新网页 / “10月1日之后的摘要可以上线了，毕竟大部分都有PDF正文了”。

## 本次已告知用户的进展与最终处理结果

用户授权恢复 2026 年 10 月 1 日（含）以后 **Gallery addedDate** 新收录文献的双语摘要；不以首次在线发表日期、Evidence 捕获日期或 PDF 存储日期替代收录日期。摘要是可独立更新的派生数据；不触碰每天北京时间 08:00 唯一正式 DOI 新增槽、权威文献、TOC/Tampermonkey、私有 PDF、账户状态或其他项目独立任务。

核对 2026-10-09 main 的 `public/toc-demand-live.json` 和 `public/scheduled-article-summaries.json`：
- Gallery 现有 915 篇文献；
- 有合法 `addedDate >= 2026-10-01` 的 205 篇；
- 旧静态摘要文件中，其中 75 篇有 `status=approved` 记录、130 篇无已批准摘要记录；这不等于 75 篇当前都与最新 Evidence 哈希匹配或在线可用。
- 本次**完整、最新的加密证据交接**结果更权威：当前哈希匹配、可复用摘要 **22** 篇；有已捕获正文 Evidence 待更新或双重审核 **181** 篇；无现有文本 Evidence **2** 篇；encrypted handoff 下载/封装失败 **0**。这 181 篇已全部被加密交接，不能声称它们已经生成或发布摘要。

PR #427 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/427 已通过摘要后台回归及必需 Site quality gate，并合并为 `998fb83b170379c6c9364d3371a028974dd43509`。涉及：
- `audit/summary-publication-policy.json`：最低 Gallery `addedDate` 改为 2026-10-01；
- `docs/scheduled-summary-contract.md`：新增日期逻辑、私有 PDF 不等于已可读取的正文证据、partial/abstract-only 必须揭示覆盖不足；
- `.github/workflows/summary-evidence-handoff.yml`：按实际存在且合法的 `addedDate` 枚举、按收录日期降序、仅交付加密 Evidence；增加 18 分钟上限；
- `.github/workflows/summary-review-ci.yml` 和 `scripts/test-summary-oct1-scope.py`：覆盖收录日期和预览、原有摘要后台回归；
- `audit/summary-handoff-request.json`：单次请求为该范围准备最新 Evidence。
无文献卡片、原始 PDF、图像或公开全文数据变更；无 RSA 私钥、密文正文或内部凭证进入 Git。

已恢复既有、此前停用的 ChatGPT 自动化 **“Gallery 摘要发布”**，自动化 ID `6ab643d6a5908191894383790814884f`，时间仍是**每日北京时间 12:00**，没有创建竞争性定时任务。正式 API 健康检查通过，服务模式为 `scheduled_chatgpt_daily_no_api` 且 `summaryReviewReady=true`。既有 DOI 的线上摘要读取证实 available/published；最新未审 DOI 则返回 evidence_ready/scheduled_summary_pending。

合并 PR #427 自动触发的 **只读/加密** Evidence handoff：GitHub Actions `37878277280` https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37878277280 ，结论 `success`，artifact `current-summary-encrypted-handoff` ID `11592983983`。日志状态：
`SUMMARY_CUTOFF_PLAN {"active":915,"inScope":205,"existingCurrent":22,"capturedPending":181,"missingEvidence":2,"ignoredOlder":268,"unknownDate":442}`；
`SUMMARY_CUTOFF_COLLECTED {"active":915,"inScope":205,"existingCurrent":22,"capturedPending":181,"missingEvidence":2,"ignoredOlder":268,"unknownDate":442,"encryptedHandoffsCollected":181,"handoffFailures":0}`。
未处理的 442 条 `addedDate` 缺失为独立历史登记，不擅自通过猜日期纳入本轮。全文/PDF 仅可通过已授权、哈希验证的捕获文本 Evidence Packet 用于生成；complete/partial/abstract-only 三层标注必须准确，双语摘要逐篇两轮科学核查。

**尚未发生的行为**：没有本轮新生成 181 篇摘要的真实科学双审；没有把 181 篇直接提交 `public/scheduled-article-summaries.json`，没有创建新的正文生成 API，也没有声称它们已在网站发布。下一次已启用的 12:00 定时任务将消费现有加密 Evidence，并优先审核最近收录 DOI，逐个核实，可靠完成多少就发布多少，剩余明确保留待审，部署 Worker 并以真实 `/api/user-ui/article-summary?doi=` 核查上线状态后才报完成。

## 对用户最终说明（与前序部分回答一并构成完整回复）

已恢复每日北京时间 12:00 的 Gallery 摘要任务，按 10 月 1 日（含）以后 Gallery `addedDate` 的 205 篇执行。PR #427 已合并；最新加密证据交接成功：22 篇可复用，181 篇需要重新生成或更新核实摘要，2 篇暂无可用文本，全部 181 个待审 Evidence 加密交接成功。

此刻新增待审摘要**并未伪报已上线**；需要正式双语生成及两次科学审核、数据提交、Worker 部署和真实 API 验证。每日中午 12:00 自动执行；保留旧摘要，不泄露用户 PDF，不影响唯一每天 08:00 的正式 DOI 发布。

链接： https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/427 / https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37878277280 。
