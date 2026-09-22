这部分现在已经完成闭环。

当前最终状态：

- 最新机器审计：sourceRecords=511，galleryDois=503。
- missingFromGallery=0。
- unresolved=0。
- criticalSourceFailures=0。
- sourceFamilyGaps=0。
- sourceCoverageAnomalies=0。
- historicalCoverageLosses=0。
- closureCoverageAnomalies=6，因此 verifiedThrough 仍保持在 2026-09-20；系统没有把 9 月 21 日错误宣布为来源闭合。
- state 已从旧的 499 修正为 503，phase=synced。
- 独立 literature quality gate run 35695917172 已成功，不再是之前的红灯状态。

本轮补齐的审核由三个批次组成，共 reviewed=13、accepted=4、rejected=9、pending=0：
1. 范围纠错收回 3 篇此前误排除的聚合合成方法学：
   - 10.1021/jacs.6c13641 — Alternating Copolymerization of Arynes and Aldehydes Enabled by an N-Arylamine Initiator
   - 10.1002/anie.7101768 — Controlled Cationic Ring-Opening Polymerization Enables Chemically Recyclable Polyacetal-Based Polyurethanes
   - 10.1002/anie.9519061 — Fine Tuning of Catalyst Active Sites to Access Advanced Ultrahigh-Melting Polyolefins
2. 6 条晚到候选中收录 1 篇：
   - 10.1021/acs.orglett.6c03921 — Cascade Spirocyclization–Difunctionalization or Rearrangement of Bicyclobutyl-Tethered Aldehyde Hydrazones via Strain Release
   其余 5 篇均有明确双遍审核排除理由。
3. 后续又出现 4 条晚到候选，全部完成双遍审核并排除。

生产一致性已核验：
- GitHub Pages 实际部署的 automation-supplement.json 已确认包含上述 4 个最近新增/纠错 DOI。
- 最新审计独立报告 galleryDois=503。
- state 的 lastWebsiteSync 也已经更新为 totalGalleryCards=503 / galleryDois=503。
- 数据提交包括 98b77b23cbb86fd277c84a2495fbf3563fa91（3 篇聚合方法学范围纠错上线）和 fc0dac7b75cbfedbae064fafd113b9d5d277c7bc（晚到 Organic Letters 方法学上线）。
- state 对账提交为 3c25ecd64479c3db4a81f8c00f45ef2a9a515e48。

TOC/正文图策略已经按最新要求固定：
- OA PDF/HTML 自动提图链路不再新增、不执行。
- TOC、Graphical Abstract、Figure1/正文图全部交给 Tampermonkey/VPN Bridge。
- 文献更新主线只负责生成/刷新 demand 队列。
- 当前 live TOC demand：visibleGapTotal=2，missingOfficialTotal=67，officialUpgradeTotal=65。
- 媒体缺失不阻塞正确文献卡片上线。

三个 ChatGPT 定时任务也已同步这一分工：
- 主更新 08:05 / 18:05。
- 第一兜底 08:25 / 18:25。
- 最终终检 08:50 / 18:50。
三者都明确禁止新增 OA PDF 自动提图，并统一把媒体缺口交给 Tampermonkey。

因此，现在“6 条未决 → state 纠正 → audit/quality gate 重跑”这部分已经真正做完，不再停留在“任务已安排”。需要继续观察的唯一非闭合项是 9 月 21 日 OpenAlex 等第二来源的 closure coverage 滞后，所以 verifiedThrough 保守停在 9 月 20 日；这不会阻止已经审核完成且上线正确的 503 张卡片。
