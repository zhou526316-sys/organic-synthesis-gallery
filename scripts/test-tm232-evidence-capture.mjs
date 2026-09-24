import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await fs.readFile('public/toc-mainline.user.js', 'utf8');
const names = [
  'evidenceCaptureEligible',
  'evidenceSectionType',
  'evidenceArticleRoot',
  'collectArticleEvidenceSections',
  'collectArticleEvidenceCaptions',
  'collectArticleEvidenceTables',
  'buildArticleEvidencePacket',
  'tryCaptureArticleEvidence',
];
const exposed = source.replace(
  '  installMenu();',
  '  globalThis.__tm232={' + names.join(',') + '}; return;\n  installMenu();',
);

const doi = '10.1021/jacs.6c08636';
const jobId = '12345678-1234-1234-1234-123456789012';
const browser = await chromium.launch({ headless: true });
let passed = 0;
function test(name, condition) {
  assert.ok(condition, name);
  passed += 1;
  console.log('TM232_EVIDENCE_PASS ' + name);
}

function repeat(text, count) {
  return Array.from({ length: count }, () => text).join(' ');
}

try {
  const page = await browser.newPage();
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'pubs.acs.org') {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><head><meta name="citation_doi" content="' + doi + '"><link rel="canonical" href="https://pubs.acs.org/doi/' + doi + '"></head><body><article id="article"></article></body></html>',
      });
    }
    return route.abort();
  });
  await page.goto('https://pubs.acs.org/doi/' + doi + '#osg-job=' + jobId);

  await page.evaluate(({ doi, jobId }) => {
    const active = {
      doi,
      jobId,
      captureVersion: '6.2.20',
      publisher: 'acs',
      mediaNeed: 'figures',
      captureToc: false,
      title: 'Evidence fixture title',
      journal: 'JACS',
      queueGeneratedAt: '2026-09-24T15:49:28.181Z',
      startedAt: new Date().toISOString(),
    };
    const storage = {
      'osg-toc-v6:active-job': active,
      'osg-toc-v6:write-token': 'fixture-write-token',
    };
    window.__gm = storage;
    window.__evidencePosts = [];
    window.__evidenceTransport = 'success';
    window.GM_getValue = (key, fallback) => key in storage ? storage[key] : fallback;
    window.GM_setValue = (key, value) => { storage[key] = value; };
    window.GM_deleteValue = key => { delete storage[key]; };
    window.GM_listValues = () => Object.keys(storage);
    window.GM_registerMenuCommand = () => {};
    window.GM_openInTab = () => {};
    window.GM_xmlhttpRequest = options => {
      if (!String(options.url).includes('/api/article-summary/fulltext/import')) {
        throw new Error('unexpected GM request ' + options.url);
      }
      const payload = JSON.parse(String(options.data || '{}'));
      window.__evidencePosts.push(payload);
      if (window.__evidenceTransport === 'fail') {
        queueMicrotask(() => options.onerror({ error: 'fixture_network_failure' }));
        return;
      }
      const chars = (payload.sections || []).reduce((sum, row) => sum + String(row.text || '').length, 0)
        + (payload.captions || []).reduce((sum, row) => sum + String(row.text || '').length, 0)
        + (payload.tables || []).reduce((sum, row) => sum + String(row.text || '').length, 0);
      queueMicrotask(() => options.onload({
        status: 200,
        responseText: JSON.stringify({
          stored: true,
          state: 'evidence_ready',
          doi,
          schemaVersion: 'article-evidence-v2',
          chars,
          sections: (payload.sections || []).length,
          sourceHash: 'a'.repeat(64),
          evidencePacketHash: 'b'.repeat(64),
        }),
        responseHeaders: 'content-type: application/json\r\n',
      }));
    };
    sessionStorage.setItem('osg-toc-v6:tab-job-binding', jobId);
  }, { doi, jobId });

  await page.addScriptTag({ content: exposed });

  const fixture = {
    abstract: repeat('The abstract describes a catalytic bond-forming reaction with high chemoselectivity and broad synthetic utility.', 10),
    intro: repeat('The introduction defines the synthetic problem and explains why existing methods provide limited selectivity or substrate coverage.', 12),
    results: repeat('Results and discussion describe optimized catalyst loading, reagent equivalents, solvent, temperature, reaction time, yields, and substrate scope.', 18),
    mechanism: repeat('Mechanistic studies report control experiments and radical-probe observations, while the authors separately propose a catalytic cycle.', 12),
    conclusion: repeat('The conclusion summarizes the transformation, selectivity, scope, limitations, and synthetic significance.', 10),
  };

  await page.evaluate(fixture => {
    document.querySelector('#article').innerHTML = `
      <h1>Evidence fixture title</h1>
      <div class="article__abstract"><h2>Abstract</h2><p>${fixture.abstract}</p></div>
      <section id="intro"><h2>Introduction</h2><p>${fixture.intro}</p></section>
      <section id="results"><h2>Results and Discussion</h2><p>${fixture.results}</p>
        <figure><figcaption>Scheme 1. Representative catalytic transformation under the optimized conditions.</figcaption></figure>
        <table><caption>Table 1. Optimization</caption><tbody><tr><td>Catalyst 2 mol%</td><td>82% yield</td></tr><tr><td>-20 °C</td><td>95% ee</td></tr></tbody></table>
      </section>
      <section id="mechanism"><h2>Mechanistic Studies</h2><p>${fixture.mechanism}</p></section>
      <section id="conclusion"><h2>Conclusion</h2><p>${fixture.conclusion}</p></section>
      <section id="references" class="references"><h2>References</h2><p>FOREIGN_REFERENCE_TEXT_SHOULD_NEVER_ENTER_EVIDENCE</p></section>
      <aside class="recommended"><p>RECOMMENDED_ARTICLE_TEXT_SHOULD_NEVER_ENTER_EVIDENCE</p></aside>
    `;
  }, fixture);

  const extracted = await page.evaluate(() => {
    const job = window.__gm['osg-toc-v6:active-job'];
    const packet = __tm232.buildArticleEvidencePacket(job, []);
    return {
      packet,
      eligible: {
        toc: __tm232.evidenceCaptureEligible({ mediaNeed: 'toc' }),
        figures: __tm232.evidenceCaptureEligible({ mediaNeed: 'figures' }),
        paired: __tm232.evidenceCaptureEligible({ mediaNeed: 'toc+figures' }),
      },
    };
  });

  test('historical TOC-only jobs are ineligible for evidence capture',
    extracted.eligible.toc === false && extracted.eligible.figures === true && extracted.eligible.paired === true);
  test('complete article becomes Evidence Packet v2',
    extracted.packet.fulltextStatus === 'complete' && extracted.packet.schemaVersion === 'article-evidence-v2');
  test('packet is bound to DOI and Bridge 2.2.32',
    extracted.packet.doi === doi && extracted.packet.pageDoi === doi && extracted.packet.controllerRevision === '2.2.32');
  const types = extracted.packet.sections.map(row => row.type);
  test('semantic sections include abstract/results/mechanism/conclusion',
    ['abstract', 'results', 'mechanism', 'conclusion'].every(type => types.includes(type)));
  const allEvidenceText = JSON.stringify({
    sections: extracted.packet.sections,
    captions: extracted.packet.captions,
    tables: extracted.packet.tables,
  });
  test('references and recommended content are excluded',
    !allEvidenceText.includes('FOREIGN_REFERENCE_TEXT') && !allEvidenceText.includes('RECOMMENDED_ARTICLE_TEXT'));
  test('scheme caption and optimization table are retained',
    extracted.packet.captions.some(row => /Scheme 1/.test(row.text)) &&
    extracted.packet.tables.some(row => /82% yield/.test(row.text) && /95% ee/.test(row.text)));

  const stored = await page.evaluate(async () => {
    const job = window.__gm['osg-toc-v6:active-job'];
    const result = await __tm232.tryCaptureArticleEvidence(job, [], 'fixture-write-token');
    return { result, posts: window.__evidencePosts.slice() };
  });
  test('evidence upload stores one structured packet',
    stored.result.status === 'stored' && stored.posts.length === 1);
  test('private upload omits test-only metrics and carries provenance',
    !('_metrics' in stored.posts[0]) &&
    stored.posts[0].jobId === jobId &&
    stored.posts[0].captureVersion === '6.2.20' &&
    stored.posts[0].textProcessingPolicy === 'unknown');

  const isolatedFailure = await page.evaluate(async () => {
    window.__evidenceTransport = 'fail';
    const job = window.__gm['osg-toc-v6:active-job'];
    return __tm232.tryCaptureArticleEvidence(job, [], 'fixture-write-token');
  });
  test('evidence transport failure is contained and never throws into media result',
    isolatedFailure.status === 'failed' && /fixture_network_failure/.test(isolatedFailure.reason));

  const tocOnly = await page.evaluate(async () => {
    const before = window.__evidencePosts.length;
    const active = window.__gm['osg-toc-v6:active-job'];
    const job = { ...active, mediaNeed: 'toc' };
    const result = await __tm232.tryCaptureArticleEvidence(job, [], 'fixture-write-token');
    return { result, before, after: window.__evidencePosts.length };
  });
  test('TOC-only evidence path performs zero network writes',
    tocOnly.result.status === 'not_requested' && tocOnly.before === tocOnly.after);

  const challenge = await page.evaluate(() => {
    const warning = document.createElement('div');
    warning.textContent = 'Verify you are human. Access denied.';
    document.body.prepend(warning);
    const job = window.__gm['osg-toc-v6:active-job'];
    return __tm232.buildArticleEvidencePacket(job, []);
  });
  test('challenge/auth shell cannot become complete evidence',
    challenge.fulltextStatus === 'partial' && challenge.reason === 'challenge_page');

  test('controller revision upgraded without changing capture protocol',
    source.includes("var VERSION = '6.2.20';") && source.includes("var CONTROLLER_REVISION = '2.2.32';"));

  console.log('TM232_EVIDENCE_TEST_SUMMARY ' + JSON.stringify({
    passed,
    browser: 'Chromium',
    productionWrites: 0,
    publisherNetwork: false,
    captureProtocol: '6.2.20',
    controllerRevision: '2.2.32',
  }));
} finally {
  await browser.close();
}
