# 2026-09-22 evening closure / fixed publish policy

User policy clarified: the production Gallery's only intended literature publication times are **08:00 and 18:00 Asia/Shanghai**, with the morning and evening cycles using the same architecture. Discovery, machine audit, semantic review, quality-gate work and staging must happen **before** those publication times; they are preparation, not user-visible publication. If the staged snapshot is not ready at the fixed publication time, keep the previous production snapshot rather than publishing a partial snapshot late.

## Automation architecture updated

- 07:05 / 17:05 — pre-update machine audit: push-trigger GitHub Node discovery, no PAGES_REFRESH.
- 07:25 / 17:25 — semantic final review + staged data write + quality-gate verification, no PAGES_REFRESH.
- 08:00 / 18:00 — fixed publication gate: publish only a ready_for_scheduled_publish snapshot by PAGES_REFRESH, then verify deployment/live DOI/card count.
- Morning and evening are identical.

## Current evening semantic work

Fresh machine audit generated 2026-09-22T10:40:12.032Z reported 36 unresolved DOI against 503 deployed Gallery DOI.

A complete two-pass semantic review of all 36 candidates was persisted as `audit/review-2026-09-22-evening-36.json` (commit `86b4b2ad41743f7b7534cec23fc072b75ad2bd75`). Decisions: reviewed 36; accepted 9; rejected 27; pending 0.

Accepted DOI staged in `public/rolling-supplement.json` (commit `0858f64b39b8f1c2771dc6423b592014f9d22c31`):

1. 10.1021/jacs.6c13517
2. 10.1021/jacs.6c14159
3. 10.1021/acs.joc.6c01302
4. 10.1021/acs.joc.6c01469
5. 10.1021/acs.joc.6c01295
6. 10.1021/acs.joc.6c01270
7. 10.1038/s41557-026-02258-8
8. 10.1038/s44160-026-01155-9
9. 10.1021/acs.orglett.6c03386

The review includes sourceChecks for all 16 active registry journals and evidenceBasis/challengeDecision/challengeReason for accepted and relevant rejected candidates. The polymer-method inclusion rule was applied: JACS 10.1021/jacs.6c13517 was accepted as genuine polymerization methodology; COF morphology/crystal-growth work 10.1021/jacs.6c13136 was rejected because its novelty is crystallization/morphology control rather than a new polymerization reaction/catalyst/monomer-scope method.

## Publication boundary for this cycle

18:00 had already passed before this semantic closure was available. Under the newly clarified fixed-time policy, this run must **not deliberately trigger a late GitHub Pages publication** via PAGES_REFRESH. The reviewed/staged data should be treated as preparation for the next fixed publication gate unless the production deployment had already been independently triggered by legacy workflows.

At the time of this report, the post-staging literature-audit run `35718479616` was still executing the DOI-union audit. Therefore the final post-staging unresolved=0 / quality-gate-green assertion is not yet claimed here. The recurring pre-update/fixed-publish tasks must consume the resulting audit and only publish at a fixed gate when ready.

TOC / Graphical Abstract / Figure 1 / article figures remain delegated only to Tampermonkey/VPN Bridge. No OA PDF/HTML extraction path was added.
