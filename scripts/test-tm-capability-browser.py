import asyncio,base64,io,json,pathlib,shutil
from playwright.async_api import async_playwright
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1]
SCRIPT=(ROOT/'public/toc-mainline.user.js').read_text()
start=SCRIPT.rindex('  installMenu();')
SCRIPT=SCRIPT[:start]+'''globalThis.cap={captureContext,collectCandidates,collectArticleFigureCandidates,imageQuality,chooseBestImage,buildRecoveryJobs,assertBoundCaptureJob,bindPublisherCaptureJob,runPublisherJob,resultKey,resolveImageLanding,candidateRequestUrl};\n})();'''
DOI='10.1038/s44160-026-01155-9';nonce='12345678-1234-1234-1234-123456789012'
def png(w,h):
 out=io.BytesIO();Image.new('RGB',(w,h),(250,250,250)).save(out,'PNG');return out.getvalue()
IMAGES={'small.png':png(685,453),'large.png':png(1200,793)}
SVG='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><path d="M10,10L300,100"/><text x="20" y="30">Reaction Scheme</text></svg>'
HTML=f'''<html><head><meta name="citation_doi" content="{DOI}"></head><body><main><article>
<figure id="ga"><figcaption>Visual Abstract</figcaption><img alt="Visual Abstract" src="http://127.0.0.1:8765/10.1038/s44160-026-01155-9/large.png"></figure>
<figure id="f1"><figcaption>Figure 1. Reaction overview</figcaption><img alt="Figure 1" src="http://127.0.0.1:8765/10.1038/s44160-026-01155-9/small.png" srcset="http://127.0.0.1:8765/10.1038/s44160-026-01155-9/small.png 685w, http://127.0.0.1:8765/10.1038/s44160-026-01155-9/large.png 1200w"></figure>
<figure id="s2"><figcaption>Scheme 2. Mechanism</figcaption><img alt="Scheme 2" src="http://127.0.0.1:8765/10.1038/s44160-026-01155-9/vector.svg"></figure>
</article><aside class="related-content"><figure><figcaption>Figure 9. Recommended paper</figcaption><img src="http://127.0.0.1:8765/opaque.png"></figure></aside></main></body></html>'''
async def main():
 results=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox'])
  page=await browser.new_page()
  await page.route('**/*',lambda r:r.abort())
  await page.set_content(HTML)
  await page.evaluate("""(images)=>{const memory=new Map();Object.defineProperty(window,'sessionStorage',{value:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v))}});window.fetch=async u=>{let hit=Object.keys(images).find(n=>String(u).includes(n));if(!hit)return new Response('not found',{status:404});const data=images[hit];let bytes=Uint8Array.from(atob(data.bytes),c=>c.charCodeAt(0));return new Response(bytes,{status:200,headers:{'content-type':data.type}});}}""",{**{n:{'bytes':base64.b64encode(d).decode(),'type':'image/png'} for n,d in IMAGES.items()},'vector.svg':{'bytes':base64.b64encode(SVG.encode()).decode(),'type':'image/svg+xml'}})
  await page.evaluate('''([doi,nonce])=>{window.store={};window.writes=[];window.GM_getValue=(k,d)=>k in store?structuredClone(store[k]):d;window.GM_setValue=(k,v)=>{store[k]=structuredClone(v)};window.GM_deleteValue=k=>{delete store[k]};window.GM_xmlhttpRequest=o=>{if(o.method==='POST'){let p=JSON.parse(o.data);writes.push({url:o.url,payload:p});o.onload({status:200,responseText:JSON.stringify({doi:p.doi,id:p.id,stored:true,staged:true,indexed:true,kind:p.kind,imageUrl:'https://media.test/result.svg'})});return;}fetch(o.url).then(async r=>o.onload({status:r.status,response:await r.arrayBuffer(),responseHeaders:'content-type: '+r.headers.get('content-type'),finalUrl:r.url})).catch(e=>o.onerror(e));};window.job={doi,publisher:'nature',jobId:nonce,captureVersion:'6.2.20',startedAt:new Date().toISOString(),mediaNeed:'toc+figures',state:'no_visual',corpusVersion:'test'};store['osg-toc-v6:active-job']=structuredClone(job);store['osg-toc-v6:write-token']='test-fixture-only';sessionStorage.setItem('osg-toc-v6:tab-job-binding',nonce);}''',[DOI,nonce])
  await page.evaluate(SCRIPT)
  async def check(name,expression):
   assert await page.evaluate(expression),name
   results.append(name)
  await check('bound publisher document passes','cap.assertBoundCaptureJob(job)===job.doi')
  await check('GA separate from numbered body figures',"cap.collectCandidates(job,[]).filter(c=>c.kind==='official').every(c=>c.text.includes('Visual Abstract'))")
  await check('recommendation figure excluded',"!cap.collectArticleFigureCandidates(job,[]).some(c=>c.label==='Figure 9')")
  await check('both Figures and Schemes discovered',"new Set(cap.collectArticleFigureCandidates(job,[]).map(c=>c.label)).size===2")
  await check('actual 1200 pixel source chosen over 685',"(async()=>{const r=await cap.chooseBestImage(cap.collectArticleFigureCandidates(job,[]).filter(c=>c.label==='Figure 1'),job,[]);return r.image.width===1200&&r.candidate.url.includes('large.png')})()")
  await check('requested high-resolution URL is not replaced by preview currentSrc',"cap.candidateRequestUrl({url:'https://fixture.test/large.png',element:{currentSrc:'https://fixture.test/small.png'}}).endsWith('/large.png')")
  await check('ACS direct SVG is not treated as an HTML landing page',"(async()=>{let c={url:'https://pubs.acs.org/view-large/figure/123/jo6c01302_0003.svg',doi:'10.1021/acs.joc.6c01302'};return (await cap.resolveImageLanding(c,[]))[0]===c})()")
  await page.evaluate('(x)=>window.svgData=x','data:image/svg+xml;base64,'+base64.b64encode(SVG.encode()).decode())
  await check('small display-sized vector accepted',"cap.imageQuality({contentType:'image/svg+xml',imageData:svgData,width:320,height:120}).quality==='vector'")
  await check('wrong active nonce rejected',"(()=>{let x=job.jobId;store['osg-toc-v6:active-job'].jobId='old';try{cap.assertBoundCaptureJob(job);return false}catch(e){return e.message==='capture_job_stale_or_unbound'}finally{store['osg-toc-v6:active-job'].jobId=x}})()")
  await check('contradictory page metadata rejected',"(()=>{const m=document.querySelector('meta');m.content='10.1021/jacs.6c13517';try{cap.assertBoundCaptureJob(job);return false}catch(e){return e.message==='page_doi_mismatch'}finally{m.content=job.doi}})()")
  await check('recovered TOC skipped while body still scanned',"cap.buildRecoveryJobs({allPapers:[{doi:job.doi}],webpageDoiCount:1,mediaGeneration:1790082000000,corpusVersion:'test'},{items:{[job.doi]:{toc:{available:true,imageUrl:'restored.svg',reason:'reviewed_official_toc_recovery'}}}},{items:[]})[0].mediaNeed==='figures'")
  await page.evaluate('cap.runPublisherJob(job)')
  await check('one visit collects TOC and two body figures',"writes.filter(w=>w.url.includes('/local-capture/import')).length===1 && writes.filter(w=>w.url.endsWith('/article-figures/stage')).length===2")
  await check('all media writes include nonce and page DOI',"writes.filter(w=>w.payload.imageData).every(w=>w.payload.jobId===job.jobId&&w.payload.pageDoi===job.doi&&w.payload.captureVersion==='6.2.20')")
  await check('job-bound receipt reports indexed count',"(()=>{let r=store[cap.resultKey(job.doi,job.jobId)];return r.status==='success'&&r.figuresStaged===2&&r.figuresIndexed===2&&r.scanComplete===true})()")
  await check('completed scan is skipped next batch',"cap.buildRecoveryJobs({allPapers:[{doi:job.doi}],webpageDoiCount:1,mediaGeneration:1790082000000,corpusVersion:'test'},{items:{}},{items:[]}).length===0")
  await browser.close()
 print('CAPABILITY_BROWSER_TESTS '+json.dumps({'passed':len(results),'cases':results,'publisherNetworkCalls':0,'productionWrites':0,'fixtureBrowser':'Chromium'}))
if __name__=='__main__':asyncio.run(main())
