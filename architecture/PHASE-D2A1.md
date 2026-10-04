# Phase D2a.1 — Enable Evidence Index shadow in production

Date: 2026-10-04 Asia/Shanghai.

D2a merged the dormant Evidence Index foundation. D2a.1 enables only the **shadow write/backfill** path in the canonical production Worker. It does not activate an index-backed reader.

## Production changes

The canonical Worker deployment now:

1. applies `cloudflare/evidence-index-v1.sql` to the existing D1 database;
2. verifies `article_evidence_index` and `article_evidence_index_backfill` exist;
3. generates the production Worker config with:

`EVIDENCE_INDEX_SHADOW_ENABLED = "1"`

4. deploys the same Worker/read paths;
5. runs the authenticated persistent-cursor Evidence backfill after deployment;
6. records a short-lived deployment artifact with reconciliation counts.

The repository `cloudflare/worker/wrangler.toml` intentionally remains flag-free. The shadow flag is enabled only in the canonical production deployment configuration.

## Safety boundary

R2 remains authoritative for Evidence and encrypted handoff bytes.

D2a.1 does **not** switch:
- `getArticleEvidenceInventory()`;
- scheduled-handoff pending discovery;
- scheduled-handoff historical backfill;
- summary-review candidate discovery;
- the 12:00 scheduled publication path.

The deployment contract test fails if those functions begin reading `article_evidence_index`.

The Evidence Index admin status must continue to report:

`readPathActive: false`

## Evidence backfill

The production deployment calls the authenticated cursor backfill endpoint with up to 1000 R2 objects per call. Backfill progress is persisted in D1, so a later deployment continues from the stored cursor.

The deployment helper allows up to 100 pages in one run as a safety budget. Hitting that budget is a visible shadow failure; it does not claim completion and it does not reset the cursor.

After completion, the deployment compares:
- current D1 indexed Evidence count;
- legacy R2 Evidence inventory count;
- skipped-invalid metadata count.

The legacy inventory still has its historical 10×1000 ceiling. Therefore:
- below 10,000 returned items, count disagreement beyond skipped-invalid rows is an error;
- at 10,000, the old reader is treated as saturated and cannot prove total completeness.

## Handoff limitation

D2a.1 does **not** backfill historical encrypted-handoff readiness into D1.

`handoffReadyCount` is therefore a lower bound populated by new dual-writes after shadow activation. The deployment report explicitly sets:

`handoffHistoricalBackfillComplete: false`

No handoff read path may switch to the index based on D2a.1.

## Failure and rollback

The post-deploy Evidence shadow reconciliation step is `continue-on-error`.

A shadow failure:
- does not roll back successful Worker/frontend deployment;
- does not alter existing R2 Evidence;
- does not switch summary/handoff readers;
- leaves the persistent cursor for diagnosis/retry.

Rollback is configuration-only:
1. remove `EVIDENCE_INDEX_SHADOW_ENABLED = "1"` from generated production config;
2. redeploy the Worker.

Do **not** delete the additive D1 tables or R2 objects during rollback.

## D2b gate

Do not switch Evidence discovery to D1 until:
- production shadow backfill is complete;
- newly imported Evidence dual-writes reliably;
- Evidence counts/hashes reconcile over an overlap window;
- historical handoff readiness has its own complete backfill/reconciliation path;
- `no_external_ai` policy semantics are proven identical;
- rollback from index reads to R2 is tested.

C2b acquisition filtering remains independently blocked until a real installed current Tampermonkey/Bridge runtime reports verified architecture membership evidence.
