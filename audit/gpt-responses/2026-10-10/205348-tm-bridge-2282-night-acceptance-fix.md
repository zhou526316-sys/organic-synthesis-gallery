# 2026-10-10 20:53:48 Asia/Shanghai — Tampermonkey Bridge 2.2.82 workline and verified CI repair

Task context: User requested full handover of the Tampermonkey/VPN Bridge work following the confirmed dual-domain 2.2.82 / engine 6.2.63 / controller 2.2.41 deployment; prior logs had not yet shown a 6.2.63 real publisher run.

## User-visible factual findings and actions

1. Confirmed PR #493 (Bridge owner PDF replay / Chem evidence budget) and PR #497 (historical body-card acceptance false positives) were merged into `main`. The user-visible version remains Bridge 2.2.82 / engine 6.2.63 / controller 2.2.41. The official install link remains https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js (backup https://api.gczhouwld.com/gallery-vpn-bridge.user.js).
2. Verified that old `Verify night capture release live` run #38052546691 was a false negative as a production release verifier: it still required Bridge 2.2.20 and fetched the retired github.io / workers.dev addresses; GitHub logs showed repeated HTTP 403. This did NOT prove actual 2.2.82 RSC/Chem scraping failed.
3. Created and merged PR #500 (https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/500) into `main`, squash commit `7c519a23661feb6668092aeef7658c4a880a5cfe`. Only `.github/workflows/tm-night-live-acceptance.yml` changed; no runtime, queue, media, PDF data, publication or 08:00 scheduling changes.
4. The replacement verifier reuses the existing dual-domain readback, checks 2.2.82/6.2.63 + anonymous owner-PDF inventory denial, checks current 938 non-duplicated DOI queue and consistent backend protocol/controller/media generation. Its report explicitly marks `realUserBrowserOvernightVerified:false`.
5. Production-installed user script readback: gallery + API HTTP 200; each had 470,561 script bytes, installer 2.2.82, engine 6.2.63. No owner inventory leaked to anonymous access.
6. PR CI night acceptance #38053207150 succeeded. PR's Site quality gate #38053207164 completed green in Worker, API smoke, frontend build, Playwright and required gate; target-journal regression #38053207157 and private PDF regression #38053207155 also passed.
7. Most importantly post-merge `main` run #38053584048 (https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38053584048) passed the newly installed production night acceptance without media writes.
8. Historical rule: Oct-1-and-later addedDate papers bundle official TOC, figures, full-text evidence and owner PDF during already-justified publisher visits. July–September retrospective collection is official TOC-only, avoiding extra body/PDF scrape. Already authenticated files are reused by checksums/receipts.

## Real collection evidence still required

- The existing 6.2.61 logs cannot prove 6.2.63 has recovered the old 13 RSC TOC gaps; issue/search listing recovery needs a real authenticated publisher run.
- RSC DOI `10.1039/d6sc06407h` had a locally retained original 884,616-byte PDF from prior run; 2.2.82 native/GM owner upload replay needs an actual 201/already-stored server receipt before it may be considered cloud-stored.
- Chem DOI `10.1016/j.chempr.2026.103043`: six staged figures and evidence upload previously timed out; timeout budget increased to 12s in PR #493. Publisher /pdfft HTTP 403 is not repaired, and should not be bypassed.
- Two prior JOC September cards already contained published figure bytes, and their front-end historical visibility/acceptance policy is separate from acquisition.
- The catalogue of 938 DOIs and PDF inventory audit success does not imply all 938 PDFs are readable; the latest all-library audit had zero new R2 probes.

## Browser evidence next

In the SAME browser/Tampermonkey instance update Bridge to 2.2.82 and verify integrated 6.2.63, without clearing local data; log in to the Gallery admin owner account; after current capture ends, run the Tampermonkey owner-local-PDF-replay menu and verify `10.1039/d6sc06407h`; then run the Oct-1+ gap campaign and upload the local TOC diagnostic log. Judge genuine TOC/body/PDF gaps individually by publisher acquisition, staging, authenticated upload, review publication, and visible front-end display. Do not claim completion without 6.2.63 browser evidence.

Final user-facing status: PR #500 merged and post-merge CI successful; real publisher-browser completeness remains unverified.

Related code commit: 7c519a23661feb6668092aeef7658c4a880a5cfe.
