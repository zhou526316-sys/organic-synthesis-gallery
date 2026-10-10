import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const VERSION='2.2.81',INSTALL='6.2.62';
const origin='https://api.gczhouwld.com';
const targets=[['gallery','https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js'],
  ['api','https://api.gczhouwld.com/gallery-vpn-bridge.user.js']];
const report={checkedAt:new Date().toISOString(),version:VERSION,install:INSTALL,
  readOnly:true,publisherRequests:0,productionWrites:0,checks:[],passed:false};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function check(key,url){
  let last='';
  for(let i=1;i<=14;i++){
    try{
      const res=await fetch(url+'?oct1-accept='+Date.now(),{
        method:'GET',redirect:'follow',headers:{'cache-control':'no-cache'},
        signal:AbortSignal.timeout(12000)});
      assert.equal(res.status,200,'unexpected_installer_http');
      const len=Number(res.headers.get('content-length')||0);
      assert.ok(!len||len<=4_000_000,'installer_too_large');
      const raw=await res.text();
      assert.ok(raw.length<4_000_000,'installer_too_large');
      assert.match(raw,/^\/\/ ==UserScript==/);
      assert.match(raw,new RegExp('^// @version\\s+'+VERSION.replaceAll('.','\\.')+'\\s*$','m'));
      assert.ok(raw.includes("var INSTALL_REVISION = '"+INSTALL+"';"),'stale_install_revision');
      assert.ok(raw.includes("OCT1_SCOPE_QUEUE_REVISION = '20261008-added-date-only-v1'"),'scope_guard_absent');
      assert.ok(raw.includes("PRIVATE_PDF_INVENTORY_ENDPOINT = WORKER + '/api/private-pdf/capture-inventory'"),'PDF_authority_absent');
      // The user-approved Jul–Sep retrospective TOC-only branch replaced the
      // former Oct-only dispatch predicate. The old assertion was a false
      // negative even when both production installers were current.
      assert.ok(raw.includes('function tocOnlyCaptureEligible(job)'), 'historical_toc_policy_absent');
      assert.ok(raw.includes('function captureJobEligible(job)'), 'capture_split_guard_absent');
      assert.ok(raw.includes('if(!captureJobEligible(batch[i])){summary.skipped+=1;continue;}'), 'capture_dispatch_guard_absent');
      assert.ok(raw.includes('opportunisticFigures:!tocOnlyCaptureEligible(raw)'), 'historical_body_guard_absent');
      assert.ok(raw.includes('&&recentFullCaptureEligible(job);'), 'historical_pdf_guard_absent');
      const result={key,ok:true,bytes:raw.length,httpStatus:res.status,attempts:i,
        hasScope:true,hasOwnerPdf:true,historicalTocOnlyGuard:true,install:INSTALL};
      report.checks.push(result);return result;
    }catch(e){last=String(e?.message||e).slice(0,180);if(i<14)await pause(5000);}
  }
  report.checks.push({key,ok:false,error:last});
  throw new Error(key+'_installer_not_live:'+last);
}
try{
  for(const [key,url] of targets)await check(key,url);
  // No token: an unauthorized read of owner PDF availability must never work.
  const res=await fetch(origin+'/api/private-pdf/capture-inventory',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({dois:['10.1021/jacs.6c14748']}),
    signal:AbortSignal.timeout(15000)});
  assert.ok(res.status===401||res.status===403,'owner_pdf_inventory_not_private_http_'+res.status);
  report.privateInventoryDeniesAnonymous=true;
  report.passed=true;
}catch(e){report.error=String(e?.message||e).slice(0,220);process.exitCode=1;}
const out=path.join(process.env.RUNNER_TEMP||'/tmp','tm-oct1-live-acceptance.json');
await mkdir(path.dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log('TM_OCT1_INSTALLER_LIVE '+JSON.stringify(report));
