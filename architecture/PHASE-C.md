# Phase C1 — publish the inactive read model with every authorized Pages build

Date: 2026-10-04 Asia/Shanghai.

This phase moves the already-validated Catalog/Locator/Search model from a short-lived CI artifact into the normal GitHub Pages artifact. It is still **not consumed** by the production frontend or Tampermonkey.

## Contract

- Existing fixed-slot literature admission remains the only publication authority.
- The Pages build creates `public/architecture-v1/` only after the current literature/media compatibility files have been prepared.
- `architecture-v1/release.json` binds the generated catalog to the current publication slot, exact source commit, marker blob, DOI-set digest and record count.
- Every content-addressed catalog object is hashed and listed. `pages-release-delivery.mjs` re-verifies every object in `dist`, records all hashes in the release-delivery manifest, then verifies the same bytes on both production origins after deployment.
- The static membership object is complete/all-time and contains DOI -> record revision plus explicit withdrawals. It is a versioned content object, not a short-lived authorization lease.
- `productionActivation:false` remains explicit. The existing `src/main.ts`, queue registry and userscript do not read these files in C1.
- Generated `public/architecture-v1/` files are ignored by Git. They belong to the deploy artifact, avoiding another historical data lake in the repository.

## Failure behavior

Any DOI-set mismatch, withdrawal overlap, object hash mismatch, missing locator/search/shard reference, source-marker mismatch or deployed-byte mismatch fails the Pages build/verification. The last verified site remains the recovery anchor.

This phase does not change user data, D1/R2 schemas, media eligibility, summary scheduling, 07:35/17:35 recovery, or 08:00/18:00 publication slots.

## Next gate

After a successful live C1 delivery, C2 may bind a trusted current-membership transport to the queue adapter and exercise the real distributed queue without changing publication membership. Only after queue compatibility and user-facing favorites/status/deep-link regression pass may the frontend switch its default view to Hot.
