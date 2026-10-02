"""Apply scoped queue-coverage fix to verified missing-only v4; not the prior v5 patch."""
from pathlib import Path
r=Path(__file__).resolve().parents[1]
p=r/'public/toc-mainline.user.js';s=p.read_text()
if "var QUEUE_COVERAGE_REVISION = '20261003-queue-coverage-v6';" in s:
 print('Queue coverage already applied');raise SystemExit(0)
def rep(a,b):
 global s
 if s.count(a)!=1:raise ValueError(f'anchor count {s.count(a)}: {a[:90]}')
 s=s.replace(a,b,1)
rep("  var MISSING_CAPTURE_REVISION = '20261002-missing-only-v4';", "  var MISSING_CAPTURE_REVISION = '20261002-missing-only-v4';\n  var QUEUE_COVERAGE_REVISION = '20261003-queue-coverage-v6';")
# Same owned endpoint and credentials, only a gateway HTML error qualifies; never bypass denials.
a=s.index('  async function getJson(url)');b=s.index('  function productionMediaSnapshot(',a)
s=s[:a]+'''  async function metadataJson(options,prefix) {
    var response=await gmRequest(options);
    if(shouldNativeRetryUpload(response,options.url))response=await nativeControllerRequest(options);
    var status=Number(response.status||0);
    if(status<200||status>=300){
      var error=new Error(prefix+'_http_'+status);error.httpStatus=status;
      var retryHeader=headerValue(response.responseHeaders,'retry-after');
      error.retryAfterMs=retryHeader?(Number.isFinite(Number(retryHeader))?Math.max(0,Number(retryHeader)*1000):Math.max(0,Date.parse(retryHeader)-Date.now())||0):0;
      throw error;
    }
    return JSON.parse(String(response.responseText||'{}'));
  }
  async function getJson(url) {
    return metadataJson({method:'GET',url:url,timeout:45000,headers:{'cache-control':'no-cache',pragma:'no-cache'}},'queue');
  }
  async function getPrivateJson(url,token) {
    return metadataJson({method:'GET',url:url,timeout:30000,headers:{'cache-control':'no-cache',pragma:'no-cache',authorization:'Bearer '+String(token||'')}},'private');
  }
  async function postReadJson(url,payload) {
    return metadataJson({method:'POST',url:url,timeout:45000,headers:{'content-type':'application/json','cache-control':'no-cache',pragma:'no-cache'},data:JSON.stringify(payload||{})},'inventory');
  }

'''+s[b:]
# Cache successful metadata by endpoint/request body for this run only. Failed reads
# do not delete a known missing obligation or become a fabricated empty inventory.
rep("    var errors=[],mediaRows=[];", "    var errors=[],mediaRows=[];\n    var cache=run?(run.inventoryCache||(run.inventoryCache=new Map())):new Map();")
a=s.index('    function safe(name,p,valid)');b=s.index('    var dois=',a)
s=s[:a]+'''    async function safe(name,request,valid,key){
      key=key||name;
      for(var attempt=0;attempt<2;attempt++){
        if(run&&(!manualExecutionCurrent(run)||controllerPaused()))return null;
        try{var x=await request();if(!valid(x))throw new Error('invalid_inventory_shape');cache.set(key,x);return x;}
        catch(e){
          if(attempt===0&&coverageTransient(e.message)&&!Number(e.retryAfterMs||0)){await sleep(1500);continue;}
          errors.push(name+':'+captureLiveError(e.message||e)+(cache.has(key)?'（保留本轮上次有效库存）':''));return cache.get(key)||null;
        }
      }
      return null;
    }
'''+s[b:]
rep("safe('媒体库存',postReadJson(MEDIA_INVENTORY_ENDPOINT+'?ts='+Date.now(),{dois:ds,readOnly:true}),", "safe('媒体库存',function(){return postReadJson(MEDIA_INVENTORY_ENDPOINT+'?ts='+Date.now(),{dois:ds,readOnly:true});},")
rep("return ds.indexOf(normalizeDoi(r.doi))>=0;});});}));", "return ds.indexOf(normalizeDoi(r.doi))>=0;});},'media:'+ds.join('|'));}));")
rep("safe('TOC库存',getJson(CAPTURE_INDEX_URL+'?ts='+Date.now()),", "safe('TOC库存',function(){return getJson(CAPTURE_INDEX_URL+'?ts='+Date.now());},")
rep("safe('正文图库存',getJson(WORKER+'/api/article-figures/staged?inventory=1&ts='+Date.now()),", "safe('正文图库存',function(){return getJson(WORKER+'/api/article-figures/staged?inventory=1&ts='+Date.now());},")
rep("safe('文本库存',getPrivateJson(EVIDENCE_INVENTORY_ENDPOINT+'?ts='+Date.now(),writeToken()),", "safe('文本库存',function(){return getPrivateJson(EVIDENCE_INVENTORY_ENDPOINT+'?ts='+Date.now(),writeToken());},")
rep("var figureKnown=(expected>0&&knownCount>=expected)||Boolean(media&&inventory.figuresKnown&&(expected>0||(productionCount===0&&stagedCount===0)));", "var figureKnown=expected>0||Boolean(media&&inventory.figuresKnown);\n    var inspectFigures=Boolean(figureKnown&&expected===0&&knownCount>0);")
rep("var needFigures=figureKnown&&(expected>0?knownCount<expected:knownCount===0);", "var needFigures=figureKnown&&(expected>0?knownCount<expected:true);")
rep("expectedFigureCount:expected,missingFigureCount:expected>0?Math.max(0,expected-knownCount):0,", "expectedFigureCount:expected,figureCoverageUnconfirmed:inspectFigures,missingFigureCount:expected>0?Math.max(0,expected-knownCount):0,")
rep("parts.push('正文图'+(job.missingFigureCount>0?'（缺 '+job.missingFigureCount+' 张）':''));", "parts.push('正文图'+(job.figureCoverageUnconfirmed?'（核对图数，复用已存图片）':job.missingFigureCount>0?'（缺 '+job.missingFigureCount+' 张）':''));")
# Metadata token failure remains unknown, never an excuse to bypass private access.
# Replace the dispatcher, reusing the existing publisher implementation/receipt fences.
a=s.index('  async function runManualFromHead(run)');b=s.index('  function completeControllerResume()',a)
s=s[:a]+(r/'scripts/tm-queue-coverage.inc.js').read_text()+'\n'+s[b:]
# Distinguish attempt count / fully repaired / blocked. Keep remaining obligations visible.
rep("heading.textContent = '抓取实时进度 · ' + CONTROLLER_REVISION + ' · 缺项补抓4';", "heading.textContent = '抓取实时进度 · ' + CONTROLLER_REVISION + ' · 全队列补缺6';")
rep("phase:summary.phase||'',missingOnly:summary.mode==='missing_only'", "coverageRevision:summary.queueCoverageRevision||'',fullyResolved:Number(summary.fullyResolved||0),unresolvedCount:Number(summary.unresolvedCount||0),blockedCount:Number(summary.blockedCount||0),attemptCount:Number(summary.attemptCount||0),blockedPreview:summary.blockedPreview||[],\n      phase:summary.phase||'',missingOnly:summary.mode==='missing_only'")
rep("completed: (summary.results || []).length,", "completed: summary.queueCoverageRevision?Number(summary.visitedCount||0):(summary.results || []).length,")
rep("      page_loading:'等待出版社页面加载',", "      retry_wait:'等待必要访问间隔，随后自动继续', inventory_retry:'库存连接恢复中，待办未丢弃', blocked_remaining:'已遍历待办，仍有未补齐或未确认项', all_resolved:'本轮已确认缺项全部补齐', page_loading:'等待出版社页面加载',")
rep("      state: s.missingOnly&&!s.active&&s.phase==='starting'", "      state: s.coverageRevision&&!s.active&&phaseNames[s.phase]?phaseNames[s.phase]:s.missingOnly&&!s.active&&s.phase==='starting'")
rep("      gaps:s.missingOnly?", "      gaps:s.coverageRevision&&s.phase!=='starting'?'未补齐 '+s.unresolvedCount+' 篇（待执行 '+s.pendingMissing+'／受阻 '+s.blockedCount+'）；TOC '+Number(s.remainingNeeds.toc||0)+'／正文图 '+Number(s.remainingNeeds.figures||0)+'／文本 '+Number(s.remainingNeeds.evidence||0):s.missingOnly?")
rep("      batch: s.missingOnly&&s.phase==='starting'", "      batch: s.coverageRevision&&s.phase!=='starting'?'已遍历 '+s.completed+'／'+s.total+' 篇 · 确认补齐 '+s.fullyResolved+' 篇 · 尝试 '+s.attemptCount+' 次 · 新主图 '+s.batchToc+' · 新正文图 '+s.batchStaged:s.missingOnly&&s.phase==='starting'")
rep("      inventory:s.inventoryUnknown?", "      blocked:(s.blockedPreview||[]).map(function(r){return r.doi+' · '+r.need+' · '+r.reason;}).join('\\n'),\n      inventory:s.inventoryUnknown?")
rep("['stale','inventory','publication','delivery'].forEach", "['stale','inventory','blocked','publication','delivery'].forEach")
# New diagnostics describe which deployed controller fixed the queue.
rep("missingRevision:typeof MISSING_CAPTURE_REVISION", "queueCoverageRevision:typeof QUEUE_COVERAGE_REVISION==='string'?QUEUE_COVERAGE_REVISION:'',missingRevision:typeof MISSING_CAPTURE_REVISION")
p.write_text(s)
a=s.index('  // Explicit user control.');b=s.index('  function completeControllerResume()',a)
(r/'scripts/tm-immediate-restart-runtime.inc.js').write_text(s[a:b].rstrip()+'\n')
print('Applied queue coverage v6')

# Existing restart tests must supply a complete image result, not only status=success.
t=r/'tests/tm-immediate-restart.test.mjs'
v=t.read_text().replace("toc:{status:'stored'},figuresStaged:1", "toc:{status:'stored',kind:'official'},figures:{discovered:1,stored:1,failed:0,items:[]},figuresStaged:1")
t.write_text(v)
t=r/'tests/tm-missing-only.test.mjs'
v=t.read_text().replace("nonzero figure count without complete observation stays unknown, not complete", "nonzero count without complete observation is queued for discovery, never presumed complete")
v=v.replace("assert.equal(x.jobs.length,0);assert.equal(x.summary.inventoryUnknown,1)", "assert.equal(x.jobs.length,1);assert.equal(x.jobs[0].captureFigures,true);assert.equal(x.jobs[0].figureCoverageUnconfirmed,true);assert.equal(Object.keys(x.jobs[0].capturedFigures).length,2);assert.equal(x.summary.inventoryUnknown,0)")
t.write_text(v)
t=r/'tests/tm-missing-only-browser.mjs';t.write_text(t.read_text().replace("assert.match(snap.title,/缺项补抓4/)", "assert.match(snap.title,/全队列补缺6/)"))
for name in ('.github/workflows/tm-missing-only.yml','.github/workflows/tm-immediate-restart.yml'):
 t=r/name
 if t.exists():t.write_text(t.read_text().replace("grep -F '缺项补抓4'", "grep -F '全队列补缺6'"))
