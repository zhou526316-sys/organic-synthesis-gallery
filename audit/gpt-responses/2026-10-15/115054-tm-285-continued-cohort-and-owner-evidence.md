# 2026-10-15 11:50:54 Asia/Shanghai — Tampermonkey approved workline continuation

Conversation: “接续 Tampermonkey 工作” → user approved inventory / Nature / RSC fixes → interrupted Oct12 PR #552 → two short “继续” requests. This chat verified the current repository and live installation; it did not change the publisher collector, release slot, owner PDF bytes or media data.

## User-visible responses delivered

### Work recovered from disconnection

Previously proposed PR #552 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/552 has **already merged**, commit `58c9d00e10db221816fbfcadfb89156d8193573e`, Bridge 2.2.84 / TOC 6.2.65. It contains DOI-scoped inventory reads, Nature historical first-party official TOC checks and RSC verified abstract-card extraction.

Follow-up RSC bounded source PR #660 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/660 is **already merged**, commit `3192c7045b94696d1c15c290abbb3024072403d7`, Bridge 2.2.85 / TOC 6.2.66. It stops repeating legacy articlelanding/articlehtml/hidden iframe requests and checks one DOI-bound publisher issue/search listing. This reduces known repeated unsuccessful URL attempts, but does not itself prove acquired RSC visuals.

### Production deployment verified (Oct15 10:51 Beijing)

Public installer live check #38673148327 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38673148327 and night check #38673148244 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38673148244 both succeeded. Gallery and API install URLs returned HTTP 200 and the same **486395-character** script, Bridge **2.2.85**, integrated engine **6.2.66**, controller **2.2.41**, capture protocol **6.2.20** (protocol number, not install version). Owner-private PDF inventory denied anonymous access. Queue has **1151** formal DOI at generatedAt 2026-10-15T02:35:59.523Z. Those checks explicitly report `realUserBrowserOvernightVerified:false`, not an authenticated publisher scrape.

Canonical install link: https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js . Backup: https://api.gczhouwld.com/gallery-vpn-bridge.user.js . Update the **same** Tampermonkey instance only; do not clear credentials or locally stored PDF.

### Cohort comparison: why empty-card count rose

Compare the official queue at PR660 main commit `3192c7045...` (generated 2026-10-14 13:01 Beijing, **1087 formal / 67 no-card-visual**) to Oct15 10:35 Beijing snapshot (**1151 formal / 102 no-card-visual**).
- 64 new formal DOI, no removals: **33 standard and 31 Jul-Sep historical toc_only**.
- All 64 new DOIs had no primary visual in the current 10:35 snapshot.
- 29 previously visually empty DOIs no longer appear in that same no-visual gap set. Breakdown: JACS 7, JOC 7, ACS Catalysis 6, Chemical Science 5, Organic Letters 3, Green Chemistry 1.
- Thus the gap count rose +35 because new formal DOI ingress +64 outpaced visual reconciliation -29; it is incorrect to claim 35 previously captured images failed.
- RSC no-visual remains **31** DOI: **15 October standard**, **16 Jul-Sep toc_only**. The detailed manifest and 64/29 cohort list is stored as `audit/media-diagnostics/2026-10-15-bridge285-formal-cohort-gaps.json`, commit `3670c6086784b2d7b4b1733459de4f9e4f032652`. It is a catalog evidence comparison, not a publisher acquisition claim.
- Total current official TOC missing = 238, split **102 with no primary visual** + **136 official-upgrade/fallback records**, not all visually blank.

### Last available authentic owner browser log (as of Oct15 11:37 Beijing)

Read-only request `tm-20261015-1135-post-285-live-owner-read`, commit `a061f2b3f59f82fbd0ea233d07478e38ba249f72`; GitHub Actions #38677226953 succeeded. The latest R2 `local-captures/diagnostics/latest.json` still has **uploadedAt=1791970390401**, i.e. **2026-10-14 18:53:10 Beijing**, before the 2.2.85 public deployment. A post-2.2.85 authenticated publisher capture log is **not yet verified**.

In that prior run (11:06–15:10 Beijing Oct14): 1087 cataloged, 207 candidate gap DOI, 101 DOI tabs visited, 111 attempts, 43 fully resolved (43 TOC stored), 2 inventory-satisfied, 162 unresolved/blocked, no pending or cooling and **0 inventory errors**, 2 figures staged, 11 full-text evidence stored. Owner PDF inventory **ready 255, missing 6, unknown 820** (the 820 July–Sep historical DOI are not owner PDF missing). RSC DOI `10.1039/d6sc05170g` reported an official captured TOC; `10.1039/d6sc02777f` suffered 173,012ms repeated old listing attempts, leading to PR660. RSC PDF `10.1039/d6sc06407h` had `already_stored`, not a reader Range-206 test.

### Read-only audit revision merged this turn

PR #672 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/672 merged after target-journal, private PDF and complete Site quality gate/Playwright CI all passed. Commit **a4597847dabb68e831dbff0f8a1f64f87ff86d40**. It adds only the existing stored `installRevision` and `controllerRevision` scalar fields to sanitized owner-UPLOAD logs; older reports showing wire version `6.2.20` no longer need to be misinterpreted as an old installed browser script. No runtime or R2 writes. A new read-only audit job #38678159778 started on merge but remained **queued** as of around 11:50 Beijing. Do not cancel or duplicate it; subsequent execution may refine which version made the prior 43 TOC completions.

## Remaining execution / next user action

No blind new Tampermonkey code version is warranted from the older log after PR660. The next decisive evidence is an authenticated Edge/Chrome **2.2.85 / 6.2.66** publisher capture result. In the same installed script instance, after any active task ends, update the existing Bridge, run one **只补缺项** pass or retain a pass already completed with this exact install revision, and choose **上传本地 TOC 日志** once. Keep owner lease, stored media and PDF bytes. Compare 31 RSC DOI failures against official RSC issue/AJAX/listing receipts and bounded wall time, including the 15 standard full-media and 16 historical TOC-only separation. Do not treat new unvisited DOIs or unknown PDFs as missing capture failures.

The established official new literature publication slot remains 08:00 Beijing. No unauthorized publisher bypass, PDF public release, historical body scrape, or scheduling edits occurred.

Related commits: 58c9d00e10db221816fbfcadfb89156d8193573e; 3192c7045b94696d1c15c290abbb3024072403d7; 3670c6086784b2d7b4b1733459de4f9e4f032652; a4597847dabb68e831dbff0f8a1f64f87ff86d40.
response_sync_status=committed.
