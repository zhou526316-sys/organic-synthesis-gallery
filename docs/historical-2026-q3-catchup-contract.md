# 2026 July–September first: historical literature completeness

Owner decision (2026-10-13 Asia/Shanghai): prioritize a genuinely complete
**2026 Q3, 16-journal organic-synthesis archive** before old-century academic
admissions. Continue already-approved source discovery to founding years
independently, without narrowing its source retrieval to Q3.

Approximately **1,000 eligible papers per THREE MONTHS is a recall warning
hypothesis, never an include quota, hard cutoff, target to game, or filter**.
The quarter might contain fewer or more; only paper-specific source evidence
and independent two-pass scope review can establish eligibility.

## Five independent states

1. Crossref/OpenAlex source root (16 journals × 4 periods/month × 3 months =
   192 expected), with source-vs-OpenAlex completeness, immutable DOI and SHA.
2. DOI-unique candidates with known API date in July–September, unknown
   publisher first-online date, source-created date only, known other-period
   dates, and source journal/date disagreements kept distinct. In particular
   Chemical Science and Green Chemistry created dates are not publication
   dates. Never infer online date from first appearance in a stage root.
3. Current *formally admitted* paper count, by true stored first-online
   publication month and journal; check Q3 papers absent from the metadata
   sources without assuming they are wrong or unreviewed.
4. Full publisher Research issue TOC DOI/date/category reconciliation. Every
   missing or unverifiable issue remains *not verified*, even if all 192
   metadata roots are complete. Nature Synthesis volume 5 issue 8 has an
   independently verified 13/13 Research item receipt, but that one example
   does not certify 16 entire journal histories.
5. Scope: per-DOI current published / independently double-reviewed
   waiting for next 08:00 / evidence pending / explicit exclusion /
   unfinished. Neither keyword priority nor 1,000 benchmark is a verdict.

## Execution and artifact contracts

Run only with HISTORICAL_STAGING_ONLY=1, HISTORICAL_STAGING_BRANCH=1 on
staging/historical-archive-nightly, after merging latest main:
- node scripts/historical-q3-reconciliation.mjs

GitHub-only generated assets:
- audit/historical-staging/quarter-2026-q3-coverage.json
- audit/historical-staging/quarter-2026-q3-review-worklist.json

The bounded worklist balances all 16 journals against July/August/September,
retains low-keyword samples, and preserves all other candidate DOIs in
immutable source/previous global reviewer shards. Other nonoverlapping
320-record pages can be selected using HISTORICAL_Q3_REVIEW_PAGE (zero-based);
the reviewer must not advance beyond unreviewed evidence without real
article review. Each DOI in the queue needs exact publisher identity,
first-online date, bibliography, specific transformation, generality
or completed total-synthesis evidence, first pass and independent challenge.

Quota and publication: this workflow only reads GitHub checked-out files.
**Cloudflare D1 read/write calls = zero**. DO NOT call the live public
catalog API to build Q3 metrics. Production D1 real-readback remains with
the separate per-08:00-slot budget guard. The unique formal admission
remains Beijing 08:00; no 18:00. July–September additions can request
only an official TOC and retain existing valid media; pre-July additions
are metadata_only. No old body figures, SI, PDFs, or daily-new/Hot/WeChat
historical leakage. Never release unreviewed DOI just to hit 1,000.
