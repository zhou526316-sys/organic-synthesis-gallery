# Phase D3c3 — frontend V3-first bounded account reads

Date: 2026-10-06 Asia/Shanghai.
Status: frontend read cutover; write authority remains legacy.

## Purpose

D3c2 proved the authenticated bounded V3 head/page/delta API in production while normal browser account synchronization still used the D3b/legacy account-pull path.

D3c3 makes the browser prefer the bounded V3 read surface without changing how account state is saved.

## Read order

On login / initial merge:

1. request `account-v3-head`;
2. walk `account-v3-page` with bounded keyset pages;
3. keep the assembled state only in a temporary in-memory object;
4. request `account-v3-delta` from the first scan revision;
5. apply delta changes to the temporary object;
6. only after the complete V3 sequence passes all integrity checks may the state be merged into the local store;
7. otherwise discard the entire temporary V3 result and use the existing `account-pull` path.

No partial V3 page is ever applied to the live store.

During polling:

- prefer `account-v3-delta` from the locally remembered revision;
- if `resetRequired=true`, perform a bounded V3 full scan;
- if any V3 request fails, is stale, malformed, or fails integrity checks, use `account-pull`;
- never poll while a local save is active or waiting in the debounce window.

## Integrity checks

The frontend requires:

- one non-empty authenticated user id across head, every page, and every delta page;
- head revision/globalRevision/change-floor consistency;
- explicit papers/metadata split semantics;
- strict paper-key ordering across full pages;
- response count equal to row array length;
- cursor monotonicity;
- delta target revision equal to the returned head revision;
- final paper and metadata counts equal to the final head counts;
- valid user-state global structure.

Any failure converts the entire V3 attempt into a legacy fallback. It is never interpreted as empty state.

## Write boundary

D3c3 does not change writes.

Still used:

- `account-save` for normal writes;
- legacy revision conflict response;
- existing local-vs-remote merge rules;
- legacy `user_library_state` write authority.

Still disabled:

- `USER_LIBRARY_V3_WRITE_ENABLED`;
- client calls to the V3 mutation primitive.

## Rollback

D3c3 has two independent rollback paths:

1. disable `USER_LIBRARY_V3_READ_ENABLED`; the browser receives V3-read-disabled responses and automatically uses `account-pull`;
2. redeploy the previous frontend account-sync module.

Neither rollback requires rewriting user state.

## Regression gate

Dedicated Playwright coverage must prove:

- V3 head + multiple full pages + delta assembles completely before the first account-save;
- successful V3 read never calls legacy account-pull;
- a stale V3 page after an earlier successful page discards all partial V3 state and falls back to legacy atomically;
- malformed/mismatched user identity cannot leak a V3 row;
- logout clears remembered account revision/user state;
- the legacy save path remains the only write mode.

## D3c4 gate

D3c4 may move writes to bounded row-authoritative mutations only after D3c3 browser regressions pass and the V3-first frontend is deployed with the legacy read fallback still intact.

D3c4 must preserve a reversible compatibility path for older clients and must not silently truncate or reject a library merely because the legacy monolithic document would exceed 1.5 MB.
