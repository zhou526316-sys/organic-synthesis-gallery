Beijing date/time: 2026-10-08 12:17:07
Context: Screenshot-reported Science Advances publication date discrepancy, metadata verification only, no production mutation.
DOI: 10.1126/sciadv.aed4187
Source screenshot: user-supplied publisher article page, visible “7 Oct 2026” and Vol. 12 Issue 41, Optical resolution of H/D isotopic chirality via asymmetric C-H amination.
Repository evidence as read on 2026-10-08:
- public/rolling-supplement.json papers[357]: date=2026-10-09, addedDate=2026-10-08, same DOI.
- audit/review-2026-10-08-0800.json accepted[0]: publishedDate=2026-10-09, createdDate=2026-10-07, onlineDate="", dateUnverified=true, dateConflict="created_in_window_publication_date_in_future", date=2026-10-09.
- audit/prepublish-review-2026-10-08-0800.json dateReconciliation.publisherFirstPublishedSpotChecks[0]: "Crossref publishedDate=2026-10-09 while createdDate=2026-10-07"; publisher site verified live before slot but date left unverified.
- User's screenshot supplies direct publisher visible date 2026-10-07.
Conclusion: Wrong display date is confirmed. Publisher page's visible 7 Oct date should take precedence over this unresolved future 9 Oct Crossref publishedDate for Gallery publication presentation. The DOI registration/create date is corroborative only and not substituted for first-online.
Approval state: Awaiting explicit user approval for this date-specific repair per PROJECT_RULES feedback gate. No production records, authoritative data, release marker, sort indices, scope registry, or publication workflows changed. Once approved, the normal 08:00 publication contract must govern the corrected retained record; immediate off-slot scope correction is deletion-only and cannot mutate it.

User-visible reply recorded:
你指出的日期错误已经核实。

**[Optical resolution of H/D isotopic chirality via asymmetric C–H amination](https://doi.org/10.1126/sciadv.aed4187) 的正确出版日期应为 2026 年 10 月 7 日。** 出版社页面明确标注了这一日期，而 Gallery 当前错误地显示为 **10 月 9 日**。

我还定位到了原因：文献审核记录中，Crossref 提供的 `publishedDate` 是 10 月 9 日，`createdDate` 是 10 月 7 日。系统已经检测到日期冲突并标记 `dateUnverified=true`，但正式收录时仍采用了未经核实的 10 月 9 日。

正确的数据应当是：
- **发表日期：2026-10-07**
- **Gallery 收录日期：2026-10-08，保持不变**

两者不能混淆，也不能简单用 Crossref 的 DOI 创建日期替代真实发表日期。

终端补充：这一条涉及正式生产文献数据，不属于纯前端文字改动。根据每日 08:00 唯一正式发布和即时纠错仅允许删除的规则，目前先记录核实证据，不直接在非发布时段改动保留文献。请确认是否批准针对这个 DOI 将发表日期改为 2026-10-07、保留 addedDate=2026-10-08，并通过下一次受权的 08:00 正式发布同步更新。
