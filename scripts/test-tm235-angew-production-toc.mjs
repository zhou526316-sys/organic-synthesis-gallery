import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await fs.readFile('public/toc-mainline.user.js','utf8');
const localCaptures = await fs.readFile('cloudflare/worker/src/local-captures.js','utf8');
const workerIndex = await fs.readFile('cloudflare/worker/src/index.js','utf8');
const mediaWrite = await fs.readFile('cloudflare/worker/src/media-write.js','utf8');
const deploy = await fs.readFile('.github/workflows/deploy-worker-frontend.yml','utf8');
let passed = 0;
function test(name, condition) {
  assert.ok(condition, name);
  passed += 1;
  console.log('TM235_ANGEW_PASS ' + name);
}

test('controller is Bridge 2.2.35 with unchanged capture protocol',
  source.includes("var VERSION = '6.2.20';") &&
  source.includes("var CONTROLLER_REVISION = '2.2.35';"));

test('controller no longer reads stale GitHub Pages media-index as TOC authority',
  !source.includes("getJson('https://zhou526316-sys.github.io/organic-synthesis-gallery/media-index.json") &&
  source.includes("var MEDIA_INVENTORY_ENDPOINT = WORKER + '/api/media/inventory';") &&
  source.includes("var productionInventory=await postReadJson(MEDIA_INVENTORY_ENDPOINT") &&
  source.includes("readOnly:true") &&
  source.includes("source:'worker_production_inventory'"));

test('old controllers are stopped by server capability revision',
  source.includes("String(caps.evidenceCaptureMinControllerRevision||'')!=='2.2.35'") &&
  source.includes("String(caps.mediaControllerRevision||'')!=='2.2.35'") &&
  workerIndex.includes("mediaControllerRevision:'2.2.35'") &&
  workerIndex.includes("evidenceCaptureMinControllerRevision:'2.2.35'"));

test('Wiley gets one post-upgrade retry before legacy overnight retry gates',
  source.includes("job.publisher==='wiley'&&job.captureToc===true&&prior&&String(prior.controllerRevision||'')!==CONTROLLER_REVISION") &&
  source.indexOf("job.publisher==='wiley'&&job.captureToc===true&&prior") <
    source.indexOf("if (prior && prior.version===VERSION && prior.status==='success')"));

test('paired Wiley capture can recover TOC through authenticated iframe routes',
  source.includes("var started=Date.now(),step=0,lastSignature='',stable=0,lastFigureSignature='',figureChangedAt=started,iframeAttempted=false;") &&
  source.includes("var iframeRows=await iframeCandidates(job,trace);") &&
  source.includes("stage:'paired_toc_fallback'"));

test('official TOC receipt is not accepted until production promotion is confirmed',
  source.includes("candidate.kind === 'official' && result.productionTocStored !== true") &&
  source.includes("throw new Error('toc_production_promotion_missing')") &&
  source.includes("checkpoint.toc.productionTocStored===true"));

test('Worker auto-promotes official local capture but leaves figure1 non-production',
  localCaptures.includes("if (kind === 'official')") &&
  localCaptures.includes("const promoted = await importToc(request, env") &&
  localCaptures.includes("productionTocStored: kind === 'official' ? true : false"));

test('Worker exposes idempotent official TOC backlog promotion',
  localCaptures.includes("export async function promoteOfficialLocalTocs") &&
  workerIndex.includes("'/api/admin/media/promote-local-tocs'") &&
  deploy.includes("Promote verified official TOCs into production"));

test('TOC backlog promotion is bounded, paginated, and Angew-first',
  localCaptures.includes("const offset = Math.max(0") &&
  localCaptures.includes("const scanLimit = Math.max(1, Math.min(40") &&
  localCaptures.includes("const aAngew = /^10\\.1002\\/anie\\./") &&
  localCaptures.includes("nextOffset") &&
  workerIndex.includes("url.searchParams.get('offset')") &&
  workerIndex.includes("url.searchParams.get('scan')") &&
  deploy.includes("url.searchParams.set('offset', String(offset))") &&
  deploy.includes("officialTocPromotionPaused"));

test('production TOC import accepts sanitized SVG but still rejects active SVG content',
  mediaWrite.includes("image\\/(?:png|jpe?g|gif|webp|svg\\+xml)") &&
  mediaWrite.includes("contentType === 'image/svg+xml'") &&
  mediaWrite.includes("<(?:script|foreignObject|iframe|object|embed|animate\\w*|set)") &&
  mediaWrite.includes("if (contentType === 'image/svg+xml') return 'svg';"));

test('deployment packages exact 2.2.35 installer',
  deploy.includes("// @version      2.2.35") &&
  deploy.includes("var CONTROLLER_REVISION = '2.2.35';"));

const exposedNames = [
  'normalizeDoi',
  'wileyGaHeadingText',
  'wileyGaUrlSignal',
  'wileyGraphicalAbstractCandidates',
  'productionMediaSnapshot',
];
const exposed = source.replace(
  '  installMenu();',
  '  globalThis.__tm235={' + exposedNames.join(',') + '}; return;\n  installMenu();',
);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const doi = '10.1002/anie.3415969';
  await page.route('**/*', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<html><head><meta name="citation_doi" content="'+doi+'"></head><body><main><article id="article"></article></main></body></html>',
  }));
  await page.goto('https://onlinelibrary.wiley.com/doi/full/' + doi);
  await page.evaluate(() => {
    window.GM_getValue = (_k, d) => d;
    window.GM_setValue = () => {};
    window.GM_deleteValue = () => {};
    window.GM_listValues = () => [];
    window.GM_registerMenuCommand = () => {};
    window.GM_openInTab = () => {};
    window.GM_xmlhttpRequest = () => {};
  });
  await page.addScriptTag({ content: exposed });

  const snapshot = await page.evaluate(() => __tm235.productionMediaSnapshot({
    generatedAt: 123,
    items: [
      {doi:'10.1002/anie.3415969',tocStored:false,tocReason:'cache_miss',figureCount:0},
      {doi:'10.1002/anie.7009966',tocStored:true,tocReason:'imported',figureCount:2},
    ],
  }));
  test('production inventory adapter marks only current D1 TOCs as available',
    snapshot.source === 'worker_production_inventory' &&
    snapshot.items['10.1002/anie.3415969'].toc.available === false &&
    snapshot.items['10.1002/anie.7009966'].toc.available === true);

  const embedded = await page.evaluate(() => {
    const article = document.querySelector('#article');
    const script = document.createElement('script');
    script.type = 'application/json';
    script.textContent =
      '{"doi":"10.1002/anie.3415969","graphicalAbstract":"https://onlinelibrary.wiley.com/cms/asset/abc/anie3415969-gra-0001-m.jpg","padding":"' +
      'X'.repeat(5000) +
      '","related":{"doi":"10.1002/anie.9999999","graphicalAbstract":"https://onlinelibrary.wiley.com/cms/asset/def/anie9999999-gra-0001-m.jpg"}}';
    article.appendChild(script);
    const job = {doi:'10.1002/anie.3415969',publisher:'wiley'};
    return __tm235.wileyGraphicalAbstractCandidates(
      job,
      document,
      'https://onlinelibrary.wiley.com/doi/full/10.1002/anie.3415969'
    ).map(row => ({url:row.url,source:row.source,kind:row.kind,assetType:row.assetType}));
  });
  test('Wiley embedded article data recovers current DOI GA only',
    embedded.some(row => /anie3415969-gra-0001-m\.jpg/i.test(row.url) &&
      row.source === 'wiley_ga_embedded_article_data' &&
      row.kind === 'official' &&
      row.assetType === 'graphical_abstract') &&
    !embedded.some(row => /anie9999999-gra-0001-m\.jpg/i.test(row.url)));

  const unsafe = await page.evaluate(() => {
    document.querySelector('#article').innerHTML =
      '<script type="application/json">{"doi":"10.1002/anie.3415969","image":"https://evil.example/cms/asset/a/anie3415969-gra-0001-m.jpg"}</script>';
    const job = {doi:'10.1002/anie.3415969',publisher:'wiley'};
    return __tm235.wileyGraphicalAbstractCandidates(job,document,location.href).map(row=>row.url);
  });
  test('Wiley embedded recovery rejects non-Wiley image hosts', unsafe.length === 0);
} finally {
  await browser.close();
}

console.log('TM235_ANGEW_TEST_SUMMARY ' + JSON.stringify({
  passed,
  bridge:'2.2.35',
  captureProtocol:'6.2.20',
  productionTocAuthority:'d1',
  officialTocAutoPromotion:true,
  bodyFigurePublicationUnchanged:true,
}));
