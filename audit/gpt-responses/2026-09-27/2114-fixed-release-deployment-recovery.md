# Organic Synthesis Gallery — 2026-09-27 18:00 deployment recovery

The 18:00 fixed-slot literature release itself was already atomically written at commit `69bdb1f78d99fe4465b13aeb1fac178e79f5ee85`, with 3 publishable DOI, 3 rejected DOI, 2 deferred DOI and 627 production cards. The post-release audit run `36311679157` had already succeeded and reported exactly 2 unresolved DOI, matching the formal deferred set:
- `10.1002/anie.8666577`
- `10.31635/ccschem.026.202608262`

The remaining failure was deployment-only: the prior GitHub Actions-generated production push did not produce a Pages run. No production literature data was changed during this recovery.

## Recovery actions

1. Appended a deployment-retry-only record to `PAGES_REFRESH` and pushed commit `2f070a30e4c7410a9852c569a66f1481f8793ac4`.
2. This triggered Pages run `36321283468`.
   - `literature_authorization`: success
   - `build`: success
   - `deploy`: success
   - deployed at 2026-09-27T21:11:36+08:00
3. Re-triggered the real literature quality gate with commit `3fe9dbdb126cd2c6019511e8234d74a8ac59ed92`.
4. Quality gate run `36321565249`: success.
5. Triggered final state persistence with commit `9a5275ddcb7c7da4311f4f2ece7ab47ffdd01f95`.
6. Finalizer run `36321624411`: success. The resulting main head before this response-sync commit was `7467b11fa0823edb10746e46d7d47206fd939fad`.

## Final verified state

- phase: `synced_with_pending`
- publicationChecksPassed: `true`
- reviewComplete: `false`
- publicationSlot: `2026-09-27T18:00:00+08:00`
- publicationCommit: `69bdb1f78d99fe4465b13aeb1fac178e79f5ee85`
- pagesRun: `36321283468`
- qualityGateRun: `36321565249`
- postReleaseAuditRun: `36311679157`
- productionCards: `627`
- published DOI count: `3`
- deferred DOI count: `2`
- post-release unresolved: exactly the same 2 deferred DOI
- TOC demand: visibleGapTotal 67; missingOfficialTotal 167; officialUpgradeTotal 100; figureGapTotal 627
- verifiedThrough remains `2026-09-20`

No off-slot literature admission, deletion-only correction, schedule change, or replacement automation was performed.

## Root cause

The production mutation and Pages deployment are separate chains. A push created from a GitHub Actions `GITHUB_TOKEN` is not a reliable trigger for downstream push workflows because GitHub suppresses recursive workflow triggering in common cases. The existing explicit `PAGES_REFRESH` path correctly re-entered the Pages workflow while preserving the immutable literature marker and protected blobs. This recovery therefore fixed the failed deployment without modifying the already-approved 18:00 literature snapshot.
