# Phase D3c — bounded row-authoritative user-library sync foundation

Date: 2026-10-06
Status: foundation only; production row writes remain disabled

## Why D3c exists

D3a/D3b proved row-oriented reconstruction and enabled row reads, but the write authority is still the monolithic `user_library_state.state_json`.

The current compatibility path therefore still has three scale risks:

1. every browser save serializes and uploads the complete account state;
2. the Worker rejects a state larger than 1.5 MB;
3. each legacy write shadows by deleting/rebuilding all `user_paper_state` rows, so a one-paper edit costs O(all papers for that account).

D3c removes those limits without weakening conflict handling or rollback.

## Non-negotiable invariants

- Normal mutable user-state operations are bounded independently of the number of papers in the account.
- Every mutation uses optimistic revision fencing.
- A mutation bundle is bounded by operation count and encoded bytes.
- Deletions are explicit tombstones until every supported delta consumer can observe them.
- Initial synchronization is paged; normal synchronization is delta-based.
- A partial page, missing change-log interval or stale revision never becomes silent data loss.
- Legacy `user_library_state` remains authoritative until a separate activation gate is passed.
- D3c foundation code must not enable production row writes by itself.
- PDF-vault document/copy manifests are separate row-oriented domains; PDF bytes and local filesystem handles never enter this account-state database.

## V3 shadow model

D3c uses isolated V3 tables so the currently active D3b row-read path can keep operating unchanged during validation.

### user_library_v3_head

One row per user:

- user_id
- revision — latest committed account revision
- updated_at
- global_json — bounded non-paper account configuration only
- global_revision — last revision that changed global_json
- paper_count
- metadata_count
- change_floor_revision — revisions older than this require a paged full resync
- schema_version

### user_library_v3_rows

One current snapshot row per paper key:

- user_id
- paper_key
- doi nullable
- paper_present
- paper_state_json nullable
- metadata_present
- metadata_json nullable
- deleted
- revision — revision that last changed this row
- updated_at

A tombstone is `deleted=1` with both presence flags false. Tombstones are retained while they may still be needed for delta synchronization.

### user_library_v3_changes

Append-only bounded synchronization evidence:

- user_id
- revision
- seq
- paper_key
- op: upsert | delete
- row snapshot after the mutation
- updated_at

Primary key is `(user_id, revision, seq)`.

The change log is not the current-state authority; `user_library_v3_rows` is. The log exists so another device can observe deletions and changes that occurred after its last revision.

## Bounded mutation contract

A mutation request contains:

- expectedRevision
- optional bounded global state replacement
- at most 32 paper operations

Each paper operation replaces the current state for one `paper_key`. If neither paper nor metadata is present, the operation becomes a tombstone.

The Worker must:

1. read the current head;
2. require `expectedRevision === head.revision`;
3. read only the rows named by the mutation bundle;
4. compute bounded count deltas;
5. assign one new account revision;
6. atomically write current rows, change-log rows and the new head in one D1 batch.

A runtime that cannot provide the required atomic batch must fail closed for V3 writes.

## Bounded read contract

### Initial/full sync

A full sync reads `user_library_v3_rows` in deterministic `paper_key` pages. The client records the head revision seen when it starts.

Concurrent edits do not invalidate the scan: after the last page, the client requests delta changes since the starting revision. This captures additions whose keys sort before an already-consumed cursor and any rows edited/deleted during the scan.

### Normal sync

A client sends `sinceRevision` and receives a bounded page of `user_library_v3_changes`, ordered by `revision, seq`, plus a continuation cursor and current head revision.

If `sinceRevision < change_floor_revision`, the response must say `resetRequired=true`; it must not pretend the delta is complete.

## Migration path

1. **D3c0 — foundation:** add isolated V3 schema, bounded pure read/write primitives and regression tests. No API activation.
2. **D3c1 — shadow population:** copy the current authoritative legacy account snapshot into V3, preserve legacy shape semantics explicitly, dual-write subsequent legacy saves fail-open, and verify full semantic parity. D3b remains the active read path during this phase.
3. **D3c2 — paged/delta read shadow:** add authenticated read endpoints behind an independent disabled flag; compare reconstructed state with D3b.
4. **D3c3 — frontend compatibility:** teach account-sync to perform paged initial sync and bounded delta polling while legacy save remains authoritative.
5. **D3c4 — row-authoritative writes:** enable bounded V3 mutation writes behind a separate flag only after parity, conflict, tombstone and rollback tests pass.
6. **D3c5 — retire monolithic ceiling:** stop requiring a complete `state_json` write for normal accounts. Keep a limited compatibility/export path only where it is safe.

## PDF-vault interaction

The China-first PDF Vault must not store PDF copy manifests in the monolithic user-library document.

- `user_documents`, `user_document_copies`, capture sessions and derivative metadata remain separate row-oriented tables.
- The user library may reference a document/DOI, but it is not the byte/copy entitlement authority.
- “待电脑获取” should ultimately be a bounded user-document acquisition queue, not an ever-growing top-level JSON array.

## Activation gate

Production V3 writes remain off until all of the following are true:

- historical V3 backfill complete;
- semantic parity is zero-mismatch over all migrated accounts;
- revision-conflict tests pass;
- tombstone propagation tests pass;
- concurrent paged-scan + delta catch-up tests pass;
- malformed/oversized mutation bundles fail closed;
- D1 batch atomicity is required and tested;
- old clients retain a safe compatibility path;
- rollback to D3b row reads is proven;
- no V3 activation changes literature admission, PDF entitlement, media acquisition or analytics authority.
