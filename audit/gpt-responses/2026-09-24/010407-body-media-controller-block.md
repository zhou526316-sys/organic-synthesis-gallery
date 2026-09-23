# Body media continuation — repeated controller preservation block

Time: 2026-09-24 01:04:07 +0800
Repository: `zhou526316-sys/organic-synthesis-gallery`
Baseline checked before response sync: `main @ ab4a668ee228ce1da1a7a79c90a05bbf2b9ccf25`
Scope: media-only continuation. No literature/card/title/scope/userscript mutation was performed in this run.

## Existing reviewed batch

PR #191 previously merged batch `body5-20260924-0011-01` with 18 individually reviewed body-media files across 5 papers. `10.1021/acs.orglett.6c03248` Scheme 2 remains held for insufficient evidence. The 18 approved files are not marked published because no successful production deployment plus independent live verification was found after the merge.

Current state preserved in this run:
- `published_new`: 0
- `approved_waiting_deploy`: 18
- `held`: 1
- media quarantine generation: `1790082000000` unchanged

## New verified finding: repeated downstream controller failure

The same preservation failure has now occurred in two independent downstream workflows:

1. Production Pages run `35889529295` after PR #191:
   - `literature_authorization` succeeded.
   - reviewed/approved-body merge succeeded; the approved batch was admitted into the build and reported `retainedDifferentFile: []`, `notInCurrentCorpus: []`, `quarantineUnchanged: true`.
   - Worker `/api/media/batch HTTP 500` occurred in a nonfatal mirror-read step and was explicitly allowed to continue.
   - the build later failed in `cloudflare/scripts/merge-new-body-auto.mjs` with `auto_prior_publication_changed`, so deploy was skipped.

2. Separate controlled `Publish validated new body figures` run `35889848632`:
   - prepare/evidence job `107279251346` succeeded.
   - publish/build job `107279430597` rebuilt 67 local captures with zero local-capture failures, recovered reviewed TOCs, merged approved body batches (`approvedItems: 225`, `retainedDifferentFile: []`, `notInCurrentCorpus: []`, `quarantineUnchanged: true`), then failed again at `merge-new-body-auto.mjs` with `auto_prior_publication_changed`.
   - the downstream `Verify new body automatic publication live` run `35890237231` was skipped because publication did not deploy.

The code path verifies each prior auto-published row against the newly rebuilt `media-index`: when the same DOI + figure id exists, it requires unchanged `publicationId`, `verifiedSha256`, `imageUrl`, `evidenceSha256`, and label. At least one historical auto-publication no longer satisfies that immutability check in the rebuilt manifest. The failing log does not identify the exact row, and the failed job did not emit `auto-body-publication.json`/status artifacts, so this run does not guess which DOI/figure is responsible.

## Failure classification

Classify this as a **controller / prior-publication preservation invariant failure**, not as a proven failure of the newly approved 18-image batch.

Evidence does **not** establish a candidate-download, upload, index-write, or page-discovery failure for those 18 files. The nonfatal `/api/media/batch HTTP 500` is not the terminating error and is not evidence by itself of VPN, R2, Cloudflare quota, or publisher failure.

## Concurrency / open-PR check

Open media-related PRs include #187, #181 and #161. PR #161 is the automatic new-body publication path whose preservation gate is now stopping the build. This run did not force-update, merge, close, or overwrite any of those parallel changes.

## Action taken

Per the media-publication contract, repeated blind retries of the affected auto-publication subset are stopped for this run. No publisher recrawl, server-side direct import/repair, login bypass, R2 rewrite, generation move, global cleanup, or userscript update was performed. No additional candidates were promoted while production deployment is blocked by this preservation invariant.

Next safe remediation is to isolate the exact historical auto-published DOI + figure identity that differs between the live publication snapshot and the rebuilt manifest, determine whether the rebuilt entry is a legitimately human-reviewed replacement or unintended precedence change, and then resolve that one conflict through a small PR without weakening the immutability gate. Existing `literature_authorization` and site-quality gates must remain enabled. Only after a successful production deployment and independent live URL/hash/card/TOC verification may the 18 approved files move from `approved_waiting_deploy` to `published`.

This record does not claim a full-library media review or permanent online status.
