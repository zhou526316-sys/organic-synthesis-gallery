# Capture ordering clarification

Beijing time: 2026-10-01T14:05:44+08:00
Context: Tampermonkey immediate-start/from-head ordering clarification.
User instruction: 我说的从头开始的顺序规则是优先最新更新的，更新的当中优先nature系列 science系列 jacs angew chem。你明白吗？

## Required semantics

The Gallery's newest update cohort comes first; journal priority is secondary and applies only within that cohort. Finish the latest cohort's eligible work before processing the preceding cohort under the same ordering. Required journal groups: Nature family (Nature and its included subjournals) > Science family (Science and its included subjournals) > JACS > Angew > Chem > other included journals. Never promote historical Nature over more recently added papers merely because of journal rank. Immediate-start restarts from the head of THIS ordered current-registry queue, not the oldest publication or an all-dates journal-first traversal. The user's clarification concerns ordering and does not authorize deleting stored media/evidence/credentials or changing provenance/publication safeguards.

## Read alignment and remaining implementation gap

Read current main public/toc-mainline.user.js lines780–878 via GitHub.fetch_file. Returned source blob935104f84011792c912081868d2e8df82e83d184. journalPriority still gives Nature0, Science1, Nature-subjournals2, Science-subjournals3, JACS4, Angew5, Chem6. compareCaptureJobs boosts latestAddedDate via captureQueueTier, but does not by itself impose descending Gallery-update cohort order on every older cohort. This turn records and confirms the exact intended hierarchy; it does NOT change runtime source, deploy an installer, or claim those implementation gaps fixed. Reconcile both normal and immediate schedulers and actual available cohort metadata before the next ordering implementation; do not invent intra-day update timestamps where only addedDate exists.

## User-visible response

明白。**“最新更新”是第一优先级，“期刊顺序”是第二优先级，不能反过来。**

你要的顺序是：

**最新更新的一批：Nature 系列 → Science 系列 → JACS → Angew → Chem → 其他期刊；然后处理上一批，每一批都按这个顺序。**

这里的“最新更新”指文献在你网站上的上架／更新批次，不是单看论文原始发表日期。Nature 主刊和子刊属于同一优先组，整体排在 Science 系列之前。

例如，**今天新增的 Organic Letters 要先于昨天新增的 Nature；同一批次里的 Nature Catalysis 要先于 Science。**不能先把所有历史 Nature 抓完，再轮到今天的其他期刊。

所以，“立即从头开始”就是**回到按上述规则排好的队列第一篇，首先抓最新一批**，不是从最早的文献开始。

我刚核对了当前代码，上一版仍保留了“Science 主刊排在 Nature 子刊前面”的旧排序，**尚未完全符合你这次明确的规则**。fileciteturn156file0L2-L2
