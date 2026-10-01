# Explicit immediate restart — 2026-10-01

User instruction: “不要什么复查，只要我点击立即开始任务，就立马重新开始从头抓”. This explicitly authorizes replacing the old run when the immediate-start action is clicked. It supersedes the previous wait-for-old-lock semantics for this action, not media provenance/publication safeguards.

Main baseline a4e68aec969d81143db40f760cfbad0f64ac4441. Verified source blob81226a1a040738fe29883fa3d38c63f786259a05 matched the mounted prior tested source byte-for-byte before modification. Keep controller2.2.39, capture protocol6.2.20, media generation1790082000000, credentials and positive stored media/evidence receipts. No literature mutation or scheduled task changes.

## Behavior

The panel now has a primary “立即开始任务（从头重抓）” button. Its callback and the existing “立即运行媒体抓取队列” menu route directly to forceStartFromHead, not the older graceful Continue/pollControllerResume path. The panel marker is “立即从头抓”. Existing graceful Continue remains a separate compatibility option; it is not the advertised immediate action.

Click synchronously writes a new manual session/revocation barrier, invalidates the old active task, clears only pause/resume control state and pending controller timers, replaces the lease with a session-specific owner and resets this round's counters. It does not await old task closure, lease expiration, reconciliation or a cooldown-clear scan. It immediately starts the live registry and backend-capability requests in parallel. Opening the publisher page necessarily still depends on those network responses; no zero-network-latency promise is made.

A fresh pass starts at the current registry head ordered by latest addedDate cohort, then existing journal/date priority. It requests TOC, body figures and available fulltext on every current paper, including previously completed papers. Historical success/failure attempts and checkpoint-based TOC/body skip shortcuts do not suppress an explicitly requested fresh visit. The existing stored images/text are not deleted; same-object deduplication and source validation remain downstream. After a failed article it continues to the next. Actual publisher access/rate controls remain respected; such a source is skipped, not used as a reason to wait for an old controller.

The manual session owns a distinct lease name, so legacy normal loops cannot renew it. New session listeners close only owned/script-bound task tabs on a best-effort nonblocking basis. Every updated runner tests its session ID after awaited work. Late completion/checkpoint/heartbeat writes are fenced by active DOI/job and manual session; previously issued HTTP writes cannot be recalled, and valid immutable server-side stored objects are not deleted. The normal automatic runner cannot dispatch alongside an active explicit manual pass. Registry membership is refreshed at safe between-article boundaries to avoid continuing removed DOI. Acquisition provenance/DOI checks, credentials and publication authorization are unchanged.

## Actual verification

Actions run36821324194, tested artifact11144080588. Downloaded artifact contents were opened in the working container; generated TOC source was byte-identical to the locally tested source. Local exact patch reapplication from baseline reproduced all three generated source/test changes.

Tests passed:18 immediate-restart cases;30 newest/retry;12 uploads;11 receipt/release;16 automatic reports;23 existing controller-recovery cases. The report test's isolated-function fixture now loads the actual new currentCaptureJob helper; its assertions were not weakened.

Chromium tested actual primary button clicks under a foreign unexpired lease, repeated same-page restart, second-page takeover, first DOI ordering, nonblocking old handle close, late-result fencing and retained data. All7 flow checks passed. Console/page errors0; failed requests0. This is a real browser fixture with mocked GM storage/dispatch/network, not the user's installed extension or a publisher/VPN test. Screenshot inspected: button and “立即从头抓” marker visible with active DOI and zeroed new-round counters.

Tested installer259283 bytes; SHA256621f477f06dbca29629b0edf9098607c593024dcc54bb6d62084c64c3bc72e11.
Tested TOC SHA256957550ef9a20bd4c13cda60cb1f4251a8a6c8b129a27df6d94e86fa2df75ff45.

Deployment is pending in this record. Do not call the canonical installation link updated until its actual served bytes match. No actual user-browser adoption or completed publisher recapture is claimed.
