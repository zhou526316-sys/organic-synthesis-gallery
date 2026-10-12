import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const receipt=JSON.parse(await readFile('audit/wechat-publisher/latest.json','utf8'));
if(receipt.stage!=='draft_update'||receipt.draft_readback!=='ok'||receipt.publish_id!==null||receipt.article_count!==2)throw new Error('Unverified or already published draft');
if(receipt.media_id!=='KhELYUzvwADwB_l1xH1SWIIQfl5GSB19jduNK2sdIdguH6OMYYfkuM8zO65yvnWs')throw new Error('Unexpected cloud draft ID');
const PREVIEW = receipt.preview_url;
const OUTPUT = 'audit/wechat-working/2026-10-12-r7-live-preview';
const LINKS = [
  'https://gallery.gczhouwld.com/?edition=2026-10-12&doi=10.1021%2Facscatal.6c06048&summary=0',
  'https://gallery.gczhouwld.com/?doi=10.1021%2Fjacs.6c10406&summary=0'
];
const HEADLINES = [
  '有机合成文献日报｜10.12｜今日精选｜ACS Catalysis：氯仿诱导钯催化剂表面改性，实现噻吩的温和非均相加氢',
  '往期精选｜JACS：烷基锆参与的氨基酸衍生物不对称脱氨交叉偶联'
];
const digest = data => createHash('sha256').update(data).digest('hex');
await mkdir(OUTPUT,{recursive:true});
const browser = await chromium.launch({headless:true});
const qa={
  date:'2026-10-12',revision:'2026-10-12-r7',previewUrl:PREVIEW,
  status:'pending',readOnly:true,source:'Playwright in GitHub Actions against real post-draft/get relay HTML',
  notNativeWeChatClient:true,massSent:false,checkedAt:new Date().toISOString(),
  articles:[],sourceLinks:[],images:{},evidence:[]
};
try {
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
  const page=await context.newPage();
  await page.route('**/*', async route=> {
    const req=route.request();
    return (req.method()==='GET'||req.method()==='HEAD') ? route.continue() : route.abort('blockedbyclient');
  });
  const response=await page.goto(PREVIEW,{waitUntil:'domcontentloaded',timeout:70000});
  if(!response||!response.ok())throw new Error('Preview page HTTP '+response?.status());
  await page.locator('.article-block').first().waitFor({timeout:20000});
  const identity=await page.evaluate(()=>{
    const articles=[...document.querySelectorAll('article.article-block')];
    return {
      title:document.title,
      headlines:articles.map(a=>a.querySelector('h1')?.textContent?.trim()),
      sourceLinks:articles.map(a=>a.querySelector('a.source-link')?.getAttribute('href')),
      contentImages:articles.map(a=>a.querySelectorAll('.wx-content img').length),
      covers:document.querySelectorAll('.bundle-head .push-card img').length,
      allImages:document.querySelectorAll('img').length,
      countAndJournals:articles[0]?.innerText.includes('ACS Catalysis 1 篇 · JOC 1 篇 · Organic Letters 3 篇'),
      tableS9:articles[0]?.innerText.includes('补充信息 SI Table S9'),
      noExpandedNewList:!articles[0]?.innerText.includes('Title in English:'),
      sectionTitles:articles.map(a=>[...a.querySelectorAll('.wx-content h2')].map(e=>e.textContent?.trim()))
    };
  });
  qa.articles=identity.headlines;qa.sourceLinks=identity.sourceLinks;qa.images={total:identity.allImages,byArticle:identity.contentImages,covers:identity.covers,expected:[27,14,10,2],imageLoadReport:[]};
  qa.journalCountOnly=identity.countAndJournals;
  qa.ACS_SI_TableS9=identity.tableS9;
  qa.contentSectionHeadings=identity.sectionTitles;
  const balance=await page.evaluate(()=>{
    const list=[...document.querySelectorAll('article.article-block')];
    return list.map(a=>({
      words:a.querySelector('.wx-content')?.innerText?.length||0,
      h2:[...a.querySelectorAll('.wx-content h2')].map(e=>e.innerText.trim()),
      imgStyles:[...a.querySelectorAll('.wx-content img')].map(e=>e.getAttribute('style')||'')
    }));
  });
  qa.scienceImageBalance=balance.map((row,i)=>({
    article:i===0?'ACS Catalysis':'JACS',
    charsIncludingCaptions:row.words,scientificHeadings:row.h2.length,
    hasVariableFigureWidths:row.imgStyles.some(st=>/width:\\s*(?:7[5-9]|8\\d|9[0-5])%/.test(st)),
    noAllWideImages:row.imgStyles.filter(st=>/width:\\s*100%/.test(st)).length<row.imgStyles.length-1
  }));
  const articleText=await page.evaluate(()=>[...document.querySelectorAll('article.article-block')].map(a=>a.innerText));
  if(!articleText[0].includes('移走氯仿，活性还能保留吗')||
     !articleText[0].includes('活性提升')||
     !articleText[1].includes('69.8% ee')||
     articleText[1].includes('3l 仅 71.0% ee'))
     throw new Error('Cloud prose is not the reviewed R7 scientific draft');
  if(qa.scienceImageBalance.some(b=>b.charsIncludingCaptions<3500 || b.scientificHeadings<7))
     throw new Error('R7 science narrative is still missing major explanatory text');
  if(JSON.stringify(identity.headlines)!==JSON.stringify(HEADLINES))throw new Error('Two article titles/order mismatch');
  if(JSON.stringify(identity.sourceLinks)!==JSON.stringify(LINKS))throw new Error('Two DOI 阅读原文 URLs mismatch');
  if(identity.allImages!==27 || JSON.stringify(identity.contentImages)!==JSON.stringify([15,10]) || identity.covers!==2)throw new Error('Preview 24 source figures + one QR + two cover images mismatch: '+JSON.stringify(identity));
  if(!identity.countAndJournals||!identity.tableS9)throw new Error('Source article content/journal summary missing');

  const capture=async(name,loc=null)=>{
    const path=OUTPUT+'/'+name+'.png';
    if(loc && await loc.count()){
      await loc.first().scrollIntoViewIfNeeded({timeout:20000});
      await page.waitForTimeout(600);
    }
    const shot=loc && await loc.count()
      ? await loc.first().screenshot({animations:'disabled',timeout:35000})
      : await page.screenshot({animations:'disabled',timeout:35000});
    await writeFile(path,shot);
    qa.evidence.push({path,sha256:digest(shot),bytes:shot.length});
  };
  await capture('mobile-first-screen');
  await capture('mobile-primary-cover',page.locator('.push-card-main'));
  await capture('mobile-retrospective-cover',page.locator('.push-card-sub'));
  await page.locator('.article-block').first().locator('h2').filter({hasText:'移走氯仿'}).scrollIntoViewIfNeeded();
  await capture('mobile-ACS-scientific-reasoning');
  await page.locator('.article-block').nth(1).locator('h2').filter({hasText:'哪些实验支持自由基'}).scrollIntoViewIfNeeded();
  await capture('mobile-JACS-scientific-reasoning');
  const selected=[
    {name:'mobile-ACS-SI-Table-S9',article:0,caption:'补充信息 SI Table S9'},
    {name:'mobile-JACS-Fig2-scope',article:1,caption:'原文 Fig. 2｜酰胺'},
    {name:'mobile-JACS-Fig3A-minimal',article:1,caption:'原文 Fig. 3A｜只差'},
    {name:'mobile-JACS-Fig4-mechanism',article:1,caption:'原文 Fig. 4D｜作者提出'}
  ];
  const blocks=page.locator('article.article-block');
  for(const item of selected){
    const group=blocks.nth(item.article).locator('.wx-content section').filter({hasText:item.caption}).last();
    if(await group.count()){
      await capture(item.name,group);
    }else{
      qa.evidence.push({name:item.name,error:'target caption not found'});
    }
  }
  // Image load is diagnostic, not a guarantee of WeChat's native client network.
  const all=page.locator('img');
  const statuses=[];
  for(let i=0;i<await all.count();i++){
    const img=all.nth(i);
    try{
      await img.scrollIntoViewIfNeeded({timeout:12000});
      await img.evaluate(el=>el.decode(),{timeout:9000});
      statuses.push(await img.evaluate(el=>({ok:el.complete&&el.naturalWidth>0,width:el.naturalWidth,height:el.naturalHeight})));
    }catch(e){statuses.push({ok:false,error:String(e).slice(0,200)})}
  }
  qa.images.imageLoadReport={
    observed:statuses.length,loaded:statuses.filter(x=>x.ok).length,
    missing:statuses.map((v,i)=>v.ok?null:i).filter(x=>x!==null),
    coversLoaded:statuses.slice(0,2).filter(x=>x.ok).length
  };
  qa.status='content_urls_and_image_count_pass';
  qa.imageDisplayNetworkStatus=statuses.every(x=>x.ok)?'all_loaded':'some_tencent_image_loads_failed_in_cloud_runner';
  qa.publicSend=false;
  await context.close();
  // Desktop first-screen visual as an independent layout check.
  const desktop=await browser.newContext({viewport:{width:980,height:940},deviceScaleFactor:1,locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
  const dp=await desktop.newPage();
  const dres=await dp.goto(PREVIEW,{waitUntil:'domcontentloaded',timeout:50000});
  if(!dres||!dres.ok())throw new Error('Desktop preview inaccessible');
  await dp.locator('.push-card-main').waitFor({timeout:10000});
  const desk=await dp.locator('.bundle-head').screenshot({animations:'disabled'});
  const path=OUTPUT+'/desktop-two-cover-header.png';
  await writeFile(path,desk);qa.evidence.push({path,sha256:digest(desk),bytes:desk.length});
  await desktop.close();
  console.log(JSON.stringify({status:qa.status,articleOrder:qa.articles,sourceLinks:qa.sourceLinks,images:qa.images,journalCountOnly:qa.journalCountOnly,evidence:qa.evidence.map(x=>x.path)},null,2));
}catch(e){qa.status='fail';qa.error=String(e);throw e;}
finally{await writeFile(OUTPUT+'/qa.json',JSON.stringify(qa,null,2)+'\n');await browser.close();}
