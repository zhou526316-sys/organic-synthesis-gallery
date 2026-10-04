import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const cut=source.lastIndexOf('  installManualRestartListener();');assert.ok(cut>0);
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const report={passed:0,cases:[],consoleErrors:[],pageErrors:[],realPublisherRequests:0,mockedExtension:true};
page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});page.on('pageerror',e=>report.pageErrors.push(String(e)));
await page.route('**/*',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><path d="M0 0L900 400"/></svg>'}));
await page.setContent('<!doctype html><meta charset="utf-8"><div id="fixture"></div>');
await page.evaluate(()=>{const m=new Map();window.GM_getValue=(k,d)=>m.has(k)?m.get(k):d;window.GM_setValue=(k,v)=>m.set(k,v);window.GM_deleteValue=k=>m.delete(k);window.GM_listValues=()=>[...m.keys()];window.GM_registerMenuCommand=()=>{};});
await page.addScriptTag({content:source.slice(0,cut)+`
 globalThis.T={collectArticleFigureCandidates,visualScope,wileyBodyFigureContext,orderedFigureCandidates,acquireBestVisual,articleFigureResolution,measuredQuality,
 fixtureQuality:function(){
  globalThis.seen=[];isAbortRequested=()=>false;assertBoundCaptureJob=(j,u)=>{if(u&&u.includes('foreign'))throw Error('media_source_doi_mismatch')};captureLiveUpdate=()=>{};
  acquireImage=async c=>{seen.push(c.url);return /good\\.svg/.test(c.url)?{sourceUrl:c.url,contentType:'image/png',width:1200,height:600}:null};
 }};
 })();`});
async function test(name,fn){await fn();report.passed++;report.cases.push(name);console.log('PUBLISHER_SOURCE_PASS '+name);}
const d='10.1002/anie.3010868',url='https://onlinelibrary.wiley.com/cms/asset/'+d+'/f1.png';
async function collect(html,publisher='wiley'){
 return page.evaluate(({html,publisher,d})=>{const root=document.querySelector('#fixture');root.innerHTML=html;return T.collectArticleFigureCandidates({doi:d,publisher},[],root,'https://onlinelibrary.wiley.com/doi/full/'+d).map(r=>({label:r.label,url:r.url,caption:r.text}));},{html,publisher,d});
}
try{
 await test('Wiley split figure title and unnumbered caption recover exactly one figure',async()=>{const r=await collect(`<figure><h3 class="figure__title">Figure 1</h3><img src="${url}"><figcaption>Reaction development and conditions.</figcaption></figure>`);assert.equal(r.length,1);assert.equal(r[0].label,'Figure 1');});
 await test('two independent Wiley figures keep their own labels and captions',async()=>{const r=await collect(`<figure><h3>Figure 1</h3><img src="${url}"><figcaption>FIRST</figcaption></figure><figure><h3>Scheme 2</h3><img src="${url.replace('f1','f2')}"><figcaption>SECOND</figcaption></figure>`);assert.equal(r.length,2);assert.ok(r.find(x=>x.label==='Figure 1').caption.includes('FIRST'));assert.ok(!r.find(x=>x.label==='Figure 1').caption.includes('SECOND'));});
 await test('same-block aria-labelledby supplies an explicit numbered label',async()=>{const r=await collect(`<figure aria-labelledby="own-label"><span id="own-label">Chart 1</span><img src="${url}"></figure>`);assert.equal(r[0].label,'Chart 1');});
 await test('cross-block aria labels are never borrowed',async()=>{assert.equal((await collect(`<span id="foreign-label">Figure 9</span><figure aria-labelledby="foreign-label"><img src="${url}"></figure>`)).length,0);});
 await test('multiple numbered titles reject a shared ancestor',async()=>{assert.equal((await collect(`<figure><h3>Figure 1</h3><h3>Figure 2</h3><img src="${url}"></figure>`)).length,0);});
 await test('recommended figures are excluded',async()=>{assert.equal((await collect(`<aside><figure><h3>Figure 1</h3><img src="${url}"></figure></aside>`)).length,0);});
 await test('graphical abstract remains excluded from body-image candidates',async()=>{assert.equal((await collect(`<figure class="graphical-abstract"><img src="${url}"><figcaption>Graphical Abstract</figcaption></figure>`)).length,0);});
 await test('foreign DOI still fails candidate provenance check',async()=>{assert.equal((await collect(`<figure><h3>Figure 1</h3><img src="${url.replace('3010868','9999999')}"></figure>`)).length,0);});
 await test('existing standard numbered caption still works',async()=>{const r=await collect(`<figure><img src="${url}"><figcaption>Figure 2. Existing caption.</figcaption></figure>`);assert.equal(r[0].label,'Figure 2');});
 await test('Wiley-only heading fallback does not change another publisher',async()=>{assert.equal((await collect(`<figure><h3>Figure 1</h3><img src="${url}"></figure>`,'rsc')).length,0);});
 await test('fifth explicit ACS vector candidate is preferred rather than discarded by four-item cap',async()=>{
  const x=await page.evaluate(async()=>{T.fixtureQuality();const cs=Array.from({length:5},(_,i)=>({label:'Figure 1',url:'https://pubs.acs.org/'+(i===4?'good.svg':'bad'+i+'.png')}));const r=await T.acquireBestVisual({publisher:'acs',captureDeadline:Date.now()+10000},cs,[],new Map(),'figure');return{url:r?.candidate.url,seen};});
  assert.equal(x.url,'https://pubs.acs.org/good.svg');assert.equal(x.seen[0],x.url);
 });
 await test('ACS candidate work remains bounded and uses only supplied URLs',async()=>{const x=await page.evaluate(()=>{const cs=Array.from({length:20},(_,i)=>({url:'https://pubs.acs.org/p'+i+'.png'}));return T.orderedFigureCandidates({publisher:'acs'},cs,'figure').map(c=>c.url)});assert.equal(x.length,6);assert.ok(x.every(u=>/^https:\/\/pubs.acs.org\/p\d+\.png$/.test(u)));});
 await test('ACS HTML viewer ending in svg is not promoted as a vector asset',async()=>{const x=await page.evaluate(()=>T.orderedFigureCandidates({publisher:'acs'},[{url:'https://pubs.acs.org/view-large/figure/a.svg'},{url:'https://pubs.acs.org/good.svg'}],'figure').map(c=>c.url));assert.equal(x[0],'https://pubs.acs.org/good.svg');});
 await test('other publishers and TOC selection retain their four-candidate contract',async()=>{const x=await page.evaluate(()=>{const c=Array.from({length:8},(_,i)=>({url:'https://example.test/'+i+'.png'}));return[T.orderedFigureCandidates({publisher:'wiley'},c,'figure').length,T.orderedFigureCandidates({publisher:'acs'},c,'toc').length]});assert.deepEqual(x,[4,4]);});
 await test('520 by586 raster still fails unchanged quality threshold',async()=>{assert.equal(await page.evaluate(()=>T.articleFigureResolution(520,586).usable),false);});
 await test('foreign source throws instead of trying another acquisition route',async()=>{const result=await page.evaluate(async()=>{T.fixtureQuality();try{await T.acquireBestVisual({publisher:'acs',captureDeadline:Date.now()+10000},[{url:'https://pubs.acs.org/foreign.svg'}],[],new Map(),'figure');return ''}catch(e){return e.message}});assert.equal(result,'media_source_doi_mismatch');});
 await test('unsafe SVG remains rejected by the existing image validator',async()=>{const q=await page.evaluate(()=>T.measuredQuality({contentType:'image/svg+xml',width:1000,height:500,imageData:'data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')},'figure'));assert.equal(q.usable,false);});
 assert.equal(report.consoleErrors.length,0);assert.equal(report.pageErrors.length,0);
}finally{
 await fs.writeFile((process.env.RUNNER_TEMP||'/tmp')+'/publisher-sources-browser.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));
}
