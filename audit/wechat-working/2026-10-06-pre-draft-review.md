# 2026-10-06 WeChat pre-draft review — final narrative/image placement pass

Status: **TEXT PASS / IMAGE PASS / TRANSPORT PENDING**

This review supersedes all earlier Oct-6 layout approvals.

## Text review — PASS

- Both articles were optimized on the existing drafts, not rewritten from zero.
- The narrative now follows the original papers more completely: problem → design/engineering → mechanistic evidence → substrate scope → synthetic/application value → limitations.
- Nature Chemistry no longer spends the whole article on one mechanistic point. The substrate-scope and synthetic-utility sections are explicit and separated.
- Hyster likewise balances protein engineering, scope, FRET evidence, radical-pair mechanism, excited-state evidence, peer-review boundaries and Lenacapavir application.
- Explanations remain progressively layered and use short plain-language interpretations before specialist detail.
- Claims about FRET, excited-state lifetime and radical-flux matching remain within the evidence boundaries of the papers.

## Image review — PASS

- Production figures are materialized WYSIWYG PNG/JPEG assets; no production body figure uses runtime `crop_frac`.
- Nature Chemistry Fig. 1e is the first scientific image, before “先看反应本身”.
- The alternating-polarity discussion now has its own Fig. 3b–c evidence image.
- Electrode-material discussion uses a separate Fig. 3a image rather than an oversized combined crop.
- Fig. 2 speciation/CV evidence, Fig. 3 mechanism, Fig. 4 scope, hydroboration feedstock logic and tandem diversification are all shown next to the paragraphs they explain.
- Hyster contains material from every main-text figure family: Fig. 1 overview; Fig. 2 evolution; Fig. 3 scope; Fig. 4 external/intra-enzyme FRET; Fig. 5 lifetime, mechanism and application.
- Low-information panels are intentionally not stretched to 100% width: evolution 72%, lifetime 70%, Lenacapavir application 58%, electrode-material panel 68%.
- Scope and dense mechanistic/evidence figures remain wide enough to read labels and structures.
- Crops with residual neighbouring-panel fragments were rejected rather than published.
- User-confirmed blue Hyster cover remains unchanged.

## Placement review — PASS

Figures are no longer mechanically dumped at section ends. The publisher now supports `figures_after_paragraph`, so evidence appears immediately after the paragraph it substantiates. Remaining section figures fall back to the section end only when no finer placement is specified.

## SI policy

Supplementary Information may be added when it materially clarifies a claim that the main figures do not show (for example a negative control, water effect or failed substrate), but SI images are not inserted merely to increase image count. Main-text figures take priority and are now represented throughout both narratives.

## Gate decision

**PASS.** The exact current manifests and pinned assets may be written to WeChat once their blob fingerprints are recorded in the gate. Final acceptance still requires `draft/get` readback.
