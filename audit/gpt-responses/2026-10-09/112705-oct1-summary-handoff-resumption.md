# Gallery 2026-10-01+ 摘要上线工作恢复及证据交接

**北京时间**：2026-10-09 11:27:05
**聊天上下文**：用户“10月1日之后的摘要可以上线了，毕竟大部分都有PDF正文了” → “连接中断请继续”
**基线**：zhou526316-sys/organic-synthesis-gallery / main
**性质**：只读审核及交接确认；本条回复没有修改新的摘要条目，也没有触发额外文献发布或摘要定时任务。

## 已完成的工作

1. 最新生产摘要政策已在 main 更新为 Gallery `addedDate >= 2026-10-01`（含当天）；新的补充摘要覆盖 Gallery 收录日期，而不是出版社 first-online 日期，也不能用 PDF 保存或 Evidence capture 日期代替。9月已发布的合格摘要保留、不会删除。
2. 固定摘要生产任务仍启用，时刻为北京时间每天 12:00；它独立于唯一的 08:00 文献准入。未创建第二个摘要发布任务、未修改自动化或其私有解密材料。
3. 已有完整范围的 GitHub 只读证据交接：Actions [37878277280](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37878277280) `success`，artifact `current-summary-encrypted-handoff` ID `11592983983`，下载 ZIP SHA-256 `d01293726e86829536a6f89bdb7c36060ba3115960cf3ac8638732db4879cc75`，ZIP 完整性通过。无明文全文或私钥输出。
4. 交接 plan 数据：`active=915, inScope=205, existingCurrent=22, capturedPending=181, missingEvidence=2, ignoredOlder=268, unknownDate=442, encryptedHandoffsCollected=181, handoffFailures=0`。181 个加密包的 Evidence 覆盖分别是 `complete=61, partial=101, abstract_only=19`。两篇确实缺少已捕获正文证据：`10.1016/j.chempr.2026.103008`、`10.1016/j.chempr.2026.103043`。没有对它们制造或臆测摘要。
5. 全站 `public/scheduled-article-summaries.json` 的 389 条 `approved` 既有记录保持不变，当前 blob SHA `13b140d1b24e0afde1ea4aad56e8ffa982ac99a9`。其中 22 条在此次 Oct-1+ 范围内，与实时 Evidence 指纹相同，可以复用。
6. 只读线上抽样：`10.1021/acs.joc.6c01517`、`10.1038/s41586-026-11108-z` 的 `/api/user-ui/article-summary` 均返回 `available=true, state=published, source=scheduled_reviewed_evidence_v2`，中英文内容存在；`10.1016/j.chempr.2026.103008` 返回 `available=false, state=missing`。正式 API `/api/_healthcheck` 的 summaryMode 为 `scheduled_chatgpt_daily_no_api`、summaryReviewReady=true、summaryReviewEnabled=false。
7. 没有将“加密交接成功”误报为双语审核通过或发布完成；181 个待审不得以私有 PDF 已下载代替 Article Evidence Packet v2 的完整文本验证。当前普通聊天没有在受限审核环境内完成这些包的解密及两遍科学事实审核，不能发布未经审核的批量摘要。
8. 截至 2026-10-09 11:27:05，未发现这 181 篇的新摘要数据提交或生产部署。下一条合理执行链：现有北京时间 12:00 的“Gallery 摘要发布”任务复用该 handoff，经同一任务私有解密环境完成可处理条目的两遍审核、SHA/DOI 复核、最小范围 Git 数据写入、现有 Worker/Pages 同步与在线 API 验收；确实未完成的保留 pending 和准确原因。禁止触碰 08:00 文献正式准入、TOC、用户私有 PDF 和旧摘要。
9. 现有摘要任务虽然显示已启用，`last_run_time` 记录不是今天，尚不能以“启用”视为已经执行今天 12:00；需通过真实任务回执、摘要数据 SHA 和线上 DOI 状态验收后再报告发布成功。

## 用户可见回报（本轮）

中断前修改的 10月1日+ 范围仍有效：现在按 Gallery 收录日 `addedDate >= 2026-10-01` 核算，不影响之前已发布摘要。今天的 Evidence 交接已完成：205 篇符合范围，其中 22 篇有可复用摘要，181 篇已收集到受保护的文本证据包待审核（61 complete / 101 partial / 19 abstract_only），2 篇无正文证据。已核验已有摘要在正式 API 中可读取。现有 12:00 摘要任务处于启用状态，没有另建任务；181 篇尚未审核发布，待后续同一受控审核链执行，不能宣称全部上线。
