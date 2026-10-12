# Historical literature intake, 2026-07–09 TOC-only and media protection

Status: user-authorized UI/acquisition policy, *not* authority to modify the protected formal literature release pipeline.
Adopted: 2026-10-10 (Asia/Shanghai).

## 2026-10-10 historical backfill vs Oct-1 media-capture exception

User-approved historical literature policy is an explicit **exception** to the
Oct-1+ `addedDate` publisher-visit bundle above, not an amendment to normal
new-paper capture or the sole 08:00 publication slot.

1. Nightly 23:00 Asia/Shanghai historical discovery/review is **staging only**.
   It does not publish new DOI records, alter prospective journal `activeFrom`
   rules, bypass DOI scope review or trigger another Pages release. Production
   admission remains limited to the authorized single 08:00 slot.
2. Admit retrospective literature only after source identity and review
   validation using `ingestionChannel: historical_backfill` (not inferred
   from `addedDate`). All such records are excluded from Hot/Today, daily-new
   tags/counts, WeChat daily-new content, and 08:00 *new-paper* metrics;
   they remain visible to all-time Archive/DOI search.
3. For **papers first published 2026-07-01 through 2026-09-30**, including
   late additions after 2026-10-01, **only TOC/official graphical abstract may
   be newly acquired**. Do not enqueue or opportunistically capture new body
   figures, full text, SI or PDF for those old-date capture jobs, regardless of
   `addedDate`. Explicit historical source records use `mediaPolicy: toc_only`.
   Actual source media acquisition remains under Tampermonkey. Preserve all
   existing verified TOC/body/PDF bytes and prior owner access; do not erase
   existing assets or repeat fully verified acquisitions.
4. Historical papers published before 2026-07-01 use
   `mediaPolicy: metadata_only`: verified title, authors, DOI (if one exists),
   bibliography, legally displayable abstract, and citation data, without
   TOC/figure/PDF acquisition or placeholder UI.
5. Crossref / publisher record–verified missing original English titles in July–September
   get a separate DOI-specific repair proof. Differentiate truly missing
   English title from missing Chinese translation; never replace a known valid
   title using an inferred/guess title. A preliminary set of 83 static
   unresolved English titles is an audit input, **not** a verified live count.
6. Before activating an all-history publication path, test that its metadata
   survives catalog/source/queue/build normalization and that historic papers
   cannot reappear in the Today's result set or in owner-PDF capture, even
   when indexed with an October `addedDate`. The normal Oct-1+ published
   papers keep their existing full-media acquisition obligations.


## Scope and implementation guard

This independent contract is subordinate to PROJECT_RULES.md and the currently authorized daily 08:00 release and literature-scope contracts. A nightly 23:00 collection task may only stage candidates. Changes must be verified in the user-facing cards, TOC queue, Tampermonkey inventory, D1 search index and release gates before declaring production-ready. Candidate discovery, reviewed include, committed admission, and live search visibility are distinct statuses.

## 2026-10-12 — 用户批准的历史全文检索试验，独立于媒体采集

用户批准“官方开放全文优先 + Tampermonkey 对旧文献合法的正文补缺 + 不永久保存旧 PDF”的第一阶段。此批准**不把原有历史 `metadata_only` / `toc_only` 自动媒体政策修改为全文媒体抓取**，而是允许独立、严格受控的文本检索试验：

1. 官方来源首先只审计当前正式 DOI 的可用 TEI/XML/HTML 元数据与条目许可；不把尚未通过范围审核的夜间 staging 候选写入正式检索。
2. 经用户手动触发且获得许可的浏览器正文文本提取，可以导出只保存在用户本机的结构化数据包；独立 Tampermonkey 脚本不得自动访问旧 DOI、抓取 PDF、SI、正文图或向现有 Evidence v2 私人库上传未经授权的历史全文。
3. 旧论文以实际最早发表日期早于 2026-10-01 判定，不能以补录 `addedDate` 绕过媒体队列；正式现存历史 TOC、图片及 PDF 不删除、不降级。
4. 在线全文检索、全文存储、Snippet 展示或双语解读发布都是独立权利与学术审核门禁；作者允许普通阅读不等于允许集中转载全文。无许可或者仅依赖校园订阅的内容维持本机试验/待许可状态，不能传入公开 D1/FTS。
5. 使用单独试验工作流和小范围真实样本验收 DOI、许可、正文覆盖、化学术语额外召回、索引体积；不得用流水线成功或本地导出成功冒充生产检索已经上线。

详细流程见 `docs/historical-text-search-pilot.md`。北京时间每日08:00唯一正式新增、历史 staging 与正常 Oct-1+ 媒体规则不受影响。
