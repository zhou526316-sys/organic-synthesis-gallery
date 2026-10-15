# 2026-10-16 北京时间01:45｜历史回溯中断续作、批量恢复、原创合成学术审核、来源分账实测

项目：抓取有机合成文献并持续更新网页（Organic Synthesis Gallery）。用户最新输入“继续”，继承上一轮PR #699来源失败独立排队、2026 Q3单篇科学审查和23:40人工学术审核任务的完成状态。正式唯一新增北京时间每日08:00，18:00已取消，main唯一正式文献生产基线；不可通过nightly staging发布新增；不可将历史纳入Today、Hot或公众号每日新增。

## 一、PR #704已通过并合并，来源重试的性能瓶颈有所修复

实时核实GitHub [PR #704](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/704)已经合并、确切merge commit为 `1cf8a699c6682fbb3977d15be981f25f4f0d864c`。该PR对应HEAD的六个必须CI全部SUCCESS，包括历史source、审计和批量preflight、Site Playwright、Tampermonkey、PDF保护。

原历史脚本 `scripts/historical-nightly-discovery.mjs` 已支持 `deferredRoots[]`：遇到OpenAlex 401或Crossref截断时把单个来源根记作不可完结的失败，其他15刊照常推进，保留原始crossref/openalex DOI和来源sha256，后续遵守重试预算。PR #704优化原“每轮至多一个欠账根”的限制：受MAX_UNITS及API_REQUEST_LIMIT控制，在有资格的deferredRoots里选择多个，跳过尚处于重试冷却的队首，源分片成功后才从队列退出，sourceCoverageComplete不得因单个batch成功而真。

但**不把代码改造/测试成功误当成27个欠账根已补齐**。最近真正跑完的历史source状态：`staging/historical-archive-nightly/audit/historical-staging/state.json`完成 **396/3,600** 来源根（上一轮375，+21），有 **27 deferredRoot，均为`openalex:http_401:api_key_missing`**，最后source run完成 `2026-10-15T15:46:40.943Z`；全球不同学科来源DOI **57,266**（此前55,969，+1,297），主游标已由2025年7月前进至2025年4月。一共27个失败根未闭环。免费OpenAlex API Key需要用户从OpenAlex自身账户取得，并自行在repo GitHub Actions的Repository Secret命名`OPENALEX_API_KEY`；已有workflow读取此Secret，用户不应把secret发到聊天。未配置时无法完成依赖OpenAlex的源交叉闭环，不能伪造进度。

## 二、PR #703（此前跨会话提交）真实合并，11篇原创合成研究完成学术双遍审核

`https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/703` merged `ba26f71e84fd348e969f84524217523682e97080`，六组CI全部通过。此前按ACS publisher Article first online、原批次Crossref/OpenAlex SHA、领域真实制备反应、五段scopeAssessment以及对抗性第二遍审核，新增11篇历史批准（7篇Organic Letters、4篇JOC）：130→141。校正了过去旧测试里“以后一定未上正式网站”的冻结假设，只允许合法固定槽产生的`historical_backfill`正式数据通过，任何假daily新增仍拦截。

## 三、本轮新学术审核PR #705，真实发现且批准4篇原JOC方法，不凑数字

从staging `academic-preflight-q3.json` DOI绑定160项候选包里挑出真实原创制备化学，分别回读ACS原文章/DOI/Published Online、摘要或可公开的详细论文记录、两份冻结来源审计（原始raw batch和review queue的Git SHA，来源SHA256）、正式在库/批准/明确排除集合，形成两遍实质性范围审核和中文题名。**160只是`unreviewed`候选数，不是已审核/批准160篇**。

在这批中识别 `10.1021/acs.joc.6c01696` 虽在来源候选中，但已在全站正式文献 `public/toc-demand-live.json`，没有重复收录。对其他文章的首次在线日期不一致（`10.1021/acs.orglett.6c02163`、`6c02735`；`10.1021/acs.joc.6c01432`、`6c01562`、`6c01686`）因证据尚不满足不强行选日期/批准，也不判永久排除。

新批准的四篇均为JOC原始Article，不是Preview、封面或综述：
1. `10.1021/acs.joc.6c00656` 原Article Published Online **2026-07-10**，不对称酰基氮杂环丙烷重排构筑C2手性2,3-二氢噁唑，含环开裂易消旋边界；ACS页 https://pubs.acs.org/doi/10.1021/acs.joc.6c00656。
2. `10.1021/acs.joc.6c00718` first-online **2026-07-08**，用位阻改造EstFF1羧酸酯酶，以乙酸乙烯酯实际转酰化伯醇及仲醇，具有多类别真实制备适用性与对映选择性。蛋白突变体数量不可代替底物范围，近定量S对映选择性也不能说成100%分离收率；ACS页 https://pubs.acs.org/doi/10.1021/acs.joc.6c00718。
3. `10.1021/acs.joc.6c01376` first-online **2026-09-16**，Cu(I)催化消旋氮杂环丙烷动态动力学拆分，串联开环环化制手性六氢咪唑并喹啉。原ACS Abstract分别报告最高88%收率、>99:1 dr、94:6 er，不能假定为同一个底物的同步结果；https://pubs.acs.org/doi/10.1021/acs.joc.6c01376。
4. `10.1021/acs.joc.6c01788` first-online **2026-09-08**，H8-IDPA手性酸催化环状1,3-二酮、芳香醛和取代硫脲三组分Mannich获得手性硫脲，官方Article在线日与索引摘要支持最高99%收率/ee，不据此伪造每个底物数据；https://pubs.acs.org/doi/10.1021/acs.joc.6c01788。

历史证据中每条保留DOI、准确在线日期、作者、citation、中文学术标题、来源双family与哈希、五段scopeAssessment、同一助手先审/反向挑战两遍，不声称是两位独立真人；未复制出版社受限全文、原英文摘要全文、PDF、SI或图。四篇交给唯一既有08:00发布队列，`toc_only, historical_backfill, new:false, addedDate:''`。

PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/705 。**6/6 CI SUCCESS**（准入+来源+科学审核、Site/Playwright、Tampermonkey、PDF），merged `25f78dd8fcfecd1abcb5a9777621fb6f8b5a9646`，历史累计批准141→**145**，原来两篇首次发表日期待定条目独立保留；正式站点仍总1151，其中已合法正式入库历史122，**23批准等待下一合法08:00**。受保护`public/rolling-supplement.json` blob仍`f0e4b18a3be71e52fb07e84e291f51f652cd03ae`；此次未直接插入正式目录，不触动D1或公众号。

## 四、二轮真实staging复算和全局陈旧队列缓存归零

第一轮（批准新四篇之后）通过原staging-only trigger main提交 `e64906bf2aa2c5dd7360bbc502e690ebd9a43542`，Actions [#38779468467](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38779468467) **SUCCESS**：
- 2026Q3 12,286 unique source DOI, 192/192 metadata family roots保持不变，正式Q3总851保持不变。
- Q3未完成候选 **11,235→11,231**，已审核待08 **19→23**。
- paired coverage/worklist generatedAt exact `2026-10-15T17:42:12.281Z`。
- 全球缓存`staleReviewerStatusRecords=4`，这不是学术纳入漏写，而是队列分段320/396来源根刚好上轮cursor396，早期根的四篇旧`requires_two_pass_review`快照尚未刷新（新的全球统计已识别真实approved145，不把缓存误差当作者未审核）。
第二轮直接通过既有原staging-only workflow trigger提交 `a0efbdf4d79f54461753fd0a4152df13a6c81310`，Actions [#38779846271](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38779846271) **SUCCESS**。其原流程跨root396队列尾回绕到0，使用冻结source batch重新生成review shard并保留SHA证据，不重新抓论文也不更改正式目录。
**实测回读：**
- 全球 `audit/historical-staging/global-coverage-ledger.json` Git blob **`108fe3c83e6bde71a873ac699b9d27b2a8bfc855`**, generatedAt `2026-10-15T17:45:01.492Z`，正式全球统计 `distinctCandidateDois=57266`, `sourceCompletedRoots=396`, `approvedAwaiting08=23`, **`staleReviewerStatusRecords=0`** (原4)。
- reviewer triage ledger blob `4f1670b7680907a4600dcb19fb62372329a6f0d1`, nextRootIndex320，全部396根来源保留；原始crossref/openalex source元数据不变。
- Q3 coverage `audit/historical-staging/quarter-2026-q3-coverage.json` Git blob **`59f3a4832afd108acf0690f4cdd73e67b2228f76`**。
- Q3 review worklist `audit/historical-staging/quarter-2026-q3-review-worklist.json` Git blob **`9b34637f13c5237006c447ad108a3435f7e08409`**。
- 两者 exact `generatedAt=2026-10-15T17:45:02.705Z` = **北京时间 2026-10-16 01:45:02**，Q3 unfinished11231, waiting23, Q3 192/192 source roots, source DOI12286; publisher 16刊Research issue/date完备闭环`publisherIssueResearchReconciliationComplete=false`。
- Q3 academic preflight packet blob `bdf56e42dd93f22ccf84a017b6d00a9410047c83`, selected160 `unreviewed`，不是160已审核。
- 27个无法跨OpenAlex完成的旧源根仍`openalex:http_401:api_key_missing`，可行提速的关键外部阻塞是给GitHub Actions repository secret`OPENALEX_API_KEY`填入用户OpenAlex free key，不在聊天/代码/审计传递密钥。

## 五、已同步Issue及下一阶段优先级
证据也已同步到长线 issue [#498 comment #6198530302](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6198530302)，其中指出合并/CI、真实staging读取和外部API授权欠缺。
下一阶段：当用户OpenAlex授权后实测多个deferred roots真正补齐、保持不完整等待而非假计数；继续对160源DOI工作包内真实有机合成高优先级论文做批量文章级证据审核，不能将“工作包创建”当完成审读。对出版社2026Q3所有16刊Article Research DOI的完整逐期清点仍未完结（不能把192/192 Crossref/OpenAlex窗口当出版社Research TOC完整）。维持单一08:00法定发布，0 Cloudflare D1调用/写入，0非授权PDF/SI/正文图，旧文献toc_only或metadata_only，绝不将历史入Today/Hot/公众号今日上新。

本轮面向用户已给出多个逐段永久可见答复，最终补充staleReviewerStatusRecords归零、Issue与本Git审计提交链接，避免重复之前已给的全部统计。