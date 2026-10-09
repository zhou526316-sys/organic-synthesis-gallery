# Gallery 摘要审核工作线纠正及 12:00 预检

北京时间：2026-10-09 11:57:35；本轮用户指出先前错误承接 UI 工作，正确工作是截图中的 Oct1+ 摘要审核与每日 12:00 发布。

## 只读证据及真实状态

- main 的 `docs/scheduled-summary-contract.md` 和 `audit/summary-publication-policy.json` 明确 `addedDate >= 2026-10-01`；保留旧摘要；最新审核集合先 newest addedDate。
- `audit/gpt-responses/2026-10-09/112705-oct1-summary-handoff-resumption.md`：915 active，205 in-scope，22 existingCurrent，181 capturedPending，2 missingEvidence；61 complete，101 partial，19 abstract_only；未知 `addedDate` 的442旧文献不擅自纳入。
- Actions #37878277280 success；artifact #11592983983 `current-summary-encrypted-handoff`，大小2322190，校验值 sha256:d01293726e86829536a6f89bdb7c36060ba3115960cf3ac8638732db4879cc75，未过期。没有把加密交接视为内容审核成功。
- `public/scheduled-article-summaries.json` 文件 blob SHA 仍为 `13b140d1b24e0afde1ea4aad56e8ffa982ac99a9`；没有此次 181 新摘要的数据合并提交。
- 真实只读公共 API：`/_healthcheck` ok=true, summaryMode=scheduled_chatgpt_daily_no_api, summaryReviewEnabled=false, summaryReviewReady=true, d1=true, r2=true。
- `/api/article-summary/scheduled-handoff?manifest=1&limit=5`：version2, keyId 9c55e2d2ed734de9, algorithm RSA-OAEP-256+A256GCM+GZIP, manifestOnly=true。
- `/api/user-ui/article-summary` 已发布 DOI `10.1021/acs.joc.6c01517` 返回 available=true、state=published，含中英文；缺文本 DOI `10.1016/j.chempr.2026.103008` 返回 available=false、state=missing、reason=fulltext_missing。
- automations 私下检查：唯一已启用的“Gallery 摘要发布”日任务仍为 Asia/Shanghai 12:00；此前 last_run_time 为 2026-10-03T04:44:42.708645Z，不能视为今天已运行。保持任务及内部私密解密材料原样，未新增/更改/触发重复自动化。
- 本会话不能把私有证据包在没有相应专用审核执行环境及结果下当作已双审；只有未来实际任务回执、数据 SHA、部署成功和 live DOI 检查能够证明发布。

## 用户可见回报（当前两段最终回复合并）

你说得对，我承接错了工作线。你要我继续的是 **Organic Synthesis Gallery 的文献摘要审核与定时上线任务**，而不是网页前端的界面优化。

根据截图，上一轮的工作进度为：

| 项目 | 数量 |
|---|---:|
| 10 月 1 日之后纳入范围的文献 | 205 篇 |
| 已有合格摘要 | 22 篇 |
| 待审核摘要 | 181 篇 |
| 缺少正文证据 | 2 篇 |

181 篇待审文献的加密证据已收集完成，其中完整正文 61 篇、部分正文 101 篇、仅摘要证据 19 篇。

**真正需要接续的是：审核这 181 篇文献、按证据强度生成可靠的中英文摘要，并通过每天北京时间 12:00 的现有任务逐步上线。**

我会以此为准核对 GitHub 当前状态、摘要审核规则及自动发布链路，不再处理无关的网页界面问题。

## 最新核验结果

**摘要服务正常；12:00 任务已启用。**

截至北京时间 10 月 9 日 11:56，已经确认：

- **加密证据交接成功**：[GitHub Actions #37878277280](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37878277280)，181 个待审核证据包均已收集，没有交接失败。
- **生产 API 正常**：`summaryReviewReady=true`，现有摘要读取成功。
- **181 篇仍未完成本轮审核发布**：摘要数据文件尚未出现对应的新合并更新，不能把证据交接完成当成摘要上线。
- **两篇缺少证据的文献**：`10.1016/j.chempr.2026.103008` 和 `10.1016/j.chempr.2026.103043`，暂不生成无依据的摘要。

原有摘要不会被删除。新摘要只处理 Gallery 在 2026 年 10 月 1 日及以后收录的文献，依据实际捕获的正文进行两遍科学审核，明确区分完整正文、部分正文和 Abstract 证据，并核对中英文事实一致性。

**接续执行状态：**现有唯一的“Gallery 摘要发布”任务定在每天北京时间 12:00，已启用，无须创建替代任务。今天这一轮的执行及上线仍需其真实回执，不能预先宣称成功。审核通过的摘要应按最新合同合并写入 `public/scheduled-article-summaries.json`，部署后逐 DOI 校验中英文可用和 Evidence 指纹；未审核或证据缺失的条目保留 pending。当前普通会话仅完成只读生产预检，未在专用私有环境解密或代替审核，也没有改动摘要生产数据、定时任务或正式 08:00 文献发布。
