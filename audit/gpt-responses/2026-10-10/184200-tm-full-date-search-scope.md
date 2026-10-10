# Response: Gallery full-date search scope
- Beijing time: 2026-10-10 18:42 +08:00 (conversation local time)
- Chat context: Tampermonkey continuation / LMCT search limited results / all-date search clarification
- Verified source: GitHub main src/main.ts, cloudflare/worker/src/literature-catalog-index.js, scripts/verify-gallery-search-live-acceptance.mjs, PR #468, live search run #38044944601.
- Main before log: 7f63879e7276e2c85683bd1034adcba3a0f478ff

## User-visible response (substantially preserved)
**你的判断有道理。LMCT 相关文献理论上应当远不止 11 篇。**

目前 Gallery 的检索范围需要区分：

- **已收录文献的全日期检索：支持。** 线上 LMCT 检索返回的 11 篇，是在当前正式收录的 938 篇文献中查询得到的，并非只检索最近三天或十月的论文。
- **目标期刊创刊以来的全部历史文献：尚未覆盖。** 2026 年 7 月 1 日以前的大量历史论文尚未完成回溯入库；7—9 月也可能仍有漏收。
- **原始摘要尚未全部齐全。** 上次核验时，938 篇中有 887 篇取得原始摘要，其余 51 篇如果标题和已审核解读没有出现 LMCT，仍可能漏检。

因此，**当前的“全库搜索”是对网站已有文献的全库搜索，而不是对目标期刊所有年份文献的搜索。**

我核对了当前代码和最新线上验收：当搜索 LMCT 且没有额外筛选时，程序会查询全库 D1 索引，开始/结束日期为空；首页默认的“近三个月”只限定无搜索词时的首页展示，不会自动把 LMCT 搜索限定为近三个月。

但浏览器会记住之前设置的期刊及日期筛选，勾选“仅新增”也会缩小范围。要核实全部已收录论文，请选择全部期刊、点击“清除期刊/日期筛选”，并关闭“仅新增”。

另外有一个真实的显示风险：在手机端 390px 的线上自动验收中，“轴手性”的 D1 全库结果为 23 篇，但查询遇到 `net::ERR_FAILED` 后退回静态数据，页面只显示 9 篇；同轮 LMCT 正常显示 11 篇。这是网络失败后的结果不完整问题，与历史未入库是两个不同原因。不能把显示的少量卡片当作全学术文献结论。

PR #468 虽已合并，但它处理的是 7—9 月历史/补收卡片的 TOC-only 与 PDF 展示保护，并没有正式新增全部历史 DOI。想得到各期刊创刊以来的 LMCT、CPA、轴手性等相关论文，仍需按核准的历史回溯流程批量发现、审核并纳入 DOI，同时采集原始摘要、作者与引用信息；旧文献不应显示在“今日新增”。

**结论：搜索机制可以检索当前已入库文献的全部日期；文献覆盖范围尚不完整，部分移动端失败回退也可能少显示。11 篇绝不是跨全部期刊、全部历史年份的真实总量。**

Links: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38044944601 ; https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/468 .
