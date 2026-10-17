# PR #739: owner acceptance and release gates — 2026-10-17 Beijing

Date of inspection: 2026-10-17 20:44:49 (Asia/Shanghai).
Owner instruction: "那你先验收" after requiring increased actual capture ability with no regressions in other functionality.
Repository: https://github.com/zhou526316-sys/organic-synthesis-gallery
Draft PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/739
Current tested candidate branch: fix/tm-heartbeat-recovery-20261017
Latest candidate SHA when writing this checkpoint: 5a9cca9cf78f95e2afd9a3f3b7488ab20d1935cc
**NO owner rollout has occurred, PR not merged, no authorized local Tampermonkey session launched.**

## Evidence available

1. Prior final-head 2026-10-17 19:46 Beijing, SHA e1f56ca5d70bfb23071a7a62bfcc26c4c373af75: all 27 distinct PR workflow groups completed successfully, including site Playwright interaction regression and Bridge packaging. This pass does NOT automatically apply to new SHA.
2. New candidate SHA 5a9cca9... additionally preserves a normal-publisher-first ordering ahead of any optional quarantined publisher recovery probe; tests/tm-heartbeat-circuit-20261015.test.mjs has a behavioral ordering test. Full CI is retriggered; verify final SHA before approving.
3. Main and PR `public/toc-mainline.user.js` both declare `@version 6.2.73`, `INSTALL_REVISION 6.2.73`, `CONTROLLER_REVISION 2.2.41`. The Bridge builder in main still declares `loaderVersion 2.2.92`. An unchanged Tampermonkey version number is a **release/installability blocker**: no legitimate new-install/auto-update link can yet be represented as the new candidate. A new versioned isolated trial build plus installer hash verification is required before owner can test it.
4. Browser connector `list_tabs` observed 98 open tabs, including publisher reference tabs but *no Gallery controller tab*. The connector in this chat only permits read-only tab listing and page text, not installing/running Tampermonkey, authenticated publisher tab dispatch or reading GM runtime. No live owner-browser trial was performed.
5. Real read-only R2 diagnostic workflow: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39033186401, completed successfully at 2026-10-17T12:36:48Z (Beijing 20:36:48). The latest owner upload remains at 2026-10-17 19:12:45 Beijing, `installRevision=6.2.73`, controller `2.2.41`; this predates PR candidate. No post-PR authenticated owner-run evidence exists in that index.
6. Old completed baseline: 320 candidate missing DOI; publisher visits 33 distinct DOI; 55 attempts; fully resolved 3 DOI; official TOC stored 2; 1 figure staged; 0 fulltext stored; 0 verified cloud PDF stored; 52 failures; 1 partial, 2 success. Historic 978 DOI TOC-only must not be mistaken for 978 missing PDFs. Owner-PDF `deferred_upload` is not proof of cloud storage.
7. 55 attempt reasons: 28 `bound_publisher_heartbeat_missing`, 10 `publisher_article_route_unverified` (Chem/Elsevier), 13 `toc=not_found`, 2 official TOC stored (CCS), 1 partial with PDF locally deferred, 1 tab closed. New PR is *not* an injection fix, Chem DOI→PII route fix, nor an official TOC discovery fix. It can attempt a one-time publisher recovery after quarantine but cannot be credited with actual increased success from these old attempts.

## Release-blocking standards

A. Pass complete CI on **the newest PR SHA** and verify no unexpected path changes (capture source+tests only).
B. Produce an isolated, correctly incremented, locally installable trial Bridge/engine with reproducible SHA and a documented rollback. Never co-install conflicting capture controllers. Keep production URLs/current main untouched until trial accepted.
C. Run authenticated owner-browser limited canary with exact new installed version, compare the same DOI obligations and protection/access conditions against old 6.2.73. Track unique publisher DOI actually opened, exact DOI-bound official TOC production receipts, figure stage/cloud receipts, fulltext completeness, owner-PDF cloud receipts vs local deferrals, missing-heartbeat and publisher quarantine outcomes, elapsed time and unrelated-publisher queue latency. A false positive or reduced actual yield blocks release.
D. Preserve 401/403/429, authentication, DOI and PDF lease protections; July–Sept historic TOC only, Oct-1+ one-visit bundle; no independent body visits; do not label Figure 1 as official TOC.
E. Verify signed artifact and actual update/downloadURL returns new metadata version; check UI/login/search/publisher and 08:00 literature publication contracts do not regress. Do not publish unverified code.

**Current decision: code-level regression assessment partially met; real capture improvement NOT proven; official production release BLOCKED.** No amount of CI-only success can promote this to full owner acceptance.

## Reproduction of read-only evidence

- Read-only workflow .github/workflows/tm-local-acceptance-read.yml, commit trigger 672f57ac387a1eda4c3af70b599ff2c02a5277e9.
- No R2 objects were written or private PDF downloaded by this acceptance.

## Final PR CI result — 2026-10-17 20:50:49 Beijing
- Exact tested PR SHA: `5a9cca9cf78f95e2afd9a3f3b7488ab20d1935cc`.
- GitHub pull-request workflow enumeration returned **27/27 completed success**, 0 failures.
- Site quality gate https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39033585173 completed `success`, including Worker dry-run, Production API smoke, frontend build/typecheck, complete Playwright interaction regression and required quality gate.
- One extra serial-queue protection in this SHA ensures current ordinary publisher tasks outrank the optional quarantined-publisher recovery probe. Its behavior is exercised in `tests/tm-heartbeat-circuit-20261015.test.mjs` and CI.
- PR remains draft/unmerged and changes only capture controller source and its test file. There was NO authenticated owner capture on this candidate, and existing installed/packaged metadata versions are unchanged.
- **Final disposition:** code regression gate PASS; genuine owner publisher-capture efficacy gate NOT TESTED/BLOCKED; versioned test-installer/update link gate NOT MET; overall owner acceptance NOT COMPLETE; production merge/release PROHIBITED until both remaining gates pass.

## Isolated browser-trial package and CI recheck — 2026-10-17 evening Beijing

- Feature-branch packaging change: `51607d7eb60bbb6d96246e737cef6809872494e5`.
- New build tooling only: `scripts/build-pr739-canary.mjs` and `.github/workflows/tm-pr739-trial-installer.yml`; capture controller source and its tested logic did not change since `5a9cca9...`.
- GitHub Actions trial installer run https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39034927288 completed successfully, with scripts compiled, `node --check`, SHA-256 generated, and the exact archive committed **ONLY** to the isolated preview branch `preview/tm-pr739-20261017`.
- Preview URL: https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/preview/tm-pr739-20261017/audit/tampermonkey/previews/pr739/gallery-vpn-bridge.user.js
- SHA-256 digest: `442033c23c51cab50d5783010fb420dfe2ee0689205404562c1b0295f07e45ab`.
- Bundle 514398 characters. Verified by GitHub readback: `@version 2.2.93`, embedded `INSTALL_REVISION 6.2.74`, Bridge telemetry 2.2.93, owner bootstrap 6.2.74, wire capture protocol 6.2.20 unchanged; strict DOI-bound publisher recovery and ordinary-publisher-first priority present. No `@updateURL` or `@downloadURL` pointing at production.
- **Important**: same userscript @name/@namespace as existing Bridge, so owner must PAUSE+BACKUP existing 2.2.92 and UPDATE it rather than installing a second simultaneously active engine. Preview is NOT official release; current prod installer remains https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js .
- CI on packaging commit: first site-quality-gate run https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39034931280 failed a **WebKit Gallery media UI fixture** case `an incomplete live response is not proof that a missing TOC is pending` after 25s waiting for `.toc-retry`; 9 other media cases passed. Only code paths touched by feature branch are the publisher controller and trial packaging/tests/workflow, NOT Gallery UI. The same site gate had passed on previous code commits. Failing browser job `117403004473` was explicitly rerun via GitHub API; this is a recheck for timing flakiness, NOT a weakened or skipped assertion. A repeat failure blocks gate until diagnosed.
- **Overall acceptance STILL BLOCKED** pending passing final code CI AND a real logged-in owner browser trial demonstrating improved valid DOI-bound receipts without harming the original queue. The trial preview address is not a statement of production acceptance.

## Final CI after unchanged WebKit retry — 2026-10-17 21:16 Beijing

- Packaging/canary head `51607d7eb60bbb6d96246e737cef6809872494e5`: GitHub pull-request workflow enumeration returned **27/27 completed success**, 0 currently failed.
- Quality gate https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39034931280 returned `completed/success` after a **single unchanged rerun** of the failed Playwright interaction job. Earlier attempt failed specifically on WebKit `incomplete live response is not proof that a missing TOC is pending` because .toc-retry failed to appear within 25s. The retry passed this same case and subsequent Hot Archive/search checks. NO Gallery UI code, test assertion, or timeout was weakened or skipped. The first failure remains recorded; treat as intermittent test behavior rather than proved deterministic defect until independently reproduced.
- Independent trial package workflow https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39034927288 completed success; preview branch contents and digest read back; trial installer SHA256 `442033c23c51cab50d5783010fb420dfe2ee0689205404562c1b0295f07e45ab`.
- Production site and official Bridge version still UNCHANGED. Draft PR #739 has not been merged. **Code/packaging gate PASS; real owner DOI capture efficacy gate NOT YET MET**, no authentic 6.2.74 owner-session report has been uploaded. Owner can now manually install the trial over the one existing Bridge, perform limited publisher visits, upload local diagnostic, then the assistant can compare genuine receipts to the old baseline. No claim of increased real throughput or production release is justified yet.
