# Bridge 2.2.21 — JOC before latest JACS priority diagnosis

Recorded Beijing time: 2026-09-23 09:32:40 +08:00.
Context: user asks why capture started with an already-illustrated JOC article instead of the newest JACS.
Evidence: current main public/toc-mainline.user.js blob 7a7291854fc2b97fd0034a906dcf415907cc1f8d, selectBatchJobs lines 388–440 and pairedJobs near end; public/toc-demand-live.json blob b4d96b94a01af7ed4d4669e32365127bb1e7102a, inspected latest JACS/JOC rows at 3515–3595.
Read-only diagnosis: selectBatchJobs sorts date descending, rotates publisher buckets within each date, and sorts within each publisher lexically by DOI except a figureCount tie-break when both jobs are figure_gap. It does not order missing-TOC jobs before figure-only jobs or prioritize JACS among same-date ACS journals. Paired jobs retain articles with an official static TOC to capture body figures, while setting captureToc=false. Latest inspected JOC and JACS rows share 2026-09-22 date; no intraday timestamp can distinguish their publisher release order.
No current 2.2.21 local trace was fetched in this turn; the exact user-observed DOI, cooldown state, and whether the existing TOC was recognized are unverified. Do not assert an actual duplicate TOC upload. Direct public queue GETs via web and container were unavailable, so conclusions are source-based, not a fresh live-HTTP acceptance. No functional code, literature dataset, queue, media asset, scheduling automation, or user settings changed; this reply log is the only repository write.

## Progress message

我先核对当前队列前几篇的日期、排序规则和已有图片的跳过条件，分清它是在补正文图，还是把旧文献错误地排到了最新 JACS 前面。

## User-visible reply

**这是排序规则的遗漏，不是 JACS 抓不了。你要求的“最新文献优先，先补缺失 TOC，再补已有 TOC 文献的正文图”，目前没有被完整落实。** fileciteturn544file0L2-L2

我核对了当前代码，实际排队顺序是：**日期从新到旧 → 同一天按出版社轮转 → 同一出版社内按 DOI 字母顺序。** JOC 和 JACS 都属于 ACS，因此 `10.1021/acs.joc.…` 会排在 `10.1021/jacs.…` 前面。当前队列中这批 JOC 与 JACS 又都标为 **9 月 22 日**，于是 JOC 被排到了前面；代码没有进一步优先处理同日缺 TOC 的 JACS。fileciteturn544file0L2-L2fileciteturn545file0L2-L2

**已有 TOC 的 JOC 为什么仍会被打开？** 因为新版把 TOC 与正文图合成了同一篇文章的任务。若媒体索引确认它已有官方 TOC，代码会设置 `captureToc=false`，保留原 TOC，打开全文补正文图。因此，“打开已有 TOC 的文章”不一定是重复抓 TOC；但这不能成为它抢在同日缺 TOC 的 JACS 前面的理由。至于你刚看到的那一次是否正确识别了已有 TOC，还不能只凭打开页面就下结论。fileciteturn547file0L2-L2

要符合你的要求，排序应当改为：**先按上线日期倒序；同日先处理没有官方 TOC 的文章，顺带抓正文图；同日、同等缺口时 JACS 优先；已有 TOC 的 JOC 等文章随后补正文图。** 这样既保留“单篇一次访问同时抓两类图”，也不会让补旧图挤占最新文献的优先级。

**2.2.21 修复了连续弹窗，但这段排序仍是旧逻辑；本轮已确认原因，尚未修改线上排序。** 单纯调整“每批数量”不会改变这个先后顺序，不需要你清空存储或重新配置密钥。fileciteturn540file0L2-L2fileciteturn544file0L2-L2
