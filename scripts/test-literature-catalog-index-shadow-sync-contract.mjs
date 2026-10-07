import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sync=readFileSync(path.join(root,'scripts/sync-literature-catalog-index-shadow.mjs'),'utf8');
const workflow=readFileSync(path.join(root,'.github/workflows/literature-catalog-index-shadow.yml'),'utf8');

function sourceBetween(start,end){
  const from=sync.indexOf(start);
  assert.notEqual(from,-1,`missing guard start: ${start}`);
  const to=sync.indexOf(end,from+start.length);
  assert.notEqual(to,-1,`missing guard end: ${end}`);
  return sync.slice(from+start.length,to);
}
// Execute the production guard statements, without importing the CLI or its network calls.
const statusGuards=new Script([
  sourceBetween("const statusBefore = await api('/api/admin/literature-catalog-index/status');",'const begin = await api('),
  sourceBetween("const statusAfter = await api('/api/admin/literature-catalog-index/status');",'Object.assign(report, {\n      ok: true,'),
].join('\n'),{filename:'sync-literature-catalog-index-shadow.status-guards.mjs'});
const generation={catalogId:'catalog-new',recordCount:2};
const readyGeneration={...generation,ready:true,importedRows:2};
const otherReady={...readyGeneration,catalogId:'catalog-existing'};
const pendingGeneration={...generation,ready:false,importedRows:0};
const status=(readConfigured,readPathActive,generations=[])=>({
  enabled:true,readConfigured,readPathActive,generations,
});
function runStatusGuards(before,after){
  const report={};
  statusGuards.runInNewContext({
    assert,report,generation,statusBefore:{body:before},statusAfter:{body:after},
  },{timeout:1000});
  return report;
}

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

test('shadow sync requires row, search and filtered-view parity while admin probes stay inactive',()=>{
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
    'viewParity',
  ]) assert.ok(sync.includes(token),token);
  for(const probe of ['rows','query','view']){
    assert.match(sync,new RegExp(`assert\\(response\\.body\\.readPathActive\\s*===\\s*false,\\s*'shadow_${probe}_read_path_must_remain_inactive'\\)`));
  }
});

test('status guards preserve configured public reads and permit the first ready generation',()=>{
  const cases=[
    ['disabled without a ready generation',status(false,false)],
    ['disabled with a ready generation',status(false,false,[otherReady])],
    ['already active',status(true,true,[pendingGeneration,otherReady])],
    ['configured with no generations',status(true,false)],
    ['configured with only a pending generation',status(true,false,[pendingGeneration])],
  ];
  for(const [name,before] of cases){
    const after=status(before.readConfigured,before.readConfigured,[readyGeneration]);
    assert.deepEqual(runStatusGuards(before,after),{
      readConfiguredBefore:before.readConfigured,
      readConfigured:after.readConfigured,
      readPathActiveBefore:before.readPathActive,
      readPathActive:after.readPathActive,
      readConfigurationUnchanged:true,
    },name);
  }
});

test('statusBefore rejects invalid configuration and contradictory read states',()=>{
  const valid=status(false,false);
  const cases=[
    ['index disabled',{...valid,enabled:false}],
    ['enabled is not boolean',{...valid,enabled:'true'}],
    ...[undefined,null,0,'true'].map(value=>[`readConfigured=${String(value)}`,{...valid,readConfigured:value}]),
    ...[undefined,null,0,'false'].map(value=>[`readPathActive=${String(value)}`,{...valid,readPathActive:value}]),
    ...[undefined,null,{}].map(value=>[`generations=${String(value)}`,{...valid,generations:value}]),
    ['disabled but active',status(false,true,[otherReady])],
    ['configured and ready but inactive',status(true,false,[otherReady])],
    ['active without generations',status(true,true)],
    ['active with only a pending generation',status(true,true,[pendingGeneration])],
  ];
  for(const [name,before] of cases){
    assert.throws(()=>runStatusGuards(before,status(false,false,[readyGeneration])),
      /shadow_runtime_configuration_invalid/,name);
  }
});

test('statusAfter rejects configuration drift in either direction',()=>{
  const cases=[
    ['disabled to enabled',status(false,false),status(true,true,[readyGeneration])],
    ['enabled to disabled',status(true,true,[otherReady]),status(false,false,[readyGeneration])],
    ['index disabled',status(true,true,[otherReady]),{...status(true,true,[readyGeneration]),enabled:false}],
    ['missing readConfigured',status(true,true,[otherReady]),{...status(true,true,[readyGeneration]),readConfigured:undefined}],
    ['nonboolean readConfigured',status(true,true,[otherReady]),{...status(true,true,[readyGeneration]),readConfigured:'true'}],
  ];
  for(const [name,before,after] of cases){
    assert.throws(()=>runStatusGuards(before,after),/shadow_read_configuration_changed/,name);
  }
});

test('statusAfter requires the target generation to be ready with exact row counts',()=>{
  const cases=[
    ['missing generations',undefined],
    ['empty generations',[]],
    ['only another ready generation',[otherReady]],
    ['target is pending',[pendingGeneration]],
    ['target ready is not boolean',[{...readyGeneration,ready:1}]],
    ['wrong record count',[{...readyGeneration,recordCount:1}]],
    ['wrong imported row count',[{...readyGeneration,importedRows:1}]],
    ['record count is a string',[{...readyGeneration,recordCount:'2'}]],
    ['imported row count is a string',[{...readyGeneration,importedRows:'2'}]],
  ];
  for(const [name,generations] of cases){
    const after={...status(true,true),generations};
    assert.throws(()=>runStatusGuards(status(true,true,[otherReady]),after),/shadow_status_not_ready/,name);
  }
});

test('statusAfter requires a boolean read path state matching preserved configuration',()=>{
  for(const [readConfigured,readPathActive] of [
    [false,true],[true,false],[false,undefined],[false,null],[false,0],[true,'true'],
  ]){
    const before=status(readConfigured,readConfigured,[otherReady]);
    const after=status(readConfigured,readPathActive,[readyGeneration]);
    assert.throws(()=>runStatusGuards(before,after),/shadow_read_path_state_invalid/,
      `readConfigured=${readConfigured}, readPathActive=${String(readPathActive)}`);
  }
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
