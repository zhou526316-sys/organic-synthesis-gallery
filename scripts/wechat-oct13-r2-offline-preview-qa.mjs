import { chromium } from '@playwright/test';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const OUTPUT='audit/wechat-working/2026-10-13-r2-offline-preview';
const sha=data=>createHash('sha256').update(data).digest('hex');
const source=JSON.parse(await readFile(OUTPUT+'/render-qa.json','utf8'));
if(source.status!=='offline_source_prose_generated_for_mobile_review'||source.formalNewPaperCount!==12)
 throw new Error('wrong 08:00 publication date or edition');
const browser=await chromium.launch({headless:true,args:['--allow-file-access-from-files']});
const qa={date:'2026-10-13',revision:'2026-10-13-r2',
 status:'pending',readOnly:true,wechatDraftWritten:false,publicSent:false,
 byJournal:source.byJournal,articles:[],screenshots:[],checkedAt:new Date().toISOString()};
await mkdir(OUTPUT,{recursive:true});
try{
 for(const [tag,file,expectedBody,sections] of [
  ['today','today.html',12,9],['retro','retro.html',10,8]
 ]){
   const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,
     locale:'zh-CN',timezoneId:'Asia/Shanghai'});
   const page=await mobile.newPage();
   await page.goto(pathToFileURL(resolve(OUTPUT+'/'+file)).toString(),{waitUntil:'load',timeout:60000});
   const facts=await page.evaluate(()=>{
     const imgs=[...document.querySelectorAll('main img')];
     const images=imgs.map(x=>({loaded:x.complete&&x.naturalWidth>0,width:x.naturalWidth,height:x.naturalHeight,
       actualW:Math.round(x.getBoundingClientRect().width),actualH:Math.round(x.getBoundingClientRect().height),
       filename:x.getAttribute('src')?.split('/').pop()||''}));
     const ps=[...document.querySelectorAll('main p')].map(x=>x.innerText.trim());
     return {images,paragraphs:ps.length,maxPara:Math.max(0,...ps.map(x=>x.length)),
       sections:[...document.querySelectorAll('main h2')].map(x=>x.innerText.trim()),
       overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
       contentHeight:document.documentElement.scrollHeight};
   });
   if(facts.images.length!==expectedBody+1)throw Error(tag+' figure+cover count: '+facts.images.length);
   if(facts.images.some(x=>!x.loaded))throw Error(tag+' image load failure');
   if(facts.overflow)throw Error(tag+' horizontal scroll overflow on 390px mobile');
   if(facts.sections.length<sections)throw Error(tag+' incomplete sections');
   qa.articles.push({type:tag,bodyImages:expectedBody,cover:1,sections:facts.sections,
     images:facts.images,paragraphCount:facts.paragraphs,maxParagraphChars:facts.maxPara,
     mobileHorizontalOverflow:facts.overflow,contentHeightPx:facts.contentHeight});
   async function screenshot(name){
     const pixels=await page.screenshot({animations:'disabled',timeout:35000});
     const path=OUTPUT+'/'+tag+'-'+name+'.png';
     await writeFile(path,pixels);qa.screenshots.push({path,sha256:sha(pixels),bytes:pixels.length});
   }
   await screenshot('cover-and-start');
   const anchor=page.locator('main h2');
   for(const n of [1,Math.floor(sections/2),sections-2]){
     if(n<await anchor.count()){
       await anchor.nth(n).scrollIntoViewIfNeeded();
       await screenshot('section-'+n);
     }
   }
   for(const figIndex of (tag==='today'?[7,10]:[3,9])){
     const imgs=page.locator('main img');
     if(figIndex<await imgs.count()){await imgs.nth(figIndex).scrollIntoViewIfNeeded();await screenshot('figure-'+figIndex);}
   }
   await mobile.close();
   const dc=await browser.newContext({viewport:{width:740,height:945},deviceScaleFactor:1,locale:'zh-CN'});
   const dp=await dc.newPage();
   await dp.goto(pathToFileURL(resolve(OUTPUT+'/'+file)).toString(),{waitUntil:'load',timeout:45000});
   let shot=await dp.screenshot({animations:'disabled',timeout:35000});
   let path=OUTPUT+'/'+tag+'-desktop-start.png';
   await writeFile(path,shot);qa.screenshots.push({path,sha256:sha(shot),bytes:shot.length});
   await dc.close();
 }
 qa.status='original_source_figures_science_prose_and_mobile_desktop_layout_pass';
 console.log(JSON.stringify({status:qa.status,articles:qa.articles.map(x=>({type:x.type,images:x.bodyImages,sections:x.sections.length,maxParagraph:x.maxParagraphChars})),screenCount:qa.screenshots.length},null,2));
} catch(e) {qa.status='fail';qa.error=String(e);throw e}
finally{await browser.close();await writeFile(OUTPUT+'/offline-qa.json',JSON.stringify(qa,null,2)+'\n');}
