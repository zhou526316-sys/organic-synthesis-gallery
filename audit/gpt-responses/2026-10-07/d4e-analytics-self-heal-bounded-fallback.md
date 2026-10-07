Beijing time: 2026-10-07
Context: D4e analytics self-healing and raw-fallback removal
D4e removes the final public raw analytics scale leak. snapshotSourceReady distinguishes internally consistent materialized state from a raw event currently in flight; cron performs bounded catch-up before refresh; public site-stats uses fresh singleton snapshot fallback or bounded 503 instead of raw history; D4c can repair source-not-ready; D4d waits for stable edge propagation. Primary snapshot read remains disabled.
