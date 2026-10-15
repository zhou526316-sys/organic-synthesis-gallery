# Historical text 0.2.10: TOC-inspired refactor, deployed Pages and independent diagnostics

- Checked Beijing: 2026-10-15 23:58:36 (+08:00).
- User authorization: explicit “批准” to refactor the independent historical text acquisition line using the existing TOC mainline (complete one-shot registry, publisher-specific routes/handshake, and structured scientific text), without TOC/image/PDF/SI/media/08:00 publication changes.

## Verified merge and production artifact

- [PR #698](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/698) **merged** into `main`, squash merge `c954efe82c4641e77a17797291e4edefd56d6b7e`.
- PR suite: Historical text pilot read-only (#38759587371) success including Node rights/membership tests and simulated Chromium; Site quality gate (#38759587764) success; Private PDF capture regression, target-journal Tampermonkey, Gallery site-data validation all success.
- Production [GitHub Pages #38760618589](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38760618589) completed with `literature_authorization=success`, `build=success`, `deploy=success`.
- Real build log job `116510916641` contains **`HISTORICAL_TEXT_INSTALLER_ARTIFACT_VERIFIED 0.2.10`**, affirming byte-for-byte `dist/gallery-historical-text-pilot.user.js` equality with the reviewed source and matching embedded runtime diagnostic version. Current main `public/gallery-historical-text-pilot.user.js` has `@version 0.2.10`.
- Live main-domain URL `https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js` was fetched through a separate external page-fetch service; the extracted long script includes the new `batchArticleRoot`/publisher routing. The extraction response truncated its front header due output length; **this external read alone does not independently expose the main-domain @version line**. Combined artifact verification + successful Pages deploy + live new-code presence supports the released main script.
- **Backup is stale**: a separate fresh external read of `https://api.gczhouwld.com/gallery-historical-text-pilot.user.js` still directly returned `@version 0.2.9` and lacked the new parser. Last successful production Worker frontend deploy [#38755590691](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38755590691) was created 2026-10-15 14:54 UTC before PR #698 at 15:28 UTC. Worker static assets do not automatically synchronize with every Pages-only userscript update. **Do not advise the API installation URL as a v0.2.10 backup or claim both domains are synced.** No unrequested full production Worker redeployment was performed.
- Canonical one-click installer: `https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js`. User must confirm installed Tampermonkey version 0.2.10 in the actual browser profile. No real Edge/Chrome job was remotely initiated or represented as complete.

## Actual owner-only metadata diagnostic after Pages deployment

- Owner-only, read-only diagnostics workflow [#38665655983](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38665655983) rerun, newest job `116524776368`, **success**. It read at most 200 metadata events, with 146 independent terminal attempts. `rawEventsReleased=0`, `bodyReleased=false`.
- Version event counts: 0.2.8 = **120 events**, 0.2.9 = **80 events**, 0.2.10 = **0 events**. Final-attempt version/reason sums are 81 attempts for old 0.2.8 and 65 attempts for 0.2.9.
- Sample final results: 0.2.9 `timeout=25`, `publisher_script_not_confirmed=24`, `page_http_error=11`, `license_pending_load=3`, `license_not_verified=1`, `saved_local=1`. 0.2.8 sample saved locally one additional item. **Only 2 saved_local out of 146 latest final attempts, which is NOT the owner's full local IndexedDB inventory and not the full-corpus rate.**
- This makes `real_operator_v0210_capture_acceptance=false`: no v0.2.10 browser receipt yet. Do not invent post-refactor success statistics.
- Public production reviewed-body FTS and current 1151-DOI corpus completion are **separate systems**. This deployment only improves privately authorized browser discovery and local capture, not public index rights or automatic web-wide FTS availability.

## Browser acceptance handoff

1. In the authorized Edge or Chrome profile, update Tampermonkey from the canonical Gallery installer; ensure only one active historical text script and that the extension displays 0.2.10.
2. Reload Gallery; open **历史正文 · 独立补抓** and **全库正文覆盖**. The corpus comes from the single complete `toc-demand-live.json` registry checked against `release-delivery.json` DOI membership; it no longer paginates through `/api/literature/catalog-view` to start.
3. **全库开放正文补抓（本机）** targets all formally published DOI including 2026-10+, undated and historical via official OA DOI exact source; **一键补抓全部缺项** visits publisher pages for eligible pre-Oct DOI with verified publication dates, retaining article-by-article rights control. Sample diagnostics (8/12 paper pilots) are not global limits.
4. Confirm status transitions `读取全库注册表中` to actual DOI count, then browser tab startup and eventual capture/rights reason. If owner token already stored in that userscript GM storage, no re-entry is needed. Upload only metadata diagnostic events (no article text). If still 0/0, capture failure-detail screenshot and observed network failures before changing the live script.
5. Do not assert local-indexed counts without a real browser coverage readback. Do not copy restricted manuscript prose into public FTS; no TOC, figure, PDF, SI or 08:00 slot mutation.

**Release classification:** PR merged, Pages static deployed, verified build artifact v0.2.10 and main live new-code presence; API mirror still 0.2.9; real v0.2.10 browser coverage and all-paper legal fulltext acquisition unverified.
