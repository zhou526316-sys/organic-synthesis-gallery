import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sync=readFileSync(path.join(root,'scripts/sync-literature-catalog-index-shadow.mjs'),'utf8');
const workflow=readFileSync(path.join(root,'.github/workflows/literature-catalog-index-shadow.yml'),'utf8');

test('shadow sync is pinned to verified architecture delivery before any import',()=>{
  for(const token of [
    'release-delivery.json',
    "architecture-v1/release.json",
    'release_hash_mismatch',
    'release_delivery_generation_mismatch',
    'duplicate_release_object_path',
    'delivery_object_ref_mismatch',
    'record_content_hash_mismatch',
    'delivery_record_doi_set_mismatch',
    'membership_revision_mismatch',
    'record_revision_mismatch',
    'search_projection_mismatch',
  ]) assert.ok(sync.includes(token),token);
});

test('shadow sync uses a Free-safe eight-row import ceiling',()=>{
  assert.match(sync,/const IMPORT_BATCH_SIZE = 8;/);
  assert.match(sync,/offset \+= IMPORT_BATCH_SIZE/);
  assert.match(sync,/rows\.slice\(offset, offset \+ IMPORT_BATCH_SIZE\)/);
  assert.match(sync,/importBatchSize: IMPORT_BATCH_SIZE/);
});

test('shadow sync retries only transient API failures and checkpoints resumable progress',()=>{
  assert.match(sync,/const TRANSIENT_API_STATUS = new Set\(\[429,500,502,503,504\]\)/);
  assert.match(sync,/const RETRY_DELAYS_MS = \[300,900,1800\]/);
  assert.match(sync,/TRANSIENT_API_STATUS\.has\(response\.status\)/);
  assert.match(sync,/lastBatchAttempts/);
  assert.match(sync,/importProgress/);
  assert.match(sync,/shadow_import_batch_contract_mismatch/);
});

test('shadow sync keeps admin parity inactive while validating the public read canary',()=>{
  for(const token of [
    '/api/admin/literature-catalog-index/rows',
    '/api/admin/literature-catalog-index/view',
    'shadow_row_parity_mismatch',
    'shadow_query_count_mismatch',
    'shadow_query_set_mismatch',
    'shadow_view_count_mismatch',
    'shadow_view_order_mismatch',
    'literature_catalog_short_query_requires_compatibility',
    'literature_catalog_reader_sort_requires_compatibility',
    'shadow_query_read_path_must_remain_inactive',
    'shadow_view_read_path_must_remain_inactive',
    'shadow_rows_read_path_must_remain_inactive',
    'literature_read_canary_not_active_after_ready_generation',
    'viewParity',
    'readConfigured: true',
    'readPathActive: true',
  ]) assert.ok(sync.includes(token),token);
});

test('shadow workflow runs only after successful trusted deployment families or manual dispatch',()=>{
  assert.ok(workflow.includes('Deploy Worker frontend assets'));
  assert.ok(workflow.includes('Deploy GitHub Pages frontend'));
  assert.ok(workflow.includes("github.event.workflow_run.conclusion == 'success'"));
  assert.ok(workflow.includes("github.event.workflow_run.head_branch == 'main'"));
  assert.ok(workflow.includes('github.event.workflow_run.head_repository.full_name == github.repository'));
  assert.ok(workflow.includes('BRIDGE_WRITE_TOKEN'));
  assert.ok(workflow.includes('sync-literature-catalog-index-shadow.mjs'));
});
