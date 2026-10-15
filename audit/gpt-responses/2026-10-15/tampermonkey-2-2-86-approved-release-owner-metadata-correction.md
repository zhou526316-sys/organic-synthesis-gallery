# Organic Synthesis Gallery Tampermonkey approved repair — real CI/deployment verification

**Date:** 2026-10-15 Beijing time. **Owner approval:** user replied "批准" to exact six-author metadata correction for previously published Nature DOI, then approval-scoped TM merge/deployment.

## Author-metadata integrity resolution
- [PR #690](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/690), merged SHA `4c4a78f42078806b87997fb7ff6a3d020dd3da09`; 5/5 CI success. One-time immutable, evidence-pinned six-author correction for `10.1038/s41586-026-11242-8`. The fixed-slot `audit/publication-release-state.json` Git blob `cd56d8ecbda84df374603d1e8b455160ab8921a5` was **not changed**. Current source `public/rolling-supplement.json` Git blob `28f3238f45b380855f68fc7ab79da03ba4c9f181` retains exactly Hayato Fujimoto, Masayuki Mizutani, Kazuya Imachi, Teruki Nishioka, Reona Ikeda, Mamoru Tobisu. No new DOI/date/card count. Prior frozen release blob `f0e4b18a3be71e52fb07e84e291f51f652cd03ae` kept as historical authorless snapshot, not silently rewritten.
- [PR #693](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/693), merged SHA `88af9d395b4616dfb988c1681a57fa94f9b0ddac`, 4/4 CI success. Independent `pages-release-delivery.mjs resolve` now requires the **same** exact immutable owner authorization for this one author delta. All other protected snapshots remain fail-closed. Triggered after [Pages #38708479212](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38708479212) correctly found that its older resolver still rejected the source SHA; not a disabled integrity guard.
- Separate PR #688 was informed not to revert correct Nature author data and to retain its DOI/date UI improvements separately.

## Tampermonkey production source
- [PR #684](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/684), merged SHA `2b4b1108fd306a037e24d9f366e104d3f88dea5e`, full 27/27 CI successful after refreshed corrected main.
- Bridge version `2.2.86`, embedded engine `6.2.67`; wire protocol `6.2.20` / controller `2.2.41` unchanged.
- Fixed three owner-approved problems: 
  1. Verified large R2 stage index no longer rejected at obsolete 6,000,000-character cap, bounded 32MiB and ETag CAS preserved. Read-only [R2 diagnostic #38705066633](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38705066633) measured 6,004,600 bytes / 6,000,531 characters, 3,798 records, JSON/schema valid. 15 stage-storage regression tests pass.
  2. Bound publisher heartbeat failure now has one foreground initialization recovery after missing injection and a circuit breaker after 3 consecutive no-heartbeats, preserving unvisited DOI jobs; no publisher-auth bypass. 4 special heartbeat tests pass.
  3. Downloaded private PDF retains original bytes locally for owner-authenticated, hash-checked Gallery replay on deadline and retryable 500/502/503/504; 401/403/429 never bypassed; no publisher duplicate download. PDF transport regression and historical pre-Oct1 guards pass.

## Production deployment/readback at audit moment
- [Worker deploy #38709818817](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38709818817) completed with **success** at exact TM merge SHA `2b4b1108`.
- Direct fresh HTTP content extraction on `https://api.gczhouwld.com/gallery-vpn-bridge.user.js` returned `@version 2.2.86` and embedded `INSTALL_REVISION = '6.2.67'` (escaped markdown underscores), with wire protocol `6.2.20`. This is a verified install link and can be provided now.
- `https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js` had previously returned version 2.2.85 and the newest later read attempt was `target_unreachable`; **do not claim canonical Pages entrance upgraded** without positive readback.
- [Pages old prior deploy #38709599213](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38709599213) still processing its self-contained media/build/browser checks; [new Pages #38709818908](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38709818908) for exact approved 2.2.86 merge remained pending behind serialized predecessor. Do not infer success from queue.
- Real owner browser 6.2.67 caption/body/private PDF capture **not yet observed**. Last manual R2 owner log was `installRevision=6.2.66` while batch running; do not present revised standalone CI as real capture success. New user browser logs are necessary to confirm production recovery rates.
- No media cache deletion, PDF purge, extra 18:00 release, new literature admissions or unauthorized credentials used.

**Owner-usable installer:** https://api.gczhouwld.com/gallery-vpn-bridge.user.js

## User-visible synchronization
This response confirms actual three PR merges, current working production Worker and verified API script link. It separately states that canonical Gallery Pages installer was not yet verified live and user-browser capture acceptance remains outstanding. Avoid claiming all media gaps have disappeared.
