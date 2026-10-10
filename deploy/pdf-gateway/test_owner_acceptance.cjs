/* No external dependencies. Deterministic privacy and Range 206 canary tests. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const source = fs.readFileSync(require('node:path').join(__dirname, 'owner-acceptance-console.js'), 'utf8');
const ingress = 'https://pdf.gczhouwld.com';
const fileLink = ingress + '/api/user-ui/private-pdf/file?token=v2.fixturedata.fixturesig';
const PDF_HEADER = new Uint8Array([37,80,68,70,45,49,46,55,10,120,120,120,120,120,120,120]);
function mockResponse(status, body, headers = {}) {
  return {
    status, ok: status >= 200 && status < 300,
    json: async () => body,
    headers: {get(name) { return headers[name.toLowerCase()] || null; }},
    arrayBuffer: async () => PDF_HEADER.buffer,
    body: {cancel: async () => {}},
  };
}
async function runCase(kind) {
  const calls = [], reports = [], warnings = [];
  const session = 'fixture-private-session-never-print';
  const location = {origin: kind === 'wrong-origin' ? 'https://attacker.example' :
    'https://gallery.gczhouwld.com'};
  const fetch = async (url, opts = {}) => {
    const target = String(url);
    calls.push({url: target, opts});
    if (target === ingress + '/_pdf_gateway_health') {
      return mockResponse(200, {ok:true,role:'private-pdf-ingress',authenticated:false});
    }
    if (target.startsWith(ingress + '/api/user-ui/private-pdf/open?')) {
      assert.equal(opts.headers?.authorization, 'Bearer ' + session);
      assert.equal(opts.credentials, 'omit');
      if (kind === 'denied') return mockResponse(403,{error:'private_pdf_not_entitled'});
      return mockResponse(200,{available:true,url:
        kind === 'bad-origin' ? 'https://attacker.example/api/user-ui/private-pdf/file?token=bad' : fileLink});
    }
    if (target === fileLink) {
      assert.equal(opts.headers?.range, 'bytes=0-15');
      assert.equal(opts.credentials, 'include');
      return mockResponse(206, {}, {'content-range':'bytes 0-15/1000',
        'content-type':'application/pdf'});
    }
    throw Error('Unexpected network target');
  };
  const context = {URL, TextDecoder, Uint8Array, AbortSignal, performance, location,
    localStorage:{getItem:()=>session}, prompt:()=> '10.1021/jacs.6c14748',
    fetch, console:{table:v=>reports.push(v), warn:v=>warnings.push(v)},
  };
  await vm.runInNewContext(source, context, {timeout:1500});
  assert(!JSON.stringify(reports).includes(session), 'Bearer printed');
  assert(!JSON.stringify(reports).includes(fileLink), 'Signed file URL printed');
  assert(!JSON.stringify(reports).includes('10.1021/jacs.6c14748'), 'DOI printed');
  if (kind === 'success') {
    assert.equal(calls.length,3);
    assert.equal(reports[0].authorizeHTTP,200);
    assert.equal(reports[0].fileHTTP,206);
    assert.equal(reports[0].range206,true);
    assert.equal(reports[0].pdfMagic,true);
  } else if (kind === 'denied') {
    assert.equal(calls.length,2);
    assert.equal(reports[0].authorizeHTTP,403);
    assert.equal(reports[0].error,'private_pdf_not_entitled');
  } else if (kind === 'bad-origin') {
    assert.equal(calls.length,2);
    assert.equal(reports[0].error,'signed_url_origin_mismatch');
  } else {
    assert.equal(calls.length,0);
    assert.equal(reports.length,0);
    assert.equal(warnings.length,1);
  }
}
(async()=>{
  for(const kind of ['success','denied','bad-origin','wrong-origin']) await runCase(kind);
  console.log('PDF_OWNER_ACCEPTANCE_CANARY_PASS: authenticated Range206, denied account, untrusted URL, origin guard; no secrets logged');
})().catch(e=>{ console.error(e); process.exitCode=1; });
