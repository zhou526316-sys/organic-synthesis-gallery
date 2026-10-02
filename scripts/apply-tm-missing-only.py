"""Missing-only manual start; preserves live session fencing and stored capture state."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'public/toc-mainline.user.js';s=p.read_text()
if "var MISSING_CAPTURE_REVISION = '20261002-missing-only-v4';" in s:
 print('Missing-only already applied');raise SystemExit(0)
original=s

def rep(a,b):
 global s
 if s.count(a)!=1:raise RuntimeError(f'Expected exact anchor {s.count(a)}: {a[:95]}')
 s=s.replace(a,b,1)
rep("  var IMMEDIATE_RESTART_REVISION = '20261001-immediate-restart-v3';", "  var IMMEDIATE_RESTART_REVISION = '20261001-immediate-restart-v3';\n  var MISSING_CAPTURE_REVISION = '20261002-missing-only-v4';")
rep(" + ' · 立即从头抓';", " + ' · 缺项补抓4';")
rep("immediate.textContent='立即开始任务（从头重抓）';", "immediate.textContent='立即开始任务（只补缺项）';")
rep("    return Boolean(m && (!m.completedAt || m.owner!==CONTROLLER_ID));", "    return Boolean(m); // A completed explicit pass must not fall back to the old all-corpus scheduler.")
rep("  function requestControllerStart() {", "  function requestControllerStart() {\n    if(GM_getValue(MANUAL_RUN_KEY,null))return forceStartFromHead();")
rep("      controllerRevision:CONTROLLER_REVISION,version:VERSION,mode:'manual_from_head',", "      controllerRevision:CONTROLLER_REVISION,version:VERSION,mode:'missing_only',missingRevision:MISSING_CAPTURE_REVISION,")
rep("正在从最新文献队首抓取", "正在生成最新文献缺项队列")
start=s.index('  function manualCaptureJobs(');end=s.index('  async function waitManualResult(',start)
s=s[:start]+(root/'scripts/tm-missing-only-runtime.inc.js').read_text()+"\n  function manualCaptureJobs(queue,run) { return buildMissingCaptureJobs(queue,run,run.inventory); }\n\n"+s[end:]
rep("      // Necessary network loading only: no previous-run reconciliation or inventory audit.", "      // Immediate session replacement is already complete; read metadata to select only actual gaps.")
rep("      var pending=manualCaptureJobs(queue,run),seen=new Set(),queueCheckedAt=Date.now();", "      pairedJobs(queue,{items:{}}); // Reject incomplete/deleted-DOI registry before inventory use.\n      run.inventory=await readMissingCaptureInventory(queue,run);\n      if(!manualExecutionCurrent(run)||controllerPaused())return;\n      var pending=manualCaptureJobs(queue,run),seen=new Set(),queueCheckedAt=Date.now();\n      updateMissingQueueSummary(run,pending);")
rep("        var raw=pending.shift(),job=Object.assign({},raw", "        updateMissingQueueSummary(run,pending);manualSummary(run);\n        var raw=pending.shift(),job=Object.assign({},raw")
rep("badge('从头抓 '+(summary.results.length+1)+'/'+summary.total+' · TOC＋正文图＋全文：'+job.doi", "badge('补缺 '+(summary.results.length+1)+'/'+summary.total+' · '+captureNeedText(job)+'：'+job.doi")
rep("        result.version=VERSION;result.controllerRevision=CONTROLLER_REVISION;result.manualRunId=run.id;", "        result.version=VERSION;result.controllerRevision=CONTROLLER_REVISION;result.manualRunId=run.id;\n        result.requestedNeeds=captureNeedText(job);\n        if(result.status!=='aborted'&&job.captureEvidence&&(!result.fulltext||result.fulltext.status!=='stored')&&result.status==='success')result.status='partial';")
rep("        manualSummary(run);\n        if(controllerPaused()||result.status==='aborted')break;", "        updateMissingQueueSummary(run,pending);manualSummary(run);\n        if(controllerPaused()||result.status==='aborted')break;")
rep("            pending=manualCaptureJobs(queue,run).filter(function(j){return !seen.has(j.doi);});", "            pairedJobs(queue,{items:{}});\n            run.inventory=await readMissingCaptureInventory(queue,run);\n            if(!manualExecutionCurrent(run))return;\n            pending=manualCaptureJobs(queue,run).filter(function(j){return !seen.has(j.doi);});\n            updateMissingQueueSummary(run,pending);")
rep("summary.phase=controllerPaused()?'paused':'finished';", "summary.phase=controllerPaused()?'paused':summary.inventoryUnknown?'inventory_partial':'finished';")
rep("'本轮从头抓取结束：成功 '", "'本轮缺项队列结束：成功 '")
# Panel progress, each missing layer and current phase; no 700+ denominator during metadata loading.
rep("      state: state, active: Boolean(active), doi:", "      phase:summary.phase||'',missingOnly:summary.mode==='missing_only',need:active?captureNeedText(active):'—',activeJob:active,\n      pendingMissing:Number(summary.pendingMissing||0),remainingNeeds:summary.remainingNeeds||{},inventoryUnknown:Number(summary.inventoryUnknown||0),inventoryErrors:summary.inventoryErrors||[],pendingPreview:summary.pendingPreview||[],\n      state: state, active: Boolean(active), doi:")
rep("      resume_wait:'等待旧任务收尾后自动恢复',", "      page_loading:'等待出版社页面加载', evidence_capture:'读取文章文本', resume_wait:'等待旧任务收尾后自动恢复',")
rep("      state: phaseNames[s.state] || ('已停止：' + captureLiveError(s.state)),", "      state: s.missingOnly&&!s.active&&s.phase==='starting'?'正在生成缺项队列':s.missingOnly&&!s.active&&s.phase==='inventory_partial'?'缺项队列已结束，部分库存未确认':phaseNames[s.state] || ('已停止：' + captureLiveError(s.state)),\n      needs:s.need||'—',\n      working:s.active?(s.row&&/全文|Abstract|文本/.test(s.row.label)?'文本':s.row&&s.row.label?s.row.label:s.need||'加载文章'):'—',\n      evidence:s.activeJob&&s.activeJob.captureEvidence?'本次补抓文本':s.activeJob&&s.activeJob.existingEvidenceLevel?captureEvidenceLevelText(s.activeJob.existingEvidenceLevel)+'，本次不重抓':'—',\n      gaps:s.missingOnly?(s.phase==='starting'?'正在读取缺项库存…':'待处理 '+s.pendingMissing+' 篇；TOC '+Number(s.remainingNeeds.toc||0)+'／正文图 '+Number(s.remainingNeeds.figures||0)+'／文本 '+Number(s.remainingNeeds.evidence||0)+'（分项可重叠）'):'—',\n      inventory:s.inventoryUnknown?'另有 '+s.inventoryUnknown+' 篇存在未确认项，不冒充已齐全或全部缺失'+(s.inventoryErrors.length?'；'+s.inventoryErrors.join('；'):''):'',\n      queue:(s.pendingPreview||[]).map(function(j){return j.addedDate+' · '+j.journal+' · '+j.need+'\n'+j.doi;}).join('\n\n'),")
rep("      batch: '已结束 ' + s.completed", "      batch: s.missingOnly&&s.phase==='starting'?'正在生成缺项队列…':(s.missingOnly?'缺项任务已结束 ':'已结束 ') + s.completed")
rep("[['state','状态'],['doi','当前 DOI'],['journal','期刊'],['label','当前图片']", "[['state','状态'],['doi','当前 DOI'],['journal','期刊'],['needs','本篇缺项'],['working','正在补抓'],['evidence','文本情况'],['label','当前图片']")
rep("['batch','本批累计']", "['gaps','剩余缺项'],['batch','本轮累计']")
rep("['stale','publication','delivery'].forEach", "['stale','inventory','publication','delivery'].forEach")
rep("    var note = document.createElement('small');", "    var queueDetails=document.createElement('details'),queueTitle=document.createElement('summary'),queueText=document.createElement('p');\n    queueTitle.textContent='接下来补什么（最多显示 12 篇）';queueText.style.whiteSpace='pre-wrap';queueText.id='queue';fields.queue=queueText;\n    queueDetails.appendChild(queueTitle);queueDetails.appendChild(queueText);main.appendChild(queueDetails);\n    var note = document.createElement('small');")
rep("    note.textContent = '每秒读取本机进度；后台标签页可能延迟。发现数量不是出版社全文总图数。';", "    note.textContent = '分母仅为本轮缺项文献；抓取已保存不等于网页已发布。正文图数量为已识别图数，文本完整度如实显示。';")
rep("' · 失败 ' + s.batchFailed", "' · 部分完成 ' + Number(s.batchPartial||0) + ' · 失败 ' + s.batchFailed")
# Reuse validated same-label receipts across browser visits; don't download known-good19 images again.
rep("    var checkpoint=readCheckpoint(job.doi);checkpoint.figures=checkpoint.figures||{};", "    var checkpoint=readCheckpoint(job.doi);checkpoint.figures=checkpoint.figures||{};\n    if(job.missingOnly)Object.keys(job.capturedFigures||{}).forEach(function(k){var f=job.capturedFigures[k];if(validReceiptForDoi(f,normalizeDoi(job.doi)))checkpoint.figures[k]=f;});")
rep("groups.get(label).some(function(c){return c.url===saved.sourceUrl;})", "groups.get(label).some(function(c){return mediaUrlIdentity(c.url)===mediaUrlIdentity(saved.sourceUrl);})")
rep("        if(!job.recaptureFromHead&&saved&&saved.contentHash&&saved.sourceUrl&&", "        if(!job.recaptureFromHead&&saved&&(!job.missingOnly||validReceiptForDoi(saved,normalizeDoi(job.doi)))&&saved.contentHash&&saved.sourceUrl&&")
rep("    result.retryAfterMs=Math.max(Number(result.retryAfterMs||0),Number((result.fulltext||{}).retryAfterMs||0));", "    if(job.missingOnly&&result.figures&&result.figures.discovered>0){var cp=readCheckpoint(job.doi);cp.figureCoverage={expected:Math.max(Number(cp.figureCoverage&&cp.figureCoverage.expected||0),Number(result.figures.discovered)),observedAt:Date.now()};saveCheckpoint(job.doi,cp,job);}\n    result.retryAfterMs=Math.max(Number(result.retryAfterMs||0),Number((result.fulltext||{}).retryAfterMs||0));")
rep("      var packet=buildArticleEvidencePacket(job,trace);", "      captureLiveUpdate(job,'evidence_capture',{label:'文本'});\n      var packet=buildArticleEvidencePacket(job,trace);")
# Short empty pages observed in actual ACS/Science traces are not evidence of a paper without figures.
rep("var shell = (job.publisher === 'acs' || job.publisher === 'wiley') && doiMatch && !challenge && !auth && text.length > 0 && text.length < 500;", "var shell = doiMatch && !challenge && !auth && text.length < 500;")
rep("      var now=Date.now(),elapsed=now-started;\n      if (wantsToc", "      var now=Date.now(),elapsed=now-started;\n      if(state.shell&&!toc.length&&!figures.length){\n        captureLiveUpdate(job,'page_loading');\n        if(elapsed>=30000)throw new Error('publisher_page_not_ready');\n        await sleep(800);continue;\n      }\n      if (wantsToc")
rep("|signal is aborted/i.test(detail)", "|signal is aborted|publisher_page_not_ready/i.test(detail)")
rep("      batchSkipped: Math.max(0, Number(summary.skipped || 0)),", "      batchSkipped: Math.max(0, Number(summary.skipped || 0)),\n      batchPartial: Math.max(0, Number(summary.partial || 0)),")
rep("summary.skipped++;summary.results.push({doi:job.doi,status:'skipped',reason:'publisher_access_or_rate_limit',finishedAt:nowIso()});manualSummary(run);continue;", "summary.skipped++;summary.results.push({doi:job.doi,status:'skipped',reason:'publisher_access_or_rate_limit',finishedAt:nowIso()});updateMissingQueueSummary(run,pending);manualSummary(run);continue;")
rep("        summary.finishedAt=nowIso();summary.phase=controllerPaused()", "        updateMissingQueueSummary(run,pending);\n        summary.finishedAt=nowIso();summary.phase=controllerPaused()")
rep("not_found:'未找到可用主图',failed:'失败'", "not_found:'未找到可用主图',not_requested:'本次无需补抓',failed:'失败'")
rep("controllerRevision:CONTROLLER_REVISION,lifecycleRevision:typeof CONTROLLER_LIFECYCLE_REVISION", "controllerRevision:CONTROLLER_REVISION,missingRevision:typeof MISSING_CAPTURE_REVISION==='string'?MISSING_CAPTURE_REVISION:'',requestedNeeds:typeof captureNeedText==='function'?captureNeedText(job):'',lifecycleRevision:typeof CONTROLLER_LIFECYCLE_REVISION")
# Keep includable manual runtime byte-identical with bundled source.
a=s.index('  // Explicit user control.');b=s.index('  function completeControllerResume()',a)
manual=s[a:b]
# Backend adds an uncapped compact inventory mode, never changes stage publication.
wpath=root/'cloudflare/worker/src/local-captures.js';w=wpath.read_text()
anchor='export async function getStagedArticleFigures(request, env) {\n'
assert w.count(anchor)==1
w=w.replace(anchor,(root/'scripts/tm-stage-inventory.inc.js').read_text()+anchor+'''  if(new URL(request.url).searchParams.get('inventory')==='1'){
    if(!env?.MEDIA)return {status:503,body:{error:'capture_inventory_unavailable'}};
    try{
      const [stage,reports]=await Promise.all([readStrictCaptureIndex(env,ARTICLE_FIGURE_STAGE_INDEX_KEY),readStrictCaptureIndex(env,TAMPERMONKEY_REPORT_INDEX_KEY)]);
      return {status:200,body:compactStageCaptureInventory(stage,reports)};
    }catch{return {status:503,body:{error:'capture_inventory_unavailable'}};}
  }
''',1)
# Production per-label receipts supplement staged receipts, avoiding disjoint-count guesses.
mpath=root/'cloudflare/worker/src/media.js';m=mpath.read_text()
ma='    figureCount,\n    ...qualityCounts,'
assert m.count(ma)==1
m=m.replace(ma,'''    figureCount,
    capturedFigures: figures.filter(f=>['high','usable'].includes(figureQuality(f))).map(f=>({label:f.label,sourceUrl:f.source_url,contentHash:f.content_hash,width:Number(f.width||0),height:Number(f.height||0),quality:figureQuality(f)})),
    ...qualityCounts,''',1)
# Existing session-fencing tests now receive an explicit empty acquisition inventory.
tpath=root/'tests/tm-immediate-restart.test.mjs';t=tpath.read_text()
anchor="isGalleryPage=()=>true;badge=__badge;"
assert t.count(anchor)==1
t=t.replace(anchor,"readMissingCaptureInventory=async(q)=>({media:{items:q.articles.map(a=>({doi:a.doi,figureCount:0,tocStored:false,capturedFigures:[]}))},tocs:{items:[],count:0},figures:{complete:true,items:[]},evidence:{items:[],count:0},errors:[]});"+anchor)
t=t.replace('starts from newest first and includes older complete papers without inventory audit','starts newest-first for every verified missing fixture, despite a stale success attempt')
t=t.replace('all three acquisition layers explicitly requested on every fresh visit','all three layers requested when fixture inventories prove all three missing')
t=t.replace('assert.equal(j.recaptureFromHead,true)','assert.equal(j.recaptureFromHead,false);assert.equal(j.missingOnly,true)')
t=t.replace("source.includes('if(!job.recaptureFromHead&&saved&&saved.contentHash')", "source.includes('if(!job.recaptureFromHead&&saved&&(!job.missingOnly||validReceiptForDoi(')")
bpath=root/'tests/tm-immediate-restart-browser.mjs';bt=bpath.read_text()
anchor=' globalThis.T={forceStartFromHead,finishPairedJob,owner:CONTROLLER_ID,requestControllerPause};'
assert bt.count(anchor)==1
bt=bt.replace(anchor," readMissingCaptureInventory=async(q)=>({media:{items:q.articles.map(a=>({doi:a.doi,figureCount:0,tocStored:false,capturedFigures:[]}))},tocs:{items:[],count:0},figures:{complete:true,items:[]},evidence:{items:[],count:0},errors:[]});\n"+anchor)
# Save atomically only after all anchors validated.
p.write_text(s);wpath.write_text(w);mpath.write_text(m);tpath.write_text(t);bpath.write_text(bt);(root/'scripts/tm-immediate-restart-runtime.inc.js').write_text(manual)
print('Applied missing-only v4 to client, manual runtime and read-only inventory')
