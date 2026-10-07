# Phase D2b2 — bounded summary-candidate D1 selector

Date: 2026-10-07 Asia/Shanghai.
Status: bounded selector foundation installed; production review selection remains on the legacy R2 path.

## Problem

The D2b1 index removed R2 prefix scans from the shadow metadata path, but the indexed selector still loaded every evidence row and every summary-job row into Worker memory before selecting one candidate.

That was not a final scalable read model.

## Bounded selector

D2b2 adds a separate selector with:

- page size 64 evidence rows;
- maximum 4 pages / 256 evidence rows per normal selection;
- SQL ordering identical to candidate priority: newest capture, then evidence level, then DOI;
- job metadata joined only for rows inside that bounded evidence page;
- exact one-row preferred-DOI lookup;
- recent-published count computed by SQL aggregate rather than loading all jobs.

If an eligible candidate is found, it is definitive because every higher-priority row in the bounded ordered prefix was evaluated.

If no candidate is found and the index ends inside the window, the empty result is definitive.

If 256 rows are scanned and more index rows may remain, the selector returns HTTP 409 with `summary_candidate_bounded_window_exhausted`, `definitive:false` and `windowExhausted:true`. It never turns a bounded scan ceiling into a false “no candidate” result.

## Cutover boundary

The existing full-set indexed selector remains only for legacy-vs-index parity comparison. The production summary-review selector remains on the legacy R2 path in D2b2.

A later cutover must compare the selected candidate identity and fail-closed behavior before replacing production discovery.
