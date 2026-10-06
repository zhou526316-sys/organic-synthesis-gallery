# WeChat draft editorial review gate

This contract separates editorial QA from WeChat transport.

## Required sequence

1. Build the editorial source manifests.
2. Export a **text-only review artifact**. It must contain all user-facing prose in final order, but no body images.
3. Export an **images-only review artifact**. It must enumerate every cover and body image with its source, crop, caption, and placement. No long-form narrative belongs here.
4. Review both artifacts independently.
5. Write a machine-readable review gate that records:
   - publication date / retrospective slug;
   - source manifest paths;
   - exact Git blob SHA for each reviewed source;
   - textReview status;
   - imageReview status;
   - reviewer notes;
   - review time.
6. Only after both reviews pass may the publisher create/update the WeChat draft.
7. Run `draft/get` after the write and generate the combined WeChat preview for final transport/layout QA.

## Fail-closed rules

The publisher must refuse to write a draft when:
- the review gate is missing;
- either text or image review is not `pass`;
- a reviewed source file no longer matches the recorded Git blob SHA;
- any required local raster asset cannot be decoded;
- a figure referenced by article layout is missing from the reviewed image manifest.

Any source edit invalidates the gate and requires a new export/review cycle.

## Text-only review

Check:
- scientific accuracy and evidence strength;
- causal wording versus correlation;
- the narrative follows one central question;
- titles and section hierarchy match the editorial brief;
- no accidental subtitle is introduced when the brief says no subtitle;
- no duplicated paragraph or repeated conclusion;
- numerical values, units and electrochemical references are internally consistent;
- limitations and negative results are represented where material.

## Images-only review

Check:
- every raster decodes successfully;
- source URL/repository asset is the intended source;
- crop isolates the exact panel used by the adjacent argument;
- the same figure is not unintentionally repeated;
- caption describes only what is visible and supported;
- cover crop survives WeChat 2.35:1 and 1:1 crops;
- generated decorative artwork never redraws chemical structures, spectra, plots, numerical data, or reaction schemes;
- prefer publisher raster PNG/JPEG for chemistry figures;
- normalize local assets before upload and avoid progressive JPEG where possible.

## Final WeChat readback

A successful pre-draft review does not prove the WeChat transport is correct. After `draft/add` / `draft/update`, require `draft/get` readback and inspect:
- title/digest;
- cover;
- image order;
- image dimensions/crops;
- captions;
- article order in the multi-article bundle;
- source links.

The final preview is therefore a transport/layout check, not the primary editorial review.

## Tooling independence

The WeChat editorial/publisher acceptance path must not depend on TinyFish. Browser automation may never be a prerequisite for approval. Source fingerprints, local/source-image inspection, fixed-IP publisher results, WeChat `draft/get` readback and the relay preview are the authoritative QA path.

## Materialized-crop rule

Effective from the 2026-10-06 crop failures, production WeChat figures follow a **what-you-review-is-what-you-publish** rule.

1. `source_url + crop_frac` is a staging instruction only. It must not be treated as a visually approved production asset.
2. For every cropped chemistry/evidence figure, first render the crop into a standalone PNG/JPEG and review that exact raster.
3. The review package must show both:
   - the source figure with the crop rectangle;
   - the resulting cropped raster at the size/aspect ratio that will be used in the article.
4. After visual approval, freeze the raster under `public/wechat-assets/reviewed/` (or another versioned repository asset path) and make the production manifest reference that pinned asset. Do not recalculate the crop during the final WeChat write.
5. Any change to the crop rectangle, source image, resize policy, or caption creates a new asset fingerprint and invalidates the prior image approval.
6. A cropped figure must be rejected if any of the following is visible:
   - a structure, axis, label, legend, arrow, condition, product or panel identifier is cut off;
   - unrelated neighbouring panels or partial graphics leak into the crop;
   - excessive blank/page chrome remains;
   - the crop is too tight to understand the chemistry without the missing context;
   - the caption claims content that is not actually visible in the crop.
7. For multi-panel scope figures, prefer complete logical blocks or split them into two or more reviewed assets. Never use a narrow crop merely to make the image smaller.
8. Keep a small visual safety margin around chemical structures and labels. Tight trimming may remove empty page space, but it must not trim chemical meaning.
9. Production review should be based on the pinned raster itself, not on crop coordinates, filenames, or the source figure alone.

## Figure-reference and placement rule

Effective from the 2026-10-06 editorial review:

1. Main-text figures should be represented wherever they materially advance the paper's argument. Do not omit a main-text figure simply because another figure already illustrates the same general topic.
2. If a paragraph describes data, a scheme, a control, a substrate scope, a structural panel, or a mechanistic panel that has an identifiable source figure/table, the prose must explicitly name that source (`Fig. X`, `Table X`, `Supporting Information Fig. X`, etc.).
3. With one documented lead-image exception, the order is always **explanation first, figure immediately after**. Do not alternate arbitrarily between image-before-text and text-before-image.
4. A lead image may appear before its explanation only when the editorial brief explicitly requires it. The immediately following prose must then say `上图（原文 Fig. X）` so the relationship is unambiguous.
5. If a figure has already been shown earlier and is referenced again later, write `前文原文 Fig. X` (or equivalent) rather than duplicating it without reason.
6. Use `figures_after_paragraph` to bind each figure to the exact paragraph it supports. Section-end dumping is a fallback, not the default.
7. When one paragraph discusses multiple panels, either:
   - show the complete logical multi-panel block after that paragraph; or
   - split it into individually reviewed assets and explicitly name each panel in prose/caption.
8. Main-text figures have priority. Supporting Information figures may be added when they directly visualize a claim, control, limitation, failure mode, or mechanistic point that the main-text figures do not show.
9. Image count is not itself a quality goal. A figure is included only when it improves scientific comprehension or reading rhythm.
10. Low-information single panels should use a narrower centered `display_width_pct`; dense scope, multi-panel evidence, and mechanism figures should remain wide enough to read structures, labels, and axes.
11. The image review gate must fail if:
    - a paragraph materially describes an identifiable figure/table but the figure is absent without an explicit earlier-reference rationale;
    - a placed figure is not named or unambiguously identified in the adjacent prose;
    - an image is placed before the prose that explains it without a documented lead-image exception;
    - a caption and the adjacent prose identify different source panels.

