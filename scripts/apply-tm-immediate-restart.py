"""Explicit manual restart: revoke the old run, then reacquire from the queue head.
No stored media, credential, authorization or generation reset.
"""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'public/toc-mainline.user.js';s=p.read_text()
marker="var IMMEDIATE_RESTART_REVISION = '20261001-immediate-restart-v3';"
if marker in s: print('Immediate restart already applied'); raise SystemExit(0)
def rep(a,b):
 global s
 if s.count(a)!=1: raise RuntimeError(f'Anchor count {s.count(a)}: {a[:90]}')
 s=s.replace(a,b,1)
rep("  var controllerResumeTimer = null;", "  var controllerResumeTimer = null;\n  "+marker+"\n  var MANUAL_RUN_KEY = 'osg-toc-v6:manual-from-head-v3';\n  var manualExecution = null;\n  var ownedTaskHandle = null;")
rep('// @grant        GM_listValues','// @grant        GM_addValueChangeListener\n// @grant        GM_listValues')
rep(" + ' · 控制恢复修复2';", " + ' · 立即从头抓';")
# All late publisher state writes are fenced by the exact active DOI/job before committing.
rep('  function assertBoundCaptureJob(job, sourceUrl) {', '''  function currentCaptureJob(job) {
    var active=GM_getValue(ACTIVE_JOB_KEY,null),manual=GM_getValue(MANUAL_RUN_KEY,null);
    return Boolean(job&&active&&job.jobId===active.jobId&&job.doi===active.doi
      && (!manual || manual.completedAt || job.manualRunId===manual.id));
  }

  function assertBoundCaptureJob(job, sourceUrl) {''')
rep('    if (!job || !job.jobId || !live || live.jobId !== job.jobId || live.doi !== job.doi || job.captureVersion !== VERSION) {','    if (!currentCaptureJob(job) || !job.jobId || !live || live.jobId !== job.jobId || live.doi !== job.doi || job.captureVersion !== VERSION) {')
rep('    var doi = normalizeDoi(job && job.doi);\n    var publisher = doi ?', '    if (!currentCaptureJob(job)) return null;\n    var doi = normalizeDoi(job && job.doi);\n    var publisher = doi ?')
rep('      if (attempt) assertBoundCaptureJob(job, candidate.url);', '      assertBoundCaptureJob(job, candidate.url);')
rep("    if(checkpoint.toc&&checkpoint.toc.status==='stored'", "    if(!job.recaptureFromHead&&checkpoint.toc&&checkpoint.toc.status==='stored'")
rep('        if(saved&&saved.contentHash&&saved.sourceUrl', '        if(!job.recaptureFromHead&&saved&&saved.contentHash&&saved.sourceUrl')
s=s.replace('saveCheckpoint(job.doi,checkpoint);','saveCheckpoint(job.doi,checkpoint,job);')
rep('  function saveCheckpoint(doi, value) {', "  function saveCheckpoint(doi, value, job) {\n    if(job&&!currentCaptureJob(job))return false;")
rep('  async function finishPairedJob(job,result,trace,token) {', "  async function finishPairedJob(job,result,trace,token) {\n    if(!currentCaptureJob(job))return Object.assign({},result,{status:'aborted',reason:'manual_run_superseded'});")
# Isolate a manual runner's exclusive owner from all pre-existing normal lease owners.
rep('  function renewLease() {', "  function renewLease() {\n    if(manualRunBlocksAutomatic())return false;")
rep('  async function controllerRun() {', "  async function controllerRun() {\n    if(manualRunBlocksAutomatic())return;")
rep('      var available=availableJobs(),batch=selectBatchJobs', '      if(manualRunBlocksAutomatic())return;\n      var available=availableJobs(),batch=selectBatchJobs')
rep('        var evidenceOnly=batch[i].captureToc', '        if(manualRunBlocksAutomatic())return;\n        var evidenceOnly=batch[i].captureToc')
rep("          if(!tab || typeof tab.close!=='function')throw new Error('task_tab_handle_unavailable');", "          if(manualRunBlocksAutomatic()){try{if(tab)tab.close();}catch(_){}return;}\n          ownedTaskHandle=tab;\n          if(!tab || typeof tab.close!=='function')throw new Error('task_tab_handle_unavailable');")
rep("        if(result && controllerFailureDisposition(result.reason)==='skip')", "        if(manualRunBlocksAutomatic())return;\n        if(result && controllerFailureDisposition(result.reason)==='skip')")
rep("      summary.finishedAt=nowIso();summary.stopReason=stopReason;persistControllerSummary(summary,false);", "      if(manualRunBlocksAutomatic())return;\n      summary.finishedAt=nowIso();summary.stopReason=stopReason;persistControllerSummary(summary,false);")
rep("      stopReason=String(error.message);\n      if(controllerPaused())", "      if(manualRunBlocksAutomatic())return;\n      stopReason=String(error.message);\n      if(controllerPaused())")
rep("      if(/controller_lease_lost|capture_server_upgrade_pending/.test(stopReason)){", "      if(!manualRunBlocksAutomatic()&&/controller_lease_lost|capture_server_upgrade_pending/.test(stopReason)){")
# Immediate action does not go through the old queued/graceful resume API.
rep("    GM_registerMenuCommand('立即运行媒体抓取队列', requestControllerStart);", "    GM_registerMenuCommand('立即开始任务（从头重抓）', forceStartFromHead);\n    GM_registerMenuCommand('立即运行媒体抓取队列', forceStartFromHead);")
# Keep old graceful Continue available for compatibility, but make immediate primary.
rep("    var dl = document.createElement('dl');", "    var immediate = document.createElement('button');\n    immediate.id='osg-immediate-start';immediate.textContent='立即开始任务（从头重抓）';\n    immediate.addEventListener('click',forceStartFromHead);main.appendChild(immediate);\n    var dl = document.createElement('dl');")
# New force loop starts without expiry/grace polling and never shares its execution ID.
insert=(root/'scripts/tm-immediate-restart-runtime.inc.js').read_text()
rep('  function completeControllerResume() {', insert+'\n  function completeControllerResume() {')
rep('  installMenu();', "  installManualRestartListener();\n  installMenu();")
rep('    setTimeout(controllerRun, 1500);', "    if(location.hash==='#osg-start-from-head'){\n      try{history.replaceState(null,'',location.pathname+location.search);}catch(_){}\n      forceStartFromHead();\n    }else setTimeout(controllerRun, 1500);")
# Do not write until both packaging anchors are known.
b=root/'cloudflare/scripts/build-bridge-loader.mjs';builder=b.read_text()
a='// @grant        GM_listValues'
if builder.count(a)!=1:raise RuntimeError('loader grant anchor changed')
builder=builder.replace(a,'// @grant        GM_addValueChangeListener\n'+a,1)
p.write_text(s);b.write_text(builder)
print('Patched immediate restart runtime and packaged grant')

# The report test extracts finishPairedJob in isolation; include its actual new guard.
t=root/'scripts/test-tm222-auto-report.mjs';test=t.read_text()
a="h.ctx.token='';vm.runInContext(source.slice(from,to),h.ctx);"
b="h.ctx.token='';h.ctx.MANUAL_RUN_KEY='manual';const guardStart=source.indexOf('  function currentCaptureJob('),guardEnd=source.indexOf('  function assertBoundCaptureJob(',guardStart);vm.runInContext(source.slice(guardStart,guardEnd),h.ctx);vm.runInContext(source.slice(from,to),h.ctx);"
if test.count(a)!=1:raise RuntimeError('report fixture dependency anchor')
t.write_text(test.replace(a,b))
