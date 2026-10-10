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
