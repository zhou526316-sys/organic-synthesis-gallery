Beijing time: 2026-10-07
Context: D4d activation retry #2

Root cause of the prior apparent-success contradiction:
- c79cab47 / 44459ea4 had snapshot read=1;
- 1a5d08df intentionally paused the source flag to 0 after failed activation and hardened rollback;
- 8b198743 fixed the proof race but inherited that paused flag=0, so its activation step could only skip successfully.

Retry #2 explicitly restores SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED=1 with the D4c proof-reuse logic already installed. Canonical deployment must first repair/prove D4b freshness, then prove D4c snapshot parity, then verify the exact same snapshot generation on the unauthenticated public route. Automatic rollback remains unchanged.
