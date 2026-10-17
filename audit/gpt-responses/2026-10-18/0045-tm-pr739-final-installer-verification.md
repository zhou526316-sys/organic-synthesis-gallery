# Production Tampermonkey confirmation, 2026-10-18 Beijing

User asks whether the final edition has passed and requests the real production installer rather than a trial.

- PR 739 merged at 2026-10-17T14:11:20Z, merge SHA 737f200da87484d6821eeb95c4281cffac4aeb2f.
- Final PR head 865e65026e09f04f190909602e23a27c9123f2eb has 29/29 successful CI groups.
- GitHub Pages run 39039679121 and Worker deploy run 39039679201 completed success.
- Production installer readback run 39040583664: passed at 2026-10-17T14:24:23Z. Both canonical and API installer endpoints returned HTTP 200 and matched installed Bridge 2.2.93, engine 6.2.74. Each returned 514546 bytes. Publisher authorization, owner PDF, and Jul-Sep historical TOC-only guards present.
- Production acceptance run 39040583606: passed, verifying 2.2.93, engine 6.2.74, controller 2.2.41 unchanged, protocol 6.2.20 unchanged, current PDF bundle, CCS permissions and live media queue. Read-only test with 0 publisher requests, 0 media writes.
- Final installer: https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js
- Verified repository main toc-mainline 6.2.74 and bridge builder 2.2.93. PR publisher-heartbeat recovery prioritizes other publishers ahead of the bounded recovery probe.
- This proves code gate and real production installer delivery, NOT measured throughput improvement with an owner-authenticated browser. No genuine post-fix owner browser capture report was observed in this check.
- User should stop any active captures, update the existing Bridge instead of running a second collector, refresh browser controller and check the displayed versions. Do not provide passwords or private PDF credentials.

The first and second attempts of the live October 1 acceptance after merge failed but final postdeploy acceptance and readback passed. This audit preserves that history.
