import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const rawSource=await readFile('public/gallery-historical-text-pilot.user.js','utf8');
const source=rawSource.replace(
  "  if(location.hostname==='gallery.gczhouwld.com'){\n    // Historical upload sender",
  "  globalThis.__historicalDiagTest={batchDrainReports,batchReportKeys,batchQueueDiagnostic,batchRetryAllowed,batchDbOp};\n"+
  "  if(location.hostname==='gallery.gczhouwld.com'){\n    // Historical upload sender");
const browser=await chromium.launch({headless:true});
const doiOld=['10.1021/jacs.6c08636','10.1038/s44160-026-01100-1'];
const rows=[
  {doi:doiOld[0],date:'2026-09-14',journal:'JACS',title:'Verified old JACS'},
  {doi:doiOld[1],date:'2023-02-01',journal:'Nature Synthesis',title:'Verified old Nature'},
  {doi:'10.1002/anie.2026new',date:'2026-10-02',journal:'Angew',title:'New article'}
];
const catalog={pairedCaptureRegistry:true,webpageDoiCount:rows.length,articles:rows,generatedAt:'2026-10-12T00:00:00Z'};
try{
  const page=await browser.newPage();
  await page.route('https://gallery.gczhouwld.com/**',route=>route.fulfill({
    status:200,contentType:'text/html',body:'<!doctype html><html><body><main><h1>Gallery</h1></main></body></html>'
  }));
  await page.goto('https://gallery.gczhouwld.com/');
  await page.evaluate(registry=>{
    window.__gm={};window.__opened=[];window.__closeCount=0;window.__requests=[];window.__alerts=[];
    window.GM_getValue=(key,def)=>Object.prototype.hasOwnProperty.call(window.__gm,key)?window.__gm[key]:def;
    window.GM_setValue=(key,value)=>{window.__gm[key]=value;};
    window.GM_deleteValue=key=>{delete window.__gm[key];};
    window.GM_listValues=()=>Object.keys(window.__gm);
    window.GM_registerMenuCommand=()=>{};
    window.__postHeaders=[];window.__diagOnline=false;window.__diagAuth=true;
    window.GM_xmlhttpRequest=options=>{
      window.__requests.push({method:options.method,url:options.url});
      const url=new URL(options.url),id='a'.repeat(64);
      if(options.method==='POST'&&url.pathname==='/api/admin/historical-text/reports'){
        const payload=JSON.parse(options.data);
        window.__postHeaders.push({auth:options.headers.authorization,
          keys:Object.keys(payload),payload});
        const status=!window.__diagOnline?503:!window.__diagAuth?401:200;
        queueMicrotask(()=>options.onload({status,responseText:JSON.stringify(status===200
          ?{stored:true,eventId:payload.eventId,doi:payload.doi,
            attemptId:payload.jobId,status:payload.status,kind:payload.kind}
          :{stored:false,error:'unauthorized'})}));
        return;
      }
      let payload;
      if(url.pathname.endsWith('/release-delivery.json'))
        payload={architectureCatalogId:id,productionCards:registry.articles.length,
          dois:registry.articles.map(x=>x.doi)};
      else if(url.pathname==='/api/literature/catalog-view'){
        const old=registry.articles.filter(x=>x.date<'2026-10-01');
        const slice=url.searchParams.get('cursor')==='page2'?old.slice(1):old.slice(0,1);
        payload={readPathActive:true,enabled:true,catalogId:id,matched:old.length,
          hasMore:url.searchParams.get('cursor')!=='page2',
          nextCursor:url.searchParams.get('cursor')==='page2'?null:'page2',
          items:slice.map(x=>({doi:x.doi,revision:'b'.repeat(64),title:x.title,
            firstOnlineDate:x.date,journal:x.journal}))};
      }else throw Error('unexpected historical network request '+options.url);
      queueMicrotask(()=>options.onload({status:200,responseText:JSON.stringify(payload)}));
    };
    window.GM_openInTab=(url,opts)=>{
      window.__opened.push({url,active:opts.active});
      const submit=async()=>{
        const job=window.__gm['gallery-historical-text-batch-v2:job'];
        if(!job)return;
        const sections=[
          {type:'abstract',heading:'Abstract',text:'An unusual reaction is described with yields, scope and synthesis.'},
          {type:'mechanism',heading:'Mechanistic Studies',text:'Ligand-to-metal charge transfer (LMCT) in electrosynthetic transformations.'}
        ];
        const canonical=sections.map(s=>s.heading+'\n'+s.text).join('\n');
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
        const sha=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
        const packet={schemaVersion:'gallery-historical-local-text-pilot-v1',doi:job.doi,
          publication:job.publication,journal:job.journal,title:job.title,sourceSha256:sha,
          rightsStatus:'local_only_permission_to_be_verified',publicUploadAllowed:false,
          pdfDownloaded:false,mediaDownloaded:false,sections,captions:[],tables:[]};
        window.__gm['gallery-historical-text-batch-v2:result']={
          runId:job.runId,token:job.token,doi:job.doi,status:'ok',packet,sourceSha256:sha};
      };
      setTimeout(()=>{void submit()},30);
      return {close(){window.__closeCount++;}};
    };
    window.confirm=()=>true;
    window.alert=message=>window.__alerts.push(String(message));
  },catalog);
  await page.addScriptTag({content:source});
  const start=page.getByRole('button',{name:'一键补抓全部缺项'});
  assert.equal(await start.count(),1);
  await start.click();
  await page.waitForFunction(()=>window.__gm['gallery-historical-text-batch-v2:state']?.state==='finished',null,{timeout:22000});
  const status=await page.evaluate(()=>({
    state:window.__gm['gallery-historical-text-batch-v2:state'],
    opened:window.__opened,closed:window.__closeCount,
    requests:window.__requests,
    remainingJob:window.__gm['gallery-historical-text-batch-v2:job']||null
  }));
  assert.equal(status.opened.length,2,'all pre-Oct DOI must be processed without explicit per-DOI action');
  assert.equal(status.closed,2,'only one worker tab active at a time and closed afterward');
  assert.equal(status.state.saved,2);
  assert.equal(status.state.attempted,2);
  assert.equal(status.state.rightsPending,0);
  assert.equal(status.remainingJob,null);
  assert.ok(status.opened.every(x=>x.active===false&&x.url.startsWith('https://doi.org/')));
  assert.equal(status.requests.length,3);
  assert.ok(status.requests.every(x=>x.method==='GET'));
  assert.equal(new URL(status.requests[0].url).pathname,'/release-delivery.json');
  assert.ok(status.requests.slice(1).every(x=>
    new URL(x.url).pathname==='/api/literature/catalog-view'
    &&new URL(x.url).searchParams.get('dateTo')==='2026-09-30'));
  assert.equal(status.requests.some(x=>x.url.includes('toc-demand-live')),false);
  const search=page.getByPlaceholder('检索本机正文（LMCT/CO₂等）');
  await search.fill('LMCT');
  await search.press('Enter');
  await page.getByText(doiOld[0]+' · Mechanistic Studies').waitFor({timeout:5000});
  await start.click();
  await page.waitForFunction(()=>window.__gm['gallery-historical-text-batch-v2:state']?.state==='finished'
    && window.__gm['gallery-historical-text-batch-v2:state']?.attempted===0,null,{timeout:10000});
  const count=await page.evaluate(()=>window.__opened.length);
  assert.equal(count,2,'repeated one click should not reopen confirmed indexed DOI');

  // The browser-side outbox is durable before a token is configured.
  const pendingBefore=await page.evaluate(()=>__historicalDiagTest.batchReportKeys().length);
  assert.equal(pendingBefore,2,'one terminal diagnostic receipt per DOI must be queued');
  await page.getByRole('button',{name:'配置诊断上报'}).click();
  const secret=page.getByPlaceholder('本机管理员 Bridge 上报密钥');
  await secret.fill('local-fixture-value-012345');
  await page.getByRole('button',{name:'保存并上传诊断'}).click();
  await page.waitForFunction(()=>window.__gm['gallery-historical-text-batch-v2:diagnostics-state-v1']?.state==='retry',
    null,{timeout:4000});
  const rejected=await page.evaluate(()=>__historicalDiagTest.batchReportKeys().length);
  assert.equal(rejected,2,'network failure never discards queued reports');
  await page.evaluate(async()=>{
    window.__diagOnline=true;
    const queued=window.__historicalDiagTest.batchReportKeys();
    for(const key of queued){const item=window.__gm[key];item.nextAt=0;window.__gm[key]=item;}
    await window.__historicalDiagTest.batchDrainReports();
  });
  const ack=await page.evaluate(()=>({
    pending:__historicalDiagTest.batchReportKeys().length,
    receipts:window.__gm['gallery-historical-text-batch-v2:diagnostics-acks-v1'],
    reports:window.__postHeaders,
    state:window.__gm['gallery-historical-text-batch-v2:diagnostics-state-v1']
  }));
  assert.equal(ack.pending,0,'authenticated receipt must drain outbox');
  assert.ok(ack.receipts[doiOld[0]]&&ack.receipts[doiOld[1]]);
  assert.equal(ack.state.state,'delivered');
  assert.ok(ack.reports.every(x=>x.auth==='Bearer local-fixture-value-012345'));
  for(const entry of ack.reports){
    assert.ok(!entry.keys.some(key=>/text|body|cookie|password|token|url|pdf|figure/i.test(key)));
  }

  // A 401 must not produce a false acknowledgement or discard the report.
  const ownerDenied=await page.evaluate(async()=>{
    const job={runId:'a'.repeat(24),token:'b'.repeat(24),doi:'10.1021/jacs.6c12345'};
    window.__diagAuth=false;
    __historicalDiagTest.batchQueueDiagnostic(job,'final_result','failed','publisher_wait',
      'publisher_no_response',{pageDoiVerified:false});
    await new Promise(resolve=>setTimeout(resolve,50));
    const pending=__historicalDiagTest.batchReportKeys();
    return {pending:pending.length,state:window.__gm['gallery-historical-text-batch-v2:diagnostics-state-v1'].state,
      denied:window.__postHeaders.some(x=>x.payload.doi===job.doi)};
  });
  assert.equal(ownerDenied.pending,1);
  assert.equal(ownerDenied.state,'auth_failed');
  assert.equal(ownerDenied.denied,true);

  // A per-paper failure is visibly reviewable without any server connection.
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('gallery-historical-text-local-v2',1);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await __historicalDiagTest.batchDbOp(db,'attempts','put',{
      doi:'10.1021/jacs.6c12345',journal:'JACS',status:'timeout',reasonCode:'publisher_no_response',
      stage:'publisher_wait',checkedAt:Date.now(),httpStatus:null,pageDoiVerified:false
    });
    db.close();
  });
  await page.getByRole('button',{name:'失败详情'}).click();
  await page.getByText('10.1021/jacs.6c12345').waitFor({timeout:4000});
  assert.ok((await page.locator('#osg-historical-batch').innerText())
    .includes('出版社标签页未回传'));

  const pdfPage=await browser.newPage();
  await pdfPage.route('https://gallery.gczhouwld.com/**',route=>route.fulfill({
    status:200,contentType:'text/html',body:'<!doctype html><html><body><h1>PDF reader</h1></body></html>'
  }));
  await pdfPage.goto('https://gallery.gczhouwld.com/pdf/');
  await pdfPage.addScriptTag({content:source});
  assert.equal(await pdfPage.locator('#osg-historical-batch').count(),0,
    'historical batch must not overlay private PDF reader');
  await pdfPage.close();
  console.log('HISTORICAL_TEXT_BATCH_BROWSER_PASS '+JSON.stringify({
    uniqueHistorical:2,filesSaved:status.state.saved,closed:status.closed,
    publisherTabsForeground:false,officialCatalogReads:status.requests.length,otherMediaRequests:0,repeatOpened:0,localSearch:true,pdfReaderOverlay:false,serverReceipts:2,unauthorizedOutboxRetained:true,localFailureDetails:true
  }));
}finally{await browser.close();}
