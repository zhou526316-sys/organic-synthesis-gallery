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
