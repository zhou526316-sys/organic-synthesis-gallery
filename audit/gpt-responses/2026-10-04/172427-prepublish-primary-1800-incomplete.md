# 2026-10-04 18:00 发布前主审核回报

本轮发布前主审核已完成逐篇判断，但发布槽状态为 `preparing / incomplete_review`，未通过发布门。8 篇 compact 候选全部完成双遍审核：0 include、3 exclude、5 pending。由于不存在可发布白名单且仍有真实 pending，本轮不是“最终零新增”；未修改生产卡片、媒体数据，也未请求或触发部署。

## 明确排除

1. `10.1038/s41467-026-78130-7` — CCL21基因修饰树突状细胞疫苗联合帕博利珠单抗的I期临床试验，属于临床免疫治疗研究。
2. `10.1038/s41467-026-78452-6` — c-di-GMP核糖开关相关小蛋白与艰难梭菌孢子形成，主要贡献是细菌信号与发育调控。
3. `10.1038/s41467-026-78126-3` — 虽使用点击化学组装多价抗病毒Fc偶联物，主要贡献仍是病毒交联机制、药代和抗流感疗效，未建立新的通用有机合成方法。

## 待补证

- `10.1021/acscatal.6c06578`：尚缺ACS文章类型、摘要、原创反应实例、底物/产物范围和分离制备证据。
- `10.31635/ccschem.026.202608090`：已确认Scientific article及实验数据存在，但仍缺亚胺/亚胺鎓底物、产物系列和分离收率，无法区分一般制备方法与电场催化机理平台。
- `10.31635/ccschem.026.202607590`：新增官方片段证明宏环化、Pd催化C–H烯化及Suzuki宏环化步骤，但仍缺完整起始物、产物系列、分离收率和方法可迁移性证据。
- `10.31635/ccschem.026.202607612`：尚缺螺硫吡喃成键/交换的底物、产物、可分离制备范围和主要贡献边界。
- `10.31635/ccschem.026.202607659`：官方片段确认对象为强交联纤维增强环氧复合材料及氧化–Cope消除路径，但仍缺具体回收产物、物料衡算、树脂范围和一般聚合物化学方法证据。

上述条目均保留原日期、原来源review、已尝试页面和下一步动作。越窗的 `10.31635/ccschem.026.202608472`、`10.31635/ccschem.026.202608262` 继续保留。历史边界项中，`10.1021/acs.joc.6c01559`、`10.1002/anie.9519061`继续retain/include；`10.1021/acs.orglett.6c03499`、`10.1021/acs.orglett.6c03386`、`10.1021/acscatal.6c05520`继续retain while pending。已部署删除的 `10.1038/s44160-026-01164-8` 未恢复。

## 发现与审计

- 范围契约：`scope-2026-10-02-v1`
- fresh audit：2026-10-04 17:13（北京时间）
- active期刊：16本，完整覆盖
- gallery DOI：785；source records：778；compact候选：8
- `criticalSourceFailures=0`
- `sourceFamilyGaps=0`
- `sourceCoverageAnomalies=1`（CCS Chemistry）
- `closureCoverageAnomalies=3`（Nature Communications、JACS、Angew）
- `verifiedThrough`保持`2026-09-20`

[机器审计 run 37191409007](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37191409007)成功，latest/compact同代且计数一致；候选覆盖与双遍字段检查完整。

## 发布门结果

[预发布质量门 run 37191889607](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37191889607)按安全约束失败：

- 基础record validation通过，`snapshotFreshForSlot=true`；
- 正式转换预演拒绝 `pending_without_includes_is_not_final_zero`；
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`实际运行并返回`publicationReady=false`；
- 阻断项：`reviewed_release_subset_not_ready`、`pending_without_publishable_includes_is_not_final_zero`、`zero_new_requires_complete_publisher_source_proof`；
- 严格validator步骤因转换预演先行安全停止而未到达；未伪报通过；
- `productionDataModified=false`。

[最终审核文件](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/prepublish-review-2026-10-04-1800.json)

staging提交：`e35bb1b202c35081bdf9e80471af3150569c2504`  
state提交：`3165faa4327b31e286b0e58096700b547b90d38e`  
回报同步提交：本文件所在提交。
