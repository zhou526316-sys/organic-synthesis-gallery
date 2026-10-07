Beijing time: 2026-10-07
Context: D3c4c fail-closed deployment preflight gate
Normal-user rollout remains 0 bp.

The existing V3 deployment comparison report now includes rollout configuration and authority/compatibility mirror health. A separate enforcement step runs after the report artifact is preserved and fails deployment unless rolloutPreflightReady is true, backfill is complete, semantic/revision/authority-head/compatibility-head/stale-legacy mismatch counts are zero, and the fixed seed/canary are configured.

This is a read-only promotion gate. It does not activate normal-user V3 writes.
