# 历史回溯持续审核会话｜2026-10-16 11:46:58 北京时间

**会话任务**：接续 Organic Synthesis Gallery 历史回溯，上一 PR #713 合并后仍需继续真正逐篇审阅的 Q3 原创有机制备论文、纠正出版日期错位和重算 staging 队列，用户仅提出“继续”。

## 本轮已向用户分段发送的主要回复与核实结果

### 第一段

“历史回溯续作｜10 月 16 日”：复核 main 历史审核批准 **184**、正式历史入库 **122**、已批准尚未入库 **62**、全站正式文献 **1,186**。触发独立 staging 审核队列复算，无正式生产/媒体变更。发现 CCS Chemistry `10.31635/ccschem.025.202506810` 的 Q3 来源窗口日期属于卷期定位，首次正式在线为 **2026-01-11**，因此真实原创光催化叔酰胺交叉偶联方法应按 Q1 历史 `metadata_only`，不属于 Q3 正式上线文章。

### 第二段

“Staging 重算已完成”：成功从原 **176** 批准更新到 **184** 批准的 staging 重新计算，Q3 未审/日期待核 **11,199→11,191**，批准待08正式发布 **54→62**，来源DOI **12,286**，192/192元数据窗口，正式Q3原录 **851**；全历史来源 **57,266**，27个OpenAlex 401授权失败窗口继续未完成，global缓存当时仍有8个状态不同步。

### 第三段

“PR #716 已完成合并”：六组 CI（学术来源、历史入库授权、Q3范围、Tampermonkey、PDF隔离、Site质量/Playwright）全部成功； [PR #716](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/716) merge [`4cc9f895194096961d4ce4c716b0a69bcf9f49c6`](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/4cc9f895194096961d4ce4c716b0a69bcf9f49c6)；main 学术批准 **189**、两篇原有日期待核不变，正式历史入库 **122**，批准待正式入库 **67**。本次5篇：4篇Q3，一篇CCS第一季度，所有5篇当时均未出现在正式目录；Q1禁止历史TOC/正文/SI/PDF，严格 `metadata_only`。

### 第四段

“最新 staging 复算验收通过”：**Q3未完成 11,191→11,186**；**Q3已批准待发布 62→66**；Q3来源中官方首发实际上处于其他季度 **10→11**；**全历史批准待发布 62→67**；**全历史审核状态不同步 8→0**。2026年Q1 CCS文章正确归属外季度而不算Q3方法学新发表，源仍存在。

## 具体完成的五篇两遍真实学术审核

1. Org. Lett. `10.1021/acs.orglett.6c02958`, **2026-08-31**：卡宾催化环状醛亚胺与胺/醇/硫醇脱氢偶联，合成环状脒、亚胺酸酯和亚胺硫代酯；保留底物范围及机理推论边界。
2. JOC `10.1021/acs.joc.6c01515`, **2026-08-31**：9-芴酮光催化空气氧化氨基苯磺酰胺+醇制备苯并噻二嗪二氧化物；报道克级实验，未把自由基路径写为直接观测。
3. JOC `10.1021/acs.joc.6c00729`, **2026-07-30**：Rh(III)烯胺酮和吡啶并三唑的C–H级联和替代SNAr发散合成稠合喹啉酮，关键条件100–120°C，机制推断与制备结果分开。
4. Angew `10.1002/anie.9818208`, **2026-07-26**：Pd/配体/LiHMDS室温实现芳基氟化物C–F活化与烯醇负离子α-芳基化，酮/酯/腈/酰胺等范围，DFT锂促进氧化加成解释仍为支持性证据。
5. CCS Chem `10.31635/ccschem.025.202506810`，**真实2026-01-11首次在线**，源Q3 issue 2026-08-01不可靠；Ir光催化还原活化脂肪族叔酰胺交叉偶联，Crossref-only出处，`metadata_only`，不改变7—9月发表统计。

每篇均有与不可变元数据来源匹配的 source root、raw Git blob、review queue Git blob、64位 SHA256、在线日期、反向挑战；同一模型两轮论证，不伪称两个独立人类审稿人。证据文件 `audit/historical-reviewed/2026-10-16-q3-four-plus-ccs-q1-originals-two-pass.json`；学术含版权权限测试 `scripts/test-historical-q3-four-ccs-q1-methods-20261016.mjs`。

### 纠正跨季度统计器并实际复测

`scripts/historical-q3-reconciliation.mjs` 现在仅在 DOI、`stageDateIsIssueNotPublication`、官方 first online、源窗口与 SHA256 及Q1 `metadata_only` 凭证全部匹配时，把出现在Q3源目录里的已批准Q1论文归为 `publisher_verified_outside_Q3`，避免将其误归入Q3 `approved_waiting08`。逆向伪造源SHA或官方日期的测试会触发失败。无篡改冻结源、无删除真实Crossref来源。

第二次 staging 复算仅调用原有 `historical-triage-bootstrap.yml` staging-only trigger `audit/automation-triggers/historical-review-triage-bootstrap.json` 版本18，触发main提交 `91e089607326e3c94fa1ce8c644db36d7644abe4`。完整回读：
- `audit/historical-staging/quarter-2026-q3-coverage.json` Git blob `c44658cd2f089fe3047f74473253e9db8d855023`，`generatedAt=2026-10-16T03:44:46.487Z`；Q3正式851，Q3 192/192 metadata根，来源 DOI12286，未审11186，Q3批准待08为66，跨季度首次上线证实11，出版社正式期次闭环仍为false。
- 同代工作表 blob `156a6f87cac30cf91abf4377bb0ae1df62b6ae97`，生成时刻完全一致、未审11186。
- 全历史 global ledger blob `1cc6e55454c0f232e15fea0359608fc1f35dc2de`，生成2026-10-16T03:44:45.174Z，原始DOI57266、完整source窗口396/3600、审核待发布67、审稿状态不同步 **0**。
- 保留27个真实OpenAlex授权失败源根，不虚报收录闭环。

## 正式发布与边界

生产 `public/toc-demand-live.json` 正式 **1,186** 篇，其中历史 **122**，累计已批准 **189**，待正式 **67**；不会越过唯一北京时间 **2026-10-17 08:00** 正式历史文献入库槽。不得把批准当成生产上线，且学术信息属于 Q1 的 CCS 记录必须按本来首发季度展示。没有Cloudflare D1查询或写入、媒体/PDF/正文抓取、18:00替代发布、Today/Hot/公众号新增混入。

仍未解决的两个上轮原始日期待核及本轮其他按 DOI 保留的验证项，不因学术回溯完成而强制通过。重点 `10.1021/acs.orglett.6c02707`、`10.1021/acs.joc.6c00852`、`10.1021/acs.joc.6c01242` 有不同正式展示日期须核；`10.1021/jacs.6c08814` 主要材料/合成方法范围待挑战；`10.1021/acs.orglett.6c03772` 单骨架衍生范围待审核。全历史大范围出版社期次完整性仍未证实；OpenAlex免费API密钥必须由用户合法配置Actions secret `OPENALEX_API_KEY` 才能消除原27个验证失败源根。

**Issue同步**：[历史回溯Issue #498 最新验收回报](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6207613064)。本条回复同步保存至Git，不触发生产发布。

## 终结时向用户补充的结论

本次五篇学术审核和跨季度来源分类修复已通过六组CI并合并；两轮staging已实证复算。未审数量下降、Q1误归类修复以及全历史审核缓存归零均为实际审计读数，不是预计值。下一工作应继续Q3逐篇审核和出版社Research目录核实；27个OpenAlex授权失败根仍未完成。正式发布仅能在下一次北京时间08:00通过门禁，不能承诺本轮已上线。
