import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const rawSource=await readFile('public/gallery-historical-text-pilot.user.js','utf8');
const source=rawSource.replace(
  "  if(location.hostname==='gallery.gczhouwld.com'){\n    // Historical upload sender",
  "  globalThis.__historicalDiagTest={batchDrainReports,batchReportKeys,batchQueueDiagnostic,batchRetryAllowed,batchDbOp,batchParseOfficialOa,batchOfficialOaGet};\n"+
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
    window.__registry=registry;
    window.GM_getValue=(key,def)=>Object.prototype.hasOwnProperty.call(window.__gm,key)?window.__gm[key]:def;
    window.GM_setValue=(key,value)=>{window.__gm[key]=value;};
    window.GM_deleteValue=key=>{delete window.__gm[key];};
    window.GM_listValues=()=>Object.keys(window.__gm);
    window.GM_registerMenuCommand=()=>{};
    window.__postHeaders=[];window.__diagOnline=false;window.__diagAuth=true;
    window.GM_xmlhttpRequest=options=>{
      window.__requests.push({method:options.method,url:options.url});
      const url=new URL(options.url),id='a'.repeat(64);
      if(options.method==='GET'&&url.pathname==='/api/admin/historical-text/reports'){
        const at=Date.now(),first=registry.articles[0].doi,second=registry.articles[1].doi;
        const events=[
          {doi:first,jobId:'hist_mock_capture_1',kind:'failure_checkpoint',
            reasonCode:'page_http_error',stage:'publisher_page',httpStatus:403,
            pageDoiVerified:true,evidenceChars:0,receivedAt:at-30},
          {doi:first,jobId:'hist_mock_capture_1',kind:'final_result',
            reasonCode:'page_http_error',stage:'publisher_page',httpStatus:403,
            pageDoiVerified:true,evidenceChars:0,receivedAt:at-15},
          {doi:second,jobId:'hist_mock_capture_2',kind:'final_result',
            reasonCode:'license_not_verified',stage:'license',httpStatus:null,
            pageDoiVerified:true,evidenceChars:0,receivedAt:at-5},
        ];
        queueMicrotask(()=>options.onload({status:200,
          responseText:JSON.stringify({schemaVersion:'historical-text-diagnostic-v1',
            count:events.length,hasMore:false,items:events})}));
        return;
      }
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
      // Official DOI-exact public XML source simulation: this contains no
      // publisher visit, PDF, private media upload or bypassed subscription.
      if(url.hostname==='www.ebi.ac.uk'){
        const doi=url.searchParams.get('query')?.replace(/^DOI:/,'')||'';
        const isOctOa=doi==='10.1002/anie.2026new';
        if(url.pathname.endsWith('/search')){
          const result=isOctOa?[{doi,pmcid:'PMC123456',isOpenAccess:'Y'}]:[];
          queueMicrotask(()=>options.onload({status:200,
            responseText:JSON.stringify({resultList:{result}})}));
          return;
        }
        if(url.pathname.endsWith('/PMC123456/fullTextXML')){
          const article='10.1002/anie.2026new';
          const science='A stereodefined organic synthetic approach functionalizes complex molecular building blocks under controlled conditions with isolated products. '.repeat(5);
          const xml='<?xml version="1.0"?><article xmlns:xlink="http://www.w3.org/1999/xlink"><front><article-meta>'+
            '<article-id pub-id-type="doi">'+article+'</article-id>'+
            '<permissions><license xlink:href="https://creativecommons.org/licenses/by/4.0/">'+
            '<license-p>This article is licensed under Creative Commons Attribution 4.0 International.</license-p>'+
            '</license></permissions></article-meta></front>'+
            '<body><sec><title>Results and discussion</title><p>'+science+'</p><p>'+science+
            '</p></sec><sec><title>Conclusion</title><p>'+science+
            '</p></sec><fig id="fig1"><caption><p>Verified synthetic reaction scope summary</p></caption></fig>'+
            '</body></article>';
          queueMicrotask(()=>options.onload({status:200,responseText:xml,
            finalUrl:options.url}));
          return;
        }
        throw Error('unexpected OA endpoint '+options.url);
      }
      let payload;
      if(url.pathname.endsWith('/release-delivery.json'))
        payload={architectureCatalogId:id,productionCards:registry.articles.length,
          dois:registry.articles.map(x=>x.doi)};
      else if(url.pathname==='/api/literature/catalog-view'){
        const all=!url.searchParams.has('dateTo');
        const old=all?registry.articles:registry.articles.filter(x=>x.date<'2026-10-01');
        const slice=all?old:(url.searchParams.get('cursor')==='page2'?old.slice(1):old.slice(0,1));
        payload={readPathActive:true,enabled:true,catalogId:id,matched:old.length,
          hasMore:!all&&url.searchParams.get('cursor')!=='page2',
          nextCursor:!all&&url.searchParams.get('cursor')!=='page2'?'page2':null,
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
  await page.getByText(doiOld[0]+' · 正文 · Mechanistic Studies').waitFor({timeout:5000});
  await start.click();
  await page.waitForFunction(()=>window.__gm['gallery-historical-text-batch-v2:state']?.state==='finished'
    && window.__gm['gallery-historical-text-batch-v2:state']?.attempted===0,null,{timeout:10000});
  const count=await page.evaluate(()=>window.__opened.length);
  assert.equal(count,2,'repeated one click should not reopen confirmed indexed DOI');
  assert.equal(await page.getByRole('button',{name:'抽查 ACS 许可项（最多10篇）'}).count(),1);
  await page.getByRole('button',{name:'抽查 ACS 许可项（最多10篇）'}).click();
  assert.equal(await page.evaluate(()=>window.__opened.length),2,
    'targeted ACS sample does not revisit saved or never-failed articles');

  await page.getByRole('button',{name:'全库正文覆盖'}).click();
  await page.getByText('正式目录 3 篇；已核实日期的历史 DOI 2 篇').waitFor({timeout:5000});
  assert.ok((await page.locator('#osg-historical-batch').innerText())
    .includes('本机已存科学正文 2 篇；从未访问 0 篇'));


  // Browser OA path reuses the same DOI-local search store and scans ALL
  // formally published dates, including October. One click has no 20-DOI cap.
  const sourceRunsBefore=await page.evaluate(()=>window.__requests.length);
  const oaButton=page.getByRole('button',{name:'全库开放正文补抓（本机）'});
  assert.equal(await oaButton.count(),1);
  await oaButton.click();
  await page.waitForFunction(()=>window.__gm['gallery-historical-text-batch-v2:state']?.state==='finished'
    &&window.__gm['gallery-historical-text-batch-v2:state']?.source==='europe_pmc_oa',
    null,{timeout:18000});
  const oaReport=await page.evaluate(async(sourceRunsBefore)=>{
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('gallery-historical-text-local-v2',2);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    const records=await Promise.all(['packets','oaAttempts'].map(store=>new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readonly');
      const req=tx.objectStore(store).get('10.1002/anie.2026new');
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
    })));
    db.close();
    return {state:window.__gm['gallery-historical-text-batch-v2:state'],
      newPacket:records[0]?.packet,attempt:records[1],
      requests:window.__requests.slice(sourceRunsBefore),
      publisherTabs:window.__opened.length};
  },sourceRunsBefore);
  assert.equal(oaReport.state.attempted,1,'only the unsaved October DOI is scanned');
  assert.equal(oaReport.state.saved,1);
  assert.equal(oaReport.publisherTabs,2,'OA path must never open new publisher tabs');
  assert.equal(oaReport.attempt.status,'saved_local');
  assert.equal(oaReport.newPacket.doi,'10.1002/anie.2026new');
  assert.equal(oaReport.newPacket.publisher,'europe_pmc_oa');
  assert.equal(oaReport.newPacket.publicUploadAllowed,false);
  assert.equal(oaReport.newPacket.mediaDownloaded,false);
  assert.equal(oaReport.newPacket.pdfDownloaded,false);
  assert.ok(oaReport.newPacket.sourceXmlSha256.length===64);
  assert.ok(oaReport.newPacket.sections.length>=2);
  assert.ok(oaReport.requests.some(x=>new URL(x.url).pathname==='/api/literature/catalog-view'
    &&!new URL(x.url).searchParams.has('dateTo')));
  assert.ok(oaReport.requests.some(x=>new URL(x.url).hostname==='www.ebi.ac.uk'));
  assert.ok(!oaReport.requests.some(x=>x.method!=='GET'
    ||/\/api\/(?:article-figures|private-pdf|media\/|admin\/literature-body-sections)/.test(x.url)));

  const oaRejected=await page.evaluate(async()=>{
    const article='10.1002/anie.2026new';
    const paper={doi:article,date:'2026-10-13',journal:'Angew',title:'Original article'};
    const base='<?xml version="1.0"?><article xmlns:xlink="http://www.w3.org/1999/xlink">'+
      '<front><article-meta><article-id pub-id-type="doi">'+article+'</article-id>'+
      '<permissions><license xlink:href="https://creativecommons.org/licenses/by/4.0/">'+
      'This article is licensed CC BY.</license></permissions></article-meta></front>'+
      '<body><sec><title>Results</title><p>'+
      'Synthetic methods and reaction scopes need complete scientific identity verification. '.repeat(9)+
      '</p><p>Reproducible reaction procedures and control evidence. '.repeat(5)+
      '</p></sec></body></article>';
    const wrong=base.replace(article,'10.1002/anie.not-the-article');
    const nc=base.replaceAll('creativecommons.org/licenses/by/4.0',
      'creativecommons.org/licenses/by-nc-nd/4.0');
    const errors=[];
    for(const xml of [wrong,nc]){
      try{await __historicalDiagTest.batchParseOfficialOa(xml,paper,'PMC123456');errors.push('unexpected_pass');}
      catch(e){errors.push(String(e.message));}
    }
    return errors;
  });
  assert.deepEqual(oaRejected,['oa_xml_doi_mismatch','oa_license_restricted'],
    'wrong DOI or NC-ND content must be rejected before local storage');

  await search.fill('stereodefined');
  await search.press('Enter');
  await page.getByText('10.1002/anie.2026new · 正文 · Results and discussion').waitFor({timeout:5000});

  // A real local DOI corpus may have more than 20 matches. Count ALL and page
  // the display; do not silently claim only 20 relevant science articles exist.
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('gallery-historical-text-local-v2',2);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('packets','readwrite');
      const store=tx.objectStore('packets');
      for(let i=0;i<25;i++){
        const doi='10.1021/jacs.local-body-'+i;
        store.put({doi,packet:{doi,sections:[
          {type:'mechanism',heading:'Mechanistic Studies',text:'The LMCT pathway was probed experimentally.'}
        ],captions:[],tables:[]}});
      }
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();
  });
  await search.fill('LMCT');
  await search.press('Enter');
  await page.getByText(/本机正文命中 27 篇/).waitFor({timeout:5000});
  await page.getByRole('button',{name:/显示更多命中（剩余 7 篇）/}).click();
  const localLinks=page.locator('#osg-historical-batch a[href^="https://doi.org/"]');
  assert.equal(await localLinks.count(),27,'every local matching DOI remains accessible via pagination');

  // The browser-side outbox is durable before a token is configured.
  assert.equal(await page.getByRole('button',{name:'跨期刊正文证据核验（12篇）'}).count(),1);
  await page.getByRole('button',{name:'跨期刊正文证据核验（12篇）'}).click();
  assert.equal(await page.evaluate(()=>window.__opened.length),2,
    'journal-balanced pilot must not reopen already saved articles');
  const pendingBefore=await page.evaluate(()=>__historicalDiagTest.batchReportKeys().length);
  assert.equal(pendingBefore,2,'one terminal diagnostic receipt per DOI must be queued');
  await page.getByRole('button',{name:'配置诊断密钥'}).click();
  const secret=page.getByPlaceholder('本机管理员 Bridge 上报密钥');
  await secret.fill('local-fixture-value-012345');
  await page.getByRole('button',{name:'保存并上传诊断'}).click();
  assert.equal(await page.getByRole('button',{name:'更换诊断密钥'}).count(),1,
    'key is saved locally; next report must not ask for another key');
  assert.equal(await secret.isVisible(),false,'secret field is hidden after saving');
  assert.ok((await page.locator('#osg-historical-batch').innerText()).includes('诊断密钥：已保存'));
  await page.waitForFunction(()=>window.__gm['gallery-historical-text-batch-v2:diagnostics-state-v1']?.state==='retry',
    null,{timeout:4000});
  const rejected=await page.evaluate(()=>__historicalDiagTest.batchReportKeys().length);
  assert.equal(rejected,2,'network failure never discards queued reports');
  await page.evaluate(()=>{window.__diagOnline=true;});
  await page.getByRole('button',{name:'立即上传待发诊断'}).click();
  await page.waitForFunction(()=>window.__historicalDiagTest.batchReportKeys().length===0,
    null,{timeout:3000});
  assert.equal(await secret.isVisible(),false,'manual upload reused persisted key, not new prompt');
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
      const req=indexedDB.open('gallery-historical-text-local-v2',2);
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

  // Server response shows 3 events but only 2 DOI attempts, with HTTP proof.
  await page.evaluate(()=>{window.__diagAuth=true;});
  await page.getByRole('button',{name:'服务器报告'}).click();
  await page.getByText(/服务器返回 3 条事件，归并 2 次尝试／2 篇 DOI/).waitFor({timeout:4000});
  const serverSummaries=await page.locator('#osg-historical-batch details summary').allTextContents();
  assert.equal(serverSummaries.length,2,'checkpoint+final for one job must appear as one attempt');
  assert.ok(serverSummaries.some(x=>x.includes('HTTP 403')&&x.includes('最终结果')));
  assert.ok(serverSummaries.some(x=>x.includes('HTTP 未知')&&x.includes('license_not_verified')));

  // Opt-in handshake pilot: two previously unconfirmed ACS publisher jobs.
  // Confirm one tries the official ACS article URL and one the DOI resolver.
  await page.evaluate(async()=>{
    const additions=[
      {doi:'10.1021/jacs.test-reachability-a',date:'2026-09-11',journal:'JACS',title:'ACS no-response A'},
      {doi:'10.1021/jacs.test-reachability-b',date:'2026-09-12',journal:'JACS',title:'ACS no-response B'}
    ];
    window.__registry.articles.push(...additions);
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('gallery-historical-text-local-v2',2);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    for(const entry of additions){
      await window.__historicalDiagTest.batchDbOp(db,'attempts','put',{
        doi:entry.doi,journal:entry.journal,status:'publisher_no_response',
        stage:'publisher_wait',pageDoiVerified:false,httpStatus:null,checkedAt:Date.now()
      });
    }
    db.close();
  });
  const reachability=page.getByRole('button',{name:'出版社回执核验（最多8篇）'});
  assert.equal(await reachability.count(),1);
  await reachability.click();
  await page.waitForFunction(()=>window.__gm['gallery-historical-text-batch-v2:state']?.state==='finished'
    &&window.__gm['gallery-historical-text-batch-v2:state']?.attempted===2,null,{timeout:17000});
  const probes=await page.evaluate(()=>window.__opened.slice(-2).map(x=>x.url));
  assert.ok(probes[0].startsWith('https://pubs.acs.org/doi/10.1021/'),
    'direct ACS path must be a DOI-bound publisher article route');
  assert.ok(probes[1].startsWith('https://doi.org/10.1021/'),
    'control route must keep normal DOI resolver');
  assert.equal(probes.length,2,'pilot must not silently reopen the entire historical corpus');

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
    publisherTabsForeground:false,officialCatalogReads:status.requests.length,otherMediaRequests:0,repeatOpened:0,localSearch:true,pdfReaderOverlay:false,serverReceipts:2,unauthorizedOutboxRetained:true,localFailureDetails:true,serverAttemptGroups:2,persistentAdminToken:true,oneClickReupload:true,
    fullCoverageLedger:true,bodySearchAllHits:27,reachabilityProbeRoutes:2
  }));
}finally{await browser.close();}
