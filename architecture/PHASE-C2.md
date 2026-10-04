# Phase C2 — verified three-month acquisition eligibility

Date: 2026-10-04 Asia/Shanghai.

C1 published and byte-verified the inactive Catalog/Locator/Search/all-time membership on both public origins. C2 wires **acquisition eligibility only** into the existing Tampermonkey controller. It does not switch the public frontend to Hot/Archive and does not truncate the all-time queue.

## Authority and data flow

1. `toc-demand-live.json` remains the complete all-time Gallery membership registry used by the existing controller.
2. The Pages architecture release publishes a new content-addressed `gallery-acquisition-basis-v1`: DOI, record revision, first-online date precision/date and Gallery added date.
3. The controller fetches `release-delivery.json`, verifies that the architecture release hash belongs to the deployed v2 delivery, then verifies the referenced membership and acquisition-basis object hashes.
4. The full queue DOI set must equal the complete membership set and every acquisition-basis revision must equal the membership revision.
5. Current date comes from the HTTPS response `Date` header and is converted to Asia/Shanghai. Missing trusted time, hash mismatch, count mismatch, stale/mixed generation or malformed dates blocks **new dispatch**; existing stored media/checkpoints are not deleted.

## Eligibility

Using the already-approved rule:
- Hot = `firstOnlineDate >= BeijingToday - 3 calendar months` (inclusive, month-end clamped).
- Archive recent addition = an older paper added to Gallery within the latest 7 Beijing calendar dates.
- Ordinary Archive, invalid/unknown/future dates do not generate new acquisition jobs.
- An explicit archive-repair grant is not introduced in C2; this remains a later controlled exception rather than silently keeping all Archive active.

The complete queue remains unchanged. Only media inventory requests and newly generated TOC/figure/evidence jobs are filtered by the active DOI set. Coverage rows that age out become `retired`, not `removed`, so partial progress remains available. If a record later becomes eligible again through a corrected date, the preserved row can return to pending.

Automatic runs refresh current membership/eligibility after a minute before opening another article. Crossing Beijing midnight or observing a new catalog ends the current batch after the current article and re-runs ranking. Manual continuous runs refresh on the same cadence.

## Versioning

- Standalone TOC userscript metadata: 6.2.21 (update trigger only).
- Capture protocol remains 6.2.20.
- Server/controller compatibility remains 2.2.39.
- Self-contained Bridge loader becomes 2.2.40 so existing Tampermonkey installs can auto-update without a Worker protocol migration.

## Explicit non-goals

No frontend Hot/Archive switch, no D1/R2 schema migration, no user-library migration, no summary schedule change, no new publication timer, no reduction of canonical membership, no deletion of historical checkpoints/assets, and no automatic history cleanup.

C2 still reads the legacy global TOC/staged-figure/evidence inventories where those APIs are global. Moving those discovery scans to an Active Asset/Evidence Index is a later performance phase.

## Validation PR synchronization marker

PR #276 uses this documentation-only follow-up commit to force GitHub pull_request synchronization against the final C2 code. It does not change runtime behavior or any production authority.
