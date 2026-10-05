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

test('shadow sync requires full row and search parity while read path stays inactive',()=>{
  for(const token of [
    '/api/admin/literature-catalog-index/rows',
    'shadow_row_parity_mismatch',
    'shadow_query_count_mismatch',
    'shadow_query_set_mismatch',
    'literature_catalog_short_query_requires_compatibility',
    'shadow_read_path_accidentally_active',
    'readPathActive: false',
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
