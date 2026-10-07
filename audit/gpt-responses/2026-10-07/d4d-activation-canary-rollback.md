Beijing time: 2026-10-07
Context: D4d activation safety
Installed canonical snapshot activation canary and automatic rollback while the production read flag remains 0. Future activation must refresh and compare a stable snapshot, verify the unauthenticated public site-stats route reports readPath=snapshot and generation=site-pageview-v3-snapshot, and verify health. Failure automatically redeploys with snapshot read flag 0 and proves the public route left snapshot.
