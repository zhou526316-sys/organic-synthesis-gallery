# Tampermonkey PR #739 connection-resume acceptance checkpoint

- Beijing: 2026-10-17 19:46 UTC+08:00
- Conversation: user authorized heartbeat false-quarantine optimization only on condition of measurable capture improvement, no decline, no collateral damage, then said “连接中断请继续”.
- Repo: https://github.com/zhou526316-sys/organic-synthesis-gallery
- Draft PR (unmerged, no deployment): https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/739
- PR head: e1f56ca5d70bfb23071a7a62bfcc26c4c373af75
- Changed paths ONLY: public/toc-mainline.user.js; tests/tm-heartbeat-circuit-20261015.test.mjs.

## Concrete change
- Retain 3 distinct-DOI publisher-scoped missing-heartbeat quarantine, no global stop.
- Reserve one eligible, new DOI as bounded recovery probe, keeping all other quarantined DOI blocked; all other publishers proceed.
- Release publisher queue only if same probe DOI and job ID have a real publisher-started heartbeat AND a matching terminal in-script capture receipt. A startup ping alone or controller timeout does not release quarantine.
- Wrong job, mere publisher binding wait, unsuccessful probe, and missing terminal report cannot fake recovery. No infinite retries.
- Original source acquisition adapters, provenance, figure/PDF transport, owner access, private PDFs, historical TOC-only scope, login UI, search UI and 08:00 publication code untouched.
- GitHub Actions test suite re-ran on final head after hardening to require terminal receipt.

## Latest real owner baseline — NOT evidence of post-PR uplift
- Read-only workflow https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39028022464
- Browser installRevision 6.2.73, controller 2.2.41; upload at 2026-10-17 19:12:45 Beijing.
- 320 DOI tasks, 33 visited, 55 attempts, 3 controller resolved, 2 official TOC produced, one figure staged; 52 failed attempts, 28 heartbeat-missing attempts, 10 unverified Elsevier/Chem routes. Finished as blocked_remaining.
- This log predates the PR and cannot establish any production improvement.

## QA and release gate
- Snapshot before final quality-gate conclusion: 26 of 27 distinct GitHub PR workflow groups success; no failures at last verified run listing.
- The remaining site-quality-gate run https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39029444359 is still in_progress, its Playwright interaction job has not finished. Its Worker/API smoke and frontend build/typecheck jobs were successful.
- GitHub PR remains draft, not merged or deployed. The original Bridge 2.2.92 / mainline engine 6.2.73 production installer is not changed by this PR.
- Offline/CI regression is evidence of code-level non-regression in tested paths, NOT proof of improved real authenticated scraping throughput or zero side effects.
- Before a production rollout, complete the Playwright gate, package a separately versioned isolated browser canary, read back canary installer bytes, compare real owner browser DOI visits, accepted DOI-bound official TOCs, body figures, complete text evidence, private PDF cloud stored receipts (not merely deferred), false quarantines, runtime and interactive panels against the 6.2.73 320/33/3 baseline on a comparable cohort. Preserve access controls/403/429 and no unauthorized private data/publication. Revert/fail-closed if any functional regression appears.
- Do not claim 27/27 until the final gate finishes; do not merge or publish on a numerical CI summary alone.

## User-visible continuation summary
The connection-resume work confirmed that the latest tightened fix is committed to draft PR #739 and has undergone a broad new regression suite. It retains DOI- and job-bound startup + terminal receipt before restoring publisher queue. At the latest checkpoint 26/27 CI workflow groups passed, with the site quality gate still running and no failed group. No production changes have been made. Genuine production capture improvement is not yet established and requires separate actual owner-browser canary acceptance.
