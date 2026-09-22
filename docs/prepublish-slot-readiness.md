# Prepublish record validity and target-slot readiness

Context: Organic Synthesis Gallery; supplement to docs/literature-update-protocol.md. Production literature release slots remain 08:00 and 18:00 Asia/Shanghai. This document does not authorize off-slot publication or change the candidate inclusion policy.

## Three separate outcomes

1. Valid staging record: all compact candidates have accounted-for decisions, the paired diagnostic/compact generations agree, and source-check records are correctly typed. A justified pending decision can be valid staging.
2. Finalized semantic review: no pending DOI or open evidence gap, all required challenge reviews complete, and no contradictory readiness flags. A valid pending record is not finalized.
3. Target-slot readiness: finalized semantic review plus a fresh paired audit for the target date and pre-release window. Previous-evening rehearsal data is not the next morning's discovery snapshot.

scripts/validate-prepublish-review.mjs validates staging by default. Its --require-ready mode rejects pending or contradictory release-ready claims.

scripts/check-prepublish-readiness.mjs is a complementary read-only wrapper. It checks exact candidate sets, explicit source health, paired generation/count consistency, real pending decisions, target-slot date/freshness, and stronger publisher proof for a zero-new claim. Its --require-ready mode must return publicationReady=true and exit zero before release. It does not write production data, trigger deployment, or grant permission to publish outside the fixed slot.

## Snapshot freshness

The accepted audit-generation interval is the target slot minus 65 minutes through the target slot: 06:55–08:00 for morning and 16:55–18:00 for evening. Both diagnostic and compact endDate must equal the target Beijing publication date. Their generatedAt values and the review handoffGeneratedAt must match.

For 2026-09-23 08:00, the primary date window is 2026-09-21 through 2026-09-23, with the existing seven-day machine safety tail and activation-date limits retained. A 2026-09-22 evening audit may supply reusable review evidence, but not replace the morning fresh snapshot. Reconcile all carried-over decisions against that fresh candidate set; review new or materially changed evidence rather than simply changing timestamps.

## CI evidence

.github/workflows/prepublish-review-gate.yml independently runs record validation, strict semantic readiness, and strict slot readiness. It preserves each JSON result even when strict readiness fails. Regression fixtures use only temporary synthetic data; no real paper is inserted into production by the tests.

The release task must require success of both 'Require finalized review for publication readiness' and 'Require fresh snapshot for the target 08 or 18 slot' against the current code and current review/handoff snapshot. Regression-test success alone, ordinary staging validation success, or a historical green run is not publication permission.

Blocked publisher checks remain explicitly blocked/unavailable rather than pretending machine source health is publisher access. The wrapper does not silently turn an inaccessible source into zero articles. A zero-new final claim additionally requires the protocol's full publisher-source proof.

TOC and body-figure acquisition remain exclusively Tampermonkey/VPN Bridge; media gaps do not justify an off-slot literature release.
