# 2026-10-06 WeChat pre-draft review — final narrative/image placement pass

Status: **TEXT PASS / IMAGE PASS / TRANSPORT PENDING**

This review supersedes all earlier Oct-6 layout approvals.

## Text review — PASS

- Both articles are optimized from the existing drafts, not rewritten from zero.
- The narrative follows each paper progressively: problem → design/engineering → mechanistic evidence → substrate scope → synthetic/application value → limitations.
- Nature Chemistry no longer concentrates on a single mechanism point: alternating-polarity electrolysis, redox/speciation matching, electrode effects, mechanism, substrate scope, hydroboration feedstock entry and downstream diversification are all represented.
- Hyster balances PLP photochemistry, directed evolution, active-site remodeling, substrate scope, external and intra-enzyme FRET, radical-pair mechanism, excited-state lifetime, peer-review boundaries and Lenacapavir application.
- Interpretive comments are kept separate from direct evidence and do not strengthen causal claims beyond the paper.

## Image review — PASS

- All production body figures are materialized WYSIWYG PNG/JPEG assets; no production body figure uses runtime `crop_frac`.
- Nature Chemistry Fig. 1e is the first scientific image, before “先看反应本身”.
- The alternating-polarity section has its own Fig. 3b–c image immediately after the paragraph discussing scan-to-scan passivation/recovery.
- Electrode material uses its own compact Fig. 3a image; it is not stretched full width.
- Fig. 2 speciation/CV evidence, Fig. 3 mechanism, Fig. 4 substrate scope, hydroboration entry and downstream diversification are shown next to the exact paragraphs they explain.
- Hyster covers every main-text figure family used in the narrative: Fig. 1 overview; Fig. 2 evolution and active-site remodeling; Fig. 3 two scope blocks; Fig. 4 external/intra-enzyme FRET evidence; Fig. 5 lifetime, mechanism and Lenacapavir application.
- Low-information panels are deliberately narrower: evolution 72%, lifetime 70%, Lenacapavir 58%, electrode-material 68%; the active-site panel is 82%. Dense scope/mechanistic figures remain wide.
- Crops with neighbouring-panel leakage or clipped chemistry are excluded from production.
- The user-confirmed blue Hyster cover remains unchanged.

## Placement review — PASS

The publisher supports `figures_after_paragraph`: evidence appears after the paragraph it substantiates rather than being dumped at section ends. This is now the default narrative rule for these two articles.

## Main-text / SI policy

Main-text figures take priority and should be shown wherever they materially advance the paper's argument. SI figures may be added selectively for claims that the main figures do not directly visualize—such as water effects, negative controls or failed substrates—but not merely to increase image count or interrupt the narrative.

## Gate decision

**PASS.** The current manifests and pinned assets may be written to WeChat after their exact blob fingerprints are recorded in the review gate. Final acceptance requires `draft/get` readback.
