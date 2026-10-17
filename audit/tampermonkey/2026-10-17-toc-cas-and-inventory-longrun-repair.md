# Tampermonkey continuation: Oct16 owner log and Oct17 repairs
Beijing: 2026-10-17 after 09:00. This is a read-only log-backed diagnosis and scoped approved code repair; no media/PDF bytes accessed here.

## Verified old state
- Owner R2 snapshot uploaded 2026-10-16 22:38 BJT, installRevision 6.2.71, controller 2.2.41, capture protocol 6.2.20; `phase=running`.
- Queue 213; 124 actually visited DOI, 147 attempts, 18 controller-resolved; 195 unresolved including 105 blocked; 7 success,27 partial,113 failed; 19 TOC receipts,69 body figure stage receipts,20 text receipts. Distinguish controller-resolved from four-layer completion.
- Media stage index 6.38 MB 4029 valid records; repeated TOC and media inventory deadline 16 s.
- Recent 6.2.71 ACS server report shows `official_toc_conflict_review_required` HTTP 409 and `official_toc_production_promotion_failed` HTTP 503. Both categories must not silently be treated as successful publication. Old path wrote R2 captured image and overwrote shared local capture index before checking existing D1 hash.
- `media-write importToc` returned its final state via public `getToc`, whose `official_visual` primary record has precedence over TOC D1. A conflicting stored primary caused existing imported bytes to appear mismatched in downstream 503. The worker now detects primary hash conflicts early as a genuine review case.
- Controller manually rescanned full five-layer corpus every ~60s while running 1180 eligible DOI, causing expensive repeated inventory even where per-DOI results already persisted.

## Changes
1. PR #729 merged at `af6e3010c2d21bde47b549871093c6559e017e50`. 24/24 CI passed:
   - Preflight existing D1 official TOC plus higher priority `official_visual` before R2 writes, reject changed hashes with explicit 409 and no index replacement.
   - If D1 SHA agrees, actually hash R2 bytes and safely reuse (never blindly accept metadata).
   - Protect `local-captures/index.json` via ETag-conditional CAS and bounded retry; invalid index fails closed.
   - Separate 503 promotion failure details from an observed production hash conflict.
2. PR #731 merged at `64c5a4a5fc7df8bebecafaa03d4ae6786d39ee2d`. 36/36 CI ultimately passed:
   - Full owner controller corpus refresh interval from 60s to 10min (initial/manual checks unchanged); reject immediate second 16s exhausted media shard retry.
   - Bridge 2.2.91 / engine install 6.2.72, capture protocol 6.2.20 and controller 2.2.41 unchanged; update release test contracts.

## Deployment and real-browser acceptance
At this record's creation, the main push deploy and dual-domain live postdeploy readback are still being checked. CI passing or merging alone is not proof the user’s Edge Tampermonkey actually injected 6.2.72 or that 101+ true visits / high 4-layer completeness is recovered. Need:
- Worker/Pages success and canonical Gallery + API served installer both 2.2.91 / embedded 6.2.72
- New owner's genuine completed missing-only run and no half-finished run confusion: queued DOI, unique visited, attempts, resolved, source 409 conflicts, staged and visible figures, text evidence, private PDF cloud vs deferred, inventory errors, stop reason
- Keep 409 for conflicting production original TOCs for human evidence review; no mass replacement or publication outside 08:00 BJT; Jul–Sep historical TOC-only unchanged.
