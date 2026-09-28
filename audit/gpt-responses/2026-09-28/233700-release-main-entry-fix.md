# Organic Synthesis Gallery — release main-entry fix

## Root cause

The missed 2026-09-28 18:00 publication was not caused by a Git conflict. The prepared branch `automation/release-20260928-1800` was exactly one commit ahead of `main` and zero commits behind. The only delta was `audit/automation-triggers/literature-release-request.json`.

The failed step was the ChatGPT GitHub connector's direct update of the protected `main` ref. This is an execution-environment safety restriction, not a repository semantic or review failure.

## Permanent bridge fix

Commit `3cf34780dffe608ceb8bf8c408c1f3209b5c7f57` changes `.github/workflows/literature-fixed-slot-release.yml` so the existing fixed-slot writer accepts release requests pushed to:
- `main`
- `automation/release-*`

Only a change to `audit/automation-triggers/literature-release-request.json` triggers the writer. Editing the workflow or release script alone no longer starts a production release.

The GitHub runner still executes `scripts/apply-fixed-slot-literature-release.mjs`, including the strict 20-minute fixed-slot guard, prepublish validators, deterministic formal conversion, scope-correction anti-revival checks, titleZh checks, protected blobs, and non-force push to `main`.

## Smoke verification

The existing branch was updated to the new bridge behavior and its release request was deliberately retriggered outside the 18:00 window.

- smoke request commit: `1f61367cd9387a06cd23656c8c5da63148129942`
- workflow run: `36444822594`
- branch: `automation/release-20260928-1800`
- trigger: success — the branch push started the existing Fixed-slot literature release writer
- production mutation: none
- guard result: fail closed at the first release preparation step
- exact error: `release request outside fixed-slot execution window: 336.25 min`
- atomic production commit step: skipped

This proves the new branch bridge is active and that an off-slot branch trigger cannot silently publish.

## Scheduling

The existing `Gallery 08/18正式发布` scheduled task remains on the original Beijing 08:00 / 18:00 cadence and is enabled. No replacement schedule was created.

## Missed 18:00 batch

The 2026-09-28 18:00 reviewed snapshot is intentionally not backfilled at 23:xx. Its 11 include decisions remain outside production because the fixed-slot window has passed. The next 08:00 review must consume the current fresh audit and carry forward any still-valid unpublished DOI under the normal fixed-slot rules.
