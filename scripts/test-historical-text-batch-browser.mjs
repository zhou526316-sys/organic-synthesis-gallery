import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const source=await readFile('public/gallery-historical-text-pilot.user.js','utf8');
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
    window.GM_registerMenuCommand=()=>{};
    window.GM_xmlhttpRequest=options=>{
      window.__requests.push({method:options.method,url:options.url});
      queueMicrotask(()=>options.onload({status:200,responseText:JSON.stringify(registry)}));
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
  assert.deepEqual(status.requests,[{method:'GET',url:'https://gallery.gczhouwld.com/toc-demand-live.json'}]);
  const search=page.getByPlaceholder('检索本机正文（LMCT/CO₂等）');
  await search.fill('LMCT');
  await search.press('Enter');
  await page.getByText(doiOld[0]+' · Mechanistic Studies').waitFor({timeout:5000});
  await start.click();
  await page.waitForFunction(()=>window.__gm['gallery-historical-text-batch-v2:state']?.state==='finished'
    && window.__gm['gallery-historical-text-batch-v2:state']?.attempted===0,null,{timeout:10000});
  const count=await page.evaluate(()=>window.__opened.length);
  assert.equal(count,2,'repeated one click should not reopen confirmed indexed DOI');
  console.log('HISTORICAL_TEXT_BATCH_BROWSER_PASS '+JSON.stringify({
    uniqueHistorical:2,filesSaved:status.state.saved,closed:status.closed,
    publisherTabsForeground:false,otherMediaRequests:0,repeatOpened:0,localSearch:true
  }));
}finally{await browser.close();}
