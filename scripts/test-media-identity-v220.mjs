import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import {inspectBrowserImage,publishVerifiedBrowserMedia,fullDigest} from '../cloudflare/worker/src/verified-browser-media.js';

const normalizeDoi = value => {
  const s = String(value || '').toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').trim();
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : null;
};
const ctx = vm.createContext({ URL, Request, Response, TextEncoder, TextDecoder, atob, btoa, crypto: webcrypto, console, normalizeDoi, inspectBrowserImage,publishVerifiedBrowserMedia,fullDigest });
const file = fs.readFileSync('cloudflare/worker/src/local-captures.js', 'utf8');
vm.runInContext(file.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), ctx);
const local = vm.runInContext('({captureBelongsToDoi,captureIntakeError,importLocalCapture,importStagedArticleFigure,promoteStagedArticleFigures})', ctx);
let tests = 0;
function check(name, fn) { fn(); tests += 1; console.log('MEDIA_IDENTITY_PASS ' + name); }
const doi = '10.1021/acscatal.6c05065';
const other = '10.1021/acscatal.6c05381';
const page = 'https://pubs.acs.org/doi/' + doi;
const image = 'https://acs.silverchair-cdn.com/acs/content_public/journal/accacs/pap/10.1021_acscatal.6c05065/1/m.png';
const good = { doi, articleUrl: page, sourceUrl: image, pageDoi: doi, captureVersion: '6.2.21', jobId: '12345678-1234-1234-1234-123456789012' };
check('same DOI ACS metadata', () => assert.equal(local.captureBelongsToDoi(good, doi), true));
check('correct page cannot mask foreign ACS asset', () => assert.equal(local.captureBelongsToDoi({ ...good, sourceUrl: image.replace('6c05065', '6c05381') }, doi), false));
check('foreign page cannot mask correct asset', () => assert.equal(local.captureBelongsToDoi({ ...good, articleUrl: page.replace('6c05065', '6c05381') }, doi), false));
check('Nature article shorthand must be checked', () => assert.equal(local.captureBelongsToDoi({ articleUrl: 'https://www.nature.com/articles/s41557-026-02258-8', sourceUrl: 'https://media.springernature.com/image/art%3A10.1038%2Fs44160-026-01155-9/fig.png' }, '10.1038/s41557-026-02258-8'), false));
check('double encoded foreign DOI', () => assert.equal(local.captureBelongsToDoi({ ...good, sourceUrl: 'https://x.test/' + encodeURIComponent(encodeURIComponent(other)) + '/a.png' }, doi), false));
check('old client rejected', () => assert.equal(local.captureIntakeError({ ...good, captureVersion: '6.2.19' }, doi), 'capture_client_upgrade_required'));
check('missing nonce rejected', () => assert.equal(local.captureIntakeError({ ...good, jobId: '' }, doi), 'capture_job_binding_missing'));
check('missing page evidence rejected', () => assert.equal(local.captureIntakeError({ ...good, pageDoi: '' }, doi), 'capture_page_doi_unverified'));
check('missing image source rejected', () => assert.equal(local.captureIntakeError({ ...good, sourceUrl: '' }, doi), 'capture_source_evidence_missing'));
check('valid bound intake', () => assert.equal(local.captureIntakeError(good, doi), ''));
let writes = 0;
for (const name of ['importLocalCapture', 'importStagedArticleFigure']) {
  const result = await local[name](new Request('https://example.test/api'), { MEDIA: { put() { writes += 1; throw new Error('Unexpected write'); } } }, { ...good, kind: 'official', sourceUrl: image.replace('6c05065', '6c05381') });
  check(name + ' rejects before R2 write', () => { assert.equal(result.status, 409); assert.equal(writes, 0); });
}
let reads = 0;
const staged = { version: 1, items: { old: { ...good, id: 'figure-1', updatedAt: 1790081999999, r2Key: 'old.jpg' } } };
const promoted = await local.promoteStagedArticleFigures(new Request('https://example.test/api'), { DB: {}, MEDIA: { async get() { reads += 1; return { text: async () => JSON.stringify(staged) }; } } });
check('quarantined staged image cannot be laundered through promotion', () => { assert.equal(promoted.body.requested, 0); assert.equal(reads, 1); });

const browser = fs.readFileSync('public/toc-mainline.user.js', 'utf8');
const start = browser.indexOf('function embeddedJobDois(');
const end = browser.indexOf('  function candidateBelongsToJob(', start);
let live = { doi, jobId: good.jobId, captureVersion: '6.2.21' };
let binding = good.jobId;
let meta = [];
const bctx = vm.createContext({ URL, normalizeDoi, VERSION: '6.2.21', P: 'osg-toc-v6:', ACTIVE_JOB_KEY: 'active', location: { href: page, hash: '#osg-job=' + good.jobId }, GM_getValue: () => live, sessionStorage: { getItem: () => binding, setItem: (_key, value) => { binding = value; } }, document: { querySelectorAll: () => meta }, sleep: async () => {} });
vm.runInContext(browser.slice(start, end), bctx);
const guard = vm.runInContext('assertBoundCaptureJob', bctx);
check('bound publisher tab passes', () => assert.equal(guard({ ...live }, image), doi));
check('foreign candidate rejected in browser', () => assert.throws(() => guard({ ...live }, image.replace('6c05065', '6c05381')), /media_source_doi_mismatch/));
binding = 'old-tab';
check('unrelated old tab rejected', () => assert.throws(() => guard({ ...live }, image), /capture_tab_job_mismatch/));
binding = good.jobId;
check('stale task nonce rejected', () => assert.throws(() => guard({ ...live, jobId: 'outdated' }, image), /capture_job_stale_or_unbound/));
meta = [{ getAttribute: key => key === 'content' ? other : '' }];
check('URL and page metadata conflict rejected', () => assert.throws(() => guard({ ...live }, image), /page_doi_mismatch/));
meta = [];
bctx.location.href = 'https://pubs.acs.org/action/doSearch';
check('search page is not an article identity', () => assert.throws(() => guard({ ...live }, image), /page_doi_unverified/));
const loader = fs.readFileSync('cloudflare/scripts/build-bridge-loader.mjs', 'utf8');
check('integrated Bridge exports local traces', () => assert.ok(loader.includes('// @grant        GM_listValues')));
check('summary exposes actual runtime independently', () => assert.ok(browser.includes('runtimeVersion: VERSION, summaryIsCurrentVersion:')));
console.log('MEDIA_IDENTITY_TEST_SUMMARY ' + JSON.stringify({ passed: tests, productionWrites: writes }));
