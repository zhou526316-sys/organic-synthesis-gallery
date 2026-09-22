// Functions embedded into the self-contained userscript by the release workbench.
  function captureContext(node) {
    var own = [node.getAttribute && node.getAttribute('alt'), node.getAttribute && node.getAttribute('title')].filter(Boolean).join(' ');
    var root = node;
    for (var depth = 0; root && depth < 7; depth += 1, root = root.parentElement) {
      var marker = String(root.id || '') + ' ' + String(root.className || '');
      if (/recommend|related[-_ ]|references|ref-list|most-read|advert|sidebar|navigation/i.test(marker) || /^(ASIDE|NAV|FOOTER)$/.test(root.tagName || '')) return '';
      if (depth === 0) continue;
      var captions = root.querySelectorAll('figcaption,.caption,.figure-caption,.fig-caption,.fig-label,.figure-title,.graphicAbstractTitle');
      var texts = Array.from(captions).map(function (x) { return String(x.textContent || '').trim(); });
      var text = texts.join(' ') || String(root.innerText || root.textContent || '').trim();
      var labels = Array.from(new Set((text.match(/\b(?:Figure|Fig\.?|Scheme|Chart)\s*\d+[A-Za-z]?\b/gi) || []).map(function (x) { return x.toLowerCase(); })));
      var images = root.querySelectorAll('img');
      // Never inherit a TOC marker from a parent containing several unrelated figures.
      if (images.length <= 2 && (captions.length || /figure|fig-section|fig-group|graphical|graphicAbstract|visual.?abstract|toc.?graphic/i.test(marker) || root.tagName === 'FIGURE')) {
        return (own + ' ' + marker + ' ' + text).replace(/\s+/g,' ').trim().slice(0,1800);
      }
      if (labels.length > 1 || images.length > 3 || /^(MAIN|ARTICLE|BODY)$/.test(root.tagName || '')) break;
    }
    return own;
  }

  function figureLabelKey(value) {
    return String(value || '').toLowerCase().replace(/^fig\.?\s*/, 'figure ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function collectArticleFigureCandidates(job, trace, root, baseUrl, sourceName) {
    var scope = root || document;
    var rows = [], seen = new Set();
    scope.querySelectorAll('img,source').forEach(function (node) {
      var context = captureContext(node);
      if (!context || !/\b(?:Figure|Fig\.?|Scheme|Chart)\s*\d+[A-Za-z]?\b/i.test(context)) return;
      if (/graphical\s*abstract|visual\s*abstract|toc\s*(?:graphic|image)/i.test(context)) return;
      var label = articleFigureLabel(context, 0);
      articleFigureImageUrls(node, baseUrl || location.href).forEach(function (url, rank) {
        var key = figureLabelKey(label) + ':' + url;
        if (seen.has(key) || reject(context,url) || !candidateBelongsToJob(url,job)) return;
        seen.add(key);
        rows.push({url:url,doi:job.doi,label:label,kind:'article_figure',assetType:'article_figure',text:context.slice(0,600),source:(sourceName || 'live_dom')+'_bounded_figure',score:100-rank,element:node.tagName==='IMG'?node:null});
      });
    });
    rows.sort(function(a,b){return String(a.label).localeCompare(String(b.label),undefined,{numeric:true}) || b.score-a.score;});
    var counts = {};
    rows = rows.filter(function(r){var k=figureLabelKey(r.label);counts[k]=(counts[k]||0)+1;return counts[k]<=4;}).slice(0,120);
    pushTrace(trace,{stage:'figure_discovery',event:'scan_complete',status:rows.length?'found':'none',message:'bounded_dom;labels='+Object.keys(counts).length+';candidates='+rows.length});
    return rows;
  }

  async function waitForArticleFigures(job, trace) {
    var accumulated = new Map();
    // Collect lazy-loaded later figures; do not stop on the first visible Figure 1.
    for (var pass=0;pass<7;pass+=1) {
      assertBoundCaptureJob(job);
      if(isAbortRequested()) throw new Error('user_aborted');
      collectArticleFigureCandidates(job,trace,document,location.href,'live_dom').forEach(function(r){accumulated.set(figureLabelKey(r.label)+':'+r.url,r);});
      if(pass<6){
        var h=Math.max(document.documentElement.scrollHeight,document.body&&document.body.scrollHeight||0);
        try{window.scrollTo({top:Math.round(h*(pass+1)/7),behavior:'instant'});}catch(_){}
        await sleep(900);
      }
    }
    return Array.from(accumulated.values());
  }

  function collectCandidates(job,trace,root,baseUrl,sourceName,quiet) {
    var scope=root||document, pageUrl=baseUrl||location.href, publisher=job.publisher||publisherForDoi(job.doi), map=new Map();
    scope.querySelectorAll('img,source,object[type^="image"],svg image').forEach(function(node){
      var context=captureContext(node);
      if(!context)return;
      articleFigureImageUrls(node,pageUrl).forEach(function(url,rank){
        if(reject(context,url)||!candidateBelongsToJob(url,job))return;
        var type=officialType(context,url,publisher);
        // Numbered body figures never become official because a distant ancestor mentions GA.
        if(/\b(?:Figure|Fig\.?|Scheme|Chart)\s*\d+\b/i.test(context) && !/^(?:Graphical|Visual)\s*Abstract/i.test(context))type='';
        var kind=type?'official':(job.state==='no_visual'&&isFigureOne(context)?'figure1':'');
        if(!kind)return;
        var row={url:url,doi:job.doi,kind:kind,assetType:type||'figure1_fallback',score:(kind==='official'?600:200)-rank,text:context.slice(0,600),source:(sourceName||'live_dom')+'_bounded_semantics',element:node.tagName==='IMG'?node:null};
        if(!map.has(url)||map.get(url).score<row.score)map.set(url,row);
      });
    });
    scope.querySelectorAll('head meta[name="citation_graphical_abstract"],head meta[name="citation_visual_abstract"],head meta[name="citation_toc_graphic"],head meta[name="citation_abstract_image"]').forEach(function(node){
      var url=normalizeUrl(node.content,pageUrl);if(!url||!candidateBelongsToJob(url,job))return;
      map.set(url,{url:url,doi:job.doi,kind:'official',assetType:'graphical_abstract',score:700,text:node.name,source:'explicit_graphical_metadata'});
    });
    var rows=Array.from(map.values()).sort(function(a,b){return b.score-a.score;});
    if(!quiet)pushTrace(trace,{stage:'candidate_discovery',event:'scan_complete',status:rows.length?'found':'none',message:'bounded_semantics;official='+rows.filter(function(r){return r.kind==='official';}).length});
    return rows;
  }

  function imageQuality(image) {
    if(image.contentType==='image/svg+xml'){
      try{
        var xml=atob(image.imageData.split(',')[1]);
        var doc=new DOMParser().parseFromString(xml,'image/svg+xml');
        if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')return {usable:false,quality:'invalid_svg',rank:0};
        if(doc.querySelector('script,foreignObject,iframe,object,embed'))return {usable:false,quality:'unsafe_svg',rank:0};
        var vectors=doc.querySelectorAll('path,line,polyline,polygon,circle,ellipse,text').length;
        var mixed=doc.querySelectorAll('image').length>0;
        if(vectors>0)return {usable:true,quality:mixed?'vector_mixed':'vector',rank:mixed?200000000:300000000};
      }catch(_){}
    }
    var q=articleFigureResolution(image.width,image.height);
    return {usable:q.usable,quality:q.quality,rank:Math.max(0,image.width*image.height)};
  }

  async function resolveImageLanding(candidate,trace) {
    if(!/\/figures\/\d+(?:[?#]|$)|\/view-large\//i.test(candidate.url))return [candidate];
    try{
      var response=await gmRequest({method:'GET',url:candidate.url,timeout:18000});
      if(Number(response.status)!==200)return [];
      if(!candidateBelongsToJob(response.finalUrl||candidate.url,{doi:candidate.doi}))return [];
      var html=String(response.responseText||'');if(html.length>2500000)return [];
      var doc=new DOMParser().parseFromString(html,'text/html');
      var pageIds=[];doc.querySelectorAll('head meta[name="citation_doi"],head link[rel="canonical"]').forEach(function(n){pageIds=pageIds.concat(embeddedJobDois(n.content||n.href));});
      if(pageIds.some(function(d){return d!==candidate.doi;}))return [];
      var out=[], scope=doc.querySelector('main')||doc;
      scope.querySelectorAll('figure img,.figure img,.fig-section img,.c-figure__image,img[data-test="figure-image"],a[href]').forEach(function(n){
        articleFigureImageUrls(n,response.finalUrl||candidate.url).forEach(function(url){
          if(!/\.(?:png|jpe?g|svg|webp)(?:[?#]|$)/i.test(url)||reject(n.alt||'',url)||!candidateBelongsToJob(url,{doi:candidate.doi}))return;
          // Dedicated figure page: accept an actual DOI-bearing source, not recommendations.
          var ids=embeddedJobDois(url);if(ids.length!==1||ids[0]!==candidate.doi)return;
          if(candidate.label&&/^Figure /i.test(candidate.label)){
            var number=String(candidate.label).match(/\d+/)[0], m=decodeURIComponent(url).match(/_Fig(\d+)_/i);
            if(m&&Number(m[1])!==Number(number))return;
          }
          out.push(Object.assign({},candidate,{url:url,element:null,source:'same_doi_figure_landing'}));
        });
      });
      var seen=new Set();return out.filter(function(r){if(seen.has(r.url))return false;seen.add(r.url);return true;}).sort(function(a,b){return (/\/full\//.test(b.url)?1:0)-(/\/full\//.test(a.url)?1:0);}).slice(0,3);
    }catch(e){pushTrace(trace,{stage:'image_landing',event:'failed',status:'failed',url:candidate.url,message:String(e.message)});return [];}
  }

  async function chooseBestImage(candidates,job,trace) {
    var best=null,attempts=0;
    for(var i=0;i<candidates.length&&attempts<4;i+=1){
      var variants=await resolveImageLanding(candidates[i],trace);
      for(var j=0;j<variants.length&&attempts<4;j+=1){
        attempts+=1;var c=variants[j];assertBoundCaptureJob(job,c.url);
        var image=await acquireImage(c,trace);if(!image)continue;
        var finalUrl=image.sourceUrl||c.url;assertBoundCaptureJob(job,finalUrl);
        var quality=imageQuality(image);
        pushTrace(trace,{stage:'figure_quality',event:'measured',status:quality.quality,url:finalUrl,imageWidth:image.width,imageHeight:image.height,message:'actual_bytes;'+(c.label||c.kind)});
        if(!best||quality.rank>best.quality.rank)best={candidate:Object.assign({},c,{url:finalUrl}),image:image,quality:quality};
        if(quality.quality==='vector'||(image.width>=1600&&quality.usable))return best;
      }
    }
    return best;
  }

  function buildRecoveryJobs(queue,manifest,staged) {
    if(!Array.isArray(queue.allPapers)||queue.allPapers.length!==Number(queue.webpageDoiCount)||queue.mediaGeneration!==1790082000000)throw new Error('recovery_queue_not_ready');
    var stageMap=new Map();(staged.items||[]).forEach(function(r){if(r.captureVersion!=='6.2.20'||r.pageDoi!==r.doi)return;if(!stageMap.has(r.doi))stageMap.set(r.doi,[]);stageMap.get(r.doi).push(r);});
    return queue.allPapers.map(function(p){
      var record=(manifest.items||{})[p.doi]||{};
      var toc=record.toc||{},receipt=GM_getValue(P+'receipt:6.2.20:'+p.doi,null)||{};
      var official=Boolean(toc.available&&toc.imageUrl&&!/fallback/i.test(toc.reason||''))||receipt.officialToc===true;
      var known={};((record.figures||{}).figures||[]).forEach(function(f){known[figureLabelKey(f.label||f.id)]=true;});
      (stageMap.get(p.doi)||[]).forEach(function(f){known[figureLabelKey(f.label||f.id)]=true;});
      Object.keys(receipt.labels||{}).forEach(function(k){known[k]=true;});
      var scanDone=receipt.scanComplete===true&&receipt.corpusVersion===queue.corpusVersion;
      if(official&&scanDone)return null;
      return Object.assign({},p,{state:official?'figure_gap':toc.available?'fallback_only':'no_visual',mediaNeed:official?'figures':scanDone?'toc':'toc+figures',knownFigureLabels:known,knownOfficialToc:official,corpusVersion:queue.corpusVersion});
    }).filter(Boolean);
  }

  async function runPublisherJob(job) {
    var trace=[],token=writeToken(),toc=null,tocCandidate=null,figureError='',tocError='',labels={},allLabels=[],stored=0,indexed=0;
    var receipt=GM_getValue(P+'receipt:6.2.20:'+job.doi,null)||{};
    Object.assign(labels,job.knownFigureLabels||{},receipt.labels||{});
    var needToc=job.mediaNeed!=='figures',needFigures=job.mediaNeed!=='toc';
    var heartbeat=setInterval(function(){var active=GM_getValue(ACTIVE_JOB_KEY,null);if(active&&active.jobId===job.jobId)writePublisherHeartbeat(job,'capturing');},4000);
    function saveReceipt(done){GM_setValue(P+'receipt:6.2.20:'+job.doi,{officialToc:Boolean(receipt.officialToc||job.knownOfficialToc||tocCandidate&&tocCandidate.kind==='official'),labels:labels,scanComplete:done,corpusVersion:job.corpusVersion,at:Date.now()});}
    try{
      assertBoundCaptureJob(job);if(!token)throw new Error('write_token_missing');
      pushTrace(trace,{stage:'job',event:'start',status:'running',url:location.href,message:'v'+VERSION+';job='+job.jobId+';need='+job.mediaNeed});
      // Main visual first, then collect the body's lazy-loaded Figures/Schemes on this same page.
      if(needToc){
        try{
          var candidates=await waitForCandidates(job,trace);
          var officials=candidates.filter(function(c){return c.kind==='official';});
          var pool=(officials.length?officials:candidates).slice(0,4);
          pool.forEach(function(c){c.doi=job.doi;});
          var best=await chooseBestImage(pool,job,trace);
          if(!best)throw new Error('no_toc_candidate_in_live_dom');
          toc=await uploadCapture(job,best.candidate,best.image,trace,token);tocCandidate=best.candidate;saveReceipt(false);
        }catch(e){tocError=String(e.message);}
      }
      if(needFigures){
        var rows=await waitForArticleFigures(job,trace),groups=new Map();
        rows.forEach(function(c){var k=figureLabelKey(c.label);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(c);});
        allLabels=Array.from(groups.keys());
        for(var entry of groups){
          if(isAbortRequested())throw new Error('user_aborted');
          if(labels[entry[0]])continue;
          if(stored>=20){figureError='per_visit_limit_resume_required';break;}
          try{
            var selected=await chooseBestImage(entry[1],job,trace);
            if(!selected||!selected.quality.usable)throw new Error('article_figure_no_usable_source');
            var res=await uploadArticleFigure(job,selected.candidate,selected.image,trace,token,allLabels.indexOf(entry[0]));
            labels[entry[0]]=true;stored+=1;if(res.indexed===true)indexed+=1;saveReceipt(false);
          }catch(e){figureError=String(e.message);}
        }
      }
      var scanComplete=needFigures&&allLabels.length>0&&allLabels.every(function(k){return labels[k];});
      if(!needFigures)scanComplete=receipt.scanComplete===true;
      saveReceipt(scanComplete);
      var okToc=!needToc||Boolean(toc),okFigures=!needFigures||scanComplete;
      var status=okToc&&okFigures?'success':(toc||stored)?'partial':'failed';
      var reason='toc='+(toc?1:0)+';figuresStored='+stored+';figuresIndexed='+indexed+';scanComplete='+scanComplete+';'+tocError+';'+figureError;
      GM_setValue(traceKey(job.doi),{doi:job.doi,jobId:job.jobId,version:VERSION,status:status,trace:trace,finishedAt:nowIso()});
      // The controller sees a nonce-bound media receipt even if diagnostic upload is slow.
      GM_setValue(resultKey(job.doi,job.jobId),{doi:job.doi,jobId:job.jobId,version:VERSION,status:status,reason:reason,tocStored:Boolean(toc),figuresStaged:stored,figuresIndexed:indexed,scanComplete:scanComplete,reportPending:true,finishedAt:nowIso()});
      await uploadReport(job,trace,status==='partial'?'success':status,reason,tocCandidate,token);
      var result=GM_getValue(resultKey(job.doi,job.jobId),{});result.reportPending=false;GM_setValue(resultKey(job.doi,job.jobId),result);
    }catch(e){
      var reason=String(e.message),status=reason==='user_aborted'?'aborted':'failed';saveReceipt(false);
      GM_setValue(traceKey(job.doi),{doi:job.doi,jobId:job.jobId,version:VERSION,status:status,trace:trace,finishedAt:nowIso()});
      GM_setValue(resultKey(job.doi,job.jobId),{doi:job.doi,jobId:job.jobId,version:VERSION,status:status,reason:reason,finishedAt:nowIso()});
      await uploadReport(job,trace,status,reason,null,token);
    }finally{clearInterval(heartbeat);}
  }
