Beijing time: 2026-10-07
Context: D3c4c read-only cohort-size forecast

Added a read-only production cohort forecast before any non-zero rollout. It reads account ids into ephemeral runner storage, computes buckets with the exact Worker primitive, emits only aggregate counts for standard thresholds, and uploads only the aggregate report. It performs no D1 mutation and no deployment. Normal-user rollout remains 0 bp.
