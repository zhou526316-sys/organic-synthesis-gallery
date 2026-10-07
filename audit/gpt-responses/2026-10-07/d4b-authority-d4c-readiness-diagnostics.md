Beijing time: 2026-10-07
Context: D4b authority correction + D4c readiness-vector diagnostics

Found a false D4b deployment assertion: the D4b source-integrity step required the public site-stats route to be readPath=materialized, which is incompatible with a snapshot-first D4d deployment. D4b now proves materialized source integrity only through admin status/parity and records the public route as diagnostics, not authority.

D4c source-not-ready responses now expose exact bounded readiness fields, and the workflow persists both the failing refresh body and post-repair materialized status. Primary snapshot activation is temporarily paused to 0 during this diagnostic pass. Public raw fallback remains removed.
