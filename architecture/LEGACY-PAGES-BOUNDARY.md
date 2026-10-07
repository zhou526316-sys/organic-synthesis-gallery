# Legacy Pages deployment boundary

Status: automatic legacy Pages promotion retired, 2026-10-07 Asia/Shanghai. The existing remote project and its historical addresses are retained.

## Deployment ownership

| Surface | Current authority | Legacy boundary |
| --- | --- | --- |
| Public Gallery | GitHub Pages with the existing verified literature delivery gates | The former Cloudflare static mirror workflow no longer promotes builds. |
| Public API | Canonical Worker deployment in `.github/workflows/deploy-worker-frontend.yml` | The former Pages API mirror workflow no longer deploys another copy of the backend. |
| Legacy Pages project `organic-synthesis-gallery-public` | Compatibility observation only | The two historical workflow entry points are manual callers of a shared read-only inspection workflow. |

Before this change, `cloudflare-pages-static.yml` and `cloudflare-pages-browser-api.yml` both deployed to the same Pages project from independent concurrency groups. One uploaded a pure static site; the other built `src/pages.js` as an API-capable Pages Worker. Whichever finished last could replace the other. The API mirror also generated a partial backend configuration that did not carry the canonical Worker's current private-PDF, indexed-read, analytics and V3 configuration. Restoring token permissions alone would not resolve this deployment ownership conflict.

Run `37567501290`, job `112618466267`, failed while accessing the Pages project with Cloudflare authentication error `10000`. Its preceding secret-sync step also reported authentication failure. This evidence does not identify the token's exact scope, prove the existing endpoint is unavailable, or establish that a redeploy would be safe.

## Current caller evidence

- The active user shell, account UI, private-PDF access and site-stats surface select the custom API, with the canonical Worker alias retained where applicable.
- The integrated Tampermonkey mainline uses the custom API. The current acceptance flow checks that API and canonical Worker installer locations.
- Historical Bridge/loader builders still contain the Pages API origin. The integrated mainline disables their old queue/scan dispatch, but those retained strings mean remaining legacy clients cannot be ruled out.
- Origin allowlists and historical installer matches alone do not establish an active outbound dependency.

Consequently this change retires automatic writes without deleting the project, removing its compatibility addresses, editing acquisition controllers, or redirecting dormant legacy clients.

## Read-only inspection contract

The two old workflows accept only `workflow_dispatch` and call `legacy-pages-mirror-readonly.yml`. The shared workflow accepts manual/reusable invocation, uses a shared concurrency group and invokes `scripts/inspect-legacy-pages-mirror.mjs`.

The inspector validates endpoint components and performs one GET for project metadata. It rejects redirects, enforces one ten-second request/body deadline and a 128 KiB response limit. It neither installs a deployment SDK nor writes secrets, D1, R2, Worker code or Pages assets.

Every report includes `readOnly: true`, `deployed: false`, and `canRestoreAutomatically: false`. Readability is never deployment approval. Fixed classifications distinguish readable, authentication denied, missing, transport/configuration/upstream errors and invalid responses. Reports exclude credentials, account IDs and upstream messages; an unreadable result writes a sanitized artifact and exits nonzero.

## Regression and acceptance

Local acceptance: `node --test scripts/test-legacy-pages-readonly.mjs` passed 28 tests. The existing inline Worker deployment authority guard also passed, and all four affected workflow definitions parsed successfully.

`worker-deploy-authority.yml` watches both legacy wrappers, the shared workflow and the inspector/tests on push and pull request. Its new gate prevents a later change from silently reintroducing deployment, SDK installation, data writes or automatic triggers through these entries. Its existing canonical Worker, maintenance and staging checks remain in force.

No live credential probe is claimed by the local mock tests. The historical authentication failure remains recorded until a separately observed inspection proves otherwise. A future decision to restore a legacy service requires a defined caller need, a single deployment owner and complete configuration parity; this inspection path cannot restore it automatically.
