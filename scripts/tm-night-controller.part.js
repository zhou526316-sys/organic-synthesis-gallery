  function stableCaptureGeneration(queue) {
    return VERSION + ':paired:' + String(queue.mediaGeneration);
  }

  function captureCheckpointKey(doi) {
    return P + 'checkpoint:' + VERSION + ':1790082000000:' + normalizeDoi(doi);
  }

  function readCaptureCheckpoint(doi) {
    var state=GM_getValue(captureCheckpointKey(doi),null);
    return state && state.doi===normalizeDoi(doi) && state.version===VERSION ? state : {doi:normalizeDoi(doi),version:VERSION,figures:{},toc:null};
  }

  function saveCaptureCheckpoint(doi,state) {
    state.doi=normalizeDoi(doi);state.version=VERSION;state.updatedAt=nowIso();
    GM_setValue(captureCheckpointKey(doi),state);
  }

  function readPersistentTab() {
    return new Promise(function(resolve,reject){
      if(typeof GM_getTab!=='function') {reject(new Error('tampermonkey_tab_permission_missing'));return;}
      var timer=setTimeout(function(){reject(new Error('tampermonkey_tab_read_timeout'));},5000);
      GM_getTab(function(tab){clearTimeout(timer);resolve(tab||{});});
    });
  }

  async function launchBoundPublisherTab() {
    var id=(String(location.hash).match(/osg-job=([a-z0-9-]{16,80})/i)||[])[1];
    var job=GM_getValue(ACTIVE_JOB_KEY,null);
    if(!job||job.jobId!==id||job.captureVersion!==VERSION||isAbortRequested())throw new Error('capture_launcher_stale');
    if(typeof GM_saveTab!=='function')throw new Error('tampermonkey_tab_permission_missing');
    var tab=await readPersistentTab();
    tab.osgBoundCapture={doi:job.doi,jobId:id,version:VERSION};
    GM_saveTab(tab);
    for(var i=0;i<20;i+=1){
      var saved=await readPersistentTab();
      if(saved.osgBoundCapture && saved.osgBoundCapture.jobId===id){
        var active=GM_getValue(ACTIVE_JOB_KEY,null);
        if(!active||active.jobId!==id||isAbortRequested())throw new Error('capture_launcher_stale');
        location.replace(articleUrl(Object.assign({},job,{mediaNeed:'figures'}))+'#osg-job='+encodeURIComponent(id));
        return;
      }
      await sleep(100);
    }
    throw new Error('tampermonkey_tab_save_unverified');
  }

  async function bindPublisherCaptureJob(job) {
    if(typeof GM_getTab==='function'){
      var tab=await readPersistentTab(),bound=tab.osgBoundCapture;
      if(!bound||bound.jobId!==job.jobId||bound.doi!==job.doi||bound.version!==VERSION)throw new Error('capture_tab_job_mismatch');
      sessionStorage.setItem(P+'tab-job-binding',bound.jobId);
    } else {
      // Standalone fixture/older API fallback still requires a nonce carried by this tab.
      var match=String(location.hash||'').match(/(?:^#|&)osg-job=([a-z0-9-]{16,80})(?:&|$)/i);
      if(match)sessionStorage.setItem(P+'tab-job-binding',match[1]);
    }
    for(var i=0;i<10;i+=1){
      try{return assertBoundCaptureJob(job);}
      catch(error){if(String(error.message)!=='page_doi_unverified'||i===9)throw error;await sleep(500);}
    }
  }

  function nightRetryState(job,generation) {
    var prior=GM_getValue(attemptKey(job.doi,generation,'figures'),null);
    var pub=GM_getValue(P+'publisher-pause:'+job.publisher,null);
    var now=Date.now();
    if(pub&&Number(pub.until)>now)return {eligible:false,nextAt:Number(pub.until)};
    if(prior&&prior.version===VERSION){
      if(prior.status==='success')return {eligible:false,done:true};
      if(Number(prior.nextRetryAt)>now)return {eligible:false,nextAt:Number(prior.nextRetryAt)};
    }
    return {eligible:true};
  }

  function storeNightOutcome(job,generation,result) {
    var key=attemptKey(job.doi,generation,'figures'),prior=GM_getValue(key,null);
    result.version=VERSION;
    result.attemptCount=(prior&&prior.version===VERSION?Number(prior.attemptCount||0):0)+1;
    var reason=String(result.reason||'')+' '+JSON.stringify(result.figures?.items||[]);
    var delay=result.status==='success'?0:result.status==='partial'?2*60*60*1000:30*60*1000;
    if(result.attemptCount>=3&&result.status!=='success')delay=6*60*60*1000;
    if(/publisher_(?:login|challenge)|auth_not_completed|challenge_not_completed|(?:http_|http\s+)(?:403|429)/i.test(reason)){
      var until=Date.now()+60*60*1000;
      GM_setValue(P+'publisher-pause:'+job.publisher,{until:until,reason:reason.slice(0,160)});
      delay=Math.max(delay,60*60*1000);
    }
    if(/capture_client_upgrade_required|capture_source_evidence_missing|media_source_doi_mismatch|page_doi_mismatch|capture_figure_identity_invalid/.test(reason))delay=6*60*60*1000;
    result.nextRetryAt=result.status==='aborted'?Date.now():Date.now()+delay;
    GM_setValue(key,result);
    return result;
  }

  function scheduleNightContinuation(delay,message) {
    if(nextBatchTimer!==null)clearTimeout(nextBatchTimer);
    if(isAbortRequested()||GM_getValue(ENABLED_KEY,true)===false)return;
    if(message)badge(message,'#374151');
    nextBatchTimer=setTimeout(function(){nextBatchTimer=null;controllerRun();},Math.max(12000,Math.min(30*60*1000,delay||12000)));
  }

  async function waitForResult(job,tab) {
    var started=Date.now();
    while(Date.now()-started<9*60*1000){
      if(!renewLease())throw new Error('controller_lease_lost');
      if(isAbortRequested()||GM_getValue(ENABLED_KEY,true)===false)return {doi:job.doi,jobId:job.jobId,status:'aborted',reason:'user_aborted',finishedAt:nowIso()};
      var result=GM_getValue(resultKey(job.doi),null);
      if(result&&result.jobId===job.jobId&&result.version===VERSION&&result.finishedAt)return result;
      var hb=currentPublisherHeartbeat();
      if(Date.now()-started>150000&&(!hb||hb.jobId!==job.jobId))return {doi:job.doi,jobId:job.jobId,status:'failed',reason:'bound_publisher_heartbeat_missing',finishedAt:nowIso()};
      var progress=GM_getValue(progressKey(job.doi),null);
      if(progress&&progress.jobId===job.jobId&&/auth_wait|challenge_wait/.test(progress.status))badge('出版社需要登录或验证，将暂缓该站点：'+job.doi,'#92400e');
      await sleep(1000);
    }
    return {doi:job.doi,jobId:job.jobId,status:'failed',reason:'controller_timeout',finishedAt:nowIso()};
  }

  async function controllerRun() {
    if(!isGalleryPage()||globalThis.__OSG_PAIRED_CONTROLLER_BUSY__)return;
    if(GM_getValue(ENABLED_KEY,true)===false||isAbortRequested()){badge('媒体抓取已暂停','#6b7280');return;}
    if(!writeToken()){badge('保留原有设置；需要有效的 R2 写入令牌','#991b1b');return;}
    if(!acquireLease()){scheduleNightContinuation(60000,'另一个控制页正在运行；本页等待，不重复领任务');return;}
    globalThis.__OSG_PAIRED_CONTROLLER_BUSY__=true;
    var renew=setInterval(renewLease,20000),summary=null;
    try{
      var server=await getJson(CAPTURE_INDEX_URL+'?capabilities=1&ts='+Date.now());
      if(server.captureVersion!==VERSION||server.verifiedPublication!==true)throw new Error('worker_capture_release_not_ready');
      var queue=await getJson(QUEUE_URL+'?ts='+Date.now());
      var media=await getJson('https://zhou526316-sys.github.io/organic-synthesis-gallery/media-index.json?ts='+Date.now());
      var jobs=pairedJobs(queue,media),generation=stableCaptureGeneration(queue);
      // A reloaded controller can acknowledge its surviving task before creating another.
      var orphan=GM_getValue(ACTIVE_JOB_KEY,null);
      if(orphan&&orphan.captureVersion===VERSION){
        var age=Date.now()-Date.parse(orphan.startedAt||'');
        if(age>=0&&age<9*60*1000){
          var survived=await waitForResult(orphan,null);
          storeNightOutcome(orphan,generation,survived);
        }
        if(GM_getValue(ACTIVE_JOB_KEY,null)?.jobId===orphan.jobId)GM_deleteValue(ACTIVE_JOB_KEY);
      } else if(orphan)GM_deleteValue(ACTIVE_JOB_KEY);
      var available=jobs.filter(function(j){return nightRetryState(j,generation).eligible;});
      var batch=selectBatchJobs(available,batchSize());
      summary={version:VERSION,queueGeneratedAt:queue.generatedAt,mediaGeneration:queue.mediaGeneration,queueTotal:jobs.length,total:batch.length,startedAt:nowIso(),success:0,partial:0,failed:0,aborted:0,tocStored:0,figuresStaged:0,apiAvailableFigures:0,published:0,results:[]};
      GM_setValue(SUMMARY_KEY,summary);
      for(var i=0;i<batch.length;i+=1){
        if(isAbortRequested()||GM_getValue(ENABLED_KEY,true)===false)break;
        if(!nightRetryState(batch[i],generation).eligible)continue;
        var job=Object.assign({},batch[i],{jobId:crypto.randomUUID(),captureVersion:VERSION,startedAt:nowIso(),queueGeneratedAt:queue.generatedAt});
        var saved=readCaptureCheckpoint(job.doi);if(saved.toc?.kind==='official')job.captureToc=false;
        GM_deleteValue(resultKey(job.doi));GM_deleteValue(progressKey(job.doi));GM_deleteValue(HEARTBEAT_KEY);GM_setValue(ACTIVE_JOB_KEY,job);
        badge('连续抓取 '+(i+1)+'/'+batch.length+'：'+job.doi,'#1f2937');
        var tab=null,result;
        try{
          var launcher='https://'+GALLERY_HOST+GALLERY_PATH+'capture-launch.html#osg-job='+encodeURIComponent(job.jobId);
          tab=GM_openInTab(launcher,{active:GM_getValue(P+'night-mode',false)===true||job.publisher==='wiley',insert:true,setParent:true});
          result=await waitForResult(job,tab);
        }catch(error){result={doi:job.doi,jobId:job.jobId,version:VERSION,status:'failed',reason:String(error.message),finishedAt:nowIso()};}
        finally{
          var active=GM_getValue(ACTIVE_JOB_KEY,null);
          if(active&&active.jobId===job.jobId)GM_deleteValue(ACTIVE_JOB_KEY);
          try{if(tab&&tab.close)tab.close();}catch(_){}
        }
        storeNightOutcome(job,generation,result);
        summary.results.push(result);summary[result.status]=(summary[result.status]||0)+1;
        summary.tocStored+=result.toc?.status==='stored'?1:0;
        summary.figuresStaged+=Number(result.figuresStaged||0);summary.apiAvailableFigures+=Number(result.figuresImported||0);
        GM_setValue(SUMMARY_KEY,summary);
        if(result.status==='aborted')break;
        if(/(?:upload_http_|fetch_upload_http_)(401|403)|write_token_missing/.test(String(result.reason))){GM_setValue(ENABLED_KEY,false);break;}
        await sleep(5000);
      }
      summary.finishedAt=nowIso();GM_setValue(SUMMARY_KEY,summary);
      var pending=jobs.map(function(j){return nightRetryState(j,generation);});
      var canRun=pending.some(function(p){return p.eligible;});
      var waits=pending.filter(function(p){return p.nextAt;}).map(function(p){return p.nextAt-Date.now();});
      var delay=canRun?NEXT_BATCH_DELAY_MS:waits.length?Math.min.apply(null,waits):30*60*1000;
      scheduleNightContinuation(delay,'本批 TOC '+summary.tocStored+'；正文图保存 '+summary.figuresStaged+'，API可读 '+summary.apiAvailableFigures+'。'+(canRun?'约12秒后继续。':waits.length?'待重试项目冷却中，稍后自动检查。':'当前队列已处理，定期检查新增。'));
    }catch(error){scheduleNightContinuation(60000,'抓取暂缓，60秒后重试：'+String(error.message).slice(0,120));}
    finally{clearInterval(renew);globalThis.__OSG_PAIRED_CONTROLLER_BUSY__=false;var lease=GM_getValue(LEASE_KEY,null);if(lease&&lease.owner===CONTROLLER_ID)GM_deleteValue(LEASE_KEY);}
  }
