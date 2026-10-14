# 2026-10-14 · historical body v0.2.9: production deployment and retrospective diagnostic acceptance

**Scope**: Approval for fixing historical publisher tabs flashing closed and too many apparently uncertain licences, reported on 2026-10-14. This is a **production artifact and automated-test acceptance**, not a claim of real v0.2.9 publisher capture in the owner's Windows browser.

## Merged changes and gates

- [PR #655](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/655) merged as `d3de024c8ea5956e6a2d0a14bd9b9e339bd24188`: historical Tampermonkey `@version 0.2.9`; DOI-verified science and article-level rights DOM hydration, no final negative based on two unchanged DOM element counts; `license_pending_load` separate from `license_not_verified`; at most 2 DOI-verified uncertain publisher tabs remain for operator review; one revision-gated retry of prior v026 false negatives, no automatic retry of observed HTTP 403/429; Worker owner-only diagnostic reason whitelist accepts pending reason. No relaxed publication rights, no PDF/SI/figure or public FTS changes.
- [PR #658](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/658) merged as `db5993f9fa64af343ece5807e0bba2147cfe103e`: replace obsolete Pages `@version 0.2.8` grep (which blocked the first postmerge build) with byte-for-byte Pages source equality, script-version match and no rollback below approved 0.2.9.
- [Historical dedicated Chromium + Node/D1 CI #38536659217](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38536659217): success, Node source tests 36/36, private D1 5/5, Playwright Chromium tests including exact DOI + real scientific text + CC BY metadata delayed 3.5 seconds with fixed article heading count; unlicensed and restricted CC BY-NC-ND do not persist.
- [Pages-gate fix #658 site-quality CI #38541768926](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38541768926): success; original site quality, private PDF and historical dedicated gates all passed.
- [Production Worker deploy #38537558817](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38537558817): success; specifically includes `cloudflare/worker/src/historical-text-diagnostics.js` merged in #655, while other production bindings continue to pass canonical health checks.
- Initial Pages run [#38537558684](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38537558684) failed in `Verify self-contained artifact` only due to obsolete 0.2.8 grep; not from browser rights tests or script syntax.
- **Final successful real Pages run [#38542762375](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38542762375)**: literature_authorization, build, deploy all success.
- Fresh live URL reads on 2026-10-14: both `https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js` (canonical) and `https://api.gczhouwld.com/gallery-historical-text-pilot.user.js` (backup) actually report `@version 0.2.9`. Both independently contain `historic-body-evidence-v029`, `license_pending_load`, `BATCH_MAX_REVIEW_TABS=2`, `batchFinishPublisherTab(batchTab,result,paper.doi)` and `BATCH_PUBLISHER_PROBE_MS=9500`, and do **not** contain the legacy `maxProbeMs=3200`. The embedded `@downloadURL` points to the canonical Gallery domain. Raw scripts are served as user.js; text extraction may omit whitespace or escape underscores, so compare semantics after removing Markdown escape characters rather than comparing markdown lengths.

## Post-release owner-only diagnostics: user acceptance still pending

A fresh, purely read-only diagnostic aggregation was requested via `audit/automation-triggers/historical-text-diagnostic-read.json` after production publication, run [#38590898670](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38590898670), success.

The **latest 200 owner D1 metadata events** all report **scriptVersion=0.2.8**. They represent 133 real attempts and 133 final receipts, broken down as:

| Old v0.2.8 terminal reason | Attempts |
| --- | ---: |
| `publisher_script_not_confirmed` | 62 |
| `license_not_verified` | 41 |
| `page_http_error` | 21 |
| `body_missing` | 6 |
| `timeout` | 2 |
| `saved_local` | 1 |
| **Total** | **133** |

Sample HTTP evidence: 48 observed 200, 21 observed 403, 64 unknown; no inferred HTTP status for script-no-handler. There are still older events (`moreEventsExist=true`). This is **not an experiment comparing v0.2.8 and v0.2.9**: there were **zero v0.2.9 diagnostic events** in the latest private sample, and the user's real Windows browser and Tampermonkey permissions are not available to this remote GitHub/CI execution environment.

## Clear next operator action, without conflation

1. Update/overwrite Tampermonkey via the canonical Gallery installer, confirm installed version 0.2.9 (for Edge and Chrome separately if both are used).
2. Reload Gallery and, for an initial controlled publisher acceptance, click the existing `跨期刊正文证据核验（12篇）`. That **12** is only a browser diagnostic sample, **not** a limit on the official 1,000+ DOI source universe. Subsequently use `一键补抓全部缺项` for the historical publisher path and `全库开放正文补抓（本机）` for all formally published DOI with accessible official Europe PMC OA sources.
3. Confirm at least some real `scriptVersion=0.2.9` terminal diagnostics arrive (owner token already stored in corresponding userscript GM local storage); separate observed HTTP403, rights pending, other article licence, science missing, publisher script unconfirmed. Do not claim rights-pending failures are all CC BY or full bodies actually stored.
4. Keep raw article texts, SI, PDFs and third-party images out of this diagnostic registry and publicly accessible FTS until their own source-specific permissions are reviewed.

**Acceptance state:** `production_deployed_and_static_checked=true`, `synthetic_browser_gate_passed=true`, `real_operator_v029_publisher_replay_confirmed=false`, `all_formal_fulltext_complete=false`.
