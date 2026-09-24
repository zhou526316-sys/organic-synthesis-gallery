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
  status: 'success',
  reason: 'captured_rendered_canvas',
  controllerRevision: '2.2.32',
  mediaNeed: 'figures',
  fulltextStatus: 'stored',
  evidenceChars: 12345,
  evidenceSections: 6,
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
assert.equal(history.body.latest.fulltextStatus, 'stored');
assert.equal(history.body.latest.evidenceChars, 12345);
assert.equal(history.body.latest.evidenceSections, 6);
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
