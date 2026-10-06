# 2026-10-06 WeChat pre-draft review — complete figure/text audit

Status: **TEXT PASS / FIGURE-MAP PASS / RASTER COMPLETION PENDING**

## Sentence-level prose review

- Removed vague transitions such as “后续 Fig. 4 和 Fig. 5 很重要” and other meta-commentary that does not advance the scientific argument.
- Every section now states what the cited experiment establishes before moving to interpretation.
- Nature Chemistry follows: transient-radical problem → Fig. 1 design → alternating polarity → Fig. 2 redox/speciation → Fig. 3 electrode/mechanism → Table 1 cross-coupling scope → Fig. 4 synthetic extensions → limitations.
- Hyster follows: Fig. 1 PLP photochemical context/FRET analogy/current reaction → Fig. 2 model/evolution/active site/lysate → Fig. 3 scope → Fig. 4 two FRET channels → Fig. 5 photophysics/controls/mechanism/application → peer-review and method boundaries.
- Mechanistic claims retain evidence boundaries: correlations are not rewritten as unique causal proof.

## Figure completeness

### Nature Chemistry
- Fig. 1e remains the explicit opening exception, before “先看反应本身”; adjacent text calls it “上图（原文 Fig. 1e）”.
- Fig. 1a–d context is included after its explanatory paragraph.
- Fig. 2a, 2b, 2c and 2d–f are mapped to standard conditions, speciation/source/water and electroanalytical evidence.
- Fig. 3a, 3b–c and 3d are mapped to electrode material, alternating-polarity/passivation and overall mechanism.
- Table 1 is split into readable upper/lower scope blocks so the actual carboxylic-acid/boronic-acid cross-coupling scope is not confused with Fig. 4a homocoupling.
- Fig. 4a, Table 1 hydroboration entry, and Fig. 4b cover homocoupling, alkene-to-boronic-acid feedstock logic and downstream Suzuki/Buchwald–Hartwig diversification.
- SI Fig. 6, SI Table 5, SI Fig. 7 and SI Table 6 are added only for radical trapping, water effect/Bpin formation and ICP–MS, where main-text figures do not show the evidence directly.

### Hyster / Nature
- Fig. 1a, Fig. 1b and Fig. 1c are all represented.
- Fig. 2a–d are all represented: model reaction, evolution, active-site remodeling and cell-free lysate.
- Fig. 3 scope is split into readable pyrimidine and pyridine blocks.
- Fig. 4a, Fig. 4b–c and Fig. 4d–e are all represented.
- Fig. 5a, b, c, d, e, f and g are all represented with separate readable crops where appropriate.
- SI Fig. 11 supplements the negative result for direct excitation of natural amino-acid-derived quinonoids.

## Placement and sizing

- Section figures are paragraph-bound through `figures_after_paragraph`; final publishing is fail-closed if a used section figure lacks a paragraph mapping.
- Every used scientific image caption must contain an explicit Fig./Table/SI identifier.
- Low-density panels remain centered and narrower; dense substrate-scope and mechanistic panels remain wide enough to read.
- All production images must be materialized WYSIWYG rasters before the gate can be closed.

## Decision

Text and figure mapping: **PASS**.
Final image gate remains **PENDING** only until the latest crop-materialization job has produced and the model has visually checked every newly added raster. No WeChat write is allowed before that.
