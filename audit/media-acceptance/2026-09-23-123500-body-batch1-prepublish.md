# Current-generation body publication batch one — prepublication review

Recorded 2026-09-23 12:35 Asia/Shanghai. User task: continue after Bridge 2.2.23 and make already-staged main-text figures visible, without recreating TOC contamination or repeating capture.

Initial main read: 863ec3b43293c9194c773c812d63091869a9f886. Found and reused the previously interrupted read workflow rather than overwriting it. Read run 35817662142 at source 590c50255b4c56f9c162bc65c71fbc2a6ca10e03. Actual data read 12:16:29–12:16:41 Beijing. Artifact 10731188935 downloaded and independently SHA256 recomputed as 6d174c60e77bf53ca51398f079272f644b1de4d824853ba6c9f849bacca191c6.

## Verified subset, not general unquarantine

All 32 selected files were retrieved with successful exact stored-hash checks. Independently recomputed full SHA256 and parsed/decompressed raster bytes or parsed/rendered SVG with defusedxml/CairoSVG. Reviewed all eight four-image sheets in this turn and compared each visible diagram with its individual caption and current paper title. Checked every DOI/page/source relationship, current capture 6.2.20 bound page/job, fixed media generation 1790082000000, content-addressed R2 namespace and cross-DOI duplicate hashes against the full retrieved staging index. None of these 32 has a detected conflict under those checks.

JOC 10.1021/acs.joc.6c01302: eight Schemes, divergent borane-catalyzed quinolinium hydrogenative/silylative reductions.
OL 10.1021/acs.orglett.6c03418: two Figures and seven Schemes, Strecker–Ugi/Pictet–Spengler/ring-expansion azocinoindoles.
JACS 10.1021/jacs.6c14159: one Figure and five Schemes, Sadphos-enabled Pd enantioselective annulation.
Nature Chemistry 10.1038/s41557-026-02258-8: three Figures, aldehyde triple carbonylation/threofuranoses.
Nature Synthesis 10.1038/s44160-026-01155-9: six Figures, multi-helical nanographenes.

There are 21 SVG, 2 PNG and 9 WebP source files. SVG is not automatically equated to pure vector (some contain embedded rasters). Nature captures are 685px wide. Existing published Nature Figure 1 files remain unchanged rather than being downgraded. The current static index has five figure entries overall, including the two selected Nature Figure 1 records; anticipated new publication is 30 images, yielding five selected galleries containing 32 figures. These counts require production verification.

The evidence workflow has failure status because ONLY its independent capabilities GET returned HTTPError. All selected images, the full stage index and the published media index were retrieved. This limitation is explicitly recorded; it is not silently waived as a successful Worker health check. No raw publisher-origin re-fetch or claim of complete article inventory was made.

## Tested implementation, not yet production acceptance

Branch fix/body-stage-display-20260923. PR #149, head d7c027c1fde2edb72bc6740ab6ba06588d7ef775, 41 changed paths confined to reviewed media assets/manifest, media-merge code and tests. Exact merge integration is four lines appended to merge-curated-pages.mjs; no frontend UI, capture script, D1/R2 data, original quarantine timestamp or production literature input modified.

Workbench 35818618495 succeeded (job 107045465268). It materialized the exact frozen bytes, ran reviewed body identity/label/digest/quarantine/idempotency/TOC-preservation/removed-DOI tests, combined approved files with both prior TOC recovery batches and passed static file integrity. Source literature and userscript bytes unchanged by this workbench. PR migration and corpus checks passed; the site quality gate remains pending at this prepublication record.

The published copy uses exact DOI + figure id + full hash approval. No old timestamps are rewritten. Original staged objects and index are retained; no promotion endpoint or media reset is called. Existing TOC fields must remain unchanged. Existing same-id published figures are retained; only missing reviewed figures are added. SVG is displayed as SVG, not unnecessarily converted into low-resolution raster.

Added separate live acceptance to retrieve production status/index, verify all selected 32 displayed URLs (30 new digests plus two retained records), and visit the actual five cards in Chromium. All non-read HTTP requests are blocked in that browser. This acceptance has NOT run yet and is required before claiming real-card rendering success.

## Actual capture failures observed separately

Snapshot contains 227 stage rows, 216 post-cutover rows; report index 132 DOI, 58 with latest automatic report state. These are inventory counts, not 216 newly acquired images this turn or 58 successful papers.
Latest detailed diagnostic_context confirms Bridge 2.2.23 in JACS 6c16812 and 6c16907, with actual figure_stage completion receipts (respectively one of four and three of five discovered figures). JACS 6c16812 Figure 3's 1,927,051-byte SVG saved at 12:13:37.852; JACS 6c16907 Figure 4 and Scheme 1 saved at 12:14:37.859 and 12:14:51.863. Other candidate downloads still fail generic MIME checks: HTTP 200 application/octet-stream is rejected; alternate PNG files can then be below raster-quality thresholds. No downloaded bytes for those rejected responses have been inspected, so their real type (TIFF, image or HTML) is not asserted. Correct next fix requires magic-byte validation and explicit TIFF decoding/support or an actually available high-resolution raster alternative, not blindly accepting octet-stream or lowering quality thresholds.
Four upload 503 events in JACS 6c10701 at 12:05 belong to controllerRevision 2.2.22, NOT the later 2.2.23 reports. Do not count these as post-upgrade regression without version attribution. A fresh source/report read was triggered at bf2581774e28a7891a81fb6ef377ec8f985e73fb to continue checking this distinction.

## Progress text in this turn

这批优先处理“正文图已保存，但卡片看不到”：先核对最新暂存库存，选一小批来源、图号和文件都能确认的图片上线，同时检查 2.2.23 是否还有新的上传失败。

已取回并检查 5 篇文献的 32 张正文图，文件哈希、DOI 来源和图像内容均已核对。这批会接入卡片现有的正文图栏，不改成 TOC，也不删除暂存原件；其中两篇 Nature 已有的 Figure 1 会保留，避免被较小版本覆盖。

新报告也确认你已运行 2.2.23，并有新的正文图保存成功。仍有部分 ACS 候选因响应格式被拒绝；这与上传 503 是两类问题，不能混在一起判断。
