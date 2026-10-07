Beijing time: 2026-10-07
Context: final guarded D4d snapshot activation request

Production proof run 37565010281 succeeded with snapshot primary read disabled:
- D4b ok=true, rawEvents=621, materializedEvents=621, globalPv=621, stableParityPasses=2;
- D4c ok=true on attempt 1;
- refresh/status generation identical;
- compare same=true, sourceStable=true;
- generationFenced=true;
- snapshot age 764 ms at proof;
- public raw-history fallback absent;
- bounded rollback guards installed.

Current latest main was re-read before this change and retains counter-drift diagnostic-only readiness, source-advanced snapshot semantics, bounded public fallbacks, generation-fenced activation and unsafe-raw rollback rejection.

This commit changes only the production snapshot read request from 0 to 1 plus contract/documentation state. Final production-active status still requires the canonical live activation canary to succeed with rollback skipped.
