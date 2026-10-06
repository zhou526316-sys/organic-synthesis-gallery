# 2026-10-06 WeChat pre-draft review — completeness + WYSIWYG crops

Status: **TEXT PASS / IMAGE PASS / WECHAT TRANSPORT PENDING**

This review supersedes the earlier Oct-6 review and applies only to the exact source/image fingerprints recorded in `2026-10-06-review-gate.json`.

## Editorial review — PASS

### Nature Chemistry daily feature

- Kept the existing core narrative rather than rebuilding it from scratch.
- The first body image is no longer an isolated Fig. 1c crop. The article now explains the direct/alternating-polarity problem first, then shows the complete Fig. 1e problem panel.
- The story now follows a broader paper-like arc: transient-radical problem → alternating polarity → redox/speciation matching → water/electrode effects → mechanistic evidence → substrate scope → synthetic utility → limitations.
- Added an explicit substrate-scope section tied to Fig. 4a. The commentary treats scope as a test of whether the kinetic/redox design generalizes, not as a decorative product wall.
- Preserved the in-situ hydroboration / net carboxylic-acid–alkene logic and downstream Suzuki–Miyaura / Buchwald–Hartwig diversification as synthetic-utility conclusions.
- The final limitations section remains explicit about water sensitivity, substrate classes that remain difficult, and the dependence on a narrow precursor/speciation window.

### Nature / Hyster retrospective

- Preserved the user-confirmed blue FRET/PLP* cover and the complete horizontal Fig. 1c overview.
- Rebalanced the manuscript away from an almost all-FRET/mechanism discussion. The final sequence is: novelty → why PLP is difficult to photoexcite → FRET concept → directed evolution → substrate scope → external FRET evidence → intra-enzyme FRET → radical-pair stereocontrol → excited-state evidence → peer-review boundary → limitations → Lenacapavir application.
- Added the full Fig. 3 substrate-scope discussion as two readable logical blocks (pyrimidine / pyridine) and explains both successes and failure trends.
- Directed evolution is now discussed before scope, matching the paper’s methodological progression.
- The mechanistic sections remain, but are no longer allowed to crowd out method breadth, scope, protein engineering, or synthetic application.
- The long text-only middle has been broken by the evolution, scope, FRET, mechanism, lifetime, and application figures.

## Image review — PASS

- Production manifests contain **no dynamic `crop_frac` body images**. Every cropped body figure is a versioned repo asset.
- Each crop was materialized before approval and inspected as the exact raster that will be uploaded.
- Crop proofs are retained under `audit/wechat-working/crop-proofs/2026-10-06/`.
- Rejected/contaminated intermediate crops (partial neighbouring panels, clipped axes/labels, or unrelated fragments) are not referenced by the production manifests.
- Nature Chemistry scope and diversification are separate images.
- Hyster scope is split into two complete logical blocks rather than a single unreadable full figure.
- Hyster lifetime evidence uses the clean Fig. 5a–b crop; lower neighbouring panels are excluded.
- Captions are tied to what is actually visible in each approved raster.

## Style reference

The final pacing follows the established pattern visible in the user’s earlier organic-synthesis WeChat materials: a small number of complete, readable scientific figures embedded at argument transitions, instead of long uninterrupted prose or densely repeated full-page composites. The current articles remain deeper than the older roundup posts, but keep the same principle: image = evidence for the paragraph immediately around it.

## Final decision

**Pre-draft editorial gate PASS.**

Allowed next action: perform one terminal WeChat draft update for these exact source and asset fingerprints, then require `draft/get` readback before closing transport QA.
