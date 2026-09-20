# Tampermonkey TOC Mainline Handoff — 2026-09-20 21:02 +08:00

This file is the authoritative TOC-browser-mainline handoff for the next GPT chat.

Read these first, in order:
1. `PROJECT_RULES.md`
2. `handoff/TAMPERMONKEY-LITERATURE-HANDOFF-2026-09-20.md`
3. this file

Do **not** resume from the old 168-paper historical TOC gap, the old “ACS only 8 left” conclusion, or the earlier 20-visible-gap snapshot. The current live queue supersedes those states.

## 1. Architectural decision

Tampermonkey is now the **primary TOC acquisition line**.

Primary chain:

```
GPT / GitHub Actions
        ↓
public/toc-demand-live.json
        ↓
Tampermonkey TOC Mainline / integrated VPN Bridge
        ↓
real authenticated publisher browser tabs
        ↓
live DOM + rendered DOM + same-origin iframe + raw HTML candidates
        ↓
image acquisition
(page fetch → GM fetch → rendered canvas)
        ↓
POST /api/media/local-capture/import
        ↓
R2
        ↓
GitHub Pages media merge / Gallery
```

Failure/diagnostic chain:

```
publisher browser attempt
        ↓
per-event trace
        ↓
POST /api/media/tampermonkey-report/import
        ↓
R2 immutable attempt objects + latest index
        ↓
GET /api/media/tampermonkey-reports
        ↓
GPT diagnosis and targeted code fixes
```

Electron TOC Collector and server-side direct importer remain auxiliary. They are not the preferred normal route for authenticated publisher TOC recovery.

## 2. Current production version and commits

Current production Tampermonkey mainline: **v6.2.0**.

Important commits:
- `62af5a4bfee8603d916d0f18fe4f76c7114f0117` — unify VPN Bridge and browser TOC mainline.
- `8877ebabbe02752641dcbb96e7959a3e9b397e1f` — port legacy browser recovery into Tampermonkey mainline.
- `fead6a3e166cba82dff6122dc3762b234949a0e5` — make VPN Bridge packaging accept v6.2.
- `b7ac4ded45d113eb20086e7fefbf0b5aa6fb903e` — preserve diagnostic history, prioritize visible gaps, version-aware cooldown, controller-level failure reporting.

PR #60 merged successfully and all PR checks passed:
- Publisher TOC adapter CI: success.
- Site quality gate: success.
- Cloudflare migration CI: success.
- Validate Gallery authors/site data: success.

Post-merge:
- Deploy Worker frontend assets: success.
- Deploy GitHub Pages frontend: success.
- Publisher TOC adapter CI: success.
- Cloudflare Pages browser API mirror: failed in its own deployment step. This is a secondary deployment track and does **not** block this TOC primary line, which uses GitHub Pages + workers.dev/R2.

## 3. Current live TOC demand

Current repository `public/toc-demand-live.json`:
- generatedAt: `2026-09-20T10:06:26.749Z` (18:06 Beijing)
- webpage DOI count: **483**
- visibleGapTotal: **25**
- missingOfficialTotal: **96**
- officialUpgradeTotal: **71**

Visible gaps — cards with no usable visual:
- ACS: **12**
- Wiley: **13**

Official-upgrade backlog — already has fallback visual, but no true publisher TOC:
- ACS: **2**
- Nature: **65**
- Science: **2**
- Wiley: **2**

Scheduling policy in v6.2:
1. **visible gaps always first**
2. official upgrades only fill unused batch capacity
3. within each priority class, publisher round-robin is used
4. default batch size = 8; configurable 1–20
5. Figure 1 remains fallback only and must never be relabeled as a real TOC

Therefore the immediate order is effectively ACS/Wiley visible gaps first. Do not spend the first run on the 65 Nature fallback upgrades.

## 4. Old-script capabilities restored into v6.2

The earliest successful Tampermonkey approach was valuable because it ran inside the real browser session and inherited VPN/login/cookies/rendered DOM.

v6.2 now restores the important parts:

### 4.1 Real live DOM candidate collection
Scans:
- `img`
- `source`
- `object[type^="image"]`
- `svg image`

Reads lazy/high-resolution attributes including:
- `src`
- `srcset`
- `data-src`
- `data-lazy-src`
- `data-original`
- `data-hi-res-src`
- `data-lg-src`
- `data-src-large`
- `data-full-src`
- `data-full`
- `data-image-src`
- `data-large`
- `data`
- `href`
- `xlink:href`

### 4.2 Publisher metadata
Recognizes graphical/toc metadata such as:
- `citation_graphical_abstract`
- `citation_visual_abstract`
- `citation_toc_graphic`
- `citation_abstract_image`

### 4.3 Raw HTML candidate recovery
Broader filename/URL recovery includes:
- graphical-abstract / visual-abstract / toc graphic/image
- `-gra-01`
- `ga01`
- `fx01`
- Figure-1 style names
- `fig01`, `f01`, `gr01`

### 4.4 Dynamic DOM recovery
`MutationObserver` waits for:
- inserted lazy-loaded images
- src/srcset changes
- data-src/data-lazy-src/data-hi-res-src/data-srcset changes

### 4.5 Same-origin hidden iframe recovery
For publishers where the browser can render more than a raw request:
- Wiley: `/doi/{doi}`, `/doi/full/{doi}`, `/doi/abs/{doi}`
- Science: article/full routes

The iframe:
- loads inside the authenticated browser context
- polls rendered DOM
- scrolls to trigger lazy loading
- reuses the same candidate classifier
- returns official candidate before fallback when found

This is particularly important for Wiley.

## 5. Image acquisition order

For each selected candidate:

1. page-context `fetch(... credentials: 'include')`
2. `GM_xmlhttpRequest`
3. rendered `<img>` → canvas extraction

This ordering is intentional.

For ACS, a typical diagnostic may now look like:

```
candidate found in live DOM
page_fetch → 403
gm_fetch → 403
rendered_canvas → success
R2 upload → success
```

If canvas fails too, GPT must see the exact failure rather than only “ACS failed”.

## 6. Diagnostic contract — HARD REQUIREMENT

Every failed attempt must be diagnosable without asking the user to paste console logs.

Do not reduce diagnostics back to a single generic string.

Each trace event keeps these fields:
- `seq`
- `at`
- `stage`
- `event`
- `status`
- `httpStatus`
- `contentType`
- `url` (query/auth data stripped by Worker sanitization)
- `message`
- `candidateKind`
- `candidateSource`
- `candidateScore`
- `imageWidth`
- `imageHeight`
- `byteLength`

Worker sanitizes trace before R2 storage and must not store tokens/cookies/passwords.

### 6.1 Immutable attempt history

Current Worker report storage is version 2.

A new attempt no longer overwrites the previous DOI report.

Each attempt is stored as a distinct R2 object under the Tampermonkey reports prefix. The per-DOI index retains the most recent **12 attempts** and cumulative failure/success counters.

A later success must **not erase a previous failure**.

Regression test:
`cloudflare/worker/scripts/test-tampermonkey-report-history.mjs`

It explicitly tests:
- failed attempt written
- later success written
- `status=failed` still returns the earlier failure
- `doi=...&history=1` returns both full attempts

### 6.2 GPT review APIs

Production base:
`https://organic-synthesis-gallery.zhou526316.workers.dev`

Latest state per DOI:
```
GET /api/media/tampermonkey-reports
```

All recent failed attempts:
```
GET /api/media/tampermonkey-reports?status=failed&limit=200
```

One DOI latest report:
```
GET /api/media/tampermonkey-reports?doi=<URL_ENCODED_DOI>
```

One DOI full retained history:
```
GET /api/media/tampermonkey-reports?doi=<URL_ENCODED_DOI>&history=1&limit=12
```

One DOI failed attempts only:
```
GET /api/media/tampermonkey-reports?doi=<URL_ENCODED_DOI>&history=1&status=failed&limit=12
```

The production `status=failed` endpoint has already been verified after deployment and returns report schema version 2.

At the time of this handoff it returned zero items because no new browser run had yet populated the new diagnostic history.

### 6.3 Controller-level failures are also reported

The browser publisher page is not the only failure source.

Gallery controller now creates a Worker report when:
- `GM_openInTab` fails → `controller_tab_launch_failed:...`
- no result arrives before timeout → `controller_timeout`

The timeout report includes the last known publisher progress status/URL when available.

This closes the previous blind spot where the hardest failures produced no publisher trace at all.

## 7. Failure taxonomy to expect

Do not diagnose from publisher name alone. Read the trace.

Examples:
- `challenge_not_completed`
- `auth_not_completed`
- `doi_page_mismatch`
- `no_toc_candidate_in_live_dom`
- `no_toc_candidate_after_live_and_iframe_scan`
- `iframe_cross_origin_or_auth_redirect`
- `image_http_403`
- `image_403_and_rendered_canvas_unreadable`
- `rendered_canvas_unreadable`
- `controller_timeout`
- `controller_tab_launch_failed:...`
- `upload_http_401`
- `upload_http_5xx`

GPT must use the sequence of trace events, not only `reason`, to decide the next fix.

## 8. Failure cooldown behavior

Cooldown remains 6 hours to avoid hammering publishers.

It is now tied to:
```
FAILURE_ENGINE_REVISION = VERSION + ':20260920-diagnostic-history'
```

Old failures from a previous engine revision do not block immediate retry after browser logic changes.

The Tampermonkey menu also has:
```
清除 TOC 失败冷却并立即重试
```

Use this only when a code/config/auth change justifies a retry.

## 9. Production URLs

Standalone mainline userscript:
`https://zhou526316-sys.github.io/organic-synthesis-gallery/toc-mainline.user.js`

Current live queue:
`https://zhou526316-sys.github.io/organic-synthesis-gallery/toc-demand-live.json`

Gallery:
`https://zhou526316-sys.github.io/organic-synthesis-gallery/`

Worker diagnostics:
`https://organic-synthesis-gallery.zhou526316.workers.dev/api/media/tampermonkey-reports`

R2 capture index:
`https://organic-synthesis-gallery.zhou526316.workers.dev/api/media/local-capture-index`

Do not put BRIDGE_WRITE_TOKEN or any secret in Git, handoff files, GPT audit, reports, or screenshots.

## 10. Key repository files

Primary browser engine:
- `public/toc-mainline.user.js`

Integrated Bridge packaging:
- `cloudflare/scripts/build-cloudflare-bridge.mjs`
- `cloudflare/scripts/build-bridge-loader.mjs`

Live demand:
- `cloudflare/scripts/build-live-toc-demand-queue.mjs`
- `public/toc-demand-live.json`
- `.github/workflows/toc-demand-refresh.yml`

Worker / R2:
- `cloudflare/worker/src/local-captures.js`
- `cloudflare/worker/src/index.js`

Diagnostics regression:
- `cloudflare/worker/scripts/test-tampermonkey-report-history.mjs`

CI:
- `.github/workflows/toc-publisher-adapters-ci.yml`
- `.github/workflows/github-pages.yml`
- `.github/workflows/deploy-worker-frontend.yml`

## 11. What the next GPT chat should do FIRST

Do not redesign the architecture.

1. Read the three authority files listed at the top.
2. Refetch latest `main`; preserve concurrent site/UI changes.
3. Verify production userscript still reports `@version 6.2.0`.
4. Read current `public/toc-demand-live.json`; do not assume the 25/71 counts are still current if a newer queue exists.
5. Run/ask the user to run the current Tampermonkey/VPN Bridge TOC batch. Start with a small batch (5–8).
6. Wiley: user may need to complete publisher/institution verification. Do not treat the verification window disappearing as success or failure by itself.
7. After the batch, **immediately** read:
   - `/api/media/tampermonkey-reports?status=failed&limit=200`
   - `/api/media/local-capture-index`
   - current live queue
8. For every failed DOI, fetch:
   `/api/media/tampermonkey-reports?doi=<DOI>&history=1&limit=12`
9. Group failures by exact trace signature and fix one signature at a time.
10. Re-run only the affected DOI class / clear cooldown only after a justified fix.
11. After successful captures, deploy/merge local R2 captures into GitHub Pages, require `STATIC_MEDIA_INTEGRITY failures=0`, then rebuild live demand.
12. Continue until visible gaps are zero or each remaining DOI has a documented publisher-side limitation with precise evidence.

## 12. Per-batch GPT review checklist

After every browser batch:

```
A. Read failed-attempt index
B. Read successful local-capture index
C. Map attempts to current live queue
D. For each failed DOI, read full history
E. Identify exact terminal stage:
   navigation/auth
   DOM discovery
   iframe discovery
   candidate classification
   page fetch
   GM fetch
   canvas
   upload
   controller
F. Compare failed candidates against publisher DOM evidence
G. Patch only the responsible layer
H. Run CI
I. redeploy Worker/Pages if applicable
J. retry affected group
K. verify R2 capture
L. verify Pages static media
M. rebuild live demand
```

Never end a batch with only “ACS failed” or “Wiley failed”.

## 13. Current known secondary issue

`Deploy browser API on Cloudflare Pages` failed on post-merge run `35512931190` at the `Deploy Pages browser API mirror` step.

This is **not** the primary TOC path blocker:
- workers.dev Worker deployment succeeded
- GitHub Pages deployment succeeded
- production v6.2 userscript is served
- production diagnostics v2 endpoint is live

Do not divert the next TOC debugging session into this secondary mirror unless it starts affecting the browser mainline.

## 14. Success definition

A TOC recovery iteration is complete only when:
- real official TOC is used when available
- Figure 1 remains explicitly fallback
- every failure has a structured report
- prior failures remain queryable after later success
- GPT can retrieve exact failure traces without asking the user for logs
- successful captures reach R2
- GitHub Pages media merge succeeds
- `STATIC_MEDIA_INTEGRITY failures=0`
- live demand is regenerated from the current site state
- visible-gap count moves downward or the remaining failures have precise documented causes
