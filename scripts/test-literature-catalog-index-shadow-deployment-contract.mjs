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

function section(source,start,end){
  const a=source.indexOf(start),b=end?source.indexOf(end,a+start.length):source.length;
  assert.ok(a>=0&&b>a,'missing section: '+start);
  return source.slice(a,b);
}

test('production Worker binds the dedicated search D1 with indexed reads enabled',()=>{
  assert.match(deploy,/LITERATURE_INDEX_D1_NAME: organic-synthesis-lit-index/);
  assert.match(deploy,/wrangler d1 create "\$LITERATURE_INDEX_D1_NAME"/);
  assert.match(deploy,/wrangler d1 execute "\$LITERATURE_INDEX_D1_NAME" --remote --file=\.\.\/literature-catalog-index-v1\.sql/);
  assert.match(deploy,/binding = "LITERATURE_INDEX_DB"/);
  assert.match(deploy,/database_name = "\$LITERATURE_INDEX_D1_NAME"/);
  const config=section(deploy,'- name: Generate frontend deployment configuration','- name: Dry-run frontend Worker bundle');
  assert.match(config,/LITERATURE_CATALOG_INDEX_SHADOW_ENABLED = "1"/);
  assert.match(config,/LITERATURE_CATALOG_INDEX_READ_ENABLED = "1"/);
  assert.ok(!config.includes('LITERATURE_CATALOG_INDEX_READ_ENABLED = "0"'));
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

test('public view activation is generation-fenced and keeps compatibility-only modes static',()=>{
  assert.ok(worker.includes('/api/literature/catalog-view'));
  assert.ok(worker.includes('queryPublishedLiteratureCatalogView'));
  assert.ok(worker.includes('literatureCatalogIndexReadEnabled'));
  assert.ok(!worker.includes('/api/literature/catalog-search'));
  assert.ok(!worker.includes('/api/user-ui/literature-search'));
});

test('activation canary validates current generation, cursor paging and safe generation handoff',()=>{
  const canary=section(
    deploy,
    '- name: Verify literature indexed read activation',
    '- name: Roll back literature indexed read on canary failure',
  );
  assert.ok(canary.includes('continue-on-error: true'));
  assert.ok(canary.includes('architecture-v1/release.json?indexed-canary='));
  assert.ok(canary.includes('/api/admin/literature-catalog-index/status'));
  assert.ok(canary.includes('/api/literature/catalog-view'));
  assert.ok(canary.includes("query:''"));
  assert.ok(canary.includes("sort:'newest'"));
  assert.ok(canary.includes('first.body?.nextCursor'));
  assert.ok(canary.includes('indexed cursor repeated first-page DOI'));
  assert.ok(canary.includes("literature_catalog_generation_not_ready"));
  assert.ok(canary.includes("pending-generation-safe-fallback"));
  assert.ok(canary.includes("impossible='0'.repeat(64)"));
  assert.ok(canary.includes('unknown generation produced an unsafe response'));
});

test('failed activation automatically redeploys read-disabled configuration and verifies rollback',()=>{
  const rollback=section(
    deploy,
    '- name: Roll back literature indexed read on canary failure',
    '- name: Preserve literature indexed read activation report',
  );
  assert.ok(rollback.includes("steps.literature_index_read_canary.outcome == 'failure'"));
  assert.ok(rollback.includes('s/LITERATURE_CATALOG_INDEX_READ_ENABLED = "1"/LITERATURE_CATALOG_INDEX_READ_ENABLED = "0"/'));
  assert.ok(rollback.includes('npx wrangler deploy --config wrangler.frontend.toml'));
  assert.ok(rollback.includes('literatureCatalogIndexReadEnabled===false'));
  assert.ok(rollback.includes('literatureCatalogIndexReadPathActive===false'));
  const fail=section(
    deploy,
    '- name: Fail deployment after safe indexed-read rollback',
    '- name: Backfill and verify materialized site analytics read path',
  );
  assert.ok(fail.includes("steps.literature_index_read_canary.outcome == 'failure'"));
  assert.ok(fail.includes('production was rolled back to READ_ENABLED=0'));
});

test('canonical binding verification requires indexed-read capability to remain active',()=>{
  const verify=section(
    deploy,
    '- name: Verify canonical Worker bindings survived deployment and secret sync',
    '- name: Verify deployed search filtering CSS',
  );
  assert.ok(verify.includes('literatureCatalogIndexShadowEnabled === true'));
  assert.ok(verify.includes('literatureCatalogIndexReadEnabled === true'));
  assert.ok(verify.includes('literatureCatalogIndexReadPathActive === true'));
});

test('shadow sync still follows successful deployments and can prepare a new release generation',()=>{
  assert.match(shadow,/Deploy Worker frontend assets/);
  assert.match(shadow,/Deploy GitHub Pages frontend/);
  assert.match(shadow,/sync-literature-catalog-index-shadow\.mjs/);
  assert.match(shadow,/BRIDGE_WRITE_TOKEN/);
  assert.ok(worker.includes('/api/admin/literature-catalog-index/query'));
  assert.ok(worker.includes('/api/admin/literature-catalog-index/rows'));
  assert.ok(worker.includes('/api/admin/literature-catalog-index/view'));
});

console.log('LITERATURE_CATALOG_INDEX_DEPLOYMENT_CONTRACT_PASS');
