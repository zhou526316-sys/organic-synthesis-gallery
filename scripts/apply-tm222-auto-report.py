from pathlib import Path

def once(s,a,b):
 if s.count(a)!=1: raise RuntimeError('Expected one anchor: '+a[:100])
 return s.replace(a,b,1)
p=Path('public/toc-mainline.user.js');s=p.read_text()
if 'BEGIN OSG_AUTO_REPORT_V1' in s:
 print('TM222_AUTO_REPORT_ALREADY_APPLIED');raise SystemExit(0)
assert "var CONTROLLER_REVISION = '2.2.22';" in s and 'BEGIN OSG_LIVE_PROGRESS_V1' in s
s=once(s,'  function nowIso()',Path('scripts/tm-auto-report.fragment.js').read_text()+'\n  function nowIso()')
s=once(s,'    trace.push(row);','    trace.push(row);\n    captureDiagnosticEvent(trace,row);')
s=once(s,'    job._liveResult=result;','    job._liveResult=result;\n    autoReportJob=job;')
# Persist the complete final report before making the completion result visible.
# The controller may close the publisher page immediately after reading resultKey.
s=once(s,'    // The controller acknowledges completed capture independently of diagnostic transport.',"    enqueueCaptureReport(job,trace,result.status,result.reason,true);\n    // Durable local report is queued BEFORE the controller can close this publisher tab.")
s=once(s,'    await uploadReport(job,trace,result.status,result.reason,null,token);',"    // The persistent Gallery sender sends/acknowledges the report independently of this tab.\n    autoReportJob=null;")
s=once(s,"queueGeneratedAt:queue.generatedAt});", "queueGeneratedAt:queue.generatedAt,retryCount:Number(priorAttempt&&priorAttempt.retryCount||0)+1});")
anchor='        if(result && !stopReason) {'
s=once(s,anchor,"        if((result && !result.toc && result.status==='failed') || stopReason) {\n          var observed=currentPublisherHeartbeat();\n          var observedUrl=observed&&observed.jobId===job.jobId?observed.href:'';\n          enqueueCaptureReport(job,[{at:nowIso(),stage:'controller',event:'stopped',status:'failed',message:stopReason||(result&&result.reason)||'unknown_controller_failure',url:observedUrl}], 'controller_error',stopReason||(result&&result.reason),true,observedUrl);\n        }\n"+anchor)
s=once(s,'    mountCaptureLivePanel();\n    setTimeout(controllerRun, 1500);','    mountCaptureLivePanel();\n    startAutomaticCaptureReports();\n    setTimeout(controllerRun, 1500);')
s=once(s,"error: lastError || '无', publication: s.publication", "error: lastError || '无', publication: s.publication, delivery: automaticReportDisplay()")
s=once(s,"['stale','publication'].forEach", "['stale','publication','delivery'].forEach")
# Keep numeric HTTP status from the fetch fallback rather than reducing everything to status 0.
s=once(s,"        combined.fetchError = String(fetchError && fetchError.message || fetchError);", "        combined.fetchError = String(fetchError && fetchError.message || fetchError);\n        combined.httpStatus=Number(fetchError&&fetchError.httpStatus||gmError&&gmError.httpStatus||0);\n        combined.responseError=String(fetchError&&fetchError.responseError||'');")
s=once(s,"      var error = new Error('fetch_upload_http_' + String(response.status || 0));", "      var detail=autoReportText(body.code||body.detail||body.error||'');\n      var error = new Error('fetch_upload_http_' + String(response.status || 0)+(detail?':'+detail:''));\n      error.responseError=detail;")
# Page fetch keeps both requested URL (request_start) and final URL (response).
a=s.index('  async function pageFetchCandidate(');b=s.index('  async function gmFetchCandidate(',a);f=s[a:b]
f=once(f,'    try {','    var requestStarted=Date.now();\n    try {')
f=once(f,'        url: requestUrl\n      });',"        url: response.url || requestUrl,\n        message:'durationMs='+(Date.now()-requestStarted)+';retryAfter='+String(response.headers.get('retry-after')||'').slice(0,80)\n      });")
f=once(f,"        status: 'failed',\n        url: requestUrl,", "        status: 'failed',\n        httpStatus:Number(response&&response.status||0),\n        url: response&&response.url || requestUrl,")
f=once(f,'        message: String(error && error.message || error)',"        message: String(error&&error.name||'Error')+':'+String(error && error.message || error)+';durationMs='+(Date.now()-requestStarted)")
s=s[:a]+f+s[b:]
a=s.index('  async function gmFetchCandidate(');b=s.index('  async function canvasCandidate(',a);f=s[a:b]
f=once(f,'    try {','    var requestStarted=Date.now();\n    try {')
f=once(f,'        contentType: contentType,\n        url: requestUrl,',"        contentType: contentType,\n        url: response.finalUrl || requestUrl,\n        message:'durationMs='+(Date.now()-requestStarted)+';retryAfter='+headerValue(response.responseHeaders,'retry-after').slice(0,80),")
s=s[:a]+f+s[b:]
p.write_text(s)
# Existing isolated tests do not initialize optional observers; stub only the observers.
p=Path('scripts/test-tm-stage-first.mjs');t=p.read_text()
t=once(t,'    captureLiveUpdate: () => {},','    captureLiveUpdate: () => {},')
p.write_text(t)
# The panel-only VM fixture now exposes a harmless delivery-view dependency.
p=Path('scripts/test-tm222-live-progress.mjs');t=p.read_text()
t=once(t,' normalizeDoi:s=>'," automaticReportDisplay:()=> '自动报告测试',\n normalizeDoi:s=>")
t=once(t,"window.normalizeDoi=s=>", "window.automaticReportDisplay=()=> '自动报告测试';window.normalizeDoi=s=>")
p.write_text(t)
print('TM222_AUTOREPORT_APPLIED: persisted before tab closure; sender polling=10s; no media authorization changes')
