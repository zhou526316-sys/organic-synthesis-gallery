  // Explicit user control. Unlike graceful Continue, Start invalidates old work
  // synchronously and creates a fresh, independently fenced article pass.
  function manualRunBlocksAutomatic() {
    var m=GM_getValue(MANUAL_RUN_KEY,null);
    return Boolean(m); // A completed explicit pass must not fall back to the old all-corpus scheduler.
  }

  function manualExecutionCurrent(run) {
    var m=GM_getValue(MANUAL_RUN_KEY,null);
    return Boolean(run&&!run.cancelled&&m&&m.id===run.id&&m.owner===CONTROLLER_ID);
  }

  function manualLeaseOwner(run) { return 'manual:'+run.id; }

  function cancelManualExecution(run) {
    if(!run)return;
    run.cancelled=true;
    if(run.renewTimer!=null)clearInterval(run.renewTimer);
    try{if(run.tab&&typeof run.tab.close==='function')run.tab.close();}catch(_){}
  }

  function installManualRestartListener() {
    if(typeof GM_addValueChangeListener!=='function')return;
    GM_addValueChangeListener(MANUAL_RUN_KEY,function(key,oldValue,newValue){
      if(!newValue||oldValue&&newValue.id===oldValue.id)return;
      if(manualExecution&&manualExecution.id!==newValue.id)cancelManualExecution(manualExecution);
      try{if(ownedTaskHandle)ownedTaskHandle.close();}catch(_){}
      ownedTaskHandle=null;
      if(!isGalleryPage()){
        // Close only a script-bound publisher task, never a user's unrelated tab.
        var bound='';try{bound=sessionStorage.getItem(P+'tab-job-binding')||'';}catch(_){}
        if(bound&&newValue.replacedJobId===bound){try{window.close();}catch(_){}}
      }
    });
  }

  function forceStartFromHead() {
    if(!isGalleryPage()){
      window.open('https://'+GALLERY_HOST+GALLERY_PATH+'#osg-start-from-head','_blank');return;
    }
    if(!writeToken()){badge('请先配置原有写入密钥，再立即开始','#991b1b');return;}
    var old=GM_getValue(ACTIVE_JOB_KEY,null);
    var run={id:crypto.randomUUID(),owner:CONTROLLER_ID,startedAt:nowIso(),
      replacedJobId:String(old&&old.jobId||''),cancelled:false,tab:null,renewTimer:null};
    cancelManualExecution(manualExecution);
    try{if(ownedTaskHandle)ownedTaskHandle.close();}catch(_){}
    ownedTaskHandle=null;
    if(nextBatchTimer!==null){clearTimeout(nextBatchTimer);nextBatchTimer=null;}
    if(controllerResumeTimer!==null){clearTimeout(controllerResumeTimer);controllerResumeTimer=null;}
    GM_deleteValue(RESUME_REQUEST_KEY);
    // The new session is the revocation barrier; an old completion cannot enter it.
    GM_setValue(MANUAL_RUN_KEY,{id:run.id,owner:CONTROLLER_ID,startedAt:run.startedAt,
      replacedJobId:run.replacedJobId,revision:IMMEDIATE_RESTART_REVISION});
    GM_deleteValue(ACTIVE_JOB_KEY);GM_deleteValue(HEARTBEAT_KEY);
    GM_deleteValue(ABORT_KEY);GM_setValue(ENABLED_KEY,true);
    CONTROLLER_STOP_REASON='';
    GM_setValue(LEASE_KEY,{owner:manualLeaseOwner(run),manualRunId:run.id,expiresAt:Date.now()+90000});
    manualExecution=run;
    run.summary={controllerRunId:'manual:'+run.id,lifecycleRevision:IMMEDIATE_RESTART_REVISION,
      controllerRevision:CONTROLLER_REVISION,version:VERSION,mode:'missing_only',missingRevision:MISSING_CAPTURE_REVISION,
      startedAt:run.startedAt,total:0,success:0,partial:0,failed:0,aborted:0,skipped:0,
      tocStored:0,figuresStaged:0,evidenceStored:0,results:[],phase:'starting'};
    GM_setValue(SUMMARY_KEY,run.summary);
    badge('已立即重新开始：旧任务已作废，正在生成最新文献缺项队列','#175cd3');
    // No lock wait, cooldown reset, cleanup await, review or grace timer here.
    run.promise=runManualFromHead(run);
    return run.promise;
  }

  function renewManualLease(run) {
    if(!manualExecutionCurrent(run)||controllerPaused())return false;
    var lease=GM_getValue(LEASE_KEY,null);
    if(!lease||lease.owner!==manualLeaseOwner(run))return false;
    GM_setValue(LEASE_KEY,{owner:manualLeaseOwner(run),manualRunId:run.id,expiresAt:Date.now()+90000});
    return true;
  }

  function manualSummary(run) {
    if(!manualExecutionCurrent(run))return false;
    GM_setValue(SUMMARY_KEY,run.summary);return true;
  }

  // Acquisition inventory, never a publication receipt or a count of the whole corpus.
  function captureNeedText(job) {
    if(!job)return '—';
    var parts=[];
    if(job.captureToc)parts.push(job.existingTocKind==='figure1'?'官方 TOC（已有 Figure 1）':'TOC');
    if(job.captureFigures)parts.push('正文图'+(job.missingFigureCount>0?'（缺 '+job.missingFigureCount+' 张）':''));
    if(job.captureEvidence)parts.push('文本（全文／摘要）');
    return parts.length?parts.join('＋'):'已齐全';
  }
  function captureEvidenceLevelText(level) {
    return ({complete:'完整正文',partial:'部分正文',abstract_only:'仅摘要'})[level]||'已有文本，完整度未确认';
  }
  function captureBatchDate(job) {
    // Site addition date first; original publication date is only the legacy fallback.
    return String(job.addedDate||job.date||'');
  }
  function compareMissingCaptureJobs(a,b) {
    return captureBatchDate(b).localeCompare(captureBatchDate(a))
      ||journalPriority(a)-journalPriority(b)
      ||String(b.date||'').localeCompare(String(a.date||''))
      ||String(a.doi).localeCompare(String(b.doi));
  }
  function validCapturedFigure(f) {
    if(!f||!f.label||!f.contentHash||!f.sourceUrl)return false;
    if(/^(?:high|usable|vector|vector_mixed)$/.test(String(f.quality||'')))return true;
    return articleFigureResolution(Number(f.width),Number(f.height)).usable;
  }
  function validReceiptForDoi(f,doi) {
    return validCapturedFigure(f)&&embeddedJobDois(f.sourceUrl).every(function(d){return d===doi;});
  }
  function mapCaptureRows(payload) {
    var out=new Map();
    if(payload&&Array.isArray(payload.items))payload.items.forEach(function(r){var d=normalizeDoi(r&&r.doi);if(d)out.set(d,r);});
    return out;
  }
  async function readMissingCaptureInventory(queue,run) {
    // These are metadata reads to select work, not a scan of publisher pages or old locks.
    var errors=[],mediaRows=[];
    function safe(name,p,valid){return p.then(function(x){if(!valid(x))throw new Error('invalid_inventory_shape');return x;}).catch(function(e){errors.push(name+':'+captureLiveError(e.message||e));return null;});}
    var dois=queue.articles.map(function(x){return normalizeDoi(x.doi);});
    var chunks=[];for(var i=0;i<dois.length;i+=250)chunks.push(dois.slice(i,i+250));
    async function readMedia(){
      // Bound concurrency and never exceed the Worker's 1200-DOI cap.
      for(var i=0;i<chunks.length;i+=2){
        if(run&&!manualExecutionCurrent(run))return null;
        var batches=await Promise.all(chunks.slice(i,i+2).map(function(ds){return safe('媒体库存',postReadJson(MEDIA_INVENTORY_ENDPOINT+'?ts='+Date.now(),{dois:ds,readOnly:true}),function(x){return x&&Array.isArray(x.items)&&x.items.length===ds.length&&new Set(x.items.map(function(r){return normalizeDoi(r.doi);})).size===ds.length&&x.items.every(function(r){return ds.indexOf(normalizeDoi(r.doi))>=0;});});}));
        batches.forEach(function(x){if(x)mediaRows=mediaRows.concat(x.items);});
      }
      return {items:mediaRows};
    }
    var all=await Promise.all([
      readMedia(),
      safe('TOC库存',getJson(CAPTURE_INDEX_URL+'?ts='+Date.now()),function(x){return x&&Array.isArray(x.items)&&x.items.length===Number(x.count);}),
      safe('正文图库存',getJson(WORKER+'/api/article-figures/staged?inventory=1&ts='+Date.now()),function(x){return x&&x.schemaVersion==='capture-inventory-v1'&&x.complete===true&&Array.isArray(x.items)&&x.items.length===Number(x.count);}),
      safe('文本库存',getPrivateJson(EVIDENCE_INVENTORY_ENDPOINT+'?ts='+Date.now(),writeToken()),function(x){return x&&Array.isArray(x.items)&&x.items.length===Number(x.count)&&x.truncated!==true;})
    ]);
    return {media:all[0],tocs:all[1],figures:all[2],evidence:all[3],errors:errors,readAt:nowIso()};
  }
  function missingCaptureDecision(raw,inventory) {
    var doi=normalizeDoi(raw.doi),media=inventory.mediaMap.get(doi),stage=inventory.figureMap.get(doi)||{};
    var cp=readCheckpoint(doi),figs={},unknown=[];
    var latestLocal=GM_getValue(resultKey(doi),null);
    var prior=GM_getValue(attemptKey(doi,VERSION+':paired:1790082000000','figures'),null);
    [cp.figures||{},stage.figures||{},media&&media.capturedFigures||[]].forEach(function(group){Object.keys(group).forEach(function(k){var f=group[k];if(validReceiptForDoi(f,doi))figs[f.label]=f;});});
    var localResults=[latestLocal,prior].filter(function(r){return r&&r.version===VERSION&&r.doi===doi&&Date.parse(r.finishedAt||'')>=1790082000000;});
    var expected=Math.max(0,Number(stage.expectedFigureCount||0),Number(cp.figureCoverage&&cp.figureCoverage.expected||0));
    localResults.forEach(function(r){expected=Math.max(expected,Number(r.figures&&r.figures.discovered||0));});
    var stagedCount=Object.keys(figs).length;
    var productionCount=media?Math.max(0,Number(media.figureCount||0)):0;
    var usableProduction=media?Math.max(0,productionCount-Number(media.lowQualityFigureCount||0)-Number(media.unknownQualityFigureCount||0)):0;
    var knownCount=stagedCount; // Per-label union, not an invalid sum/max of disjoint inventories.
    if(!media||!Array.isArray(media.capturedFigures))knownCount=Math.max(knownCount,usableProduction);
    var tocRows=inventory.tocMap.get(doi)||[];
    var official=tocRows.some(function(t){return t.kind==='official'&&t.imageUrl&&t.contentHash;})||Boolean(media&&((media.tocStored&&!/fallback/i.test(media.tocReason||''))||media.primaryKind==='official_visual'));
    var fallback=tocRows.some(function(t){return t.kind==='figure1'&&t.imageUrl;})||Boolean(media&&(media.primaryKind==='figure1'||media.figureOneStored));
    var tocKnown=official||Boolean(media&&inventory.tocsKnown);
    var figureKnown=(expected>0&&knownCount>=expected)||Boolean(media&&inventory.figuresKnown&&(expected>0||(productionCount===0&&stagedCount===0)));
    // A nonzero figure count alone is NOT proof that all body figures were captured.
    var needFigures=figureKnown&&(expected>0?knownCount<expected:knownCount===0);
    var text=inventory.evidenceMap.get(doi);
    var textLevel=text&&text.available!==false?String(text.evidenceLevel||'unknown'):'';
    if(!textLevel){
      var localText=localResults.find(function(r){return r.fulltext&&r.fulltext.status==='stored'&&r.fulltext.evidencePacketHash;});
      if(localText)textLevel=String(localText.fulltext.evidenceLevel||'unknown');
    }
    if(!tocKnown)unknown.push('TOC');if(!figureKnown)unknown.push('正文图完整度');if(!inventory.evidenceKnown&&!textLevel)unknown.push('文本');
    var job=Object.assign({},raw,{doi:doi,publisher:publisherForDoi(doi),missingOnly:true,recaptureFromHead:false,
      captureToc:tocKnown&&!official,captureFigures:needFigures,captureEvidence:inventory.evidenceKnown&&!textLevel,
      expectedFigureCount:expected,missingFigureCount:expected>0?Math.max(0,expected-knownCount):0,
      capturedFigures:figs,existingEvidenceLevel:textLevel,existingTocKind:official?'official':fallback?'figure1':'',
      unknownNeeds:unknown,allowFigureOne:!official&&!fallback&&isNatureScienceFamilyJob(raw)});
    job.mediaNeed=[job.captureToc?'toc':'',job.captureFigures?'figures':'',job.captureEvidence?'evidence':''].filter(Boolean).join('+');
    job.state=job.captureToc?'no_visual':job.captureFigures?'figure_gap':'evidence_gap';
    return job;
  }
  function buildMissingCaptureJobs(queue,run,rawInventory) {
    // Reuse complete registry validation, but don't reuse its historical TOC-first tiers.
    var rows=pairedJobs(queue,{items:{}}), inv=rawInventory||{};
    var inventory={mediaMap:mapCaptureRows(inv.media),tocMap:new Map(),figureMap:mapCaptureRows(inv.figures),evidenceMap:mapCaptureRows(inv.evidence),
      tocsKnown:Boolean(inv.tocs),figuresKnown:Boolean(inv.figures&&inv.figures.complete),evidenceKnown:Boolean(inv.evidence)};
    ((inv.tocs||{}).items||[]).forEach(function(t){var d=normalizeDoi(t.doi);if(!d||Number(t.mediaGeneration)!==1790082000000)return;var a=inventory.tocMap.get(d)||[];a.push(t);inventory.tocMap.set(d,a);});
    var jobs=[],unknownDois=0,unknownLayers={toc:0,figures:0,evidence:0};
    rows.forEach(function(raw){var job=missingCaptureDecision(raw,inventory);if(job.unknownNeeds.length)unknownDois++;
      job.unknownNeeds.forEach(function(n){unknownLayers[n==='TOC'?'toc':n==='文本'?'evidence':'figures']++;});
      if(job.mediaNeed){job.manualRunId=run.id;jobs.push(job);}
    });
    jobs.sort(compareMissingCaptureJobs);
    if(run.summary){run.summary.inventoryUnknown=unknownDois;run.summary.inventoryUnknownLayers=unknownLayers;run.summary.inventoryErrors=(inv.errors||[]).slice();run.summary.inventoryReadAt=inv.readAt||'';}
    return jobs;
  }
  function updateMissingQueueSummary(run,pending) {
    var s=run.summary;
    s.total=s.results.length+pending.length;
    s.pendingMissing=pending.length;
    s.remainingNeeds={toc:0,figures:0,evidence:0};
    pending.forEach(function(j){if(j.captureToc)s.remainingNeeds.toc++;if(j.captureFigures)s.remainingNeeds.figures++;if(j.captureEvidence)s.remainingNeeds.evidence++;});
    s.pendingPreview=pending.slice(0,12).map(function(j){return {doi:j.doi,journal:j.journal,addedDate:captureBatchDate(j),need:captureNeedText(j)};});
  }

  function manualCaptureJobs(queue,run) { return buildMissingCaptureJobs(queue,run,run.inventory); }

  async function waitManualResult(job,tab,run) {
    var deadline=Date.now()+8*60*1000;
    while(manualExecutionCurrent(run)){
      var result=completedPublisherResult(job);
      if(result)return result;
      if(controllerPaused())return {doi:job.doi,jobId:job.jobId,status:'aborted',reason:'user_aborted',finishedAt:nowIso()};
      if(!renewManualLease(run))throw new Error('manual_run_superseded');
      if(tab&&tab.closed===true)return {doi:job.doi,jobId:job.jobId,status:'failed',reason:'publisher_task_tab_closed',finishedAt:nowIso()};
      var elapsed=Date.now()-Date.parse(job.startedAt);
      var hb=currentPublisherHeartbeat();
      if(elapsed>60000&&(!hb||hb.jobId!==job.jobId))return {doi:job.doi,jobId:job.jobId,status:'failed',reason:'bound_publisher_heartbeat_missing',finishedAt:nowIso()};
      if(Date.now()>=deadline)return {doi:job.doi,jobId:job.jobId,status:'failed',reason:'controller_timeout',finishedAt:nowIso()};
      await sleep(500);
    }
    throw new Error('manual_run_superseded');
  }

  async function runManualFromHead(run) {
    var summary=run.summary;
    run.renewTimer=setInterval(function(){renewManualLease(run);},15000);
    try{
      // Immediate session replacement is already complete; read metadata to select only actual gaps.
      var loaded=await Promise.all([getJson(QUEUE_URL+'?ts='+Date.now()),getJson(WORKER+'/api/media/capture-capabilities')]);
      if(!manualExecutionCurrent(run)||controllerPaused())return;
      var queue=loaded[0],caps=loaded[1];
      if(caps.captureVersion!==VERSION||caps.mediaGeneration!==1790082000000||caps.mode!=='verified-staging'
        ||caps.evidenceSchemaVersion!==EVIDENCE_SCHEMA_VERSION||String(caps.mediaControllerRevision)!==CONTROLLER_REVISION)throw new Error('capture_server_upgrade_pending');
      pairedJobs(queue,{items:{}}); // Reject incomplete/deleted-DOI registry before inventory use.
      run.inventory=await readMissingCaptureInventory(queue,run);
      if(!manualExecutionCurrent(run)||controllerPaused())return;
      var pending=manualCaptureJobs(queue,run),seen=new Set(),queueCheckedAt=Date.now();
      updateMissingQueueSummary(run,pending);
      summary.total=pending.length;summary.queueGeneratedAt=queue.generatedAt;summary.latestAddedDate=queue.latestAddedDate;summary.phase='running';manualSummary(run);
      while(pending.length&&manualExecutionCurrent(run)&&!controllerPaused()){
        if(!renewManualLease(run))return;
        updateMissingQueueSummary(run,pending);manualSummary(run);
        var raw=pending.shift(),job=Object.assign({},raw,{jobId:crypto.randomUUID(),controllerId:manualLeaseOwner(run),
          captureVersion:VERSION,startedAt:nowIso(),queueGeneratedAt:queue.generatedAt,retryCount:1});
        seen.add(job.doi);
        // Respect actual publisher access/rate limits; skip that source, never
        // wait on stale controller state or erase the user's stored media.
        if(publisherAccessCooling(job)||publisherPacingCooling(job)){
          summary.skipped++;summary.results.push({doi:job.doi,status:'skipped',reason:'publisher_access_or_rate_limit',finishedAt:nowIso()});updateMissingQueueSummary(run,pending);manualSummary(run);continue;
        }
        GM_deleteValue(resultKey(job.doi));GM_deleteValue(progressKey(job.doi));GM_deleteValue(HEARTBEAT_KEY);
        GM_setValue(ACTIVE_JOB_KEY,job);markPublisherDispatch(job);
        badge('补缺 '+(summary.results.length+1)+'/'+summary.total+' · '+captureNeedText(job)+'：'+job.doi,'#175cd3');
        var result=null;
        try{
          run.tab=await Promise.resolve(GM_openInTab(articleUrl(job)+'#osg-job='+encodeURIComponent(job.jobId),{active:job.publisher==='wiley',insert:true,setParent:true}));
          if(!manualExecutionCurrent(run)){try{if(run.tab)run.tab.close();}catch(_){}return;}
          if(!run.tab||typeof run.tab.close!=='function')throw new Error('task_tab_handle_unavailable');
          result=await waitManualResult(job,run.tab,run);
        }catch(error){
          if(!manualExecutionCurrent(run))return;
          result={doi:job.doi,jobId:job.jobId,status:'failed',reason:String(error.message||error),finishedAt:nowIso()};
        }finally{
          // Nonblocking closure. The old job is no longer an authorized writer.
          var active=GM_getValue(ACTIVE_JOB_KEY,null);
          if(active&&active.jobId===job.jobId&&active.manualRunId===run.id)GM_deleteValue(ACTIVE_JOB_KEY);
          try{if(run.tab)run.tab.close();}catch(_){}run.tab=null;
        }
        if(!manualExecutionCurrent(run))return;
        result.version=VERSION;result.controllerRevision=CONTROLLER_REVISION;result.manualRunId=run.id;
        result.requestedNeeds=captureNeedText(job);
        if(result.status!=='aborted'&&job.captureEvidence&&(!result.fulltext||result.fulltext.status!=='stored')&&result.status==='success')result.status='partial';
        summary.results.push(result);summary[result.status]=(summary[result.status]||0)+1;
        summary.tocStored+=result.toc&&result.toc.status==='stored'?1:0;
        summary.figuresStaged+=Number(result.figuresStaged||0);
        summary.evidenceStored+=result.fulltext&&result.fulltext.status==='stored'?1:0;
        // Archive per-run outcomes separately; never reset old result/receipt ledgers.
        GM_setValue(attemptKey(job.doi,'manual:'+run.id,'figures'),result);
        if(result.status==='success')GM_setValue(attemptKey(job.doi,VERSION+':paired:1790082000000','figures'),result);
        if(!result.toc)enqueueCaptureReport(job,[{stage:'controller',event:'manual_capture_result',status:result.status,message:result.reason,at:nowIso()}],result.status,result.reason,true,'');
        updateMissingQueueSummary(run,pending);manualSummary(run);
        if(controllerPaused()||result.status==='aborted')break;
        if(pending.length){
          await sleep(3500); // Existing per-article courtesy interval, not restart delay.
          if(!manualExecutionCurrent(run))return;
          if(Date.now()-queueCheckedAt>=60000){
            queue=await getJson(QUEUE_URL+'?ts='+Date.now());
            if(!manualExecutionCurrent(run))return;
            pairedJobs(queue,{items:{}});
            run.inventory=await readMissingCaptureInventory(queue,run);
            if(!manualExecutionCurrent(run))return;
            pending=manualCaptureJobs(queue,run).filter(function(j){return !seen.has(j.doi);});
            updateMissingQueueSummary(run,pending);
            summary.total=summary.results.length+pending.length;queueCheckedAt=Date.now();
          }
        }
      }
      if(manualExecutionCurrent(run)){
        updateMissingQueueSummary(run,pending);
        summary.finishedAt=nowIso();summary.phase=controllerPaused()?'paused':summary.inventoryUnknown?'inventory_partial':'finished';manualSummary(run);
        var stored=GM_getValue(MANUAL_RUN_KEY,null);
        if(stored&&stored.id===run.id){stored.completedAt=summary.finishedAt;GM_setValue(MANUAL_RUN_KEY,stored);}
        badge(controllerPaused()?'本轮已暂停；点击“立即开始任务”可立刻从头重抓':'本轮缺项队列结束：成功 '+summary.success+'，部分 '+summary.partial+'，失败 '+summary.failed+'，跳过 '+summary.skipped,'#374151');
      }
    }catch(error){
      if(manualExecutionCurrent(run)){
        summary.finishedAt=nowIso();summary.stopReason=String(error.message||error);summary.phase='failed';manualSummary(run);
        badge('本轮无法继续：'+summary.stopReason+'；点击“立即开始任务”即可重新开始','#991b1b');
      }
    }finally{
      clearInterval(run.renewTimer);
      var lease=GM_getValue(LEASE_KEY,null);
      if(lease&&lease.owner===manualLeaseOwner(run))GM_deleteValue(LEASE_KEY);
    }
  }
