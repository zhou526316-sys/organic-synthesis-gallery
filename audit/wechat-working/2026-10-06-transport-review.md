# 2026-10-06 WeChat transport/readback review — complete WYSIWYG edition

Status: **PASS**

Publisher result:
- stage: `draft_update`
- media_id: `KhELYUzvwADwB_l1xH1SWFv31tB1FbKXF89D7ZHLK2znutU4BOGt5XD22WOo65yQ`
- paper_count: `29`
- draft_readback: `ok`
- generatedAt: `2026-10-06T08:20:53.723144Z`
- preview_url: https://relay.gczhouwld.com/wechat-preview/f73202f8902894037b2ab329.html

## Editorial/visual state written to WeChat

### Nature Chemistry daily feature
- Opening body image is a materialized two-block Fig. 1e composition, not the old isolated Fig. 1c crop.
- The opening image was visually re-reviewed after rendering; no neighbouring-panel leak or truncated chemistry remains.
- Redox/speciation, CV/NMR evidence, electrode behaviour and overall radical network use pinned rasters.
- A dedicated substrate-scope block is present.
- Synthetic utility includes both the upstream alkene/hydroboration entry and downstream Suzuki–Miyaura/Buchwald–Hartwig diversification.
- Method limitations remain explicit.

### Nature/Hyster retrospective
- Uses the exact user-confirmed blue FRET/PLP* cover.
- Opening body figure is the complete horizontal Fig. 1c overview.
- Narrative follows the paper more closely: concept/challenge → directed evolution → substrate scope → external/internal FRET → radical-pair stereocontrol → excited-state evidence → peer-review boundaries → limitations → Lenacapavir application.
- Scope is represented by separate pyrimidine and pyridine blocks.
- Long text-only stretches are broken by evidence images where they materially support the argument, without mechanically forcing one image per paragraph.
- The lifetime panel is a clean pinned raster; the visually inferior extra redox crop was intentionally not forced into production.

## Crop policy check
- All production body figures are pinned raster files.
- No production figure relies on runtime `crop_frac`.
- The publisher review gate fingerprints both source manifests and reviewed assets.
- The final source blob SHAs match the approved gate.

## Transport decision
The fixed-IP publisher completed successfully and WeChat `draft/get` returned `draft_readback=ok`.

Final decision: **PASS — draft is ready for user inspection in the WeChat backend.**
