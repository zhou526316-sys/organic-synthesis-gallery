import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const deploy=readFileSync(path.join(root,'.github/workflows/deploy-worker-frontend.yml'),'utf8');
const shadow=readFileSync(path.join(root,'.github/workflows/literature-catalog-index-shadow.yml'),'utf8');
const worker=readFileSync(path.join(root,'cloudflare/worker/src/index.js'),'utf8');
const primarySchema=readFileSync(path.join(root,'cloudflare/schema.sql'),'utf8');

test('production Worker binds a dedicated search D1 in shadow-only mode',()=>{
  assert.match(deploy,/LITERATURE_INDEX_D1_NAME: organic-synthesis-lit-index/);
  assert.match(deploy,/wrangler d1 create "\$LITERATURE_INDEX_D1_NAME"/);
  assert.match(deploy,/wrangler d1 execute "\$LITERATURE_INDEX_D1_NAME" --remote --file=\.\.\/literature-catalog-index-v1\.sql/);
  assert.match(deploy,/binding = "LITERATURE_INDEX_DB"/);
  assert.match(deploy,/database_name = "\$LITERATURE_INDEX_D1_NAME"/);
  assert.match(deploy,/LITERATURE_CATALOG_INDEX_SHADOW_ENABLED = "1"/);
  assert.match(deploy,/LITERATURE_CATALOG_INDEX_READ_ENABLED = "0"/);
  assert.ok(!deploy.includes('LITERATURE_CATALOG_INDEX_READ_ENABLED = "1"'));
});

test('Cloudflare binding resolution uses indentation-safe node one-liners',()=>{
  const resolveBlock=deploy.split("- name: Resolve existing Cloudflare bindings")[1]?.split("- name: Apply isolated private PDF D1 migration")[0] || '';
  assert.ok(resolveBlock.includes('D1_ID=$(node -e "'));
  assert.ok(resolveBlock.includes('LITERATURE_INDEX_D1_ID=$(node -e "'));
  assert.ok(!resolveBlock.includes("$(node - <<'NODE'"),'nested heredoc command substitutions are forbidden in binding resolution');
});

test('primary D1 remains FTS-free and deployment verifies that boundary',()=>{
  assert.ok(!primarySchema.includes('literature_catalog_fts'));
  assert.match(deploy,/primary-d1-no-fts-check\.json/);
  assert.match(deploy,/primary D1 must remain free of literature FTS tables/);
});

test('shadow sync follows successful Worker and Pages deployments without public read cutover',()=>{
  assert.match(shadow,/Deploy Worker frontend assets/);
  assert.match(shadow,/Deploy GitHub Pages frontend/);
  assert.match(shadow,/sync-literature-catalog-index-shadow\.mjs/);
  assert.match(shadow,/BRIDGE_WRITE_TOKEN/);
  assert.ok(worker.includes('/api/admin/literature-catalog-index/query'));
  assert.ok(worker.includes('/api/admin/literature-catalog-index/rows'));
  assert.ok(worker.includes('/api/admin/literature-catalog-index/view'));
  assert.ok(!worker.includes('/api/literature/catalog-search'));
  assert.ok(!worker.includes('/api/user-ui/literature-search'));
});
