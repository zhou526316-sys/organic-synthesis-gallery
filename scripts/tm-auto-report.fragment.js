  // BEGIN OSG_AUTO_REPORT_V1 -- diagnostic writes only; never authorizes media.
  var AUTO_REPORT_PREFIX=P+'auto-report-v1:';
  var AUTO_REPORT_ACK=P+'auto-report-ack-v1';
  var AUTO_REPORT_LOCK=P+'auto-report-lock-v1';
  var autoReportBusy=false, autoReportJob=null;

  function autoReportUrl(value) {
    try {var u=new URL(String(value||''));if(!/^https?:$/.test(u.protocol))return '';u.username='';u.password='';u.search='';u.hash='';return u.href.slice(0,1200);}catch(_){return '';}
  }
  function autoReportText(value) {
    return String(value||'').replace(/https?:\/\/[^\s"'<>]+/gi,function(v){return autoReportUrl(v);})
      .replace(/Bearer\s+\S+|(?:token|secret|password|cookie|authorization)\s*[:=]\s*[^\s;,]+/gi,'[redacted]').slice(0,450);
  }
  function autoReportCause(event) {
    var m=String(event.message||'');var status=Number(event.httpStatus||0);
    if(/doi_mismatch|tab_job_mismatch|stale_or_unbound/.test(m))return 'identity_rejected';
    if(status===401)return 'authentication_http_401';
    if(status===403)return 'access_denied_http_403';
    if(status===429)return 'rate_limited_http_429';
    if(status===503&&/lockdown/.test(m))return 'server_recovery_lockdown';
    if(status>=500)return 'server_http_5xx';
    if(status>=400)return 'http_error';
    if(/timeout|TimeoutError|AbortError/.test(m))return 'request_timeout_or_abort';
    if(/not_image|image_type|unsupported|svg/.test(m))return 'format_or_content_rejected';
    if(event.status==='low'||/resolution|no_usable/.test(m))return 'quality_or_candidates_insufficient';
    if(/lease|heartbeat|tab_handle|task_tab/.test(m))return 'controller_or_page_startup';
    if(/fetch_failed|Failed to fetch|gm_request_error|NetworkError/.test(m))return 'transport_error_cause_unverified';
    return 'inspect_stage_evidence';
  }
  function autoReportEvent(e) {
    return {seq:Number(e.seq||0),at:String(e.at||nowIso()),stage:String(e.stage||'').slice(0,60),event:String(e.event||'').slice(0,80),status:String(e.status||'').slice(0,40),httpStatus:Number(e.httpStatus||0),contentType:String(e.contentType||'').slice(0,80),url:autoReportUrl(e.url),message:autoReportText(e.message),candidateKind:String(e.candidateKind||'').slice(0,40),candidateSource:String(e.candidateSource||'').slice(0,80),imageWidth:Number(e.imageWidth||0),imageHeight:Number(e.imageHeight||0),byteLength:Number(e.byteLength||0)};
  }
  function autoReportKeys() {
    try{return GM_listValues().filter(function(k){return String(k).indexOf(AUTO_REPORT_PREFIX)===0;});}catch(_){return [];}
  }
  function enqueueCaptureReport(job,trace,status,reason,final,actualPageUrl) {
    try {
      var doi=normalizeDoi(job&&job.doi);if(!doi||!job.jobId)return false;
      var key=AUTO_REPORT_PREFIX+job.jobId+(final?':final':':checkpoint');
      var prior=GM_getValue(key,null), keys=autoReportKeys();
      if(!prior&&keys.length>=200){GM_setValue(AUTO_REPORT_ACK,{at:Date.now(),state:'outbox_full',pending:keys.length,error:'本机诊断队列已满；保留现有记录，停止新增自动报告'});return false;}
      var revision=Number(prior&&prior.revision||0)+1;
      var important=(job._diagnosticFailures||[]).slice(-48);
      var recent=(trace||[]).slice(-32).map(autoReportEvent);
      var seen=new Set();var events=important.concat(recent).filter(function(e){var k=e.at+'|'+e.stage+'|'+e.event+'|'+e.url;if(seen.has(k))return false;seen.add(k);return true;});
      var page=autoReportUrl(actualPageUrl===undefined?location.href:actualPageUrl);
      var last=important.length?important[important.length-1]:recent[recent.length-1]||{};
      var metadata={eventId:job.jobId+(final?':final':':checkpoint')+':'+revision,jobId:job.jobId,controllerRevision:CONTROLLER_REVISION,captureVersion:VERSION,kind:final?'final_result':'failure_checkpoint',retryCount:Number(job.retryCount||0),pageDois:embeddedJobDois(page),httpStatusKnown:Number(last.httpStatus||0)>0};
      var context={at:nowIso(),seq:0,stage:'diagnostic_context',event:final?'final_result':'failure_checkpoint',status:'info',url:page,message:JSON.stringify(metadata)};
      var payload={doi:doi,publisher:job.publisher||publisherForDoi(doi),status:final?String(status||'failed'):'progress',reason:final?autoReportText(reason):'failure_checkpoint:'+autoReportCause(last),candidateSource:final?'auto_final_result':'auto_failure_checkpoint',articleUrl:page,sourceUrl:autoReportUrl(last.url),startedAt:job.startedAt||'',finishedAt:final?nowIso():'',queueGeneratedAt:job.queueGeneratedAt||'',trace:[context].concat(events)};
      GM_setValue(key,{revision:revision,payload:payload,createdAt:prior?prior.createdAt:Date.now(),tries:Number(prior&&prior.tries||0),nextAt:Number(prior&&prior.nextAt||0)});
      if(final)GM_deleteValue(AUTO_REPORT_PREFIX+job.jobId+':checkpoint');
      return true;
    }catch(_){return false;}
  }
  function captureDiagnosticEvent(trace,row) {
    try {
      var job=autoReportJob,active=GM_getValue(ACTIVE_JOB_KEY,null);
      if(!job||!active||active.jobId!==job.jobId||active.doi!==job.doi)return;
      if(row.stage==='report_upload')return;
      if(row.event==='failed'||row.status==='low'||Number(row.httpStatus)>=400) {
        job._diagnosticFailures=job._diagnosticFailures||[];
        var event=autoReportEvent(row);
        event.message=autoReportText('label='+(job._liveLabel||'')+';cause='+autoReportCause(row)+';'+row.message);
        job._diagnosticFailures.push(event);if(job._diagnosticFailures.length>48)job._diagnosticFailures.shift();
        enqueueCaptureReport(job,trace,'progress','',false);
      }
    }catch(_){}
  }
  async function sendAutomaticReport(payload,token) {
    var response;
    try {
      response=await gmRequest({method:'POST',url:REPORT_ENDPOINT,timeout:10000,headers:{'content-type':'application/json',authorization:'Bearer '+token},data:JSON.stringify(payload)});
    }catch(error){
      var r=await fetch(REPORT_ENDPOINT,{method:'POST',credentials:'omit',mode:'cors',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(payload)});
      response={status:r.status,responseText:await r.text()};
    }
    var body={};try{body=JSON.parse(response.responseText||'{}');}catch(_){}
    if(response.status<200||response.status>=300){var e=new Error('diagnostic_http_'+response.status+':'+autoReportText(body.code||body.error));e.httpStatus=response.status;throw e;}
    if(body.stored!==true||normalizeDoi(body.doi)!==payload.doi||!body.attemptId)throw new Error('diagnostic_receipt_invalid');
    return body;
  }
  async function drainAutomaticReports() {
    if(!isGalleryPage()||autoReportBusy||!writeToken())return;
    autoReportBusy=true;
    var owner=CONTROLLER_ID+':diagnostics',key='',item=null;
    try {
      var lock=GM_getValue(AUTO_REPORT_LOCK,null);
      if(lock&&lock.owner!==owner&&lock.expiresAt>Date.now())return;
      GM_setValue(AUTO_REPORT_LOCK,{owner:owner,expiresAt:Date.now()+60000});
      await sleep(75);
      if((GM_getValue(AUTO_REPORT_LOCK,{})||{}).owner!==owner)return;
      var ready=autoReportKeys().map(function(k){return {key:k,value:GM_getValue(k,null)};}).filter(function(x){return x.value&&Number(x.value.nextAt||0)<=Date.now();});
      ready.sort(function(a,b){return a.value.createdAt-b.value.createdAt;});
      if(!ready.length)return;key=ready[0].key;item=ready[0].value;
      var receipt=await sendAutomaticReport(item.payload,writeToken());
      // A newly queued revision must survive acknowledgement of an earlier snapshot.
      var current=GM_getValue(key,null);
      if(current&&current.revision===item.revision)GM_deleteValue(key);
      GM_setValue(AUTO_REPORT_ACK,{at:Date.now(),state:'delivered',doi:item.payload.doi,attemptId:receipt.attemptId,kind:item.payload.candidateSource,pending:autoReportKeys().length,error:''});
    }catch(error){
      if(key&&item){var current=GM_getValue(key,null);if(current){current.tries=Number(current.tries||0)+1;current.nextAt=Date.now()+Math.min(300000,15000*Math.pow(2,Math.min(current.tries,5)));GM_setValue(key,current);}}
      GM_setValue(AUTO_REPORT_ACK,{at:Date.now(),state:'pending_retry',pending:autoReportKeys().length,error:autoReportText(error&&error.message||error)});
    }finally{
      var held=GM_getValue(AUTO_REPORT_LOCK,null);if(held&&held.owner===owner)GM_deleteValue(AUTO_REPORT_LOCK);
      autoReportBusy=false;
    }
  }
  function startAutomaticCaptureReports() {
    if(!isGalleryPage()||globalThis.__OSG_AUTO_REPORT_STARTED__)return;
    globalThis.__OSG_AUTO_REPORT_STARTED__=true;
    // A durable Gallery sender survives publisher-tab closure. One request at a time.
    setInterval(function(){drainAutomaticReports().catch(function(){});},10000);
    drainAutomaticReports().catch(function(){});
  }
  function automaticReportDisplay() {
    var ack=GM_getValue(AUTO_REPORT_ACK,null),pending=autoReportKeys().length;
    if(!ack)return '自动上报已启用；待发送 '+pending+' 份';
    return (ack.state==='delivered'?'服务器已确认接收':'报告未送达：'+String(ack.error||ack.state))+' · 待发送 '+pending+' · '+new Date(ack.at).toLocaleTimeString();
  }
  // END OSG_AUTO_REPORT_V1
