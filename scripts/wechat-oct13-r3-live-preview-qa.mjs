import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const OUT='audit/wechat-working/2026-10-13-r3-live-preview';
const digest=data=>createHash('sha256').update(data).digest('hex');
const receipt=JSON.parse(await readFile('audit/wechat-publisher/latest.json','utf8'));
const edition=JSON.parse(await readFile('public/wechat-editions/2026-10-13.json','utf8'));
const retro=JSON.parse(await readFile('public/wechat-retrospective/oxetane-to-azetidine-skeletal-editing-20261013.json','utf8'));
const gate=JSON.parse(await readFile('audit/wechat-working/2026-10-13-review-gate.json','utf8'));
const expectedMedia='KhELYUzvwADwB_l1xH1SWO145961Rlw4fMzLxtij2o_6u5Z6Pq_7PK-nw7ZXBk7V';
const date='2026-10-13';
if(receipt.media_id!==expectedMedia||receipt.publicationSlot!=='2026-10-13T08:00:00+08:00'||
  receipt.stage!=='draft_update'||receipt.draft_readback!=='ok'||receipt.publish_id!==null||receipt.article_count!==2||
  gate.textReview!=='pass'||gate.imageReview!=='pass'||gate.revision!=='2026-10-13-r3'||
  edition.featured!=='10.1038/s44160-026-01189-z'||gate.assets.length!==24)throw new Error('Unapproved or wrong-date cloud draft');
const URLs=[
'https://gallery.gczhouwld.com/?edition=2026-10-13&doi=10.1038%2Fs44160-026-01189-z&summary=0',
'https://gallery.gczhouwld.com/?doi=10.1038%2Fs41557-026-02213-7&summary=0'
];
const headlines=[edition.title,retro.title];
const qa={
 date,revision:gate.revision,previewUrl:receipt.preview_url,
 mediaId:receipt.media_id,status:'pending',massSent:false,realMobileWechatNativeClientInspected:false,
 source:'Actual WeChat official draft/get fixed-IP relay HTML, independently checked with Chromium 390px + desktop',
 articleTitles:[],readOriginalLinks:[],images:{},sourceImagesByArticle:[],screenCaptures:[]
};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
   isMobile:true,hasTouch:true,locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
 const page=await context.newPage();
 await page.route('**/*',route=>(route.request().method()==='GET'||route.request().method()==='HEAD')?
    route.continue():route.abort('blockedbyclient'));
 const res=await page.goto(receipt.preview_url,{waitUntil:'domcontentloaded',timeout:85000});
 if(!res||!res.ok())throw new Error('Relay HTML response not OK: '+res?.status());
 await page.locator('article.article-block').first().waitFor({timeout:25000});
 const initial=await page.evaluate(()=>{
   const a=[...document.querySelectorAll('article.article-block')];
   return {titles:a.map(x=>x.querySelector('h1')?.textContent?.trim()||''),
     links:a.map(x=>x.querySelector('a.source-link')?.getAttribute('href')||''),
     images:a.map(x=>x.querySelectorAll('.wx-content img').length),
     covers:document.querySelectorAll('.bundle-head .push-card img').length,
     total:document.querySelectorAll('img').length,
     paperSummaries:a.map(x=>(x.querySelector('.wx-content')?.innerText||'')),
     headingLists:a.map(x=>[...x.querySelectorAll('.wx-content h2')].map(v=>v.textContent?.trim())),
     overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2
   };
 });
 qa.articleTitles=initial.titles;
 qa.readOriginalLinks=initial.links;
 qa.sourceImagesByArticle=initial.images;
 qa.images={all:initial.total,covers:initial.covers,byArticle:initial.images,expectedBody:[12,10],qr:1,loaded:0,broken:[]};
 qa.headings=initial.headingLists;
 if(JSON.stringify(initial.titles)!==JSON.stringify(headlines))throw Error('Article native titles/order mismatch '+JSON.stringify(initial.titles));
 if(JSON.stringify(initial.links)!==JSON.stringify(URLs))throw Error('Two DOI card read-original URLs differ');
 if(initial.images.join(',')!=='13,10'||initial.covers!==2||initial.total!==25)
     throw Error('Expected 22 original main/SI images + 2 covers + 1 QR: '+JSON.stringify({n:initial.images,c:initial.covers,total:initial.total}));
 if(initial.overflow)throw Error('390px horizontal overflow in actual cloud draft');
 if(initial.paperSummaries[0].length<3700||initial.paperSummaries[1].length<3500)throw Error('Deep science prose absent after cloud');
 if(!initial.paperSummaries[0].includes('Nature Synthesis 3 篇')||
    !initial.paperSummaries[0].includes('JACS 2 篇')||
    !initial.paperSummaries[0].includes('Organic Letters 4 篇')||
    !initial.paperSummaries[0].includes('今日新增 12 篇文献'))
     throw Error('Oct13 journal count-only daily roundup missing');
 if(!initial.paperSummaries[0].includes('为什么“只换一个原子”')||
    !initial.paperSummaries[0].includes('原来的氧到哪里去')||
    !initial.paperSummaries[0].includes('−42.4')||
    !initial.paperSummaries[1].includes('第一道反常识的障碍')||
    !initial.paperSummaries[1].includes('经典 Mitsunobu')||
    !initial.paperSummaries[1].includes('BEHT')||
    !initial.paperSummaries[1].includes('SI Fig. S3'))
     throw Error('R3 innovation-led scientific story is missing from actual WeChat cloud draft');
 qa.countOnly=true;
 async function shot(name,locator=null){
  let image;
  if(locator){await locator.first().scrollIntoViewIfNeeded();await page.waitForTimeout(360);}
  image=await page.screenshot({animations:'disabled',timeout:35000});
  const path=OUT+'/'+name+'.png';await writeFile(path,image);qa.screenCaptures.push({path,sha256:digest(image),bytes:image.length});
 }
 await shot('mobile-first-screen');
 await shot('mobile-featured-cover',page.locator('.push-card-main'));
 await shot('mobile-retro-cover',page.locator('.push-card-sub'));
 const aa=page.locator('article.article-block');
 await shot('mobile-nature-synthesis-DFT',aa.nth(0).locator('h2').filter({hasText:'计算如何连接'}));
 await shot('mobile-nature-synthesis-SI-regioselectivity',aa.nth(0).locator('h2').filter({hasText:'局限性'}));
 await shot('mobile-nature-chemistry-SI-bottlenecks',aa.nth(1).locator('h2').filter({hasText:'两个看似简单'}));
 await shot('mobile-nature-chemistry-source-comparison',aa.nth(1).locator('h2').filter({hasText:'与光催化路线比较'}));
 let images=page.locator('img');let decoded=[];
 for(let i=0;i<await images.count();i++){
  const target=images.nth(i);
  try{
   await target.scrollIntoViewIfNeeded({timeout:12000});
   await target.evaluate(e=>e.decode());
   decoded.push(await target.evaluate(e=>({ok:e.complete&&e.naturalWidth>0,naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight})));
  }catch(e){decoded.push({ok:false,error:String(e).slice(0,180)})}
 }
 qa.images.loaded=decoded.filter(x=>x.ok).length;
 qa.images.broken=decoded.flatMap((x,i)=>x.ok?[]:[i]);
 if(qa.images.loaded!==25)throw Error('Live WeChat draft image load failure '+JSON.stringify(qa.images));
 await context.close();
 const dc=await browser.newContext({viewport:{width:980,height:940},deviceScaleFactor:1,locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
 const dp=await dc.newPage();const dr=await dp.goto(receipt.preview_url,{waitUntil:'domcontentloaded',timeout:70000});if(!dr||!dr.ok())throw Error('Desktop relay inaccessible');
 await dp.locator('.bundle-head').waitFor({timeout:12000});
 const capture=await dp.locator('.bundle-head').screenshot({animations:'disabled',timeout:35000});
 const p=OUT+'/desktop-two-cover-header.png';await writeFile(p,capture);qa.screenCaptures.push({path:p,sha256:digest(capture),bytes:capture.length});
 const dob=await dp.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
 if(dob)throw Error('Desktop horizontal overflow');
 await dc.close();
 qa.status='cloud_draft_get_and_real_mobile_desktop_preview_pass';
 console.log(JSON.stringify({status:qa.status,articleTitles:qa.articleTitles,images:qa.images,readOriginalLinks:qa.readOriginalLinks,screenCount:qa.screenCaptures.length},null,2));
}catch(e){qa.status='fail';qa.error=String(e);throw e}
finally{await writeFile(OUT+'/live-qa.json',JSON.stringify(qa,null,2)+'\n');await browser.close();}
