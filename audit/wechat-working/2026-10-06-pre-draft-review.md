# 2026-10-06 WeChat pre-draft review — scope-complete WYSIWYG revision

Status: **TEXT PASS / IMAGE PASS / WECHAT TRANSPORT PENDING**

This review supersedes all earlier Oct-6 editorial approvals. It applies only to the exact source and image blobs recorded in the review gate.

## Editorial decision

The two articles were **optimized on top of the existing drafts**, not rewritten from scratch.

### Nature Chemistry daily feature — PASS

The article now follows the paper's research logic rather than staying on one mechanistic idea:

1. Why two short-lived alkyl radicals are hard to cross-couple.
2. What alternating-polarity electrolysis fixes, and what it does not fix.
3. Why opposite control experiments point to redox mismatch.
4. How TMAF changes precursor speciation and aligns oxidation windows.
5. Why water, electrode material and waveform matter.
6. How the mechanistic model explains the statistical cross/self-coupling relationship.
7. What the supporting controls establish.
8. **Substrate/feedstock scope (Fig. 4a)** — now explicitly discussed as a test of whether the redox-matching strategy survives beyond a model pair.
9. **Synthetic utility (Fig. 4b)** — in-situ hydroboration / formal carboxylic-acid–alkene coupling and downstream Suzuki–Miyaura / Buchwald–Hartwig diversification.
10. Limits and the transferable design principle.

The opening no longer contains an isolated, unattractive Fig. 1c crop. The first body figure is the reviewed Fig. 1e problem/competition panel and appears only after the matching explanatory text.

### Nature / Hyster retrospective — PASS

The article now tracks the original paper's progression more closely:

1. What is actually new about enzyme-bound excited PLP.
2. Why the quinonoid state is difficult to use photochemically.
3. A plain-language FRET explanation.
4. Directed evolution from low yield / high e.r. to a useful catalyst.
5. **Substrate scope (Fig. 3)** — pyrimidine and pyridine blocks are both included and interpreted, including where activity or e.r. begins to fail.
6. External Rh6G→[Q] FRET evidence.
7. Intra-enzyme [A]*→[Q] FRET.
8. How co-generation/localization of the radical pair enables asymmetric C–C formation.
9. Excited-state lifetime / quenching evidence.
10. Peer-review-driven evidence boundaries.
11. Current substrate/process limitations.
12. Lenacapavir-core application and its retrosynthetic significance.

This prevents the article from becoming a long uninterrupted FRET essay. Mechanism, protein engineering, scope, limitations and synthesis application all have distinct roles.

## Accessibility / narrative review — PASS

- Explanations begin with the chemical problem before introducing specialized terms.
- FRET is explained as energy transfer rather than electron transfer.
- The articles move from "what happens" → "why it is hard" → "how the authors solved it" → "how broadly it works" → "where it still fails".
- Interpretive comments are retained, but they are framed as interpretation and do not overwrite the paper's direct evidence.
- Substrate scope is discussed by trends and boundaries rather than reading out every yield.
- Negative/limiting results remain visible.

## Image review — PASS

Production no longer performs live fractional crops. Every production body figure is a pinned raster that was materialized first and visually inspected.

### Daily

- Cover: reviewed Fig. 1e / title-safe-band cover.
- First body image: complete Fig. 1e competition/problem block; no isolated Fig. 1c.
- Speciation concept: clean Fig. 2b block.
- CV / 19F NMR evidence: clean Fig. 2d–f block.
- Electrode / polarity evidence: clean Fig. 3a–c block.
- Mechanism: clean Fig. 3d block.
- Substrate/feedstock scope: clean Fig. 4a block.
- Synthetic diversification: clean Fig. 4b block.

### Hyster

- Cover: exact user-confirmed blue FRET/PLP* cover.
- Opening: complete horizontal Fig. 1c overview.
- Directed evolution: clean Fig. 2b.
- Scope: Fig. 3 split into two complete logical blocks (pyrimidine / pyridine), not arbitrary fragments.
- External FRET: clean Fig. 4b–c.
- Internal FRET: clean Fig. 4d–e.
- Radical mechanism: clean Fig. 5f.
- Lifetime/quenching: clean Fig. 5a–b.
- Lenacapavir: clean Fig. 5g.

Rejected/unused crops such as the old Hyster active-site crop and old broad lifetime crop are not referenced by the production manifests.

## WYSIWYG crop rule — PASS

- No production figure in either manifest contains `crop_frac`.
- No production body figure relies on publisher URL + runtime cropping.
- Crop proofs remain under `audit/wechat-working/crop-proofs/2026-10-06/`.
- Final manifest figures point only to versioned repository rasters.

## Visual rhythm review — PASS

The prior long text-only stretch in the Hyster article is broken by directed-evolution and substrate-scope figures before the deeper photophysical discussion. Later sections alternate evidence figures (FRET, radical mechanism, lifetime) with prose, then finish with limitations and the Lenacapavir application.

The daily feature likewise moves from problem → speciation/evidence → electrode/mechanism → scope → utility, so the visual sequence mirrors the scientific story rather than repeating one topic.

## Gate decision

**Pre-draft gate PASS.**

Allowed next action: one terminal `sync_daily_draft`, followed by WeChat `draft/get` readback. Any subsequent source or reviewed-image change invalidates this approval.
