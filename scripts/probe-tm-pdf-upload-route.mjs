import fs from 'node:fs';

const targets = ['https://api.gczhouwld.com', 'https://organic-synthesis-gallery.zhou526316.workers.dev'];
const origin = 'https://pubs.rsc.org';
const checks = [];
for (const base of targets) {
  checks.push({base, name:'health', path:'/api/_healthcheck', method:'GET'});
  checks.push({base, name:'rsc_preflight', path:'/api/private-pdf/import', method:'OPTIONS', headers:{origin, 'access-control-request-method':'POST', 'access-control-request-headers':'authorization,content-type'}});
  checks.push({base, name:'rsc_invalid_lease', path:'/api/private-pdf/import', method:'POST', headers:{origin, 'content-type':'application/pdf', authorization:'Bearer diagnostic-invalid-private-pdf-lease'}, body:''});
}
const results = await Promise.all(checks.map(async check => {
  const started = Date.now();
  try {
    const response = await fetch(check.base + check.path, {method:check.method, headers:check.headers, body:check.body, redirect:'error', signal:AbortSignal.timeout(12000)});
    const raw = await response.text();
    let body = {}; try { body = JSON.parse(raw); } catch {}
    const headers = Object.fromEntries(['content-type','access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','cf-ray','retry-after'].map(k=>[k,response.headers.get(k)]));
    const corsOkay = headers['access-control-allow-origin'] === origin || headers['access-control-allow-origin'] === '*';
    const passed = check.name === 'health' ? response.status === 200 && body.privatePdf?.captureEnabled === true
      : check.name === 'rsc_preflight' ? response.status === 204 && corsOkay && /authorization/i.test(headers['access-control-allow-headers']||'') && /content-type/i.test(headers['access-control-allow-headers']||'')
      : response.status === 401 && corsOkay && body.error === 'private_pdf_capture_lease_invalid';
    return {base:check.base, name:check.name, method:check.method, durationMs:Date.now()-started, status:response.status, headers, error:body.error, privatePdf:body.privatePdf, passed};
  } catch (error) {
    return {base:check.base, name:check.name, method:check.method, durationMs:Date.now()-started, error:String(error.message), passed:false};
  }
}));
const report = {checkedAt:new Date().toISOString(), checkedSha:process.env.GITHUB_SHA||'', productionWrites:0, publisherRequests:0, validCredentialsUsed:false, note:'No PDF bytes sent. Invalid lease POST must fail before body processing or storage. This does not exercise an authenticated PDF upload or the user network.', results, passed:results.every(x=>x.passed)};
fs.writeFileSync('tm-pdf-upload-route.json', JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
