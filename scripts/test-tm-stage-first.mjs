import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('public/toc-mainline.user.js', 'utf8');
const a = source.indexOf('  async function uploadArticleFigure(');
const b = source.indexOf('\n  async function uploadCapture(', a);
assert.ok(a >= 0 && b > a);
const fn = source.slice(a, b);
assert.ok(!fn.includes('FIGURE_IMPORT_ENDPOINT'), 'Recovery capture must not call the deliberately locked import route');
const doi = '10.1021/acs.joc.6c01302';
const job = { doi, jobId: '12345678-1234-1234-1234-123456789012', captureVersion: '6.2.20' };
const candidate = { label: 'Scheme 3', text: 'Substrate scope', url: 'https://pubs.acs.org/view-large/figure/257975651/jo6c01302_0003.svg' };
const image = { width: 668, height: 468, byteLength: 200, imageData: 'data:image/svg+xml;base64,PHN2Zy8+' };
const valid = { doi, id: 'scheme-3', stored: true, staged: true, width: 668, height: 468, imageUrl: 'https://example.test/media/a.svg' };
let passed = 0;
async function scenario(name, options = {}) {
  const requests = []; const trace = []; let guardCalls = 0;
  const ctx = vm.createContext({
    sleep: async () => {},
    captureLiveUpdate: () => {}, // The observer has independent ownership/count/privacy tests.
    VERSION: '6.2.20', location: { href: 'https://pubs.acs.org/doi/' + doi },
    FIGURE_STAGE_ENDPOINT: '/api/article-figures/stage',
    normalizeDoi: x => String(x || '').toLowerCase(),
    assertBoundCaptureJob: () => {
      guardCalls += 1;
      if (options.guardErrorAt === guardCalls) throw new Error('capture_job_stale_or_unbound');
      return doi;
    },
    pushTrace: (list, event) => list.push(event),
    postJson: async (url, payload) => {
      requests.push({ url, payload });
      if (options.error) throw options.error;
      return options.receipt === undefined ? valid : options.receipt;
    }
  });
  // Test the actual upload-only retry wrapper, not a replacement stub.
  if (source.includes('BEGIN OSG_UPLOAD_EVIDENCE_V1')) vm.runInContext(source.slice(source.indexOf('  function retryableImageUpload('), source.indexOf('  // END OSG_UPLOAD_EVIDENCE_V1')), ctx);
  vm.runInContext(fn, ctx);
  const run = vm.runInContext('uploadArticleFigure', ctx);
  if (options.reject) {
    await assert.rejects(() => run(job, candidate, image, trace, 'test-only', 0), options.reject);
    assert.equal(trace.filter(x => x.event === 'complete').length, 0);
  } else {
    const result = await run(job, candidate, image, trace, 'test-only', 0);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/article-figures/stage');
    assert.equal(requests[0].payload.jobId, job.jobId);
    assert.equal(requests[0].payload.pageDoi, doi);
    assert.equal(requests[0].payload.sourceUrl, candidate.url);
    assert.equal(result.staged, true);
    assert.equal(result.imported, false);
    assert.equal(result.published, false);
    assert.equal(result.publicationState, 'pending_verified_promotion');
    assert.equal(trace.filter(x => x.event === 'complete').length, 1);
  }
  if (options.guardErrorAt === 1) assert.equal(requests.length, 0);
  passed += 1; console.log('DIRECT_STAGE_PASS ' + name);
}
await scenario('usable SVG sent straight to R2, not locked D1 route');
await scenario('stage transport failure is not called a successful capture', { error: new Error('gm_then_fetch_failed'), reject: /gm_then_fetch_failed/ });
await scenario('server identity rejection must not be retried through import', { error: Object.assign(new Error('media_source_doi_mismatch'), { httpStatus: 409 }), reject: /media_source_doi_mismatch/ });
await scenario('missing receipt rejected', { receipt: null, reject: /figure_stage_receipt_invalid/ });
await scenario('wrong DOI receipt rejected', { receipt: { ...valid, doi: '10.1021/jacs.6c13517' }, reject: /figure_stage_receipt_invalid/ });
await scenario('wrong Figure label receipt rejected', { receipt: { ...valid, id: 'scheme-2' }, reject: /figure_stage_receipt_invalid/ });
await scenario('HTTP success without storage rejected', { receipt: { ...valid, stored: false }, reject: /figure_stage_receipt_invalid/ });
await scenario('stale tab cannot start media upload', { guardErrorAt: 1, reject: /capture_job_stale_or_unbound/ });
await scenario('late upload response cannot complete next task', { guardErrorAt: 2, reject: /capture_job_stale_or_unbound/ });
console.log('DIRECT_STAGE_TEST_SUMMARY ' + JSON.stringify({ passed, productionWrites: 0 }));
