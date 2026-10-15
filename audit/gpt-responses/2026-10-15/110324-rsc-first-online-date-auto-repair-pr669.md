# 2026-10-15｜Organic Synthesis Gallery：Chemical Science 首发日期待核修复报告

本次问题的根本原因已查清，自动核验缺口已修复并部署到唯一生产基线 main，但原始外部日期仍不充分的四篇论文不能伪造首发日。

## 为什么会有“日期待核验”

以下四篇 Chemical Science 论文的 RSC/Crossref DOI 记录存在年份级 publication date，`published-online.date-parts=[[2026]]`；2026-10-14 是 Crossref 的 `created/deposited` 日期（DOI 登记/提交），并非证实的 `First published`：
- `10.1039/d6sc06226a`
- `10.1039/d6sc05550h`
- `10.1039/d6sc07058b`
- `10.1039/d6sc06967c`

本轮逐篇核对 RSC 官方页面、Crossref 原始记录、Europe PMC DOI 精确索引。RSC 对自动读取仍返回 HTTP 403；Crossref 仍只有年份，有一次请求返回 429；Europe PMC 目前无这四篇的精确发表日索引。无法据此合法填写具体年月日。用户已作出的这四篇论文范围纳入决定依旧保存，延期的是公开发布时间的核实，不是撤销范围决定。

## 完成的工程修复

1. 新增 `scripts/lib/rsc-first-online-rescue.mjs`：DOI 强匹配的 Crossref `published-online` 精确日→RSC `First published`/明确 online meta→Europe PMC `firstPublicationDate` 三层核验；阻断、超时、年份级日期、未来日期均明确区分。禁止用 Crossref created/deposited、RSS feedDate 或预印本日期替代正式首次在线日。
2. 直接接入现有 06:55 DOI-union 机器审计 `cloudflare/scripts/audit-literature.mjs`，优先从持久化 `publicationDateVerificationBacklog` 选取 DOI，每轮有界核对，不增加第二个定时任务。即使 DOI 不再出现在当天常规 Crossref/OpenAlex 来源联合集合中，也按原 DOI 查证；一旦证实并且持久队列中有合法 DOI 身份与标题，可以恢复到正式候选审查，不直接修改生产文献。
3. 最新 `audit/latest.json`、`audit/unresolved-latest.json` 保留 `rscFirstOnlineDateRescue` 的 DOI、来源 URL、状态与日期证据，原有待核队列不因窗口滑动消失。
4. 新增 `scripts/test-rsc-first-online-rescue.mjs` 并纳入 `scripts/test-literature-completeness-capability.mjs`：年份/月份不补日、来源 DOI 不匹配拒绝、错误日拒绝、RSC/EuropePMC 成功回填、403/429 保留、未来日冻结、旧队列强制重试等回归测试。

代码已通过 [PR #669](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/669) 合并到 `main`，合并提交 `32a809e144248e07669b9ce96a4b61cfccb89733`。能力注册表 `audit/literature-capability.json` 已对齐最新稳定脚本和 guard，提交 `6d42e6911427ffd760a26cfb26783b5f8f0ff6d8`，且其六组件 SHA256 fingerprint 经重新计算与注册表一致。

## 真正执行的验收

PR 最新版本以下 CI 全部通过：
- Publisher DOI recall regression run `38673570022`，包含完整 16 刊的真实只读机器发现验收。
- Site quality gate run `38673570098`。
- Cloudflare migration CI run `38673570036`。
- Target journal Tampermonkey capability regression run `38673570044`。
- Private PDF capture v2 regression run `38673569916`。

合并触发的正式 16 刊机器审计 [run 38673793730](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38673793730) 成功。两份正式快照 `generatedAt=2026-10-15T02:59:49.662Z` 严格一致，`unresolved=25` 与实际 compact 数组长度 25 相同；`criticalSourceFailures=0`、`sourceFamilyGaps=0`、`historicalCoverageLosses=0`。日期解析器实际核对 12 个 DOI，正式本轮无确切新首发日，因此 `rscFirstOnlineDateResolved=0`（没有捏造成功）；上述四个原本被系统持久化的待核 DOI 均逐篇完成三来源尝试，真实失败/缺少日期有完整回执。此前 PR 只读测试在不同候选中取得过两篇有独立精确日期的成功案例，说明回填路径可运行。

## 仍需区分的结果

**已经完成**：解决“四篇保存在队列但每天普通抓取可能漏掉、系统没有自动跨来源再次查证”的流程缺陷，GitHub 真实合并和正式机器审计均成功，更新稳定能力记录。**尚未取得**：RSC 或独立索引公开的这四篇正式文章确切 First published 日期，不能称四篇日期已全部补齐。之后在原有自动审计取得有效日期时，会保留可核验来源并供下一次固定 08:00 审核使用，不因日期待核阻挡其他合格 DOI。

本次未创建/改变定时任务，未恢复 18:00 文献新增，未通过手工日期填充放行四篇，未抓取正文/图片/PDF，也未修改公开文献数据。

**相关提交**：`32a809e144248e07669b9ce96a4b61cfccb89733`、`6d42e6911427ffd760a26cfb26783b5f8f0ff6d8`。
