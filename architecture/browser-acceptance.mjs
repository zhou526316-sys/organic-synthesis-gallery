/** Read-only local-browser acceptance using byte-verified public fixtures. No production API writes. */
import { readFile, writeFile, mkdir, cp, symlink, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { build } from 'vite';
import { chromium, webkit } from 'playwright';
import { makeMembership } from './membership.mjs';
import { stable, digest } from './catalog.mjs';
import { gunzipSync } from 'node:zlib';
import { buildLegacyTitlePresentation } from './title-presentation.mjs';

const root=process.cwd(), shadow=path.resolve(process.argv[2] || ''), out=path.join(shadow,'validation/browser');
await mkdir(out,{recursive:true});
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const pointer=await json(path.join(shadow,'current.json')), catalog=await json(path.join(shadow,pointer.catalog.path));
const report=await json(path.join(shadow,'report.json'));
assert.equal(report.liveVerification.ok,true);
const records=(await Promise.all(catalog.shards.map(async ref=>(await json(path.join(shadow,ref.path))).records))).flat();
const life=await json(path.join(shadow,pointer.lifecycle.path));
const hashes=await json(path.join(shadow,'validation/fixtures.json')), fixtures={};
for(const [name, row] of Object.entries(hashes)) { fixtures[name]=await readFile(path.join(shadow,'validation/public',name));assert.equal(digest(fixtures[name]),row.sha256); }
const translations=JSON.parse(fixtures['title-translations-zh.json']), resolutions=JSON.parse(fixtures['paper-title-resolutions.json']);
// Build the compatibility projection from the same frozen SOURCE files, not the
// observed DOM or a hardcoded list of previously failed examples.
const precedence=['papers.gz.b64','total-synthesis.json','manual-supplement.json','final-audit-supplement.json','literature-supplement.json'];
const titleGroups=precedence.map(name=>{
  const parsed=JSON.parse(name.endsWith('.b64')?gunzipSync(Buffer.from(fixtures[name].toString().trim(),'base64')).toString():fixtures[name]);
  return Array.isArray(parsed)?parsed:parsed.papers;
});
const presentation=buildLegacyTitlePresentation(records,titleGroups,{catalogId:catalog.recordSetHash,
  sourceHashes:Object.fromEntries(precedence.map(name=>[name,hashes[name].sha256]))});
const presentationText=stable(presentation)+'\n', presentationHash=digest(presentationText);
const presentationRef={path:`validation/title-presentation.${presentationHash}.json`,sha256:presentationHash,bytes:Buffer.byteLength(presentationText)};
await writeFile(path.join(shadow,presentationRef.path),presentationText);
console.log('GALLERY_TITLE_COMPATIBILITY '+JSON.stringify({overrides:Object.keys(presentation.overrides).length,
  canonicalRecordsModified:false,presentationSha256:presentationHash}));

const work=await mkdtemp(path.join(tmpdir(),'gallery-browser-parity-'));
for(const name of ['src','shared','public','index.html','package.json']) await cp(path.join(root,name),path.join(work,name),{recursive:true});
await symlink(path.join(root,'node_modules'),path.join(work,'node_modules'),'dir');
// Only a temporary preview copy is instrumented; no repository source file is changed.
let main=await readFile(path.join(work,'src/main.ts'),'utf8');
for(const anchor of ['void load();','void resolveTitles().then(() => resolveTitles());','void loadTranslations();']) assert.ok(main.includes(anchor),`legacy_hook_anchor_missing:${anchor}`);
main=main.replace('void resolveTitles().then(() => resolveTitles());','await resolveTitles(); await resolveTitles();')
  .replace('void loadTranslations();','await loadTranslations();');
const hooks=`
(globalThis as any).__archBridge = {
  async replace(rows: Paper[]) {
    papers = mergePapers([], rows.map(normalizePaper)).filter(paper => !isExcludedDoi(paperDoi(paper)));
    resolvedTitleCache.clear(); zhTitleCache.clear();
    await resolveTitles(); await loadTranslations(); mount();
  },
  language(value: Language) { language=value; mount(); },
  inspect() { return [...document.querySelectorAll('#gallery > .card')].map(el => ({
    doi:el.getAttribute('data-doi'),title:el.querySelector('.title')?.textContent,
    authors:el.querySelector('.authors')?.textContent,date:el.getAttribute('data-date'),
    journal:el.getAttribute('data-journal'),badge:el.querySelector('.meta .synthesis')?.textContent || [...el.querySelectorAll('.meta .tag')].slice(2).map(e=>e.textContent).join('|'),
    href:el.querySelector('a.open')?.getAttribute('href')
  })).sort((a,b)=>String(a.doi).localeCompare(String(b.doi))); }
};
void load().then(() => { (globalThis as any).__archReady = true; });
`;
main=main.replace('void load();',hooks);
await writeFile(path.join(work,'src/main.ts'),main);
await build({root:work,configFile:false,base:'./',build:{outDir:path.join(work,'dist'),target:'esnext'},logLevel:'error'});
for(const [name,bytes] of Object.entries(fixtures)) if(name!=='index.html') await writeFile(path.join(work,'dist',name),bytes);
let current=await makeMembership({catalogId:catalog.recordSetHash,serial:1,issuedAt:Date.now()-1000,validUntil:Date.now()+240000,records});
const mime=file=>file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream';
const readBody=async req=>{ const chunks=[];for await(const c of req)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString()||'{}');};
const titleKey=v=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
const server=createServer(async(req,res)=>{
  try {
    const name=new URL(req.url,'http://localhost').pathname;
    if(name==='/membership.json'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(current));return;}
    if(name.startsWith('/api/')){
      const body=await readBody(req);let data={};
      if(name==='/api/literature/supplement')data=JSON.parse(fixtures['literature-supplement.json']);
      else if(name==='/api/title-translations/zh') { const wanted=new Set((body.titles||[]).map(titleKey));data={translations:(translations.translations||[]).filter(row=>wanted.has(titleKey(row.title)))}; }
      else if(name==='/api/paper-titles/resolve') data={papers:(body.papers||[]).flatMap(row=>{const hit=resolutions.byDoi?.[String(row.doi||'').toLowerCase()]||resolutions.byTitle?.[titleKey(row.title)]||resolutions.byUrl?.[row.url];return hit?.title?[{key:row.key,title:hit.title,doi:hit.doi}]:[];})};
      else if(name==='/api/media/batch'||name==='/api/media/inventory')data={items:[],generatedAt:Date.now()};
      else if(name.includes('reader-counts'))data={counts:{}};
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));return;
    }
    let file;
    if(name.startsWith('/catalog/'))file=path.join(shadow,name.slice('/catalog/'.length));
    else if(name.startsWith('/architecture/')||name.startsWith('/shared/'))file=path.join(root,name.slice(1));
    else file=path.join(work,'dist',name==='/'?'index.html':name.slice(1));
    if(name.includes('..'))throw Error('path traversal');
    const bytes=await readFile(file);res.writeHead(200,{'content-type':mime(file)});res.end(bytes);
  }catch(error){res.writeHead(404,{'content-type':'text/plain'});res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const archiveTarget=life.partitions.archive[0]||records[0].doi;
const outcomes=[];
try {
  for(const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
    const browser=await type.launch({headless:true}),context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:900},serviceWorkers:'block'});
    const page=await context.newPage(),events={errors:[],console:[],failedRequests:[],responses:[],externalRequestsBlocked:[]};
    const summaryRequests=[];
    await context.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(u.origin===base)return route.continue();
      events.externalRequestsBlocked.push({host:u.hostname,path:u.pathname});
      if(u.pathname.includes('/api/user-ui/article-summary')){
        summaryRequests.push({url:route.request().url(),postData:route.request().postData()||''});
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          doi:archiveTarget,available:true,fulltextAvailable:true,source:'fulltext',cached:true,
          zh:'历史文献中文摘要',en:'Archive paper English summary',generatedAt:Date.now()
        })});
      }
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(u.pathname.includes('reader-counts')?{counts:{}}:{})});
    });
    page.on('pageerror',e=>events.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')events.console.push(m.text());});
    page.on('requestfailed',r=>events.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
    page.on('response',r=>{if(r.status()>=400)events.responses.push({url:r.url(),status:r.status()});});
    await context.tracing.start({screenshots:true,snapshots:true});
    try {
      await page.goto(base+'/',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>globalThis.__archReady===true, {timeout:30000});
      const baseline={};
      for(const lang of ['en','zh']){
        await page.evaluate(value=>globalThis.__archBridge.language(value),lang);
        baseline[lang]=await page.evaluate(()=>globalThis.__archBridge.inspect());
        assert.equal(baseline[lang].length,records.length,'legacy_rendered_doi_count');
      }
      // Initialize the actual new reader/fence in the browser, then render its records
      // through the unchanged production card renderer and the frozen static title supplements.
      await page.evaluate(async({base,asOfDate,presentationRef})=>{
        const {MembershipFence}=await import('/architecture/membership.mjs');
        const {FencedCatalogReader}=await import('/architecture/fenced-reader.mjs');
        const {applyTitlePresentation}=await import('/architecture/title-presentation.mjs');
        const {loadLandingPlan,resolveDoisPlan,globalSearchPlan}=await import('/architecture/frontend-plan.mjs');
        const fence=new MembershipFence({fetchSnapshot:async()=>{const r=await fetch(base+'/membership.json',{cache:'no-store'});return r.json();}});
        const reader=new FencedCatalogReader(base+'/catalog/',{fence});
        globalThis.__arch={fence,reader,asOfDate,loadLandingPlan,resolveDoisPlan,globalSearchPlan};
        const c=await reader.reader.open();let all=[];
        for(const ref of c.shards)all.push(...(await reader.reader.read(ref)).records);
        await fence.ready();
        const presentation=await reader.reader.read(presentationRef);
        globalThis.__arch.project = row=>applyTitlePresentation(row,presentation,c.recordSetHash);
        await globalThis.__archBridge.replace(all.map(globalThis.__arch.project));
      },{base,asOfDate:report.asOfDate,presentationRef});
      const differences=[];
      for(const lang of ['en','zh']){
        await page.evaluate(value=>globalThis.__archBridge.language(value),lang);
        const candidate=await page.evaluate(()=>globalThis.__archBridge.inspect());
        assert.equal(candidate.length,records.length);
        for(let i=0;i<candidate.length;i++)if(stable(candidate[i])!==stable(baseline[lang][i]))differences.push({lang,expected:baseline[lang][i],actual:candidate[i]});
      }
      await writeFile(path.join(out,`${name}-field-parity.json`),JSON.stringify({compared:records.length,languages:['en','zh'],differences},null,2));
      if(differences.length)console.log('GALLERY_DISPLAY_DIFFERENCES '+JSON.stringify(differences.slice(0,30)));
      assert.equal(differences.length,0,`legacy_display_mismatch:${differences.length}`);
      const hot=await page.evaluate(async()=>{const r=await __arch.loadLandingPlan(__arch.reader,{asOfDate:__arch.asOfDate});await __archBridge.replace(r.records.map(__arch.project));return{count:r.records.length,complete:r.complete,dom:__archBridge.inspect().length};});
      assert.deepEqual(hot,{count:life.counts.hot,complete:true,dom:life.counts.hot});

      // A shared Archive DOI is injected ahead of Hot without loading every history shard.
      const deepLink=await page.evaluate(async doi=>{
        history.replaceState(null,'','/?doi='+encodeURIComponent(doi));
        const r=await __arch.loadLandingPlan(__arch.reader,{asOfDate:__arch.asOfDate,sharedDoi:doi});
        await __archBridge.replace(r.records.map(__arch.project));
        return {first:__archBridge.inspect()[0]?.doi,hotCount:r.hotCount,total:r.records.length,lifecycle:r.shared?.lifecycle,status:r.shared?.status};
      },archiveTarget);
      assert.deepEqual(deepLink,{first:archiveTarget,hotCount:life.counts.hot,total:life.counts.hot+1,lifecycle:'archive',status:'published'});

      // User state remains keyed by DOI even when the Archive card is removed/reloaded.
      const actions=page.locator('gallery-paper-actions').first();
      await actions.waitFor({state:'visible',timeout:15000});
      await actions.locator('button[data-action="favorite"]').click();
      const project=actions.locator('input[data-collection="project"]');
      await project.waitFor({state:'visible',timeout:10000});
      await project.check();
      await actions.locator('button[data-action="close"]').click();
      await actions.locator('button[data-action="status"]').click();
      const toRead=actions.locator('button[data-action="set-status:to-read"]');
      await toRead.waitFor({state:'visible',timeout:10000});
      await toRead.click();

      // Summary request for an Archive card must carry that Archive DOI.
      const summaryButton=actions.locator('button[data-action="summary"]');
      await summaryButton.waitFor({state:'visible',timeout:10000});
      await summaryButton.click();
      await actions.locator('.drawer.summary-drawer').waitFor({state:'visible',timeout:10000});
      assert.ok(summaryRequests.some(request=>request.url.includes(encodeURIComponent(archiveTarget))||request.url.includes(archiveTarget)||request.postData.includes(archiveTarget)),
        'archive_summary_request_missing_doi');
      await actions.locator('button[data-action="close"]').click();

      await page.evaluate(async doi=>{
        const hotPlan=await __arch.loadLandingPlan(__arch.reader,{asOfDate:__arch.asOfDate});
        await __archBridge.replace(hotPlan.records.slice(0,1).map(__arch.project));
        const resolved=await __arch.resolveDoisPlan(__arch.reader,[doi],{asOfDate:__arch.asOfDate});
        await __archBridge.replace(resolved.records.map(__arch.project));
      },archiveTarget);
      const restored=page.locator('gallery-paper-actions').first();
      await restored.waitFor({state:'visible',timeout:10000});
      assert.equal(await restored.locator('.chip').filter({hasText:'我的课题'}).isVisible(),true,'archive_favorite_not_restored');
      assert.equal(await restored.locator('.chip.status').isVisible(),true,'archive_status_not_restored');

      const archiveSearch=await page.evaluate(async doi=>{const r=await __arch.globalSearchPlan(__arch.reader,doi,{asOfDate:__arch.asOfDate});return{definitive:r.definitive,noMatches:r.noMatches,dois:r.results.map(v=>v.doi)};},archiveTarget);
      assert.equal(archiveSearch.definitive,true);assert.equal(archiveSearch.noMatches,false);assert.ok(archiveSearch.dois.includes(archiveTarget));

      for(const doi of life.partitions.archive){
        const r=await page.evaluate(async doi=>{const row=await __arch.reader.get(doi,__arch.asOfDate);if(row.status==='published')await __archBridge.replace([__arch.project(row.record)]);return{status:row.status,lifecycle:row.lifecycle,doi:__archBridge.inspect()[0]?.doi};},doi);
        assert.deepEqual(r,{status:'published',lifecycle:'archive',doi});
      }
      const target=archiveTarget;
      const search=await page.evaluate(async doi=>{const r=await __arch.reader.search(doi,{asOfDate:__arch.asOfDate});return{complete:r.complete,dois:r.results.map(v=>v.doi)};},target);
      assert.equal(search.complete,true);assert.ok(search.dois.includes(target));
      const remaining=records.filter(r=>r.doi!==target);
      current=await makeMembership({catalogId:digest(stable(remaining)),serial:name==='chromium'?2:4,issuedAt:Date.now()-1000,validUntil:Date.now()+240000,records:remaining,withdrawn:[target]});
      const revoked=await page.evaluate(async doi=>{await __arch.fence.refresh();return __arch.reader.get(doi,__arch.asOfDate);},target);
      assert.equal(revoked.status,'withdrawn');assert.equal(Object.hasOwn(revoked,'record'),false);
      assert.deepEqual(events.errors,[],'uncaught_browser_errors');
      outcomes.push({browser:name,ok:true,fieldParityRecords:records.length,hot:hot.count,archiveDeepLinks:life.partitions.archive.length,
        globalDoiSearch:true,archiveDeepLinkPlan:true,archiveFavoriteRestored:true,archiveStatusRestored:true,
        archiveSummaryRequest:true,withdrawnOldCacheBlocked:true,unexpectedPageErrors:0,
        titleCompatibilityOverrides:Object.keys(presentation.overrides).length,canonicalRecordsModified:false,
        scope:'temporary preview with unchanged card renderer; remote APIs mocked; real frozen public data; no production UI activation'});
      current=await makeMembership({catalogId:catalog.recordSetHash,serial:3,issuedAt:Date.now()-1000,validUntil:Date.now()+240000,records});
    }catch(error){await page.screenshot({path:path.join(out,`${name}-failure.png`),fullPage:false});outcomes.push({browser:name,ok:false,error:error.message});throw error;}
    finally {await writeFile(path.join(out,`${name}-network.json`),JSON.stringify(events,null,2));await context.tracing.stop({path:path.join(out,`${name}-trace.zip`)});await browser.close();}
  }
  console.log('GALLERY_BROWSER_ACCEPTANCE '+JSON.stringify({ok:true,outcomes,productionActivated:false}));
}finally{
  await writeFile(path.join(out,'result.json'),JSON.stringify({ok:outcomes.length===2&&outcomes.every(r=>r.ok),outcomes,productionActivated:false,legacyStaticResolutionReceiptBound:false},null,2));
  await new Promise(resolve=>server.close(resolve));
}
