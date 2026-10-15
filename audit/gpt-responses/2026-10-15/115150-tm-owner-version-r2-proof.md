# 2026-10-15 11:51:50 Asia/Shanghai — Tampermonkey owner installRevision confirmed

Conversation continuation: User requested “继续” after an interrupted Tampermonkey repair. This is the follow-up to `audit/gpt-responses/2026-10-15/115054-tm-285-continued-cohort-and-owner-evidence.md` and corrects its transient GitHub Actions queue status.

## Latest user-visible answer content

**The last authentic browser log is confirmed as engine 6.2.65 (Bridge 2.2.84), NOT 6.2.66.**

Read-only GitHub Actions #38678159778, job #116236384621, completed **success**. Audit-only PR #672 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/672 has merged as `a4597847dabb68e831dbff0f8a1f64f87ff86d40`. It prints `installRevision` (already contained in the R2 owner diagnostic) separately from the stable wire protocol `version=6.2.20`.

Actual sanitized R2 record: `uploadedAt=1791970390401` (Beijing October 14, 18:53:10), `installRevision=6.2.65`, `controllerRevision=2.2.41`; run finished Oct14 15:10:39 Beijing. Results: 207 planned DOI gaps, 101 publisher DOI visits, 111 attempts, 43 verified complete (all with `tocStored` receipts), 2 previous-inventory satisfied, 162 still unfulfilled/blocked, **zero inventory errors**, 2 body figures staged, 11 text evidence stored. Owner PDF inventory ready=255, missing=6, unknown=820 (historical TOC-only deliberately unknown, not missing). This proves the prior DOI-scoped inventory repair worked during an actual owner-browser run but not causation by itself.

Public installer readback at Beijing Oct15 10:51, jobs #38673148327 and #38673148244, verifies Bridge `2.2.85` / embedded engine `6.2.66` on both Gallery and API hosts, HTTP 200, equal 486395 bytes, anonymous owner PDF inventory denied. This is static installer integrity, **not** a post-2.2.85 authenticated publisher capture log. RSC PR #660's improvement in avoiding repeated empty issue/listing routes remains unverified on user-browser publishers.

Current formal queue generated 2026-10-15T02:35:59.523Z: 1151 DOI, 102 no primary visual, 238 missing official TOC (102 empty + 136 fallback upgrade). 31 RSC no visual DOI: 15 standard October bundle, 16 Jul–Sep `toc_only`; independent 64 newly admitted formal DOIs all no-visual at the Oct15 snapshot; 29 previously missing no-visual DOI were no longer missing. Detailed immutable cohort audit: `audit/media-diagnostics/2026-10-15-bridge285-formal-cohort-gaps.json`, commit `3670c6086784b2d7b4b1733459de4f9e4f032652`.

## Next step and safety

No additional unverified Tampermonkey collector patch is justified without a real `installRevision=6.2.66` browser log. In the **same** authenticated Edge/Chrome Tampermonkey instance, upgrade original Bridge to 2.2.85 if needed, keep local PDF receipts and GM storage intact, finish the active task, then run one `只补缺项` capture, and upload `本地 TOC 日志` once. If a 2.2.85 capture pass already completed, upload its existing log directly instead of running duplicate visits. Recheck 31 exact RSC DOI receipts and wall time, not inferred availability. Preserve old July–September TOC-only, private owner PDF rights and single 08:00 Beijing literature publication slot.

Related links:
- PR #552 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/552
- PR #660 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/660
- PR #672 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/672
- Owner audit https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38678159778
- Owner installer https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js

response_sync_status=committed.
