任务配置已经更新完成。

当前三个启用任务都已同步新规则：
- 主更新：北京时间 08:05 / 18:05。
- 第一兜底：08:25 / 18:25。
- 最终终检：08:50 / 18:50。

已加入的关键规则包括：
1. 聚合合成方法学属于收录范围；“产物是聚合物”不能作为排除理由。只有纯材料性能/器件加工/特定材料制备且没有可推广聚合方法学时才排除。
2. 强制双遍对抗式语义审核；accepted 和高相关 rejected 必须记录 evidenceBasis / challengeDecision / challengeReason；两遍不一致只能 pending。
3. 每本 active 期刊必须记录 publisher sourceChecks。
4. 必须通过 capability test 和端到端 literature quality gate 才能宣告完整完成。
5. 对 OA 文献，若有合法公开 PDF/HTML，优先 official TOC/graphical abstract；若无官方 TOC，可从公开 PDF/HTML 提取高清正文反应图/合成路线图作为 figure fallback，目标约 2000 px 长边或 220–300 dpi，并保留来源/OA证据。
6. OA 媒体失败不得阻塞文献卡片上线。

需要明确：目前“任务提示和执行规则”已经更新，但 OA 高清图片抓取的实际代码链路还在继续核查/接入，不能仅因为任务提示已经改好就声称 OA 自动抓图功能已经完成。下一步要验证项目中实际存在 OA PDF发现、下载、高清图提取、媒体写回、网页显示和回归检查的完整链路。