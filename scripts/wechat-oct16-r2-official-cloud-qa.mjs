import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const dir='audit/wechat-working/2026-10-16-r2-cloud-readback';
const receipt=await load('audit/wechat-publisher/latest.json');
const gate=await load('audit/wechat-working/2026-10-16-review-gate.json');
const request=await load('audit/automation-triggers/wechat-oct16-cloud-readback.json');
const manifests=[await load('public/wechat-featured/2026-10-16.json'),await load('public/wechat-retrospective/levin-isoxazole-pyrrole-edit-20261016.json')];
const edition=await load('public/wechat-editions/2026-10-16.json');
if(request.draftWriteAuthorized!==false||request.publicSendAuthorized!==false)throw Error('Read-only QA cannot authorize mutations');
if(!['draft_add','draft_update'].includes(receipt.stage)||receipt.draft_readback!=='ok'||receipt.article_count!==2||receipt.paper_count!==35||receipt.publish_id!==null||receipt.publicationSlot!=='2026-10-16T08:00:00+08:00')throw Error('Wrong cloud receipt');
if(request.previewUrl!==receipt.preview_url||request.expectedMediaId!==receipt.media_id)throw Error('Preview identity changed');
if(gate.textReview!=='pass'||gate.imageReview!=='pass'||gate.assets.length!==41)throw Error('Source gate incomplete');
const norm=s=>String(s).normalize('NFC').replace(/\s+/g,'');
const expectedLinks=['https://gallery.gczhouwld.com/?edition=2026-10-16&doi=10.1021%2Fjacs.6c17168&summary=0','https://gallery.gczhouwld.com/?doi=10.1038%2Fs41586-026-10933-6&summary=0'];
const symbols=await Promise.all(['today','retro'].map(x=>readFile('audit/wechat-working/2026-10-16-r2-review/'+x+'-assembled-symbolic.html','utf8')));
const counts=symbols.map(s=>(s.match(/<img\b/gi)||[]).length);
const result={date:'2026-10-16',revision:'2026-10-16-r2',status:'pending',readOnly:true,previewUrl:receipt.preview_url,mediaId:receipt.media_id,publishId:null,articleCount:2,dailyCount:35,scienceFigureCount:38,coverCount:2,nativeWechatClientInspected:false,checks:{},screenshots:[]};
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'zh-CN',timezoneId:'Asia/Shanghai'});
 await context.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 const page=await context.newPage();
 const response=await page.goto(receipt.preview_url,{waitUntil:'domcontentloaded',timeout:90000});
 if(!response?.ok())throw Error('Cloud preview not accessible');
 await page.locator('article.article-block').first().waitFor({timeout:25000});
 const facts=await page.evaluate(()=>{
  const as=[...document.querySelectorAll('article.article-block')];
  return {titles:as.map(a=>a.querySelector('h1')?.textContent.trim()),links:as.map(a=>a.querySelector('a.source-link')?.getAttribute('href')),texts:as.map(a=>a.querySelector('.wx-content')?.innerText||''),imageCounts:as.map(a=>a.querySelectorAll('.wx-content img').length),covers:document.querySelectorAll('.bundle-head .push-card img').length,overflow:document.documentElement.scrollWidth>innerWidth+2};
 });
 if(JSON.stringify(facts.titles)!==JSON.stringify([edition.title,manifests[1].title]))throw Error('Title/order mismatch');
 if(JSON.stringify(facts.links)!==JSON.stringify(expectedLinks))throw Error('DOI source links mismatch');
 if(facts.overflow||facts.covers!==2||JSON.stringify(facts.imageCounts)!==JSON.stringify(counts))throw Error('Image count or layout differs from reviewed HTML');
 result.checks.titles=facts.titles;result.checks.links=facts.links;result.checks.imagesPerArticle=facts.imageCounts;result.checks.mobileOverflow=false;
 result.checks.allProseByArticle=[];result.checks.figureOrderByArticle=[];
 for(let i=0;i<2;i++){
  const m=manifests[i],text=norm(facts.texts[i]);
  const paragraphs=(m.quick_points||[]).map(q=>q.text).concat(m.sections.flatMap(s=>[...s.paragraphs,...['warning','review','callout'].filter(k=>s[k]).map(k=>s[k])]));
  for(const p of paragraphs)if(!text.includes(norm(p)))throw Error('Reviewed paragraph missing: '+i+' '+p.slice(0,55));
  result.checks.allProseByArticle.push(paragraphs.length);
  const order=m.lead_figure_id?[m.lead_figure_id]:[];
  for(const s of m.sections)for(let j=1;j<=s.paragraphs.length;j++)order.push(...(s.figures_after_paragraph?.[String(j)]||[]));
  let previous=-1;
  for(const id of order){const f=m.figures.find(f=>f.id===id);if(!f)throw Error('Unknown figure '+id);const at=text.indexOf(norm(f.caption),previous+1);if(at<0||at<=previous)throw Error('Caption/order mismatch '+id);previous=at;}
  result.checks.figureOrderByArticle.push(order.length);
 }
 if(!facts.texts[1].includes('审稿人'))throw Error('Levin peer-review discussion missing');
 if(!norm(facts.texts[0]).includes('今日新增35篇文献'))throw Error('Daily total missing');
 for(const [journal,n] of Object.entries(edition.dailyReleaseSnapshot.journals))if(!norm(facts.texts[0]).includes(norm(journal+' '+n+' 篇')))throw Error('Journal count missing '+journal);
 const imgs=await page.evaluate(async()=>await Promise.all([...document.images].map(async x=>{
   x.loading='eager';try{await Promise.race([x.decode(),new Promise((_,no)=>setTimeout(()=>no(Error('decode timeout')),25000))]);return {ok:x.naturalWidth>0,w:x.naturalWidth,h:x.naturalHeight};}catch(e){return {ok:false,error:String(e).slice(0,90)};}
 })));
 result.checks.totalImageTags=imgs.length;result.checks.loaded=imgs.filter(x=>x.ok).length;result.checks.broken=imgs.filter(x=>!x.ok);
 if(result.checks.broken.length||imgs.length!==counts.reduce((a,b)=>a+b,2))throw Error('Actual cloud image did not decode');
 async function shot(name,locator){if(locator)await locator.scrollIntoViewIfNeeded();else await page.evaluate(()=>scrollTo(0,0));const path=dir+'/'+name+'.png';await page.screenshot({path});result.screenshots.push(path);}
 await shot('mobile-cover-bundle');
 const blocks=page.locator('article.article-block');
 for(let i=0;i<2;i++){
   await shot((i?'retro':'today')+'-opening',blocks.nth(i));
   const hs=blocks.nth(i).locator('h2');const n=await hs.count();
   for(const j of [...new Set([Math.floor(n/3),Math.floor(n*2/3),Math.max(0,n-1)])])if(n)await shot((i?'retro':'today')+'-section-'+j,hs.nth(j));
 }
 await page.setViewportSize({width:980,height:900});await page.evaluate(()=>scrollTo(0,0));
 result.checks.desktopOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
 if(result.checks.desktopOverflow)throw Error('Desktop overflow');
 await shot('desktop-opening');
 await context.close();result.status='official_draft_get_full_prose_figures_links_and_browser_layout_pass';
 console.log(JSON.stringify(result));
}catch(e){result.error=String(e);throw e;}
finally{await browser.close();await writeFile(dir+'/cloud-qa.json',JSON.stringify(result,null,2)+'\n');}
