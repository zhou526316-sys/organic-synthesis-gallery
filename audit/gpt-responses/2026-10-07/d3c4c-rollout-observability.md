Beijing time: 2026-10-07
Context: D3c4c rollout observability before any normal-user activation

This batch did not change rollout eligibility. Normal-user V3 write rollout remains 0 bp and the global write switch remains off.

Added read-only rollout observability to the existing authenticated V3 admin status:
- rollout basis points / percent / active flag;
- seed and isolated-canary configuration presence;
- V3 authority user count;
- revision mismatches;
- authority-to-V3-head mismatches;
- V3-to-D3b compatibility-head mismatches;
- preflightReady aggregate gate.

The checks are aggregate reads and do not add any writes to the user mutation path.
