# 2026-09-29 18:00 release deployment diagnostic

The fixed-slot release writer successfully published the reviewed 18:00 subset to repository-owned production data and refreshed TOC demand to 676 cards.

Release workflow run 36553009865:
- release: success
- refresh_toc: success
- deploy_pages / literature_authorization: success
- deploy_pages / build: success
- deploy_pages / deploy: failure

The deploy failure is an environment-protection rejection, not a literature authorization or build failure. GitHub reports that branch `automation/release-20260929-1800` is not allowed to deploy to the `github-pages` environment. The reusable Pages workflow inherits the caller run branch for the environment deployment even though it checks out the exact authorized main snapshot.

At this point repository main contains the authorized 676-card snapshot and TOC demand count 676, while the live site still reports 660 cards. Do not mark the slot synced until a main-branch Pages run successfully deploys the same authorized snapshot and post-release checks pass.
