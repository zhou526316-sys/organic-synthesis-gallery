Organic Synthesis Gallery｜2026-10-08 中断续验及显示 21/28 差异审计

本轮没有重新抓取、重新入库或重复发布；检查了现有 Oct-08 08:00 单一固定槽的原子 release marker、Pages 线上回执、TOC demand、发布后机器审计、浏览器真实筛选、质量门禁以及最终协调状态。

一、实际生产发布
- 原子文献 release commit: 3d4bd44146d9b2cab2bda35e09b159161b0b7195；mode=slot-release，publicationSlot=2026-10-08T08:00:00+08:00。
- 生产 DOI 总量从 859 增至 887，新增28篇；formal include=28，exclude=180，pending=7。
- TOC demand refreshed commit 81811f7d2b38f1e67df9808515b7e759af30c1b0；webpageDoiCount=887。
- Pages run 37709096134 finished success with authorization, build, deploy and dual origin verification. Latest successful receipt run 37711099940 records 887 cards, Chinese titles verified, verifiedAt 2026-10-08T01:16:42.868Z，canonical https://gallery.gczhouwld.com/ 。

二、用户看到 21 篇 vs 实际28篇
逐篇读取 public/rolling-supplement.json 确认：28 个已批准 DOI 全部存在，全部带 addedDate=2026-10-08 且 new=true、titleZh 存在。其中21篇有不晚于当日的完整 date 字符串；6篇RSC date=""、dateUnverified=true、Crossref createdDate=2026-10-07；另1篇Science Advances 10.1126/sciadv.aed4187期刊字段 date=2026-10-09，但于2026-10-08收录。
通过独立实时浏览器访问 canonical Gallery，在所有期刊、日期筛选为空的初始状态点击“仅新增”，前端精确显示28篇（Showing 1–24 of 28，分2页）；未复现21篇为默认的新文献总数。另通过线上 architecture-v1/release.json.hotHeadInline.dateBuckets 核实 addedDate=2026-10-08 的桶：6（发表日期未知）、1（期刊标注次日）、20（出版2026-10-07）、1（出版2026-10-06），和为28；recordCount=887。按正式发表日期不晚于当日且非空过滤恰为21，因此用户会在带有日期范围筛选、或只看已确认发表日期时见到21，但无法观察其个人浏览器保存的筛选设置。既有仅新增 checkbox 对 addedDate 判定，若无日期筛选应显示28，故未修改生产日期或发布数据，也没有为了匹配21而改变口径。

三、发布后检查
- Post-release DOI-union audit 37709307724 success：galleryDois=887, unresolved=7，criticalSourceFailures=0，sourceFamilyGaps=0，historicalCoverageLosses=0；7项均为正式 pending，历史非期刊 DOI 诊断仍可追溯。
- Post-delivery literature-quality-gate 37713174970 success。
- Finalizer 37713254241 success；最终 coordination state: phase=synced_with_pending, publicationChecksPassed=true, reviewComplete=false，pendingReviewBacklog=7，nextSlotPublicationBacklog=0，verifiedThrough 未跨来源/证据缺口错误前移。
- 每天北京时间08:00仅一个正式新文献准入槽，18:00仍取消。没有修改 schedule，也没有绕过 Pages 授权。新上线已确认，无需再推送同一批 DOI。

用户若仍看到21篇：勾选“仅新增”，清除日期范围与其他筛选并刷新；首次页显示24/28，其余4篇在第2页。手机端分页尺寸可不同，关注总结果数28而非当前页数量。
