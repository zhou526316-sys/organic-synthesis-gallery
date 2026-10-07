Beijing time: 2026-10-07
Context: D4e snapshotSourceReady invariant correction

Adjusted snapshotSourceReady to permit a bounded raw-event tail while still requiring the materialized source itself to be complete and internally consistent.

Required for snapshotSourceReady:
- persisted backfill is complete;
- no materialization error is recorded;
- materialized event max equals the persisted backfill watermark;
- materialized watermark does not exceed raw max;
- materialized last-view timestamp does not exceed raw last-view timestamp;
- materialized+duplicate event ledger equals scanned_events;
- global materialized PV equals scanned_events.

A regression test proves that one unmaterialized raw tail event remains acceptable, but a drifted materialized counter makes snapshotSourceReady false.
