# Production literature release authorization contract

Status: batch 1 deployment-gate implementation, 2026-09-22. This document does not authorize an off-slot literature release or claim that the full pipeline migration is finished.

## Unit of publication

The user's explicit instruction is that one evidence-gap paper must not block independently verified papers. Use `releasePolicy: "per-doi"` when publishing a verified subset. Every candidate must still have an explicit evidence-backed include/exclude/pending outcome. Missing candidates, generation mismatch, discovery failures, or malformed evidence remain batch-level blockers. Pending means deferred, never excluded or published. `reviewComplete` and `publicationReady` are distinct facts; a release with deferred papers must not be reported as complete semantic closure.

## Actual Pages gate

`github-pages.yml` runs `literature_authorization` before `build`; `deploy` explicitly depends on both. The gate runs `scripts/validate-pages-literature-authorization.mjs` and preserves JSON evidence. It verifies the exact eight protected literature/policy files, not a commit-message assertion that a deployment is media-only. Full Git history is required to verify the immutable cutover marker and release commit.

An unchanged, already authorized literature snapshot may accompany UI or media updates at other times. A new literature snapshot must satisfy fixed-slot authorization. Existing media acquisition, rendering, and fallback lockdown are unchanged. The authorization gate does not scrape publishers or mutate media.

## Atomic marker v2 for the next literature release

Read the current `audit/publication-release-state.json` before writing. Do not update its bootstrap hashes merely to make checks pass. For the first and subsequent new literature release, construct all changed production data, the formal review, the pending queue when applicable, and the new marker in ONE Git tree/commit. Contents API one-file commits are not sufficient for this transaction. Use GitHub Git data `create_blob -> create_tree(base_tree_sha) -> create_commit(parent_sha) -> update_ref(force=false)`, or an authorized GitHub runner doing the equivalent atomic commit. Re-read main and all target SHAs immediately before the write. On a concurrent authoritative-file conflict, do not force-push or overwrite.

The marker must contain:

- `schemaVersion: 2`, `mode: "slot-release"`, `releasePolicy: "per-doi"` (or `full-review-closure` only for a fully finalized batch).
- `publicationSlot` in `YYYY-MM-DDT08:00:00+08:00` or `YYYY-MM-DDT18:00:00+08:00`, `productionCards`, `handoffGeneratedAt`.
- `protectedBlobs`: exact Git blob SHA mapping for the seven production literature datasets plus `shared/literature-policy.js`, as listed in `PROTECTED_FILES` in the authorization script.
- `reviewFile` / `reviewBlobSha`: formal `audit/review-*.json` artifact created in the same commit as the marker.
- `stagingReviewFile` / `stagingReviewBlobSha`: prepublish decisions used by this release.
- `handoffFile` / `handoffBlobSha`: compact candidate input.
- `auditFile` / `auditBlobSha`: matching full diagnostic snapshot.
- `publishableDois`, `rejectedDois`, `deferredDois`: exact disjoint DOI partitions of staging decisions.
- With deferred DOI(s), `pendingQueueFile` / `pendingQueueBlobSha`: immutable per-release queue whose `items[]` covers every deferred DOI and has `doi`, a substantive `reason`, `evidenceNeeded`, and a later fixed `nextReviewSlot`.

All referenced evidence is read at the immutable marker COMMIT, never from a later mutable `latest` filename. It is valid to reference `audit/latest.json` and `audit/unresolved-latest.json` if their blob SHAs are pinned in that release commit. Before constructing the transaction, compare the latest observed candidate set and materially changed metadata to the reviewed set. Do not use freezing to hide an unreviewed increment. No review timestamps or source snapshots may be backdated.

The gate re-runs `check-prepublish-readiness.mjs --require-ready --allow-deferred` against the frozen input for per-DOI releases, while retaining its source, complete-candidate-set, two-pass, and 65-minute target-slot freshness conditions. It rejects any deferred DOI placed in `publishableDois`, any pending quietly converted to excluded, missing retry evidence, inconsistent formal counters, or a production data change committed separately from its marker.

## Formal review structure

Formal reviews must have `publicationSlot`, `handoffGeneratedAt`, `generatedAt`, `accepted[]`, `rejected[]`, `pending[]`, exact `summary.reviewed/accepted/rejected/pending`, and the sourceChecks/qualityControl from the reviewed snapshot. Each row must preserve DOI, title, journal, date, priority, evidence and challenge fields and must have a substantive `reason`. Every accepted/rejected row must have matching challengeDecision and evidenceBasis/challengeReason. Do not merely rename a staging `decisions[]` file. The automatic deterministic converter and full post-deploy sequencing are follow-up work; do not claim their completion from this gate change.

## Scope and remaining work

No new scheduled task or new fetch cycle is added by this change. The existing 07:05/17:05, 07:35/17:35 and 08:00/18:00 stages remain. Fixed-slot commit-time handling retains the existing slot validator for this batch; its 20-minute technical bound is NOT approval for another task to perform arbitrary late publication. The release task must also enforce logical slot, frozen review cutoff, and actual deployment-time reporting. Timing-policy consolidation is not silently solved by this document.

This batch authorizes repository inputs before building. It does not yet prove final generated artifact DOI equality, post-deployment DOI/search equality, or automatic `synced` state. Those must be verified separately against the same release version before declaring publication success. The known `_decision` bug in the older end-to-end validator, deterministic conversion, downstream ordering, audit deduplication and notification settings are separate remaining items.
