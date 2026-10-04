# Phase C2b — verified active acquisition filtering

Date: 2026-10-04 Asia/Shanghai.

C1 publishes the versioned Catalog/Locator/Search/all-time membership and its objects are byte-verified after deployment. C2a then added a read-only browser observer. C2b is the first phase that changes **new acquisition eligibility**; it still does not change public frontend membership.

## Unchanged safety boundary

- `toc-demand-live.json` remains the complete all-time Gallery registry. It is never replaced by a Hot-only list.
- Capture protocol remains `VERSION = 6.2.20`; Controller capability remains `2.2.39`. Existing receipts/checkpoints stay compatible.
- Existing 07:35/17:35 recovery and 08:00/18:00 publication chains are unchanged.
- Archive is not withdrawal, deletion, or loss of previous media/evidence.
- In-flight job receipts keep their existing job/DOI fencing. C2b filters only future dispatch.
- Frontend Hot/Archive presentation, user-library migration, summary scheduling, D1/R2 schema changes and Git-history cleanup are outside this phase.

## New acquisition basis

Every authorized Pages architecture release adds a content-addressed `gallery-acquisition-basis-v1` object containing only:

- DOI
- canonical record revision
- first-online date
- date precision
- Gallery added date

The release binds this object by path/hash/byte length. Pages delivery verification treats it as a required architecture object and verifies the deployed bytes on both production origins.

## Browser verification chain

Before opening a new publisher page the controller verifies:

1. complete legacy queue shape;
2. v2 `release-delivery.json`;
3. raw `architecture-v1/release.json` SHA-256 against that delivery;
4. membership, catalog-current/lifecycle, and acquisition-basis object hashes and byte lengths;
5. exact DOI equality between queue, membership, lifecycle union and acquisition basis;
6. acquisition record revision equality with current membership revision;
7. trusted current date from the HTTPS response `Date` header.

Any failure returns an unverified observer result and **blocks new dispatch**. It does not mark records removed and does not delete local state.

## Three-month eligibility

Current Beijing date is derived from the trusted response time, not from the laptop clock.

```
cutoff = BeijingToday - 3 calendar months (month-end clamped)

active =
  firstOnlineDate >= cutoff
  OR archived paper added to Gallery within the latest 7 Beijing calendar dates
```

Cutoff is inclusive. Unknown/invalid/future first-online dates do not become normal acquisition work.

The lifecycle snapshot remains useful audit evidence. If it is from an earlier day, C2b does not keep yesterday's Hot set; active eligibility is recomputed from acquisition basis and trusted current date. A lifecycle snapshot dated in the future fails closed.

Explicit historical repair grants are deliberately not introduced in C2b; they remain a later audited exception.

## Scheduler behavior

- Manual and automatic acquisition require a verified active set.
- Production media-inventory POST requests include only active DOI.
- Current global TOC/staged-figure/evidence inventory APIs remain global in this phase.
- Missing-task generation is filtered to active DOI.
- Existing coverage rows that age out are marked `retired`, not `removed`; attempts, checkpoints and acquired figures stay intact.
- If a corrected future generation makes a retained DOI eligible again, its retained unresolved work can return to pending.
- Automatic controller re-verifies queue and active membership before opening another paper after the existing one-minute refresh boundary. A catalog/day/active-set change ends the current batch and re-ranks from current facts.

## Versioning

- Standalone TOC install metadata: **6.2.22**.
- Capture protocol/checkpoints: **6.2.20** unchanged.
- Controller/Worker compatibility: **2.2.39** unchanged.
- Self-contained Bridge loader: **2.2.40**, so existing Bridge installations can receive C2b without a Worker protocol migration.

## Next phase

After C2b is deployed and its real browser summaries show verified all-time membership plus reduced active work, the next architecture step is the frontend read cutover: Hot default loading with DOI Locator / all-time search / historical favorites and deep links preserved. Pages historical-media trimming must still wait for Archive asset reachability to be proven.
