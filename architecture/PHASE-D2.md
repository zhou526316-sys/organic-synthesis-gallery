# Phase D2a — Active Evidence Index shadow foundation

Date: 2026-10-04 Asia/Shanghai.

D2a addresses the long-term correctness risk in Evidence discovery. The current summary/handoff code still enumerates R2 prefixes with a fixed ten-page ceiling (up to 10 × 1000 objects per prefix). D2a **does not switch those readers**. It first creates a durable, queryable metadata index and proves dual-write/backfill behavior.

## Source of truth

R2 remains the durable source of Evidence bytes and encrypted handoff bytes.

The D1 shadow index stores metadata only:
- DOI;
- Evidence R2 key;
- Evidence packet hash;
- source hash;
- schema version / publisher;
- evidence level;
- text-processing policy;
- captured timestamp;
- encrypted handoff key/readiness and crypto version metadata;
- index/update timestamps.

It never stores publisher full text, Evidence sections/captions/tables, summary prose, signed source URLs, auth tokens, or ciphertext.

## Activation

The entire feature is controlled by:

`EVIDENCE_INDEX_SHADOW_ENABLED=1`

D2a merged with this variable unset. D2a.1 enables it **only in the canonical production Worker deployment** after staging was isolated onto distinct Worker/D1/R2 resources.

D2a.1 changes only shadow metadata writes and backfill. It does not activate any index read path. The admin status contract must continue to report `readPathActive:false`.

When disabled (rollback state):
- Evidence import behaves exactly as before;
- scheduled handoff behaves exactly as before;
- admin status reports `enabled:false`;
- backfill/sample endpoints refuse to operate.

## Dual-write behavior

When the flag is later enabled for shadow validation:

1. Evidence bytes are written to R2 first.
2. The metadata row is upserted into D1.
3. A new Evidence packet for the same DOI replaces the index identity and clears any handoff association unless the packet/source hashes are unchanged.
4. Encrypted handoff bytes are written to R2 first.
5. Handoff metadata is attached only if packet/source hashes match the current Evidence index row.
6. A stale handoff cannot overwrite a newer Evidence packet.

Index failure is fail-open with respect to the existing R2 path: it is diagnostic shadow state, not publication authority.

## Historical backfill

Historical Evidence is indexed with a persistent R2 cursor stored in D1.

Each explicit backfill call processes at most one R2 page (1–1000 objects), commits indexed metadata, then stores the next opaque cursor. There is no fixed “ten pages” loop.

Properties:
- progress survives Worker invocations;
- an R2 list failure leaves prior cursor/counts unchanged except for a recorded error;
- completion is explicit;
- new Evidence arriving during/after backfill is covered by dual-write;
- invalid metadata is counted and skipped rather than silently treated as valid.

The backfill endpoint is authenticated and also requires the shadow feature flag.

### D2a.1 live shadow advancement

After each canonical Worker deploy, the deployment workflow may advance at most four R2 pages (500 Evidence objects per page) using the persisted cursor. This is an operational budget, not a correctness ceiling: unfinished backfill remains resumable on the next canonical deployment.

After advancement the workflow:
- confirms `enabled:true` and `readPathActive:false`;
- reads the legacy R2 Evidence inventory;
- reads up to 1000 D1 index rows;
- once backfill is complete, requires D1 and legacy counts to agree;
- when the current count is <=1000, compares DOI, Evidence packet hash and source hash row by row.

This reconciliation step is `continue-on-error` so a shadow defect cannot take down the existing site. A failure blocks D2b activation, not current Evidence capture or summary publication.

## Admin-only shadow endpoints

All reuse the existing write-token authorization:

- `GET /api/admin/article-summary/evidence-index/status`
- `POST /api/admin/article-summary/evidence-index/backfill?limit=...`
- `GET /api/admin/article-summary/evidence-index/sample?limit=...`

These endpoints are not added to browser-readable public routes.

## Database objects

- `article_evidence_index`
- `article_evidence_index_backfill`

The schema is additive and also retained in `cloudflare/evidence-index-v1.sql`.

## Existing read paths intentionally unchanged

D2a does not modify:
- `getArticleEvidenceInventory()`;
- `pendingHandoffObjects()`;
- `backfillScheduledEvidenceHandoffs()`;
- summary-review candidate selection;
- 12:00 scheduled summary publication;
- C2b acquisition eligibility;
- public frontend;
- Evidence privacy policy.

Those existing functions still scan R2 exactly as before.

## D2b activation gate

Do not switch Evidence discovery to D1 until all are true:

1. live shadow flag is enabled intentionally through the canonical Worker deploy;
2. cursor backfill reports complete;
3. index count/hash identities reconcile with R2 metadata;
4. newly imported Evidence dual-writes consistently;
5. handoff current/stale transitions reconcile;
6. no `no_external_ai` policy row becomes externally processable;
7. summary/handoff candidate output from index matches the old reader over a controlled overlap window;
8. rollback can disable index reads without deleting R2 or index rows.

Only then may D2b remove the fixed ten-page dependency from normal discovery.

C2b remains independently held until a real installed current Tampermonkey/Bridge runtime reports verified architecture membership evidence.
