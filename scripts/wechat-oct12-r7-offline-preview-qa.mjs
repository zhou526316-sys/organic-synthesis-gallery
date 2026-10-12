import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const OUT='audit/wechat-working/2026-10-12-r7-offline-preview';
const previous=JSON.parse(await readFile(OUT+'/source-review-qa.json','utf8'));
const hash=data=>createHash('sha256').update(data).digest('hex');
const browser=await chromium.launch({headless:true,args:['--allow-file-access-from-files']});
const report={date:'2026-10-12',revision:'2026-10-12-r7',
  reviewType:'offline_proposed_WeChat_HTML_mobile_and_desktop_visual_review',
  status:'pending',draftUpdated:false,published:false,sections:[],
  screenshots:[],lastSuccessfulR6CloudDraftUnchanged:true};
await mkdir(OUT,{recursive:true});

async function capture(page,name,locator,{fullPage=false}={}){
  const shot=locator?await locator.screenshot({timeout:35000,animations:'disabled'}):
                     await page.screenshot({timeout:35000,fullPage,animations:'disabled'});
  const file=OUT+'/'+name+'.png';
  await writeFile(file,shot);
  report.screenshots.push({path:file,bytes:shot.length,sha256:hash(shot)});
}
try{
  for (const [type,file,expected,headingMatches] of [
     ['acs','acs-local-review.html',14,['将噻吩还原','官能团兼容性','XPS 和 ToF-SIMS']],
     ['jacs','jacs-local-review.html',10,['从氨基酸出发','底物范围的价值','Ni(0)–Ni(III)']],
  ]) {
    const summary=previous.body[type];
    for (const v of Object.values(summary.widthPct)){
      if(!(Number(v)>=75&&Number(v)<=95))throw new Error(type+' figure width not adapted: '+v);
    }
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,
      isMobile:true,hasTouch:true,locale:'zh-CN',timezoneId:'Asia/Shanghai'});
    const page=await context.newPage();
    await page.goto(pathToFileURL(resolve(OUT+'/'+file)).toString(),{waitUntil:'load',timeout:35000});
    const facts=await page.evaluate(()=>{
       const imgs=[...document.querySelectorAll('main img')];
       const headlineEls=[...document.querySelectorAll('main h2')];
       const info=imgs.map(img=>({src:img.getAttribute('src')?.split('/').pop(),
         loaded:img.complete&&img.naturalWidth>0,width:img.naturalWidth,height:img.naturalHeight,
         cssWidth:Math.round(img.getBoundingClientRect().width),
         cssHeight:Math.round(img.getBoundingClientRect().height)}));
       return {images:info,headingCount:headlineEls.length,
         h2:headlineEls.map(x=>x.textContent?.trim()),
         viewport:document.documentElement.clientWidth,
         contentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
         contentHeight:document.documentElement.scrollHeight};
    });
    if(facts.images.length!==expected)throw new Error(type+' count '+facts.images.length);
    if(facts.images.some(im=>!im.loaded))throw new Error(type+' file image failure '+JSON.stringify(facts.images.filter(x=>!x.loaded)));
    if(facts.contentOverflow)throw new Error(type+' horizontal overflow');
    const density=summary.chineseAndSymbolChars/summary.bodyImages;
    if(density<220)throw new Error(type+' discussion:image density still too small '+density);
    if(facts.h2.length!== (type==='acs'?8:9))throw new Error(type+' wrong scientific headings');
    report.sections.push({type,bodyImageCount:expected,bodyTextChars:summary.chineseAndSymbolChars,
       paragraphCount:summary.paragraphs,textCharsPerImage:Math.round(density),
       viewport:390,horizontalOverflow:false,loadedImages:expected,
       imageSizes:facts.images,headings:facts.h2});
    await capture(page,type+'-mobile-full',null,{fullPage:true});
    for(const [idx,needle] of headingMatches.entries()){
       const h=page.locator('h2').filter({hasText:needle}).first();
       if(await h.count()){
         await h.scrollIntoViewIfNeeded();
         await capture(page,type+'-mobile-sample-'+(idx+1),null);
       }
    }
    await context.close();
    const dc=await browser.newContext({viewport:{width:740,height:1000},deviceScaleFactor:1,locale:'zh-CN'});
    const dp=await dc.newPage();
    await dp.goto(pathToFileURL(resolve(OUT+'/'+file)).toString(),{waitUntil:'load',timeout:35000});
    const di=await dp.locator('main img').count();
    if(di!==expected)throw new Error(type+' desktop count mismatch');
    await capture(dp,type+'-desktop-first-screen',null);
    await dc.close();
  }
  report.status='offline_visual_artifacts_ready_for_independent_review';
} catch(e) {report.status='error';report.error=String(e);throw e}
finally {await browser.close();await writeFile(OUT+'/offline-preview-qa.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,review:report.sections.map(s=>({type:s.type,
  chars:s.bodyTextChars,paragraphs:s.paragraphCount,images:s.bodyImageCount,
  density:s.textCharsPerImage,allLoaded:s.loadedImages})),
  screenshots:report.screenshots.map(x=>x.path)},null,2));
