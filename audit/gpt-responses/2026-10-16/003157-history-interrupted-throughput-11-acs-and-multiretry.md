# 2026-10-16 北京时间 00:31:57 | 历史回溯连接中断后的真实续作

所属项目：抓取有机合成文献并持续更新网页；仓库：zhou526316-sys/organic-synthesis-gallery。用户指令：“连接中断了”，指上一轮用户批准的“把历史抓取/审核变快”工程中断；用户希望直接承接 PR #699、实际 staging 复算和批量学术审核。不要重问已获批任务。

## 本轮完整用户可见结果及交付

### 一、接续并验收前一轮历史提速修复

已确认 [PR #699](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/699) **已真实合并**，合并提交 `c377823a06c333a1d244f50a8b99be0d454bfaae`，最终 PR head `e961ce3d11c85f11e816ddef3e1c60e5dde649cf`，其八组 mandatory CI 全部成功。此 PR 只修改历史来源与审计 staging 流程，不涉及正式文献发布：遇到来源不完整/HTTP 401 时，把不同刊的失败根分别保存和重试，主游标继续；Crossref 500 行分页仍对原数据核验；OpenAlex 401 报告区分“没有 key”与“key 被拒绝”；每轮现有 reviewer staging 输出各160 DOI Q3/global预审工作包，所有 DOI 仍标为 unreviewed，需要真实模型和科学证据进行两遍审核，不许冒称这些160篇已经获准。

直接读取实际 staging 后，源发现根 **375 -> 396**（新增21个真实 source-complete 窗口），全历史跨学科元数据候选 DOI **55,969 -> 57,266**（净增1297），历史向前游标从2025-07推进至2025-04，27个source incomplete root 独立保留。对27个未完成根，真实 `audit/historical-staging/state.json` 报告 `openalex:http_401:api_key_missing`，即 GitHub Actions 中 OpenAlex Key 缺席；SOURCE 健康未完成不能冒充官方检索全覆盖。预审 Q3和Global工作包每份160“待双遍审”项，不代表已审核结果。

已送达用户可见段落（实质内容）：
> ## 中断后的最新验收结果
> 已确认，上次的提速修复 PR #699 已合并，不再只是未完成的测试分支。
>
> | 指标 | 修复前 | 最新回读 |
> |---|---:|---:|
> | 历史来源完成窗口 | 375 | 396 |
> | 全历史已发现 DOI | 55,969 | 57,266 |
> | 来源发现游标 | 2025 年 7 月 | 2025 年 4 月 |
> | 原来阻塞全部扫描的失败窗口 | 直接停机 | 27 个独立待重试窗口 |
> | Q3 批量审核工作包 | 无 | 160 篇 |
> | 全历史批量审核工作包 | 无 | 160 篇 |
>
> “单个期刊失败使全部历史抓取停住”的问题已在真实运行中改善，新增加21个窗口、1297个来源 DOI；OpenAlex 401仍是外部阻塞；320条未审任务不是320条学术审核。

### 二、真正完成新增原创合成文献双遍审核 11 篇

由 staging `academic-preflight-q3.json` 原始160条 **unreviewed** 候选出发，实际核验ACS官方原始 DOI 论文、Article/Letter 类型、确切 Published Online 而非刊期日期、制备反应/路线、具有证明的范围、第一遍科学评估及第二遍针对性的对抗性质疑，写入原版 `audit/historical-reviewed/approved-admissions.json`，均做中文标题，绑定冻结 Crossref/OpenAlex原始SHA256和review/raw Git blob，所有记录 `ingestionChannel='historical_backfill'`、`mediaPolicy='toc_only'`、`new=false`、`addedDate=''`，未抓受限PDF、SI或正文图片。

7篇 Organic Letters：
1. `10.1021/acs.orglett.6c02791`，2026-07-25，NHC二烯醛不对称[5+1]螺环己二烯酮构筑；区分后来的独立Correction DOI；
2. `10.1021/acs.orglett.6c02161`，2026-07-28，手性Rh(III)分子内烯胺酮氢芳基化制四氢β-咔啉；
3. `10.1021/acs.orglett.6c02188`，2026-07-21，Ni电化学不对称α-溴膦酸酯与芳基碘化物还原交叉偶联；
4. `10.1021/acs.orglett.6c03176`，2026-08-20，光催化N-芳基甘氨酸脱羧和芳环邻位成环制氧吲哚；
5. `10.1021/acs.orglett.6c02716`，2026-07-27，β-酮酸与二氧代吡咯烷酮不对称脱羧加成和多样化环化制手性稠合杂环；
6. `10.1021/acs.orglett.6c02686`，2026-08-15，Ti催化芳基硼酸酯与芳基卤化物偶联制联芳基，ACS摘要给60例与最高98%；
7. `10.1021/acs.orglett.6c02640`，2026-08-14，Ir(III)在双室Mo(CO)6外置一氧化碳下羰基环化生成2-喹诺酮。

4篇 JOC：
8. `10.1021/acs.joc.6c01205`，2026-08-12，(+)-bisabosqual A首次不对称**完整全合成**，未成功晚期芳环官能化不冒充成功方法；
9. `10.1021/acs.joc.6c01394`，2026-08-10，硝酮/米氏酸不对称[3+2]，通过已知中间体完成(−)-crispine A**形式全合成**，不能称完整总合成；
10. `10.1021/acs.joc.6c00901`，2026-07-09，乙醇中低负载无铜无胺Sonogashira（34例、克级，不能当作全新键型）；
11. `10.1021/acs.joc.6c01053`，2026-07-06，(−)-EBC-329首次不对称完整全合成，酶去对称化及E型交叉复分解。

[PR #703](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/703) 历史准入，Q3来源、文献范围、PDF、Tampermonkey、站点含Playwright六组全部通过，最终已真实合并 main：`ba26f71e84fd348e969f84524217523682e97080`（提交前修复了原来把历史累计数量硬编码为130的老测试，以及“负结果”词汇断言）。`summary.include=141`、`checked=143`、此前2篇出版日期待核保留。11篇不存在于正式已入库/原历史已批准/用户排除集合，也不在新的正式文献目录中。本工作不自行发布任何历史卡片。

已送达用户可见段落：
> ## 本轮还补上了真正的文献审核
> ...11篇此前未审核原创合成研究首审与反向复核，7篇Org. Lett.、4篇JOC，PR #703，拟从130变141；尚未合并时不能当正式收录。
>
> ### 11篇历史文献已通过审核并合并
> PR #703六组CI成功，真实合并 ba26f71；历史累计批准 **130 -> 141**，正式上线仍须唯一北京时间08:00门禁。

### 三、实际重复 staging 季度统计正确联动

通过已有staging专用 trigger file `audit/automation-triggers/historical-review-triage-bootstrap.json` 在main触发提交 `8355f3b0f3bb5ab3c410416f0609083929c004c5`，GitHub Workflow https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38768266781 = SUCCESS。真正读回 staging/historical-archive-nightly：
- `audit/historical-staging/quarter-2026-q3-coverage.json` git blob **`b989e52971260083f2d9c8a43a551940e3813a5e`**
- `audit/historical-staging/quarter-2026-q3-review-worklist.json` git blob **`421d7fdf3e424a246d66545dd42d5ccbcac14137`**
- 两者同一个 `generatedAt=2026-10-15T16:21:38.458Z`（北京时间10月16日00:21:38）。
- 真实Q3 unique source DOI =12286、192/192源窗口不变、正式Q3在库851不变；Q3未完成候选 **11246 -> 11235**（-11，确实进入独立双遍审核），`sourceApprovedWaiting08=19` 原8 + 本轮11；hist批准141但正式全站仍1151，真正历史已上线122，新已批准待合法08发布19。用户未要求和未批准任何额外slot，没有夜间正式发布、D1调用/媒体上传。全16刊出版社逐期Research DOI完整性依然 false；192/192只是机器来源 API根完整。

已送达用户可见段落：
> ### 真实季度复算也已成功
> workflow #38768266781通过，paired generatedAt一致；130→141批准，122上线不变，8→19待唯一08；11246→11235 Q3未完成；12286 Q3来源 DOI不变。

### 四、第二项抓取吞吐修复“单晚重试一根”瓶颈

审计发现 #699 原 `retriedThisRun` 限制每次23:00历史采集只重试 **1个**延迟根，因此27个 OpenAlex 授权欠账未来即使有 key 也要按夜串行修复。新 PR [#704](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/704) 将重试改为“每轮最多 min(24, floor(MAX_UNITS/2)) 个符合重试时间条件的 deferredRoot”（真实原运行 MAX_UNITS=48 则上限24个），同时为原始时间游标预留预算，**不能跳过API_REQUEST_LIMIT=220**。队首仍冷却但后面的根已到时，能选择后者，删除或重排的是准确队列index；HTTP 401/429、Crossref不完整依然写回stage并保持原源根不完成。测试覆盖6单位中3个欠账成功、源游标结束后带冷却队首仍能处理后续已到时根、重复401正确不标source-complete。

真实6组CI：Historical staging 23:00、scientific worklist、historical provenance、Tampermonkey、Private PDF、Site quality gate 含Playwright，**全部 SUCCESS**。PR #704真实 main 合并提交 `1cf8a699c6682fbb3977d15be981f25f4f0d864c`，最新代码 Git blob `59525f6c21e8edcebc72b036450e27f22a8f2ff9` 回读验证包含 `const maxDeferredRetries=` 和准确 `state.deferredRoots.splice(retryIndex,1)`。由于 GitHub Actions 缺少 OpenAlex API Key，本轮成功仅真实CI+模拟重试验收，**未冒称27个授权阻塞根已真实清零**。更新没触碰23:00/23:09 cron和08唯一writer。

已送达用户可见段落：
> ### 批量重试修复也已合并
> PR #704 6/6 CI通过，合并1cf8a699...，一次可重试多个欠账根、跳过冷却队首；实际完成27根仍需要OpenAlex真实授权，不能以模拟当作成功。

### 五、OpenAlex用户仅需一个免费 Secret 连接

现场 `state.deferredRoots[].issues` 一直显示 `openalex:http_401:api_key_missing`，是GitHub runner没有配置Actions secret。OpenAlex官方身份验证（在2026-10-14更新的 https://help.openalex.org/api/authentication/）明确首次公开页可匿名调用，但多页cursor必须有**免费API key**。用户应到 **https://openalex.org/settings/api** 获取免费key，然后打开这个仓库 GitHub Settings -> Secrets and variables -> Actions -> New repository secret，Name **`OPENALEX_API_KEY`**，Secret为用户在OpenAlex账户复制的值。绝不能把key发聊天或提交代码/日志。现有 `.github/workflows/historical-nightly-discovery.yml` 已含 `OPENALEX_API_KEY: ${{ secrets.OPENALEX_API_KEY }}`，无需更改源码。此连接依赖用户本人操作，本轮没有替用户在外部注册/更改账户。

已送达用户可见段落：
> ### 还剩一项需要配置的外部授权
> OpenAlex免费密钥必须到OpenAlex账户生成，加入GitHub Actions名为OPENALEX_API_KEY的密钥，别发到聊天中；27个不完整根等待凭据，不能视作源完整。

### 六、适用标准、进度与不可冒称

- PR #699/#703/#704 全部已合并、可复核；新学术审核成果确实11篇，非自动排序160篇。真实main approved manifest 141, pending2, formal历史122, approved待08 19，总正式站点1,151。新的页面只有08:00 fixed writer之后且授权部署才可能增加，不能说已经上线141。
- staging来源API在7–9月为192/192，不等于16刊出版社逐期 Research全部覆盖，global完成root396/3600，27原 auth-incomplete root，正式未完成Q3元数据11235（跨学科），这些数字不等于合格合成论文漏收总数。
- 原有北京时间23:40“Gallery历史回溯验收”任务上轮已更新并启用，每轮争取20–40篇**真实原创DOI双遍审核而非批准配额**，本轮没有新建/改变其时间。23:00/23:09旧源发现动作无改期；唯一正式发布08，无18新增。
- 没有Cloudflare D1额外读写、publisher受限全文/SI/PDF/正文图获取、没有 Today/Hot/微信每日新增混入，所有历史报告独立 staging。
- [Issue #498 完整本轮验收评论](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6197051798) 收录以上全部GitHub合并和来源/progress，之前恢复过程中comment #6197003426为临时状态。
- 如需日后继续，先看项目全局准则和两个main合并SHA，再检查GitHub秘钥是否由用户配置成功、下一次真实staging运行后deferredRoots减少和双来源窗口完整，再对Q3 preflight下一批真正高质量原创合成 DOI做文章特定两遍审核和小批次PR，不能重复抓大文件/重复每1篇日期PR。

本 response log 不包含密钥或私有原文。存入GIT记录只是项目执行过程同步，不替代真正的网站发布、出版社期次核查和Key设置。