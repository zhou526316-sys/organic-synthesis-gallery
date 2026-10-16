import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const dir='audit/wechat-working/2026-10-16-r1-cloud-readback';
const receipt=await load('audit/wechat-publisher/latest.json');
const gate=await load('audit/wechat-working/2026-10-16-review-gate.json');
const request=await load('audit/automation-triggers/wechat-oct16-cloud-readback.json');
const manifests=[await load('public/wechat-featured/2026-10-16.json'),await load('public/wechat-retrospective/levin-isoxazole-to-pyrrole-20261016.json')];
const edition=await load('public/wechat-editions/2026-10-16.json');
if(request.draftWriteAuthorized!==false||request.publicSendAuthorized!==false)throw Error('Read-only QA cannot authorize writes');
if(!['draft_add','draft_update','existing_draft'].includes(receipt.stage)||receipt.draft_readback!=='ok'||receipt.article_count!==2||receipt.paper_count!==35||receipt.publish_id!==null||receipt.publicationSlot!=='2026-10-16T08:00:00+08:00')throw Error('Wrong actual cloud receipt');
if(request.previewUrl!==receipt.preview_url||request.expectedMediaId!==receipt.media_id||receipt.media_id===gate.existingOct15MediaIdPreserved)throw Error('Wrong draft identity or October15 overwritten');
if(gate.textReview!=='pass'||gate.imageReview!=='pass'||gate.assets.length!==43||gate.revision!=='2026-10-16-r1')throw Error('Source gate mismatch');
const norm=s=>String(s).normalize('NFC').replace(/\s+/g,'');
const result={date:'2026-10-16',revision:'2026-10-16-r1',status:'pending',readOnly:true,previewUrl:receipt.preview_url,mediaId:receipt.media_id,publishId:null,articleCount:2,dailyCount:35,scienceFigureCount:41,coverCount:2,nativeWechatClientInspected:false,checks:{},screenshots:[]};
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'zh-CN',timezoneId:'Asia/Shanghai'});
 const page=await context.newPage();
 await page.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 const response=await page.goto(receipt.preview_url,{waitUntil:'domcontentloaded',timeout:90000});
 if(!response?.ok())throw Error('Cloud preview response is not successful');
 await page.locator('article.article-block').first().waitFor({timeout:25000});
 const facts=await page.evaluate(()=>{
  const as=[...document.querySelectorAll('article.article-block')];
  return {titles:as.map(a=>a.querySelector('h1')?.textContent.trim()),links:as.map(a=>a.querySelector('a.source-link')?.getAttribute('href')),texts:as.map(a=>a.querySelector('.wx-content')?.innerText||''),imageCounts:as.map(a=>a.querySelectorAll('.wx-content img').length),covers:document.querySelectorAll('.bundle-head .push-card img').length,overflow:document.documentElement.scrollWidth>innerWidth+2};
 });
 if(JSON.stringify(facts.titles)!==JSON.stringify([edition.title,manifests[1].title]))throw Error('Native title/order mismatch');
 if(JSON.stringify(facts.links)!==JSON.stringify(gate.exactReadOriginal))throw Error('Precise DOI source URLs mismatch');
 if(facts.overflow||facts.covers!==2||facts.imageCounts[0]<22||facts.imageCounts[1]!==20)throw Error('Missing source images or mobile overflow');
 result.checks.titles=facts.titles;result.checks.links=facts.links;result.checks.imagesPerArticle=facts.imageCounts;
 result.checks.mobileOverflow=facts.overflow;result.checks.allProseByArticle=[];result.checks.figureOrderByArticle=[];
 for(let i=0;i<2;i++){
  const m=manifests[i],text=norm(facts.texts[i]);
  const paragraphs=m.quick_points.map(q=>q.text).concat(m.sections.flatMap(s=>s.paragraphs));
  for(const p of paragraphs)if(!text.includes(norm(p)))throw Error('Reviewed paragraph absent '+i+': '+p.slice(0,70));
  if(!text.includes(norm(m.ai_notice)))throw Error('Evidence/source-boundary statement missing '+i);
  result.checks.allProseByArticle.push(paragraphs.length);
  const order=[m.lead_figure_id];for(const s of m.sections)for(let k=1;k<=s.paragraphs.length;k++)order.push(...(s.figures_after_paragraph[String(k)]||[]));
  let previous=-1;
  for(const id of order){const f=m.figures.find(f=>f.id===id),at=text.indexOf(norm(f.caption));if(at<0||at<=previous)throw Error('Caption/order mismatch '+id);previous=at;}
  result.checks.figureOrderByArticle.push(order.length);
 }
 for(const [journal,n] of Object.entries(edition.dailyReleaseSnapshot.journals))if(!norm(facts.texts[0]).includes(norm(journal+' '+n+' 篇')))throw Error('Daily journal count mismatch '+journal);
 if(!norm(facts.texts[0]).includes('今日新增35篇文献'))throw Error('Daily total mismatch');
 if(!facts.texts[1].includes('审稿人1')||!facts.texts[1].includes('审稿人2')||!facts.texts[1].includes('第二轮')||!facts.texts[1].includes('TEMPO')||!facts.texts[0].includes('未取得对应审稿报告'))throw Error('Peer-review provenance or limits omitted');
 const images=page.locator('img'),inspected=[];
 for(let i=0;i<await images.count();i++){
  const im=images.nth(i);await im.scrollIntoViewIfNeeded();
  inspected.push(await im.evaluate(async x=>{try{await Promise.race([x.decode(),new Promise((_,no)=>setTimeout(()=>no(Error('image timeout')),8000))]);return {ok:x.naturalWidth>0,w:x.naturalWidth,h:x.naturalHeight};}catch(e){return {ok:false,error:String(e).slice(0,100)};}}));
 }
 result.checks.totalImageTags=inspected.length;result.checks.loaded=inspected.filter(x=>x.ok).length;result.checks.broken=inspected.filter(x=>!x.ok);
 if(inspected.length<44||result.checks.broken.length)throw Error('Missing or broken actual cloud images');
 async function shot(name,locator){if(locator)await locator.scrollIntoViewIfNeeded();else await page.evaluate(()=>scrollTo(0,0));const path=dir+'/'+name+'.png';await page.screenshot({path});result.screenshots.push(path);}
 await shot('mobile-cover-bundle');
 const blocks=page.locator('article.article-block');
 for(let i=0;i<2;i++){
  await shot(i?'levin-opening':'jacs-opening',blocks.nth(i));
  const hs=blocks.nth(i).locator('.wx-content h2');
  for(let h=1;h<await hs.count();h++)await shot((i?'levin':'jacs')+'-section-'+String(h).padStart(2,'0'),hs.nth(h));
 }
 const desktop=await browser.newPage({viewport:{width:980,height:900}});
 await desktop.goto(receipt.preview_url,{waitUntil:'domcontentloaded',timeout:90000});
 result.checks.desktopOverflow=await desktop.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
 if(result.checks.desktopOverflow)throw Error('Desktop overflow');
 await desktop.screenshot({path:dir+'/desktop-opening.png'});result.screenshots.push(dir+'/desktop-opening.png');await desktop.close();
 await context.close();result.status='official_draft_get_full_prose_original_figures_links_and_browser_layout_pass';
 console.log(JSON.stringify(result));
}catch(e){result.error=String(e);throw e;}
finally{await browser.close();await writeFile(dir+'/cloud-qa.json',JSON.stringify(result,null,2)+'\n');}
