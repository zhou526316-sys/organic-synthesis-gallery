import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const media=readFileSync('cloudflare/worker/src/media.js','utf8');

test('normal media reads never run a corpus-wide duplicate TOC hash aggregation',()=>{
  assert.ok(media.includes('duplicateTocHashesForRows'));
  assert.ok(media.includes('duplicate_toc_hashes_bounded'));
  assert.ok(media.includes('content_hash IN ('));
  assert.ok(media.includes('for (let offset = 0; offset < hashes.length; offset += QUERY_CHUNK)'));
  assert.ok(!media.includes("content_hash IS NOT NULL AND content_hash <> '' GROUP BY content_hash HAVING COUNT(*) > 1"));
});

test('duplicate TOC detection remains globally correct for only the requested hashes',()=>{
  const block=media.slice(
    media.indexOf('async function duplicateTocHashesForRows'),
    media.indexOf('async function loadMediaRows'),
  );
  assert.ok(block.includes('FROM toc_assets'));
  assert.ok(block.includes('available = 1'));
  assert.ok(block.includes('updated_at >= ?'));
  assert.ok(block.includes('content_hash IN'));
  assert.ok(block.includes('GROUP BY content_hash'));
  assert.ok(block.includes('HAVING COUNT(*) > 1'));
  assert.ok(block.includes('MEDIA_REBUILD_EPOCH'));
});

console.log('MEDIA_BOUNDED_DUPLICATE_HASH_CONTRACT_PASS');


test('public Gallery inventory is DOM-window bounded and explicitly read-only',()=>{
  const main=readFileSync('src/main.ts','utf8');
  assert.ok(main.includes("querySelectorAll<HTMLElement>('#gallery .toc-slot[data-doi]')"));
  assert.ok(main.includes('.slice(0, DESKTOP_RESULT_WINDOW_SIZE)'));
  assert.ok(main.includes("api.post('/api/media/inventory', { dois, readOnly: true })"));
  assert.ok(!main.includes("api.post('/api/media/inventory', { dois })"));
});

test('mutating media inventory requires Worker write authorization',()=>{
  const index=readFileSync('cloudflare/worker/src/index.js','utf8');
  const start=index.indexOf("url.pathname === '/api/media/inventory'");
  const end=index.indexOf("url.pathname === '/api/media/bridge-queue'",start);
  assert.ok(start>=0&&end>start);
  const block=index.slice(start,end);
  assert.ok(block.includes('payload?.readOnly !== true'));
  assert.ok(block.includes('requireWriteAuthorization(request, env)'));
  assert.ok(block.includes('mediaInventory(request, env, payload)'));
});
