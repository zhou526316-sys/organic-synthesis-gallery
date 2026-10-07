# Phase D3c4c — deterministic gradual V3 write rollout gate

Date: 2026-10-07 Asia/Shanghai.
Status: rollout mechanism installed; production rollout remains at 0%.

## Purpose

D3c4b proved the real production V3 write path with an isolated user. D3c4c adds the control needed to move from one canary account to normal users without jumping directly to 100%.

## Gate order

The Worker evaluates V3 write eligibility in this order:

1. global emergency/full switch: `USER_LIBRARY_V3_WRITE_ENABLED=1`;
2. reserved D3c4b canary user;
3. deterministic percentage cohort controlled by `USER_LIBRARY_V3_WRITE_ROLLOUT_BPS`.

The rollout value is basis points from 0 to 10000. The production default is **0**, therefore installing D3c4c does not migrate any normal account.

## Deterministic cohort

A stable 32-bit FNV-1a bucket is derived from a fixed rollout seed plus the authenticated user id. The bucket is mapped to 0–9999.

This gives three required properties:

- the same account stays in the same cohort across devices and requests;
- increasing the threshold monotonically adds accounts rather than reshuffling existing accounts;
- setting the threshold back to 0 immediately stops new cohort writes.

The seed is fixed for the rollout. Changing it during rollout is forbidden because that would reshuffle users.

## Rollout sequence

The intended production progression is:

- 0 bp — installed, no normal users;
- 50 bp — 0.5%;
- 100 bp — 1%;
- 500 bp — 5%;
- 1000 bp — 10%;
- 2500 bp — 25%;
- 5000 bp — 50%;
- 10000 bp — 100%.

Each increase is a separate production decision. Before increasing, verify V3 write errors, revision conflicts, compatibility reads, account-sync diagnostics, and D1 health.

## Rollback semantics

A threshold decrease is fail-safe. Accounts outside the reduced deterministic cohort no longer receive new V3 write permission. Accounts that already crossed the per-user `authority=v3` boundary remain V3-authoritative and therefore enter the existing write-suspended behavior rather than falling back to the stale monolithic document.

Emergency full rollback is `USER_LIBRARY_V3_WRITE_ROLLOUT_BPS=0` with `USER_LIBRARY_V3_WRITE_ENABLED=0`.

## Current production state

- global V3 write switch: 0;
- deterministic rollout: 0 bp;
- isolated canary override: enabled only for the reserved canary id;
- D3c4b production canary: passed;
- normal user migration caused by D3c4c installation: none.

## Read-only rollout observability

The existing authenticated admin status surface is also the rollout preflight surface. It reports:

- configured rollout basis points and percentage;
- whether the fixed seed and isolated canary are configured;
- all-time V3 authority user count;
- legacy/V3 revision mismatch count;
- V3 authority rows whose V3 head is missing or behind the activation revision;
- V3-authoritative users whose D3b compatibility head is missing or not revision/updated-at identical to the V3 head;
- one `preflightReady` boolean that is true only when reads are enabled, historical backfill is complete, all parity/mirror mismatch counts are zero, and rollout identity configuration is present.

These checks are D1 aggregate reads. They do not add writes to the user mutation path and they do not change rollout eligibility.

Current rollout remains **0 bp / 0%**.

## Deployment promotion gate

The Worker deployment now preserves the V3 rollout report even if the comparison step fails, then executes a separate fail-closed enforcement step.

A deployment may continue only when:

- rollout `preflightReady=true`;
- the fixed rollout seed and isolated canary are both configured;
- historical V3 backfill is complete;
- semantic comparison has zero mismatches;
- legacy/V3 revision mismatches are zero;
- stale legacy documents behind V3 authority are zero;
- V3 authority-to-head mismatches are zero;
- V3-to-D3b compatibility-head mismatches are zero.

The gate records rollout basis points, rollout percentage, V3-authority user count, legacy-authoritative user count and V3 head count in the deployment evidence. It does not change rollout eligibility.

Normal-user rollout remains **0 bp / 0%**.
