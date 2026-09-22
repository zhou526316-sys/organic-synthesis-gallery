18:25 fallback report revealed a real limitation, but one conclusion in that report was too pessimistic.

The fallback runtime correctly observed that it had no local Node runner and no workflow_dispatch action. However, its GitHub write to audit/review-2026-09-22-1825-fallback.json (commit f8d35327c5059ef3149d2a4d0a9381f1636cb3e7) matched the push trigger of .github/workflows/literature-audit.yml and DID start GitHub Actions run 35715987941. That run completed successfully and produced a fresh machine audit.

A dedicated push-trigger bridge has now been formalized:
- .github/workflows/literature-audit.yml now listens to audit/automation-triggers/literature-audit-request.json.
- The trigger file was initialized in commit 1cd8e25b17738a8903e92327523167ed3b7b1588.
- The explicit bridge run 35716850448 completed successfully.
- docs/literature-update-protocol.md now documents that ChatGPT scheduled tasks do not need local Node or workflow_dispatch when this bridge is available; commit beedd91d884378b5972009ee48f4c8b23d54e473.
- audit/literature-update-state.json was corrected to phase=awaiting_semantic_review and records the bridge, fresh audit, and unresolved count; commit 51bd2f08e93429b2cd8e012320da1c61dea342f2.

Fresh evening audit:
- generatedAt: 2026-09-22T10:40:12.032Z (18:40:12 Beijing)
- sourceRecords: 547
- galleryDois: 503
- missingFromGallery: 36
- unresolved: 36
- potentialGaps: 19
- criticalSourceFailures: 0
- sourceFamilyGaps: 0
- sourceCoverageAnomalies: 0
- historicalCoverageLosses: 0
- closureCoverageAnomalies: 6
- closureDate: 2026-09-21

Therefore the current blocker is NOT absence of a GitHub runner. The machine-discovery layer is now working through the push bridge. The remaining blocker is semantic review of the 36 newly surfaced DOI candidates.

Automation roles were corrected:
- 08:05/18:05 main task: first action is a trigger-file push, then consume fresh audit and review.
- 08:25/18:25 task has been re-enabled and repurposed as the machine-audit bridge + semantic takeover. It must not disable itself merely because local Node/workflow_dispatch is absent.
- 08:50/18:50 terminal task consumes the fresh audit, completes remaining semantic review/data/deploy/quality-gate closure, and uses actual GitHub Actions run results instead of attempting local Node execution.

The independent quality gate is also behaving fail-closed: runs triggered while 36 unresolved remain are failing/queued rather than allowing the state to remain falsely synced.

Next required action is to complete two-pass semantic review of all 36 unresolved candidates, persist the formal review, write any accepted papers, rerun audit/quality gate, deploy, verify production, refresh TOC demand, and only then return phase to synced.
