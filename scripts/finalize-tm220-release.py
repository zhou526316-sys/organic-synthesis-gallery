"""Finalize reviewed capture release. No old-media restoration or literature changes."""
from pathlib import Path

def change(path,old,new):
 p=Path(path);s=p.read_text()
 if new in s:return
 if s.count(old)!=1:raise RuntimeError(f'Patch anchor {path}: {old[:100]} ({s.count(old)})')
 p.write_text(s.replace(old,new,1))

p='public/toc-mainline.user.js'
change(p,"var generation=VERSION+':paired:'+String(queue.mediaGeneration)+':'+String(queue.generatedAt);","var generation=VERSION+':paired:'+String(queue.mediaGeneration); // Stable across metadata-only queue refreshes.")
change(p,"      var queue=await getJson(QUEUE_URL+'?ts='+Date.now());","      var caps=await getJson(WORKER+'/api/media/capture-capabilities');\n      if(caps.captureVersion!==VERSION||caps.mediaGeneration!==1790082000000||caps.mode!=='verified-staging')throw new Error('capture_server_upgrade_pending');\n      var queue=await getJson(QUEUE_URL+'?ts='+Date.now());")
change(p,"        if (prior && Date.now()-Date.parse(prior.finishedAt||0)<30*60*1000) return false;","        if (prior && !overnightRetryEligible(prior,Date.now())) return false;")
change(p,"        var job=Object.assign({},batch[i],{jobId:crypto.randomUUID(),captureVersion:VERSION,startedAt:nowIso(),queueGeneratedAt:queue.generatedAt});","        var priorAttempt=GM_getValue(attemptKey(batch[i].doi,generation,'figures'),null);\n        var job=Object.assign({},batch[i],{jobId:crypto.randomUUID(),captureVersion:VERSION,startedAt:nowIso(),queueGeneratedAt:queue.generatedAt});")
change(p,"        result.version=VERSION;","        result.version=VERSION;\n        result.retryCount=Number(priorAttempt&&priorAttempt.retryCount||0)+1;")
change(p,"    } catch(error) {badge('媒体主线未启动：'+String(error.message),'#991b1b');}","    } catch(error) {\n      badge('媒体主线暂缓：'+String(error.message)+'；60 秒后检查重连','#991b1b');\n      if(!isAbortRequested()&&GM_getValue(ENABLED_KEY,true)!==false) {clearTimeout(nextBatchTimer);nextBatchTimer=setTimeout(controllerRun,60000);}\n    }")
helper=r'''
  function overnightRetryEligible(prior, now) {
    if (!prior) return true;
    if (prior.status==='success') return false;
    var elapsed=now-Date.parse(prior.finishedAt||0);
    var count=Number(prior.retryCount||1);
    if (count>=3 && elapsed<12*60*60*1000) return false;
    if (prior.figures && prior.figures.status==='staged' && (prior.toc||{}).status!=='failed') return elapsed>=6*60*60*1000;
    return elapsed>=Math.min(count*30,180)*60*1000;
  }
  function checkpointKey(doi) { return P+'verified-capture:'+VERSION+':1790082000000:'+normalizeDoi(doi); }
  function readCheckpoint(doi) {
    var stored=GM_getValue(checkpointKey(doi),null);
    return stored&&stored.doi===normalizeDoi(doi)&&stored.version===VERSION?stored:{doi:normalizeDoi(doi),version:VERSION,figures:{}};
  }
  function saveCheckpoint(doi, value) {
    value.doi=normalizeDoi(doi);value.version=VERSION;value.updatedAt=Date.now();
    GM_setValue(checkpointKey(doi),value);
  }
'''
change(p,'  function pairedJobs(queue,media) {',helper+'\n  function pairedJobs(queue,media) {')
change(p,"    var token=writeToken(),trace=[],cache=new Map();","    var token=writeToken(),trace=[],cache=new Map();\n    var checkpoint=readCheckpoint(job.doi);checkpoint.figures=checkpoint.figures||{};\n    if(checkpoint.toc&&checkpoint.toc.status==='stored'&&Date.now()-checkpoint.updatedAt<6*60*60*1000)job.captureToc=false;")
change(p,"            result.toc={status:'stored',kind:best.candidate.kind,quality:best.quality.quality,imageUrl:receipt.imageUrl};","            result.toc={status:'stored',kind:best.candidate.kind,quality:best.quality.quality,imageUrl:receipt.imageUrl};\n            checkpoint.toc=result.toc;saveCheckpoint(job.doi,checkpoint);")
change(p,"      for (var i=0;i<Math.min(labels.length,20);i+=1) {","      var downloadedThisVisit=0;\n      for (var i=0;i<labels.length;i+=1) {")
change(p,"        var label=labels[i];\n        try {","        var label=labels[i];\n        var saved=checkpoint.figures[label];\n        if(saved&&saved.contentHash&&saved.sourceUrl&&groups.get(label).some(function(c){return c.url===saved.sourceUrl;})) {\n          result.figures.items.push(Object.assign({},saved,{status:'already_staged'}));result.figures.stored+=1;continue;\n        }\n        if(downloadedThisVisit>=20){result.figures.limitReached=true;break;}\n        downloadedThisVisit+=1;\n        try {")
change(p,"          result.figures.stored+=1;result.figuresStaged+=1;","          result.figures.stored+=1;result.figuresStaged+=1;\n          checkpoint.figures[label]=result.figures.items[result.figures.items.length-1];saveCheckpoint(job.doi,checkpoint);")
change(p,"      if (labels.length>20) result.figures.limitReached=true;","      if (result.figures.stored+result.figures.failed<labels.length) result.figures.limitReached=true;")
p='cloudflare/worker/src/index.js'
change(p,"  '/api/media/local-capture-index',","  '/api/media/local-capture-index',\n  '/api/media/capture-capabilities',")
anchor="  if (request.method === 'GET' && url.pathname === '/api/article-figures/staged') {"
change(p,anchor,"  if(request.method==='GET' && url.pathname==='/api/media/capture-capabilities') {\n    return json({captureVersion:'6.2.20',mediaGeneration:1790082000000,mode:'verified-staging',pairedCapture:true,bodyFigures:true,maxFiguresPerVisit:20,publishedAutomatically:false}, {headers:cors});\n  }\n"+anchor)
change(p,"    return resultResponse(await promoteStagedArticleFigures(request, env, await readJson(request)));","    return json({error:'verified_promotion_pending',stagedObjectsRetained:true},{status:503,headers:cors});")
s=Path(p).read_text()
if 'verified_staging_release;retain_original_objects' not in s:
 a=s.index('    ctx.waitUntil(\n      promoteStagedArticleFigures(');b=s.index('\n    );',a)+len('\n    );')
 s=s[:a]+"    console.log('ARTICLE_FIGURE_STAGE_PROMOTION_CRON_SKIPPED', 'verified_staging_release;retain_original_objects');"+s[b:];Path(p).write_text(s)
p='cloudflare/worker/src/local-captures.js'
change(p,"  return { bytes, contentType };",r'''  if (contentType === 'image/svg+xml') {
    const xml = new TextDecoder().decode(bytes);
    if (!/<svg[\s>]/i.test(xml) || /<!DOCTYPE|<!ENTITY|<(?:script|foreignObject|iframe|object|embed|animate\w*|set)\b|\son[a-z]+\s*=|@import/i.test(xml)) return null;
    for (const m of xml.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi)) {
      if (!m[2].startsWith('#') && !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(m[2])) return null;
    }
    if (/url\(\s*["']?\s*(?:https?:|\/\/|data:)|&#(?:x[0-9a-f]+|\d+);/i.test(xml)) return null;
  }
  return { bytes, contentType };''')
change(p,"previous && Number(previous.updatedAt || 0) >= MEDIA_REBUILD_EPOCH && captureBelongsToDoi(previous, doi) && previousPixels > 0","previous && previous.captureVersion==='6.2.20' && previous.pageDoi===doi && Number(previous.updatedAt || 0) >= MEDIA_REBUILD_EPOCH && captureBelongsToDoi(previous, doi) && previousPixels > 0")
p='scripts/test-tm-paired-capture.mjs'
old=" await page.evaluate(()=>document.querySelector('#graphicalAbstract').remove());"
new=" await page.evaluate(()=>{Object.keys(__gm).filter(k=>k.includes('verified-capture:')).forEach(k=>delete __gm[k]);__gm['osg-toc-v6:active-job'].captureToc=true;document.querySelector('#graphicalAbstract').remove();});"
change(p,old,new)
print('FINALIZED_TM220_CAPTURE_RELEASE')
