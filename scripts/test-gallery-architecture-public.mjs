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

test('public builder does not activate production or dispatch', () => {
  const source = readFileSync('scripts/build-gallery-architecture-public.mjs','utf8');
  assert.ok(source.includes('productionActivation: false'));
  assert.ok(source.includes('dispatchEnabled:false'));
  assert.ok(!source.includes('src/main.ts'));
  assert.ok(!source.includes('toc-mainline.user.js'));
});

test('inactive public architecture publishes a hash-bound acquisition basis', () => {
  const builder = readFileSync('scripts/build-gallery-architecture-public.mjs','utf8');
  assert.ok(builder.includes("schema: 'gallery-acquisition-basis-v1'"));
  assert.ok(builder.includes('acquisitionBasis: acquisitionRef'));
  const delivery = readFileSync('scripts/pages-release-delivery.mjs','utf8');
  assert.ok(delivery.includes('release.acquisitionBasis'));
});
