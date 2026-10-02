# New-only summary publication scope and delivery boundary

Beijing date: 2026-10-02. Context: user instructed “9.20之前的摘要就不管了，专心把新的摘要都上线了。”

Confirmed scope: canonical article first-online date >= 2026-09-20, inclusive; preserve older published summaries; no older backlog generation; complete, partial and abstract-only evidence remain eligible at appropriate depth. No changes to literature-card admissions, TOC demand, capture behavior, paused feedback, or 08:00/18:00 literature schedules.

Scope policy and the scheduled-summary contract were updated. The existing daily 12:00 Asia/Shanghai summary automation was re-enabled in this turn; this is a configuration result, not evidence of a later successful scheduled run.

The initial reviewed 156-record transport passed every part, compressed payload and decoded payload integrity check in publication run 36971477472, but its current-evidence validation failed before a production write. Fresh encrypted handoff run 36971693619 / artifact 11212201041 was retrieved for reconciliation. New derived summary text and a narrowly specified source/metadata reconciliation were recorded, and production delivery was wired to the existing Worker and Pages deployment workflows with per-DOI read-only acceptance.

Do not count staged candidates, a successful source commit, or a deployment trigger as completed publication. A final successful production deployment and full per-DOI acceptance result were not confirmed in the user-visible report below. The current production count must be read from actual delivery evidence rather than inferred from candidate counts.

## User-visible reply

已把摘要处理范围改为 **2026 年 9 月 20 日及以后发表的文献，包含 9 月 20 日当天**，按文献的首次在线发表日期判断，不按抓取日期判断。

9 月 20 日以前不再补摘要；已经上线的旧摘要保留。新的文献优先处理：有完整正文就总结完整材料，只有部分正文或 Abstract 就按已有内容发布，不再等全文齐全。

原有的 **每天北京时间 12:00 摘要发布任务已恢复启用**，范围同步限定到上述新文献；没有另建重复的定时发布任务，也没有改动 08:00／18:00 的文献更新。

本轮已经准备新的双语摘要，并处理发布前发现的材料版本变化。**但最终生产部署及全量接口验收尚未取得确认，因此这批不能报作“全部已上线”。**
