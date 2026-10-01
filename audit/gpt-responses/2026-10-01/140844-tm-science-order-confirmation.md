# Response synchronization

Beijing time: 2026-10-01T14:08:44+08:00
Context: Tampermonkey capture ordering clarification.
User message: science前也行

Interpretation in the immediately preceding exchange: Science main journal may precede Nature subjournals. This accepts the journal sequence Nature, Science, Nature subjournals, Science subjournals, JACS, Angew, Chem, others. Website addition/update cohort recency remains the primary sorting key across every cohort, not merely a boost to the single newest date. Do not let older high-priority journals overtake newer lower-priority journals.

This turn records the user's accepted rule only; no runtime code or production data changed, and no new claim that the deployed comparator implements strict recency ordering for all historical cohorts.

## Final user-visible reply

可以，**Science 主刊放在 Nature 子刊前面**，期刊顺序就保留为：

**Nature → Science → Nature 子刊 → Science 子刊 → JACS → Angew → Chem → 其他。**

但**网站最新更新批次始终优先**：先抓最新一批，再抓上一批；每一批内部才按上述期刊顺序排列。今天新增的其他期刊，仍然先于昨天新增的 Nature。
