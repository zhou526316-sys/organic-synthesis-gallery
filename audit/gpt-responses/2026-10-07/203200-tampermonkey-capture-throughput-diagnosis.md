# Tampermonkey capture throughput diagnosis

北京时间：2026-10-07 20:32+08:00

用户反馈：不仅启动慢，实际抓取也慢，而且几乎没有收获。

本轮只读核查最新 20 篇 Tampermonkey 回执、代表性 Nature/RSC/Chem trace 和当前调度代码；未在本轮直接修改抓取逻辑。

结论：
- 最新 20 篇：3 篇完整 success，16 篇主要为 toc_not_found，1 篇 Elsevier bound_publisher_heartbeat_missing。
- RSC 11 篇：3 篇 TOC 已有/成功，8 篇 TOC not_found；正文图 0；8 篇全文 stored；11 篇 PDF stored/already_stored；平均单篇约 63 秒。
- Nature 7 篇：全部 TOC not_found，正文图/全文/PDF均未请求；平均约 23 秒。
- Science 1 篇：TOC not_found，约 39 秒。
- Elsevier/Chem 1 篇：60 秒 bound_publisher_heartbeat_missing；该 DOI 当前 attemptCount=49。
- 代表性 Nature Chemistry DOI 10.1038/s41557-026-02238-y addedDate 为空、原始 date=2026-08-27，不属于 Oct-1 bundle，但已累计 13 次尝试；Science 10.1126/science.aej0194 同为 2026-08-27，累计 30 次尝试。
- RSC 10.1039/d6sc06874j addedDate=2026-10-05，属于 Oct-1 bundle。trace 显示落在 shallow RSC landing page，textLength约 3348，正文图扫描连续 isolated_labels=0;variants=0，仅识别到被正确拒绝的 pdf.gif page preview；全文 evidence stored，PDF already_stored。
- 代码级根因：articleUrl() 的 figureJob 和 resolvePublisherTaskUrl() 的 RSC wantsFull 均只考虑 captureFigures/captureEvidence/mediaNeed，却遗漏 opportunisticFigures/opportunisticEvidence。coverageJobNeeds() 又会把 mediaNeed 收窄为 toc/pdf。因此 Oct-1 “一次访问顺带抓正文图/全文”可能仍走浅层落地页。
- 旧 Nature/Science TOC negative results 与 Elsevier heartbeat failures 在显式 Start 时会被再次拉回，形成高 attemptCount 的重复无效工作。

建议下一小批，仅三项：
1. 路由选择纳入 opportunisticFigures/opportunisticEvidence，确保 Oct-1 bundle 对支持出版社直接走全文/正文媒体路由。
2. 对当前适配 revision 已经确认的旧 Nature/Science TOC terminal miss 做版本化隔离；adapter revision/证据变化后才自动重试，不因每次显式 Start 重跑。
3. Elsevier bound_publisher_heartbeat_missing 变为快速、版本化 terminal route failure，避免每次固定浪费 60 秒；route revision变化后自动解封。

RSC DOM selector 不在本批同时修改。先修全文页路由，再观察真实全文 DOM；若仍 0/0，下一批再针对 RSC DOM。

用户可见回复已在本轮回答中给出。