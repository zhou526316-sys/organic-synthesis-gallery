# Historical-text v0.2.9 — production licence hydration & browser tab closure acceptance

**Date:** 2026-10-14 Beijing. **User authorization:** explicit “批准” after evidence-based diagnosis of “大部分许可待核实，基本是文献一摊出来就自动关闭了”. **Scope:** independent historical text userscript and owner-only diagnostics; no TOC, figure, PDF, SI, public FTS or 08:00 publication changes.

## Confirmed root cause of v0.2.8

Previously considered a DOI page ready at two h2/h3/h4/p elements, then terminated `license_not_verified` after two equal structural-count samples, before asynchronous copyright section/metadata rendered; owner batch immediately closed that tab. `captureRevision=v026` incorrectly made these uncertain results sticky. Details: `audit/historical-body-review/2026-10-14-license-pending-premature-tab-close-diagnosis.md`; owner metadata-only [Actions #38532983093](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38532983093) showed 10 licence-not-verified among 15 recent v0.2.8 final results, not proof those articles have CC licences.

## Code and test evidence

- User-authorized [PR #655](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/655), merged commit `d3de024c8ea5956e6a2d0a14bd9b9e339bd24188`: historical script `@version=0.2.9`, script diagnostic version 0.2.9, parser revision `historic-body-evidence-v029`; DOI-scoped science and reuse license must be observed; event-driven mutation probe for unresolved pages up to 9.5s, successful cases stop immediately; exactly at most two uncertain DOI-matched publisher tabs retained for manual review. New `license_pending_load` distinct from article-level non-CC legal signal `license_not_verified`. Previous 403/429, login/challenge, wrong DOI remain fail-closed; only an approved CC BY or CC0 article scientific body can be saved, locally.
- Historical [PR #655 tests #38536659217](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38536659217): Node VM tests, SQLite D1 owner-only report contract and Playwright Chromium including DOI-bound **3.5s delayed CC BY metadata** on a page with unchanged node count, negative NC/ND and no-licence cases, two-tab cap, old v026 once-only eligible replay. Whole-site quality CI passed before merge.
- Actual [production Worker deploy #38537558817](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38537558817): **success**, preserving owner-only diagnostic semantics (the new error reason is accepted by the production source; the owner-only diagnostic metadata is not public).
- The first [Pages attempt #38537558684](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38537558684) failed at a **stale hardcoded v0.2.8 installer version grep**, not publisher capture or licence parsing.
- [PR #658](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/658), merged `db5993f9fa64af343ece5807e0bba2147cfe103e`, replaced stale grep with `public/` vs `dist/` byte-for-byte equality, Tampermonkey numeric version >=0.2.9 and equality to the embedded diagnostic version; included regression test. Its **five PR workflows all passed**, including [historical source pilot #38541768949](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38541768949) and [site quality #38541768926](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38541768926).
- Actual final [Pages #38542762375](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38542762375): **literature_authorization, build, deploy = success**. Build logs explicitly printed `HISTORICAL_TEXT_INSTALLER_ARTIFACT_VERIFIED 0.2.9`, without errors.

## Direct public installer readback (uncached preference; actual publicly served URLs)

| Installer | Live @version | Runtime diagnostic version | Rights awaiting hydration marker | Parser revision | Max retained tabs | Review button |
|---|---|---|---|---|---|---|
| `https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js` | **0.2.9** | **0.2.9** | `license_pending_load` present | `v029` | **2** | **关闭待核实页** |
| `https://api.gczhouwld.com/gallery-historical-text-pilot.user.js` | **0.2.9** | **0.2.9** | `license_pending_load` present | `v029` | **2** | **关闭待核实页** |

Both exact URLs were directly read *after* successful Pages deployment. Main Gallery domain is the canonical installer; both links are currently equivalent for this version.

## Real-user acceptance remains separate

The live install + CI prove the fixed code was tested and deployed. They do **not** prove how many genuine publisher websites become newly readable in the user's actual Chrome/Edge Tampermonkey/VPN environment. A small user-driven retry of previously DOI-verified `v026` uncertain pages and inspection of server/local diagnostic reasons is the next scientifically meaningful measurement; no user browser job has been triggered by this audit. No public body search enablement, no local browser packets exported to repository, no claim all 1,087 formal DOI contain true licensed complete text.
