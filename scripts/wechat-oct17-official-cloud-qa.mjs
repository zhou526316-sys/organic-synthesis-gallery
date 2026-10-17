import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const D='2026-10-17', A=`audit/wechat-working/${D}-r1-review`, out=`audit/wechat-working/${D}-r1-cloud-readback`;
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const receipt=await load('audit/wechat-publisher/latest.json');
const request=await load('audit/automation-triggers/wechat-oct17-cloud-readback.json');
const gate=await load(`audit/wechat-working/${D}-review-gate.json`);
const edition=await load(`public/wechat-editions/${D}.json`);
const manifests=[await load(`public/wechat-featured/${D}.json`),await load('public/wechat-retrospective/xu-phosphine-orthogonal-hydrogenation-20261017.json')];
const norm=x=>String(x).normalize('NFC').replace(/\s+/g,'');
if(request.draftWriteAuthorized!==false||request.publicSendAuthorized!==false)throw Error('Read-only QA request required');
if(receipt.status!=='ok'||!['draft_add','draft_update'].includes(receipt.stage)||receipt.draft_readback!=='ok'||receipt.article_count!==2||receipt.paper_count!==20||receipt.publish_id!==null||receipt.publicationSlot!==D+'T08:00:00+08:00')throw Error('Official cloud receipt mismatch');
if(receipt.preview_url!==request.previewUrl||receipt.media_id!==request.expectedMediaId)throw Error('Draft identity changed');
if(gate.textReview!=='pass'||gate.imageReview!=='pass'||gate.assets.length!==42)throw Error('Reviewed source gate missing');
const symbols=await Promise.all(['today','retro'].map(t=>readFile(`${A}/${t}-assembled-symbolic.html`,'utf8')));
const expectedImageCounts=symbols.map(s=>(s.match(/<img\b/gi)||[]).length);
const result={date:D,revision:D+'-r1',status:'pending',readOnly:true,previewUrl:receipt.preview_url,mediaId:receipt.media_id,articleCount:2,dailyCount:20,scienceFigures:[20,19],coverCount:2,uniqueReviewedAssets:42,publicSendAuthorized:false,nativeWechatClientInspected:false,checks:{},screenshots:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'zh-CN',timezoneId:'Asia/Shanghai'});
 await context.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 const page=await context.newPage();
 const response=await page.goto(receipt.preview_url,{waitUntil:'domcontentloaded',timeout:90000});
 if(!response?.ok())throw Error('Actual saved preview unavailable');
 await page.locator('article.article-block').first().waitFor({timeout:25000});
 const decoded=await page.evaluate(async()=>{await document.fonts.ready;return Promise.all([...document.images].map(async x=>{x.loading='eager';try{await Promise.race([x.decode(),new Promise((_,no)=>setTimeout(()=>no(Error('image timeout')),30000))]);return {ok:x.naturalWidth>0,width:x.naturalWidth,height:x.naturalHeight};}catch(e){return {ok:false,error:String(e).slice(0,100)};}}));});
 const facts=await page.evaluate(()=>{const a=[...document.querySelectorAll('article.article-block')];return {titles:a.map(x=>x.querySelector('h1')?.textContent.trim()),links:a.map(x=>x.querySelector('a.source-link')?.getAttribute('href')),texts:a.map(x=>x.querySelector('.wx-content')?.innerText||''),imageCounts:a.map(x=>x.querySelectorAll('.wx-content img').length),covers:document.querySelectorAll('.bundle-head .push-card img').length,overflow:document.documentElement.scrollWidth>innerWidth+2};});
 if(JSON.stringify(facts.titles)!==JSON.stringify([edition.title,manifests[1].title]))throw Error('Title or article-order mismatch');
 if(JSON.stringify(facts.links)!==JSON.stringify(manifests.map(m=>m.source_url)))throw Error('Exact DOI source link mismatch');
 if(facts.covers!==2||facts.overflow||JSON.stringify(facts.imageCounts)!==JSON.stringify(expectedImageCounts))throw Error('Image count or mobile layout mismatch');
 result.checks={titles:facts.titles,links:facts.links,imagesPerArticle:facts.imageCounts,mobileOverflow:false,loaded:decoded.filter(x=>x.ok).length,totalImageTags:decoded.length,broken:decoded.filter(x=>!x.ok),allProseByArticle:[],figureOrderByArticle:[],sourceNoticesByArticle:[]};
 if(result.checks.broken.length||decoded.length!==expectedImageCounts.reduce((a,b)=>a+b,2))throw Error('Cloud image decode/count mismatch');
 for(let i=0;i<2;i++){
  const m=manifests[i],text=norm(facts.texts[i]);
  const ps=[...(m.quick_points||[]).map(q=>q.text),...m.sections.flatMap(s=>[...s.paragraphs,...['warning','review','callout'].filter(k=>s[k]).map(k=>s[k])])];
  for(const p of ps)if(!text.includes(norm(p)))throw Error('Reviewed prose missing: '+i+' '+p.slice(0,60));
  for(const s of m.sections)if(!text.includes(norm(s.heading)))throw Error('Section heading missing');
  result.checks.allProseByArticle.push(ps.length);
  if(m.ai_notice&&!text.includes(norm(m.ai_notice)))throw Error('Source/peer-review availability notice missing');
  result.checks.sourceNoticesByArticle.push(Boolean(m.ai_notice));
  const order=m.lead_figure_id?[m.lead_figure_id]:[];
  for(const s of m.sections)for(let j=1;j<=s.paragraphs.length;j++)order.push(...(s.figures_after_paragraph?.[String(j)]||[]));
  let cursor=-1;
  for(const id of order){const f=m.figures.find(f=>f.id===id);if(!f)throw Error('Unknown reviewed figure '+id);const pos=text.indexOf(norm(f.caption),cursor+1);if(pos<0||pos<=cursor)throw Error('Figure caption/order mismatch '+id);cursor=pos;}
  result.checks.figureOrderByArticle.push(order.length);
 }
 if(!norm(facts.texts[0]).includes('今日新增20篇文献'))throw Error('Wrong daily total');
 for(const [j,n] of Object.entries(edition.dailyReleaseSnapshot.journals))if(!norm(facts.texts[0]).includes(norm(j+' '+n+' 篇')))throw Error('Wrong daily journal count '+j);
 const settle=async()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 async function shot(name,locator){
   let requestedTop=0;
   if(locator){requestedTop=await locator.evaluate(x=>x.getBoundingClientRect().top+scrollY);}
   await page.evaluate(y=>scrollTo({top:Math.max(0,y-18),left:0,behavior:'instant'}),requestedTop);await settle();
   const position=await page.evaluate(()=>({scrollY,innerWidth,innerHeight,scrollHeight:document.documentElement.scrollHeight}));
   const path=`${out}/${name}.png`;await page.screenshot({path});result.screenshots.push({path,requestedTop,...position});
 }
 await shot('mobile-cover-bundle');
 const blocks=page.locator('article.article-block');
 for(let i=0;i<2;i++){
   const tag=i?'retro':'today';await shot(tag+'-opening',blocks.nth(i));
   const hs=blocks.nth(i).locator('.wx-content h2');
   for(let j=0;j<await hs.count();j++)await shot(`${tag}-section-${j}`,hs.nth(j));
 }
 await page.setViewportSize({width:980,height:900});await settle();
 result.checks.desktopOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
 if(result.checks.desktopOverflow)throw Error('Desktop horizontal overflow');
 await shot('desktop-cover-bundle');await shot('desktop-today-opening',blocks.nth(0));await shot('desktop-retro-opening',blocks.nth(1));
 result.status='official_draft_get_full_prose_original_figures_links_and_browser_layout_pass';
 console.log(JSON.stringify(result));await context.close();
}catch(e){result.error=String(e);throw e;}
finally{await browser.close();await writeFile(out+'/cloud-qa.json',JSON.stringify(result,null,2)+'\n');}
