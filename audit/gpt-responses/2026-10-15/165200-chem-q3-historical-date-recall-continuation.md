# 2026-10-15 16:52 Beijing | 2026 Q3 Chem historical continuation

Task: Continue Q3/16-journal historical DOI source and scientific scope review, sole existing daily 08:00 formal admission authority. Workstream: ChatGPT Project “抓取有机合成文献并持续更新网页” / current historical-review continuation.

## User-visible response (substantially complete)

### Four further Chem official first-online corrections

[PR #691](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/691) was submitted with the exact publisher DOI/date, Crossref/OpenAlex frozen roots and two scientific passes where needed:

| DOI suffix | Official first-online day | Verified true quarter | Action |
|---|---|---|---|
| `102966` | 2026-03-30 | Q1 | Distinguish original phosphoric-acid nylon-6 alcoholysis from wrong August issue month; retain original work for separately reviewed Q1 archive |
| `103034` | 2026-04-20 | Q2 | Distinguish original NRPS 3-furylalanine and gramicidin-S/DA tagging Article from wrong August issue month |
| `103026` | 2026-04-17 | Q2 | Distinguish original mechanochemical non-equilibrium confinement Article from wrong September issue month |
| `103242` | 2026-09-09 | Q3 | Publisher date verified; scientifically evidence-pending, NOT admitted, until broad preparative method scope is proved |

Official ScienceDirect original evidence:
- https://www.sciencedirect.com/science/article/abs/pii/S245192942600032X
- https://www.sciencedirect.com/science/article/pii/S2451929426001002
- https://www.sciencedirect.com/science/article/pii/S2451929426000926
- https://www.sciencedirect.com/science/article/pii/S2451929426003086

Chem `103242` is a genuine quasi-steady-state electrosynthesis of PIDA (up to 44.4 mA/cm²; FE approaching 99%; 1.4 kg product in 7 h), but its public indexed original evidence demonstrates one reagent/model and process engineering. Neither FE nor nominal 36 t/y demonstration-facility design should be confused with isolated yield or actual annual plant production. A two-pass DOI-specific synthetic methodology review and adverse challenge by the same AI (not two independent human reviewers) explicitly hold its general preparative scope pending additional substrate/product evidence.

PR #691 includes:
- `audit/historical-publisher-dates/2026/chem-four-more-first-online-20261015.json`
- `audit/historical-scope-assessments/2026-10-15-chem-pida-electroprocess-science-hold.json`
- `scripts/test-historical-q3-chem-four-more-20261015.mjs`
- Pure staging-only `historical-q3-reconciliation.mjs` now preserves a known official publisher date even when academic scope review is incomplete; original source/API issue-month date remains separate and immutable. Official Elsevier PII may have terminal check digit `X`, and validator recognizes that exact structure. Main reconciliation input manifest does NOT yet integrate this fourth new evidence batch; there is no claimed refreshed staging audit.
- Historical Q3 regression, publisher-scope provenance CI, PDF and Tampermonkey checks passed (4/5 CI families); general Site quality gate was pending on latest PR #691 head at last check. PR #691 **not merged**.

### Independent protected-input site publication gate, not a history failure

PR #686 (two Chem publisher Preview exclusions) and PR #687 (NIPU glycerolysis-to-recycled cyclic-carbonate Article July 8 first-online, **scientific scope pending** rather than include/exclude) remain **unmerged**. Their academic/source CI passed but site gate refused mismatched protected release input. The Oct15 frozen publication marker expects `public/rolling-supplement.json` blob `f0e4b18a3be71e52fb07e84e291f51f652cd03ae`, whereas a separate WeChat author-only edit had changed the actual protected file to `28f3238f45b380855f68fc7ab79da03ba4c9f181`. Strict gate rejection is appropriate; do NOT loosen gate from history review or mutate formal protected data off-slot.

Separate owner-handled PR #688 is attempting to restore authorization and improve Nature DOI routing. Its initial Playwright failure was identified precisely: after page hydration DOI `10.1038/s41586-026-11242-8` still showed `https://doi.org/10.1038/s41586-026-11242-8` rather than the expected direct `https://www.nature.com/articles/s41586-026-11242-8`. Diagnosis was forwarded to PR #688 at https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/688#issuecomment-6188169796; its newer head was still undergoing checks, NOT confirmed merged.

### True measured counts and next controls

At last actual successful staging-only Q3 audit generated `2026-10-15T03:59:10.506Z` (Beijing 11:59:10), the **same generatedAt** was independently read for quarterly coverage blob `9e27b052b72c685b44466bbfce838445b583aeec` and worklist blob `e0385af2793be11c4ecdc4cc224d5aeeab510a23`. The 192/192 Crossref/OpenAlex metadata roots include 12,286 unique DOI; formal Q3 851, 82 verified publisher-non-original, 49 scientific excludes, 5 additional science holds, and **11,275 unfinished/date-not-verified**. This is an **old snapshot**, not the result of the newer pending PRs; `publisherIssueResearchReconciliationComplete=false`, and all 16 publisher official Research issue/online-first history is NOT complete.

The current main historical admission manifest independently had 130 evidence-approved papers and two old formal date pendings; the existing next eligible 08:00 Beijing slot is 2026-10-16 08:00, not authorization for extra afternoon publication. Neither #686/#687 nor #691 added formal Q3 site cards, PDF, images, body figures, D1 writes, Today/Hot/WeChat entries or extra evening release.

Review was synchronized with Issue #498 update:
https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6188223964

When the owner's protected publication authorization is correctly repaired and the affected PRs have **fresh green CI**, merge reviewed branches safely in sequence. Then add the new publisher-date proof to the existing staging-only reconciler evidence manifest, run the **existing** authorized staging-only bootstrap after merging latest `main`, and read back both generated output blobs and identical generatedAt. Do not infer new totals before real readback.

## Git linkage
Related merged earlier: PR #680 merge `447ddf542bd484a37e1480800c241d77426a3e2e`, PR #682 merge `1f9899dc82f531b722d5dc0d1df81525a4fbe5fc`, PR #685 merge `cdefabc9fd2a9e8786485999ef73a569b385a0bb`. New PR #691 current head `c94122859e088c06a323a1335f80adfb31bf8122` (unmerged). No claim of future deployment.
