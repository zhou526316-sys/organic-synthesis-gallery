# WeChat Editorial Contract

Updated: 2026-10-07
Status: active

## Daily publication shape

- **Title de-duplication (user override 2026-10-08):** when the first cover already visibly says “今日精选·JACS” (or “今日精选·[期刊]”), the WeChat native article title MUST be **only the paper’s faithful Chinese title**. Never repeat “有机合成文献日报”, date, “今日精选”, or the journal label in that native title. The daily literature count/date remain in the article body and edition metadata. If the cover lacks this label, use an editorially appropriate concise journal/date title only when explicitly requested.

The 10:00 Asia/Shanghai WeChat update is one multi-article push with two editorial entries:

1. **今日更新 + 每日精选**
   - Uses only the verified 08:00 Gallery release for that Beijing date.
   - The daily featured paper is the main editorial content and receives most of the article space.
2. **往期精选**
   - A previously deep-read high-value paper selected from the retrospective pool.
   - It is a separate article/card in the same WeChat push, similar to a two-card Official Account message.
   - Do not repeat a recent retrospective unless explicitly requested.

Final publication remains manual for the current personal-subject Official Account; draft creation/update and preview generation remain automated.

## Selection authority

- **每日精选** and **往期精选** are manually selected by the user until the user explicitly changes this policy.
- The system must not auto-pick, substitute, rank into, or replace either selection based on journal prestige, recency, score, or model preference.
- A daily featured manifest is used only after that day's user selection is known.
- A retrospective slug in the daily edition means: attach that user-selected retrospective as a **separate WeChat article/card in the outgoing multi-article queue**. It must never be merged into the daily featured article body.
- If the user has not selected a retrospective, omit the retrospective card rather than auto-filling one.

## Daily literature list compression

Let N be the number of papers released at 08:00.

- If **N <= 5**: show each paper's Chinese title, English title, and authors, grouped by journal.
- If **N > 5**: **do not enumerate individual titles/authors in the body**. Show only:
  - total paper count;
  - each journal that has updates;
  - count per journal.
  Example: `Nature Communications 2 篇 · JACS 3 篇 · Angew 2 篇`.
- The compact update block should occupy minimal vertical space. The daily featured paper receives the dominant visual and text space.
- When N > 5, the text list still stays compressed to journal counts only, but the Gallery jump card may show **3–4 real miniatures** from that day's new papers. These miniatures are navigation/visual context, not a substitute for re-enumerating the full list.
- The full list remains accessible through “阅读原文” at the fixed Gallery edition link.

## Gallery jump card

Immediately below the compact “今日更新” block, include one Gallery entry visual optimized for the WeChat article width:

- Left: a miniature styled as a **real card from that day's newly added literature**, using the paper's actual title/journal/DOI and an original paper visual when available.
- Right: a large, high-contrast QR code pointing to the fixed daily Gallery edition URL: `https://gallery.gczhouwld.com/?edition=YYYY-MM-DD`.
- Copy must say only that readers can view **all of today's new papers** and continue **searching/filtering/browsing** on the Gallery.
- Do **not** claim the Gallery website itself provides “深度解读”; the deep-reading editorial belongs to the WeChat article.
- The whole block should fit the normal mobile WeChat article width and read as one compact horizontal card rather than a standalone QR code.

## Core-logic editorial standard

- Every featured article, regardless of journal or topic, must expose the paper's **deepest defensible scientific logic**, not just summarize results.
- The editorial task is to identify the paper's real constraint structure:
  1. **What is fundamentally difficult?** Explain the chemical/physical/mechanistic reason the problem is hard, not merely that it has been "challenging".
  2. **What bottleneck did the authors actually choose to attack?** Distinguish the bottleneck from downstream symptoms.
  3. **Why should the proposed design solve that bottleneck?** State the causal chemical logic using the paper's own evidence, precedent, energetics, stereoelectronics, speciation, kinetics, thermodynamics, or reactivity model.
  4. **What evidence establishes each link?** Separate direct observation, control experiment, correlation, spectroscopy, electrochemistry, kinetics, computation, literature precedent, and reviewer-driven clarification.
  5. **What would an alternative explanation predict?** When the paper discusses competing mechanisms or interpretations, explain what evidence argues for or against each one.
  6. **What remains unproven?** Never upgrade a plausible model into a demonstrated fact.
  7. **Where does the method fail, and why?** Treat limitations as mechanistic information that helps define the operative window.
  8. **What new synthetic capability is actually purchased by this design?** Compare against the relevant prior-state-of-the-art, not against a straw-man baseline.
- "Deep" does not mean "dense". Use a progressive reading path:
  **30-second reaction picture → intuitive difficulty → authors' design → experimental consequence → decisive evidence → deeper mechanism/speciation/energetics → alternative models/reviewer challenge → failure boundary → synthetic significance.**
- At each transition, explicitly answer a causal question such as **“为什么难？”、“为什么这个设计可能有效？”、“这个实验到底排除了什么？”、“这个结果只能证明到哪一步？”**.
- Do not manufacture narrative cleverness. Phrases such as “最聪明的是…”, “巧妙地…”, “通过拆开两件事…” are prohibited unless the paper provides a defensible causal link and the article explains that link.
- Do not infer a mechanistic hierarchy from aesthetics or storytelling. Editorial logic must be reconstructed from the supplied main text, SI, peer review/rebuttal when available, and the cited prior-art comparison.
- For terminology that carries mechanistic meaning (for example RLT, SH2, LMCT, HAT, SET, Curtin-Hammett, radical rebound, ion pair, cage escape), first explain the **operational meaning in this paper**, then explain what observation distinguishes it from adjacent concepts.
- Use **Chinese-first terminology** for the article body. Keep an English abbreviation only when it is genuinely useful for readers to recognize the literature term; define it in Chinese at first appearance, then prefer the Chinese expression thereafter. Avoid unnecessary bilingual stacking such as `primary amine / nucleophile / electrophile / intermediate / yield` when standard Chinese terms are clear.
- If a paper's deepest contribution is not mechanistic, the same rule still applies: expose the deepest underlying logic appropriate to the work, e.g. reagent design, catalyst speciation, selectivity origin, synthetic disconnection, physical-organic principle, workflow/HTE strategy, or practical process constraint.
- This applies equally to **每日精选** and **往期精选**. A daily pick is not allowed to stay at a lighter explanatory depth merely because it is part of the daily article.
- External popular-science or WeChat articles may be used only as **presentation references** (pacing, accessibility, image-text rhythm). Never import their section order, causal logic, mechanistic interpretation, or rhetorical storyline into another paper. Each paper's scientific logic must be rebuilt from that paper's own evidence.

## Source-depth requirement

- Before drafting a selected paper, read the supplied **final main text and SI as primary sources**. If peer-review files were supplied, read them as a separate evidence layer rather than as decoration.
- Build the article only after identifying: the real literature bottleneck, the authors' design logic, decisive experiments, what each experiment actually supports, synthetic scope/chemical-space boundaries, and unresolved alternatives.
- The reader path must be **shallow to deep**: first make the transformation and value legible to a synthetic chemist in under a minute; only then introduce condition logic, speciation/redox details, mechanistic evidence, calculations, reviewer disputes, and limitations.
- Do not flatten a paper into uniformly shallow paragraphs. Conversely, do not front-load specialist mechanistic detail before the reader understands the reaction.

## Featured-paper writing standard

Both “每日精选” and “往期精选” use the same deep-reading standard:

1. Start shallow: what the authors did, what scientific bottleneck is being addressed, and why the paper matters. Do not label a design as “clever” before establishing the causal chemistry.
2. Then explain the problem and reaction design.
3. Use original figures at the exact argumentative point where they help the reader.
4. Move into conditions and mechanistic evidence only after the reader understands the reaction.
5. Distinguish:
   - direct experimental support;
   - indirect/compatible evidence;
   - computational support;
   - author-proposed model;
   - unresolved alternatives.
6. Peer review is used as evidence, not decoration: explain what reviewers challenged, what experiments/calculations were added, and how the final claims changed.
7. Discuss scope boundaries and failed substrates, not only best yields.
8. End with what the reader can actually learn from the work and what should not be overclaimed.

## Visual standard

- Prefer original paper figures and SI figures; never AI-redraw chemical structures.
- Maintain high-resolution rendering and WeChat-compatible image formats.
- Avoid long uninterrupted text blocks; alternate figures and explanation.
- Daily-feature covers should preferentially use the selected paper’s verified original TOC/graphical abstract. Preserve the complete reaction/concept and distinguish official TOCs from body-figure fallbacks; do not substitute a catalyst structure matrix when an authentic TOC is available. Use an original high-resolution raster or render the same graphic from the supplied final PDF, retaining readable symbols in the actual WeChat cover.
- Background/extension passages may include relevant high-resolution figures from other primary publications or original concept diagrams when this makes the explanation easier to follow. Place each next to its explanatory paragraph and identify its source and role. Original concept diagrams must be explicitly labeled as such, with separately identified numbering; never present them as the featured paper’s experimental evidence. Use exact vector/code drawing for scientific symbols and arrows, and inspect charge signs, direction, legends, and readability at mobile width.
- For daily-feature TOC/graphical-abstract covers, the chemistry/data foreground is immutable: never redraw, recolor, erase, distort or regenerate chemical structures, reaction arrows, labels, orbital lobes, plots, axes, numerical data, legends, or other information-bearing elements.
- When an authentic TOC has a large white or near-white background, background-only segmentation/recomposition is allowed when it materially improves title readability or lets the original chemistry motif occupy more of the cover. Replace only verified background pixels/regions, and use a low-saturation dark field whose hue is chosen to harmonize with the original artwork. The default visual target is calm, research-appropriate and comfortable for prolonged reading; avoid pure black, highly saturated blue/purple, harsh gradients, or contrast that makes white text glare.
- Background treatment must never swallow or visually interfere with coloured motifs, dark bonds, labels, orbital surfaces, arrows or other foreground information. If segmentation is not demonstrably safe, keep the original light background inside a light plate/panel, add only a restrained title backing if needed, or simply scale the untouched original artwork down. **Scaling the artwork down is an explicitly acceptable safety fallback.**
- A blue/dark title strip is optional rather than mandatory. If used, keep it only as tall as the actual visible title glyphs plus a small safety margin, and never let it cover the chemistry motif. Prefer solving white-title conflicts through safe background treatment or layout before sacrificing chemistry readability.
- Validate the actual review surface being shown to the user; do not size a cover from an invented full-title overlay and call that native-client behavior. A controlled cover-layout illustration may put visible white title directly in its backing and use CSS clipping while retaining the complete draft title and article heading; label the illustration and distinguish it from a native WeChat screenshot. Native title geometry can only be confirmed from actual client observation, not assumed line counts. Inspect the highest rendered glyph pixels rather than accepting the CSS text box alone; keep a small visible safety margin for text ascenders and rendering variation.
- Cover must communicate the paper's central reaction or concept at a glance and must not be an arbitrary cropped page.
- Editorial logic must come from the paper's actual experimental design, evidence chain, scope, comparison, or author/reviewer argument. Do not manufacture a relationship merely to make two facts sound "smart", and avoid generic labels such as "最聪明的地方" unless the paper itself supplies a defensible causal reason.
- For a retrospective used as the small secondary WeChat card, build a **dedicated square thumbnail** with only the minimum paper identity and original chemistry visual needed at small size; never shrink a dense wide cover into the square slot.
- Secondary-card covers must be optimized for the **actual small square/center-cropped WeChat display**. Prefer a large portrait or one simple chemistry motif plus 2–4 short text elements. Do not add unrelated credentials, awards, quotes, slogans, or dates unless the user explicitly requests them.

- When native mobile and official desktop screenshots disagree, identify whether the artwork itself or only title placement differs. Size the cover backing from the supplied native glyph position; record measured bounds and uncertainty. A projection from an earlier native screenshot must be labelled as a projection and must not be reported as a newly observed native-client result.

## Authorship / disclosure

- Author display: 化之岛.
- Keep the AI-assisted creation statement.
- Keep the fixed original editorial statement.
- Platform-native “原创” settings are checked manually at final publication when applicable.

## Featured-paper editorial QA

- Use the previous successfully published featured article as the structural baseline: result first, then why the chemistry is difficult, the decisive design/optimization, scope, synthetic application, mechanism, practical limitations, and a concise take-home.
- The three opening boxes must form one causal reading path rather than three generic selling points: **what was achieved -> what bottleneck was actually solved -> why the paper is worth studying as a method/mechanism story**.
- The first paper figure belongs immediately above the opening “做了什么” block.
- Every original-paper body figure must be a clean crop from the final paper or SI; separately labeled educational concept diagrams follow the visual standard above: no journal header, footer, page number, neighbouring paragraph, half-cut caption, or unrelated panel unless that context is explicitly needed.
- Prefer final-PDF crops over screenshots. Render at high resolution before cropping; do not enlarge a low-resolution screenshot.
- Do not include spectra merely because they are present in SI. A spectrum is used only when the article text explicitly teaches the reader what feature in that spectrum is evidence for the claim. Otherwise explain the conclusion in prose or use a more interpretable table/scheme.
- Never reuse one figure for two different claims. Each image must have one clear evidentiary role and its explanation goes below the image.
- Keep “chemical space” discussion paper-specific. For the 2026-10-05 bundle, the chemical-space discussion belongs to the MacMillan retrospective, not the JACS daily pick.

## Internal editorial assembly before WeChat

For every user-selected daily feature / retrospective pair, build and self-audit an internal editorial plan **before** writing the WeChat draft. The plan must contain the paper-specific causal narrative and an image map that assigns one evidentiary job to each crop. The internal QA must check source support, evidence level, Chinese-first language, duplicate-image use, crop completeness and actual WeChat-card cover behavior. These working artifacts are not sent to the user unless requested; after they pass, update the real WeChat draft and inspect the draft/get preview.

For dense multi-panel paper figures, prefer **multiple argument-specific crops** placed next to the relevant explanation. Do not use the full multi-panel figure simply because it is visually convenient. The opening figure should show the current reaction cleanly and completely.

For retrospectives without a suitable portrait, a purpose-built abstract editorial cover is allowed. It may use symbolic light/energy/protein/radical motifs, but must not invent literal chemical structures; a small original-paper reaction crop should remain the factual visual anchor. Do not add a subtitle unless the user requests one.

## Automation release gates

A WeChat draft is not send-ready merely because the API write succeeds.

Before final sending, the automated pipeline must verify all of the following:

- article count and article order are correct;
- titles follow the daily / retrospective title conventions;
- selected DOI and journal match the approved editorial choice;
- body text passes Chinese-first terminology linting with only an explicit abbreviation allowlist;
- no body figure is reused for multiple arguments;
- every figure crop is complete, readable and free of unrelated page fragments;
- the secondary-card cover is validated in the actual small-card / centered-crop display mode;
- no generated image contains invented chemical structures;
- mechanism claims are tagged as direct experiment / indirect support / computation / model / unresolved alternative;
- the draft is read back with `draft/get` and the rendered result is the object being QA'd.

Publisher runs are serialized by editorial revision. A newer requested revision supersedes older queued work; receipt writing must be single-writer or conflict-safe.

The detailed 2026-10-05 lessons and automation graduation criteria live in:
`audit/wechat-postmortem/2026-10-05.md`.

## Canonical production playbook

Effective from 2026-10-07, all daily-feature and retrospective construction also follows:
`docs/wechat-editorial-production-playbook.md`.

This operational playbook is the default for future issues and captures repeated corrections from the 2026-10-05 to 2026-10-07 production cycle:

- build a paper-specific editorial plan, evidence matrix and figure map before prose;
- default to an expert organic-chemistry audience and exclude textbook-level background unless it is necessary to distinguish the paper's own logic or evidence;
- prioritize materially relevant main-text figures, explicitly name the exact Fig./Table/SI reference in adjacent prose, and use a consistent explanation → figure → caption order except for one documented lead-image exception;
- treat every image as one evidentiary job, split dense multi-panel figures when needed, and never silently omit the part of a main-text figure that carries the argument;
- classify mechanistic claims internally as direct observation / support / compatible evidence / computation / author model / unresolved, and keep the public wording within that evidence ceiling;
- batch editorial changes in the source revision, then perform one terminal WeChat draft update followed by `draft/get`, instead of repeatedly writing partial revisions.

The playbook's background gate is binding for the current readership: ordinary photoredox quenching cycles, generic SET definitions and similar textbook material are omitted by default unless the specific paper genuinely requires that distinction.
