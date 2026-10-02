  // Queue coverage is per DOI and per requested layer; an attempt is not completion.
  function coverageHasNeeds(job) {
    return Boolean(job && (job.captureToc || job.captureFigures || job.captureEvidence));
  }
  function coverageNeedKey(job) {
    return [Boolean(job.captureToc),Boolean(job.captureFigures),Boolean(job.captureEvidence)].join('|');
  }
  function coverageTransient(reason) {
    return /(?:http_50[234]|timeout|page_not_ready|heartbeat_missing|NetworkError|Failed to fetch|gm_request|gm_then_fetch)/i.test(String(reason||''))
      && !/doi_mismatch|receipt_invalid|unbound|401|403|429|blocked by the user|Refused to connect|auth_|challenge_|access_gate/i.test(String(reason||''));
  }
  function coverageReason(result) {
    return [result.reason,(result.toc||{}).reason,(result.fulltext||{}).reason]
      .concat(((result.figures||{}).items||[]).filter(function(f){return f.status==='failed';}).map(function(f){return f.reason;})).filter(Boolean).join(';');
  }
  function coverageJobNeeds(job) {
    job.mediaNeed=[job.captureToc?'toc':'',job.captureFigures?'figures':'',job.captureEvidence?'evidence':''].filter(Boolean).join('+');
    return job;
  }
  function coverageMergePlan(run,jobs) {
    if(!run.coverage)run.coverage=new Map();
    (jobs||[]).forEach(function(raw){
      var old=run.coverage.get(raw.doi);
      if(!old){run.coverage.set(raw.doi,{job:Object.assign({},raw),attempts:0,done:{},noProgress:0,state:'pending',retryAt:0});return;}
      // Retain unresolved obligations on a partial inventory read; never replace
      // a known gap with a missing response. Positive current receipts still win.
      var j=Object.assign({},old.job,raw);
      ['captureToc','captureFigures','captureEvidence'].forEach(function(k){j[k]=!old.done[k]&&Boolean(old.job[k]||raw[k]);});
      j.capturedFigures=Object.assign({},old.job.capturedFigures||{},raw.capturedFigures||{});
      old.job=coverageJobNeeds(j);
      if(old.state==='resolved'&&coverageHasNeeds(old.job)){old.state='pending';old.retryAt=0;}
    });
  }
  function coverageRemaining(run,job,result) {
    var row=run.coverage.get(job.doi),next=Object.assign({},job),before=Object.keys(job.capturedFigures||{}).length;
    row.attempts++;row.lastReason=coverageReason(result);row.lastResult=result;
    var gained=0,figures=result.figures||{},toc=result.toc||{},text=result.fulltext||{};
    if(job.captureToc && (toc.status==='already_available'||toc.status==='stored'&&toc.kind!=='figure1')){
      next.captureToc=false;row.done.captureToc=true;gained++;
    }
    if(job.captureEvidence && text.status==='stored'){
      next.captureEvidence=false;next.existingEvidenceLevel=text.evidenceLevel||'unknown';row.done.captureEvidence=true;gained++;
    }
    var cp=readCheckpoint(job.doi);next.capturedFigures=Object.assign({},job.capturedFigures||{});
    Object.keys(cp.figures||{}).forEach(function(label){var f=cp.figures[label];if(validReceiptForDoi(f,job.doi))next.capturedFigures[label]=f;});
    (figures.items||[]).forEach(function(f){if(validReceiptForDoi(f,job.doi)&&/^(?:staged|already_staged|stored|reused)$/.test(f.status||''))next.capturedFigures[f.label]=f;});
    next.expectedFigureCount=Math.max(Number(job.expectedFigureCount||0),Number(figures.discovered||0));
    var saved=Math.max(Object.keys(next.capturedFigures).length,Number(figures.stored||0));
    next.missingFigureCount=Math.max(0,next.expectedFigureCount-saved);
    gained+=Math.max(0,Object.keys(next.capturedFigures).length-before);
    // Only proof of completion clears an image obligation, not partial/failed.
    if(job.captureFigures && figures.discovered>0 && figures.stored>=figures.discovered && Number(figures.failed||0)===0 && saved>=next.expectedFigureCount){
      next.captureFigures=false;row.done.captureFigures=true;gained++;
    }
    row.job=coverageJobNeeds(next);
    if(!coverageHasNeeds(next)){row.state='resolved';row.retryAt=0;return;}
    var retryAfter=Math.max(0,Number(result.retryAfterMs||0));
    if(result.status==='aborted'){row.state='paused';return;}
    if(/doi_mismatch|receipt_invalid|stale|unbound|401|403|429|auth_|challenge_|access_gate|permission|blocked by the user|Refused to connect/i.test(row.lastReason)){
      row.state='blocked';row.retryAt=0;return;
    }
    // Positive new receipts permit another continuation in this same run. A
    // failed figure/source gets only one no-progress transient retry, never a loop.
    row.noProgress=gained?0:row.noProgress+1;
    if(gained || coverageTransient(row.lastReason)&&row.noProgress<=1){
      row.state='pending';row.retryAt=Date.now()+Math.max(retryAfter,gained?3500:15000);
    }else{row.state='blocked';row.retryAt=0;}
  }
  function coveragePending(run) {
    return Array.from(run.coverage.values()).filter(function(r){return r.state==='pending'&&coverageHasNeeds(r.job);})
      .sort(function(a,b){return Number(a.attempts>0)-Number(b.attempts>0)||compareMissingCaptureJobs(a.job,b.job);});
  }
  function coverageStats(run) {
    var s=run.summary,rows=Array.from(run.coverage.values()),left=rows.filter(function(r){return coverageHasNeeds(r.job)&&r.state!=='removed';});
    s.total=rows.filter(function(r){return r.state!=='removed';}).length;
    s.visitedCount=rows.filter(function(r){return r.attempts>0&&r.state!=='removed';}).length;
    s.attemptCount=s.results.length;s.fullyResolved=rows.filter(function(r){return r.state==='resolved';}).length;
    s.unresolvedCount=left.length;s.blockedCount=left.filter(function(r){return r.state==='blocked';}).length;
    s.pendingMissing=left.filter(function(r){return r.state==='pending'||r.state==='active';}).length;
    s.remainingNeeds={toc:0,figures:0,evidence:0};
    left.forEach(function(r){if(r.job.captureToc)s.remainingNeeds.toc++;if(r.job.captureFigures)s.remainingNeeds.figures++;if(r.job.captureEvidence)s.remainingNeeds.evidence++;});
    s.pendingPreview=coveragePending(run).slice(0,12).map(function(r){var j=r.job;return {doi:j.doi,journal:j.journal,addedDate:captureBatchDate(j),need:captureNeedText(j)};});
    s.blockedPreview=left.filter(function(r){return r.state==='blocked';}).slice(0,12).map(function(r){return {doi:r.job.doi,need:captureNeedText(r.job),reason:captureLiveError(r.lastReason||'本次没有新进展')};});
    return s;
  }
  async function coverageWait(run,until) {
    while(Date.now()<until&&manualExecutionCurrent(run)&&!controllerPaused()){
      renewManualLease(run);await sleep(Math.min(1000,Math.max(1,until-Date.now())));
    }
  }
  async function runManualFromHead(run) {
    var s=run.summary;run.coverage=new Map();s.queueCoverageRevision=QUEUE_COVERAGE_REVISION;
    run.renewTimer=setInterval(function(){renewManualLease(run);},15000);
    try{
      var loaded=await Promise.all([getJson(QUEUE_URL+'?ts='+Date.now()),getJson(WORKER+'/api/media/capture-capabilities')]);
      if(!manualExecutionCurrent(run)||controllerPaused())return;
      var queue=loaded[0],caps=loaded[1];
      if(caps.captureVersion!==VERSION||caps.mediaGeneration!==1790082000000||caps.mode!=='verified-staging'||caps.evidenceSchemaVersion!==EVIDENCE_SCHEMA_VERSION||String(caps.mediaControllerRevision)!==CONTROLLER_REVISION)throw new Error('capture_server_upgrade_pending');
      var checkedAt=0,endRefresh=false,inventoryRecovery=0;
      async function refresh(){
        pairedJobs(queue,{items:{}});
        var next=await readMissingCaptureInventory(queue,run);
        if(!manualExecutionCurrent(run)||controllerPaused())return false;
        run.inventory=next;coverageMergePlan(run,manualCaptureJobs(queue,run));
        var currentDois=new Set(queue.articles.map(function(a){return normalizeDoi(a.doi);}));
        run.coverage.forEach(function(r,doi){if(!currentDois.has(doi))r.state='removed';});
        checkedAt=Date.now();s.queueGeneratedAt=queue.generatedAt;s.latestAddedDate=queue.latestAddedDate;
        coverageStats(run);manualSummary(run);return true;
      }
      if(!await refresh())return;s.phase='running';
      while(manualExecutionCurrent(run)&&!controllerPaused()){
        if(!renewManualLease(run))throw new Error('manual_run_superseded');
        var candidates=coveragePending(run),row=null;
        for(var i=0;i<candidates.length;i++){
          var candidate=candidates[i],job=candidate.job;
          if(publisherAccessCooling(job)){
            candidate.state='blocked';candidate.lastReason='publisher_access_or_rate_limit';s.skipped++;continue;
          }
          if(candidate.retryAt<=Date.now()&&!publisherPacingCooling(job)){row=candidate;break;}
        }
        if(!row){
          candidates=coveragePending(run);
          if(candidates.length){
            s.phase='retry_wait';coverageStats(run);manualSummary(run);
            await coverageWait(run,Date.now()+1000);continue;
          }
          if(!endRefresh || (s.inventoryErrors||[]).length&&inventoryRecovery<2){
            if(endRefresh){inventoryRecovery++;s.phase='inventory_retry';manualSummary(run);await coverageWait(run,Date.now()+15000);}
            if(!manualExecutionCurrent(run)||controllerPaused())break;
            queue=await getJson(QUEUE_URL+'?ts='+Date.now());
            if(!await refresh())return;endRefresh=true;continue;
          }
          break;
        }
        s.phase='running';row.state='active';
        var job=Object.assign({},row.job,{jobId:crypto.randomUUID(),controllerId:manualLeaseOwner(run),captureVersion:VERSION,startedAt:nowIso(),queueGeneratedAt:queue.generatedAt,retryCount:row.attempts+1});
        coverageStats(run);manualSummary(run);
        GM_deleteValue(resultKey(job.doi));GM_deleteValue(progressKey(job.doi));GM_deleteValue(HEARTBEAT_KEY);
        GM_setValue(ACTIVE_JOB_KEY,job);markPublisherDispatch(job);
        badge('连续补缺 · '+captureNeedText(job)+'：'+job.doi,'#175cd3');
        var result;
        try{
          run.tab=await Promise.resolve(GM_openInTab(articleUrl(job)+'#osg-job='+encodeURIComponent(job.jobId),{active:job.publisher==='wiley',insert:true,setParent:true}));
          if(!manualExecutionCurrent(run))return;
          if(!run.tab||typeof run.tab.close!=='function')throw new Error('task_tab_handle_unavailable');
          result=await waitManualResult(job,run.tab,run);
        }catch(error){if(!manualExecutionCurrent(run))return;result={doi:job.doi,jobId:job.jobId,status:'failed',reason:String(error.message||error),finishedAt:nowIso()};}
        finally{
          var active=GM_getValue(ACTIVE_JOB_KEY,null);
          if(active&&active.jobId===job.jobId&&active.manualRunId===run.id)GM_deleteValue(ACTIVE_JOB_KEY);
          try{if(run.tab)run.tab.close();}catch(_){}run.tab=null;
        }
        if(!manualExecutionCurrent(run))return;
        result.version=VERSION;result.controllerRevision=CONTROLLER_REVISION;result.manualRunId=run.id;result.requestedNeeds=captureNeedText(job);
        coverageRemaining(run,job,result);
        if(result.status==='success'&&coverageHasNeeds(row.job))result.status='partial';
        s.results.push(result);s[result.status]=(s[result.status]||0)+1;
        s.tocStored+=result.toc&&result.toc.status==='stored'?1:0;s.figuresStaged+=Number(result.figuresStaged||0);s.evidenceStored+=result.fulltext&&result.fulltext.status==='stored'?1:0;
        GM_setValue(attemptKey(job.doi,'manual:'+run.id,'figures'),result);
        if(row.state==='resolved')GM_setValue(attemptKey(job.doi,VERSION+':paired:1790082000000','figures'),result);
        if(!result.toc)enqueueCaptureReport(job,[{stage:'controller',event:'coverage_capture_result',status:result.status,message:result.reason,at:nowIso()}],result.status,result.reason,true,'');
        coverageStats(run);manualSummary(run);
        if(controllerPaused()||result.status==='aborted')break;
        await coverageWait(run,Date.now()+3500);
        if(!manualExecutionCurrent(run)||controllerPaused())break;
        if(Date.now()-checkedAt>=60000){queue=await getJson(QUEUE_URL+'?ts='+Date.now());if(!await refresh())return;}
      }
      if(manualExecutionCurrent(run)){
        coverageStats(run);s.finishedAt=nowIso();s.phase=controllerPaused()?'paused':s.unresolvedCount||s.inventoryUnknown?'blocked_remaining':'all_resolved';manualSummary(run);
        var stored=GM_getValue(MANUAL_RUN_KEY,null);if(stored&&stored.id===run.id){stored.completedAt=s.finishedAt;GM_setValue(MANUAL_RUN_KEY,stored);}
        badge(controllerPaused()?'已暂停':'已遍历全部待办：补齐 '+s.fullyResolved+' 篇；未补齐 '+s.unresolvedCount+' 篇；库存未确认 '+Number(s.inventoryUnknown||0)+' 篇','#374151');
      }
    }catch(error){
      if(manualExecutionCurrent(run)){coverageStats(run);s.finishedAt=nowIso();s.stopReason=String(error.message||error);s.phase='blocked_remaining';manualSummary(run);badge('抓取受阻，未完成项已保留：'+captureLiveError(s.stopReason),'#991b1b');}
    }finally{
      clearInterval(run.renewTimer);var lease=GM_getValue(LEASE_KEY,null);
      if(lease&&lease.owner===manualLeaseOwner(run))GM_deleteValue(LEASE_KEY);
    }
  }
