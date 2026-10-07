Beijing time: 2026-10-07
Context: D4d activation proof race fix

Two guarded activation attempts rolled back correctly. Production D4b parity immediately before activation was stable at rawEvents=materializedEvents=globalPv=616 and same=true. The activation step was unnecessarily running a second snapshot refresh/compare, which can lose its exact source-stability race under normal concurrent traffic.

D4d activation now consumes the immediately preceding D4c snapshot-shadow proof from the same canonical workflow (ok/same/sourceStable/readConfigured plus snapshotGeneratedAt) and performs only bounded live propagation checks: snapshot status freshness, exact snapshot generation identity, unauthenticated site-stats readPath/generation, and health read-enabled flag. Existing attempts diagnostics and automatic rollback are retained.
