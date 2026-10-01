# Controller recovery v2 — 2026-10-01

Context: the user reports repeated paused/no-task state, controller_timeout and “另一个 Gallery 控制页正在运行，请勿重复启动” immediately after the previous acquisition repair. Continue the explicitly authorized capture failure repair; do not mutate literature, credentials, saved capture receipts, media generation or publication authorization.

Baseline main: d0bd3479a35a0d76f512e7d16389a7e8e7462665; public/toc-mainline.user.js blob e8ec7f0cfe4c22e9eebb1e71d9b967acebb341ab. Bridge/controller 2.2.39, protocol 6.2.20, generation 1790082000000 and CAPTURE_HOTFIX_REVISION 20261001-newest-retry-v1 remain unchanged. New independent marker: CONTROLLER_LIFECYCLE_REVISION=20261001-controller-recovery-v2. Panel heading explicitly includes “控制恢复修复2”.

## Evidence and limits

User screenshot: paused, no active task page, last result controller_timeout, batch19/20, TOC receipts6, body staging receipts53, failed9/skipped7, latest progress12:52:37 and acknowledged diagnostic delivery12:54:21. These are screenshot observations, not independently verified complete backend inventory or publication counts. Acknowledgement of diagnostic delivery does not release the media-controller lease.

Read-only diagnostic run36817551449 (artifact11142246273) at 2026-10-01T04:58Z returned a local-diagnostics snapshot uploaded at 2026-10-01T04:11:27.266Z. That snapshot predates the screenshot and lacks controllerState. Do not present its older six CCS failures or active DOI as the current screenshot's nine failures, and do not infer the actually installed hotfix revision from its protocol version.

The exact old source was deterministically reproduced in run36818123900:
1. A paused owner with no active job renewed its90-second lease at every15-second tick for three simulated minutes. requestControllerStart refused a foreign unexpired owner without retaining the user's resume request.
2. closeTaskTab counted30 sleeps of100ms rather than an actual deadline. In a delayed-timer fixture,30 one-minute wakeups prolonged cleanup to30 minutes while ACTIVE_JOB had already been cleared. This fixture establishes the algorithmic defect, not that this user's browser actually froze for30 minutes.
3. A matching completed publisher success was returned as aborted when a pause request was present. Completion was checked after pause/lease renewal.

## Targeted repair

- Release only the current owner's paused idle lease; keep the lease during a still-bound active publisher's orderly stop. Never delete a foreign active lease.
- Queue an explicit resume request while paused and another controller/task is finishing. Show waiting state and lease countdown; resume once safe. A later manual pause cancels that request. Two requesting pages do not both dispatch.
- Refuse to renew an expired lease, which must be reacquired rather than resurrected after suspension. Preserve exact job/controller/DOI guards and orphan reconciliation.
- Check an exact completed publisher result before pause/lease/timeout decisions. Detect already-closed task pages instead of always waiting eight minutes. Bound task closure/grace by actual wall time, not only callback counts.
- Recheck pause and ownership after asynchronous preparation and before a new batch. Fence summary persistence with controllerRunId so old cleanup cannot overwrite a newer controller's summary.
- Include non-secret lifecycle diagnostics, and visibly distinguish the repair in the panel. No change to media bytes, capture source rules, newest-first scheduling or publication approval.

## Verification

Run36818123900 / job110227561151 completed successfully. Artifact11141742956 contains the tested source and self-contained installer, test output, Chromium trace and two screenshots.

23 new controller tests passed;30 newest/retry tests,12 upload cases,11 release/receipt cases and16 automatic report cases passed unchanged. Three old-source baseline defects above were reproduced in the same run before testing the patch. Local tested source and downloaded Actions source were byte-identical.

Two-page Chromium fixture passed six flow assertions: real menu/panel resume waiting, no live-lease theft, paused idle-owner release, one requesting-page restart, no second-page restart, credential/checkpoint preservation. Console errors0, uncaught page errors0, failed requests0; localhost responses200. This is real Chromium with mocked synchronous GM storage and a mocked dispatch counter, not a live installed Tampermonkey extension or authenticated publisher capture. Screenshots were visually inspected; the resumed screenshot was captured immediately at the dispatch-counter event, before the panel's next periodic render.

Installer SHA256: 0c15211f50aeeae0c1ba92c8a0fb910b4d95b42e3d51df0878b9255f95aa96e1 (246259 bytes).
TOC source SHA256: 4d31865f623dcff22dce7b284c3624aba2588100cb5557e76f50ad52077a242a (201167 bytes).

Deployment/desktop acceptance still separate. Updating a self-contained script does not replace already-running old control-page contexts. The one-time installation instructions must include closing old Gallery control pages and old task pages, preserving script storage, then opening one Gallery page and pressing Continue once. Do not promise recovery of all nine individual failures or actual public media visibility without matching fresh receipts.
