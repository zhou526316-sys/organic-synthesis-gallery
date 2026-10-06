# Phase D3c4b — production V3 write authority activation

Date: 2026-10-06 Asia/Shanghai.
Status: final user-library write cutover.

## Goal

D3c4b removes the legacy monolithic account document from the normal write path.

After successful activation:

- browser reads prefer bounded V3 head/page/delta;
- browser writes use bounded dirty-key V3 mutations;
- D3b rows remain the compatibility read surface for `account-pull`;
- legacy `user_library_state` is no longer the production write authority;
- the old 1.5 MB whole-document limit no longer limits normal account growth.

## Activation sequence

1. Run a production preflight while V3 writes are still disabled.
2. Require full V3 semantic parity against every current legacy account.
3. Require D3b row semantic parity against every current legacy account.
4. Generate the canonical Worker config with `USER_LIBRARY_V3_WRITE_ENABLED=1`.
5. Deploy through the single canonical Worker deployment workflow.
6. Immediately create one isolated temporary user/session directly in D1.
7. Exercise the real authenticated public account API.
8. Delete the temporary user and verify cascade cleanup.
9. If the canary fails, immediately redeploy the same Worker with `WRITE_ENABLED=0` and rerun the preflight.

No real user account is used for activation testing.

## Canary requirements

The temporary account must prove:

- health reports V3 read/write enabled;
- legacy→V3 and legacy→D3b shadows are effectively disabled under V3 authority;
- initial V3 head is readable;
- bounded mutation creates two rows and global state;
- keyset page reads work;
- delta from revision 0 reports the initial writes;
- `account-pull` reconstructs the same state from D3b compatibility rows;
- stale expected revision returns a conflict;
- a second mutation updates one row and deletes another;
- delta from revision 1 contains the delete tombstone;
- compatibility pull reflects the update/delete/global-state change;
- legacy `account-save` is rejected with `user_library_client_upgrade_required`.

## Per-user authority migration

Global write activation does not blindly rewrite every account.

An existing account claims V3 authority on its first V3 mutation only when:

- legacy revision/updated_at;
- V3 head revision/updated_at;
- V3 shape revision;
- V3 shadow-sync source revision/updated_at

all still agree.

The claim and first mutation are fenced inside the same atomic D1 batch.

If freshness no longer holds, the mutation fails with `user_library_v3_shadow_not_fresh`. The browser enters the safe suspended write state and does not fall back to legacy writes.

## Shadow shutdown

When `USER_LIBRARY_V3_WRITE_ENABLED=1`:

- legacy→V3 shadow/backfill/reconcile/compare are disabled;
- legacy→D3b row shadow/backfill/compare are disabled;
- V3 read remains active;
- D3b row read remains active.

This prevents stale `user_library_state` data from overwriting either authoritative V3 rows or their compatibility mirror after cutover.

The shadow configuration flags remain present so a canary-time rollback to `WRITE_ENABLED=0` immediately restores the pre-cutover shadow behavior.

## Compatibility and older clients

Once a user has V3 authority:

- D3b compatibility rows are updated in the same atomic batch as every V3 mutation;
- `account-pull` reconstructs current state from those rows;
- legacy `account-save/account-merge` are rejected;
- the legacy monolithic row may be deleted as part of authority claim.

This means compatibility reads do not require the 1.5 MB document, while stale clients cannot silently fork state back into the old authority.

## Rollback boundary

Automatic rollback is intentionally limited to the immediate activation canary window.

If the canary fails before normal migration proceeds:

- redeploy with `WRITE_ENABLED=0`;
- delete the synthetic canary user;
- rerun full preflight parity;
- fail the deployment.

After a real user has claimed V3 authority, write rollback is no longer equivalent to restoring the old monolithic document. Such a rollback would place that user into a safe suspended-write state rather than fabricate legacy authority.

Therefore later unrelated deployment checks do not automatically reverse a successful V3 authority claim.

## Final architecture state

Normal user-library work is bounded by changed keys, not total library size:

- writes: at most 32 dirty paper keys per mutation request;
- pages: bounded keyset reads;
- deltas: bounded revision/sequence pages;
- history: latest 512 revision window;
- old clients: row-compatible reads;
- full scans: only initial/recovery flows;
- monolithic legacy JSON: migration/legacy evidence only, not normal read/write authority.

This closes the D3c migration and the user-library scale ceiling.
