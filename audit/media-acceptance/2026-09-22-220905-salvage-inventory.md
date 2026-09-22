# Retained media salvage: first bounded inventory and guard upgrade

Evidence read: 2026-09-22 22:09:05 +08:00.
Inventory workflow: 35738260412; job: 106780981605; outcome: success.
Source snapshot commit: 9763abbd1d69b4181167a732e1b32e25e940606e.
Artifact: media-salvage-inventory-35738260412; artifact ID: 10698004964; archive SHA256: f6b7cbcbe6ec770c52d988af1bdae5b30727417e802a7a41e223a19d3b28cf93.
Method: authenticated read-only Cloudflare R2 GET requests and D1 SELECT/PRAGMA table_info queries. No credentials included in artifact. No publisher downloads. No media writes, promotion, reset, deletes or changes to publication data.

## Inventory

D1 toc_assets: 316 rows, all with available media references in this read.
D1 figure_assets: 789 rows; distinct DOI count from downloaded inventory: 278.
D1 primary_visual_assets: 2 rows.
D1 primary_visual_variants: 2 rows.
R2 local capture index: 136 rows.
R2 staged article figure index: 28 rows.
R2 latest report index: 114 rows.
All media stores combined: 1,273 asset records, spanning 498 distinct DOI; records can represent the same image in multiple roles/stores and must not be called 1,273 unique photographs.
1,250 asset records have stored timestamps before the 21:00 rebuild cutover.
All requested indexes and four D1 tables were retrieved with no read errors. Reads were sequential, not an atomic snapshot.
R2 orphan objects, older deployment mirrors, complete report histories, missing/deleted objects and publisher originals are outside this first read.

## Evidence categories, not restoration approval

110 asset records have explicit matching DOI in both stored article URL and stored image source URL; 93 of these predate the rebuild cutover.
6 additional records can be linked by same DOI and exact stored contentHash to one of the above candidates.
1,035 records have matching article URL only and still need image-source/byte evidence.
122 records lack sufficient machine-recognized identity evidence.
No current indexed media record had a detected cross-DOI URL conflict in the recognized URL patterns. This is NOT proof of clean images: most rows lack source URLs and no pixels have been inspected.
Latest report index still contains 6 task/page DOI mismatches, including the new 21:56 task acs.orglett.6c03921 pointing to the JACS 6c13517 page.
No asset is approved for restoration by this classifier. restoredAssets=0, byteLevelVerified=false.
Recovery policy: do not move the 21:00 cutoff backwards or rewrite old timestamps to manufacture freshness; use an explicit DOI + asset identifier + verified digest allowlist after object integrity, provenance, role/label and published-DOI membership checks. Quarantined good files may then be reused; missing, mismatched or insufficiently evidenced files remain isolated or enter browser verification/recapture queues.

## Draft upgrade 2.2.20 / 6.2.20

Feature branch: fix/media-identity-v220.
Draft PR: #129. Not merged or deployed. Production users should not install a branch build.
Tested feature commit: e752cc0abca53c05aa8c32dc9587edcac3387d9e.
Workbench run: 35739084372; job: 106783800596; finished 2026-09-22 22:16 +08:00.
21 isolated identity/quarantine/diagnostic assertions passed, plus syntax checks for the five patched JS modules. These are not real-publisher browser tests and are not an end-to-end production acceptance.
Implemented on feature branch: strict every-DOI consistency; ACS underscore and encoded DOI support; Nature article-path identity; task nonce and publisher-tab binding; URL/citation metadata consistency; recheck before upload; old/unbound client intake rejection; preserve sourceUrl across promotion; refuse pre-cutover staged promotion; prevent old higher-resolution stage rows from overriding new captures; add GM_listValues grant; distinguish actual runtime version from a historical summary.
Still pending: real-browser redirect/auth/tab regression, release-contract packaging updates, vector import/promotion semantics, high-resolution source selection, authoritative full media queue rebuilding, per-asset restoration manifest and actual restoration verification. No literature/UI publication gates were changed or bypassed in this turn.
