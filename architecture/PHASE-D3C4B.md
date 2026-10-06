# Phase D3c4b — production V3 write activation

Date: 2026-10-06 Asia/Shanghai.
Status: final user-library write cutover gate.

## Meaning of the global write flag

`USER_LIBRARY_V3_WRITE_ENABLED=1` does not instantly rewrite every account.

It allows the current frontend to use bounded V3 mutations. Each account migrates individually on its first successful V3 mutation.

Before that first mutation:

- the account remains legacy-authoritative;
- the V3 shadow must match the legacy state;
- V3 reads remain freshness-fenced to the legacy revision.

On the first successful V3 mutation, in one atomic D1 batch:

- the account receives a durable `user_library_v3_authority=V3` marker;
- V3 current rows/head/shape/change-log advance;
- D3b compatibility rows/head advance;
- the legacy monolithic `user_library_state` row is deleted.

After that point the account never returns to legacy write authority.

## Activation preflight

Before deploying WRITE=1, production must show:

- bounded V3 reads active;
- current legacy-authoritative accounts fully backfilled;
- zero legacy→V3 revision mismatch;
- two stable complete semantic parity passes.

Accounts already V3-authoritative after a prior partial activation/rollback are excluded from legacy parity and are counted separately.

If preflight fails, WRITE=1 is not deployed.

## Isolated production canary

After deployment, the workflow creates one temporary production-D1 user and opaque bearer session. No real user account is used.

The canary proves:

1. empty V3 head is writable;
2. first bounded mutation creates two paper rows and flips per-user authority to V3;
3. V3 head/page/delta return the committed revision;
4. D3b compatibility `account-pull` reconstructs the same state;
5. old `account-save` is rejected after V3 authority;
6. a deliberately stale expectedRevision returns a conflict;
7. a second mutation can update one row and delete another;
8. delta contains update + delete and the global replacement;
9. compatibility read reflects the delete;
10. the legacy monolithic document is absent;
11. V3 authority/head and D3b compatibility head/rows exist as expected.

The temporary user is deleted afterward. Foreign-key cascades must leave no session, authority, V3 head or D3b head residue.

## Automatic rollback

If the isolated canary fails:

- the same built Worker is redeployed with `USER_LIBRARY_V3_WRITE_ENABLED=0`;
- health must prove bounded reads remain enabled;
- effective legacy→V3 shadow resumes for still-legacy accounts;
- already V3-authoritative accounts remain V3-authoritative and become write-suspended;
- their browser keeps dirty local changes but performs neither V3 mutations nor legacy saves.

Rollback therefore stops new writes without reviving stale monolithic state.

## Normal post-activation operation

Legacy-authoritative account:

- reads: V3 shadow with legacy freshness fence;
- writes: first modern save uses V3 mutation and migrates authority.

V3-authoritative account:

- reads: V3 head/page/delta;
- compatibility read: D3b rows-v3-compat;
- writes: bounded dirty-key V3 mutation;
- monolithic `user_library_state`: absent.

Old clients:

- may still use `account-pull` through D3b compatibility rows;
- `account-save/account-merge` are rejected after V3 authority or while global activation requires upgrade.

## Scale properties after cutover

Normal user edit cost is bounded by the changed keys:

- no full-library browser diff;
- no full `state_json` upload;
- <=32 paper keys per mutation request;
- roughly <=1.5 MB target request chunks;
- unchanged D3b compatibility rows are not rewritten;
- delta/tombstone retention is bounded to 512 revisions;
- older delta cursors reset into paged full sync.

This removes the monolithic 1.5 MB document ceiling from normal operation.

## Completion criterion

D3c4b is complete only after:

- D3c3 frontend is deployed on canonical surfaces;
- D3c4a code and schema are deployed with WRITE=0;
- activation preflight passes;
- WRITE=1 deployment succeeds;
- isolated canary passes;
- cleanup passes;
- canonical health remains read=true/write=true/shadow=false;
- no rollback is triggered.

At that point the user-library scale migration D3c is complete.
