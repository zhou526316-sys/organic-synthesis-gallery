# Phase D3c2 — authenticated bounded V3 read capability

Date: 2026-10-06 Asia/Shanghai.
Status: bounded V3 read capability; legacy write authority and D3b account-pull remain active.

## Purpose

D3c1 proved full production semantic parity between the legacy account-state authority and the isolated V3 current-state shadow.

D3c2 makes the V3 state readable through bounded authenticated account-sync modes without changing the existing browser account-pull path and without enabling V3 writes.

## Production flags

- `USER_LIBRARY_V3_SHADOW_ENABLED=1`
- `USER_LIBRARY_V3_READ_ENABLED=1`
- `USER_LIBRARY_V3_WRITE_ENABLED=0`

`USER_LIBRARY_V3_READ_ENABLED=1` means the bounded V3 sync surface is available. It does **not** mean the normal `account-pull` route has changed authority.

## Authenticated sync modes

The existing authenticated account endpoint accepts three additional modes:

- `account-v3-head`
- `account-v3-page`
- `account-v3-delta`

The user id is always taken from the authenticated session. The request cannot choose another user id.

V3 sync modes do not repeatedly run the legacy profile-reader migration side effect.

## Freshness fence

Every V3 sync response is checked against the current legacy authority using only:

- legacy revision
- legacy updated_at
- V3 head revision
- V3 head updatedAt

The values must match exactly.

If the shadow is one revision behind, the V3 sync request returns `user_library_v3_not_fresh`; it never returns stale library state as current.

This freshness check is O(1) and does not deserialize the legacy state document.

## Full sync

1. Read `account-v3-head`.
2. Read `account-v3-page` in deterministic `paper_key` order.
3. Preserve the revision from the first scan.
4. After the last page, request delta changes since that initial revision.
5. If delta reports `resetRequired`, restart the bounded full scan.

The head includes the explicit `papersSplit` / `metadataSplit` shape flags so an empty object is distinguishable from a legacy absent/non-object field.

## Delta continuity while legacy writes are authoritative

D3c1 originally mirrored only the current V3 rows. D3c2 extends the shadow write so each successful newer legacy revision also records the net row changes in:

- `user_library_v3_commits`
- `user_library_v3_changes`

Deleted paper keys are retained as current-row tombstones and emitted as `delete` changes.

The initial historical snapshot sets `change_floor_revision` to the source revision. Clients older than that floor receive `resetRequired=true`.

Subsequent legacy revisions preserve that floor and append net changes, so a client synchronized at the initial V3 revision can catch up without downloading the complete library again.

## Authority boundary

Still authoritative:

- legacy `user_library_state` for writes;
- D3b row reader for normal `account-pull`;
- existing conflict/merge semantics.

Not authoritative in D3c2:

- V3 mutations;
- V3 write flag;
- frontend V3 sync selection.

## Failure behavior

- unauthenticated V3 sync -> 401;
- V3 read flag off -> 503;
- V3 head/shape corruption -> fail closed;
- legacy/V3 revision freshness mismatch -> 409 `user_library_v3_not_fresh`;
- change-log floor exceeded -> `resetRequired=true`;
- malformed cursor/revision/limit -> 400.

No V3 read failure is allowed to mutate account state.

## D3c3 gate

D3c3 may teach the browser account-sync client to prefer V3 head/page/delta only after:

- D3c2 unit and deployment contracts pass;
- production V3 parity remains zero-mismatch with bounded read enabled;
- V3 read health is verified;
- the client retains automatic fallback to the existing `account-pull` path;
- browser tests cover initial pagination, delta catch-up, stale-shadow fallback, resetRequired, logout/session changes and cross-device conflict behavior.

V3 write authority remains disabled throughout D3c3.
