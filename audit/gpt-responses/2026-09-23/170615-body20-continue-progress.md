# Body media continuation — completed

Beijing time: 2026-09-23 17:12 +08:00.
Task: continue existing user-captured R2 body-media publication, including the user-authorized twenty-article batch. This was a media-only continuation; no literature card, Chinese title, scope decision, production paper dataset, capture generation, userscript, importer/repair path, or 08:00/18:00 literature schedule was changed by this result.

## Actual production result

The existing reviewed packet was reused rather than re-reviewed or re-downloaded. PR #162 merged as `692dcd6a5d694b14d4c6bda99f13fdf0cec8f1ee`. Pages deployment run `35840740549` succeeded with the existing `literature_authorization` gate intact. The subsequent reusable live verifier run `35840954059` / job `107115595599` passed against the deployed Gallery.

This packet actually published **75 individually reviewed body figures across 20 current articles**: JACS 4 articles / 9 images, JOC 5 / 20, Organic Letters 11 / 46. The four immutable approval manifests remain bounded at 5 articles each and contain 13/16/23/23 images. Live packet status reported `added=75`, `notInCorpus=[]`, `retainedDifferentFile=[]`.

All 75 deployed files were checked against their full SHA256, source/page URL, original figure label/caption, exact DOI+figureID ledger entry, and canonical evidence digest. Chromium opened the actual production Gallery, searched all 20 DOI cards, verified all 20 body strips visible, and confirmed all 75 new image URL+label pairs decoded with positive dimensions. `browserErrors=[]`.

All 19 pre-existing official TOCs among these 20 cards retained their exact captured `contentHash`. The prior reviewed official-TOC sets also remained intact (83 first-batch + 18 second-batch = 101). `10.1021/acs.joc.6c01653` had no official TOC at baseline; its five body figures were published without inventing one.

The exact live-acceptance artifact `10741755418` (`reviewed-body-packet-live`) was downloaded and independently reconciled; ZIP SHA256 `9494e4baca5699075022564b7c1c92d60be33dadd511c78aa987ef2c20b6554b`. Report `checkedAt=2026-09-23T09:07:23.291Z`, `completedAt=2026-09-23T09:07:52.244Z`, result `passed`.

The detailed authoritative acceptance record is `audit/media-acceptance/2026-09-23-170752-body20-live.md` (commit `b65851b5126fffca42b8c4c6a8a242b3f3a37923`). It records the exact 20 DOI/image counts, frozen source evidence, per-image review procedure, file/hash reconciliation, browser acceptance, TOC preservation, and remaining diagnostic boundaries.

## Holds and boundaries

This does not claim a whole-library review or permanent monitoring. Existing scope holds remain excluded (`anie.9519061`, `acs.joc.6c01559`, `acs.orglett.6c03386`, `acs.orglett.6c03499`, `jacs.6c13641`). Unreviewed candidates remain outside this packet. The public media index contains other prior/parallel body figures, so its total must not be described as this turn's reviewed count.

No publisher recrawl was performed. No original R2 object or stage index was deleted, modified, reset, or promoted; generation `1790082000000` remains unchanged. Capture/report failures continue to be separated into page discovery, candidate download, stage upload, index write, and controller outcomes; an HTML 503 or status 0 is not treated as evidence of quota, VPN, or R2 cause.

## User-visible completion

本轮20篇已经真正完成上线验收：新增75张逐图核验通过的正文图，20张真实卡片均能看到并正常解码，原有TOC保持不变。没有把暂存、已合并或自动抓取成功冒充成“已上线”。后续继续从未审增量中按最多5篇/30张的小批次处理。