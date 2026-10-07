# Response synchronization

北京时间：2026-10-07 10:36 +08:00
上下文：Tampermonkey manual missing-only pass 在单篇 user_aborted 后停止整个批次，导致 UI/控制器看起来卡死。

## Root cause

- coverageRemaining() previously mapped every aborted result to row.state='paused'.
- runManualFromHead() then executed break whenever result.status==='aborted'.
- The explicit MANUAL_RUN_KEY remains present after the pass, so automatic controllerRun() intentionally yields to manualRunBlocksAutomatic().
- Result: one publisher-tab user_aborted can terminate the explicit pass and leave no automatic successor.

## Fix

- A single aborted article now becomes:
  - paused only when controllerPaused() is actually true;
  - otherwise blocked for the remainder of the current explicit pass.
- runManualFromHead() now stops only for a real controller pause, not merely because one article returned aborted.
- Remaining articles continue.
- Existing real Pause behavior remains unchanged.

## Regression verification

- Tampermonkey immediate restart regression: success.
- Tampermonkey window guard regression: success.
- Bridge current skip per-DOI controller failures: success.
- Bridge current custom-domain controller regression: success.

## Release target

- Bridge 2.2.59
- install 6.2.40
- controller revision remains 2.2.41
- RSC publisher media revision remains 20261007-rsc-search-fallback-v14
