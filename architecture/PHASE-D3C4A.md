# Phase D3c4a — bounded V3 write foundation (dormant)

Date: 2026-10-06 Asia/Shanghai.
Status: write-capable code path installed; production V3 write authority remains disabled.

## Purpose

D3c3 moves browser reads to bounded V3 head/page/delta with complete legacy read fallback.

D3c4a prepares the final write cutover without changing production write authority. The implementation must be fully testable while `USER_LIBRARY_V3_WRITE_ENABLED=0`.

## Server mutation contract

The authenticated `account-v3-mutate` mode:

- derives user id only from the bearer session;
- requires `expectedRevision`;
- accepts at most 32 paper operations per request;
- accepts a bounded global-state replacement separately;
- updates one V3 account revision per mutation request;
- performs row/current-state/change-log/head/shape writes in one atomic D1 batch;
- returns a 409 revision conflict rather than overwriting a newer revision.

Each paper operation is a complete replacement for that paper key. It includes the current paper state and metadata when present, or an explicit delete tombstone.

## Bounded browser writes

Normal browser saves do not scan all papers.

The Store change event provides:

- one `paperId` for normal paper edits;
- `scope=global` for global configuration edits;
- optional `paperIds[]` for bounded/mass UI operations whose global action also changes known paper keys.

The client accumulates only those dirty keys.

A save:

1. snapshots the current local state;
2. sends global state separately only when it changed;
3. converts dirty paper keys to complete per-key mutations;
4. chunks mutations at at most 32 keys and approximately 1.5 MB;
5. advances revision after each successful CAS;
6. updates only the committed subset of the in-memory server baseline;
7. removes a dirty marker only if that local key has not changed again during the save.

Metadata-only browser cache entries are never treated as user modifications. Metadata is uploaded only when its paper key is already a real dirty user-state key.

## Conflict and ambiguous-failure recovery

A multi-batch write can partially commit before a later request conflicts or loses its network response.

The client therefore never assumes that an ambiguous failure means “nothing committed”.

It performs a fresh bounded server read, merges with local state using the existing local-wins conflict semantics, recomputes differences from that authoritative revision, and retries at most once.

A full-library comparison is permitted only in this exceptional conflict/recovery path or during initial account merge. Normal edits remain dirty-key bounded.

## Compatibility row mirror

Every successful V3 mutation also updates the D3b compatibility row model in the same atomic batch:

- changed paper rows are upserted;
- deleted paper rows are removed;
- global state/head/counts/revision are advanced;
- unchanged paper rows are not rewritten.

The D3b compatibility reader therefore no longer requires every row to share the current head revision. It validates head revision/counts and reconstructs current rows.

This allows `account-pull` to remain a rollback/older-read compatibility surface after V3 becomes write authority without rebuilding a monolithic document.

## Bounded history

V3 change-log/tombstone history retains at most the latest 512 revision window.

When the floor advances:

- change rows older than the floor are deleted;
- corresponding commit rows are deleted;
- obsolete tombstones older than the floor are deleted;
- current active rows remain.

Clients requesting a revision older than the retained floor receive `resetRequired=true` and must perform a bounded full resync.

## Legacy client behavior after future activation

D3c4a itself does not activate V3 writes.

The server already contains a fail-closed response for legacy `account-save/account-merge` when V3 write authority is on: `user_library_client_upgrade_required`.

The D3c4-capable frontend handles a live flag transition by rereading current server state and switching to bounded V3 mutation without requiring a page reload.

No write is silently redirected to the old monolithic authority after V3 activation.

## Production flags in D3c4a

- `USER_LIBRARY_V3_SHADOW_ENABLED=1`
- `USER_LIBRARY_V3_READ_ENABLED=1`
- `USER_LIBRARY_V3_WRITE_ENABLED=0`

The deployment contract must fail if D3c4a turns the write flag on.

## D3c4b activation gate

D3c4b is a separate production activation.

Before enabling V3 writes it must prove:

- D3c3 V3-first browser read cutover is deployed;
- D3c4a mutation API/client code is deployed on all canonical frontend surfaces;
- current V3 parity is healthy;
- an isolated production canary can mutate a temporary test user, read it through V3, read it through the D3b compatibility path, observe delta, trigger a deliberate revision conflict, and clean up;
- failure automatically redeploys with `USER_LIBRARY_V3_WRITE_ENABLED=0`.

Only after that can the legacy monolithic 1.5 MB document cease to be the normal write path.
