import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync('.github/workflows/user-library-v3-write-canary.yml','utf8');
const dispatcher=readFileSync('.github/workflows/user-library-v3-write-canary-dispatch.yml','utf8');
const deploy=readFileSync('.github/workflows/deploy-worker-frontend.yml','utf8');

test('D3c4b canary is manual, isolated and never enables global writes',()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.ok(!workflow.includes('schedule:'));
  assert.ok(!workflow.includes('push:'));
  assert.ok(workflow.includes("confirmation == 'D3C4B'"));
  assert.ok(workflow.includes('CANARY_USER_ID: __gallery_v3_write_canary__'));
  assert.ok(deploy.includes('USER_LIBRARY_V3_WRITE_CANARY_USER_ID = "__gallery_v3_write_canary__"'));
  assert.ok(deploy.includes('USER_LIBRARY_V3_WRITE_ENABLED = "0"'));
  assert.ok(!workflow.includes('USER_LIBRARY_V3_WRITE_ENABLED = "1"'));
  assert.ok(!workflow.includes('wrangler deploy'));
});

test('D3c4b canary gates on parity and the deployed D3c3/D3c4a client',()=>{
  for(const token of [
    '/api/admin/user-library-v3/status',
    'revisionMismatches',
    'legacyUsers',
    'v3Heads',
    'backfill?.complete',
    'account-v3-head',
    'account-v3-mutate',
    'canonical frontend lacks D3c3 V3 read client',
    'canonical frontend lacks D3c4a V3 mutation client',
  ]) assert.ok(workflow.includes(token),token);
});

test('D3c4b canary exercises real write, bounded reads, compatibility and conflict fences',()=>{
  for(const token of [
    "mode:'account-v3-mutate'",
    "mode:'account-v3-head'",
    "mode:'account-v3-page'",
    "mode:'account-v3-delta'",
    "mode:'account-pull'",
    "mode:'account-save'",
    'user_library_v3_revision_conflict',
    'rows-v3-compat',
    'user_library_client_upgrade_required',
    'writeAuthority',
    'expectedRevision:0',
  ]) assert.ok(workflow.includes(token),token);
});

test('D3c4b canary deletes the FK root and verifies zero residue in every owned table',()=>{
  assert.ok(workflow.includes('- name: Clean up isolated canary account'));
  assert.ok(workflow.includes('if: always()'));
  assert.ok(workflow.includes("DELETE FROM users WHERE id='$CANARY_USER_ID'"));
  assert.ok(workflow.includes('if [ ! -x node_modules/.bin/wrangler ]'));
  for(const table of [
    'user_library_v3_head',
    'user_library_v3_changes',
    'user_library_v3_commits',
    'user_library_v3_rows',
    'user_library_v3_shape',
    'user_library_v3_authority',
    'user_library_v3_shadow_sync',
    'user_paper_state',
    'user_library_head',
    'user_library_state',
    'user_profile_sessions',
    'user_sessions',
    'users',
  ]) assert.ok(workflow.includes(table),table);
  assert.ok(workflow.includes('cleanupVerified=true'));
  assert.ok(workflow.includes('user-library-v3-write-canary-${{ github.run_id }}'));
});

test('D3c4b dispatcher is marker-only and cannot mutate production data itself',()=>{
  assert.ok(dispatcher.includes("paths:"));
  assert.ok(dispatcher.includes("D3C4B_CANARY_REQUEST"));
  assert.ok(dispatcher.includes("actions: write"));
  assert.ok(dispatcher.includes("contents: read"));
  assert.ok(dispatcher.includes("deploy-worker-frontend.yml"));
  assert.ok(dispatcher.includes("conclusion"));
  assert.ok(dispatcher.includes("user-library-v3-write-canary.yml"));
  assert.ok(dispatcher.includes("confirmation=D3C4B"));
  assert.ok(!dispatcher.includes("wrangler d1"));
  assert.ok(!dispatcher.includes("USER_LIBRARY_V3_WRITE_ENABLED"));
});

console.log('USER_LIBRARY_V3_WRITE_CANARY_CONTRACT_PASS');
