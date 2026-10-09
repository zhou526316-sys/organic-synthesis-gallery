import assert from 'node:assert/strict';
import { importTampermonkeyReport, getTampermonkeyReports } from '../src/local-captures.js';

class MemoryR2 {
  constructor() { this.map = new Map(); }
  async put(key, value) {
    const text = typeof value === 'string'
      ? value
      : new TextDecoder().decode(value instanceof Uint8Array ? value : new Uint8Array(value));
    this.map.set(key, text);
  }
  async get(key) {
    if (!this.map.has(key)) return null;
    const value = this.map.get(key);
    return { text: async () => value };
  }
}

const env = { MEDIA: new MemoryR2() };
const doi = '10.1021/jacs.6c99999';
const req = path => new Request('https://example.test' + path);

const failed = await importTampermonkeyReport(req('/api/media/tampermonkey-report/import'), env, {
  doi,
  publisher: 'acs',
  controllerRevision: '2.2.41',
  status: 'failed',
  reason: 'image_http_403',
  articleUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c99999',
  startedAt: '2026-09-20T10:00:00.000Z',
  finishedAt: '2026-09-20T10:00:10.000Z',
  trace: [
    { seq: 1, stage: 'candidate_discovery', event: 'candidate', status: 'official', url: 'https://acs.example/toc.png', candidateKind: 'official' },
    { seq: 2, stage: 'page_fetch', event: 'response', status: 'http_error', httpStatus: 403, url: 'https://acs.example/toc.png' },
  ],
});
assert.equal(failed.status, 200);
assert.equal(failed.body.status, 'failed');
assert.equal(failed.body.failureCount, 1);

const succeeded = await importTampermonkeyReport(req('/api/media/tampermonkey-report/import'), env, {
  doi,
  publisher: 'acs',
  controllerRevision: '2.2.41',
  status: 'success',
  reason: 'captured_rendered_canvas',
  mediaNeed: 'evidence',
  fulltextStatus: 'stored',
  evidenceLevel: 'abstract_only',
  evidenceChars: 842,
  evidenceSections: 1,
  privatePdfStatus: 'stored',
  privatePdfBytes: 456789,
  assetType: 'toc_graphic',
  candidateKind: 'official',
  candidateSource: 'live_dom',
  articleUrl: 'https://pubs.acs.org/doi/10.1021/jacs.6c99999',
  sourceUrl: 'https://acs.example/toc.png',
  startedAt: '2026-09-20T10:05:00.000Z',
  finishedAt: '2026-09-20T10:05:05.000Z',
  trace: [
    { seq: 1, stage: 'rendered_canvas', event: 'complete', status: 'ok', imageWidth: 900, imageHeight: 500, byteLength: 120000 },
  ],
});
assert.equal(succeeded.status, 200);
assert.equal(succeeded.body.status, 'success');
assert.equal(succeeded.body.failureCount, 1);
assert.equal(succeeded.body.successCount, 1);

const failures = await getTampermonkeyReports(req('/api/media/tampermonkey-reports?status=failed&limit=20'), env);
assert.equal(failures.status, 200);
assert.equal(failures.body.mode, 'attempts');
assert.equal(failures.body.totalMatched, 1);
assert.equal(failures.body.items[0].doi, doi);
assert.equal(failures.body.items[0].reason, 'image_http_403');

const history = await getTampermonkeyReports(req('/api/media/tampermonkey-reports?doi=' + encodeURIComponent(doi) + '&history=1'), env);
assert.equal(history.status, 200);
assert.equal(history.body.latest.status, 'success');
assert.equal(history.body.latest.mediaNeed, 'evidence');
assert.equal(history.body.latest.fulltextStatus, 'stored');
assert.equal(history.body.latest.evidenceLevel, 'abstract_only');
assert.equal(history.body.latest.evidenceChars, 842);
assert.equal(history.body.latest.evidenceSections, 1);
assert.equal(history.body.latest.privatePdfStatus, 'stored');
assert.equal(history.body.latest.privatePdfBytes, 456789);
assert.ok(history.body.attempts.some(item => item.status === 'success' && item.privatePdfStatus === 'stored' && item.privatePdfBytes === 456789));
assert.equal(history.body.failureCount, 1);
assert.equal(history.body.successCount, 1);
assert.equal(history.body.attempts.length, 2);
assert.ok(history.body.attempts.some(item => item.status === 'failed' && item.reason === 'image_http_403'));
assert.ok(history.body.attempts.some(item => item.status === 'success' && item.reason === 'captured_rendered_canvas'));

console.log(JSON.stringify({
  tampermonkeyDiagnosticHistory: true,
  retainedAttempts: history.body.attempts.length,
  failureFilter: failures.body.totalMatched,
}));

const pdfIndependentEnv={MEDIA:new MemoryR2()};
const bodyDoi='10.1021/jacs.6c99998';
const bodyData={
  doi:bodyDoi,jobId:'publisher-job-abcdefgh123456',captureVersion:'6.2.20',
  controllerRevision:'2.2.41',publisher:'acs',
  final:true,status:'partial',tocStatus:'already_available',
  mediaNeed:'toc+figures+evidence+pdf',figuresDiscovered:2,figuresStored:2,
  figureLabels:['Figure 1','Figure 2'],
  fulltextStatus:'not_requested',privatePdfStatus:'failed',
  reason:'combined_capture;toc=already_available;figures=2/2;evidence=not_requested;published=0;pdf=private_pdf_http_403',
  articleUrl:'https://pubs.acs.org/jacs/article/doi/10.1021/jacs.6c99998/example',
  sourceUrl:'https://acs.silverchair-cdn.com/acs/content_public/10.1021_jacs.6c99998/ja6c99998_0001.png',
  startedAt:new Date(Date.now()-10000).toISOString(),
  finishedAt:new Date().toISOString(),
  trace:[{stage:'private_pdf_capture',event:'failed',status:'failed',httpStatus:403,message:'private_pdf_http_403'}],
};
const bodyImport=await importTampermonkeyReport(req('/api/media/tampermonkey-report/import'),pdfIndependentEnv,bodyData);
assert.equal(bodyImport.status,200);
const publication=await getTampermonkeyReports(req('/api/media/tampermonkey-reports?publication=1&limit=250&offset=0'),pdfIndependentEnv);
assert.equal(publication.status,200);
const completed=publication.body.items.find(row=>row.doi===bodyDoi);
assert.ok(completed,'complete figure capture must be retained when only PDF HTTP403 fails');
assert.equal(completed.status,'partial');
assert.equal(completed.figuresStored,2);
assert.equal(completed.privatePdfStatus,'failed','PDF must not be presented as stored');
assert.equal(completed.reason,bodyData.reason);
const unsafeDoi='10.1021/jacs.6c99997';
await importTampermonkeyReport(req('/api/media/tampermonkey-report/import'),pdfIndependentEnv,{
  ...bodyData,doi:unsafeDoi,jobId:'publisher-job-abcdefgh123457',
  reason:'combined_capture;toc=not_found;figures=2/2;evidence=not_requested;published=0;pdf=private_pdf_http_403',
  tocStatus:'not_found',articleUrl:bodyData.articleUrl.replace('6c99998','6c99997'),
  sourceUrl:bodyData.sourceUrl.replace('6c99998','6c99997'),
});
const afterUnsafe=await getTampermonkeyReports(req('/api/media/tampermonkey-reports?publication=1&limit=250&offset=0'),pdfIndependentEnv);
assert.equal(afterUnsafe.status,200);
assert.ok(!afterUnsafe.body.items.some(row=>row.doi===unsafeDoi),'missing TOC remains excluded from trusted partial packet projection');
console.log('PDF403_INDEPENDENT_BODY_PACKET_PUBLICATION_OK');
