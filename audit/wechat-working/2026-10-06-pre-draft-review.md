# 2026-10-06 WeChat pre-draft review

Status: **TEXT PASS / IMAGE PASS / WECHAT TRANSPORT PENDING**

This review applies only to the exact source blobs listed below. Any later edit invalidates this review.

## Reviewed sources

- `public/wechat-editions/2026-10-06.json` — blob `420892b055148fdc0486fa560beaaa8b7a149c15`
- `public/wechat-featured/2026-10-06.json` — blob `d9a7bf27aaddfce9b143c32c3d14d23aed17e637`
- `public/wechat-retrospective/hyster-plp-photoenzyme-radical-coupling.json` — blob `40953c845becb0582eec250b6d4df9fa4b7610eb`

Review artifacts:

- `audit/wechat-working/2026-10-06-text-only.md` — blob `bcea4c3d12ca64aa874c4954ea6b61514740367a`
- `audit/wechat-working/2026-10-06-images-only.md` — blob `48027037dce4f037b5162bdc33aa38f629f3a0e0`

## Text review — PASS

1. Main title, digest, 29-paper count and retrospective selection match the edition manifest.
2. The Nature Chemistry feature follows one causal question: how two short-lived alkyl radicals can be generated in a matched time window. Alternating polarity, precursor speciation/redox matching, water, electrode material and waveform are presented as distinct parts of the same radical-generation/loss network rather than as disconnected optimization facts.
3. The daily article does not overstate alternating polarity as the sole origin of cross-selectivity. It separates “keeping radicals/electrode alive” from TMAF-enabled precursor redox matching.
4. The 2:1:1 discussion is framed as a statistical picture compatible with matched radical flux, not as molecular recognition.
5. Synthetic value is separated from mechanism: in-situ hydroboration and tandem Suzuki–Miyaura/Buchwald–Hartwig chemistry are described as synthetic-entry/complexification demonstrations.
6. Limitations and difficult substrate classes are retained.
7. The Hyster retrospective narrows the novelty claim correctly: the claim is about bringing an enzyme-bound PLP excited state into the catalytic cycle, not “the first PLP photochemistry”.
8. FRET is explicitly explained as energy transfer rather than electron transfer. Rh6G is described as the light-harvesting donor/antenna; excited quinonoid PLP is the species responsible for the key single-electron reduction.
9. External Rh6G→Q FRET and intra-enzyme A*→Q FRET are treated separately. The text explicitly preserves the peer-review caveat that their individual contributions to evolutionary improvement are not fully deconvoluted.
10. The excited-state lifetime discussion avoids the misleading claim that a single population simply changes from 0.2 ns to 3.6 ns; it identifies the longer-lived population and its increased contribution.
11. High e.r., directed evolution, mechanistic evidence, negative controls, limitations and the Lenacapavir application are arranged as a progressive argument rather than a list of figures.
12. No extra cover subtitle is introduced. Public-facing wording remains model-neutral except for the existing generic “AI 辅助” creation notice, which does not expose a model name.
13. The text-only artifact now includes the templated Gallery jump-card wording and the standard originality notice, so it represents the user-facing prose rather than only the long-form manuscript.

## Image review — PASS

1. Every body chemistry/evidence image in the reviewed manifests uses a Springer Nature publisher-hosted raster source; no chemical structure, spectrum, plot or reaction scheme is redrawn by a generative model.
2. All crop fractions are bounded within `[0,1]` and are attached to a single intended argument/placement in the images-only artifact.
3. The Nature Chemistry opening reaction is isolated from Fig. 1; failure modes, TMAF/speciation evidence, electrode/waveform evidence, mechanism, hydroboration entry and tandem derivatization are separated into argument-specific crops.
4. The Hyster opening reaction, external FRET evidence, intra-enzyme FRET evidence, lifetime/redox evidence, mechanism, evolution/active-site panels and Lenacapavir application are separated rather than using dense full-figure composites.
5. The unused dense Hyster full-scope figure was removed from the publish manifest.
6. The previously broken local file `public/wechat-assets/hyster-plp-photoenzyme-retrospective-cover.jpg` is no longer a publication dependency.
7. The retrospective cover is now generated at publish time from the already-used Nature Fig. 1 raster as a factual reaction anchor plus an abstract FRET visual layer. It has no subtitle; generated decoration does not redraw chemistry.
8. The publisher code validates local raster decodability and emits composed JPEG covers with `progressive=False`.
9. Evidence from WeChat publisher run `37419793593`: image preparation/upload progressed through the body-image stage and failed specifically when Pillow attempted to open the old local retrospective cover. This isolates the prior failure to that cover file; the reviewed manifest removes that failure path.
10. Final WeChat rendering is deliberately **not** marked reviewed here. It remains a separate transport/layout gate and must be verified after `draft/get` readback.

## Gate decision

Pre-draft editorial gate: **PASS**.

Allowed next action: trigger one terminal `sync_daily_draft` for this exact reviewed source state, then require `draft_readback=ok` and inspect the resulting combined preview. Do not keep editing the source manifests while the terminal sync is running.
