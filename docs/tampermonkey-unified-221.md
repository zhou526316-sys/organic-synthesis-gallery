# Unified Bridge 2.2.21 / capture core 6.2.21

This forward-update release consolidates the inspected #135/#136 changes rather than publishing incompatible implementations as 2.2.20. The normal three-way merge was audited in run35756658596. Eight exact media/version/queue/test conflicts were resolved; literature datasets and authorization gates remain unchanged.

Unified workbench35757779628 passed task/page/source identity and receipts, actual SQLite verified image publication, paired Chromium capture and cross-origin persistent tab binding/checkpoints, complete queue generation, integrated installer packaging, TypeScript and frontend build. These are controlled regression tests, not an authenticated real-publisher/user-VPN overnight run.

Behavior: one publisher visit collects TOC and numbered Figure/Scheme/Chart images; missing TOC does not block body collection. Candidate selection considers actual source dimensions and vector structure, avoids silently replacing a requested larger file with currentSrc, and rejects recommendation/ancestor contamination. Up to24 images may be collected in a visit with partial checkpoints. Publisher tabs run serially with automatic next batches and bounded backoff.

A controlled tokenless capture launcher establishes persisted Tampermonkey tab identity before navigation to publishers or login pages. New uploads require current version, matching task/page/source identity and actual image validation. Verified immutable SVG/WebP/raster captures obtain D1 readback and explicit apiAvailable/imported receipts; storage alone is not presented as publication. The previous locked direct importer is not used. Old ambiguous captures remain quarantined, and cron cross-DOI operations are read-only audits.

The83 reviewed recovered TOCs and fixed1790082000000 quarantine epoch are preserved. The public installation address stays gallery-vpn-bridge.user.js. Update in place, retain the existing key/configuration, close old publisher/controller tabs, refresh one Gallery page and use the continuous paired-capture menu. Publisher access/login/CAPTCHA may require user action; no guaranteed whole-library success or fixed completion time is claimed.

Release readiness still requires all final PR checks plus matching public installer/core, complete queue, capture-launch page and verified-publication Worker handshake. The first actual user capture batch must be evaluated against its reports and stored/API-visible image assets.
