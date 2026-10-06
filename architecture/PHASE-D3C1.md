# Phase D3c1 — user-library V3 shadow population and parity

Date: 2026-10-06 Asia/Shanghai.
Status: shadow-only validation. V3 read/write authority remains disabled.

## Scope

D3c0 created isolated bounded V3 primitives. D3c1 proves that current account state can be mirrored into V3 without changing user-visible behavior.

The authoritative source during D3c1 remains `user_library_state`, because it is still the production write authority and preserves exact compatibility semantics, including empty `papers:{}/metadata:{}` objects and malformed legacy shapes that must not be silently normalized.

D3b row reads remain active. D3c1 does not replace them.

## Production behavior

- `USER_LIBRARY_V3_SHADOW_ENABLED=1`.
- `USER_LIBRARY_V3_READ_ENABLED=0`.
- `USER_LIBRARY_V3_WRITE_ENABLED=0`.
- Existing account merge/save commits legacy state first.
- After the legacy commit, V3 shadow replication runs fail-open.
- A V3 shadow failure is logged but cannot turn a successful legacy save into a user-visible failure.
- No ordinary user route exposes V3.
- Admin-only status/backfill/reconcile/compare routes require the existing write authorization.

## Revision fencing

Each shadow copy is fenced by the authoritative legacy revision.

A copy first claims `inflight_revision`. Row deletion, row insertion, head update and shape update execute only while that claim is current. A lower revision arriving after a newer revision cannot delete, reinsert or overwrite newer V3 state.

The shadow write requires atomic D1 `batch`. If atomic batch is unavailable, the shadow write fails rather than risking a partial snapshot.

## Shape preservation

V3 current rows alone cannot distinguish:
- `papers:{}` from an absent/non-object legacy `papers` field;
- `metadata:{}` from an absent/non-object legacy `metadata` field.

D3c1 therefore adds `user_library_v3_shape` with `papers_split`, `metadata_split`, and the source revision. Full semantic parity compares the exact reconstructed JSON state, not only paper counts.

## Historical backfill

`user_library_v3_backfill` stores a durable user-id cursor. Each invocation processes a bounded page.

If a source account changes after its historical cursor has passed, `reconcile` discovers the revision mismatch and recopies the current authoritative state. Therefore historical cursor completion alone is not a readiness proof.

## Readiness proof

The deployment shadow step requires:

1. historical backfill complete;
2. revision mismatches reduced to zero;
3. V3 head count equal to legacy account-state count;
4. two stable full semantic comparison passes;
5. zero semantic mismatch;
6. V3 read/write flags still false before and after comparison.

The step is diagnostic/continue-on-error. Failure blocks D3c2; it does not roll back or interrupt the active D3b/legacy account path.

## Rollback

Set `USER_LIBRARY_V3_SHADOW_ENABLED=0` and redeploy.

Do not delete V3 tables or rows during rollback. D3b row reads and legacy writes are independent of V3.

## D3c2 gate

Do not add V3 user-facing read endpoints until D3c1 has demonstrated stable zero-mismatch parity in production and rollback has been exercised.

D3c2 may add authenticated paged/full + delta read shadow endpoints, but V3 write authority remains disabled until the later D3c4 gate.
