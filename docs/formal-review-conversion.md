# Deterministic staging-to-formal conversion

This is the second bounded release-pipeline batch. It changes no publication times, literature decisions or production datasets. The converter does not discover articles or decide inclusion.

## Preview and release-preflight modes

Use the existing GitHub Actions runner, not a local Node requirement for ChatGPT scheduled tasks:

```sh
node scripts/convert-prepublish-review.mjs audit/prepublish-review-YYYY-MM-DD-0800.json
node scripts/convert-prepublish-review.mjs audit/prepublish-review-YYYY-MM-DD-0800.json --require-ready
```

The default command is a **preview**. It checks complete candidate accounting and produces a formal-structure bundle on stdout, but always reports `publicationReady=false`. It creates no canonical review, backlog, marker or public dataset. Redirection in CI goes only to RUNNER_TEMP. An evening preview cannot become a morning publication authorization.

`--require-ready` additionally runs the existing per-DOI snapshot/readiness checker in an isolated copy of the exact input bytes. It must pass the same source, complete-DOI-union, two-pass, fixed-slot and 65-minute freshness conditions. The existing Pages authorization and real fixed-slot atomic commit remain required; a successful converter never authorizes an arbitrary late commit.

The prepublish-review workflow runs converter regression tests and a preview, then the two existing readiness checks, then strict conversion. Its artifact contains `formal-conversion-preview.json` and, only after strict success, `formal-release-bundle.json`. A skipped strict step is not success. Consumers must inspect the matching run, exact blob references, mode, conversionValid and publicationReady, not merely download an artifact by name.

## Exact payload and serialization

The bundle supplies `formalReview`, `pendingQueue`, destination paths, and `markerFields`. It partitions every staging decision into accepted/rejected/pending without changing a decision. Missing author/date/journal/priority metadata can be copied only from the same DOI in the handoff. All existing evidence, first pass, challenge, source checks and date/window accounting remain attached. A missing formal `reason` is copied verbatim from the existing evidenceBasis and marked `reasonDerivedFrom`; no new semantic evidence is generated.

Serialize each payload using `JSON.stringify(value, null, 2) + '\n'`. The emitted blob SHAs are computed from these exact UTF-8 bytes using Git's blob header, and tests compare them to `git hash-object`. Arbitrary reformatting changes the SHA and must not reuse the previous marker hash. Source refs bind the exact raw staging, compact and full diagnostic bytes. Conversion time is recorded separately from unchanged handoffGeneratedAt; it is never used to make an old audit fresh.

`markerFields` is only the evidence/partition portion of the release marker. It does not invent productionCards or the protected production-file hashes. Those still require the actual release transaction described in publication-release-contract.md. The formal review, changed data, pending queue and completed marker must enter ONE Git commit, with non-force concurrency protection.

## Deferrals are not exclusions

A documented pending DOI is copied into formal.pending[] and the per-release pendingQueue.items[], never the publishable allowlist. The queue preserves original date, both review passes, source attempts, missing evidence, next action and next fixed review slot. Merge it with the durable historical pendingReviewBacklog; this per-release queue is not a replacement for older unresolved work. Only evidenced final decisions remove older pending items.

The converter rejects missing/duplicate candidates, inconsistent counts or allowlists, missing first/challenge outcomes, mismatched final challenges, missing evidence, unaccounted gaps, invalid journal activation, unreconciled date/journal changes and backdated conversion timestamps. A present but insufficient reason is rejected rather than silently rewritten. Publisher blocked/unavailable counts remain unknown, not zero.

## Evidence and remaining scope

Regression fixtures are synthetic and isolated; they make no network requests and do not write production files. A real staging preview checks structural conversion of the current 26-record input, not a new semantic review of those papers. Its generated formal-shaped content is not persisted into the authoritative `audit/review-*.json` namespace outside the fixed publication slot.

This batch does not finish post-build DOI equality, post-deployment version/DOI/search verification, atomic production writer automation, timing-policy consolidation or notification controls. Do not label those complete based on conversion tests.
