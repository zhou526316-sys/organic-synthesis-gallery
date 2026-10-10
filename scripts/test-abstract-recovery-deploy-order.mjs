import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const wf=readFileSync(new URL('../.github/workflows/literature-abstract-incremental.yml',import.meta.url),'utf8');
const script=readFileSync(new URL('./sync-literature-search-enrichment.mjs',import.meta.url),'utf8');

test('metadata-only source-code pushes cannot race the old production API',()=>{
  const match=wf.match(/\n  push:\s*\n    branches: \[main\][\s\S]*?\n  workflow_dispatch:/);
  assert.ok(match,'missing explicitly triggered push schedule');
  assert.match(match[0],/audit\/automation-triggers\/literature-abstract-incremental\.json/);
  assert.doesNotMatch(match[0],/scripts\/sync-literature-search-enrichment|scripts\/lib|literature-abstract-incremental\.yml/);
});
test('nightly existing metadata-only recovery remains scheduled',()=>{
  assert.match(wf,/cron: '20 15 \* \* \*'/);
  assert.match(wf,/SEARCH_ABSTRACT_RETRY_LIMIT:/);
  assert.match(wf,/EUROPEPMC_LIMIT:/);
  assert.match(wf,/PUBLISHER_ABSTRACT_LIMIT:/);
  assert.match(wf,/cancel-in-progress: false/);
});
test('sanitized backend diagnostic excludes private publisher text and request parameters',()=>{
  assert.match(script,/replace\(\/\[\^a-zA-Z0-9_-\]\/g/);
  assert.match(script,/metadata_http_/);
  assert.match(script,/String\(payload\?\.error\|\|''\)/);
  assert.doesNotMatch(script,/console\.log\(JSON\.stringify\(payload\)/);
});
