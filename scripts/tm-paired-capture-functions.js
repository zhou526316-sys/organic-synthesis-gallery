// Reviewed replacement functions for the self-contained userscript. Applied only on the upgrade branch.
// @function candidateRequestUrl
  function candidateRequestUrl(candidate) {
    // A high-resolution candidate must not be silently replaced by element.currentSrc.
    return normalizeUrl(candidate && candidate.url, location.href);
  }
// @function visualScope
  function visualScope(node) {
    if (!node || !node.closest) return null;
    if (node.closest('aside,nav,header,footer,[class*="recommend" i],[class*="related" i],[id*="related" i],[class*="reference" i]')) return null;
    var block = node.closest('figure,[role="figure"],.fig-section,.figure,.article-figure,.c-article-section__figure,[class*="graphical-abstract"],[class*="visual-abstract"],[id*="graphicalAbstract"]');
    if (!block) {
      var parent = node.parentElement;
      for (var depth = 0; parent && depth < 3; depth += 1, parent = parent.parentElement) {
        var captions = parent.querySelectorAll('figcaption,.caption,[class*="caption"]');
        if (captions.length === 1) { block = parent; break; }
      }
    }
    if (!block) return null;
    var caps = Array.from(block.querySelectorAll('figcaption,.caption,[class*="caption"],.figure-title'));
    var texts = caps.map(function (c) { return String(c.textContent || '').replace(/\s+/g, ' ').trim(); });
    var numbered = texts.filter(function (t) { return /^(?:Fig(?:ure)?\.?|Scheme|Chart)\s*\d+[a-z]?\b/i.test(t); });
    var labels = Array.from(new Set(numbered.map(function (t) { return articleFigureLabel(t, 0); })));
    if (labels.length > 1) return null; // Refuse a shared ancestor containing multiple Figures.
    var own = [node.getAttribute('alt'),node.getAttribute('title'),node.getAttribute('aria-label')].filter(Boolean).join(' ');
    var marker = [block.id, typeof block.className === 'string' ? block.className : '', texts[0] || '', own].join(' ');
    var label = labels[0] || (/^(?:Fig(?:ure)?\.?|Scheme|Chart)\s*\d+[a-z]?\b/i.test(own) ? articleFigureLabel(own, 0) : '');
    return { block: block, label: label, caption: (numbered[0] || texts[0] || own).slice(0, 600), official: !label && /graphical[\s_-]*abstract|visual[\s_-]*abstract|toc[\s_-]*(?:graphic|image)|abstract[\s_-]*image/i.test(marker) };
  }
// @function visualUrls
  function visualUrls(node, block, baseUrl) {
    var urls = articleFigureImageUrls(node, baseUrl);
    if (block) {
      block.querySelectorAll('a[href],source').forEach(function (link) {
        var href = normalizeUrl(link.getAttribute('href') || '', baseUrl);
        if (/\.(?:svg|png|jpe?g|webp|gif)(?:\?|$)/i.test(href) && !/\/doi\//i.test(href)) urls.unshift(href);
        if (link.tagName.toLowerCase() === 'source') urls = articleFigureImageUrls(link, baseUrl).concat(urls);
      });
    }
    return Array.from(new Set(urls.filter(Boolean))).slice(0, 6);
  }
// @function collectArticleFigureCandidates
  function collectArticleFigureCandidates(job, trace, root, baseUrl, sourceName) {
    var scope = root || document, rows = [], seen = new Set();
    scope.querySelectorAll('img,object[type^="image"]').forEach(function (node) {
      var context = visualScope(node);
      if (!context || !context.label || context.official) return;
      visualUrls(node, context.block, baseUrl || location.href).forEach(function (url, rank) {
        var key = context.label + '|' + url;
        if (seen.has(key) || reject(context.caption, url) || !candidateBelongsToJob(url, job)) return;
        seen.add(key);
        rows.push({url:url,kind:'article_figure',assetType:'article_figure',label:context.label,text:context.caption,source:'isolated_figure_caption',score:100-rank,element:node.tagName.toLowerCase()==='img'?node:null});
      });
    });
    rows.sort(function (a,b) { return String(a.label).localeCompare(String(b.label),undefined,{numeric:true}) || b.score-a.score; });
    pushTrace(trace,{stage:'figure_discovery',event:'scan_complete',status:rows.length?'found':'none',message:'isolated_labels='+new Set(rows.map(function(r){return r.label;})).size+';variants='+rows.length});
    return rows;
  }
// @function collectCandidates
  function collectCandidates(job, trace, root, baseUrl, sourceName, quiet) {
    var scope = root || document, rows = [], seen = new Set();
    function add(row) { if (!seen.has(row.url) && candidateBelongsToJob(row.url,job) && !reject(row.text,row.url)) { seen.add(row.url); rows.push(row); } }
    scope.querySelectorAll('img,object[type^="image"]').forEach(function(node) {
      var context=visualScope(node);
      if (!context) return;
      var kind=context.official?'official':context.label==='Figure 1' && job.allowFigureOne!==false?'figure1':'';
      if (!kind) return;
      visualUrls(node,context.block,baseUrl||location.href).forEach(function(url,rank) {
        add({url:url,kind:kind,assetType:kind==='official'?'graphical_abstract':'figure1_fallback',score:(kind==='official'?600:150)-rank,text:context.caption,source:'isolated_visual_caption',element:node.tagName.toLowerCase()==='img'?node:null});
      });
    });
    scope.querySelectorAll('head meta[name="citation_graphical_abstract"],head meta[name="citation_visual_abstract"],head meta[name="citation_toc_graphic"],head meta[name="citation_abstract_image"]').forEach(function(meta) {
      var url=normalizeUrl(meta.getAttribute('content'),baseUrl||location.href);
      if (url) add({url:url,kind:'official',assetType:'graphical_abstract',score:700,text:meta.getAttribute('name'),source:'article_head_metadata',element:null});
    });
    // No whole-page semantic windows: adjacent Scheme images must not inherit a TOC heading.
    rows.sort(function(a,b){return b.score-a.score;});
    if (!quiet) pushTrace(trace,{stage:'candidate_discovery',event:'scan_complete',status:rows.length?'found':'none',message:'strict_scope_candidates='+rows.length});
    return rows;
  }
// @function svgQuality
  function svgQuality(image) {
    if (image.contentType !== 'image/svg+xml') return null;
    try {
      var xml = atob(String(image.imageData).split(',')[1] || '');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return {usable:false,quality:'unsafe_svg',rank:0};
      var doc = new DOMParser().parseFromString(xml,'image/svg+xml');
      if (doc.querySelector('parsererror') || doc.documentElement.localName!=='svg') return {usable:false,quality:'invalid_svg',rank:0};
      var bad=false;
      doc.querySelectorAll('*').forEach(function(el) {
        if (/^(?:script|foreignObject|iframe|object|embed|animate|animateMotion|animateTransform|set)$/i.test(el.localName)) bad=true;
        Array.from(el.attributes).forEach(function(a) {
          if (/^on/i.test(a.name)) bad=true;
          if (/(?:^|:)href$/i.test(a.name) && !/^#/.test(a.value) && !/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(a.value)) bad=true;
        });
      });
      if (bad || /@import|url\(\s*["']?\s*(?:https?:|\/\/|data:)/i.test(xml)) return {usable:false,quality:'unsafe_svg',rank:0};
      var vector=doc.querySelector('path,polygon,polyline,line,rect,circle,ellipse,text,use');
      var embedded=Boolean(doc.querySelector('image'));
      if (vector && image.width>0 && image.height>0) return {usable:true,quality:embedded?'vector_mixed':'vector',rank:(embedded?15000000:30000000)+Math.min(image.width*image.height,10000000)};
      return null; // A raster-only SVG wrapper still has to pass raster thresholds.
    } catch (_) { return {usable:false,quality:'invalid_svg',rank:0}; }
  }
// @function measuredQuality
  function measuredQuality(image, role) {
    var svg=svgQuality(image);
    if (svg) return svg;
    var q=articleFigureResolution(image.width,image.height);
    if (role==='toc' && image.width>=200 && image.height>=90 && image.width*image.height>=24000) q={usable:true,quality:q.quality==='high'?'high':'usable'};
    return {usable:q.usable,quality:q.quality,rank:q.usable?image.width*image.height:0};
  }
// @function acquireBestVisual
  async function acquireBestVisual(job, candidates, trace, cache, role) {
    var best=null;
    for (var i=0;i<Math.min(candidates.length,4);i+=1) {
      if (Date.now()>job.captureDeadline) break;
      if (isAbortRequested()) throw new Error('user_aborted');
      var candidate=candidates[i];
      assertBoundCaptureJob(job,candidate.url);
      try {
        var image=cache.get(candidate.url);
        if (image===undefined) { image=await acquireImage(candidate,trace); cache.set(candidate.url,image); }
        if (!image) continue;
        // Preserve the URL that actually supplied the bytes, including canvas and redirects.
        var actual=image.sourceUrl||candidate.url;
        assertBoundCaptureJob(job,actual);
        var quality=measuredQuality(image,role);
        pushTrace(trace,{stage:'figure_quality',event:'measured',status:quality.quality,url:actual,imageWidth:image.width,imageHeight:image.height,message:role+';label='+(candidate.label||candidate.kind)+';method='+image.method});
        if (!quality.usable) continue;
        if (!best || quality.rank>best.quality.rank) best={candidate:Object.assign({},candidate,{url:actual}),image:image,quality:quality};
        if (quality.quality==='vector') break;
      } catch(error) {
        if (/doi_mismatch|job_.*(?:stale|mismatch)|unbound|user_aborted/.test(String(error.message))) throw error;
        pushTrace(trace,{stage:'quality_candidate',event:'failed',status:'failed',url:candidate.url,message:String(error.message)});
      }
    }
    return best;
  }
// @function waitForPairedVisuals
  async function waitForPairedVisuals(job,trace) {
    var started=Date.now(),step=0,lastSignature='',stable=0;
    var toc=[],figures=[];
    while (Date.now()-started<90000 && Date.now()<job.captureDeadline) {
      if (isAbortRequested()) throw new Error('user_aborted');
      assertBoundCaptureJob(job);
      var state=pageState(job,trace);
      if (state.auth || state.challenge) {
        GM_setValue(progressKey(job.doi),{jobId:job.jobId,status:state.auth?'auth_wait':'challenge_wait',at:nowIso()});
        await sleep(2000); continue;
      }
      toc=collectCandidates(job,trace,document,location.href,'paired_dom',true);
      figures=collectArticleFigureCandidates(job,trace,document,location.href,'paired_dom');
      var signature=toc.map(function(x){return x.url;}).join('|')+'::'+figures.map(function(x){return x.label+'|'+x.url;}).join('|');
      stable=signature===lastSignature?stable+1:0;lastSignature=signature;
      if (step<5) {
        var h=Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0);
        try {window.scrollTo(0,Math.floor(h*step/4));}catch(_){}
        step+=1;stable=0;
      } else if (stable>=2 && (toc.length||figures.length||Date.now()-started>=18000)) break;
      await sleep(800);
    }
    return {toc:toc,figures:figures};
  }
// @function finishPairedJob
  async function finishPairedJob(job,result,trace,token) {
    result.doi=job.doi;result.jobId=job.jobId;result.version=VERSION;result.finishedAt=nowIso();
    GM_setValue(traceKey(job.doi),{doi:job.doi,jobId:job.jobId,status:result.status,trace:trace,finishedAt:result.finishedAt});
    // The controller acknowledges completed capture independently of diagnostic transport.
    GM_setValue(resultKey(job.doi),result);
    GM_deleteValue(progressKey(job.doi));
    await uploadReport(job,trace,result.status,result.reason,null,token);
    return result;
  }
// @function runPublisherJob
  async function runPublisherJob(job) {
    assertBoundCaptureJob(job);
    var token=writeToken(),trace=[],cache=new Map();
    job.publisher=job.publisher||publisherForDoi(job.doi);
    job.captureDeadline=Date.now()+6*60*1000;
    var result={status:'failed',reason:'',toc:{status:job.captureToc===false?'already_available':'pending'},figures:{status:'pending',discovered:0,stored:0,failed:0,items:[]},figuresImported:0,figuresStaged:0,published:false};
    pushTrace(trace,{stage:'job',event:'start',status:'running',url:location.href,message:'v'+VERSION+';paired_capture=1;need='+String(job.mediaNeed)});
    try {
      if (!token) throw new Error('write_token_missing');
      var discovered=await waitForPairedVisuals(job,trace);
      if (job.captureToc!==false) {
        try {
          var officials=discovered.toc.filter(function(c){return c.kind==='official';});
          var candidates=officials.length?officials:discovered.toc;
          var best=await acquireBestVisual(job,candidates,trace,cache,'toc');
          if (best) {
            var receipt=await uploadCapture(job,best.candidate,best.image,trace,token);
            result.toc={status:'stored',kind:best.candidate.kind,quality:best.quality.quality,imageUrl:receipt.imageUrl};
          } else result.toc={status:'not_found',reason:'no_usable_official_or_figure1'};
        } catch(error) {
          if (/doi_mismatch|stale|unbound|user_aborted/.test(String(error.message))) throw error;
          result.toc={status:'failed',reason:String(error.message)};
        }
      }
      var groups=new Map();
      discovered.figures.forEach(function(c){if(!groups.has(c.label))groups.set(c.label,[]);groups.get(c.label).push(c);});
      result.figures.discovered=groups.size;
      var labels=Array.from(groups.keys());
      // Twenty semantic figures per article, not twenty variants of the same image.
      for (var i=0;i<Math.min(labels.length,20);i+=1) {
        if (Date.now()>job.captureDeadline) {result.figures.limitReached=true;break;}
        var label=labels[i];
        try {
          var chosen=await acquireBestVisual(job,groups.get(label),trace,cache,'figure');
          if (!chosen) throw new Error('no_usable_figure_variant');
          var stored=await uploadArticleFigure(job,chosen.candidate,chosen.image,trace,token,i);
          result.figures.items.push({label:label,status:'staged',quality:chosen.quality.quality,width:chosen.image.width,height:chosen.image.height,sourceUrl:chosen.candidate.url,contentHash:stored.contentHash});
          result.figures.stored+=1;result.figuresStaged+=1;
        } catch(error) {
          if (/doi_mismatch|stale|unbound|user_aborted/.test(String(error.message))) throw error;
          result.figures.failed+=1;
          result.figures.items.push({label:label,status:'failed',reason:String(error.message)});
        }
      }
      if (labels.length>20) result.figures.limitReached=true;
      result.figures.status=!labels.length?'not_found':result.figures.failed||result.figures.limitReached?'partial':'staged';
      var tocOk=result.toc.status==='stored'||result.toc.status==='already_available';
      result.status=tocOk && result.figures.status==='staged'?'success':tocOk||result.figures.stored?'partial':'failed';
      result.reason='paired_capture;toc='+result.toc.status+';figures='+result.figures.stored+'/'+result.figures.discovered+';published=0';
    } catch(error) {
      result.status=String(error.message)==='user_aborted'?'aborted':(result.figures.stored||result.toc.status==='stored'?'partial':'failed');
      result.reason=String(error.message);
    }
    pushTrace(trace,{stage:'paired_result',event:'complete',status:result.status,message:result.reason});
    return finishPairedJob(job,result,trace,token);
  }
// @function pairedJobs
  function pairedJobs(queue,media) {
    if (!Array.isArray(queue.articles) || queue.articles.length!==Number(queue.webpageDoiCount) || Number(queue.mediaGeneration)!==1790082000000) throw new Error('paired_queue_requires_current_complete_registry');
    var seen=new Set();
    return queue.articles.map(function(raw) {
      var doi=normalizeDoi(raw.doi);
      if (!doi||seen.has(doi)) throw new Error('paired_queue_invalid_or_duplicate_doi');seen.add(doi);
      var record=(media.items||{})[doi]||{};
      var toc=record.toc||{};
      var official=Boolean(toc.available && toc.imageUrl && !/fallback/i.test(toc.reason||''));
      return Object.assign({},raw,{doi:doi,publisher:publisherForDoi(doi),mediaNeed:'toc+figures',state:official?'figure_gap':'no_visual',captureToc:!official,allowFigureOne:!official});
    });
  }
// @function controllerRun
  async function controllerRun() {
    if (!isGalleryPage() || globalThis.__OSG_PAIRED_CONTROLLER_BUSY__) return;
    if (GM_getValue(ENABLED_KEY,true)===false||isAbortRequested()) {badge('媒体抓取已暂停','#6b7280');return;}
    if (!writeToken()) {badge('请保留并配置原有 R2 写入令牌','#991b1b');return;}
    if (!acquireLease()) {badge('另一个 Gallery 控制页正在运行','#6b7280');return;}
    globalThis.__OSG_PAIRED_CONTROLLER_BUSY__=true;
    var renew=setInterval(renewLease,15000),summary=null;
    try {
      var queue=await getJson(QUEUE_URL+'?ts='+Date.now());
      var media=await getJson('https://zhou526316-sys.github.io/organic-synthesis-gallery/media-index.json?ts='+Date.now());
      var jobs=pairedJobs(queue,media);
      var generation=VERSION+':paired:'+String(queue.mediaGeneration)+':'+String(queue.generatedAt);
      function eligible(job) {
        var prior=GM_getValue(attemptKey(job.doi,generation,'figures'),null);
        if (prior && prior.version===VERSION && prior.status==='success') return false;
        if (prior && Date.now()-Date.parse(prior.finishedAt||0)<30*60*1000) return false;
        return true;
      }
      var available=jobs.filter(eligible),batch=selectBatchJobs(available,batchSize());
      summary={version:VERSION,queueGeneratedAt:queue.generatedAt,queueTotal:jobs.length,total:batch.length,startedAt:nowIso(),success:0,partial:0,failed:0,aborted:0,tocStored:0,figuresStaged:0,published:0,results:[]};
      GM_setValue(SUMMARY_KEY,summary);
      for (var i=0;i<batch.length;i+=1) {
        if(isAbortRequested()||GM_getValue(ENABLED_KEY,true)===false)break;
        var job=Object.assign({},batch[i],{jobId:crypto.randomUUID(),captureVersion:VERSION,startedAt:nowIso(),queueGeneratedAt:queue.generatedAt});
        GM_deleteValue(resultKey(job.doi));GM_deleteValue(progressKey(job.doi));GM_deleteValue(HEARTBEAT_KEY);GM_setValue(ACTIVE_JOB_KEY,job);
        badge('TOC＋正文图 '+(i+1)+'/'+batch.length+'：'+job.doi,'#1f2937');
        var tab=null,result;
        try {
          tab=GM_openInTab(articleUrl(Object.assign({},job,{mediaNeed:'figures'}))+'#osg-job='+encodeURIComponent(job.jobId),{active:job.publisher==='wiley',insert:true,setParent:true});
          result=await waitForResult(job,tab);
        } catch(error) {result={doi:job.doi,jobId:job.jobId,version:VERSION,status:'failed',reason:String(error.message),finishedAt:nowIso()};}
        finally {try{if(tab&&tab.close)tab.close();}catch(_){} GM_deleteValue(ACTIVE_JOB_KEY);}
        result.version=VERSION;
        summary.results.push(result);summary[result.status]=(summary[result.status]||0)+1;
        summary.tocStored+=result.toc&&result.toc.status==='stored'?1:0;
        summary.figuresStaged+=Number(result.figuresStaged||0);
        GM_setValue(attemptKey(job.doi,generation,'figures'),result);GM_setValue(SUMMARY_KEY,summary);
        if(result.status==='aborted')break;
        await sleep(3500);
      }
      summary.finishedAt=nowIso();GM_setValue(SUMMARY_KEY,summary);
      badge('本批：TOC '+summary.tocStored+'；正文图已暂存 '+summary.figuresStaged+'；完整抓取 '+summary.success+'，部分 '+summary.partial+'，失败 '+summary.failed+'（暂存不等于发布）','#374151');
      if(jobs.some(eligible)&&!isAbortRequested()&&GM_getValue(ENABLED_KEY,true)!==false) {
        if(nextBatchTimer!==null)clearTimeout(nextBatchTimer);
        nextBatchTimer=setTimeout(function(){nextBatchTimer=null;controllerRun();},NEXT_BATCH_DELAY_MS);
      }
    } catch(error) {badge('媒体主线未启动：'+String(error.message),'#991b1b');}
    finally {clearInterval(renew);globalThis.__OSG_PAIRED_CONTROLLER_BUSY__=false;var lease=GM_getValue(LEASE_KEY,null);if(lease&&lease.owner===CONTROLLER_ID)GM_deleteValue(LEASE_KEY);}
  }
// @function waitForResult
  async function waitForResult(job,tab) {
    var started=Date.now();
    while(Date.now()-started<8*60*1000) {
      if(!renewLease())throw new Error('controller_lease_lost');
      if(isAbortRequested()||GM_getValue(ENABLED_KEY,true)===false) return {doi:job.doi,jobId:job.jobId,status:'aborted',reason:'user_aborted',finishedAt:nowIso()};
      var result=GM_getValue(resultKey(job.doi),null);
      if(result&&result.jobId===job.jobId&&result.version===VERSION&&result.finishedAt) return result;
      var hb=currentPublisherHeartbeat();
      if(Date.now()-started>60000 && (!hb||hb.jobId!==job.jobId)) return {doi:job.doi,jobId:job.jobId,status:'failed',reason:'bound_publisher_heartbeat_missing',finishedAt:nowIso()};
      var progress=GM_getValue(progressKey(job.doi),null);
      if(progress&&/auth_wait|challenge_wait/.test(progress.status))badge('等待出版社验证：'+job.doi,'#92400e');
      await sleep(1000);
    }
    return {doi:job.doi,jobId:job.jobId,status:'failed',reason:'controller_timeout',finishedAt:nowIso()};
  }
