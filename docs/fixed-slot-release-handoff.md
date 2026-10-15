# Event-driven fixed-slot release handoff

Operational repair, 2026-10-01. This adds no schedule, changes no admission time, and grants no off-slot admissions. The sole daily 08:00 ChatGPT release task remains enabled; failure of one run is not authority to disable that task.

## Problem verified

The 2026-10-01 18:00 prepublish run 36842621094 completed both strict per-DOI checks and deterministic conversion, but the canonical release request and production marker remained at 08:00/726 cards. An external last-minute trigger-file write was a single point of failure. An interactive audit-only main write succeeded during this repair, so universal repository write denial was not established.

## Existing writer now consumes approved evidence

The same literature-fixed-slot-release.yml additionally receives completion events from the existing Validate prepublish literature review workflow. Only a completed successful push gate on main from this repository is accepted. The exact run's prepublish-readiness-evidence artifact must contain both require-ready receipts and a release-preflight bundle with valid byte-level formal-review/pending-queue hashes, matching partitions, scope references and scopeAssessment fields.

The writer checks out trusted main code, validates its frozen input fingerprint, and waits read-only when the named fixed slot is within 65 minutes. At the real slot it re-reads current main and checks authority inputs, scope corrections and coordination state again. It executes the existing apply-fixed-slot-literature-release.mjs, which reruns both --allow-deferred --require-ready validators and strict conversion. Before the atomic commit it rechecks the real clock and current main ref. The fixed 08:00 release now has a user-approved 60-minute technical execution window (08:00–09:00 Asia/Shanghai), including a fresh commit-time and main SHA check. This is a grace window within the sole daily 08:00 release, not a second slot or permission for stale, failed, or unreviewed evidence.

Expired, already-published or superseded slots do not mutate production and do not refresh TOC. Source/gate mismatches, input changes or active authority conflicts fail closed. Requests via the existing push bridge remain serialized in the same concurrency group; neither the writer nor prepublish gate cancels a normally running predecessor.

## Deployment and reporting

The actual current chain is prepublish(push) -> fixed-slot writer(workflow_run or the existing push request) -> Pages(workflow_run on main) -> delivery receipt finalizer(workflow_run). It does not rely on GITHUB_TOKEN recursively causing a push workflow. This supersedes the obsolete workflow_call diagram in the earlier release-contract deployment section; Pages is never called with a release branch's environment identity.

For an event-driven writer, release-execution-result.json records writerRunId, the actual prepublishGateRunId and approvedSourceCommit in the same commit as the review/data/marker. Pages checks that the completed writer actually produced the current marker before building. An expired/no-op writer's success is not a release success. Mandatory literature_authorization, protected hashes, exact DOI union, Chinese titles and two-origin live byte verification remain unchanged.

The delivery finalizer already skips successful Pages workflows without a unique live-verification receipt. A receipt establishes delivery only; it does not invent post-release semantic quality closure or advance verifiedThrough.

The daily 08:00 assistant task should inspect the same-slot writer first. If that writer is armed, running, or already delivered, reuse and verify it; do not race it with another trigger/ref write or duplicate authority lock. The existing trigger bridge is only a fallback if no valid same-slot writer exists. Review incompleteness still blocks itself or the global batch according to the existing scope contract.

## Owner-authorized manual recovery — 2026-10-15 only

After the scheduled 2026-10-15 08:00 release was missed because the candidate audit and full semantic review were absent, the owner explicitly requested that the release gate be opened for a manual run of today's existing scheduled task. The existing 08:00 logical publication slot may therefore complete in a **one-time, date-limited execution window ending at 23:59 Beijing on 2026-10-15**, through `scripts/lib/literature-slot-window.mjs`. This does not establish an 18:00 slot or any recurring late release. On 2026-10-16 and every later date the normal 60-minute grace applies. It is not a revival of the 2026-10-13 seven-DOI owner catchup.

This exception relaxes **time only**, not content or delivery authorization. A complete same-day Crossref/OpenAlex publisher-aware candidate set and dated double-pass decisions, both strict prepublish gates, canonical conversion, immutable source hashes, anti-revival scope corrections, one Git atomic publication commit, no duplicate same-day release, Pages `literature_authorization`, DOI union equality and live verification remain mandatory. A manual run of the final release task **alone** cannot publish when today's `prepublish-review-2026-10-15-0800.json` is absent or incomplete; today's review must first be completed and persisted through its original workflow.

## Acceptance

Run regression tests through the existing prepublish and Pages Actions. An off-slot test may prove that an expired strict bundle is rejected without a production commit, and may redeploy the already-authorized unchanged snapshot. It cannot prove the next slot has published. Record the actual next fixed-slot outcome separately. Never describe configuration changes or a successful no-op as a completed new-literature release.
