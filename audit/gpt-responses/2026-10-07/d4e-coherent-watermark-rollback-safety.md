Beijing time: 2026-10-07
Context: D4e coherent-watermark + rollback safety correction

Retry #2 proved the edge propagated snapshotReadEnabled=true twice, but D4c proof generation repeatedly saw source_not_ready and rollback later failed only because it demanded immediate D4b materialized authority. The snapshot flag itself did redeploy to 0 successfully.

Corrections:
- snapshotSourceReady no longer requires backfill complete; it requires an internally coherent materialized watermark with no error and may lag raw tail;
- strict materialized read still requires backfill complete and raw equality;
- snapshot compare reports source_advanced_since_snapshot as non-comparable rather than corrupt;
- D4c accepts a generation-fenced snapshot even if source advances immediately after generation;
- D4d proof requires generationFenced rather than current sourceStable;
- rollback verifies bounded public behavior (materialized, snapshot_fallback, or bounded_unavailable) and forbids legacy_raw_fallback/site-pageview-v1;
- rollback may attempt bounded materialized repairs but does not fail merely because strict materialized authority is not restored within seconds.

Snapshot activation remains guarded with automatic rollback.
