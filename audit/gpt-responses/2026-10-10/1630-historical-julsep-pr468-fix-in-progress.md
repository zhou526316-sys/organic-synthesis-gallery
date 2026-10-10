# 2026-10-10 16:30 北京时间：7–9月历史文献标题和TOC-only 修复进展

用户请求：解决7—9月仍显示待核验的英文标题，只需要补抓TOC，不新增PDF/正文图；历史补录不进入每日新增。随后的继续要求本轮完成代码、测试和生产验收。

修复PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/468

目前已完成：
- 将历史来源标记、旧论文10月补录兜底与 TOC-only/metadata-only 分离，同时修改前端卡片、Hot落地、新增判断、D1索引投影、TOC demand生成和Tampermonkey抓取队列的媒体排除逻辑；对已有正确PDF/图片字节和许可一律保留，对2026-10-01以后真正新发表论文继续原有采集流程。23:00夜间只抓候选和审核，不进行正式发行。正式新增只有08:00。
- 按Crossref DOI/期刊/2026年份/第一作者元数据核查73条静态英文标题缺口，另10条通过ACS/Nature/Crossmark来源核对；83条标题显示修复候选已保存在shared/verified-historical-title-repairs.js，只在原英文标题为空/待核验时应用，不擅改正式保护的文献权威主数据。明确不等于83篇线上仍缺标题，也不等于7–9月收录完整。
- DOI 10.1021/acs.orglett.6c02293 的ACS完整原标题补齐副标题，避免截断。
- 恢复PROJECT_RULES.md原样，用户新要求保存 docs/historical-backfill-media-contract.md。保留并行主线已完成的卡片分享和PDF相关代码。PR修复分支对main完成无强推双父提交58b22966cdce5856e22700ef91d85867e9c7e742；PR可合并，但未合并。
- 较早PR head 88ac8f2514024f38e8982d9913bb2a130cbaaae6 曾通过历史专项、Site quality、移动和多个媒体抓取回归；当时唯一Tampermonkey保护守卫失败源于受保护PROJECT_RULES改动，已从PR移除。最新合并后head的28项Actions截至16:28北京仍处于排队，不能据此声称新head已通过。
- 尚未合并PR到main、尚未发布生产Pages/Worker、尚未浏览器真实核验新版本；需在CI运行后完成部署核查。

风险说明：
- 23:00自动化任务已建立，但覆盖16刊历史创刊至今的生产级collector仍须另行正式实现和验收；该任务不等于上线采集器。
- Tampermonkey已有用户浏览器是否更新到新代码，需检查真实发布Userscript安装版本与桥接入口，不应把GitHub源码合并冒充浏览器已装。
- 不删除任何已存在PDF或正文图。
