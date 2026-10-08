/**
 * One-shot production smoke using a random, short-lived synthetic account.
 * This is authorized troubleshooting, NOT a production PDF entitlement
 * change for any real user. A deterministic run ID permits final cleanup.
 * Never print user tokens, hashes, R2 keys, signed URLs, file contents or SQL.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const doi = String(process.env.PDF_TEST_DOI||'10.1021/acs.orglett.6c03725').trim().toLowerCase();
if(!/^10\.\d{4,9}\/\S+$/.test(doi)||doi.length>300)throw Error('test_doi_invalid');
const expectedMissing=process.env.PDF_EXPECT_MISSING==='1';
const db = 'organic-synthesis-gallery';
const workerCwd = 'cloudflare/worker';
const wrangler = workerCwd + '/node_modules/.bin/wrangler';
const urls = [
  'https://api.gczhouwld.com',
  'https://organic-synthesis-gallery.zhou526316.workers.dev',
];
const origin = 'https://gallery.gczhouwld.com';
const runId = String(process.env.GITHUB_RUN_ID || '');
if (!/^\d{7,18}$/.test(runId)) throw new Error('github_run_context_required');
const batchSuffix = /^\d$/.test(String(process.env.JOURNAL_BATCH||'')) ? '_j'+String(process.env.JOURNAL_BATCH) : '';
const userId = 'pdf_auth_smoke_' + runId + batchSuffix;
const quote = x => "'" + String(x).replaceAll("'","''") + "'";
const elapsed = since => Math.round(performance.now() - since);
const sleep = n => new Promise(r=>setTimeout(r,n));
const report = {
  schemaVersion: 1, suite: 'private-pdf-authorized-runtime',
  doi, checkedAt: new Date().toISOString(),
  vantagePoint: 'GitHub Actions, not user browser/network',
  syntheticAccountOnly: true, realUserPermissionsUnchanged: true,
  tests: [], cleanupVerified: false,
};
function sql(command,label,{timeout=35000}={}) {
  const begin=performance.now();
  const p=spawnSync(wrangler,
    ['d1','execute',db,'--remote','--command',command,'--json'],
    { cwd: process.cwd(), encoding:'utf8',timeout,maxBuffer:2*1024*1024,
      stdio:['ignore','pipe','pipe'],env:process.env });
  if(p.status!==0) throw new Error(label + (p.error?.code==='ETIMEDOUT'?'_timeout':'_failed'));
  const json=JSON.parse(p.stdout);
  const groups=Array.isArray(json)?json:[json];
  if(groups.some(v=>v.success===false)) throw new Error(label+'_rejected');
  const rows=groups.flatMap(v=>Array.isArray(v.results)?v.results:[]);
  return {rows,elapsedMs:elapsed(begin)};
}
function mark(name,fields){report.tests.push({name,...fields});}
function cleanup() {
  // Owner-only original rows never match the exact synthetic ID. No
  // wildcard, prefix deletion or bulk account cleanup is permitted.
  const id=quote(userId);
  sql('DELETE FROM private_pdf_access_tokens WHERE user_id='+id+';'+
    'DELETE FROM user_capabilities WHERE user_id='+id+';'+
    'DELETE FROM user_sessions WHERE user_id='+id+';'+
    'DELETE FROM users WHERE id='+id+';','synthetic_cleanup');
  const v=sql('SELECT (SELECT COUNT(*) FROM users WHERE id='+id+') + '+
    '(SELECT COUNT(*) FROM user_sessions WHERE user_id='+id+') + '+
    '(SELECT COUNT(*) FROM user_capabilities WHERE user_id='+id+') + '+
    '(SELECT COUNT(*) FROM private_pdf_access_tokens WHERE user_id='+id+
    ') AS remaining;','synthetic_cleanup_verify');
  if(Number(v.rows[0]?.remaining)!==0) throw new Error('synthetic_cleanup_incomplete');
  report.cleanupVerified=true;
}
if(process.argv[2]==='--cleanup') {
  try { cleanup(); console.log('PRIVATE_PDF_AUTH_CLEANUP '+JSON.stringify({ok:true})); }
  catch { console.log('PRIVATE_PDF_AUTH_CLEANUP '+JSON.stringify({ok:false})); process.exitCode=1; }
} else {
  let inserted=false;
  const ownerToken=randomBytes(32).toString('hex');
  const tokenHash=createHash('sha256').update(ownerToken).digest('hex');
  const now=Date.now();
  async function fileSample(source,full) {
    const begin=performance.now();
    const signedUrl=new URL(source.url);
    if (!urls.includes(signedUrl.origin) ||
        signedUrl.pathname!=='/api/user-ui/private-pdf/file' ||
        !/^v2\./.test(signedUrl.searchParams.get('token')||'') ||
        signedUrl.searchParams.get('download')==='1') {
      throw new Error('signed_file_url_invalid');
    }
    const response=await fetch(signedUrl, {
      method:'GET',headers:full?{origin}:{origin,range:'bytes=0-15'},
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000),
    });
    const responseMs=elapsed(begin);
    if(response.status !==(full?200:206))throw new Error('file_http_unexpected');
    if(!String(response.headers.get('content-type')||'').startsWith('application/pdf'))
      throw new Error('file_type_invalid');
    if(response.headers.get('access-control-allow-origin')!==origin)
      throw new Error('file_cors_invalid');
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(new TextDecoder('latin1').decode(bytes.subarray(0,5))!=='%PDF-')
      throw new Error('file_header_invalid');
    return {bytes,networkMs:responseMs,totalMs:elapsed(begin)};
  }
  async function authorize(base,label) {
    const target=base+'/api/user-ui/private-pdf/open?doi='+encodeURIComponent(doi)+'&mode=view';
    const begin=performance.now();
    const response=await fetch(target,{
      method:'POST',headers:{origin,authorization:'Bearer '+ownerToken},
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(16000),
    });
    const responseMs=elapsed(begin);
    if(response.status!==200)throw new Error(label+'_authorize_http_'+response.status);
    if(response.headers.get('access-control-allow-origin')!==origin)
      throw new Error(label+'_authorize_cors_invalid');
    const serverTiming=(response.headers.get('server-timing')||'')
      .split(',').map(x=>x.trim()).flatMap(x=>{
        const hit=/^([a-z0-9_]+);dur=(\d{1,6})$/.exec(x);
        return hit?[{name:hit[1],ms:Number(hit[2])}]:[];
      }).filter(x=>['session','capability','document','r2_get','r2_body','ticket_create','ticket_check','total'].includes(x.name));
    const data=await response.json();
    if(!data?.available || !data?.headerVerified ||
        !Number.isSafeInteger(Number(data.byteLength)))throw new Error(label+'_authorize_response_invalid');
    mark(label+'_authenticated_open',{
      http:response.status,responseMs,totalMs:elapsed(begin),
      sizeBytes:Number(data.byteLength),serverTiming,
    });
    return data;
  }
  async function verifyRealBrowser(session) {
    const { chromium } = await import('playwright');
    const launchStart = performance.now();
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: 'zh-CN',
        serviceWorkers: 'block',
      });
      await context.addInitScript(({targetOrigin,sessionKey,sessionToken}) => {
        if(location.origin===targetOrigin) localStorage.setItem(sessionKey,sessionToken);
      },{
        targetOrigin:origin,sessionKey:'organic-gallery-session-v1',sessionToken:session,
      });
      const page = await context.newPage();
      const began = performance.now();
      await page.goto(origin+'/pdf/?doi='+encodeURIComponent(doi),{
        waitUntil:'domcontentloaded',timeout:12000,
      });
      let response = 'pending';
      try {
        await page.waitForFunction(()=>{
          const state=document.documentElement.dataset.privatePdfViewer||'';
          return state==='ready'||state==='error';
        },null,{timeout:25000});
        response = 'terminal';
      } catch { response='timeout'; }
      // Whitelist only machine numeric diagnostics and static status codes:
      // never log HTML, text, request URLs, cookie, account or localStorage.
      const safe = await page.evaluate(()=>{
        const d=document.documentElement.dataset;
        const status=(d.privatePdfViewer||'').slice(0,20);
        const error=(d.privatePdfError||'').replace(/[^a-z0-9_]/gi,'').slice(0,60);
        const number=(field)=>{
          const v=d[field]||'';
          return /^\d{1,9}$/.test(v)?Number(v):null;
        };
        return {
          status, error,
          authorizationMs:number('privatePdfAuthorizeMs'),
          readyMs:number('privatePdfReadyMs'),
          fileTransferMs:number('privatePdfTransferMs'),
          networkRangeCount:number('privatePdfRangeCalls'),
          firstPageRendered:document.querySelector('#pdf-canvas')?.dataset.renderedPage==='1',
          successRoute:['primary','backup'].includes(d.privatePdfAuthorizePath||'')
            ?d.privatePdfAuthorizePath:'unknown',
        };
      });
      mark('real_gallery_chromium_page',{
        result:response,totalMs:elapsed(began),browserLaunchMs:elapsed(launchStart)-elapsed(began),
        ...safe,
      });
      if(response!=='terminal'||safe.status!=='ready'||!safe.firstPageRendered)
        throw new Error('real_gallery_browser_not_readable');
    } finally {
      await browser.close();
    }
  }

  try {
    const beforehand=sql('SELECT COUNT(*) AS n FROM users WHERE id='+quote(userId)+';','preflight');
    if(Number(beforehand.rows[0]?.n)!==0)throw new Error('synthetic_id_collision');
    const inserts=[
      'INSERT INTO users(id,display_name,created_at,updated_at) VALUES('+
       quote(userId)+",'Isolated PDF diagnostic',"+now+','+now+');',
      'INSERT INTO user_sessions(token_hash,user_id,created_at,expires_at) VALUES('+
        quote(tokenHash)+','+quote(userId)+','+now+','+(now+120000)+');',
      'INSERT INTO user_capabilities(user_id,capability,granted_at,granted_by) VALUES('+
        quote(userId)+",'private_pdf_read',"+now+",'synthetic_diagnostic');",
    ];
    sql(inserts.join('\n'),'setup_synthetic');
    inserted=true;
    mark('synthetic_setup',{ok:true,ttlSeconds:120});

    if(expectedMissing){
      const since=performance.now();
      const response=await fetch(urls[0]+'/api/user-ui/private-pdf/open?doi='+encodeURIComponent(doi)+'&mode=view',{
        method:'POST',headers:{origin,authorization:'Bearer '+ownerToken},
        cache:'no-store',redirect:'error',signal:AbortSignal.timeout(16000),
      });
      const body=await response.json();
      if(response.status!==200||body.available!==false||body.url)
        throw Error('expected_absent_pdf_not_confirmed');
      mark('expected_missing_pdf_not_stored',{http:200,available:false,networkMs:elapsed(since),
        reason:String(body.reason||'unavailable').replace(/[^a-z0-9_]/gi,'').slice(0,60)});
    }else{
    const sources=[];
    for(let i=0;i<urls.length;i++){
      const label=i?'alternate':'canonical';
      const v=await authorize(urls[i],label);
      const part=await fileSample(v,false);
      mark(label+'_first16bytes',{http:206,totalMs:part.totalMs,sizeBytes:part.bytes.length});
      sources.push(v);
    }
    if(process.env.RUN_GALLERY_BROWSER==='1') await verifyRealBrowser(ownerToken);
    const full=await fileSample(sources[0],true);
    mark('canonical_full_download',{http:200,totalMs:full.totalMs,
      networkMs:full.networkMs,bytes:full.bytes.length});
    const {rows}=sql('SELECT byte_length,content_hash FROM private_pdf_documents WHERE doi='+
      quote(doi)+" AND active=1 AND processing_state='ready' ORDER BY CASE version_kind WHEN 'version_of_record' THEN 4 WHEN 'accepted_manuscript' THEN 3 WHEN 'preprint' THEN 2 ELSE 1 END DESC, captured_at DESC LIMIT 1;",
      'metadata_compare');
    const expected=rows[0]||null;
    if(!expected || Number(expected.byte_length)!==full.bytes.length ||
       createHash('sha256').update(full.bytes).digest('hex')!==expected.content_hash)
      throw new Error('live_full_bytes_metadata_mismatch');
    let task=null;
    const started=performance.now();
    try {
      task=getDocument({data:full.bytes,disableRange:true,disableStream:true,
        disableAutoFetch:true,isEvalSupported:false,verbosity:0});
      const document=await task.promise;
      const pg=await document.getPage(1);
      await pg.getTextContent();
      mark('pdfjs_first_page',{ok:true,pageCount:document.numPages,parseMs:elapsed(started)});
    } finally {try {await task?.destroy()} catch {}}
    } // end expected-ready read and browser test
  } catch(err) {
    report.failure=String(err?.message||'unknown').replace(/[^a-z0-9_]/gi,'_').slice(0,120);
    process.exitCode=1;
  } finally {
    // Avoid permanent test entitlement even if the primary route fails.
    try { cleanup(); }
    catch { report.cleanupVerified=false;process.exitCode=1; }
    report.ok=!report.failure&&report.cleanupVerified&&report.tests.length >=
      (expectedMissing?2:(process.env.RUN_GALLERY_BROWSER==='1'?8:6));
    if(!report.ok)process.exitCode=1;
    console.log('PRIVATE_PDF_AUTHORIZED_RESULT '+JSON.stringify(report));
  }
}
