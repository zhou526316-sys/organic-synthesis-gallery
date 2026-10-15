# Organic Synthesis Gallery｜2026-10-15 08:00 正式发布故障与恢复报告

记录时间：北京时间2026-10-15 09:19。唯一发布时点仍为北京时间08:00，普通技术宽限截止09:00。main唯一生产基线；正式网站 https://gallery.gczhouwld.com/。

## 本轮结论

**今日新文献未正式上线（incomplete_review / missed_slot）**。未在09:00之后启用替代槽，也未借用10月13日一次性特批路径。生产目录1087篇，TOC需求队列1087个唯一DOI，最后新增日期10月14日（20篇，反映此前4篇范围纠错）。10月15日没有新的合格正式审核文件、fixed-slot writer提交和新发布授权。不能宣称任何新增DOI已上线。

## 已实质完成的修复与证据

1. 07:05原「Gallery 发布前主审核」自动化（ID 6aafcf84ef7481919d285caa33ebe93d）在本轮核对时被停用；已于北京时间08:56通过原任务update恢复启用，排程仍为每天07:05。未改动其他任务。
2. 06:55的GitHub machine audit未按时产生10月15日配对快照。通过现有push恢复入口在main提交 `90159a086925a8c64b9e352b3f52c6574682b5da`；实际完成GitHub审计run `38662969933`（success），非正式发布writer。
3. 该恢复审计发现OpenAlex五刊（Nature、Nature Communications、JACS、Angew、Science Advances）取得首批200条后在第二页cursor返回401；因此五项关键来源失败及sourceFamilyGaps是真实而非可忽略告警。
4. 已将不依赖深度cursor、依据meta.count完整性检查的日期区间自适应分段修复提交PR #663；新逻辑保留单日超页、源401、响应元数据异常时的失败阻断。补充六项回归测试并在既有能力验收执行。修复同批纠正已正式入库DOI `10.1038/s44160-026-01189-z` 被陈旧CI误判为缺收候选的问题，不放宽独立核对。PR #663的13/13 CI通过，2026-10-15 09:16以 `3af5bb5fc94fd2fb10295c0335fe5ac12a159a3a` 合并main。
5. 合并后真正重跑GitHub机器审计run `38664760054`（success），配对 `audit/latest.json` / `audit/unresolved-latest.json` 的generatedAt均为 `2026-10-15T01:18:13.403Z`，覆盖截止北京时间10月15日。来源记录3030；**criticalSourceFailures=0，sourceFamilyGaps=0**，证实原五刊OpenAlex故障已修复且不是简单关闭预警。

## 未关闭的发布与覆盖风险

最新合法配对审计差集为209个待核查DOI（包括两项被新证据重开的旧排除），它们是待审核候选，不是209篇可以纳入的文献。没有当天完整逐篇双遍审核/正式prepublish review，不能执行formal conversion、固定writer或Pages部署。审计剩余sourceCoverageAnomalies=4、closureCoverageAnomalies=5，不能把verifiedThrough从2026-09-18虚假前推。官方出版社只获得13刊部分RSS，Nature Synthesis、Chemical Science、Green Chemistry三个源本轮blocked_or_unavailable；没有出版社逐期完整查证。另有29项出版社发表日期未验证。

原durable pending：`10.31635/ccschem.026.202608538`和`10.1021/acs.joc.6c01296`，没有伪造审核决定。10月13日用户已定案条目及10月14日四篇纠错不重复上线。2026-07-01以前历史metadata_only，7—9月TOC-only规则不变。图片/PDF仍由Tampermonkey/VPN Bridge处理。

合并触发的主线质量运行 `38664760080` 在新审计落盘前读取了修复前5项失败快照，因旧来源缺口及未审DOI而失败；不可据此宣称发布门禁通过。新审计本身已成功落盘，2026-10-15正式发布仍无授权输入，因此正式状态是 **审计故障已修复、发布未完成、complete closure未完成**。没有新的正式域名Pages文献上线回读可报告；本轮只核对了仓库TOC队列1087个唯一DOI及原质量记录仓库/页面1087的既有一致性。

## 证据链接

- 恢复请求提交：https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/90159a086925a8c64b9e352b3f52c6574682b5da
- 恢复审计：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38662969933
- 技术修复PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/663
- 技术合并提交：https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/3af5bb5fc94fd2fb10295c0335fe5ac12a159a3a
- 合并后验证审计：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38664760054
- 早于最新审计的质量门禁：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38664760080

严格保持北京每日08:00唯一发布时点；下一正常排程由现有任务执行，不创建18:00或补发新任务。
