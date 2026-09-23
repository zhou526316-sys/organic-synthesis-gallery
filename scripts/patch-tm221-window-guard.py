from pathlib import Path
import hashlib
p=Path('public/toc-mainline.user.js');s=p.read_text()
if any("var CONTROLLER_REVISION = '"+v+"';" in s for v in ('2.2.22','2.2.23','2.2.24','2.2.25','2.2.26','2.2.27')):
    assert all(x in s for x in ['requestControllerStart','previous_task_tab_not_closed','clearOwnedJob','await acquireLease()','assertBoundCaptureJob'])
    print('TM222_RETAINS_WINDOW_GUARDS: run behavioral regression unchanged')
    raise SystemExit(0)
if "var CONTROLLER_REVISION = '2.2.21';" not in s:
    assert hashlib.sha1(b'blob '+str(len(s.encode())).encode()+b'\0'+s.encode()).hexdigest()=='4e31fc949efa6021fa6be32b02728dd239e04536','Current media source changed; reconcile before patching'
    s=s.replace("  var VERSION = '6.2.20';","  var VERSION = '6.2.20'; // Capture protocol/checkpoints remain compatible.\n  var CONTROLLER_REVISION = '2.2.21';\n  var CONTROLLER_STOP_REASON = '';",1)
    s=s.replace('  function acquireLease() {','  async function acquireLease() {',1)
    s=s.replace("    GM_setValue(LEASE_KEY, { owner: CONTROLLER_ID, expiresAt: now + 90000 });\n    return true;","    GM_setValue(LEASE_KEY, { owner: CONTROLLER_ID, expiresAt: now + 90000 });\n    await sleep(250); // Let competing control pages settle before any dispatch.\n    var confirmed = GM_getValue(LEASE_KEY, null);\n    return Boolean(confirmed && confirmed.owner === CONTROLLER_ID);",1)
    a=s.index('  async function controllerRun() {');b=s.index('  async function publisherBoot()',a)
    s=s[:a]+'''  function clearOwnedJob(job) {
    var live=GM_getValue(ACTIVE_JOB_KEY,null);
    if(live && live.jobId===job.jobId && live.controllerId===CONTROLLER_ID) GM_deleteValue(ACTIVE_JOB_KEY);
  }

  async function closeTaskTab(tab) {
    if(!tab || typeof tab.close!=='function') return false;
    try { tab.close(); } catch(_) { return false; }
    for(var i=0;i<30;i+=1) {
      if(tab.closed===true) return true;
      await sleep(100);
    }
    return tab.closed===true;
  }

  function requestControllerStart() {
    if(globalThis.__OSG_PAIRED_CONTROLLER_BUSY__) {badge('当前批次正在运行，不重复派发','#374151');return;}
    var lease=GM_getValue(LEASE_KEY,null);
    if(lease && lease.owner!==CONTROLLER_ID && Number(lease.expiresAt)>Date.now()) {badge('另一个 Gallery 控制页正在运行，请勿重复启动','#92400e');return;}
    CONTROLLER_STOP_REASON='';
    GM_deleteValue(ABORT_KEY);
    GM_setValue(ENABLED_KEY,true);
    if(nextBatchTimer!==null){clearTimeout(nextBatchTimer);nextBatchTimer=null;}
    if(isGalleryPage()) controllerRun();
    else window.open('https://'+GALLERY_HOST+GALLERY_PATH,'_blank');
  }

  async function controllerRun() {
    if (!isGalleryPage() || globalThis.__OSG_PAIRED_CONTROLLER_BUSY__) return;
    if(CONTROLLER_STOP_REASON){badge('已停止开页：'+CONTROLLER_STOP_REASON,'#991b1b');return;}
    if (GM_getValue(ENABLED_KEY,true)===false||isAbortRequested()) {badge('媒体抓取已暂停','#6b7280');return;}
    if (!writeToken()) {badge('请保留并配置原有 R2 写入令牌','#991b1b');return;}
    globalThis.__OSG_PAIRED_CONTROLLER_BUSY__=true;
    var renew=null,summary=null,stopReason='';
    try {
      if(!await acquireLease()) {badge('另一个 Gallery 控制页正在运行','#6b7280');return;}
      renew=setInterval(renewLease,15000);
      var caps=await getJson(WORKER+'/api/media/capture-capabilities');
      if(caps.captureVersion!==VERSION||caps.mediaGeneration!==1790082000000||caps.mode!=='verified-staging')throw new Error('capture_server_upgrade_pending');
      var queue=await getJson(QUEUE_URL+'?ts='+Date.now());
      var media=await getJson('https://zhou526316-sys.github.io/organic-synthesis-gallery/media-index.json?ts='+Date.now());
      var jobs=pairedJobs(queue,media);
      var generation=VERSION+':paired:'+String(queue.mediaGeneration);
      function eligible(job) {
        var prior=GM_getValue(attemptKey(job.doi,generation,'figures'),null);
        // A scheduler failure is not a failed publisher/article capture.
        if(prior && prior.reason==='controller_lease_lost')return true;
        if (prior && prior.version===VERSION && prior.status==='success') return false;
        if (prior && !overnightRetryEligible(prior,Date.now())) return false;
        return true;
      }
      var available=jobs.filter(eligible),batch=selectBatchJobs(available,batchSize());
      summary={version:VERSION,controllerRevision:CONTROLLER_REVISION,queueGeneratedAt:queue.generatedAt,queueTotal:jobs.length,total:batch.length,startedAt:nowIso(),success:0,partial:0,failed:0,aborted:0,tocStored:0,figuresStaged:0,published:0,results:[]};
      GM_setValue(SUMMARY_KEY,summary);
      for (var i=0;i<batch.length;i+=1) {
        if(isAbortRequested()||GM_getValue(ENABLED_KEY,true)===false)break;
        // Fail before opening any page, and never dispatch after loss of ownership.
        if(!renewLease()) {stopReason='controller_lease_lost';break;}
        if(GM_getValue(ACTIVE_JOB_KEY,null)) {stopReason='another_task_still_active';break;}
        var priorAttempt=GM_getValue(attemptKey(batch[i].doi,generation,'figures'),null);
        var job=Object.assign({},batch[i],{jobId:crypto.randomUUID(),controllerId:CONTROLLER_ID,captureVersion:VERSION,startedAt:nowIso(),queueGeneratedAt:queue.generatedAt});
        GM_deleteValue(resultKey(job.doi));GM_deleteValue(progressKey(job.doi));GM_deleteValue(HEARTBEAT_KEY);GM_setValue(ACTIVE_JOB_KEY,job);
        badge('TOC＋正文图 '+(i+1)+'/'+batch.length+'：'+job.doi,'#1f2937');
        var tab=null,result=null,closed=true;
        try {
          if(!renewLease())throw new Error('controller_lease_lost');
          tab=await Promise.resolve(GM_openInTab(articleUrl(Object.assign({},job,{mediaNeed:'figures'}))+'#osg-job='+encodeURIComponent(job.jobId),{active:job.publisher==='wiley',insert:true,setParent:true}));
          if(!tab || typeof tab.close!=='function')throw new Error('task_tab_handle_unavailable');
          result=await waitForResult(job,tab);
        } catch(error) {
          if(/controller_lease_lost|task_tab_handle_unavailable/.test(String(error.message)))stopReason=String(error.message);
          else result={doi:job.doi,jobId:job.jobId,version:VERSION,status:'failed',reason:String(error.message),finishedAt:nowIso()};
        } finally {
          // Invalidate this job before closing; never delete another controller's job.
          clearOwnedJob(job);
          if(tab)closed=await closeTaskTab(tab);
          if(!closed)stopReason=stopReason||'previous_task_tab_not_closed';
        }
        if(result && !stopReason) {
          result.version=VERSION;
          result.retryCount=Number(priorAttempt&&priorAttempt.reason!=='controller_lease_lost'&&priorAttempt.retryCount||0)+1;
          summary.results.push(result);summary[result.status]=(summary[result.status]||0)+1;
          summary.tocStored+=result.toc&&result.toc.status==='stored'?1:0;
          summary.figuresStaged+=Number(result.figuresStaged||0);
          GM_setValue(attemptKey(job.doi,generation,'figures'),result);
        }
        if(result && result.reason==='bound_publisher_heartbeat_missing')stopReason=result.reason;
        if(stopReason){summary.stopReason=stopReason;GM_setValue(SUMMARY_KEY,summary);break;}
        GM_setValue(SUMMARY_KEY,summary);
        if(result && result.status==='aborted')break;
        await sleep(3500);
      }
      summary.finishedAt=nowIso();summary.stopReason=stopReason;GM_setValue(SUMMARY_KEY,summary);
      if(stopReason)badge('已停止开页：'+stopReason+'；请检查日志后再继续','#991b1b');
      else badge('本批：TOC '+summary.tocStored+'；正文图已暂存 '+summary.figuresStaged+'；完整抓取 '+summary.success+'，部分 '+summary.partial+'，失败 '+summary.failed+'（暂存不等于发布）','#374151');
      if(!stopReason&&jobs.some(eligible)&&!isAbortRequested()&&GM_getValue(ENABLED_KEY,true)!==false) {
        if(nextBatchTimer!==null)clearTimeout(nextBatchTimer);
        nextBatchTimer=setTimeout(function(){nextBatchTimer=null;controllerRun();},NEXT_BATCH_DELAY_MS);
      }
    } catch(error) {
      stopReason=String(error.message);
      if(!renewLease() || /capture_server_upgrade_pending/.test(stopReason))badge('媒体主线已停止：'+stopReason,'#991b1b');
      else {
        badge('媒体主线暂缓：'+stopReason+'；60 秒后检查重连','#991b1b');
        if(!isAbortRequested()&&GM_getValue(ENABLED_KEY,true)!==false) {clearTimeout(nextBatchTimer);nextBatchTimer=setTimeout(controllerRun,60000);}
      }
    } finally {
      clearInterval(renew);
      if(/controller_lease_lost|task_tab_handle_unavailable|previous_task_tab_not_closed|another_task_still_active|bound_publisher_heartbeat_missing|capture_server_upgrade_pending/.test(stopReason)){CONTROLLER_STOP_REASON=stopReason;if(nextBatchTimer!==null){clearTimeout(nextBatchTimer);nextBatchTimer=null;}}
      globalThis.__OSG_PAIRED_CONTROLLER_BUSY__=false;
      var lease=GM_getValue(LEASE_KEY,null);
      if(lease&&lease.owner===CONTROLLER_ID)GM_deleteValue(LEASE_KEY);
    }
  }

''' +s[b:]
    a=s.index("    GM_registerMenuCommand('立即运行媒体抓取队列'");b=s.index("    GM_registerMenuCommand('中止当前媒体抓取批次'",a)
    s=s[:a]+"    GM_registerMenuCommand('立即运行媒体抓取队列', requestControllerStart);\n"+s[b:]
    a=s.index("    GM_registerMenuCommand('继续媒体抓取主线'");b=s.index("    GM_registerMenuCommand('上传本地 TOC 日志'",a)
    s=s[:a]+"    GM_registerMenuCommand('继续媒体抓取主线', requestControllerStart);\n"+s[b:]
    s=s.replace("      GM_setValue(ABORT_KEY, { at: Date.now(), reason: 'user_aborted' });","      GM_setValue(ABORT_KEY, { at: Date.now(), reason: 'user_aborted' });\n      GM_setValue(ENABLED_KEY,false);\n      if(nextBatchTimer!==null){clearTimeout(nextBatchTimer);nextBatchTimer=null;}",1)
    a=s.index("    GM_registerMenuCommand('清除 TOC 失败冷却");b=s.index('  function visualScope(',a)
    segment=s[a:b].replace('      GM_deleteValue(LEASE_KEY);\n','',1)
    x=segment.index("      var job = GM_getValue(ACTIVE_JOB_KEY, null);")
    segment=segment[:x]+'''      GM_setValue(ABORT_KEY,{at:Date.now(),reason:'user_aborted'});
      GM_setValue(ENABLED_KEY,false);
      if(nextBatchTimer!==null){clearTimeout(nextBatchTimer);nextBatchTimer=null;}
      var lease=GM_getValue(LEASE_KEY,null);
      if(lease && Number(lease.expiresAt)>Date.now()) {
        window.alert('已请求暂停。当前控制器退出后再清理；不会抢占运行中的任务锁。');return;
      }
      GM_deleteValue(ACTIVE_JOB_KEY);
      GM_deleteValue(LEASE_KEY);
      window.alert('已清除过期任务和租约，保持暂停。关闭旧任务页后可继续。');
    });
  }

'''
    s=s[:a]+segment+s[b:]
    p.write_text(s)
p=Path('cloudflare/scripts/build-bridge-loader.mjs');s=p.read_text()
s=s.replace("const loaderVersion = '2.2.20';","const loaderVersion = '2.2.21';",1)
if 'legacy_runtime_media_disabled' not in s:
    anchor="await writeFile(RUNTIME_OUTPUT, runtime, 'utf8');"
    change='''// legacy_runtime_media_disabled: only the bound mainline may collect media.
for (const signature of ['  function queueDoi(doi, priority = false) {', '  function pump() {', '  function scan() {']) {
  replaceRequired(signature, signature + '\\n    if (globalThis.__OSG_TOC_BROWSER_MAINLINE__) return;', 'single media engine: '+signature);
}

'''
    assert s.count(anchor)==1;s=s.replace(anchor,change+anchor,1)
p.write_text(s)
p=Path('scripts/validate-tm220-artifacts.mjs');s=p.read_text().replace('2.2.20','2.2.21')
marker="assert.ok(src.includes(\"var CONTROLLER_REVISION = '2.2.21';\")&&src.includes('previous_task_tab_not_closed')&&src.includes('requestControllerStart'),'Window guard regression');"
if marker not in s:s+='\n'+marker+'\n'
p.write_text(s)
print('TM221_PATCH_APPLIED: capture protocol 6.2.20 retained; no media/Worker/literature changes')
