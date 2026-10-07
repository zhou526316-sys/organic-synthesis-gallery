Beijing time: 2026-10-07
Context: D4d analytics snapshot public-read activation request

After D4c production snapshot migration/refresh/parity passed and the Worker deployment authority regression returned green, the canonical Worker configuration was changed from SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED=0 to 1.

This is a guarded activation request, not an unconditional cutover. The same canonical deployment must prove:
- stable refresh and parity;
- fresh snapshot;
- unauthenticated public /api/user-ui/site-stats returns readPath=snapshot;
- generation=site-pageview-v3-snapshot;
- healthcheck reports snapshot read enabled.

Any activation-canary failure automatically redeploys the same Worker config with the snapshot read flag reset to 0 and verifies the public route left snapshot.
