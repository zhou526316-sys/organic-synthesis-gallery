# 2026-10-11 09:35:34 Asia/Shanghai — Bridge 2.2.83 / TOC 6.2.64 production delivery + latest owner evidence

Task context: User said “继续” on Tampermonkey work after approving correction of historical Figure 1 TOC-only omissions and inaccurate per-run panel accounting. Main implementation was merged by PR #530. This turn checks production deployment, subsequent acceptance and actual owner-browser diagnostics. No publisher visits, live media writes, PDF reads, or scheduling changes occurred in this turn.

## User-visible response (part 1): PR #530 release/deployment

**PR #530** https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/530 merged as `82b705a442d1229fe819f03ad4fc9a2b30934f4e`, 24/24 PR workflows succeeded. Production GitHub Pages run #38073642408 succeeded; Worker #38073642265 succeeded.

An earlier Oct1 live acceptance run #38073642323 failed immediately after merge because both public installed scripts were still Bridge 2.2.82, before the new Pages/Worker release was available. It is a pre-deployment observation, not evidence of 2.2.83 code failure. Subsequent successful postdeploy readbacks supersede it.

## User-visible response (part 2): verified dual-domain release

Read-only postdeploy checks at **2026-10-11 02:04 Asia/Shanghai**:
- Both `https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js` and `https://api.gczhouwld.com/gallery-vpn-bridge.user.js` returned HTTP 200.
- Both delivered exact `@version 2.2.83`, `INSTALL_REVISION = '6.2.64'`, matching 473,003-character integrated installer, controller 2.2.41; published corpus registry 938 unique DOIs; capture protocol stays 6.2.20.
- Existing owner PDF inventory denies anonymous calls, as required.
- Successful jobs: Dual-domain #38074324639 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38074324639; current installer #38074324589; October scope #38074324582 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38074324582; night verifier #38074324518.
- User may update ONE existing Tampermonkey script from canonical link. Do not clear storage or install a second instance.
- Result **production code deployed and installer readback verified**, **not** proof of a real authenticated publisher scraping pass.

## User-visible response (part 3): actual diagnostics status

Read-only R2 diagnostics read via audit-trigger commit `cbbda70e438a27fd00aab5789c1403ce356265f3`; GitHub Actions #38102259051 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38102259051, job #114360437075 succeeded. Read-only workflow reads existing `local-captures/diagnostics/latest.json`, report index, capture and staged indexes.

- Latest **complete local TOC diagnostic upload** is still 2026-10-10 **17:30:35 Beijing** (`uploadedAt=1791624635608`, kind `manual-local-log-upload`). It predates owner's screenshot showing a 20:41 missing-only run, as well as new 6.2.64 deployment.
- Owner diagnostics `version=6.2.20` is the stable capture protocol, NOT the installed browser engine version. The current last full diagnostic cannot attest to 6.2.64.
- Report index updated 2026-10-11 00:35:34 Beijing, capture index 01:30:10 Beijing, but this does not by itself prove all the 27 TOC/3 owner PDF gaps have been resolved or that the browser ran 6.2.64. Cached reports and static media indices are distinct from a same-run owner diagnostic.
- The specific screenshot unresolved counts (30 DOI, 27 TOC, 3 genuinely missing PDF, 43 attempts, 30/139 publisher tabs) remain **not retested with real browser 6.2.64**.
- The separate confirmed code defect has been fixed in PR #530: Jul–Sep `toc_only` historical papers with Figure 1 still need *official* production-backed TOC. Panel separates all catalogued papers from Oct regular and Jul–Sep TOC-only, distinguishes per-run completed vs untouched inventory reconciled.

## User-facing next steps

Use the same Edge/Chrome Tampermonkey instance and update VPN Bridge to **2.2.83**, confirming integrated engine **6.2.64**; preserve stored PDF bytes and extension data. In signed-in Gallery owner session, after any active job completes, run the menu `使用 owner 授权补传本机暂存私人PDF` (in particular old RSC DOI 10.1039/d6sc06407h had retained original PDF but no stored receipt). Run one missing-only acquisition pass under the updated script, then choose `上传本地 TOC 日志` once. User can then report “日志已上传”; classify each actual DOI by provenance, publisher 403/access, TOC selection, transfer, review/publication, or reader display. Do not claim a data gap is fully resolved based on CI or already-staged assets.

This turn introduced **no runtime code patch**; only a read-only audit workflow trigger and this immutable response synchronization file. Prior scripts/PR remain authoritative.
