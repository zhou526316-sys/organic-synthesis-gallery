  // Explicit user control. Unlike graceful Continue, Start invalidates old work
  // synchronously and creates a fresh, independently fenced article pass.
  function manualRunBlocksAutomatic() {
    var m=GM_getValue(MANUAL_RUN_KEY,null);
    return Boolean(m && (!m.completedAt || m.owner!==CONTROLLER_ID));
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
      controllerRevision:CONTROLLER_REVISION,version:VERSION,mode:'manual_from_head',
      startedAt:run.startedAt,total:0,success:0,partial:0,failed:0,aborted:0,skipped:0,
      tocStored:0,figuresStaged:0,evidenceStored:0,results:[],phase:'starting'};
    GM_setValue(SUMMARY_KEY,run.summary);
    badge('已立即重新开始：旧任务已作废，正在从最新文献队首抓取','#175cd3');
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

  function manualCaptureJobs(queue,run) {
    // Reuse registry/DOI/generation validation and the latest-first comparator,
    // not historical attempts or inventory-based exclusion.
    return pairedJobs(queue,{items:{}}).map(function(j){return Object.assign({},j,{
      manualRunId:run.id,recaptureFromHead:true,captureToc:true,captureFigures:true,captureEvidence:true,
      mediaNeed:'toc+figures+evidence',state:'no_visual'});});
  }

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
      // Necessary network loading only: no previous-run reconciliation or inventory audit.
      var loaded=await Promise.all([getJson(QUEUE_URL+'?ts='+Date.now()),getJson(WORKER+'/api/media/capture-capabilities')]);
      if(!manualExecutionCurrent(run)||controllerPaused())return;
      var queue=loaded[0],caps=loaded[1];
      if(caps.captureVersion!==VERSION||caps.mediaGeneration!==1790082000000||caps.mode!=='verified-staging'
        ||caps.evidenceSchemaVersion!==EVIDENCE_SCHEMA_VERSION||String(caps.mediaControllerRevision)!==CONTROLLER_REVISION)throw new Error('capture_server_upgrade_pending');
      var pending=manualCaptureJobs(queue,run),seen=new Set(),queueCheckedAt=Date.now();
      summary.total=pending.length;summary.queueGeneratedAt=queue.generatedAt;summary.latestAddedDate=queue.latestAddedDate;summary.phase='running';manualSummary(run);
      while(pending.length&&manualExecutionCurrent(run)&&!controllerPaused()){
        if(!renewManualLease(run))return;
        var raw=pending.shift(),job=Object.assign({},raw,{jobId:crypto.randomUUID(),controllerId:manualLeaseOwner(run),
          captureVersion:VERSION,startedAt:nowIso(),queueGeneratedAt:queue.generatedAt,retryCount:1});
        seen.add(job.doi);
        // Respect actual publisher access/rate limits; skip that source, never
        // wait on stale controller state or erase the user's stored media.
        if(publisherAccessCooling(job)||publisherPacingCooling(job)){
          summary.skipped++;summary.results.push({doi:job.doi,status:'skipped',reason:'publisher_access_or_rate_limit',finishedAt:nowIso()});manualSummary(run);continue;
        }
        GM_deleteValue(resultKey(job.doi));GM_deleteValue(progressKey(job.doi));GM_deleteValue(HEARTBEAT_KEY);
        GM_setValue(ACTIVE_JOB_KEY,job);markPublisherDispatch(job);
        badge('从头抓 '+(summary.results.length+1)+'/'+summary.total+' · TOC＋正文图＋全文：'+job.doi,'#175cd3');
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
        summary.results.push(result);summary[result.status]=(summary[result.status]||0)+1;
        summary.tocStored+=result.toc&&result.toc.status==='stored'?1:0;
        summary.figuresStaged+=Number(result.figuresStaged||0);
        summary.evidenceStored+=result.fulltext&&result.fulltext.status==='stored'?1:0;
        // Archive per-run outcomes separately; never reset old result/receipt ledgers.
        GM_setValue(attemptKey(job.doi,'manual:'+run.id,'figures'),result);
        if(result.status==='success')GM_setValue(attemptKey(job.doi,VERSION+':paired:1790082000000','figures'),result);
        if(!result.toc)enqueueCaptureReport(job,[{stage:'controller',event:'manual_capture_result',status:result.status,message:result.reason,at:nowIso()}],result.status,result.reason,true,'');
        manualSummary(run);
        if(controllerPaused()||result.status==='aborted')break;
        if(pending.length){
          await sleep(3500); // Existing per-article courtesy interval, not restart delay.
          if(!manualExecutionCurrent(run))return;
          if(Date.now()-queueCheckedAt>=60000){
            queue=await getJson(QUEUE_URL+'?ts='+Date.now());
            if(!manualExecutionCurrent(run))return;
            pending=manualCaptureJobs(queue,run).filter(function(j){return !seen.has(j.doi);});
            summary.total=summary.results.length+pending.length;queueCheckedAt=Date.now();
          }
        }
      }
      if(manualExecutionCurrent(run)){
        summary.finishedAt=nowIso();summary.phase=controllerPaused()?'paused':'finished';manualSummary(run);
        var stored=GM_getValue(MANUAL_RUN_KEY,null);
        if(stored&&stored.id===run.id){stored.completedAt=summary.finishedAt;GM_setValue(MANUAL_RUN_KEY,stored);}
        badge(controllerPaused()?'本轮已暂停；点击“立即开始任务”可立刻从头重抓':'本轮从头抓取结束：成功 '+summary.success+'，部分 '+summary.partial+'，失败 '+summary.failed+'，跳过 '+summary.skipped,'#374151');
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
