# Project response — historical text user-reported licence pending / instantly closing tabs
- Beijing time: 2026-10-14 17:48:10
- Context: User explicitly approved the feedback-specific repair for "大部分许可待核实，基本是文献一摊出来就自动关闭了", then requested “继续”. 
- Production outcome: **fully delivered and verified v0.2.9 on both domains**.

## User-visible answer, substantially preserved

**Early diagnosis:** v0.2.8 publisher page deemed "ready" after merely two paragraphs/heading nodes, and exited if node counts remained unchanged twice before the article-level CC BY/CC0 licence hydrated. Parent batch closed this publisher tab immediately. Small metadata-only D1 sample found 10 `license_not_verified` of 15 v0.2.8 final results, not proof of licence for those articles.

**Original repair approved and merged:** [PR #655](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/655) merged `d3de024c8ea5956e6a2d0a14bd9b9e339bd24188`. The new v0.2.9 waits on exact DOI/scientific evidence and article-scoped reusable permission. Delayed legal metadata is rechecked via DOM changes, while successful pages return immediately. Up to two DOI-verified licence-uncertain publisher pages are retained for owner review, with 「关闭待核实页」 to release them. Separates `license_pending_load` from observed other-licence `license_not_verified`; never saves unknown or NC/ND article text. Old v026 DOI-verified false negatives receive a one-time safe reevaluation, excluding 403/429 and already saved papers. Tampermonkey IndexedDB packets and owner diagnostics key are not reset.

**First production check and discovered blocker:** Worker [#38537558817](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38537558817) successfully deployed the metadata-only owner diagnostic enum. However initial Pages [#38537558684](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38537558684) failed at a stale hardcoded `@version 0.2.8` guard, not at capture tests. At that time direct live Gallery userscript still served 0.2.8. The user was told not to treat v0.2.9 as deployed yet.

**Pages corrective PR:** [PR #658](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/658), merged as [db5993f](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/db5993f9fa64af343ece5807e0bba2147cfe103e), replaced stale guard with exact source/build artifact byte equality, version >=0.2.9 and diagnosticVersion/version consistency. Five PR workflows, including historical Chromium and full site quality, all passed. The user was informed of the complete merge and Pages release progression without falsely declaring an early live fix.

**Completed real Pages delivery:** [Pages #38542762375](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38542762375): `literature_authorization`, `build`, `deploy` all **success**. Actual build log `HISTORICAL_TEXT_INSTALLER_ARTIFACT_VERIFIED 0.2.9` and no errors. Existing source/TOC/body media, Hot/Archive, account/owner PDF/reader checks passed.

**Direct live installer postdeploy validation:** Both:
- **Canonical** https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js
- **Alternate** https://api.gczhouwld.com/gallery-historical-text-pilot.user.js
were fetched successfully and both had `@version 0.2.9`, `BATCH_SCRIPT_VERSION='0.2.9'`, `license_pending_load`, `historic-body-evidence-v029`, `BATCH_MAX_REVIEW_TABS=2`, and 「关闭待核实页」. Thus formal deployment **is independently confirmed**. No github.io suggested for end users.

**Suggested next user action (not an automatic browser action):** Update the *existing* Tampermonkey script from canonical Gallery link (not a duplicate script); reload Gallery; first use bounded 「抽查 ACS 许可项（最多10篇）」 or 「跨期刊正文证据核验（12篇）」 with actual browser/publisher access to independently measure the rate of real licences and additional local body packets. Browser still required to stay open for this manual test.

**Limits:** Neither successful CI nor Pages deployment proves all 1,087 DOI articles have full text, have CC BY permission, or are accessible through the user's real publisher/browser/VPN environment. No private copyrighted text or HTML source is uploaded, and no public FTS indexing is automatically enabled.

Production audit: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-body-review/2026-10-14-v029-license-hydration-production-acceptance.md

## Source change references
- PR #655: `d3de024c8ea5956e6a2d0a14bd9b9e339bd24188`
- PR #658: `db5993f9fa64af343ece5807e0bba2147cfe103e`
- Post-deploy production acceptance log: `ebcf1ca4d8c097c16a72c91697f39c70c3acdb22`
