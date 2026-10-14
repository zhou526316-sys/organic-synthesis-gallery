import { chromium } from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const DIR='audit/wechat-working/2026-10-14-r1-cloud-readback';
const receipt=JSON.parse(await readFile('audit/wechat-publisher/latest.json','utf8'));
const gate=JSON.parse(await readFile('audit/wechat-working/2026-10-14-review-gate.json','utf8'));
const edition=JSON.parse(await readFile('public/wechat-editions/2026-10-14.json','utf8'));
const retro=JSON.parse(await readFile('public/wechat-retrospective/idpi-asymmetric-geranyl-cyclization-20261014.json','utf8'));
const request=JSON.parse(await readFile('audit/automation-triggers/wechat-oct14-cloud-preview-check.json','utf8'));
if(receipt.stage!=='draft_add'&&receipt.stage!=='draft_update')throw Error('WeChat draft not created');
if(receipt.paper_count!==20||receipt.article_count!==2||receipt.publish_id!==null||
   receipt.draft_readback!=='ok'||receipt.publicationSlot!=='2026-10-14T08:00:00+08:00'||
   gate.revision!=='2026-10-14-r1'||gate.textReview!=='pass'||gate.imageReview!=='pass'||
   receipt.preview_url!==request.previewUrl||request.draftWriteAuthorized!==false||request.publicSendAuthorized!==false)throw Error('Read-only acceptance prerequisites invalid');
const expectedLinks=gate.exactReadOriginal;
const expectedTitles=[edition.title,retro.title];
const checks={date:'2026-10-14',revision:'2026-10-14-r1',status:'pending',readOnly:true,cloudDraft:true,mediaId:receipt.media_id,
  previewUrl:receipt.preview_url,publishId:null,sourceImageCount:25,covers:2,actual:{},screenshots:[]};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,
   locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
 const page=await ctx.newPage();
 await page.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort('blockedbyclient'));
 const response=await page.goto(receipt.preview_url,{waitUntil:'domcontentloaded',timeout:90000});
 if(!response?.ok())throw Error('Real cloud preview response '+response?.status());
 await page.locator('article.article-block').first().waitFor({timeout:24000});
 const x=await page.evaluate(()=>{
   const a=[...document.querySelectorAll('article.article-block')];
   return {titles:a.map(v=>v.querySelector('h1')?.textContent.trim()),
     links:a.map(v=>v.querySelector('a.source-link')?.getAttribute('href')),
     summaries:a.map(v=>v.querySelector('.wx-content')?.innerText||''),
     headings:a.map(v=>[...v.querySelectorAll('.wx-content h2')].map(h=>h.textContent.trim())),
     imageCounts:a.map(v=>v.querySelectorAll('.wx-content img').length),
     covers:document.querySelectorAll('.bundle-head .push-card img').length,
     allImages:document.images.length,
     overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};
 });
 checks.actual.titles=x.titles;checks.actual.links=x.links;checks.actual.imagesPerArticle=x.imageCounts;
 checks.actual.total=x.allImages;checks.actual.covers=x.covers;checks.actual.headings=x.headings;
 checks.actual.mobileOverflow=x.overflow;
 if(JSON.stringify(x.titles)!==JSON.stringify(expectedTitles))throw Error('Article native title/order incorrect: '+JSON.stringify(x.titles));
 if(JSON.stringify(x.links)!==JSON.stringify(expectedLinks))throw Error('Exact two DOI read-original links incorrect');
 if(x.imageCounts[0]<14||x.imageCounts[1]<12||x.covers!==2||x.allImages<28)throw Error('Missing original source image(s): '+JSON.stringify(x.imageCounts));
 if(x.overflow)throw Error('390px mobile overflow');
 const sums=x.summaries;
 if(!sums[0].includes('20')||sums[0].includes('10 月 14 日正式新增：24'))throw Error('Old 24 article count remains');
 if(!sums[0].includes('JOC')||!sums[0].includes('Organic Letters')||!sums[0].includes('Chemical Science'))throw Error('Corrected journals missing');
 if(!sums[0].includes('3-exo-trig')||!sums[0].includes('PhSiD₃')||!sums[0].includes('24 mmol'))throw Error('Today main and SI scientific logic truncated');
 if(!sums[1].includes('PFTB')||!sums[1].includes('1.3')||!sums[1].includes('3.45')||!sums[1].includes('1.4 kcal'))throw Error('Retrospective main/SI scientific evidence missing');
 if(!sums[0].includes('先看懂这项反应')||!sums[1].includes('先看懂这项反应'))throw Error('Lead reaction guide missing');
 for(const i of [0,1]){const f=DIR+'/'+(i===0?'today':'retrospective')+'-mobile-header.png';
   await page.locator('article.article-block').nth(i).scrollIntoViewIfNeeded();
   await page.screenshot({path:f});checks.screenshots.push(f);}
 const imageResults=[];
 const all=page.locator('img');
 for(let i=0;i<await all.count();i++){
   const im=all.nth(i);
   await im.scrollIntoViewIfNeeded();
   const rr=await im.evaluate(async x=>{try{if(!x.complete)await new Promise((ok,no)=>{x.addEventListener('load',ok,{once:true});x.addEventListener('error',no,{once:true});setTimeout(ok,6000)});if(x.decode)await x.decode();return {ok:!!x.naturalWidth,w:x.naturalWidth,h:x.naturalHeight};}catch(e){return {ok:false,w:x.naturalWidth,h:x.naturalHeight,error:String(e).slice(0,70)}}});
   imageResults.push(rr);
 }
 const failures=imageResults.filter(x=>!x.ok);checks.actual.imageCount=imageResults.length;checks.actual.loaded=imageResults.length-failures.length;
 checks.actual.broken=failures;
 if(failures.length)throw Error('At least one WeChat-cloud image broken '+JSON.stringify(failures));
 for(const i of [0,1]){
   const f=DIR+'/'+(i===0?'today':'retro')+'-first-react.png';
   await page.locator('article.article-block').nth(i).locator('.wx-content img').first().scrollIntoViewIfNeeded();
   await page.screenshot({path:f});checks.screenshots.push(f);}
 const desktop=await browser.newContext({viewport:{width:980,height:900},deviceScaleFactor:1});
 const p2=await desktop.newPage();await p2.goto(receipt.preview_url,{waitUntil:'domcontentloaded',timeout:85000});
 const overflow=await p2.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
 checks.actual.desktopOverflow=overflow;if(overflow)throw Error('Desktop overflow');
 const screen=DIR+'/desktop-main.png';await p2.screenshot({path:screen});checks.screenshots.push(screen);
 await desktop.close();await ctx.close();
 checks.status='real_wechat_draft_get_original_figures_mobile_desktop_pass';
 console.log(JSON.stringify({status:checks.status,titles:checks.actual.titles,images:checks.actual.imageCount,loaded:checks.actual.loaded,links:checks.actual.links,covers:checks.actual.covers},null,2));
}finally{await browser.close();await writeFile(DIR+'/real-cloud-qa.json',JSON.stringify(checks,null,2)+'\n')}
if(checks.status!=='real_wechat_draft_get_original_figures_mobile_desktop_pass')process.exit(1);
