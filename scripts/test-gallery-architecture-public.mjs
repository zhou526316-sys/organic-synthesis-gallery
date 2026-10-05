import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Pages workflow builds architecture-v1 before Vite and release delivery', () => {
  const workflow = readFileSync('.github/workflows/github-pages.yml','utf8');
  const buildIndex = workflow.indexOf('build-gallery-architecture-public.mjs');
  const viteIndex = workflow.indexOf('npm run build');
  const deliveryIndex = workflow.indexOf('pages-release-delivery.mjs build');
  assert.ok(buildIndex > 0 && viteIndex > buildIndex && deliveryIndex > viteIndex);
});

test('generated architecture output is ignored by Git', () => {
  const ignore = readFileSync('.gitignore','utf8');
  assert.match(ignore, /^public\/architecture-v1\/$/m);
});

test('delivery verifier declares architecture public manifest support', () => {
  const source = readFileSync('scripts/pages-release-delivery.mjs','utf8');
  for (const token of ['ARCHITECTURE_RELEASE','architectureObjects','architecture-v1/release.json']) assert.ok(source.includes(token), token);
});

test('public builder activates frontend reads without activating global production or dispatch', () => {
  const source = readFileSync('scripts/build-gallery-architecture-public.mjs','utf8');
  assert.ok(source.includes('productionActivation: false'));
  assert.ok(source.includes('frontendReadActivation: true'));
  assert.ok(source.includes('dispatchEnabled:false'));
  assert.match(source, /T08:00:00/);
  assert.ok(source.includes("RETIRED_LAST_EVENING_SLOT = '2026-10-04T18:00:00+08:00'"));
  assert.ok(!source.includes('T(?:08|18):00:00'));
  assert.ok(!source.includes('toc-mainline.user.js'));
});

test('public architecture publishes a hash-bound acquisition basis', () => {
  const builder = readFileSync('scripts/build-gallery-architecture-public.mjs','utf8');
  assert.ok(builder.includes("schema: 'gallery-acquisition-basis-v1'"));
  assert.ok(builder.includes('acquisitionBasis: acquisitionRef'));
  const delivery = readFileSync('scripts/pages-release-delivery.mjs','utf8');
  assert.ok(delivery.includes('release.acquisitionBasis'));
});


test('public architecture publishes a bounded hash-bound Hot fallback object', () => {
  const builder = readFileSync('scripts/build-gallery-architecture-public.mjs','utf8');
  assert.ok(builder.includes("schema: 'gallery-hot-fallback-v1'"));
  assert.ok(builder.includes('hotFallback: hotFallbackRef'));
  assert.ok(builder.includes('bundle.partitions.hot'));
  assert.ok(builder.includes('bundle.partitions.future'));
  const reader = readFileSync('architecture/published-reader.mjs','utf8');
  assert.ok(reader.includes('loadPublishedHotFallback'));
  assert.ok(reader.includes('architecture_hot_fallback_hash_mismatch'));
});
