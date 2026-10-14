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


## 2026-10-14: DOI-provenance-bound publisher Research scope reviews

The Nature Catalysis July–September issue receipts and the 15 paper-specific
second-pass scientific challenges are *review evidence*, not publication.
The original ledger is frozen at
`audit/historical-scope-assessments/2026-10-14-nature-catalysis-issues-07-09.json`.
`audit/historical-reviewed/q3-natcatal-scope-source-proof.json` binds each
DOI to its exact immutable 2026 Q3 Crossref/OpenAlex review shard by source
root ID, source SHA-256 and Git blob SHA.

After the staging-only reconciliation consumes this proof, it reports these
as two **separate** statuses:
- `sourcePublisherReviewedScopeExcluded`: academically reviewed out-of-scope
  original papers; NOT owner permanent exclusions.
- `sourcePublisherReviewedScopePending`: scientifically reviewed, evidence
  still needed; NOT approved and NOT the two original manifest pendings.

These DOI remain counted in the source discovery census. Only the
`unfinishedQ3OrDateVerification` and bounded worklist can shrink, and only
after the staging workflow actually re-runs successfully. No one should
subtract a prediction from the previously generated 11,423 or assert that
the quarterly publisher Research issue reconciliation is closed.

Every reviewed DOI must still match its original frozen source date, journal,
publisher Article/Analysis page, complete first/challenge science rationales
and exact shard Git blob SHA. Any change, missing source row, owner correction,
formal admission, or stale authority collision fails closed. The 2026-08-25
foscarnet C–P study `10.1038/s41929-026-01608-6` stays evidence-pending
until isolation/identification/overall preparative evidence are established;
Faradaic efficiency is not isolated chemical yield.

This read-only integration must not modify original source shards, the
`approved-admissions.json` include/pending manifest, owner DOI exclusions,
main literature catalog, media/PDF acquisition or the sole 08:00 publication.


## 2026-10-14 Nature Catalysis remaining Q3 source cohort (24 DOI)

After the separate previously validated 15 Nature Catalysis Research-item scientific
assessments, 24 unique source DOI remained in the same frozen 192-root Q3
metadata union. They are *not* a publisher-approved total-issue closure list.
Read the immutable proof under
`audit/historical-reviewed/q3-natcatal-unfinished-24-source-proof.json`
before using any of the subsequent results.

New DOI-specific evidence is split by publisher type, with no irreversible
owner-level exclusion:
- 19 officially classified as **non-original independent studies**, consisting
  of 9 News & Views, 4 Research Highlights, 2 Research Briefings, one
  Comment, 2 Author Corrections, and one Publisher Correction. Audit:
  `audit/historical-reviewed/q3-natcatal-nonoriginal-19-two-pass.json`.
  Keep the original article's own DOI separate; a commentary about valid
  synthetic chemistry cannot become an additional original literature entry.
- 5 original **Articles** independently challenged for *the actual primary
  preparative contribution*, not filtered by labels: four out-of-scope
  electrocatalysis/materials/mechanism methods; one evidence-pending
  `10.1038/s41929-026-01611-x` (AzcA-mediated enzymatic pyrimidine to
  triazine skeletal rearrangement within azacytidine biosynthesis). In-vitro
  LC-MS is real biochemical transformation evidence, but the isolated
  preparative scope and broader use of the enzymes remain to be checked.
  Audit:
  `audit/historical-scope-assessments/2026-10-14-natcatal-late-online-five.json`
  and
  `audit/historical-reviewed/q3-natcatal-late-online-five-source-proof.json`.

The original earlier scientific pending
`10.1038/s41929-026-01608-6` (electrosynthetic foscarnet) remains pending
independently; its Faradaic efficiency is not the isolated yield. Neither this
nor the AzcA evidence-pending DOI should be rewritten as a permanent exclude
or added to the existing admission manifest's two different original pending.

The quarterly reconciliation can mark 19 separately as
`sourcePublisherNonResearchExcluded`, four as
`sourcePublisherReviewedScopeExcluded`, and one as
`sourcePublisherReviewedScopePending` once it **actually** runs from staging.
The frozen source unique DOI count must remain 12,286; if no other inputs
change, unfinished would move from 11,408 to 11,384, but this is a
**prediction only until same-generation coverage and worklist are reread
from a successful staging job**.

Do not infer Nature Catalysis's complete online-first/issue inventory
from classification of its known Crossref/OpenAlex source rows. Never
enrich historical DOI with paid HTML/PDF/figures or surface these
backfilled DOI in Today's New/Hot/WeChat. The only formal admission remains
Beijing 08:00 after existing provenance and science gates.


## 2026-10-14 Nature Synthesis DOI-exact historical cohort

The frozen Q3 Crossref/OpenAlex reviewer-source union holds **63 Nature Synthesis
DOIs**: 17 already in the formal catalog, two previously reviewed publisher
non-original DOIs, and 44 individually checked here. This is a census of
*known* metadata-source DOIs, never a certification of complete publisher
online-first discovery. The earlier official July–October volume 5 issue
Research receipts largely point to April–June first-online publications:
the **issue display month is not the true first-online date**.

Records:
- `audit/historical-reviewed/q3-natsynth-publisher-types-44.json` —
  exact publisher Article / Review Article / News & Views / Research
  Highlight / Research Briefing / Perspective / Comment / Q&A /
  Editorial / Author Correction type declarations.
- `audit/historical-reviewed/q3-natsynth-44-frozen-source-proof.json` —
  all 44 candidate DOI checked against unchanged 2026-Q3 staging DOI,
  journal, published day, Crossref+OpenAlex, source SHA-256,
  reviewer-shard Git blob SHA and original metadata-batch blob SHA.
- `audit/historical-reviewed/q3-natsynth-nonoriginal-31-two-pass.json` —
  31 official non-original research, review, correction and editorial
  items, distinct from permanent owner exclusions and not duplicating the
  DOI for any original synthetic methodology.
- `audit/historical-scope-assessments/2026-10-14-natsynth-13-original-two-pass.json`
  and `audit/historical-reviewed/q3-natsynth-13-article-source-proof.json` —
  13 genuine original Articles: 11 individual evidence-backed
  out-of-scope assessments and two **evidence pending** (524-atom
  bifurcated molecular knot DOI `10.1038/s44160-026-01115-3` and
  new coumarin-linked COF chemistry DOI `10.1038/s44160-026-01146-w`).
  These pending articles do contain real covalent synthesis. Their
  transferable organic or polymer preparative method scope, not merely
  the product's existence, requires further evidence before inclusion.
- The 2026-07-02 electrophotocatalytic vicinal dichlorination commentary
  DOI `10.1038/s44160-026-01103-7` is **not** the method's actual
  publication date. Its original Article DOI `10.1038/s44160-026-01088-3`
  was first published **2026-05-26**. Likewise the July 3 Research
  Briefing `10.1038/s44160-026-01110-8` summarizes original modular
  macrolide biosynthesis DOI `10.1038/s44160-026-01108-2`, first
  published **2026-06-29**. Neither original is a Q3-online discovery.

No automatic include, permanent owner-exclusion modification,
Today/Hot/WeChat historical leakage, media/SI/PDF retrieval, D1 access,
Q3 issue closure or extra publication slot is authorized. Recalculate
the verified source worklist only after its frozen DOI and two-pass
scope-ledger hash gates succeed; the 11,384 prior unfinished Q3 number
does not change until a **successful same-generation staging readback**.
