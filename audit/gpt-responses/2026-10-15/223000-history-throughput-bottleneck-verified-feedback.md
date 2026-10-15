# 2026-10-15 北京时间22:26后 | 历史回溯吞吐量低的用户反馈核实

项目：抓取有机合成文献并持续更新网页。
对话：用户质疑“怎么这么久才这么些？”，针对历史回溯已批准文献总计130篇、12,286 Q3元数据源候选、55,969 全历史已发现 DOI 的处理效率。**此轮只核实问题、提出需要用户批准的调整方案，不擅自执行任何反馈修复、发布或调整定时任务。**

## 本轮已送达用户的完整答复主体

“你的质疑是合理的。核对 GitHub 的最新数据后，问题不是没有抓到论文，而是**抓取速度与学术审核速度严重脱节，而且此前过多时间花在单篇日期纠错和反复验收上。**

目前实际情况是：

| 指标 | 已核实数量 |
|---|---:|
| 全历史已发现候选 DOI | 55,969 |
| 仍需逐篇学术审核的候选 | 55,062 |
| Q3 已发现来源 DOI | 12,286 |
| Q3 尚未完成分类或日期核验 | 11,246 |
| 历史累计审核纳入 | 130 |
| 其中已正式入库 | 122 |

也就是说，文献发现已经积累了大量数据，但没有形成与之匹配的批量学术审核能力。

**这主要是执行流程的问题，不能简单归咎于出版社访问困难或审核标准严格。** 严格审核应该保留，但没有必要把大部分时间耗费在同样的人工操作和重复检查上。”

### 核查后发现的四个具体问题

**1. 自动任务只负责发现和整理候选，没有持续完成学术审核。**

现有 `historical-review-triage.mjs` 明确只生成审核队列，`historical-review-worklist.mjs` 也只负责排序和分页。每页最多显示 320 条，但这 320 条并不会自动完成论文内容审读、双遍判断和批准入库。

换句话说，**有自动抓取，却没有同等吞吐量的自动审核流水线**。这才是最大的瓶颈。

**2. 连历史来源抓取本身也卡住了。**

最新历史发现状态显示：
- 计划扫描约 3,600 个期刊—时间窗口，完成 375 个，约 10.4%。
- 最近记录停在 2025 年 7 月的 Nature Communications。
- 该次运行明确记录 `blocked: true`，原因包括 Crossref 分页结果截断，以及 OpenAlex 返回 HTTP 401。

所以不仅审核落后，向更早年份推进的来源发现也存在实际阻塞。

**3. 候选优先级算法太粗糙。**

目前主要靠题目关键词打分，例如出现 `asymmetric` 就可能进入最高优先级 P0。实际审核队列中，连神经科学的 *Asymmetric prefrontal representations for leader–follower dynamics* 也排在优先队列里。

它适合做宽召回的初始信号，却不适合直接决定专家应该先审什么。结果是大量时间花在明显不相关的候选上。

**4. 我此前的执行重点也出现了偏移。**

以今天的 Chem 工作为例，多个 PR 主要解决日期、Review/Perspective 分类、跨来源冲突和科学范围待核。它们提高了数据库的可靠性，但几轮下来，累计批准文献仍是 130 篇。

这些工作有必要，但不应该长期挤占真正寻找、审读和批准原创合成论文的主要工作量。

## 建议用户批准的提速方法（本轮并未实施）

首先修复发现端：OpenAlex HTTP401 认证/请求故障、Crossref 分页截断继续拆分；单个期刊时间窗口故障要留 `incomplete` 而不要停止其他15刊，不可虚假推进完成计数。保留冻结原始来源和所有真正来源冲突。

其次提升学术审核端：从只用标题词优先级改为出版社 DOI、文章类型、首次在线、可合法获取的摘要/正文的证据驱动排序；批量处理100–200 DOI 原始候选，先区分明确的出版者非原创与真实 Research，再对有机会纳入的原创文章做文章特定科学首审和独立反向挑战，确认有新化学转化、制备普适性、分离/应用或真正全合成；不足者仍 `pending`，不能因为标题关键词或受限全文读不到就批量排除。

第三改交付方式：一次按可核验证据完整的多个 DOI 成批 PR + CI + staging 季度重算，不再为了每1–4篇可处理记录重复触发整套质量门禁；固定08正式入库规则、受保护文件 SHA、不能把历史纳入混入Today/Hot/公众号保持不变。

每个验收批次至少记录：机器候选数量、出版社Research确认证据、真实首发日、首审及反向挑战已完成数量、纳入/排除/待核、实际入库，以及source failed/waiting根。先验证一个100–200 DOI pilot的精确产出，再定可持续的吞吐指标，**不承诺无依据的新增篇数或按数量凑1,000篇季度配额。**

**这是涉及改造工作流的具体反馈，按照既有 PROJECT_RULES.md 用户授权约定应先核实再由用户批准，此轮没有更改抓取/审核代码、定时任务或正式发布数据。**

## 来源与核验数据

- main `0430a4d52322b0364deca1cd0add49ff14bec9d5`。
- `audit/historical-reviewed/approved-admissions.json` accepted=130 pending=2；`public/toc-demand-live.json` 正式1,151，approved DOIs formal交集122，待合法08为8。
- staging `audit/historical-staging/global-coverage-ledger.json`: `distinctCandidateDois=55969`, `requiresTwoPassReview=55062`, `sourcePlannedRoots=3600`, `sourceCompletedRoots=375`, `publisherIssueMatchedRoots=0`, `full16JournalIssueCoverage=false`。sourceCompletedAt = `2026-10-14T19:07:53.188Z`。
- staging `audit/historical-staging/state.json` at `2026-10-14T19:07:53Z`: processed=1, blocked=true, last failure `2025-07-01_2025-07-31_nature-communications`, Crossref `truncated_or_inconsistent` and OpenAlex `http_401`. Previous error `http_504`. 根游标不推进。源码 `scripts/historical-nightly-discovery.mjs` 的 `if(blocked)break`。
- staging `audit/historical-staging/reviewer-worklist.json` statusCounts.needsReview=55,056 (与global需双审55,062统计分账不完全相同), selected=320, `noAutomatedIncludesOrExcludes=true`, priority P0 中不相关示例：Nature prefrontal 神经科学、JACS bacterial flagellar motor biophysics。源码 `scripts/historical-review-triage.mjs` `priorityWords` 粗关键词 `asymmetric`、`synthe`、`cataly` 等；`articleEvidenceReview='not_performed_by_triage'`。
- staging 2026Q3 `quarter-2026-q3-coverage.json` 12,286 Q3 source DOI, 11,246 unfinished scope/date verification, 192/192 API roots complete but 官方Research逐期核验 still FALSE。
- 相关 Issue #498 实际反馈证据已同步 https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6194550910 。

**Important audit qualifier:** This is a read-only verification of why throughput is low. No source/publisher APIs called directly, no secret inspected, no approval granted for repair yet. No changes to official publication markers, D1, publisher rights or user-facing Today/Hot/WeChat.
