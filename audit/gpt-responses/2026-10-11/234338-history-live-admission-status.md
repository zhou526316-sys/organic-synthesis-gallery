# Organic Synthesis Gallery — 历史回溯文献是否已上线

- 北京时间：2026-10-11T23:43:38+08:00
- 聊天任务：历史文献回溯进度核查，用户问“有上线的回溯文献吗？”
- 正式仓库：zhou526316-sys/organic-synthesis-gallery；main 快照：4d43b603a55c22a527b553987c0ca4c1964ab437
- GitHub 正式发布标记：audit/publication-release-state.json，productionCards=959，2026-10-11 08:00 槽，21 篇普通正式新增。
- GitHub public/toc-demand-live.json：959 DOI；未含可查证 `ingestionChannel: historical_backfill` 或 `mediaPolicy: metadata_only` 的文章。
- 真实线上 https://gallery.gczhouwld.com/toc-demand-live.json 独立读取：959 条，包含两个下面的 DOI，且都标记为 addedDate=2026-10-11 / mediaPolicy=toc_only；网站首页原始文本抽取返回 empty_content，因此未宣称手动打开卡片详情/搜索点击验收已完成。
- 历史 staging: staging/historical-archive-nightly/audit/historical-staging/state.json，completed=16, cursor 2026-09-15—21 JACS；2026-09-22—30 全 16 刊候选 DOI 1,206 个（跨刊去重后 1,206），扫描时 Gallery 已有 230 个、unfinished 976 个。
- 将全部 16 批候选 DOI 与当前正式站点 959 DOI 交集核对：原有 230 仍在线；另外仅 2 个（扫描时 existingGalleryRecord=false）现已在正式站点出现；目前该批次尚未出现在 Gallery 的其他候选 974 个。
- 两篇交叉记录（都属于 CCS Chemistry，都是正常每日上午发行的审核结果，不是独立历史回溯准入记录）：
  1. 10.31635/ccschem.026.202608262，Electrocatalytic Carbon Dioxide Reduction Coupled with Alcohol Oxidation；出版 2026-09-22，added 2026-10-11。2026-10-11 日常 formal review accepted 记录有明确 user DOI-specific include decision。
  2. 10.31635/ccschem.026.202608472，From Non-Aqueous to Aqueous: Water-Engaged In Situ Electrochemical Reconstruction of Carbazoles；出版 2026-09-27，added 2026-10-11。日常 formal review accepted 记录也有明确 user DOI-specific include decision。
- 这两篇在 public/rolling-supplement.json 内均 `new: true`，并明确包含于 audit/review-2026-10-11-0800.json、audit/publication-release-state.json 的 21 DOI 正式发布清单。不能把它们归功于历史回溯专线已完成独立双遍审核、历史入库、归档索引。因此 **可明确核验的专线新增=0；已有线上历史候选重合=2（通过常规发布）**。
- 严格限制：TOC demand 的数据结构本身不会总是暴露入库渠道，不能仅凭该字段缺失断言所有 D1 记录状态；结合当前 staging 无历史准入记录、明确常规正式审核和公开目录，仍无专线入库成功的正面证据。
- 现有七至九月 TOC-only 老论文早已在 Gallery 目录，这和“2026-10-11 开始的全历史回溯计划已新增入库”不是同一指标。
- 未更改正式目录、历史 staging、08:00 单一发布和 23:00 采集任务。
 
## 用户可见答复（ substantially complete ）
目前没有证据表明历史回溯专线的论文已经正式上线。正式线上目录是959篇；2026-09-22至30历史采集候选1206篇，其中扫描时230篇早已在Gallery，976篇未收录。在这976篇中有2篇CCS Chemistry文章在10月11日普通08:00正式发行批次上线，分别为 DOI 10.31635/ccschem.026.202608262（二氧化碳电催化还原耦合醇氧化）和 10.31635/ccschem.026.202608472（从非水到水体系：水参与的咔唑原位电化学重构）。它们同历史候选有重合，但不是独立历史回溯渠道的审核准入结果。其余974篇仍未进入正式目录，继续等待按现行范围双遍审核以及单独的历史归档索引准入。当前不能把1206候选、已有七至九月老论文和正常日更的两篇混为“历史回溯已上线”。 
