# 2026-10-14 23:41:35 Asia/Shanghai — Continue Tampermonkey approved workline after interrupted PR #552

Conversation context: User twice said “继续” after the Oct12 approved inventory/Nature/RSC repair workflow disconnected. This response completes the repository status handover without unwinding any subsequent changes, and verifies the last authenticated owner browser report. Current main is authoritative.

## User-visible content: Tampermonkey work recovered

PR #552 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/552 was ALREADY merged as `58c9d00e10db221816fbfcadfb89156d8193573e`. The owner-authorized repair includes DOI-scoped TOC/figure inventory, bounded first-party Nature official-source checks, and RSC DOI-bound issue/AJAX graphic discovery. Re-submitting 2.2.84 is wrong.

A newer follow-up PR #660 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/660, merge `3192c7045b94696d1c15c290abbb3024072403d7`, is also merged. It eliminates repeated legacy/hidden RSC issue/iframe attempts and uses only ONE first-party DOI-specific issue or search listing, without bypassing 401/403/429. Current `main` userscript has @version **6.2.66**, `INSTALL_REVISION='6.2.66'`, builder has Bridge version **2.2.85**, capture protocol 6.2.20 and controller 2.2.41 remain backward-compatible.

The latest post-deployment verified official installer readback #38556881216, current check #38556881322, Oct1 live check #38556881260, night check #38556881245 all succeeded at 2026-10-14 19:29 Beijing:
- https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js and https://api.gczhouwld.com/gallery-vpn-bridge.user.js both HTTP 200 and exactly same 486,395 bytes.
- Installed Bridge **2.2.85**, integrated TOC engine **6.2.66**, controller **2.2.41**.
- Anonymous access to owner-only private PDF inventory denied.
- These are public installer checks, NOT an authenticated user browser capture proof.

## User-visible content: real collected changes

Existing read-only R2 inspection job #38552746513 (Oct14 18:53 Beijing), refreshed again via read-only request `tm-20261014-2334-current-bridge285-owner-followup` commit `3b0f280b38f6e285949f9844c5f6f07b5f574a4b`, successful run #38591000001 job #115945522435, confirms the **same latest full owner-uploaded log**, timestamp `uploadedAt=1791970390401` = **2026-10-14 18:53:10 Beijing**, with no new complete owner upload as of approx 23:38 Beijing.

That run began at 2026-10-14 11:06 Beijing, finished at 15:10 Beijing. Complete catalog snapshot 1087 papers: 820 July–Sep historical toc_only, 261 ordinary Oct1+ papers, 6 metadata_only outside media dispatch. 207 planned gap DOI, 101 distinct publisher visits, 111 attempts, 43 newly confirmed complete, 2 inventory reconciled already satisfied, 162 still unresolved/blocked (0 pending, 0 cooling), 43 TOC stored, 2 body images staged, 11 text evidence stored. 16 partial, 52 failed; no recorded inventory errors. Owner PDF inventory state `verified`: ready 255, pending 0, failed 0, missing 6, unknown 820 (historical 820 not treated as missing). The report's `version=6.2.20` is protocol version, not proof of installed 2.2.85. The owner upload PREDATES 2.2.85 official live acceptance at 19:29, so no genuine post-2.2.85 browser performance confirmation yet.

RSC example DOI `10.1039/d6sc05170g` recorded official TOC `stored`, budgeted image upload successful, about 21 seconds for the paper. Another RSC historical DOI `10.1039/d6sc02777f` took 173,012 ms with 3 empty issue scans and no TOC. PR #660 specifically removed this wasted repeated-iframe behavior, but no updated owner log proves actual speed improvement yet. Numerous remaining RSC failures are genuine `toc=not_found`. Owner PDF `10.1039/d6sc06407h` returned `already_stored`; still not independently confirmed with actual Range/reader UX. DOI `10.1039/d6sc06879k` had redirected-to-unwhitelisted URL for PDF, not a justification to bypass access rights. Chem access gates still distinct.

## User-visible content: real current completeness and priorities

Production `public/toc-demand-live.json` read from `main`, generated 2026-10-14 23:12:54 Beijing, 1087 DOI:
- Missing official TOC (including Figure1 fallback) 174 total: RSC 31, Nature 123, Science 14, ACS 3, CCS 3.
- Truly **no primary visual** 38 total: **RSC 31** (16 Jul-Sep historical toc_only and 15 Oct standard), ACS 3, Nature 1, Science 3.
- **Nature** 123 missing official TOCs but 122 of them already have a fallback primary image; retain strict official-source semantics, no fabricated TOC. Science 11/14 have a fallback, CCS 3/3 have a fallback.
- The immediate priority is RSC 31 visually empty DOIs, not all 174 official-upgrade requests treated as blank image cards.
- A separate completed "Verify restored TOCs live" workflow #38556881560 verified two older TOC assets had byte/hash integrity, but it is not a full browser completeness test for the 31 RSC missing.

## Conclusions and safe follow-up action

The three originally authorized software repairs are **merged**, and a fourth tightly scoped RSC performance follow-up is merged/deployed. One-shot production installer regression confirms the binaries. New 2.2.85 actual authenticated publisher capture result is **not yet in the owner diagnostic**.

After any existing current collection finishes, update the SAME installed Tampermonkey VPN Bridge instance to 2.2.85 / TOC 6.2.66; do not clear extension data or reinstall another copy. Run one **只补缺项** batch in the authenticated browser (prefer testing the 31 RSC no-visual cases) and use the **上传本地 TOC 日志** menu once after completion; no need to upload if already current full owner log from 2.2.85 exists, but currently there is not one. Then compare real RSC per DOI candidate and official upload receipts, runtime wall time, number of truly stored visuals, inventory deadline/error absence, PDF rights, and Gallery display. No new unapproved feedback patch, no publisher access bypass, no formal publication schedule edits or PDF/media mutations.

Related commits: 58c9d00e10db221816fbfcadfb89156d8193573e, 3192c7045b94696d1c15c290abbb3024072403d7, 3b0f280b38f6e285949f9844c5f6f07b5f574a4b.

response_sync_status=committed.
