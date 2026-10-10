import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCatalog } from '../architecture/catalog.mjs';
import { isHotLandingEligible } from '../shared/literature-landing.mjs';

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


test('public architecture publishes a bounded hash-bound Hot head object', () => {
  const builder = readFileSync('scripts/build-gallery-architecture-public.mjs','utf8');
  assert.ok(builder.includes("schema: 'gallery-hot-head-v1'"));
  assert.ok(builder.includes('hotHead: hotHeadRef'));
  assert.ok(builder.includes('hotHeadInline: hotHeadBody'));
  assert.ok(builder.includes('hot_head_inline_hash_mismatch'));
  assert.ok(builder.includes('RESULT_WINDOW_SIZE'));
  assert.ok(builder.includes('hot_head_over_budget'));
  const delivery = readFileSync('scripts/pages-release-delivery.mjs','utf8');
  assert.ok(delivery.includes('release.hotHead'));
});

test('TOC rescue stays dormant until the bounded media path fails', () => {
  const rescue = readFileSync('public/toc-rescue.js','utf8');
  assert.ok(rescue.includes("gallery-media-static-fallback"));
  assert.ok(rescue.includes('function activate()'));
  assert.ok(!/\nscheduleScan\(0\);\s*\n\}\)\(\);\s*$/.test(rescue));
  const manifestBlock = rescue.slice(rescue.indexOf('async function loadManifest()'), rescue.indexOf('async function loadLiveCaptures()'));
  assert.ok(manifestBlock.includes("cache: 'default'"));
  assert.ok(!manifestBlock.includes("cache: 'no-store'"));
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
  const delivery = readFileSync('scripts/pages-release-delivery.mjs','utf8');
  assert.ok(delivery.includes('release.hotFallback'));
});


test('Hot fallback count uses admitted rows after historical exclusions', () => {
  const asOfDate = '2026-10-10';
  const rows = [
    {doi:'10.9999/ordinary-oct',date:'2026-10-09',addedDate:'2026-10-10'},
    {doi:'10.9999/ordinary-sept',date:'2026-09-25',addedDate:'2026-09-26'},
    {doi:'10.9999/late-sept',date:'2026-09-25',addedDate:'2026-10-10'},
    {doi:'10.9999/tagged-sept',date:'2026-09-24',addedDate:'2026-10-10',
      ingestionChannel:'historical_backfill'},
    {doi:'10.9999/tagged-early',date:'2026-08-01',addedDate:'2026-10-10',
      ingestionChannel:'historical_backfill'},
  ].map(row=>({ title:'Synthetic example for Hot filtering',journal:'JACS',
    authors:['Test Author'],...row }));
  const snapshot=buildCatalog(rows,{asOfDate,
    source:{commit:'a'.repeat(40),datasetSha256:'b'.repeat(64)}});
  const candidates=new Set([...snapshot.partitions.hot,...snapshot.partitions.future,
    ...snapshot.partitions.date_unknown]);
  const admitted=snapshot.records.filter(row=>candidates.has(row.doi)&&isHotLandingEligible(row,asOfDate));
  assert.ok(candidates.size>admitted.length,'test must include deliberately excluded history');
  assert.deepEqual(admitted.map(row=>row.doi),[
    '10.9999/ordinary-oct','10.9999/ordinary-sept']);
  const builder=readFileSync('scripts/build-gallery-architecture-public.mjs','utf8');
  assert.ok(builder.includes('count: hotCandidateRecords.length,'),
    'generator must declare actual post-filter count or fallback validation fails');
  assert.ok(!builder.includes('count: hotCandidateDois.size,'),
    'unfiltered candidate size is not valid as Hot fallback record count');
  const reader=readFileSync('architecture/published-reader.mjs','utf8');
  assert.ok(reader.includes('payload.count === payload.records.length'),
    'read-path generation validation must not be weakened');
});

test('recently admitted undated and future-dated papers appear without changing date provenance', () => {
  const asOfDate = '2026-10-08';
  const make = (doi, date, addedDate) => ({
    doi, date, addedDate, title: 'Synthetic fixture paper', journal: 'JACS', authors: [],
  });
  const papers = [
    make('10.9999/known-hot', '2026-10-07', '2026-10-08'),
    make('10.9999/new-undated', '', '2026-10-08'),
    make('10.9999/new-future-date', '2026-10-09', '2026-10-08'),
    make('10.9999/old-undated', '', '2026-09-10'),
    make('10.9999/archive', '2026-05-07', '2026-09-10'),
  ];
  const snapshot = buildCatalog(papers, {
    asOfDate, source: { commit: 'a'.repeat(40), datasetSha256: 'b'.repeat(64) },
  });
  const eligible = snapshot.records.filter(row => isHotLandingEligible(row, asOfDate));
  assert.deepEqual(eligible.map(row => row.doi), [
    '10.9999/known-hot','10.9999/new-future-date','10.9999/new-undated',
  ]);
  assert.deepEqual(snapshot.partitions.date_unknown, ['10.9999/new-undated', '10.9999/old-undated']);
  assert.deepEqual(snapshot.partitions.future, ['10.9999/new-future-date']);
  const builder = readFileSync('scripts/build-gallery-architecture-public.mjs','utf8');
  const reader = readFileSync('architecture/published-reader.mjs','utf8');
  const frontend = readFileSync('src/main.ts','utf8');
  assert.ok(builder.includes('bundle.partitions.date_unknown'));
  assert.ok(builder.includes('isHotLandingEligible(row, asOfDate)'));
  assert.ok(reader.includes('isHotLandingEligible(row, asOfDate)'));
  const fullReader = readFileSync('architecture/reader.mjs','utf8');
  assert.ok(fullReader.includes('isHotLandingEligible(row, asOfDate)'));
  assert.ok(fullReader.includes("v.month === 'undated'"));
  assert.ok(reader.includes('isHotLandingEligible(bucket, asOfDate)'));
  assert.ok(frontend.includes('发表日期待核实'));
  assert.ok(frontend.includes('dateUnverified: paper.dateUnverified === true'));
});
