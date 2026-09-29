# Organic Synthesis Gallery — fixed-slot downstream deployment hardening

The 2026-09-29 08:00 authorized literature snapshot is already live at 660 production cards. This change hardens future 08:00/18:00 releases so that successful literature admission no longer relies on recursive GitHub Actions push triggering.

## Implemented change

Main commit `f9cad2bc0df8210e4fcc437d89ae63959624d523` changes `.github/workflows/literature-fixed-slot-release.yml` to own the downstream publication chain explicitly:

1. `release` creates/pushes the atomic fixed-slot literature release and exports the exact `release_commit`.
2. `refresh_toc` checks that release commit is present on current main, re-runs the fixed-slot marker validator, rebuilds the live TOC demand queues, requires `webpageDoiCount === productionCards`, commits/pushes the derived queue snapshot, and exports `toc_commit`.
3. `deploy_pages` invokes `.github/workflows/github-pages.yml` directly through `workflow_call`, with the exact `toc_commit` as `deployment_ref`.

The caller now grants the already-required contents/pages/id-token permissions. `github-pages.yml` still runs `literature_authorization` before build/deploy; no authorization gate was removed or weakened.

This removes dependence on the unreliable chain:
`GITHUB_TOKEN push -> another push-triggered workflow`.

## Contract update

`docs/publication-release-contract.md` now contains a deterministic downstream deployment section. Documentation commits:
- `3f1043a378843623d9f7021a50e94f80592a40af`
- `6a1031ddcf18ff7dd3a40ccc50315620b044e132`

The contract explicitly states that release → TOC refresh → Pages deployment is part of the fixed-slot writer, while late-indexed post-release semantic handling remains a separate post-deployment concern.

## Constraints preserved

- Admission times remain Beijing 08:00 / 18:00 only.
- No new replacement scheduled task was created.
- No existing release time was changed.
- No deletion-only correction was performed by this change.
- No production literature DOI set was changed by the hardening commits.
- The current 660-card site remains the already-authorized 2026-09-29 08:00 snapshot.

The next fixed slot will provide the first production evidence that the new integrated chain completes end-to-end without a manual TOC/PAGES_REFRESH recovery. Until that run occurs, the mechanism is implemented but should not be described as production-proven.
