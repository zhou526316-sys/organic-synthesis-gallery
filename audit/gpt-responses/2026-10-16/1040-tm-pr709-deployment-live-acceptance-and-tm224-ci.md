# 2026-10-16, Beijing — Tampermonkey PR #709 continuation / postdeploy validation

User request: continue the approved repair of global heartbeat breaker, R2 DOI inventory, owner PDF nonblocking replay, and five-layer real throughput acceptance.

- PR #709 had 42/42 CI successful (head 52a64887); GitHub recalculated mergeability clean after main moved. Divergent main had history/audit changes only, no modified paths overlapping this PR.
- Merged PR #709 with GitHub guarded head SHA; merge commit d1512c8b70316d9660902932a4e3152bfbb9543e.
- Post-merge workflow IDs: Worker 38841648870 succeeded; Pages 38841648891 succeeded; DOI isolated regression 38841648819 succeeded; initial live acceptance 38841648876 failed because it ran before both installer deployments propagated (then still observed 2.2.88).
- Subsequent successful post-deployment acceptance workflow 38843007515 read both official hosts responding HTTP 200 with Bridge 2.2.89 and embedded 6.2.70, controller 2.2.41, protocol 6.2.20. Queue contained 1186 DOI with 35 newly added. It explicitly records authenticatedUserBrowserVerified=false, zero publisher requests and writes. Successful separate readback 38843007426 confirmed both scripts 502448 bytes, correct historical TOC-only and Oct1 safeguards and anonymous private inventory denied.
- Independent live-progress workflow 38843007474 failed because its old fixed requirement Bridge 2.2.32 conflicted with the real current 2.2.89. PR #714 created to correct this stale CI expectation; head d1982617ba67e74e62a4c1c611b03aa0b4643c9e, merge still subject to CI.
- No claim of authenticated live multi-DOI capture recovery, 101+ visits, completed body figures/text/PDF, frontend browser rendering or publisher session operation; this requires current-version real owner browser logs. No new literature publication slot was invoked.

User-visible result: PR #709 merged, production installer dual readback 2.2.89 / 6.2.70 succeeded, CI-only false alarm corrected in PR #714 awaiting checks. Actual throughput recovery remains unverified.
response_sync_status=committed.
