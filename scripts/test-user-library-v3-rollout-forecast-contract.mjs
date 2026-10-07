import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync('.github/workflows/user-library-v3-rollout-forecast.yml','utf8');
const script=readFileSync('cloudflare/worker/scripts/forecast-user-library-v3-rollout.mjs','utf8');

test('D3c4c cohort forecast is read-only and never changes rollout or D1 state',()=>{
  assert.ok(workflow.includes("SELECT id FROM users ORDER BY id"));
  assert.ok(!/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(workflow));
  assert.ok(!workflow.includes('wrangler deploy'));
  assert.ok(!workflow.includes('USER_LIBRARY_V3_WRITE_ROLLOUT_BPS ='));
  assert.ok(workflow.includes('> "$RUNNER_TEMP/d3c4c-user-ids.json"'));
  assert.ok(!workflow.includes('cat "$RUNNER_TEMP/d3c4c-user-ids.json"'));
});

test('D3c4c forecast retains aggregates only and uses the production bucket primitive',()=>{
  assert.ok(script.includes('userLibraryV3RolloutBucket'));
  assert.ok(script.includes('normalAccounts'));
  assert.ok(script.includes('thresholds'));
  assert.ok(script.includes('firstNonEmptyBps'));
  assert.ok(script.includes('currentCohortAccounts'));
  assert.ok(!script.includes('userIds:'));
  assert.ok(!script.includes('normalIds:'));
  assert.ok(workflow.includes('d3c4c-rollout-forecast.json'));
  assert.ok(!workflow.includes('path: ${{ runner.temp }}/d3c4c-user-ids.json'));
});

console.log('USER_LIBRARY_V3_ROLLOUT_FORECAST_CONTRACT_PASS');
