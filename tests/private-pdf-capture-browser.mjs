import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const runtime=await fs.readFile('scripts/tm-private-pdf-capture.inc.js','utf8');
const fi=source.indexOf('  async function finishPairedJob(job,result,trace,token) {');
const fj=source.indexOf('\n\n  function overnightRetryEligible',fi);
assert.ok(fi>0&&fj>fi,'finishPairedJob extraction failed');
const finish=source.slice(fi,fj);

const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const report={passed:0,cases:[],consoleErrors:[],pageErrors:[]};
page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});
page.on('pageerror',e=>report.pageErrors.push(String(e)));
await page.setContent('<!doctype html><meta name="citation_pdf_url" content="https://pubs.acs.org/doi/pdf/10.1021/jacs.6c12345"><a href="https://pubs.acs.org/doi/suppl/10.1021/jacs.6c12345/suppl_file/test.pdf">Supporting Information PDF</a>');
await page.evaluate(()=>{window.__gm=new Map();window.GM_getValue=(k,d)=>__gm.has(k)?__gm.get(k):d;window.GM_setValue=(k,v)=>__gm.set(k,v);window.GM_deleteValue=k=>__gm.delete(k);window.GM_listValues=()=>[...__gm.keys()];});

const harness=[
'(function(){',
"'use strict';",
"var VERSION='6.2.20';var CONTROLLER_REVISION='2.2.39';var WORKER='https://api.gczhouwld.com';var P='osg-toc-v6:';var autoReportJob=null;",
"var gmRequest=async()=>{throw new Error('transport_not_injected')};",
"function isGalleryPage(){return false}",
"function normalizeDoi(v){return String(v||'').toLowerCase().replace(/^https?:\\/\\/(?:dx\\.)?doi\\.org\\//,'').replace(/^doi:\\s*/,'').replace(/[?#].*$/,'').replace(/[).,;]+$/,'')}",
"function publisherForDoi(d){d=normalizeDoi(d);if(d.startsWith('10.1021/'))return 'acs';if(d.startsWith('10.1002/'))return 'wiley';return 'other'}",
"function normalizeUrl(v,b){try{return new URL(v,b||location.href).href}catch{return ''}}",
"function currentCaptureJob(){return true}",
"function assertBoundCaptureJob(job){return normalizeDoi(job.doi)}",
"function captureLiveError(v){return String(v||'').slice(0,180)}",
"function pushTrace(trace,row){trace.push(row);return row}",
"function traceKey(){return 'trace'};function resultKey(){return 'result'};function progressKey(){return 'progress'};",
"function enqueueCaptureReport(){return true};function nowIso(){return new Date().toISOString()}",
runtime,
finish,
"globalThis.T={privatePdfLease,privatePdfCaptureEligibleByAddedDate,privatePdfBytesValid,discoverExplicitPdfCandidates,maybeCapturePrivatePdf,finishPairedJob,PRIVATE_PDF_LEASE_KEY,PRIVATE_PDF_CAPTURE_REVISION,setGm:fn=>{gmRequest=fn},setMaybe:fn=>{maybeCapturePrivatePdf=fn}};",
'})();'
].join('\n');
await page.addScriptTag({content:harness});

async function tc(name,fn){await fn();report.passed++;report.cases.push(name);console.log('PRIVATE_PDF_TM_PASS '+name)}
try{
  await tc('citation_pdf_url wins and supporting information is excluded',async()=>{
    const rows=await page.evaluate(()=>T.discoverExplicitPdfCandidates({doi:'10.1021/jacs.6c12345',publisher:'acs'}));
    assert.equal(rows.length,1);assert.equal(rows[0].source,'citation_pdf_url');
  });
  await tc('PDF magic validator rejects HTML and accepts bounded PDF bytes',async()=>{
    const x=await page.evaluate(()=>{const good=new TextEncoder().encode('%PDF-1.7\\n'+('A'.repeat(2048))+'\\n%%EOF').buffer;const bad=new TextEncoder().encode('<html>'+('x'.repeat(2048))+'</html>').buffer;return[T.privatePdfBytesValid(good),T.privatePdfBytesValid(bad)]});
    assert.deepEqual(x,[true,false]);
  });
  await tc('lease storage expires independently',async()=>{
    const x=await page.evaluate(()=>{GM_setValue(T.PRIVATE_PDF_LEASE_KEY,{token:'A'.repeat(48),scope:'private_pdf_capture',expiresAt:Date.now()+600000});return T.privatePdfLease()});assert.equal(x.scope,'private_pdf_capture');
    const y=await page.evaluate(()=>{GM_setValue(T.PRIVATE_PDF_LEASE_KEY,{token:'A'.repeat(48),scope:'private_pdf_capture',expiresAt:Date.now()-1});return T.privatePdfLease()});assert.equal(y,null);
  });
  await tc('Oct 1 PDF eligibility is active in the isolated capture runtime',async()=>{
    assert.equal(await page.evaluate(()=>T.privatePdfCaptureEligibleByAddedDate({addedDate:'2026-10-01'})),true);
    assert.equal(await page.evaluate(()=>T.privatePdfCaptureEligibleByAddedDate({addedDate:'2026-09-30'})),false);
  });
  await tc('successful PDF side-channel stores inactive receipt',async()=>{
    const r=await page.evaluate(async()=>{GM_setValue(T.PRIVATE_PDF_LEASE_KEY,{token:'B'.repeat(48),scope:'private_pdf_capture',expiresAt:Date.now()+600000});const pdf=new TextEncoder().encode('%PDF-1.7\\n'+('A'.repeat(4096))+'\\n%%EOF').buffer;T.setGm(async o=>o.method==='GET'?{status:200,response:pdf,responseHeaders:'content-type: application/pdf',finalUrl:'https://pubs.acs.org/doi/pdf/10.1021/jacs.6c12345'}:{status:201,responseText:JSON.stringify({stored:true,doi:'10.1021/jacs.6c12345',documentId:'pdf_fixture',contentHash:'a'.repeat(64),byteLength:pdf.byteLength,active:false,requiresVerification:true})});return T.maybeCapturePrivatePdf({doi:'10.1021/jacs.6c12345',publisher:'acs',addedDate:'2026-10-01',jobId:'fixture-job-12345678'},[])});
    assert.equal(r.status,'stored');assert.equal(r.active,false);
  });
  await tc('publisher 403 stops PDF path without guessed downloads',async()=>{
    const x=await page.evaluate(async()=>{GM_setValue(T.PRIVATE_PDF_LEASE_KEY,{token:'C'.repeat(48),scope:'private_pdf_capture',expiresAt:Date.now()+600000});GM_deleteValue('osg-toc-v6:private-pdf-attempt-v1:10.1021/jacs.6c12345');let calls=[];T.setGm(async o=>{calls.push(o.url);return{status:403,response:new ArrayBuffer(0),responseHeaders:'',finalUrl:o.url}});const r=await T.maybeCapturePrivatePdf({doi:'10.1021/jacs.6c12345',publisher:'acs',addedDate:'2026-10-01',jobId:'fixture-job-12345678'},[]);return{r,calls}});
    assert.equal(x.r.status,'failed');assert.equal(x.calls.length,1);assert.match(x.r.reason,/403/);
  });
  await tc('finishPairedJob keeps media success when PDF fails',async()=>{
    const out=await page.evaluate(async()=>{T.setMaybe(async()=>({status:'failed',reason:'fixture_pdf_failure'}));return T.finishPairedJob({doi:'10.1021/jacs.6c12345',jobId:'fixture-job-12345678'},{status:'success',reason:'media_ok',figures:{discovered:0},fulltext:{status:'stored'}},[],null)});
    assert.equal(out.status,'success');assert.equal(out.privatePdf.status,'failed');
  });
  assert.equal(report.consoleErrors.length,0);assert.equal(report.pageErrors.length,0);
}finally{
  await browser.close();
  await fs.writeFile((process.env.RUNNER_TEMP||'/tmp')+'/private-pdf-capture-browser.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
