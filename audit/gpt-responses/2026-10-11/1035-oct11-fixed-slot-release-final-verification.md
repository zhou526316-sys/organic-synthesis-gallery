# Organic Synthesis Gallery｜2026-10-11 08:00 固定发布最终续验

**结论：本次21篇 DOI 已真实写入并部署到 Gallery 正式网站，正式目录959篇。** 今天的技术时间窗口由用户仅针对10月11日08:00固定槽授权延长至北京时间12:00；未新增12:00或18:00发布任务，未来日期仍按原08:00与通常60分钟技术窗口执行。

## 已完成的真实验收

| 项目 | 结果 |
|---|---|
| 原始固定发布槽 | 2026-10-11 08:00 Asia/Shanghai |
| 用户批准的本槽技术截止 | 2026-10-11 12:00 Asia/Shanghai，仅本日 |
| 完整双遍审核候选 | 71（include 21 / exclude 50 / pending 0） |
| 预发布 Gate | #38104133784，success，严格预审、slot freshness、正式转换全部通过 |
| 授权固定 Writer | #38104156889，success |
| 原子生产提交 | `1a2f6d32f9b8d2815f9d7b3922c7e23cd650ef23`，北京时间10:08:31 |
| 发布后生产总量 | 959 unique DOI（原938，新增21） |
| 生产 marker blob | `b48192fcc7a1acb3ba87190283c74432623e9ecd`，schema2 / slot-release / 8 protectedBlobs |
| TOC demand | `public/toc-demand-live.json` 为959篇，21篇均已标记 addedDate=2026-10-11 |
| Pages | #38104280590，success；`literature_authorization`、build、deploy 均通过 |
| 正式交付回执 | `audit/deployment-delivery-latest.json`：ok=true，runId=38104280590，959篇，中文标题/架构验证通过 |
| 网站生产同步状态 | `audit/literature-update-state.json`：phase=synced，publicationChecksPassed=true |
| 用户原12篇历史pending | 10篇纳入 + 2篇明确排除，持久化pendingReviewBacklog已清为0 |

## 正式主站实际数据验证

直接读取 https://gallery.gczhouwld.com/release-delivery.json ，确认 `publicationSlot=2026-10-11T08:00:00+08:00`、`productionCards=959`、`dois.length=959` 且959条全部唯一。生产marker中的21条 `publishableDois` 在线上全部存在（21/21）；50条本批次排除DOI与全部deferredDois均未出现在交付数据。线上marker SHA与正式仓库完全一致。原有github.io地址会重定向到自定义主站，并非两个相互独立的数据源。

**每日新增显示19篇而非21篇并非漏发布。** 两篇9月原始发表的 CCS Chemistry 文献——`10.31635/ccschem.026.202608472`（2026-09-27）与 `10.31635/ccschem.026.202608262`（2026-09-22）——按历史回溯展示规则不计入每日新增，但本次实际发布且存在于959篇总库。

## 发布后来源审计与闭合情况

- 真正的发布后 DOI-union 机器审计 #38104471001 已完成，最新 paired `latest.json` / `unresolved-latest.json` 生成时间为 `2026-10-11T02:14:40.329Z`。
- 959篇生产 DOI 为审计基线；Crossref/OpenAlex严重来源故障0、来源家族缺口0、历史覆盖损失0；保留来源覆盖警告4与历史闭合覆盖警告5，不错误报告全面已核验。
- 审计最终仅剩 `10.1021/acscatal.6c06048`（*Mild Heterogeneous Thiophene Hydrogenation Enabled by a Modified Palladium Catalyst*），已单独完成文章特定的双遍复核，保存为 **2026-10-12 08:00** 下一合法槽的include carryover；这不是10月11日的第二次新增。
- 当天发布后另外3条晚发现DOI已按实际摘要审查为非目标范围exclude，并保留记录：`10.1038/s41467-026-78616-4`、`10.1021/acscatal.6c05210`、`10.1021/acscatal.6c05837`。
- 当前 `reviewComplete=false` 反映尚有下一槽carryover及未完全闭合的来源覆盖深度，不影响已验证的959篇交付成功，不能声称所有新发现与历史coverage均已完全闭合。

## 严格质量门禁的独立限制

本槽最新正式 Pages 交付、DOI唯一性、全部21个纳入DOI和排除集合均已独立复核通过；**但在Pages成功之后尚未取得新的 `Validate literature update quality` GitHub Actions 成功run**。此前 #38104459921 是部署前运行，当时仓库959、线上仍938，按预期失败，不能据此否定其后的正式部署；也不能将成功部署、网页回执或文字核验冒充该独立质量门禁成功。一次试图通过原审核触发文件运行部署后quality gate的GitHub写入被安全检查拒绝，因此没有绕过拒绝或另开发布任务。此项独立质量门禁状态为 **未完成**。

## 稽核入口

- 固定writer: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38104156889
- Pages正式部署: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38104280590
- 发布后机器审计: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38104471001
- 真实交付文件: https://gallery.gczhouwld.com/release-delivery.json
- 网站: https://gallery.gczhouwld.com/

**最终判定：2026年10月11日21篇文献已正式上线，959篇公开生产 DOI 集合一致；独立部署后GitHub严格质量Gate尚未获得新的成功run。未新增晚间准入槽，亦无重复writer提交。**
