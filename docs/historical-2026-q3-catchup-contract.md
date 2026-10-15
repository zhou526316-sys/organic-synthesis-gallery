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


## 2026-10-14 Nature Chemistry 66 official publisher Q3 online entries

The official publisher **all-article online-first listing**, 2026 index pages
1–4, was inspected DOI-by-DOI through the 1 July and 30 September boundaries:
**66 official entries**, consisting of 37 Articles and 29 non-original
secondary items. All 66 official publisher dates and DOI match the immutable
2026-Q3 Crossref/OpenAlex reviewer source union **66/66**, with no
publisher-index date difference. This is an *official index versus known
metadata source* reconciliation, not a claim every hidden/off-index item has
been discovered, or that global 16-journal issue completeness is complete.

- `audit/historical-publisher-issues/2026/nature-chemistry-q3-2026-all-types-66.json`
  preserves the four official 2026 index page URLs, each per-item
  publisher date and Article type, plus source root/date hashes, with strict
  index-snapshot limitations.
- `audit/historical-reviewed/q3-nchem-51-frozen-source-proof.json`
  records 51 hitherto unreviewed DOI (24 real Articles plus 27 secondary
  items). Original 13 Article already formal, two previously verified
  non-original are not duplicated.
- `audit/historical-reviewed/q3-nchem-27-nonoriginal-two-pass.json`:
  27 exact publisher-typed and contribution-challenged News & Views,
  Briefings, Review, Editorial, Thesis, In Your Element, Q&A, book review,
  correction and Comment records. No secondary article may be relabelled
  as its linked original research DOI.
- `audit/historical-scope-assessments/2026-10-14-nchem-24-original-two-pass.json`:
  actual article-specific scientific analysis of 24 original Articles,
  preserving separate authentic synthesis evidence and adversarial
  challenges. **Three academically qualified preparative methods**:
  `10.1038/s41557-026-02228-0` multicolour fluorogenic amino-acid
  building blocks compatible with Fmoc solid-phase peptide synthesis;
  `10.1038/s41557-026-02227-1` electrochemically triggered cyclopropanol
  bioconjugation preferentially targeting acidic protein residues; and
  `10.1038/s41557-026-02232-4` HAT-initiated solvent-free, bulk
  commercial polymethacrylate depolymerization with original monomer
  recovery (about 90%). These constitute original synthetic modes and
  scope, not automatic admission on the words 'fluorescence', 'protein' or
  'polymer'. The latest journal pages offer online-first DOI citation,
  not yet final pages; never fabricate volume and pages.
- The three are recorded with original authors, source SHA, scientific
  challenges, verified Chinese card titles and rights safeguards in
  `audit/historical-reviewed/approved-admissions.json`, but **not
  formally published**. Sole Beijing 08:00 admission writer continues
  to own the release, not this history staging audit.
- `audit/historical-scope-assessments/2026-10-14-nchem-21-excluded-pending.json`
  and `audit/historical-reviewed/q3-nchem-21-scope-source-proof.json`
  record 20 original Articles outside the site's core transferable
  organic preparative scope, plus one additional evidence-pending
  `10.1038/s41557-026-02226-2` (Pd-triggered phenylalanine decaging).
  This last hold is independent of the two old manifest date pending.
  Missing preparative evidence is *not* a claim the original has none.

The quarterly source census must stay 12,286; once the safe staging-only
reconciliation truly completes, the new 51 DOI decisions should move
non-original 55→82, original science exclude 29→49,
additional science pending 4→5, academic approved 116→119,
waiting sole Beijing 08:00 25→28 and unfinished 11,340→11,289
**if no other authorized inputs changed**. These are just prospective
checks, not the new authoritative figures until readback of both
same-generation quarterly JSON files.

Strict: no source-shard mutation, no owner permanent-exclusion changes,
no history inclusion in Today/Hot/WeChat, no pre-October
body-media/SI/PDF retrieval, no Cloudflare production D1, no new
18:00 publication task, no guessed publisher-first-online based on
print issue. Preserve the still-false 16-journal Research-issue closure gate.


## 2026-10-14: reviewer queue Git SHA changes after a valid 08:00 admission

A historical `review-queue/<sourceRoot>.json` contains **mutable discovery
status** and aggregate counts. When three publisher-verified Nature Chemistry
DOI moved into `approved-admissions.json`, the *same unchanged raw*
Crossref/OpenAlex source batches regenerated two Q3 reviewer queue files with
new Git blob hashes; their old hashes had been frozen in publisher/audit
receipts. The first authorized Q3 recount #38538114410 failed on a
distinct 12 all-source versus 11 newly-reviewed window check, fixed in
PR #657. The next recount #38539425019 correctly failed closed on the
former reviewer-queue blob hash for DOI `10.1038/s41557-026-02234-2`
(a non-original editorial in the same root as two newly approved Articles).
Neither failed attempt overwrote the Q3 quarterly report.

The safe fix **does not waive** a cryptographic identity:
- The raw source batch must be **byte-for-byte identical** to its original
  frozen Git SHA-1 and SHA-256.
- The latest reviewer queue, including DOI identities, title, date, authors,
  source families, scores, states, counters and order, must be **byte-for-byte
  reproducible as a parsed deterministic JSON object** by the authoritative
  `buildReviewShard` using the current main's formal/pending/approved sets
  and original raw source. Changing any non-status item fails closed.
- Only then, for that precisely verified original source root, may the
  historical whole-reviewer-queue Git blob SHA in a previously frozen
  scientific record be recognized as a **legacy receipt alias**. Both actual
  current SHA and historical pinned SHA remain recorded as distinct values;
  never rewrite an old receipt to pretend the current reviewer file has the
  old hash. A hash alias is never granted to another root.
- The three new original Nature Chemistry Articles still require valid
  independently assessed synthetic scope, original DOI and authors,
  publisher online-first dates, true Chinese titles, explicit 08:00-only
  authority, and no unauthorized D1 or PDF/media writes.

Review-source blob status is **not** the same as immutable original-source
identity. The Q3 census can only change its unfinished figures after a
*successful* existing staging-only recount whose two outputs have the same
`generatedAt`. This guard must be tested before each new class of
historical approval rather than repeatedly rerunning the 192 metadata roots.


## 2026-10-15 Chem: true first-online dates must supersede issue-first-day metadata

Chem (10.1016/j.chempr) historical Q3 Crossref/OpenAlex review shards contain
147 DOI. Numerous candidate records have dates on 2026-07-01, 08-01 or
09-01; those dates are NOT a general proof of publisher first online.
A bounded DOI-specific original-ScienceDirect check identified five exact
conflicts and preserves both frozen metadata date and publisher proof in
`audit/historical-publisher-dates/2026/chem-five-first-online-reconciled.json`.

Two 2026-08-01 source candidates are **originally published in Q1**:
- `10.1016/j.chempr.2026.102968` iron-catalyzed carbene insertion/skeletal
  editing; original publisher **26 March 2026**.
- `10.1016/j.chempr.2026.102990` organocatalytic asymmetric axial boron
  chemistry and boraspiranes; original publisher **27 March 2026**.
They are scientifically interesting but cannot count as Q3 first-online;
their eventual historical admission is a distinct pre-July `metadata_only`
process, not an academic exclusion or user permanent DOI ban. Identical
titles using DOI `103106` remain an open source-identity question; no
automatic collapse, DOI rewrite or duplicate removal is authorized.

Three confirmed original Q3 papers have different actual published days
from the frozen source month-first-day:
- `10.1016/j.chempr.2026.103211`: **21 August 2026**, cobalt/Salox
  enantioselective C–H/N–H annulation building macrocyclic+mechanical planar
  chiral rotaxanes, up to 85% yield, 93–99% ee. Frozen 2026-08-01 retained.
- `10.1016/j.chempr.2026.103215`: **31 August 2026**, preformed chiral
  binuclear Cu for trifluoromethylation/azidation of acrylates to
  α-quaternary amino-acid precursors. Frozen 2026-08-01 retained. Cu
  division of roles is author-proposed mechanism, not asserted unique proof.
- `10.1016/j.chempr.2026.103249`: **16 September 2026**, metallaphotoredox
  deoxygenative alcohol/alkyne hydroalkylation to regioselective hindered
  olefins and later quaternary carbon scaffolds. Frozen 2026-09-01 retained.

These three individually pass two paper-specific academic assessments,
each with direct original preparative transformation, documented generality,
and distinct adversarial challenge:
`audit/historical-scope-assessments/2026-10-15-chem-three-q3-methods-two-pass.json`.
Author/bibliographic/DOI records are attached to the existing
`approved-admissions.json` only for the **next legal 2026-10-16 Beijing
08:00** writer; no off-slot catch-up for the missed October 15 slot.
Three include decisions DO NOT prove the other Chem DOI are in-range or have
publisher-verified first-online dates.

The read-only Q3 reconciliation must verify the original exact frozen
Crossref/OpenAlex raw source SHA-256 and Git blobs; any regenerated reviewer
queue blob is accepted only if a byte-for-byte deterministic status-only
rebuild of that original source and the already authorized DOI sets is
verified. It must preserve all 12,286 unique metadata source DOI. Two
publisher-proven Q1 papers become `sourcePublisherVerifiedOutsideQ3`
rather than synthetic scope exclusions; five provenance disagreements
remain explicitly visible. Prospective Q3 unfinished count 11,289→11,284
only after successful staging readback with no other changes.

The independent quarterly `publisherIssueResearchReconciliationComplete`
remains **false**. Neither a few publisher date proofs nor 147 discovered
Chem DOI proves all Chem original Research/Early View Q3 publications have
been enumerated. Do not claim any protected publisher PDF, SI, figure,
body text or full abstracts were downloaded/republished by this audit.


## 2026-10-15 further Chem original online-first corrections (6 DOI)

A **second, separate** publication-date receipt
`audit/historical-publisher-dates/2026/chem-six-additional-online-reconciled.json`
adds six DOI-specific original Chem Article first-online dates to the **already
frozen and still untouched** five previously confirmed DOI corrections. Only
publisher DOI-specific Available-online dates, NOT issue-month dates from
Crossref windows, establish the actual archival quarter:

| Chem DOI tail | frozen Q3 source API date | official first-online | academic quarter |
| --- | --- | --- | --- |
| `102952` | 2026-07-01 | **2026-03-19** | Q1, not Q3 |
| `103002` | 2026-09-01 | **2026-03-30** | Q1, not Q3 |
| `103022` | 2026-09-01 | **2026-04-14** | Q2, not Q3 |
| `103186` | 2026-07-01 | **2026-07-29** | Q3 |
| `103204` | 2026-08-01 | **2026-08-18** | Q3 |
| `103257` | 2026-09-01 | **2026-09-17** | Q3 |

**IMPORTANT:** April 14 is Q2 (not Q1), and both archival proof
and runtime quarter-validation explicitly preserve the correct 2026-Q2
identity for DOI `10.1016/j.chempr.2026.103022`. It is excluded
from the **Q3 cohort by date**, not excluded as a scientific method.

Three real Q3 original methodologies have passed actual independent first
science/contribution and adversarial scope challenges and are appended
to `audit/historical-reviewed/approved-admissions.json` for the
sole Beijing **2026-10-16 08:00** writer to process *only if* that fixed-slot
prepublish gate succeeds:
- `10.1016/j.chempr.2026.103186`: potassium-controlled anti-selective
  alkyne borylfunctionalization, with broad anti-diboration in flasks
  and regio-/stereo-controlled unsymmetrical installations in microflow.
- `10.1016/j.chempr.2026.103204`: triangle association and
  reaction-condition correlation used to **experimentally establish six**
  unprecedented metal-catalyzed reactions, two further optimized
  to preparative silicon-containing medium rings and macrocycles.
  Do not turn the classifier's prediction alone into new synthetic
  product evidence.
- `10.1016/j.chempr.2026.103257`: RhAAC atroposelective
  macrocyclization of azide/arylalkyne-containing peptides,
  furnishing axially chiral triazole-biaryl dominant-rotor macrocycles
  with ring-size and structure diversity.

The three earlier-year papers remain candidates for the long-term
pre-July `metadata_only` archive, subject to independent actual scope
admission later; correcting their dates does not count them as new Q3
science excludes or permanent owner exclusions. Likewise commentary
on another original methodology is not itself a new method card.

Never conflate date verified, science qualified, historical admitted,
08:00 officially published, media captured and global publisher
TOC/online-first fully closed. No direct production or D1 mutation,
no off-slot release, no body/SI/PDF/media scraping, no original source
shard overwrite, and no stale review approval replacement.


## 2026-10-15 Nature Communications five publisher-verified original Q3 methods

Independently from the unmerged nine-DOI Nat Comm PR #662, five additional
DOI-exact Nature Communications Article records first-online in Q3 were
verified against publisher dated Article pages, original titles/author lists,
volume 17 article numbers, Crossref and OpenAlex source roots, raw Git
blobs and source SHA-256. The cohort was checked for collisions against
the then-current 1151 formal DOI, 125 academic accepts, two original
date pending and all owner-level explicit corrections. None collided.

- `audit/historical-reviewed/q3-natcomm-five-source-proof-20261015.json`:
  immutable source evidence, first-online day and complete bibliography.
- `audit/historical-scope-assessments/2026-10-15-natcomm-five-original-two-pass.json`:
  each paper's actual contribution and specific adverse boundary challenge
  by the same assistant in two passes (not two independent humans).
  Three independently qualifying synthetic methods:
  - `10.1038/s41467-026-77718-3` — reversible native-Cys masking,
    protein ligation/decaging and site-directed arylation, alkylation,
    elimination across 30 examples, including rich-Cys zinc fingers;
    conversion percentages must not all be called isolated yields.
  - `10.1038/s41467-026-77616-8` — albumin-protected palladacycle
    platform for endogenous-CO-triggered phenanthridinone synthesis
    with actual substituent/heterocycle chemical scope; limited cellular
    cytotoxicity and pmol-cell-scale detection do not prove scale-up.
  - `10.1038/s41467-026-76347-0` — modified/labelled RNA synthesis
    with engineered polymerase plus unnatural nucleotide pairing,
    multiple 2'-modification families and controlled single/dual
    site-specific label attachment.
  One scoped exclusion:
  `10.1038/s41467-026-75547-y`, paired HS-/methanol electrolysis to
  hydroxymethanesulfonate. Genuine C–S product, but its main conclusion
  is single-product waste conversion, electrode mass transfer and
  sustained industrial production rather than a generally adaptable
  organic-chemical reaction method; FE >100% in a paired process is not
  isolated chemical yield. One separate **evidence pending**:
  `10.1038/s41467-026-75484-w`, a credible
  ThDP-assisted methanol-to-acrylic acid synthetic biomanufacturing
  route. High process titre/conversion are genuine; assess transferability
  and building-block-route status without conflating enzyme mutant
  counts with product-scope examples.
- The three science-accepted DOI have author-correct, DOI-accurate,
  Chinese-title-reviewed **toc_only** historical rows in
  `approved-admissions.json`, awaiting exclusively the original
  Beijing 08:00 writer. No direct release or Today/Hot/WeChat leakage.

This supplemental five-DOI science evidence is NOT automatically the
source-reconciliation authority for the standalone pending/excluded
entries until its status adapter is explicitly integrated with
immutable source provenance. Never reduce unfinished Q3 candidate totals
by those two science decisions unless that stage integration actually
runs and returns verified same-generation coverage+worklist.
No new body media/SI/PDF/paid-text collection, no D1, no owner permanent
corrections, no second publication slot. Original 16-journal
publisher Research/online-first full closure remains false.


## 2026-10-15: Separate Nature Communications two-exception scope authority

After fixed-slot science admission of three of the five independently
reviewed Nature Communications Q3 DOI, only two scientific judgments
still need a separate staging **status** (not a formal release):
- `10.1038/s41467-026-75547-y`: academic scope exclusion of a
  single-HMS-product HS-/MeOH paired electrolysis for waste conversion.
  The C–S bond formation is real and retained as evidence; paired
  electrolysis >100% Faradaic efficiency does not mean isolated yield.
  This decision is NOT an owner permanent DOI exclusion.
- `10.1038/s41467-026-75484-w`: real engineered ThDP enzyme
  DHAP/MeOH-to-acrylic-acid pathway, 4.3 g/L titre; scope of the
  transferable building-block route and alternative organic
  substrates remains evidence-pending. High enzyme-mutant performance
  is not an organic product substrate range. Not the original two
  publisher-date-conflict manifest pending.

Evidence files:
- `audit/historical-scope-assessments/2026-10-15-natcomm-two-academic-exceptions.json`
  deliberately reproduces ONLY the original separate challenges for
  these two DOI and cryptographically cites the full five-Article
  science ledger.
- `audit/historical-reviewed/q3-natcomm-two-academic-exceptions-source-proof.json`
  binds DOI, Nature Communications original Article, official
  first-online date and matching Git reviewer SHA to the independent
  five DOI publisher/source receipt. The quarterly adapter checks
  underlying immutable raw source-batch Git SHA and that the three
  companion methods are already authorized under the normal 08:00
  academic manifest.
- The existing `scripts/historical-q3-reconciliation.mjs` consumes
  the two verified **only in staging**, as one additional
  `sourcePublisherReviewedScopeExcluded` and one additional
  `sourcePublisherReviewedScopePending`. The original source census
  must remain 12,286 and source roots 192/192.

Never subtract either candidate without a completed original staging
workflow and same-generation coverage/worklist Git readback. No
production D1, daily release, owner permanent list change, user-media
capture or 16-journal publisher completeness claim is authorized.
