# Phase D2a.2 — Historical handoff metadata backfill

Date: 2026-10-04 Asia/Shanghai.

D2a.1 completed and reconciled the Evidence metadata index in production:
- Evidence Index enabled;
- readPathActive remains false;
- 560/560 Evidence rows indexed;
- DOI/evidencePacketHash/sourceHash reconciled.

D2a.2 fills the remaining historical metadata gap for encrypted scheduled-summary handoffs. It still does not switch any reader to D1.

## Problem

New handoffs already dual-write metadata into article_evidence_index, but historical handoff objects in:

`private/article-summary-handoff-v1/`

were not backfilled. Therefore `handoffReadyCount` was only a lower bound and could not support later D1 candidate comparison.

## New state

D2a.2 adds:

`article_evidence_handoff_backfill`

with:
- opaque R2 cursor;
- complete flag;
- scanned object count;
- matched current rows;
- skipped invalid metadata;
- skipped stale/orphan handoffs;
- timestamps and last error.

The cursor is independent from the Evidence-object backfill cursor.

## Matching rule

Historical handoff metadata may update an Evidence index row only when all three fields match:

`doi + evidencePacketHash + sourceHash`

The backfill executes a conditional UPDATE only.

It never INSERTs a missing Evidence row. Therefore:
- stale handoff -> counted as skippedStale;
- orphan handoff -> counted as skippedStale;
- malformed metadata -> counted as skippedInvalid;
- only a handoff for the current Evidence identity can set handoff_ready=1.

This preserves R2 Evidence as the byte authority and prevents an old encrypted envelope from resurrecting obsolete Evidence state.

## Backfill execution

Canonical Worker deployment explicitly applies:
- evidence-index-v1.sql;
- evidence-index-v2.sql.

After deploy, the existing Evidence shadow step:
1. advances Evidence backfill if still incomplete;
2. advances at most four handoff pages of 500 objects per deployment;
3. persists handoff cursor after every page;
4. requires readPathActive=false throughout.

When handoff backfill reaches complete:

`scannedObjects = matchedRows + skippedInvalid + skippedStale`

must hold.

Also:
- handoffReadyCount must be >= matchedRows;
- matchedRows may not exceed current Evidence index count.

A mismatch fails the shadow reconciliation step but does not take down the current production readers because the step remains continue-on-error.

## Existing readers remain unchanged

D2a.2 does not modify:
- getArticleEvidenceInventory();
- pendingHandoffObjects();
- backfillScheduledEvidenceHandoffs();
- getScheduledEvidenceHandoff();
- summary-review candidate discovery;
- 12:00 scheduled summary publication.

The deployment-contract test explicitly checks the legacy R2 scans are still present and that the new handoff backfill endpoint is admin-only.

## D2b gate

After historical handoff backfill is complete, D2b may build a **comparison-only** D1 candidate selector.

D2b still must not switch reads until:
1. Evidence backfill is complete/reconciled;
2. handoff backfill is complete/reconciled;
3. summary-review job state is incorporated in the comparison;
4. D1 candidate output matches the legacy R2 candidate output over a controlled overlap;
5. no_external_ai policy semantics match;
6. rollback to legacy R2 reads is tested.

C2b acquisition filtering remains separately blocked until a real installed current Tampermonkey/Bridge runtime reports verified architecture membership evidence.
