from pathlib import Path
p=Path(__file__).resolve().parents[1]/'public/toc-mainline.user.js'
s=p.read_text()
if "var CONTROLLER_LIFECYCLE_REVISION = '20261001-controller-recovery-v2';" in s:
    print('Controller recovery already applied');raise SystemExit(0)
def rep(a,b):
    global s
    assert s.count(a)==1,('anchor mismatch',a[:100],s.count(a))
    s=s.replace(a,b,1)
rep("  var CAPTURE_HOTFIX_REVISION = '20261001-newest-retry-v1';", "  var CAPTURE_HOTFIX_REVISION = '20261001-newest-retry-v1';\n  var CONTROLLER_LIFECYCLE_REVISION = '20261001-controller-recovery-v2';\n  var controllerResumeTimer = null;")
rep("  var LEASE_KEY = P + 'controller-lease';", "  var LEASE_KEY = P + 'controller-lease';\n  var RESUME_REQUEST_KEY = P + 'controller-resume-request-v2';")
start=s.index('  async function acquireLease()');end=s.index('  async function uploadControllerReport',start)
s=s[:start]+'''  function controllerPaused() {
    return GM_getValue(ENABLED_KEY,true)===false || isAbortRequested();
  }

  function releaseIdlePausedLease() {
    var lease=GM_getValue(LEASE_KEY,null),active=GM_getValue(ACTIVE_JOB_KEY,null);
    if (!controllerPaused() || !lease || lease.owner!==CONTROLLER_ID) return false;
    // Retain ownership while a bound publisher is being stopped. Never erase
    // another controller's lease or revoke its in-flight capture here.
    if (active && active.controllerId===CONTROLLER_ID) return false;
    GM_deleteValue(LEASE_KEY);
    return true;
  }

  function controllerLifecycleSnapshot() {
    var lease=GM_getValue(LEASE_KEY,null),active=GM_getValue(ACTIVE_JOB_KEY,null);
    var request=GM_getValue(RESUME_REQUEST_KEY,null);
    return {revision:CONTROLLER_LIFECYCLE_REVISION,paused:controllerPaused(),
      localBusy:Boolean(globalThis.__OSG_PAIRED_CONTROLLER_BUSY__),
      ownerIsThisPage:Boolean(lease&&lease.owner===CONTROLLER_ID),
      leaseSeconds:Math.max(0,Math.ceil((Number(lease&&lease.expiresAt||0)-Date.now())/1000)),
      renewedAt:Number(lease&&lease.renewedAt||0),activeDoi:normalizeDoi(active&&active.doi),
      resumePending:Boolean(request&&request.requester===CONTROLLER_ID)};
  }

  function requestControllerPause() {
    GM_deleteValue(RESUME_REQUEST_KEY);
    if(controllerResumeTimer!==null){clearTimeout(controllerResumeTimer);controllerResumeTimer=null;}
    GM_setValue(ABORT_KEY,{at:Date.now(),reason:'user_aborted'});
    GM_setValue(ENABLED_KEY,false);
    if(nextBatchTimer!==null){clearTimeout(nextBatchTimer);nextBatchTimer=null;}
    releaseIdlePausedLease();
  }

  async function acquireLease() {
    var now=Date.now(),lease=GM_getValue(LEASE_KEY,null);
    if (controllerPaused()) return false;
    if (lease&&Number(lease.expiresAt||0)>now&&lease.owner!==CONTROLLER_ID) return false;
    GM_setValue(LEASE_KEY,{owner:CONTROLLER_ID,expiresAt:now+90000,renewedAt:now});
    await sleep(250);
    if(controllerPaused()){releaseIdlePausedLease();return false;}
    var confirmed=GM_getValue(LEASE_KEY,null);
    return Boolean(confirmed&&confirmed.owner===CONTROLLER_ID&&Number(confirmed.expiresAt)>Date.now());
  }

  function renewLease() {
    if(releaseIdlePausedLease())return false;
    var lease=GM_getValue(LEASE_KEY,null),now=Date.now();
    // An expired owner must reacquire; waking from suspension cannot resurrect it.
    if(!lease||lease.owner!==CONTROLLER_ID||Number(lease.expiresAt||0)<=now)return false;
    GM_setValue(LEASE_KEY,{owner:CONTROLLER_ID,expiresAt:now+90000,renewedAt:now});
    return true;
  }

  function persistControllerSummary(summary,initial) {
    if(!summary)return false;
    var current=GM_getValue(SUMMARY_KEY,null),lease=GM_getValue(LEASE_KEY,null);
    if(initial){if(!lease||lease.owner!==CONTROLLER_ID||controllerPaused())return false;}
    else if(current&&current.controllerRunId!==summary.controllerRunId)return false;
    GM_setValue(SUMMARY_KEY,summary);return true;
  }

''' + s[end:]
rep("      if(!renewLease())throw new Error('controller_lease_lost');\n      if(isAbortRequested()||GM_getValue(ENABLED_KEY,true)===false) return", "      var completed=completedPublisherResult(job);\n      if(completed)return completed;\n      if(isAbortRequested()||GM_getValue(ENABLED_KEY,true)===false) return")
rep("reason:'user_aborted',finishedAt:nowIso()};\n\n      // publisher final", "reason:'user_aborted',finishedAt:nowIso()};\n      if(!renewLease())throw new Error('controller_lease_lost');\n\n      // publisher final")
rep("        for(var grace=0;grace<4;grace+=1) {", "        var graceDeadline=Date.now()+1000;\n        for(var grace=0;grace<4&&Date.now()<graceDeadline;grace+=1) {")
rep("      var hb=currentPublisherHeartbeat();\n      if(elapsed>60000", "      if(tab&&tab.closed===true){\n        await sleep(250);\n        result=completedPublisherResult(job);if(result)return result;\n        return {doi:job.doi,jobId:job.jobId,status:'failed',reason:'publisher_task_tab_closed',finishedAt:nowIso()};\n      }\n      var hb=currentPublisherHeartbeat();\n      if(elapsed>60000")
rep("bound_publisher_heartbeat_missing|controller_timeout)$/.test(reason))", "bound_publisher_heartbeat_missing|controller_timeout|publisher_task_tab_closed)$/.test(reason))")
rep("    for(var i=0;i<30;i+=1) {\n      if(tab.closed===true)", "    var closeDeadline=Date.now()+3000;\n    for(var i=0;i<30&&Date.now()<closeDeadline;i+=1) {\n      if(tab.closed===true)")
start=s.index('  function requestControllerStart()');end=s.index('  async function controllerRun()',start)
s=s[:start]+'''  function completeControllerResume() {
    CONTROLLER_STOP_REASON='';
    GM_deleteValue(ABORT_KEY);GM_setValue(ENABLED_KEY,true);
    if(nextBatchTimer!==null){clearTimeout(nextBatchTimer);nextBatchTimer=null;}
    if(isGalleryPage())controllerRun();
    else window.open('https://'+GALLERY_HOST+GALLERY_PATH,'_blank');
  }

  function pollControllerResume() {
    if(controllerResumeTimer!==null){clearTimeout(controllerResumeTimer);controllerResumeTimer=null;}
    var request=GM_getValue(RESUME_REQUEST_KEY,null);
    if(!request||request.requester!==CONTROLLER_ID)return;
    // A later manual Pause deletes the request. A run resumed elsewhere is not stolen.
    if(!controllerPaused()){GM_deleteValue(RESUME_REQUEST_KEY);return;}
    releaseIdlePausedLease();
    var lease=GM_getValue(LEASE_KEY,null),active=GM_getValue(ACTIVE_JOB_KEY,null);
    var leased=Boolean(lease&&Number(lease.expiresAt)>Date.now());
    var busy=Boolean(globalThis.__OSG_PAIRED_CONTROLLER_BUSY__);
    if(!leased&&!busy&&active){
      reconcileActiveJobBeforeDispatch();active=GM_getValue(ACTIVE_JOB_KEY,null);
    }
    if(leased||busy||active){
      var seconds=leased?Math.max(0,Math.ceil((lease.expiresAt-Date.now())/1000)):0;
      badge('已收到继续请求；等待旧控制器/任务收尾'+(seconds?'（锁剩余 '+seconds+' 秒）':'')+'，随后自动恢复','#92400e');
      controllerResumeTimer=setTimeout(pollControllerResume,1000);return;
    }
    if((GM_getValue(RESUME_REQUEST_KEY,{})||{}).requestId!==request.requestId)return;
    GM_deleteValue(RESUME_REQUEST_KEY);completeControllerResume();
  }

  function requestControllerStart() {
    var lease=GM_getValue(LEASE_KEY,null),active=GM_getValue(ACTIVE_JOB_KEY,null);
    var busy=Boolean(globalThis.__OSG_PAIRED_CONTROLLER_BUSY__);
    var other=Boolean(lease&&lease.owner!==CONTROLLER_ID&&Number(lease.expiresAt)>Date.now());
    if(controllerPaused()&&(busy||other||active)){
      // Queue the user's intention instead of clearing a live lease or enabling
      // the old loop prematurely. Only one requesting control page may resume.
      if(!isGalleryPage()){window.open('https://'+GALLERY_HOST+GALLERY_PATH,'_blank');return;}
      GM_setValue(RESUME_REQUEST_KEY,{requester:CONTROLLER_ID,requestId:CONTROLLER_ID+':'+Date.now(),at:Date.now()});
      pollControllerResume();return;
    }
    if(busy){badge('当前批次正在运行，不重复派发','#374151');return;}
    if(other){badge('另一控制页正在运行'+(active&&active.doi?'：'+active.doi:'，正在准备或收尾')+'；未重复派发','#92400e');return;}
    completeControllerResume();
  }

''' + s[end:]
rep("      if(!await acquireLease()) {badge('另一个 Gallery 控制页正在运行','#6b7280');return;}", "      if(!await acquireLease()) {badge(controllerPaused()?'媒体抓取已暂停':'另一个 Gallery 控制页正在运行','#6b7280');return;}")
rep("      var available=availableJobs(),batch=selectBatchJobs", "      if(controllerPaused())return;\n      if(!renewLease())throw new Error('controller_lease_lost');\n      var available=availableJobs(),batch=selectBatchJobs")
rep("      summary={version:VERSION,controllerRevision:CONTROLLER_REVISION,queueGeneratedAt:","      summary={controllerRunId:CONTROLLER_ID+':'+Date.now(),lifecycleRevision:CONTROLLER_LIFECYCLE_REVISION,version:VERSION,controllerRevision:CONTROLLER_REVISION,queueGeneratedAt:")
a=s.index('  async function controllerRun()');b=s.index('  async function publisherBoot()',a)
x=s[a:b].replace('GM_setValue(SUMMARY_KEY,summary);','persistControllerSummary(summary,false);')
x=x.replace('persistControllerSummary(summary,false);\n      for (var i=0;', 'persistControllerSummary(summary,true);\n      for (var i=0;',1)
x=x.replace('          clearOwnedJob(job);\n          if(tab)', '          clearOwnedJob(job);\n          releaseIdlePausedLease();\n          if(tab)')
x=x.replace("      if(!renewLease() || /capture_server_upgrade_pending/.test(stopReason))", "      if(controllerPaused()){stopReason='user_paused';badge('媒体抓取已暂停','#6b7280');}\n      else if(!renewLease() || /capture_server_upgrade_pending/.test(stopReason))")
s=s[:a]+x+s[b:]
rep("      GM_setValue(ABORT_KEY, { at: Date.now(), reason: 'user_aborted' });\n      GM_setValue(ENABLED_KEY,false);\n      if(nextBatchTimer!==null){clearTimeout(nextBatchTimer);nextBatchTimer=null;}","      requestControllerPause();")
rep("      GM_setValue(ENABLED_KEY, !enabled);\n      window.alert(enabled ? '媒体抓取主线已暂停。' : '媒体抓取主线已继续。');", "      if(enabled){requestControllerPause();window.alert('媒体抓取主线已暂停。');}\n      else requestControllerStart();")
rep("      GM_setValue(ABORT_KEY,{at:Date.now(),reason:'user_aborted'});\n      GM_setValue(ENABLED_KEY,false);\n      if(nextBatchTimer!==null){clearTimeout(nextBatchTimer);nextBatchTimer=null;}", "      requestControllerPause();")
rep("    else if (paused) state = 'paused';", "    else if (paused) state = 'paused';\n    if(paused&&typeof controllerLifecycleSnapshot==='function'&&controllerLifecycleSnapshot().resumePending)state='resume_wait';")
rep("      idle:'等待启动', paused:'已暂停',", "      resume_wait:'等待旧任务收尾后自动恢复', idle:'等待启动', paused:'已暂停',")
rep("    heading.textContent = '抓取实时进度 · ' + CONTROLLER_REVISION;", "    heading.textContent = '抓取实时进度 · ' + CONTROLLER_REVISION + ' · 控制恢复修复2';")
rep("        captureProtocol: VERSION, phase:", "        lifecycleRevision:typeof CONTROLLER_LIFECYCLE_REVISION==='string'?CONTROLLER_LIFECYCLE_REVISION:'', captureProtocol: VERSION, phase:")
rep("      summary: GM_getValue(SUMMARY_KEY, {}),\n      activeJob:", "      summary: GM_getValue(SUMMARY_KEY, {}),\n      controllerState:controllerLifecycleSnapshot(),\n      activeJob:")
rep("controllerRevision:CONTROLLER_REVISION,captureVersion:VERSION,kind:final?", "controllerRevision:CONTROLLER_REVISION,lifecycleRevision:typeof CONTROLLER_LIFECYCLE_REVISION==='string'?CONTROLLER_LIFECYCLE_REVISION:'',controllerState:typeof controllerLifecycleSnapshot==='function'?controllerLifecycleSnapshot():null,captureVersion:VERSION,kind:final?")
p.write_text(s)
print('Applied controller recovery to public/toc-mainline.user.js only')
