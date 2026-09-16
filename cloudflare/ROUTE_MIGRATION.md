# Cloudflare API migration inventory

Source of truth: AppDeploy production v93 / snapshot `1789534487433`.

The Worker port should preserve the current HTTP contracts so the Gallery frontend and VPN userscript can migrate with minimal behavioral change.

## Phase 0 — platform shell

- `GET /api/_healthcheck`

## Phase 1 — read-only media serving

These routes unblock the existing Gallery UI first.

- `GET /api/toc`
- `GET /api/article-figures`
- `POST /api/media/batch`
- `POST /api/media/inventory`
- `GET /api/media/bridge-queue`
- `GET /api/media/repair-status`

Target persistence:

- image bytes: R2
- TOC/Figure metadata and repair state: D1 or KV, with D1 preferred where atomic updates matter

## Phase 2 — VPN Bridge write paths

These routes must work before the Tampermonkey bridge can point at Cloudflare.

- `POST /api/toc/import`
- `POST /api/toc/quarantine`
- `POST /api/article-figures/import`
- `POST /api/article-figures/reset`
- `POST /api/media/attempt`
- `POST /api/media/diagnose`
- `GET /api/media-audit`
- `GET /api/media-diagnostics`
- `POST /api/media/render-report`

Important invariant: Figure imports must be atomic/incremental. Do not restore the old reset-then-upload behavior that could lose already cached figures.

## Phase 3 — automated repair / publisher prefetch

- `POST /api/media/repair-batch`
- `GET /api/toc/maintenance-status`
- `POST /api/toc/prefetch-dois`
- `POST /api/toc/prefetch-latest-acs`
- `POST /api/toc/prefetch-latest-wiley`
- `POST /api/toc/prefetch-latest-nature`

The five AppDeploy minute-offset cron jobs can become one Cloudflare scheduled handler that processes a bounded repair batch per run. If runtime limits require it, split publisher-prefetch work into queues rather than recreating five overlapping cron workers.

## Phase 4 — literature metadata and title resolution

- `GET /api/literature/supplement`
- `POST /api/literature/supplement/refresh`
- `POST /api/literature/classify-enhanced`
- `POST /api/literature/completeness-audit`
- `GET /api/literature/completeness-audit-latest`
- `POST /api/paper-titles/resolve`
- `POST /api/title-translations/zh`

Title-known / DOI-missing records must continue to resolve from the title itself. Do not regress to journal+date-only matching.

## Phase 5 — later user-account features

The current production user shell is mostly UI. Account-backed favorites, reading state, notes, custom colors, followed searches, readership counts and feedback should be designed directly against the Cloudflare data model rather than copied from a temporary AppDeploy-specific implementation.

## Cutover gates

Before switching the public frontend or VPN userscript API base:

1. Search, multi-journal filter, sorting, language switch and original-article links match production behavior.
2. No media request can be emitted with an invalid DOI such as `doi=undefined`.
3. Every card always renders a nonblank visual fallback while real TOC/Figure retrieval continues.
4. R2-backed TOC/Figure URLs load without publisher hotlinking.
5. VPN Bridge imports are durable and deduplicated.
6. Existing AppDeploy media is not deleted until the Cloudflare copy is verified.
7. Literature supplements and title→DOI resolution produce the same or better results than v93.
