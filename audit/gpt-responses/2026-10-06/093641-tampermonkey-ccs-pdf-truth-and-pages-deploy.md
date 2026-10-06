# Tampermonkey / VPN Bridge continuation — CCS TOC + Private PDF truth fix

- Timestamp: 2026-10-06 09:36:41 +08:00
- Repository: `zhou526316-sys/organic-synthesis-gallery`
- Branch: `main`
- Scope: approved Tampermonkey/VPN Bridge media-acquisition work only. No literature discovery/review/reclassification authority was changed.

## Result

This continuation closes the previously identified false-completion paths for CCS TOC and owner Private PDF capture.

Current deployed/public versions:
- TOC userscript metadata: `6.2.32`
- capture protocol/checkpoint compatibility: `6.2.20` (intentionally unchanged)
- controller: `2.2.40`
- VPN Bridge installer: `2.2.51`
- missing-state revision: `20261006-toc-pdf-truth-v6`
- queue coverage: `20261006-queue-coverage-v8`
- Private PDF runtime: `20261006-private-pdf-live-v5`
- Private PDF queue: `20261006-private-pdf-queue-v2`

## Fixes delivered

1. CCS official TOC truth was split into acquisition vs production state.
   - A locally captured/R2 official image no longer counts as a completed webpage TOC by itself.
   - Only the production-layer official TOC closes the TOC gap.
   - If an official local capture exists but production promotion is missing, the DOI is reopened as `official_local` and retried so `/api/media/local-capture/import` can perform the production promotion.
   - Figure 1 remains a fallback only and never counts as official CCS TOC.

2. Private PDF no longer reports false success.
   - PDF completion is only `stored` or `already_stored`.
   - `not_found`, `not_found_cached`, `failed`, or missing lease remain unresolved PDF gaps.
   - A pure PDF task cannot return top-level success when the PDF was not stored.
   - A failed PDF side-channel still does not invalidate a successfully stored TOC/body capture for the same article.

3. Explicit “立即开始任务” semantics were restored.
   - Manual missing-only Start ignores previous PDF `not_found`/failed cooldown and really retries from the current missing queue.
   - A failed DOI is blocked only for the current pass so the controller continues to later missing items.

4. PDF page handling was strengthened.
   - The browser waits for dynamically rendered PDF controls instead of immediately concluding `explicit_candidates=0`.
   - CCS gets a longer wait window.
   - ePDF/HTML viewer wrappers are parsed for an actual nested PDF asset.
   - Same-origin authenticated browser fetch remains first choice; GM download is fallback.
   - The candidate must pass real PDF validation (`%PDF-` header, EOF marker, size bounds).
   - Supporting-information / supplement / SI PDF links, including `/suppl/`, are excluded.
   - Upload is only considered complete after the private endpoint returns a stored receipt.

5. Live capture UI now exposes a separate PDF row/stage:
   - waiting page/dynamic controls
   - discovering
   - browser-session download
   - fallback download
   - validation
   - upload
   - stored
   - not found / failed / no lease

6. The Pages deployment mechanism was repaired.
   - The old “Tampermonkey assets only” workflow depended on the transient `github-pages` artifact from a previous Pages run.
   - GitHub removes that artifact after deployment, so the overlay workflow inevitably became 404/broken.
   - It was retired as an automatic overlay.
   - Tampermonkey source paths now route through the repository's canonical guarded Pages deployment pipeline.
   - Manual recovery of the old workflow delegates to the canonical Pages workflow rather than attempting to reuse a deleted artifact.

## Validation

Final browser regression on the implemented source is green:
- Private PDF browser regression: 13/13 pass.
- Target-journal Tampermonkey capability regression: 11/11 pass.
- Dynamic PDF control wait: pass.
- CCS ePDF viewer nested PDF resolution: pass.
- Supplemental PDF exclusion: pass.
- HTML pretending to be a PDF is rejected: pass.
- Same-origin authenticated browser session precedes GM fallback: pass.
- Publisher 403 does not trigger guessed downloads: pass.
- Pure PDF failure is never reported as success: pass.

The canonical Pages deployment run `37399512562` completed successfully:
- literature authorization: success
- build: success
- deploy: success
- real online delivery verification: success
- deployed search-filter CSS verification: success

The authorization log confirms deployment ref `8188dbca18a966a6168c9c80d4d1f12c69f824d7`, i.e. the current main snapshot, and states the literature snapshot was unchanged/authorized for UI-media deployment.

Live checks after the code rollout show:
- `gallery.gczhouwld.com/gallery-vpn-bridge.user.js` = Bridge 2.2.51
- `gallery.gczhouwld.com/toc-mainline.user.js` = 6.2.32
- live source contains Private PDF v5, queue v8, TOC production-vs-local logic, PDF live telemetry, viewer parsing, and supplemental-link exclusion.

Production `/api/toc` currently returns available records for:
- `10.31635/ccschem.026.202507094`
- `10.31635/ccschem.026.202608392`
- `10.31635/ccschem.026.202607659`

The old Oct-5 CCS reports confirm the prior failures being fixed:
- `10.31635/ccschem.026.202608392` and `...202607659` had `explicit_candidates=0` while the top-level run still said success.
- `...202507094` showed the CCS ePDF path hitting 403 in the GM fallback.

## Important boundary: clicking “原文” and Private PDF activation

This batch intentionally does not auto-activate newly captured raw PDFs.

The private PDF importer stores new files as:
- `processing_state='raw'`
- `active=0`
- `requiresVerification=true`

The owner “原文” router only opens a private PDF when the backend finds an `active=1` document. Otherwise it correctly falls back to the publisher URL. Therefore a successfully captured raw PDF is not yet equivalent to an owner-readable PDF.

Changing that behavior safely requires the next Private PDF processing/identity-verification phase. Raw PDFs should not be flipped to `active=1` without that verification step.

## User-facing status

The approved Tampermonkey capture batch is complete and online. The next local owner-browser run should use Bridge 2.2.51 / TOC 6.2.32 and will retry the unresolved CCS PDF items instead of treating them as already complete. Actual publisher PDF retrieval still requires the user's authenticated school-VPN/browser session.

