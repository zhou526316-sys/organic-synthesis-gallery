# Historical fulltext v0.2.12 — Gallery foreground-focus safety gate

- Beijing audit: 2026-10-16 11:42:48 +08:00
- User's explicit approval: "可以", responding to the reviewed finding that v0.2.11 automatically called `GM_openInTab(...,{active:true})` after missing publisher startup heartbeat, switching away from Gallery and making both page-local TOC and history panels appear to disappear.
- Scope: independent historical text userscript and two matching regression tests only. Existing `0.2.11` local packet DB, saved owner token, DOI validation, CC BY/CC0 article-level local storage, public FTS segregation, TOC, body figure, PDF, SI and Beijing daily 08:00 publication remain untouched.

## Confirmed old behavior and implemented fix
- Old `public/gallery-historical-text-pilot.user.js` v0.2.11 had a second `GM_openInTab` inside `publisher_script_not_confirmed` branch with `active:true`. Its page-local TOC/history overlays were not deleted, but the new foreground publisher tab could take visible focus from Gallery.
- [PR #717](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/717), squash-merged to `main` with commit `9234e494d67a336b7ea2826cdcf29eee6a53a869`.
- New `@version 0.2.12`: **only one** `GM_openInTab` caller; `active:manualForeground`. `manualForeground` true only for `mode==='foreground_one'` and selection length exactly one. All normal all-eligible/pilot/reachability/blocked batches stay `active:false`; a genuine no-handler outcome is recorded, not automatically foreground replayed.
- Adds explicit `单篇前台重试（手动）` Gallery control. It chooses the most recently checked eligible prior no-handler/timeout/unknown-response DOI (never unattempted, already DOI-verified, saved, observed HTTP 403/429, or unsupported), at most one. A separate browser-native `window.confirm` states the exact DOI and warns that the browser will switch to a publisher tab. If declined, opens zero tabs and resets the load UI.
- Gallery historical panel now has viewport-constrained height and internal scrolling, ensuring its new manual consent button remains accessible on smaller desktops. Existing local data and credentials are not reset.

## Review and CI gate (passed)
- Changed paths: `public/gallery-historical-text-pilot.user.js`, `scripts/test-historical-text-batch.mjs`, `scripts/test-historical-text-batch-browser.mjs` only.
- Historical text-only read-only pilot: [#38846212782](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38846212782), **success**. Job `116797215575` logged `# tests 43, # pass 43, # fail 0` and `HISTORICAL_TEXT_BATCH_BROWSER_PASS` with `automaticPublisherTabsBackground:true`, `explicitManualForegroundOne:true`. Browser regression covers automatic failed DOI without focus stealing, both page overlay identifiers present, decline opens zero, exact DOI consent opens one foreground, local packet/diagnostics retained.
- Target journal Tampermonkey [#38846212789](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38846212789), Private PDF [#38846212768](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38846212768), Gallery data [#38846212760](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38846212760) all succeeded.
- Site quality gate [#38846212749](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38846212749) all five jobs succeeded.
- Merge checks finalized; no CI failures remaining for this PR.

## Deployment status at initial audit

- Merge automatically queued GitHub Pages [#38846683323](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38846683323), running after the previous Pages workflow due global Pages concurrency. **Must still verify build, deploy and exact public installer version before claiming v0.2.12 is online.**
- Preferred only when live: `https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js`.
- Separate `api.gczhouwld.com` mirror is on an older Worker static-asset version; this PR has not redeployed the entire production Worker. Do not advise it as matching backup without independent byte/version verification.
- The site has not been accessed through the owner's real Edge/Chrome in this ChatGPT run. Post-update actual counts, local database body completeness and publisher reachability cannot be asserted yet.
