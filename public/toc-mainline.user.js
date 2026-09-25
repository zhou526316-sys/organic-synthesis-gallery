// ==UserScript==
// @name         Organic Synthesis Gallery TOC Mainline
// @namespace    https://zhou526316-sys.github.io/organic-synthesis-gallery/
// @version      6.2.20
// @description  Runs the live TOC backlog in the authenticated browser, uploads verified visuals to R2, and records per-DOI diagnostic traces.
// @author       Organic Synthesis Gallery
// @match        https://gallery.gczhouwld.com/*
// @match        https://zhou526316-sys.github.io/organic-synthesis-gallery/*
// @match        https://organic-synthesis-gallery-public.pages.dev/*
// @match        https://pubs.acs.org/*
// @match        https://onlinelibrary.wiley.com/*
// @match        https://*.onlinelibrary.wiley.com/*
// @match        https://pubs.rsc.org/*
// @match        https://www.nature.com/*
// @match        https://www.science.org/*
// @match        https://www.sciencedirect.com/*
// @match        https://*.sciencedirect.com/*
// @match        https://www.cell.com/*
// @match        https://*.cell.com/*
// @match        https://www.ccspublishing.org.cn/*
// @match        https://*.ccspublishing.org.cn/*
// @match        https://doi.org/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      *
// @connect      acs.silverchair-cdn.com
// @connect      media.springernature.com
// @updateURL    https://gallery.gczhouwld.com/toc-mainline.user.js
// @downloadURL  https://gallery.gczhouwld.com/toc-mainline.user.js
// ==/UserScript==

(function () {
  'use strict';

  var VERSION = '6.2.20'; // Capture protocol/checkpoints remain compatible.
  var CONTROLLER_REVISION = '2.2.33';
  var CONTROLLER_STOP_REASON = '';
  var GALLERY_HOST = 'gallery.gczhouwld.com';
  var GALLERY_PATH = '/';
  var LEGACY_GALLERY_HOST = 'zhou526316-sys.github.io';
  var LEGACY_GALLERY_PATH = '/organic-synthesis-gallery/';
  var PAGES_GALLERY_HOST = 'organic-synthesis-gallery-public.pages.dev';
  var QUEUE_URL = 'https://zhou526316-sys.github.io/organic-synthesis-gallery/toc-demand-live.json';
  var WORKER = 'https://organic-synthesis-gallery.zhou526316.workers.dev';
  var CAPTURE_ENDPOINT = WORKER + '/api/media/local-capture/import';
  var FIGURE_IMPORT_ENDPOINT = WORKER + '/api/article-figures/import';
  var FIGURE_STAGE_ENDPOINT = WORKER + '/api/article-figures/stage';
  var CAPTURE_INDEX_URL = WORKER + '/api/media/local-capture-index';
  var REPORT_ENDPOINT = WORKER + '/api/media/tampermonkey-report/import';
  var DIAGNOSTICS_ENDPOINT = WORKER + '/api/media/local-diagnostics/import';
  var EVIDENCE_ENDPOINT = WORKER + '/api/article-summary/fulltext/import';
  var EVIDENCE_INVENTORY_ENDPOINT = WORKER + '/api/article-summary/evidence-inventory';
  var EVIDENCE_SCHEMA_VERSION = 'article-evidence-v2';
  var P = 'osg-toc-v6:';
  var TOKEN_KEY = P + 'write-token';
  var LEGACY_TOKEN_KEY = 'osg-toc-v5:write-token';
  var ENABLED_KEY = P + 'enabled';
  var ACTIVE_JOB_KEY = P + 'active-job';
  var LEASE_KEY = P + 'controller-lease';
  var SUMMARY_KEY = P + 'last-run-summary';
  var BATCH_SIZE_KEY = P + 'batch-size';
  var ABORT_KEY = P + 'abort-request';
  var HEARTBEAT_KEY = P + 'publisher-heartbeat';
  var FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  var NATURE_NO_TOC_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  var FAILURE_ENGINE_REVISION = VERSION + ':' + CONTROLLER_REVISION + ':20260925-wiley-ga';
  var DEFAULT_BATCH_SIZE = 8;
  var NEXT_BATCH_DELAY_MS = 12000;
  var nextBatchTimer = null;
  var CONTROLLER_ID = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  var MAX_TRACE = 150;

  // BEGIN OSG_LIVE_PROGRESS_V1 -- local telemetry only; never drives capture.
  var LIVE_VIEW_KEY = P + 'live-progress-v1';
  var LIVE_PANEL_KEY = P + 'live-panel-open-v1';

  function captureLiveError(value) {
    return String(value || '').replace(/https?:\/\/\S+/gi, '[url]')
      .replace(/(?:Bearer\s+\S+|(?:token|secret|password|cookie|authorization)\s*[:=]\s*[^\s;,]+)/gi, '[redacted]')
      .replace(/[A-Za-z0-9+/_=-]{40,}/g, '[redacted]').slice(0, 180);
  }

  function captureLiveUpdate(job, phase, detail) {
    try {
      // A retired/foreign tab must not overwrite the current task's telemetry.
      assertBoundCaptureJob(job);
      var live = GM_getValue(ACTIVE_JOB_KEY, null);
      if (!live || live.jobId !== job.jobId || live.doi !== job.doi) return false;
      var result = job._liveResult || {};
      var figures = result.figures || {};
      var prev = GM_getValue(LIVE_VIEW_KEY, null);
      var same = prev && prev.jobId === job.jobId && prev.doi === job.doi;
      detail = detail || {};
      var sameImage = same && prev.label === String(detail.label || job._liveLabel || '');
      var row = {
        jobId: job.jobId, doi: normalizeDoi(job.doi), controllerRevision: CONTROLLER_REVISION,
        captureProtocol: VERSION, phase: String(phase || 'working').slice(0, 40),
        at: Date.now(), startedAt: job.startedAt,
        label: String(detail.label || job._liveLabel || '').slice(0, 40),
        tocStatus: String((result.toc || {}).status || 'pending'),
        tocKind: String((result.toc || {}).kind || ''),
        discovered: Math.max(0, Number(figures.discovered || 0)),
        discoveryDone: Boolean(job._liveDiscoveryDone),
        stored: Math.max(0, Number(figures.stored || 0)),
        stagedReceipts: Math.max(0, Number(result.figuresStaged || 0)),
        reused: (figures.items || []).filter(function (x) { return x.status === 'already_staged'; }).length,
        failed: Math.max(0, Number(figures.failed || 0)),
        quality: String(detail.quality || (sameImage && prev.quality) || '').slice(0, 30),
        width: Math.max(0, Number(detail.width || (sameImage && prev.width) || 0)), height: Math.max(0, Number(detail.height || (sameImage && prev.height) || 0)),
        lastError: detail.error ? captureLiveError(detail.error) : String(same && prev.lastError || ''),
        resultStatus: String(result.status || ''),
        // This release retains the deployed verified-staging protocol.
        publicationState: 'not_published'
      };
      GM_setValue(LIVE_VIEW_KEY, row);
      return true;
    } catch (_) { return false; } // Monitoring failure must not fail a capture.
  }

  function captureLiveSnapshot(now) {
    var active = GM_getValue(ACTIVE_JOB_KEY, null);
    var summary = GM_getValue(SUMMARY_KEY, {}) || {};
    var raw = GM_getValue(LIVE_VIEW_KEY, null);
    var matching = Boolean(active && raw && raw.jobId === active.jobId && raw.doi === active.doi);
    var row = matching ? raw : null;
    var paused = GM_getValue(ENABLED_KEY, true) === false || Boolean(GM_getValue(ABORT_KEY, null));
    var progress = active ? GM_getValue(progressKey(active.doi), null) : null;
    var state = CONTROLLER_STOP_REASON || summary.stopReason || '';
    if (active) state = paused ? 'pausing' : row ? row.phase : 'awaiting_publisher';
    else if (paused) state = 'paused';
    else if (!state) state = summary.finishedAt ? 'between_batches' : 'idle';
    // Startup/auth progress is a separate local source; do not fabricate fresh activity.
    if (active && !paused && progress && /^(auth_wait|challenge_wait)$/.test(progress.status) &&
        progress.jobId === active.jobId && (!row || Date.parse(progress.at) > row.at)) state = progress.status;
    var last = row ? Number(row.at) : active ? Date.parse(active.startedAt || '') : Date.parse(summary.finishedAt || summary.startedAt || '');
    return {
      state: state, active: Boolean(active), doi: active ? normalizeDoi(active.doi) : '',
      journal: active ? String(active.journal || '').slice(0, 80) : '',
      row: row, ageSeconds: Number.isFinite(last) ? Math.max(0, Math.floor((now - last) / 1000)) : null,
      lastAt: Number.isFinite(last) ? last : null,
      completed: (summary.results || []).length, total: Math.max(0, Number(summary.total || 0)),
      batchToc: Math.max(0, Number(summary.tocStored || 0)),
      batchStaged: Math.max(0, Number(summary.figuresStaged || 0)),
      batchFailed: Math.max(0, Number(summary.failed || 0)),
      batchSkipped: Math.max(0, Number(summary.skipped || 0)),
      lastResult: (summary.results || []).length ? summary.results[summary.results.length - 1] : null,
      // Summary is committed after each paper. The active row is displayed separately, never added twice.
      publication: '已保存至 R2 暂存；符合站点增量发布规则的新 ACS 正文图会后续发布，当前是否上线以网页与发布账本为准'
    };
  }

  function captureLiveText(s) {
    var phaseNames = {
      idle:'等待启动', paused:'已暂停', pausing:'正在停止当前任务', between_batches:'本批结束／等待下一批或重试',
      awaiting_publisher:'已开任务页，等待出版社脚本', discovering:'识别 TOC 和正文图',
      auth_wait:'等待出版社登录', challenge_wait:'等待出版社验证', downloading:'获取图片候选',
      comparing:'比较清晰度／矢量结构', uploading:'上传并等待存储回执', saved:'已收到存储回执',
      reused:'复用已保存图片', image_failed:'该图片失败，保留其他结果', finished:'本篇处理结束'
    };
    var tocNames = {pending:'待处理',already_available:'保留已有 TOC',stored:'已保存',not_found:'未找到可用主图',failed:'失败'};
    var r = s.row;
    var quality = {vector:'矢量',vector_mixed:'混合矢量／位图',high:'高分辨率',usable:'可用分辨率',low:'低分辨率'};
    var toc = r ? (tocNames[r.tocStatus] || r.tocStatus) : '等待本篇数据';
    if (r && r.tocStatus === 'stored' && r.tocKind === 'figure1') toc += '（Figure 1 替代图，非官方 TOC）';
    var lastError = r ? r.lastError : s.lastResult && s.lastResult.status !== 'success' ? captureLiveError(s.lastResult.reason) : '';
    return {
      state: phaseNames[s.state] || ('已停止：' + captureLiveError(s.state)),
      doi: s.doi || '当前没有任务页', journal: s.journal,
      label: r && r.label || '—', toc: toc,
      figures: r ? '已保存 ' + r.stored + '／' + (r.discoveryDone ? r.discovered : '识别中') + ' · 失败 ' + r.failed : '等待本篇数据',
      receipts: r ? '本次暂存回执 ' + r.stagedReceipts + ' · 断点复用 ' + r.reused : '—',
      quality: r ? (quality[r.quality] || '尚未测量') + (r.width && r.height ? ' · ' + r.width + '×' + r.height : '') : '—',
      batch: '已结束 ' + s.completed + '／' + s.total + ' 篇 · 主图回执 ' + s.batchToc + ' · 正文暂存回执 ' + s.batchStaged + ' · 失败 ' + s.batchFailed + ' · 跳过 ' + s.batchSkipped,
      last: s.lastAt ? new Date(s.lastAt).toLocaleTimeString() + ' · ' + s.ageSeconds + ' 秒前' : '尚无进度记录',
      stale: s.active && s.ageSeconds >= 45 ? '一段时间没有新进展：可能正在等待网络或页面验证，不等于抓取失败。' : '',
      error: lastError || '无', publication: s.publication, delivery: automaticReportDisplay()
    };
  }

  function mountCaptureLivePanel() {
    if (!isGalleryPage() || globalThis.__OSG_CAPTURE_LIVE_PANEL__) return;
    var host = document.createElement('section');
    host.id = 'osg-capture-live-panel';
    host.style.cssText = 'position:fixed;right:14px;bottom:112px;z-index:2147483646;max-width:calc(100vw - 28px);width:365px';
    var root = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = ':host{font:12px/1.5 system-ui,sans-serif;color:#172b4d}details{background:#fff;border:1px solid #bac8db;border-radius:10px;box-shadow:0 5px 24px #0002;overflow:hidden}summary{padding:9px 12px;font-weight:650;cursor:pointer;background:#edf3fa}main{padding:10px 12px;max-height:50vh;overflow:auto}dl{display:grid;grid-template-columns:64px minmax(0,1fr);gap:6px 10px;margin:0}dt{color:#5a687b}dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}p{margin:9px 0 0;color:#53627a}#stale,#error:not([data-empty]){color:#9a3412}button{margin-top:10px;border:1px solid #9bb0c9;border-radius:6px;background:#f3f6fa;padding:5px 10px;cursor:pointer}small{display:block;margin-top:8px;color:#64748b}';
    root.appendChild(style);
    var details = document.createElement('details');
    details.open = GM_getValue(LIVE_PANEL_KEY, true) !== false;
    var heading = document.createElement('summary');
    heading.textContent = '抓取实时进度 · ' + CONTROLLER_REVISION;
    details.appendChild(heading);
    var main = document.createElement('main');
    var dl = document.createElement('dl');
    var fields = {};
    [['state','状态'],['doi','当前 DOI'],['journal','期刊'],['label','当前图片'],['toc','主图'],['figures','正文图片'],['receipts','保存记录'],['quality','清晰度'],['batch','本批累计'],['last','最后进展'],['error','最近问题']].forEach(function (pair) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = pair[1]; dd.id = pair[0]; fields[pair[0]] = dd; dl.appendChild(dt); dl.appendChild(dd);
    });
    main.appendChild(dl);
    ['stale','publication','delivery'].forEach(function (key) { var p = document.createElement('p'); p.id = key; fields[key] = p; main.appendChild(p); });
    var note = document.createElement('small');
    note.textContent = '每秒读取本机进度；后台标签页可能延迟。发现数量不是出版社全文总图数。';
    main.appendChild(note);
    details.appendChild(main); root.appendChild(details);
    (document.body || document.documentElement).appendChild(host);
    details.addEventListener('toggle', function () { try { GM_setValue(LIVE_PANEL_KEY, details.open); } catch (_) {} });
    function render() {
      try {
        var text = captureLiveText(captureLiveSnapshot(Date.now()));
        Object.keys(fields).forEach(function (key) { if (fields[key].textContent !== text[key]) fields[key].textContent = text[key]; });
        fields.stale.hidden = !text.stale;
        fields.error.toggleAttribute('data-empty', text.error === '无');
      } catch (_) { fields.state.textContent = '读取本机进度失败；抓取逻辑不受影响'; }
    }
    render();
    var timer = setInterval(render, 1000);
    globalThis.__OSG_CAPTURE_LIVE_PANEL__ = { show: function () { details.open = true; render(); }, stop: function () { clearInterval(timer); } };
    window.addEventListener('pagehide', function (event) { if (!event.persisted) clearInterval(timer); });
  }
  // END OSG_LIVE_PROGRESS_V1

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
    if(/Request was blocked by the user|Refused to connect.*blocked/i.test(m))return 'extension_connection_denied';
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
      var finalResult=job._liveResult||{};
      var figureItems=(finalResult.figures&&Array.isArray(finalResult.figures.items)?finalResult.figures.items:[]).filter(function(item){return item&&/^(?:staged|already_staged)$/.test(String(item.status||''));});
      var payload={doi:doi,jobId:job.jobId,captureVersion:VERSION,controllerRevision:CONTROLLER_REVISION,mediaNeed:String(job.mediaNeed||''),final:Boolean(final),publisher:job.publisher||publisherForDoi(doi),status:final?String(status||'failed'):'progress',reason:final?autoReportText(reason):'failure_checkpoint:'+autoReportCause(last),candidateSource:final?'auto_final_result':'auto_failure_checkpoint',articleUrl:page,sourceUrl:autoReportUrl(last.url),startedAt:job.startedAt||'',finishedAt:final?nowIso():'',queueGeneratedAt:job.queueGeneratedAt||'',tocStatus:String(finalResult.toc&&finalResult.toc.status||''),figuresDiscovered:Math.max(0,Number(finalResult.figures&&finalResult.figures.discovered||0)),figuresStored:Math.max(0,Number(finalResult.figures&&finalResult.figures.stored||0)),figureLabels:figureItems.map(function(item){return String(item.label||'').slice(0,80);}).filter(Boolean).slice(0,20),fulltextStatus:String(finalResult.fulltext&&finalResult.fulltext.status||''),evidenceChars:Math.max(0,Number(finalResult.fulltext&&finalResult.fulltext.chars||0)),evidenceSections:Math.max(0,Number(finalResult.fulltext&&finalResult.fulltext.sections||0)),evidenceLevel:String(finalResult.fulltext&&finalResult.fulltext.evidenceLevel||''),trace:[context].concat(events)};
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

  function nowIso() { return new Date().toISOString(); }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function normalizeDoi(value) {
    var s = String(value || '').trim().toLowerCase();
    try { s = decodeURIComponent(s); } catch (_) {}
    s = s.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
    return /^10\.\d{4,9}\/\S+$/i.test(s) ? s : '';
  }

  function embeddedNatureDoi(value) {
    var decoded = String(value || '');
    for (var i = 0; i < 2; i += 1) {
      try {
        var next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch (_) {
        break;
      }
    }
    var match = decoded.match(/10\.1038\/s\d+-\d+-\d+[a-z0-9-]*/i);
    return match ? normalizeDoi(match[0]) : '';
  }

function embeddedJobDois(value) {
  let decoded = String(value || '').split(/[?#]/, 1)[0];
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  const found = new Set();
  const pattern = /10\.(1021|1002|1038|1126|1039|1016|31635)[/_]([a-z0-9._()-]+)/ig;
  for (const match of decoded.matchAll(pattern)) {
    const doi = normalizeDoi('10.' + match[1] + '/' + match[2]);
    if (doi) found.add(doi);
  }
  try {
    const url = new URL(decoded);
    if (/^(?:www\.)?nature\.com$/i.test(url.hostname)) {
      const match = url.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)/i);
      if (match) found.add(normalizeDoi('10.1038/' + match[1]));
    }
  } catch {}
  return [...found].filter(Boolean);
}

  function publisherPageDois() {
    var ids = embeddedJobDois(location.href);
    document.querySelectorAll('head meta[name="citation_doi"],head meta[name="dc.Identifier"],head meta[name="DC.Identifier"],head meta[property="citation_doi"],head link[rel="canonical"]').forEach(function (node) {
      ids = ids.concat(embeddedJobDois(node.getAttribute('content') || node.getAttribute('href') || ''));
    });
    return Array.from(new Set(ids));
  }

  function assertBoundCaptureJob(job, sourceUrl) {
    var live = GM_getValue(ACTIVE_JOB_KEY, null);
    if (!job || !job.jobId || !live || live.jobId !== job.jobId || live.doi !== job.doi || job.captureVersion !== VERSION) {
      throw new Error('capture_job_stale_or_unbound');
    }
    var binding = '';
    try { binding = sessionStorage.getItem(P + 'tab-job-binding') || ''; } catch (_) {}
    if (binding !== job.jobId) throw new Error('capture_tab_job_mismatch');
    var page = publisherPageDois();
    if (!page.length) throw new Error('page_doi_unverified');
    if (page.some(function (doi) { return doi !== normalizeDoi(job.doi); })) throw new Error('page_doi_mismatch');
    var source = embeddedJobDois(sourceUrl || '');
    if (source.some(function (doi) { return doi !== normalizeDoi(job.doi); })) throw new Error('media_source_doi_mismatch');
    return normalizeDoi(job.doi);
  }

  async function bindPublisherCaptureJob(job) {
    var match = String(location.hash || '').match(/(?:^#|&)osg-job=([a-z0-9-]{16,80})(?:&|$)/i);
    var binding = '';
    try {
      if (match) sessionStorage.setItem(P + 'tab-job-binding', match[1]);
      binding = sessionStorage.getItem(P + 'tab-job-binding') || '';
    } catch (_) {}
    if (!job.jobId || binding !== job.jobId) throw new Error('capture_tab_job_mismatch');
    for (var i = 0; i < 8; i += 1) {
      try { return assertBoundCaptureJob(job); }
      catch (error) {
        if (String(error.message) !== 'page_doi_unverified' || i === 7) throw error;
        await sleep(400);
      }
    }
  }

  function candidateBelongsToJob(url, job) {
    var doi = normalizeDoi(job && job.doi);
    return Boolean(doi && embeddedJobDois(url).every(function (value) { return value === doi; }));
  }

  function publisherForDoi(doi) {
    if (doi.indexOf('10.1021/') === 0) return 'acs';
    if (doi.indexOf('10.1002/') === 0) return 'wiley';
    if (doi.indexOf('10.1038/') === 0) return 'nature';
    if (doi.indexOf('10.1126/') === 0) return 'science';
    if (doi.indexOf('10.1039/') === 0) return 'rsc';
    if (doi.indexOf('10.1016/') === 0) return 'elsevier';
    if (doi.indexOf('10.31635/') === 0) return 'ccs';
    return 'other';
  }

  function articleUrl(job) {
    var doi = normalizeDoi(job && job.doi);
    var publisher = String(job && job.publisher || publisherForDoi(doi));
    var suffix = doi.split('/')[1] || '';
    var figureJob = String(job && job.mediaNeed || '').indexOf('figures') >= 0 || String(job && job.mediaNeed || '') === 'evidence' || String(job && job.state || '') === 'figure_gap';
    if (publisher === 'acs') return 'https://pubs.acs.org/doi/' + doi;
    if (publisher === 'wiley') return 'https://onlinelibrary.wiley.com/doi/' + (figureJob ? 'full/' : '') + doi;
    if (publisher === 'nature') return 'https://www.nature.com/articles/' + suffix;
    if (publisher === 'science') return 'https://www.science.org/doi/' + (figureJob ? 'full/' : '') + doi;
    if (publisher === 'rsc') {
      var rsc = /^([a-z])(\d)([a-z]{2})/i.exec(suffix);
      if (rsc) return 'https://pubs.rsc.org/en/content/articlelanding/' + String(2020 + Number(rsc[2])) + '/' + rsc[3].toLowerCase() + '/' + suffix.toLowerCase();
    }
    return 'https://doi.org/' + doi;
  }

  function resultKey(doi) { return P + 'result:' + normalizeDoi(doi); }
  function progressKey(doi) { return P + 'progress:' + normalizeDoi(doi); }
  function traceKey(doi) { return P + 'trace:' + normalizeDoi(doi); }
  function jobKind(job) {
    var need=String(job && job.mediaNeed || '');
    if(need==='evidence')return 'evidence';
    return need === 'figures' || String(job && job.state || '') === 'figure_gap' ? 'figures' : 'toc';
  }
  function attemptKey(doi, generatedAt, kind) {
    var base = P + 'attempt:' + normalizeDoi(doi) + ':' + String(generatedAt || '');
    if(String(kind||'toc')==='evidence')return base+':evidence';
    return String(kind || 'toc') === 'figures' ? base + ':figures' : base;
  }
  function failureKey(doi, kind) {
    return String(kind || 'toc') === 'figures'
      ? P + 'failure:figures:' + normalizeDoi(doi)
      : P + 'failure:' + normalizeDoi(doi);
  }
  function writeToken() {
    var current = String(GM_getValue(TOKEN_KEY, '') || '').trim();
    if (current) return current;
    var legacy = String(GM_getValue(LEGACY_TOKEN_KEY, '') || '').trim();
    if (legacy) {
      GM_setValue(TOKEN_KEY, legacy);
      return legacy;
    }
    return '';
  }
  function batchSize() {
    var value = Number(GM_getValue(BATCH_SIZE_KEY, DEFAULT_BATCH_SIZE));
    if (!Number.isFinite(value)) value = DEFAULT_BATCH_SIZE;
    return Math.max(1, Math.min(20, Math.floor(value)));
  }
  function isFailureCooling(jobOrDoi) {
    var job = jobOrDoi && typeof jobOrDoi === 'object' ? jobOrDoi : null;
    var doi = normalizeDoi(job ? job.doi : jobOrDoi);
    var failed = GM_getValue(failureKey(doi, jobKind(job)), null);
    if (!failed || Number(failed.at || 0) <= 0) return false;
    if (String(failed.engineRevision || '') !== FAILURE_ENGINE_REVISION) return false;
    var reason = String(failed.reason || '');
    var publisher = String(job && job.publisher || publisherForDoi(doi));
    var cooldown = publisher === 'nature'
      && jobKind(job) === 'toc'
      && /^no_toc_candidate_/.test(reason)
        ? NATURE_NO_TOC_COOLDOWN_MS
        : FAILURE_COOLDOWN_MS;
    return Date.now() - Number(failed.at) < cooldown;
  }

  function abortRequest() {
    var value = GM_getValue(ABORT_KEY, null);
    return value && Number(value.at || 0) > 0 ? value : null;
  }

  function isAbortRequested() {
    return Boolean(abortRequest());
  }

  function sanitizeDiagnosticUrl(value) {
    var raw = String(value || '');
    if (!raw) return '';
    try {
      var url = new URL(raw, location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      url.search = '';
      url.hash = '';
      return url.href;
    } catch (_) {
      return raw.replace(/[?#].*$/, '').slice(0, 1200);
    }
  }

  function sanitizeLocalTrace(trace) {
    if (!Array.isArray(trace)) return [];
    return trace.slice(-160).map(function (entry) {
      return Object.assign({}, entry || {}, {
        url: sanitizeDiagnosticUrl(entry && entry.url || ''),
        message: sanitizeTraceMessage(entry && entry.message || '')
      });
    });
  }

  async function uploadLocalDiagnostics() {
    var token = writeToken();
    if (!token) {
      window.alert('尚未设置写入密钥，无法上传本地日志。');
      return;
    }
    var keys = [];
    try {
      if (typeof GM_listValues === 'function') keys = GM_listValues();
    } catch (_) {}
    var traces = keys.filter(function (key) {
      return String(key).indexOf(P + 'trace:') === 0;
    }).map(function (key) {
      var item = GM_getValue(key, null);
      if (!item || !normalizeDoi(item.doi)) return null;
      return {
        doi: normalizeDoi(item.doi),
        status: String(item.status || ''),
        reason: String(item.reason || '').slice(0, 240),
        finishedAt: String(item.finishedAt || ''),
        trace: sanitizeLocalTrace(item.trace)
      };
    }).filter(Boolean).sort(function (a, b) {
      return String(b.finishedAt || '').localeCompare(String(a.finishedAt || ''));
    }).slice(0, 24);

    var activeJob = GM_getValue(ACTIVE_JOB_KEY, null);
    var activeDoi = normalizeDoi(activeJob && activeJob.doi);
    var progress = activeDoi ? GM_getValue(progressKey(activeDoi), null) : null;
    var payload = {
      source: 'tampermonkey-toc-mainline',
      kind: 'manual-local-log-upload',
      version: VERSION,
      uploadedReason: 'user_menu',
      total: traces.length,
      summary: GM_getValue(SUMMARY_KEY, {}),
      activeJob: activeDoi ? {
        doi: activeDoi,
        publisher: String(activeJob.publisher || publisherForDoi(activeDoi)),
        queueGeneratedAt: String(activeJob.queueGeneratedAt || ''),
        startedAt: String(activeJob.startedAt || '')
      } : null,
      progress: progress ? {
        status: String(progress.status || ''),
        at: String(progress.at || ''),
        url: sanitizeDiagnosticUrl(progress.url || ''),
        version: String(progress.version || ''),
        host: String(progress.host || '')
      } : null,
      publisherHeartbeat: (function () {
        var hb = GM_getValue(HEARTBEAT_KEY, null);
        if (!hb) return null;
        return {
          doi: normalizeDoi(hb.doi || ''),
          publisher: String(hb.publisher || ''),
          host: String(hb.host || ''),
          href: sanitizeDiagnosticUrl(hb.href || ''),
          version: String(hb.version || ''),
          state: String(hb.state || ''),
          at: Number(hb.at || 0),
          atIso: String(hb.atIso || '')
        };
      })(),
      traces: traces
    };
    try {
      var result = await postJson(DIAGNOSTICS_ENDPOINT, payload, token);
      window.alert('本地日志已上传。trace DOI 数：' + String(traces.length) + '。');
      return result;
    } catch (error) {
      window.alert('本地日志上传失败：' + String(error && error.message || error));
      throw error;
    }
  }

  function writePublisherHeartbeat(job, state) {
    var doi = normalizeDoi(job && job.doi);
    var publisher = doi ? String(job.publisher || publisherForDoi(doi)) : publisherForDoi(normalizeDoi(location.href));
    var row = {
      doi: doi,
      jobId: job && job.jobId || '',
      publisher: publisher || '',
      host: String(location.hostname || ''),
      href: sanitizeDiagnosticUrl(location.href),
      version: VERSION,
      state: String(state || 'script_loaded'),
      at: Date.now(),
      atIso: nowIso()
    };
    GM_setValue(HEARTBEAT_KEY, row);
    return row;
  }

  function currentPublisherHeartbeat() {
    var hb = GM_getValue(HEARTBEAT_KEY, null);
    return hb && Number(hb.at || 0) > 0 ? hb : null;
  }

  function alreadySucceeded(job, queueGeneratedAt) {
    var doi = normalizeDoi(job && job.doi);
    if (!doi) return false;
    var prior = GM_getValue(attemptKey(doi, queueGeneratedAt || '', jobKind(job)), null);
    return Boolean(prior && prior.status === 'success');
  }

  function executableJobs(allJobs, queueGeneratedAt) {
    return (allJobs || []).filter(function (job) {
      return !alreadySucceeded(job, queueGeneratedAt) && !isFailureCooling(job);
    });
  }

  function journalPriority(job) {
    var journal = String(job && job.journal || '').trim();
    if (journal === 'Nature') return 0;
    if (journal === 'Science') return 1;
    if (/^Nature\s+/i.test(journal)) return 2;
    if (/^Science\s+/i.test(journal)) return 3;
    if (journal === 'JACS') return 4;
    if (journal === 'Angew') return 5;
    if (journal === 'Chem') return 6;
    return 7;
  }

  function captureQueueTier(job, latestAddedDate) {
    if (latestAddedDate && String(job && job.addedDate || '') === String(latestAddedDate)) return 0;
    if (job && job.captureToc === true) return 1;
    if (String(job && job.mediaNeed || '') === 'evidence') return 3;
    if (job && (job.captureToc === false || String(job.state || '') === 'figure_gap' || String(job.mediaNeed || '') === 'figures')) return 2;
    return 4;
  }

  function compareCaptureJobs(a, b, latestAddedDate) {
    var tierDelta = captureQueueTier(a, latestAddedDate) - captureQueueTier(b, latestAddedDate);
    if (tierDelta) return tierDelta;
    var journalDelta = journalPriority(a) - journalPriority(b);
    if (journalDelta) return journalDelta;
    var dateDelta = String(b.date || '').localeCompare(String(a.date || ''));
    if (dateDelta) return dateDelta;
    if (captureQueueTier(a, latestAddedDate) === 2 && String(a.state || '') === 'figure_gap' && String(b.state || '') === 'figure_gap') {
      var figureDelta = Math.max(0, Number(a.figureCount || 0)) - Math.max(0, Number(b.figureCount || 0));
      if (figureDelta) return figureDelta;
    }
    return String(a.doi || '').localeCompare(String(b.doi || ''));
  }

  function selectBatchJobs(allJobs, limit, latestAddedDate) {
    var normalized = [];
    allJobs.forEach(function (raw) {
      var job = Object.assign({}, raw);
      job.doi = normalizeDoi(job.doi);
      if (!job.doi || isFailureCooling(job)) return;
      job.publisher = String(job.publisher || publisherForDoi(job.doi));
      normalized.push(job);
    });
    normalized.sort(function (a, b) {
      return compareCaptureJobs(a, b, latestAddedDate);
    });
    return normalized.slice(0, Math.max(0, Number(limit || 0)));
  }

  function stagedFigureJobs() {
    var jobs = [];
    var seen = {};
    Array.prototype.slice.call(document.querySelectorAll('[data-media-need][data-doi], [data-media-need] [data-doi]')).forEach(function (node) {
      var need = String(node.getAttribute('data-media-need') || node.closest('[data-media-need]') && node.closest('[data-media-need]').getAttribute('data-media-need') || '');
      if (need.indexOf('figures') < 0) return;
      var doi = normalizeDoi(node.getAttribute('data-doi'));
      if (!doi || seen[doi]) return;
      seen[doi] = true;
      jobs.push({
        doi: doi,
        publisher: publisherForDoi(doi),
        state: 'figure_gap',
        mediaNeed: need,
        existingReason: 'gallery_article_figure_gap'
      });
    });
    return jobs;
  }

  function selectPriorityBatch(visible, upgrades, limit) {
    var primary = selectBatchJobs(visible, limit);
    if (primary.length >= limit) return primary;
    var selected = new Set(primary.map(function (job) { return normalizeDoi(job.doi); }));
    var remainingUpgrades = upgrades.filter(function (job) {
      var doi = normalizeDoi(job && job.doi);
      return doi && !selected.has(doi);
    });
    return primary.concat(selectBatchJobs(remainingUpgrades, limit - primary.length));
  }

  function sanitizeTraceMessage(value) {
    var text = String(value == null ? '' : value).slice(0, 1600);
    text = text.replace(/https?:\/\/[^\s"'<>]+/gi, function (raw) {
      return sanitizeDiagnosticUrl(raw);
    });
    text = text.replace(/(authorization\s*:\s*bearer\s+)[^\s;,]+/ig, '$1[redacted]');
    text = text.replace(/((?:signature|token|key-pair-id|x-amz-signature|x-amz-credential)=)[^&\s]+/ig, '$1[redacted]');
    return text.slice(0, 1200);
  }

  function pushTrace(trace, data) {
    var row = Object.assign({
      seq: trace.length + 1,
      at: nowIso(),
      stage: '',
      event: '',
      status: '',
      httpStatus: 0,
      contentType: '',
      url: '',
      message: '',
      candidateKind: '',
      candidateSource: '',
      candidateScore: 0,
      imageWidth: 0,
      imageHeight: 0,
      byteLength: 0
    }, data || {});
    row.url = sanitizeDiagnosticUrl(row.url || '');
    row.message = sanitizeTraceMessage(row.message || '');
    trace.push(row);
    captureDiagnosticEvent(trace,row);
    if (trace.length > MAX_TRACE) trace.splice(0, trace.length - MAX_TRACE);
    try { console.debug('[OSG TOC]', row.stage, row.event, row.status, row.message || ''); } catch (_) {}
    return row;
  }

  function gmRequest(options) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest(Object.assign({}, options, {
        onload: function (response) { resolve(response); },
        onerror: function (error) { reject(new Error('gm_request_error:' + String(error && (error.error || error.statusText || error.status) || 'unknown'))); },
        ontimeout: function () { reject(new Error('gm_request_timeout')); },
        onabort: function () { reject(new Error('gm_request_aborted')); }
      }));
    });
  }

  async function getJson(url) {
    var response = await gmRequest({
      method: 'GET',
      url: url,
      timeout: 45000,
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' }
    });
    if (Number(response.status || 0) < 200 || Number(response.status || 0) >= 300) {
      throw new Error('queue_http_' + String(response.status || 0));
    }
    return JSON.parse(String(response.responseText || '{}'));
  }
  async function getPrivateJson(url, token) {
    var response = await gmRequest({
      method:'GET',
      url:url,
      timeout:30000,
      headers:{'cache-control':'no-cache',pragma:'no-cache',authorization:'Bearer '+String(token||'')}
    });
    if (Number(response.status||0)<200 || Number(response.status||0)>=300) {
      throw new Error('private_http_'+String(response.status||0));
    }
    return JSON.parse(String(response.responseText||'{}'));
  }


  async function readLiveCaptureKinds() {
    try {
      var payload = await getJson(CAPTURE_INDEX_URL + '?ts=' + Date.now());
      var map = new Map();
      var items = Array.isArray(payload && payload.items) ? payload.items : [];
      items.forEach(function (item) {
        var doi = normalizeDoi(item && item.doi);
        var kind = String(item && item.kind || '').toLowerCase();
        if (!doi || (kind !== 'official' && kind !== 'figure1')) return;
        map.set(doi, kind);
      });
      return map;
    } catch (error) {
      try { console.warn('[OSG TOC] live R2 capture reconciliation unavailable', String(error && error.message || error)); } catch (_) {}
      return new Map();
    }
  }

  function reconcileQueueWithLiveCaptures(visible, upgrades, captureKinds) {
    var visibleOut = [];
    var upgradeMap = new Map();
    (Array.isArray(upgrades) ? upgrades : []).forEach(function (raw) {
      var doi = normalizeDoi(raw && raw.doi);
      if (!doi) return;
      var kind = captureKinds.get(doi) || '';
      if (kind === 'official') return;
      upgradeMap.set(doi, Object.assign({}, raw, {
        doi: doi,
        state: kind === 'figure1' ? 'fallback_only' : String(raw.state || 'fallback_only'),
        existingReason: kind === 'figure1' ? 'live_r2_figure1_fallback' : String(raw.existingReason || '')
      }));
    });
    (Array.isArray(visible) ? visible : []).forEach(function (raw) {
      var doi = normalizeDoi(raw && raw.doi);
      if (!doi) return;
      var kind = captureKinds.get(doi) || '';
      if (kind === 'official') return;
      if (kind === 'figure1') {
        if (!upgradeMap.has(doi)) {
          upgradeMap.set(doi, Object.assign({}, raw, {
            doi: doi,
            state: 'fallback_only',
            existingReason: 'live_r2_figure1_fallback'
          }));
        }
        return;
      }
      visibleOut.push(Object.assign({}, raw, { doi: doi }));
    });
    return {
      visible: visibleOut,
      upgrades: Array.from(upgradeMap.values()),
      filteredByR2: (Array.isArray(visible) ? visible.length : 0) + (Array.isArray(upgrades) ? upgrades.length : 0) - visibleOut.length - upgradeMap.size
    };
  }

  // BEGIN OSG_UPLOAD_EVIDENCE_V1 -- never logs auth or raw response documents.
  function uploadResponseError(status, body, raw, getHeader, transport) {
    body = body && typeof body === 'object' ? body : {};
    var code = autoReportText(body.code || body.detail || body.error || '').slice(0, 240);
    var type = String(getHeader('content-type') || '').split(';')[0].slice(0, 80);
    var ray = String(getHeader('cf-ray') || '').replace(/[^a-z0-9-]/gi, '').slice(0, 80);
    var requestId = String(body.requestId || '').replace(/[^a-z0-9-]/gi, '').slice(0, 80);
    var responseFormat = /^\s*[\[{]/.test(String(raw || '')) ? 'json' : /^\s*</.test(String(raw || '')) ? 'markup' : 'other';
    var seconds = Number(getHeader('retry-after'));
    var retryAfterMs = seconds > 0 ? seconds * 1000 : 0;
    if (!retryAfterMs && getHeader('retry-after')) retryAfterMs = Math.max(0, Date.parse(getHeader('retry-after')) - Date.now()) || 0;
    var evidence = {transport: transport, responseContentType: type, responseFormat: responseFormat, responseCharacters: String(raw || '').length,
      cfRay: ray || null, workerRequestId: requestId || null, workerCode: code || null,
      storageOperation: String(body.operation || '').replace(/[^a-z_]/gi, '').slice(0, 80),
      objectStored: body.objectStored === true, retryable: typeof body.retryable === 'boolean' ? body.retryable : null,
      retryAfterMs: Math.max(retryAfterMs, Number(body.retryAfterMs || 0))};
    var error = new Error('upload_http_' + String(status || 0) + ':' + (code || 'response_without_worker_error_code') + ';' + JSON.stringify(evidence));
    error.httpStatus = Number(status || 0); error.responseError = code;
    error.uploadEvidence = evidence; error.retryable = evidence.retryable; error.retryAfterMs = evidence.retryAfterMs;
    return error;
  }

  async function fetchPostJson(url, payload, token) {
    var abort = new AbortController();
    var timer = setTimeout(function () { abort.abort(); }, 45000);
    try {
      var response = await fetch(url, {method:'POST',mode:'cors',credentials:'omit',cache:'no-store',signal:abort.signal,
        headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(payload)});
      var raw = await response.text(); var body = {};
      try { body = JSON.parse(raw || '{}'); } catch (_) {}
      if (!response.ok) throw uploadResponseError(response.status, body, raw, function (h) { return response.headers.get(h) || ''; }, 'page_fetch');
      return body;
    } finally { clearTimeout(timer); }
  }

  async function postJson(url, payload, token) {
    var response;
    try {
      response = await gmRequest({method:'POST',url:url,timeout:45000,
        headers:{'content-type':'application/json',authorization:'Bearer '+token},data:JSON.stringify(payload)});
    } catch (gmError) {
      // Do not route around an explicit extension permission denial.
      if (/Request was blocked by the user|Refused to connect.*blocked/i.test(String(gmError && gmError.message || ''))) throw gmError;
      try { return await fetchPostJson(url, payload, token); }
      catch (fetchError) {
        var combined = new Error('gm_then_fetch_failed:' + autoReportText(gmError && gmError.message || gmError) + ';' + autoReportText(fetchError && fetchError.message || fetchError));
        combined.httpStatus = Number(fetchError && fetchError.httpStatus || gmError && gmError.httpStatus || 0);
        combined.responseError = String(fetchError && fetchError.responseError || '');
        combined.uploadEvidence = fetchError && fetchError.uploadEvidence;
        combined.retryable = fetchError && fetchError.retryable;
        combined.retryAfterMs = Number(fetchError && fetchError.retryAfterMs || 0);
        throw combined;
      }
    }
    var raw = String(response.responseText || ''); var body = {};
    try { body = JSON.parse(raw || '{}'); } catch (_) {}
    var status = Number(response.status || 0);
    if (status < 200 || status >= 300) throw uploadResponseError(status, body, raw, function (h) { return headerValue(response.responseHeaders, h); }, 'gm_request');
    return body;
  }

  function retryableImageUpload(error) {
    var message = String(error && error.message || '');
    if (/doi_mismatch|receipt_invalid|stale|unbound|user_aborted|Request was blocked by the user|Refused to connect|upgrade_required|binding_missing/i.test(message) || error && error.retryable === false) return false;
    var status = Number(error && error.httpStatus || 0);
    if ([408,425,429,500,502,503,504].indexOf(status) >= 0) return true;
    return !status && /gm_then_fetch_failed|gm_request_error|Failed to fetch|NetworkError|timeout|AbortError/i.test(message);
  }

  async function postAcquiredImage(job, candidate, image, trace, endpoint, payload, token, stage) {
    for (var attempt = 0; attempt < 3; attempt += 1) {
      if (attempt) assertBoundCaptureJob(job, candidate.url);
      try { return await postJson(endpoint, payload, token); }
      catch (error) {
        pushTrace(trace,{stage:stage,event:'failed',status:'failed',url:endpoint,httpStatus:Number(error && error.httpStatus || 0),
          byteLength:image.byteLength,message:'label='+String(payload.label || payload.kind || '')+';uploadAttempt='+(attempt+1)+';'+String(error && error.message || error)});
        if (attempt >= 2 || !retryableImageUpload(error)) throw error;
        var delay = Math.max(1500 * Math.pow(2, attempt), Number(error.retryAfterMs || 0));
        // Do not violate Retry-After or silently outlive the task; leave the failure queued for later.
        if (delay > 30000 || job.captureDeadline && Date.now() + delay + 1000 >= job.captureDeadline) throw error;
        pushTrace(trace,{stage:stage,event:'upload_retry_wait',status:'retrying',url:endpoint,httpStatus:Number(error.httpStatus || 0),
          message:'same_acquired_image;nextAttempt='+(attempt+2)+';delayMs='+delay+';publisherDownloads=0'});
        captureLiveUpdate(job,'uploading',{label:payload.label || 'TOC',error:'上传暂时失败，保留已下载图片，'+Math.ceil(delay/1000)+'秒后仅重试上传'});
        await sleep(delay);
      }
    }
    throw new Error('image_upload_attempts_exhausted');
  }
  // END OSG_UPLOAD_EVIDENCE_V1

  function headerValue(headers, name) {
    var wanted = String(name || '').toLowerCase();
    var lines = String(headers || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i += 1) {
      var p = lines[i].indexOf(':');
      if (p < 1) continue;
      if (lines[i].slice(0, p).trim().toLowerCase() === wanted) return lines[i].slice(p + 1).trim();
    }
    return '';
  }

  function sniffContentType(buffer, declared) {
    var bytes = new Uint8Array(buffer || new ArrayBuffer(0));
    var head = '';
    try { head = new TextDecoder().decode(bytes.slice(0, 1024)).replace(/^\uFEFF/, '').trimStart().toLowerCase(); } catch (_) {}
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      try { head = new TextDecoder('utf-16le').decode(bytes.slice(2, 2048)).trimStart().toLowerCase(); } catch (_) {}
    } else if (bytes.length >= 4 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      try { head = new TextDecoder('utf-16be').decode(bytes.slice(2, 2048)).trimStart().toLowerCase(); } catch (_) {}
    }
    if (head.indexOf('<?xml') === 0 || head.indexOf('<svg') === 0 || head.indexOf('<svg ') >= 0) return 'image/svg+xml';
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 12 && String.fromCharCode.apply(null, bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode.apply(null, bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
    if (bytes.length >= 6) {
      var gif = String.fromCharCode.apply(null, bytes.slice(0, 6));
      if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
    }
    // ACS high-resolution download endpoints often return TIFF as application/octet-stream.
    // Identify it for diagnostics, but never upload TIFF to the current Worker protocol.
    if (bytes.length >= 4 && ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00)
      || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))) return 'image/tiff';
    var clean = String(declared || '').split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg');
    if (clean === 'image/tif') clean = 'image/tiff';
    return /^image\//.test(clean) ? clean : 'application/octet-stream';
  }

  function toBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary);
  }

  function normalizeUrl(raw, baseUrl) {
    try {
      var url = new URL(String(raw || '').trim(), baseUrl || location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      url.hash = '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function mediaUrlIdentity(value, baseUrl) {
    var url = normalizeUrl(value, baseUrl);
    if (!url) return '';
    try {
      var parsed = new URL(url);
      parsed.search = '';
      parsed.hash = '';
      return parsed.href;
    } catch (_) {
      return url.replace(/[?#].*$/, '');
    }
  }

  function findLiveImageElement(scope, targetUrl, baseUrl) {
    if (!scope || !scope.querySelectorAll) return null;
    var wanted = mediaUrlIdentity(targetUrl, baseUrl);
    if (!wanted) return null;
    var nodes = scope.querySelectorAll('img');
    for (var i = 0; i < nodes.length; i += 1) {
      var img = nodes[i];
      var urls = imageUrls(img, baseUrl);
      for (var j = 0; j < urls.length; j += 1) {
        if (mediaUrlIdentity(urls[j], baseUrl) === wanted) return img;
      }
    }
    return null;
  }

  function candidateRequestUrl(candidate) {
    // A high-resolution candidate must not be silently replaced by element.currentSrc.
    return normalizeUrl(candidate && candidate.url, location.href);
  }

  function imageUrls(node, baseUrl) {
    var values = [];
    function add(value) {
      if (!value) return;
      String(value).split(',').forEach(function (part) {
        var raw = part.trim().split(/\s+/)[0];
        var url = normalizeUrl(raw, baseUrl);
        if (url && values.indexOf(url) < 0) values.push(url);
      });
    }
    if (node instanceof HTMLImageElement) add(node.currentSrc);
    [
      'data-srcset','srcset','data-src','data-lazy-src','data-original','data-image',
      'data-url','data-hi-res-src','data-lg-src','data-src-large','data-full-src',
      'data-full','data-image-src','data-large','data','href','xlink:href','src'
    ].forEach(function (name) { add(node.getAttribute && node.getAttribute(name)); });
    return values;
  }

  function articleFigureImageUrls(node, baseUrl) {
    var values = [];
    function add(raw) {
      if (!raw) return;
      var url = normalizeUrl(raw, baseUrl);
      if (url && values.indexOf(url) < 0) values.push(url);
    }
    function addSrcset(raw) {
      var ranked = String(raw || '').split(',').map(function (part) {
        var bits = part.trim().split(/\s+/);
        var descriptor = bits[1] || '';
        var rank = /w$/i.test(descriptor) ? Number(descriptor.replace(/w$/i, '')) * 10
          : /x$/i.test(descriptor) ? Number(descriptor.replace(/x$/i, '')) * 10000
          : 0;
        return { url: bits[0] || '', rank: Number.isFinite(rank) ? rank : 0 };
      }).filter(function (item) { return Boolean(item.url); })
        .sort(function (a, b) { return b.rank - a.rank; });
      ranked.forEach(function (item) { add(item.url); });
    }

    [
      'data-full-src','data-full','data-lg-src','data-hi-res-src','data-src-large',
      'data-original','data-large','data-image-src','data-image','data-url'
    ].forEach(function (name) { add(node.getAttribute && node.getAttribute(name)); });
    addSrcset(node.getAttribute && node.getAttribute('data-srcset'));
    addSrcset(node.getAttribute && node.getAttribute('srcset'));

    var link = node.closest && node.closest('a[href]');
    if (link) add(link.getAttribute('href'));

    ['data-src','data-lazy-src'].forEach(function (name) { add(node.getAttribute && node.getAttribute(name)); });
    if (node instanceof HTMLImageElement) add(node.currentSrc);
    add(node.getAttribute && node.getAttribute('src'));
    return values;
  }


  function articleFigureResolution(width, height) {
    width = Math.max(0, Number(width || 0));
    height = Math.max(0, Number(height || 0));
    if (!width || !height) return { quality: 'unknown', usable: false };
    var maxSide = Math.max(width, height);
    var minSide = Math.min(width, height);
    var pixels = width * height;
    if (maxSide >= 900 && minSide >= 180 && pixels >= 220000) return { quality: 'high', usable: true };
    if (maxSide >= 600 && minSide >= 140 && pixels >= 120000) return { quality: 'usable', usable: true };
    return { quality: 'low', usable: false };
  }
  function rawTagAttrs(tag) {
    var out = {};
    String(tag || '').replace(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g, function (_, key, dq, sq, bare) {
      var value = dq !== undefined ? dq : sq !== undefined ? sq : bare !== undefined ? bare : '';
      out[String(key || '').toLowerCase()] = String(value || '').replace(/&amp;/g, '&').replace(/&#38;/g, '&');
      return _;
    });
    return out;
  }

  function rawTagImageUrls(tag, baseUrl) {
    var attrs = rawTagAttrs(tag);
    var urls = [];
    function add(value) {
      if (!value) return;
      String(value).split(',').forEach(function (part) {
        var raw = part.trim().split(/\s+/)[0];
        var url = normalizeUrl(raw, baseUrl);
        if (url && urls.indexOf(url) < 0) urls.push(url);
      });
    }
    [
      'data-lg-src','data-hi-res-src','data-src-large','data-full-src','data-full',
      'data-original','data-src','data-lazy-src','data-image-src','data-image','data-url'
    ].forEach(function (key) { add(attrs[key]); });
    ['data-srcset','srcset'].forEach(function (key) {
      var parts = String(attrs[key] || '').split(',').map(function (part) { return part.trim(); }).filter(Boolean).reverse();
      parts.forEach(function (part) { add(part.split(/\s+/)[0]); });
    });
    add(attrs.src);
    return { attrs: attrs, urls: urls };
  }

  function htmlText(fragment) {
    try {
      var node = document.createElement('div');
      node.innerHTML = String(fragment || '');
      return String(node.textContent || '').replace(/\s+/g, ' ').trim();
    } catch (_) {
      return String(fragment || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  function contextFor(node) {
    var out = [];
    var image = node instanceof HTMLSourceElement ? (node.parentElement && node.parentElement.querySelector('img')) : node;
    [image && image.alt, image && image.title, node.getAttribute && node.getAttribute('class'), node.getAttribute && node.getAttribute('id')].forEach(function (value) {
      if (value) out.push(String(value));
    });
    var root = node.parentElement;
    for (var depth = 0; root && depth < 4; depth += 1, root = root.parentElement) {
      var cls = String(root.className || '');
      var id = String(root.id || '');
      var text = String(root.innerText || '').replace(/\s+/g, ' ').trim();
      if (cls) out.push(cls);
      if (id) out.push(id);
      if (text) out.push(text.slice(0, 1400));
      if (/figure|graphical|visual|abstract|toc/i.test(cls + ' ' + id)) break;
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }

  function officialType(text, url, publisher) {
    var hay = String(text || '') + ' ' + String(url || '');
    if (/toc\s*(?:and\s*abstract\s*)?(?:graphic|image)|table\s*of\s*contents\s*(?:graphic|image)/i.test(hay)) return 'toc_graphic';
    if (/graphical\s*abstract|visual\s*abstract|graphical\s*(?:summary|synopsis)|visual\s*summary|central\s*illustration|summary\s*graphic/i.test(hay)) return 'graphical_abstract';
    if (/abstract[-_\s]*(?:graphic|image)/i.test(hay)) return 'abstract_image';
    if (/-gra-0*1(?:[-_.]|$)|(?:^|[\/_-])(?:ga|fx)0*1(?:[-_.]|$)/i.test(hay)) return 'graphical_abstract';
    if (publisher === 'wiley' && (/first\s+page\s+image/i.test(hay) || /-gra-\d+/i.test(hay))) return 'graphical_abstract';
    if (publisher === 'acs' && /(?:\/|[_-])toc(?:\/|[_-]|\d|\.)/i.test(hay)) return 'toc_graphic';
    return '';
  }

  function isFigureOne(text) {
    var value = String(text || '');
    return /(?:^|\b)fig(?:ure)?\.?\s*0*1(?:\b|[:.)-])/i.test(value)
      || /(?:^|[\/_-])fig(?:ure)?0*1(?:[-_.]|$)|-fig-?0*1(?:[-_.]|$)|_fig0*1_html\.|(?:^|[\/_-])(?:f|gr)0*1(?:[-_.]|$)/i.test(value);
  }

  function reject(text, url) {
    return /journal[\s_-]*cover|issue[\s_-]*cover|masthead|site[-_ ]?logo|favicon|avatar|author[-_ ]photo|advert|banner|spinner|loading|tracking|pixel|cookie|placeholder|qr-code/i.test(String(text || '') + ' ' + String(url || ''));
  }

  function scoreCandidate(node, url, publisher, allowFigureOne, sourceName) {
    var context = contextFor(node);
    if (reject(context, url)) return null;
    var type = officialType(context, url, publisher);
    var kind = type ? 'official' : '';
    var score = type === 'toc_graphic' ? 500 : type === 'graphical_abstract' ? 480 : type === 'abstract_image' ? 450 : 0;
    if (/-gra-\d+/i.test(url)) score += 180;
    if (/graphical[-_]?abstract|visual[-_]?abstract/i.test(url)) score += 160;
    if (/(?:\/|[_-])toc(?:\/|[_-]|\d|\.)/i.test(url)) score += 140;
    if (!kind && allowFigureOne && isFigureOne(context)) {
      kind = 'figure1';
      type = 'figure1_fallback';
      score = 180;
    }
    if (!kind) return null;
    var img = node instanceof HTMLSourceElement ? (node.parentElement && node.parentElement.querySelector('img')) : node;
    var width = Number(img && (img.naturalWidth || img.width) || 0);
    var height = Number(img && (img.naturalHeight || img.height) || 0);
    if (width >= 180 || height >= 100) score += 20;
    return {
      url: url,
      kind: kind,
      assetType: type,
      score: score,
      source: sourceName || 'live_dom',
      text: context.slice(0, 1000),
      width: width,
      height: height,
      element: img instanceof HTMLImageElement ? img : null
    };
  }

  function articleFigureLabel(text, fallbackIndex) {
    var value = String(text || '').replace(/\s+/g, ' ').trim();
    var numbered = value.match(/\b(Figure|Fig\.?|Scheme|Chart)\s*([A-Za-z]?\d+[A-Za-z]?)\b/i);
    if (numbered) {
      var kind = /^fig/i.test(numbered[1]) ? 'Figure'
        : numbered[1].charAt(0).toUpperCase() + numbered[1].slice(1).toLowerCase();
      return kind + ' ' + numbered[2];
    }
    if (/substrate\s+scope|reaction\s+scope|scope\s+of/i.test(value)) return 'Scope';
    if (/mechanis|catalytic\s+cycle|proposed\s+pathway/i.test(value)) return 'Mechanism';
    if (/optimization|reaction\s+conditions/i.test(value)) return 'Optimization';
    return 'Figure ' + String(fallbackIndex + 1);
  }

  function collectArticleFigureCandidates(job, trace, root, baseUrl, sourceName) {
    var scope = root || document, rows = [], seen = new Set();
    scope.querySelectorAll('img,object[type^="image"]').forEach(function (node) {
      var context = visualScope(node);
      if (!context || !context.label || context.official) return;
      visualUrls(node, context.block, baseUrl || location.href).forEach(function (url, rank) {
        var key = context.label + '|' + url;
        if (seen.has(key) || reject(context.caption, url) || !candidateBelongsToJob(url, job)) return;
        seen.add(key);
        rows.push({url:url,kind:'article_figure',assetType:'article_figure',label:context.label,text:context.caption,source:'isolated_figure_caption',score:100-rank,element:node.tagName.toLowerCase()==='img'?node:null});
      });
    });
    rows.sort(function (a,b) { return String(a.label).localeCompare(String(b.label),undefined,{numeric:true}) || b.score-a.score; });
    pushTrace(trace,{stage:'figure_discovery',event:'scan_complete',status:rows.length?'found':'none',message:'isolated_labels='+new Set(rows.map(function(r){return r.label;})).size+';variants='+rows.length});
    return rows;
  }

  async function waitForArticleFigures(job, trace) {
    var started = Date.now();
    var scrollStep = 0;
    while (Date.now() - started < 60000) {
      if (isAbortRequested()) throw new Error('user_aborted');
      var rows = collectArticleFigureCandidates(job, trace, document, location.href, 'live_dom');
      if (rows.length) return rows;
      var elapsed = Date.now() - started;
      var thresholds = [2500, 6500, 12000, 20000];
      if (scrollStep < thresholds.length && elapsed > thresholds[scrollStep]) {
        try {
          var height = Math.max(document.documentElement.scrollHeight, document.body && document.body.scrollHeight || 0);
          window.scrollTo({ top: Math.round(height * ((scrollStep + 1) / (thresholds.length + 1))), behavior: 'instant' });
        } catch (_) {}
        scrollStep += 1;
      }
      await sleep(1800);
    }
    return [];
  }

  function wileyGraphicalAbstractCandidates(job, trace, root, baseUrl, sourceName) {
    if (!job || job.publisher !== 'wiley') return [];
    var scope = root || document, base = baseUrl || location.href, rows = [], seen = new Set();

    function excludedNode(node) {
      return Boolean(node && node.closest && node.closest('aside,nav,header,footer,[class*="recommend" i],[class*="related" i],[id*="related" i],[class*="reference" i],[id*="reference" i]'));
    }

    function officialWileyAsset(url) {
      try {
        var parsed = new URL(url, base);
        var host = parsed.hostname.toLowerCase();
        return host === 'onlinelibrary.wiley.com'
          || host.endsWith('.onlinelibrary.wiley.com')
          || host === 'wiley.com'
          || host.endsWith('.wiley.com')
          || host === 'wiley.com.cn'
          || host.endsWith('.wiley.com.cn');
      } catch (_) {
        return false;
      }
    }

    function add(node, url, score, source, text) {
      if (!url || seen.has(url) || excludedNode(node) || !officialWileyAsset(url)) return;
      var context = visualScope(node);
      if (context && context.label) return; // Never reinterpret a numbered Figure/Scheme as the Graphical Abstract.
      if (!candidateBelongsToJob(url, job) || reject(text, url)) return;
      seen.add(url);
      var img = node instanceof HTMLSourceElement ? (node.parentElement && node.parentElement.querySelector('img')) : node;
      rows.push({
        url: url,
        kind: 'official',
        assetType: 'graphical_abstract',
        score: score,
        source: source,
        text: String(text || 'Graphical Abstract').slice(0, 1000),
        width: Number(img && (img.naturalWidth || img.width) || 0),
        height: Number(img && (img.naturalHeight || img.height) || 0),
        element: img instanceof HTMLImageElement ? img : null
      });
    }

    // Wiley commonly exposes the Graphical Abstract as a CMS asset whose filename contains "-gra-".
    // Scan those strong assets directly, but only within the current article DOM and never in related/recommended content.
    scope.querySelectorAll('img,source,object[type^="image"],a[href]').forEach(function(node) {
      if (excludedNode(node)) return;
      var urls = [];
      if (node.tagName && node.tagName.toLowerCase() === 'a') {
        var href = normalizeUrl(node.getAttribute('href') || '', base);
        if (href) urls.push(href);
      } else {
        urls = visualUrls(node, node.closest && node.closest('figure,[role="figure"],div,section'), base);
      }
      urls.forEach(function(url) {
        if (/-gra-\d+/i.test(url)) add(node, url, 900, 'wiley_gra_asset', 'Graphical Abstract');
      });
    });

    // Newer Wiley templates can place the GA image next to a "Graphical Abstract" heading without
    // a figure/caption wrapper. Bind only to the nearest small local section and require one unique image.
    var headings = Array.from(scope.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],strong,b')).filter(function(node) {
      if (excludedNode(node)) return false;
      var text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      return /^(?:graphical|visual)\s+abstract\b|^first\s+page\s+image\b/i.test(text);
    });

    headings.forEach(function(heading) {
      var block = heading.parentElement, chosen = null;
      for (var depth = 0; block && depth < 5; depth += 1, block = block.parentElement) {
        if (excludedNode(block)) break;
        var images = Array.from(block.querySelectorAll('img,object[type^="image"]')).filter(function(node) { return !excludedNode(node); });
        var text = String(block.textContent || '').replace(/\s+/g, ' ').trim();
        if (images.length >= 1 && images.length <= 3 && text.length <= 7000) {
          chosen = block;
          if (images.length === 1) break;
        }
      }
      if (!chosen) return;
      var nodes = Array.from(chosen.querySelectorAll('img,object[type^="image"]')).filter(function(node) { return !excludedNode(node); });
      var candidates = [];
      nodes.forEach(function(node) {
        visualUrls(node, chosen, base).forEach(function(url) {
          if (officialWileyAsset(url) && !reject('Graphical Abstract', url)) candidates.push({node:node,url:url});
        });
      });
      var unique = new Map();
      candidates.forEach(function(row) { if (!unique.has(row.url)) unique.set(row.url, row); });
      var values = Array.from(unique.values());
      var strong = values.filter(function(row) { return /-gra-\d+/i.test(row.url); });
      if (strong.length) values = strong;
      if (values.length !== 1) return;
      add(values[0].node, values[0].url, 850, 'wiley_ga_heading_bound', String(heading.textContent || 'Graphical Abstract'));
    });

    rows.sort(function(a,b){return b.score-a.score;});
    if (rows.length) pushTrace(trace, {
      stage: 'wiley_ga_discovery',
      event: 'strong_bound_candidate',
      status: 'found',
      url: rows[0].url,
      message: 'candidates=' + String(rows.length) + ';source=' + rows[0].source
    });
    return rows;
  }

  function collectCandidates(job, trace, root, baseUrl, sourceName, quiet) {
    var scope = root || document, rows = [], seen = new Set();
    function add(row) { if (!seen.has(row.url) && candidateBelongsToJob(row.url,job) && !reject(row.text,row.url)) { seen.add(row.url); rows.push(row); } }
    scope.querySelectorAll('img,object[type^="image"]').forEach(function(node) {
      var context=visualScope(node);
      if (!context) return;
      var kind=context.official?'official':context.label==='Figure 1' && job.allowFigureOne!==false?'figure1':'';
      if (!kind) return;
      visualUrls(node,context.block,baseUrl||location.href).forEach(function(url,rank) {
        add({url:url,kind:kind,assetType:kind==='official'?'graphical_abstract':'figure1_fallback',score:(kind==='official'?600:150)-rank,text:context.caption,source:'isolated_visual_caption',element:node.tagName.toLowerCase()==='img'?node:null});
      });
    });
    scope.querySelectorAll('head meta[name="citation_graphical_abstract"],head meta[name="citation_visual_abstract"],head meta[name="citation_toc_graphic"],head meta[name="citation_abstract_image"]').forEach(function(meta) {
      var url=normalizeUrl(meta.getAttribute('content'),baseUrl||location.href);
      if (url) add({url:url,kind:'official',assetType:'graphical_abstract',score:700,text:meta.getAttribute('name'),source:'article_head_metadata',element:null});
    });
    if (job.publisher === 'wiley') {
      wileyGraphicalAbstractCandidates(job, trace, scope, baseUrl||location.href, sourceName).forEach(add);
    }
    // No whole-page semantic windows: adjacent Scheme images must not inherit a TOC heading.
    rows.sort(function(a,b){return b.score-a.score;});
    if (!quiet) pushTrace(trace,{stage:'candidate_discovery',event:'scan_complete',status:rows.length?'found':'none',message:'strict_scope_candidates='+rows.length});
    return rows;
  }

  function waitForDomMutation(timeoutMs) {
    return new Promise(function (resolve) {
      if (!document.body || typeof MutationObserver === 'undefined') {
        setTimeout(resolve, timeoutMs);
        return;
      }
      var done = false;
      var observer = new MutationObserver(function (mutations) {
        if (done) return;
        var useful = mutations.some(function (mutation) {
          return mutation.addedNodes.length > 0
            || (mutation.type === 'attributes' && /^(?:src|srcset|data-src|data-lazy-src|data-hi-res-src|data-srcset)$/i.test(String(mutation.attributeName || '')));
        });
        if (!useful) return;
        done = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src','srcset','data-src','data-lazy-src','data-hi-res-src','data-srcset']
      });
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        observer.disconnect();
        resolve();
      }, timeoutMs);
    });
  }

  function iframeSourceUrls(job) {
    var doi = normalizeDoi(job && job.doi);
    var publisher = String(job && job.publisher || publisherForDoi(doi));
    var urls = [];
    function add(value) {
      if (value && urls.indexOf(value) < 0) urls.push(value);
    }
    if (publisher === 'acs' && location.hostname.endsWith('pubs.acs.org')) {
      add(location.origin + '/doi/' + doi);
      add(location.origin + '/doi/abs/' + doi);
      add(location.origin + '/doi/full/' + doi);
      add(location.origin + '/action/doSearch?AllField=' + encodeURIComponent(doi));
    } else if (publisher === 'wiley' && location.hostname.endsWith('onlinelibrary.wiley.com')) {
      add(location.origin + '/doi/' + doi);
      add(location.origin + '/doi/full/' + doi);
      add(location.origin + '/doi/abs/' + doi);
    } else if (publisher === 'science' && location.hostname.endsWith('science.org')) {
      add(location.origin + '/doi/full/' + doi);
      add(location.origin + '/doi/' + doi);
    }
    return urls;
  }

  async function iframeCandidates(job, trace) {
    var urls = iframeSourceUrls(job);
    if (!urls.length) return [];
    var best = [];
    for (var u = 0; u < urls.length; u += 1) {
      var url = urls[u];
      pushTrace(trace, { stage: 'iframe_dom_scan', event: 'load_start', status: 'start', url: url });
      try {
        var rows = await new Promise(function (resolve) {
          var frame = document.createElement('iframe');
          var started = Date.now();
          var finished = false;
          var scrolled = false;
          var bestRows = [];
          frame.setAttribute('aria-hidden', 'true');
          frame.setAttribute('tabindex', '-1');
          frame.style.cssText = 'position:fixed!important;left:-12000px!important;top:0!important;width:1280px!important;height:900px!important;opacity:.001!important;pointer-events:none!important;border:0!important;z-index:-2147483647!important';

          function cleanup() {
            clearInterval(poll);
            clearTimeout(timeout);
            try { frame.remove(); } catch (_) {}
          }
          function finish(value) {
            if (finished) return;
            finished = true;
            cleanup();
            resolve(value || bestRows);
          }
          function inspect() {
            if (finished) return;
            try {
              var doc = frame.contentDocument;
              var win = frame.contentWindow;
              if (!doc || !doc.body) return;
              var current = String(frame.src || url);
              if (job.publisher === 'acs') {
                var doiNeedle = normalizeDoi(job.doi);
                var suffixNeedle = doiNeedle.split('/').pop() || doiNeedle;
                Array.prototype.slice.call(doc.querySelectorAll('a[href]')).forEach(function (anchor) {
                  var href = normalizeUrl(anchor.getAttribute('href') || '', current);
                  if (!href || urls.indexOf(href) >= 0) return;
                  var low = href.toLowerCase();
                  if ((low.indexOf('/article/doi/') >= 0 || low.indexOf('/doi/') >= 0) &&
                      (low.indexOf(doiNeedle) >= 0 || low.indexOf(suffixNeedle) >= 0)) {
                    urls.push(href);
                    pushTrace(trace, {
                      stage: 'acs_route_discovery',
                      event: 'article_url',
                      status: 'found',
                      url: href,
                      message: 'discovered from authenticated ACS iframe/search DOM'
                    });
                  }
                });
              }
              var discovered = collectCandidates(job, trace, doc, current, 'iframe_dom', true);
              if (discovered.length) {
                var merged = new Map();
                bestRows.concat(discovered).forEach(function (row) {
                  var old = merged.get(row.url);
                  if (!old || row.score > old.score) merged.set(row.url, row);
                });
                bestRows = Array.from(merged.values()).sort(function (a, b) {
                  if (a.kind !== b.kind) return a.kind === 'official' ? -1 : 1;
                  return b.score - a.score;
                });
              }
              if (bestRows.some(function (row) { return row.kind === 'official'; })) return finish(bestRows);
              var elapsed = Date.now() - started;
              if (!scrolled && elapsed > 3000 && win) {
                scrolled = true;
                try { win.scrollTo({ top: Math.min(doc.body.scrollHeight, 2400), behavior: 'auto' }); }
                catch (_) { try { win.scrollTo(0, 2400); } catch (_) {} }
              }
              if (bestRows.length && elapsed > 6000) return finish(bestRows);
            } catch (error) {
              pushTrace(trace, {
                stage: 'iframe_dom_scan',
                event: 'inspect_failed',
                status: 'failed',
                url: url,
                message: String(error && error.name || '') + ':' + String(error && error.message || error)
              });
              if (String(error && error.name || '').toLowerCase().indexOf('security') >= 0) finish(bestRows);
            }
          }

          frame.addEventListener('load', function () {
            setTimeout(inspect, 250);
            setTimeout(inspect, 1000);
            setTimeout(inspect, 2600);
          });
          frame.addEventListener('error', function () {
            pushTrace(trace, { stage: 'iframe_dom_scan', event: 'load_error', status: 'failed', url: url });
            finish(bestRows);
          });
          var poll = setInterval(inspect, 650);
          var timeout = setTimeout(function () { finish(bestRows); }, 15000);
          document.body.appendChild(frame);
          frame.src = url;
        });
        if (rows.length) {
          best = rows;
          pushTrace(trace, {
            stage: 'iframe_dom_scan',
            event: 'complete',
            status: 'found',
            url: url,
            message: 'candidates=' + String(rows.length)
          });
          if (rows.some(function (row) { return row.kind === 'official'; })) return rows;
        } else {
          pushTrace(trace, { stage: 'iframe_dom_scan', event: 'complete', status: 'none', url: url });
        }
      } catch (error) {
        pushTrace(trace, {
          stage: 'iframe_dom_scan',
          event: 'failed',
          status: 'failed',
          url: url,
          message: String(error && error.message || error)
        });
      }
    }
    return best;
  }

  function pageState(job, trace) {
    var text = String(document.body && document.body.innerText || '').slice(0, 120000);
    var title = String(document.title || '');
    var href = location.href;
    var challenge = /captcha|verify you are human|security check|access denied|challenge-platform|just a moment|unusual traffic|checking your browser/i.test(title + '\n' + text);
    var auth = /(?:login|signin|sign-in|shibboleth|saml|openathens|wayf|\/idp\/)/i.test(href)
      || /select (?:your )?institution|sign in via (?:your )?institution|log in via (?:your )?institution|access through (?:your )?institution|institutional login/i.test(title + '\n' + text);
    var citation = String((document.querySelector('meta[name="citation_doi"]') || {}).content || '').toLowerCase();
    var canonical = String((document.querySelector('link[rel="canonical"]') || {}).href || '').toLowerCase();
    var doi = normalizeDoi(job.doi);
    var suffix = doi.split('/').pop() || doi;
    var doiMatch = citation.indexOf(doi) >= 0 || canonical.indexOf(doi) >= 0 || href.toLowerCase().indexOf(suffix.toLowerCase()) >= 0;
    var shell = job.publisher === 'acs' && doiMatch && !challenge && !auth && text.length > 0 && text.length < 500;
    pushTrace(trace, {
      stage: 'page',
      event: 'state',
      status: challenge ? 'challenge' : auth ? 'auth' : shell ? 'shell' : 'loaded',
      url: href,
      message: 'doiMatch=' + String(doiMatch) + ';textLength=' + String(text.length)
    });
    return { challenge: challenge, auth: auth, shell: shell, doiMatch: doiMatch, textLength: text.length };
  }


  function evidenceCaptureEligible(job) {
    var need = String(job && job.mediaNeed || '');
    return need.indexOf('figures') >= 0 || need === 'evidence';
  }

  function evidenceNormalizeText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function evidenceExcludedHeading(value) {
    return /^(?:references?|bibliography|acknowledg(?:e)?ments?|author information|associated content|supplementary information|supporting information|funding|conflicts? of interest|data availability)\b/i.test(evidenceNormalizeText(value, 500));
  }

  function evidenceNodeExcluded(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.closest && node.closest('nav,aside,footer,form,[role="navigation"],[aria-hidden="true"]')) return true;
    var signature = String((node.id || '') + ' ' + (node.className || '')).toLowerCase();
    return /\b(?:references?|bibliography|related|recommended|author-info|author_information|metrics|citation|social|share|advert|cookie)\b/.test(signature);
  }

  function evidenceCleanContainer(container) {
    if (!container || !container.querySelectorAll) return container;
    container.querySelectorAll('script,style,noscript,nav,aside,footer,form,[role="navigation"],[aria-hidden="true"]').forEach(function(node){node.remove();});
    container.querySelectorAll('[id],[class]').forEach(function(node){
      if (evidenceNodeExcluded(node)) node.remove();
    });
    return container;
  }

  function evidenceNodeText(node, max) {
    if (!node) return '';
    var clone = node.cloneNode(true);
    evidenceCleanContainer(clone);
    return evidenceNormalizeText(clone.textContent || '', max || 180000);
  }

  function evidenceSectionType(heading) {
    var text = evidenceNormalizeText(heading, 300).toLowerCase();
    if (/\babstract\b/.test(text)) return 'abstract';
    if (/\bintroduction\b|\bbackground\b/.test(text)) return 'introduction';
    if (/\boptim(?:i[sz]ation|ized conditions?)\b|\bscreening\b/.test(text)) return 'optimization';
    if (/\bsubstrate scope\b|\breaction scope\b|\bscope and limitations?\b/.test(text)) return 'scope';
    if (/\bmechanis(?:m|tic)\b|\bcontrol experiments?\b|\bmechanistic studies\b/.test(text)) return 'mechanism';
    if (/\bconclusions?\b|\bsummary and outlook\b/.test(text)) return 'conclusion';
    if (/\bexperimental\b|\bmethods?\b|\bgeneral procedure\b/.test(text)) return 'experimental';
    if (/\bresults?\b|\bdiscussion\b/.test(text)) return 'results';
    return 'other';
  }

  function evidenceArticleRoot() {
    var selectors = [
      '.article__body',
      '.article-body',
      '.article_content',
      '.article__content',
      '.article-content',
      '.bodymatter',
      '.c-article-body',
      '#articleBody',
      '#pnlArticleContent',
      '.Body',
      '#body',
      'article',
      'main article',
      '[role="main"]',
      'main'
    ];
    var seen = new Set(), best = null, bestScore = 0;
    selectors.forEach(function(selector){
      document.querySelectorAll(selector).forEach(function(node){
        if (seen.has(node) || evidenceNodeExcluded(node)) return;
        seen.add(node);
        var length = evidenceNodeText(node, 240000).length;
        var signature = String((node.id || '') + ' ' + (node.className || '')).toLowerCase();
        var bonus = node.tagName === 'ARTICLE' ? 50000 : /article.?body|c-article-body|pnlarticlecontent/.test(signature) ? 40000 : 0;
        var score = length + bonus;
        if (length >= 1000 && score > bestScore) { best = node; bestScore = score; }
      });
    });
    return best;
  }

  function evidenceRangeText(root, heading, nextHeading) {
    try {
      var range = document.createRange();
      range.setStartAfter(heading);
      if (nextHeading) range.setEndBefore(nextHeading);
      else if (root && root.lastChild) range.setEndAfter(root.lastChild);
      else return '';
      var holder = document.createElement('div');
      holder.appendChild(range.cloneContents());
      evidenceCleanContainer(holder);
      return evidenceNormalizeText(holder.textContent || '', 180000);
    } catch (_) {
      return '';
    }
  }

  function evidenceAbstractSection(root) {
    var scope=root&&root.querySelectorAll?root:document;
    var nodes = Array.from(scope.querySelectorAll('#abstract,.abstract,.article__abstract,[class*="abstract"]'));
    var best = null, bestText = '';
    nodes.forEach(function(node){
      if (evidenceNodeExcluded(node)) return;
      var signature = evidenceNormalizeText((node.id || '') + ' ' + (node.className || '')).toLowerCase();
      if (/graphical|visual/.test(signature)) return;
      var text = evidenceNodeText(node).replace(/^abstract\s*/i, '').trim();
      if (text.length > bestText.length) { best = node; bestText = text; }
    });
    if(best&&bestText.length>=40)return {type:'abstract',heading:'Abstract',text:bestText,order:0};
    var meta=document.querySelector('meta[name="citation_abstract"],meta[name="dc.description"],meta[property="og:description"],meta[name="description"]');
    var metaText=evidenceNormalizeText(meta&&meta.getAttribute('content')||'').replace(/^abstract\s*/i,'').trim();
    return metaText.length>=40?{type:'abstract',heading:'Abstract',text:metaText,order:0}:null;
  }

  function evidenceFallbackBodySections(root, seenText) {
    var paragraphs = Array.from(root.querySelectorAll('p')).filter(function(node){
      if (evidenceNodeExcluded(node) || node.closest('figure,table')) return false;
      var parentSection = node.closest('section');
      var heading = parentSection && parentSection.querySelector('h2,h3,h4');
      return !(heading && evidenceExcludedHeading(heading.textContent || ''));
    });
    var chunks = [], current = '';
    paragraphs.forEach(function(node){
      var text = evidenceNodeText(node, 12000);
      if (text.length < 50) return;
      if (current && current.length + text.length > 12000) { chunks.push(current); current = ''; }
      current += (current ? '\n\n' : '') + text;
    });
    if (current) chunks.push(current);
    return chunks.slice(0, 6).filter(function(text){
      var key = text.slice(0, 500);
      if (text.length < 300 || seenText.has(key)) return false;
      seenText.add(key);
      return true;
    }).map(function(text,index){return {type:'other',heading:'Article body '+String(index+1),text:text,order:900+index};});
  }

  function collectArticleEvidenceSections(root) {
    var sections = [], seenText = new Set();
    var abstract = evidenceAbstractSection(root);
    if (abstract) { sections.push(abstract); seenText.add(abstract.text.slice(0,500)); }

    var headings = Array.from(root.querySelectorAll('h2,h3,h4')).filter(function(node){
      return !evidenceNodeExcluded(node) && !node.closest('figure,table,nav,aside,footer');
    });
    headings.forEach(function(heading,index){
      var title = evidenceNormalizeText(heading.textContent || '', 500);
      if (!title || evidenceExcludedHeading(title)) return;
      var text = evidenceRangeText(root, heading, headings[index+1] || null);
      var key = text.slice(0, 500);
      if (text.length < 100 || seenText.has(key)) return;
      seenText.add(key);
      sections.push({type:evidenceSectionType(title),heading:title,text:text,order:100+index});
    });

    if (sections.length < 2) {
      evidenceFallbackBodySections(root, seenText).forEach(function(row){sections.push(row);});
    }
    sections.sort(function(a,b){return Number(a.order||0)-Number(b.order||0);});
    return sections;
  }

  function collectArticleEvidenceCaptions(root) {
    var nodes = Array.from(new Set(Array.from(root.querySelectorAll('figure figcaption,figure [class*="caption"],.figure [class*="caption"]'))));
    var seen = new Set(), rows = [];
    nodes.forEach(function(node){
      if (evidenceNodeExcluded(node)) return;
      var text = evidenceNodeText(node, 12000);
      if (text.length < 20 || seen.has(text)) return;
      seen.add(text);
      var match = text.match(/^(Scheme|Figure|Fig\.?|Equation|Graphical Abstract|Visual Abstract)\s*[A-Za-z0-9().-]*/i);
      var label = match ? match[0] : '';
      var type = /^scheme/i.test(label) ? 'scheme' : /abstract/i.test(label) ? 'graphical_abstract' : /^equation/i.test(label) ? 'equation' : 'figure';
      rows.push({label:label,type:type,text:text});
    });
    return rows;
  }

  function collectArticleEvidenceTables(root) {
    var rows = [];
    Array.from(root.querySelectorAll('table')).forEach(function(table,index){
      if (evidenceNodeExcluded(table)) return;
      var text = evidenceNodeText(table, 30000);
      if (text.length < 40) return;
      var caption = table.querySelector('caption');
      rows.push({label:'Table '+String(index+1),title:evidenceNormalizeText(caption && caption.textContent || '',500),text:text});
    });
    return rows;
  }

  function evidenceArticleUrl() {
    try {
      var url = new URL(location.href);
      url.hash = '';
      return url.toString();
    } catch (_) {
      return String(location.href || '').split('#')[0];
    }
  }

  function buildArticleEvidencePacket(job, trace) {
    var pageDoi = assertBoundCaptureJob(job);
    var state = pageState(job, trace || []);
    if (state.challenge || state.auth || !state.doiMatch) {
      return {fulltextStatus:'invalid',reason:state.challenge?'challenge_page':state.auth?'auth_page':'page_doi_unverified'};
    }
    var root = evidenceArticleRoot();
    var sections = root ? collectArticleEvidenceSections(root) : [];
    var globalAbstract=evidenceAbstractSection(document);
    if(globalAbstract && !sections.some(function(row){return row.type==='abstract';}))sections.unshift(globalAbstract);
    var captions = root ? collectArticleEvidenceCaptions(root) : [];
    var tables = root ? collectArticleEvidenceTables(root) : [];
    if(!sections.length && !captions.length && !tables.length) {
      return {fulltextStatus:'empty',reason:state.shell?'publisher_shell':root?'evidence_empty':'article_root_not_found',chars:0,sections:0,captions:0,tables:0};
    }
    var chars = sections.reduce(function(total,row){return total+String(row.text||'').length;},0)
      + captions.reduce(function(total,row){return total+String(row.text||'').length;},0)
      + tables.reduce(function(total,row){return total+String(row.text||'').length;},0);
    var nonAbstract=sections.filter(function(row){return row.type!=='abstract';});
    var substantive=sections.filter(function(row){return ['results','scope','mechanism','conclusion','experimental','optimization'].indexOf(row.type)>=0;});
    var fulltextStatus='partial';
    if(sections.length===1 && sections[0].type==='abstract' && !captions.length && !tables.length)fulltextStatus='abstract_only';
    else if(!nonAbstract.length && sections.some(function(row){return row.type==='abstract';}))fulltextStatus='abstract_only';
    else {
      var types=new Set(substantive.map(function(row){return row.type;}));
      var hasCore=types.has('results')||types.has('scope')||types.has('experimental');
      var hasClose=types.has('conclusion')||types.has('mechanism')||types.has('optimization');
      fulltextStatus=hasCore&&hasClose?'complete':'partial';
    }
    var articleUrl = evidenceArticleUrl();
    return {
      schemaVersion:EVIDENCE_SCHEMA_VERSION,
      doi:pageDoi,
      pageDoi:pageDoi,
      title:evidenceNormalizeText(job.title || (document.querySelector('h1')||{}).textContent || document.title || ''),
      journal:evidenceNormalizeText(job.journal || ''),
      publisher:job.publisher || publisherForDoi(pageDoi),
      articleUrl:articleUrl,
      sourceUrl:articleUrl,
      captureVersion:VERSION,
      controllerRevision:CONTROLLER_REVISION,
      jobId:job.jobId,
      queueGeneratedAt:job.queueGeneratedAt || '',
      capturedAt:nowIso(),
      fulltextStatus:fulltextStatus,
      textProcessingPolicy:'unknown',
      sections:sections,
      captions:captions,
      tables:tables,
      _metrics:{chars:chars,sections:sections.length,captions:captions.length,tables:tables.length}
    };
  }

  async function postArticleEvidence(payload, token, timeoutMs) {
    var outbound = Object.assign({},payload);
    delete outbound._metrics;
    var response = await gmRequest({
      method:'POST',
      url:EVIDENCE_ENDPOINT,
      timeout:Math.max(1000,Math.min(15000,Number(timeoutMs||4000))),
      headers:{'content-type':'application/json',authorization:'Bearer '+token},
      data:JSON.stringify(outbound)
    });
    var raw = String(response.responseText || ''), body = {};
    try { body = JSON.parse(raw || '{}'); } catch (_) {}
    var status = Number(response.status || 0);
    if (status < 200 || status >= 300) throw uploadResponseError(status,body,raw,function(h){return headerValue(response.responseHeaders,h);},'gm_evidence');
    return body;
  }

  async function tryCaptureArticleEvidence(job, trace, token, waitMs) {
    if (!evidenceCaptureEligible(job)) return {status:'not_requested'};
    try {
      var deadline=Date.now()+Math.max(0,Math.min(10000,Number(waitMs||0)));
      var packet=buildArticleEvidencePacket(job,trace);
      while((packet.fulltextStatus==='empty') && Date.now()<deadline) {
        await sleep(800);
        packet=buildArticleEvidencePacket(job,trace);
      }
      if (packet.fulltextStatus === 'invalid' || packet.fulltextStatus === 'empty') {
        pushTrace(trace,{stage:'evidence_capture',event:'skip',status:packet.fulltextStatus,url:location.href,message:String(packet.reason||'evidence_unavailable')});
        return {status:packet.fulltextStatus==='invalid'?'invalid':'empty',reason:String(packet.reason||'evidence_unavailable'),chars:Number(packet.chars||0),sections:Number(packet.sections||0)};
      }
      captureLiveUpdate(job,'uploading',{label:packet.fulltextStatus==='abstract_only'?'Abstract':'全文证据'});
      var uploadTimeout=String(job.mediaNeed||'')==='evidence'?10000:4000;
      var receipt = await postArticleEvidence(packet,token,uploadTimeout);
      if (!receipt || receipt.stored !== true || receipt.doi !== normalizeDoi(job.doi) || receipt.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
        throw new Error('evidence_receipt_invalid');
      }
      var level=String(receipt.evidenceLevel||packet.fulltextStatus||'partial');
      pushTrace(trace,{stage:'evidence_capture',event:'stored',status:'success',url:location.href,message:'level='+level+';chars='+String(receipt.chars||packet._metrics.chars)+';sections='+String(receipt.sections||packet._metrics.sections)});
      return {status:'stored',evidenceLevel:level,chars:Number(receipt.chars||packet._metrics.chars),sections:Number(receipt.sections||packet._metrics.sections),sourceHash:String(receipt.sourceHash||''),evidencePacketHash:String(receipt.evidencePacketHash||'')};
    } catch (error) {
      pushTrace(trace,{stage:'evidence_capture',event:'failed',status:'failed',url:location.href,httpStatus:Number(error&&error.httpStatus||0),message:String(error&&error.message||error).slice(0,240)});
      return {status:'failed',reason:String(error&&error.message||error).slice(0,240)};
    }
  }

  function mergeFallbackCandidates(existing, rows) {
    var map = new Map();
    (existing || []).concat(rows || []).forEach(function (row) {
      if (!row || row.kind !== 'figure1' || !row.url) return;
      var old = map.get(row.url);
      if (!old || Number(row.score || 0) > Number(old.score || 0)) map.set(row.url, row);
    });
    return Array.from(map.values()).sort(function (a, b) { return Number(b.score || 0) - Number(a.score || 0); });
  }

  async function waitForCandidates(job, trace) {
    var maxMs = job.publisher === 'wiley' ? 8 * 60 * 1000 : 90 * 1000;
    var started = Date.now();
    var lastWait = 0;
    var iframeAttempted = false;
    var mainScrollStep = 0;
    var fallbackRows = [];

    function acceptRows(rows, sourceLabel) {
      rows = Array.isArray(rows) ? rows : [];
      var official = rows.filter(function (row) { return row.kind === 'official'; });
      fallbackRows = mergeFallbackCandidates(fallbackRows, rows);
      if (official.length) return official;
      if (rows.some(function (row) { return row.kind === 'figure1'; })) {
        pushTrace(trace, {
          stage: 'fallback_buffer',
          event: 'figure1_deferred',
          status: 'waiting_for_official',
          message: String(sourceLabel || '') + ';buffered=' + String(fallbackRows.length)
        });
      }
      return [];
    }

    while (Date.now() - started < maxMs) {
      if (isAbortRequested()) throw new Error('user_aborted');
      var state = pageState(job, trace);
      if (state.challenge || state.auth) {
        if (Date.now() - lastWait > 10000) {
          lastWait = Date.now();
          GM_setValue(progressKey(job.doi), {
            status: state.challenge ? 'challenge_wait' : 'auth_wait',
            at: nowIso(),
            url: location.href
          });
        }
        await waitForDomMutation(2500);
        continue;
      }
      if (!state.doiMatch && Date.now() - started > 8000 && state.textLength > 1000) {
        pushTrace(trace, {
          stage: 'page',
          event: 'doi_guard',
          status: 'mismatch',
          url: location.href,
          message: 'refusing capture because loaded page does not match active DOI'
        });
        throw new Error('doi_page_mismatch');
      }

      var candidates = collectCandidates(job, trace, document, location.href, 'live_dom', false);
      var accepted = acceptRows(candidates, 'live_dom');
      if (accepted.length) return accepted;

      var elapsed = Date.now() - started;
      if (job.publisher === 'acs' && mainScrollStep < 3 && elapsed > [2500, 6000, 10500][mainScrollStep]) {
        var targets = [1200, 3000, 6000];
        var target = Math.min(Number(document.body && document.body.scrollHeight || targets[mainScrollStep]), targets[mainScrollStep]);
        mainScrollStep += 1;
        try { window.scrollTo({ top: target, behavior: 'auto' }); }
        catch (_) { try { window.scrollTo(0, target); } catch (_) {} }
        pushTrace(trace, {
          stage: 'lazy_load_trigger',
          event: 'scroll',
          status: 'ok',
          url: location.href,
          message: 'acs_main_scroll_top=' + String(target) + ';step=' + String(mainScrollStep)
        });
        await waitForDomMutation(900);
        candidates = collectCandidates(job, trace, document, location.href, 'live_dom_after_scroll', false);
        accepted = acceptRows(candidates, 'live_dom_after_scroll');
        if (accepted.length) return accepted;
      }

      var iframeThreshold = state.shell && job.publisher === 'acs' ? 2500 : 7000;
      if (!iframeAttempted && elapsed > iframeThreshold && (job.publisher === 'acs' || job.publisher === 'wiley' || job.publisher === 'science')) {
        iframeAttempted = true;
        if (isAbortRequested()) throw new Error('user_aborted');
        var iframeRows = await iframeCandidates(job, trace);
        iframeRows.slice(0, 10).forEach(function (row) {
          pushTrace(trace, {
            stage: 'candidate_discovery',
            event: 'candidate',
            status: row.kind,
            url: row.url,
            message: row.assetType,
            candidateKind: row.kind,
            candidateSource: row.source,
            candidateScore: row.score,
            imageWidth: row.width,
            imageHeight: row.height
          });
        });
        accepted = acceptRows(iframeRows, 'iframe_dom');
        if (accepted.length) return accepted;
      }

      if (elapsed > 22000 && (state.textLength > 2000 || iframeAttempted)) {
        if (fallbackRows.length) {
          pushTrace(trace, {
            stage: 'fallback_buffer',
            event: 'figure1_release',
            status: 'fallback',
            message: 'official TOC search exhausted; releasing Figure 1 fallback'
          });
          return fallbackRows;
        }
        return [];
      }
      await waitForDomMutation(1500);
    }

    if (fallbackRows.length) {
      pushTrace(trace, {
        stage: 'fallback_buffer',
        event: 'figure1_release',
        status: 'fallback',
        message: 'publisher wait timeout reached; releasing Figure 1 fallback'
      });
      return fallbackRows;
    }
    throw new Error('page_wait_timeout');
  }

  async function pageFetchCandidate(candidate, trace) {
    var requestUrl = candidateRequestUrl(candidate);
    pushTrace(trace, {
      stage: 'page_fetch',
      event: 'request_start',
      status: 'start',
      url: requestUrl,
      candidateKind: candidate.kind,
      candidateSource: candidate.source,
      candidateScore: candidate.score
    });
    var requestStarted=Date.now();
    try {
      var response = await fetch(requestUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'force-cache',
        signal: AbortSignal.timeout(12000),
        redirect: 'follow',
        referrer: location.href
      });
      var contentType = String(response.headers.get('content-type') || '');
      pushTrace(trace, {
        stage: 'page_fetch',
        event: 'response',
        status: response.ok ? 'ok' : 'http_error',
        httpStatus: response.status,
        contentType: contentType,
        url: response.url || requestUrl,
        message:'durationMs='+(Date.now()-requestStarted)+';retryAfter='+String(response.headers.get('retry-after')||'').slice(0,80)
      });
      if (!response.ok) throw new Error('page_fetch_http_' + response.status);
      var buffer = await response.arrayBuffer();
      contentType = sniffContentType(buffer, contentType);
      if (!/^image\//.test(contentType)) throw new Error('page_fetch_not_image:' + contentType);
      if (buffer.byteLength < 100 || buffer.byteLength > 4000000) throw new Error('page_fetch_size:' + buffer.byteLength);
      return {
        imageData: 'data:' + contentType + ';base64,' + toBase64(buffer),
        contentType: contentType,
        byteLength: buffer.byteLength,
        sourceUrl: response.url || requestUrl,
        method: 'page_fetch'
      };
    } catch (error) {
      pushTrace(trace, {
        stage: 'page_fetch',
        event: 'failed',
        status: 'failed',
        httpStatus:Number(response&&response.status||0),
        url: response&&response.url || requestUrl,
        message: String(error&&error.name||'Error')+':'+String(error && error.message || error)+';durationMs='+(Date.now()-requestStarted)
      });
      return null;
    }
  }

  async function gmFetchCandidate(candidate, trace) {
    var requestUrl = candidateRequestUrl(candidate);
    pushTrace(trace, {
      stage: 'gm_fetch',
      event: 'request_start',
      status: 'start',
      url: requestUrl,
      candidateKind: candidate.kind,
      candidateSource: candidate.source,
      candidateScore: candidate.score
    });
    var requestStarted=Date.now();
    try {
      var response = await gmRequest({
        method: 'GET',
        url: requestUrl,
        responseType: 'arraybuffer',
        timeout: 12000,
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          Referer: location.href
        }
      });
      var status = Number(response.status || 0);
      var buffer = response.response;
      var contentType = sniffContentType(buffer, headerValue(response.responseHeaders, 'content-type'));
      var bytes = buffer && buffer.byteLength || 0;
      pushTrace(trace, {
        stage: 'gm_fetch',
        event: 'response',
        status: status >= 200 && status < 300 ? 'ok' : 'http_error',
        httpStatus: status,
        contentType: contentType,
        url: response.finalUrl || requestUrl,
        message:'durationMs='+(Date.now()-requestStarted)+';retryAfter='+headerValue(response.responseHeaders,'retry-after').slice(0,80),
        byteLength: bytes
      });
      if (status < 200 || status >= 300) {
        var httpError = new Error('gm_fetch_http_' + status);
        httpError.httpStatus = status;
        throw httpError;
      }
      if (!/^image\//.test(contentType)) throw new Error('gm_fetch_not_image:' + contentType);
      if (bytes < 100 || bytes > 4000000) throw new Error('gm_fetch_size:' + bytes);
      return {
        imageData: 'data:' + contentType + ';base64,' + toBase64(buffer),
        contentType: contentType,
        byteLength: bytes,
        sourceUrl: response.finalUrl || requestUrl,
        method: 'gm_fetch'
      };
    } catch (error) {
      pushTrace(trace, {
        stage: 'gm_fetch',
        event: 'failed',
        status: 'failed',
        httpStatus: Number(error && error.httpStatus || 0),
        url: requestUrl,
        message: String(error && error.message || error)
      });
      return null;
    }
  }

  async function canvasCandidate(candidate, trace) {
    var image = candidate.element;
    if (image && normalizeUrl(image.currentSrc || image.src, location.href) !== candidate.url) return null;
    if (!image || !image.complete || image.naturalWidth < 1) {
      pushTrace(trace, {
        stage: 'rendered_canvas',
        event: 'unavailable',
        status: 'unavailable',
        url: candidate.url,
        message: image ? 'element_not_loaded' : 'no_live_image_element'
      });
      return null;
    }
    try {
      var canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      var data = canvas.toDataURL('image/png');
      if (data.length < 200) throw new Error('canvas_empty');
      pushTrace(trace, {
        stage: 'rendered_canvas',
        event: 'complete',
        status: 'ok',
        url: candidate.url,
        contentType: 'image/png',
        imageWidth: canvas.width,
        imageHeight: canvas.height,
        byteLength: Math.floor(data.length * 0.75)
      });
      return {
        imageData: data,
        contentType: 'image/png',
        byteLength: Math.floor(data.length * 0.75),
        sourceUrl: normalizeUrl(image.currentSrc || image.src, location.href),
        method: 'rendered_canvas'
      };
    } catch (error) {
      pushTrace(trace, {
        stage: 'rendered_canvas',
        event: 'failed',
        status: 'failed',
        url: candidate.url,
        message: String(error && error.name || '') + ':' + String(error && error.message || error)
      });
      return null;
    }
  }

  function measureImageData(imageData) {
    return new Promise(function (resolve) {
      try {
        var probe = new Image();
        var done = false;
        var finish = function (width, height) {
          if (done) return;
          done = true;
          resolve({ width: Number(width || 0), height: Number(height || 0) });
        };
        probe.onload = function () { finish(probe.naturalWidth, probe.naturalHeight); };
        probe.onerror = function () { finish(0, 0); };
        probe.src = imageData;
        setTimeout(function () { finish(0, 0); }, 5000);
      } catch (_) {
        resolve({ width: 0, height: 0 });
      }
    });
  }

  async function acquireImage(candidate, trace) {
    var image = await pageFetchCandidate(candidate, trace);
    if (image && image.contentType === 'image/tiff') {
      pushTrace(trace,{stage:'candidate_format',event:'unsupported_tiff',status:'unsupported',url:image.sourceUrl||candidate.url,contentType:'image/tiff',byteLength:image.byteLength,message:'browser/Worker protocol does not accept TIFF; try another variant from the same labelled figure'});
      image = null;
      // Do not download the identical TIFF again through GM; move directly to a page-rendered fallback.
      image = await canvasCandidate(candidate, trace);
    } else if (!image) {
      image = await gmFetchCandidate(candidate, trace);
      if (image && image.contentType === 'image/tiff') {
        pushTrace(trace,{stage:'candidate_format',event:'unsupported_tiff',status:'unsupported',url:image.sourceUrl||candidate.url,contentType:'image/tiff',byteLength:image.byteLength,message:'browser/Worker protocol does not accept TIFF; try another variant from the same labelled figure'});
        image = null;
      }
      if (!image) image = await canvasCandidate(candidate, trace);
    }
    if (!image) return null;
    var measured = await measureImageData(image.imageData);
    image.width = Number(measured.width || 0);
    image.height = Number(measured.height || 0);
    return image;
  }

  async function uploadArticleFigure(job, candidate, image, trace, token, order) {
    // recovery_direct_stage_v1: /import is deliberately locked during recovery.
    // Store once in R2; a positive staging receipt is not publication completion.
    var pageDoi = assertBoundCaptureJob(job, candidate.url);
    captureLiveUpdate(job,'uploading',{label:candidate.label});
    var payload = {
      doi: job.doi,
      jobId: job.jobId,
      captureVersion: VERSION,
      pageDoi: pageDoi,
      articleUrl: location.href,
      sourceUrl: candidate.url,
      id: String(candidate.label || ('figure-' + String(order + 1))).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      label: candidate.label || ('Figure ' + String(order + 1)),
      caption: candidate.text || '',
      order: Number(order || 0),
      width: Number(image.width || 0) || undefined,
      height: Number(image.height || 0) || undefined,
      imageData: image.imageData
    };
    pushTrace(trace, {
      stage: 'figure_stage', event: 'start', status: 'start',
      url: candidate.url, message: 'recovery_direct_stage:' + payload.label,
      byteLength: image.byteLength
    });
    try {
      var result = await postAcquiredImage(job, candidate, image, trace, FIGURE_STAGE_ENDPOINT, payload, token, 'figure_stage');
      if (!result || result.stored !== true || result.staged !== true ||
          normalizeDoi(result.doi) !== normalizeDoi(job.doi) ||
          String(result.id || '') !== payload.id) {
        throw new Error('figure_stage_receipt_invalid');
      }
      // A delayed response from the previous task must not complete a new job.
      assertBoundCaptureJob(job, candidate.url);
      pushTrace(trace, {
        stage: 'figure_stage', event: 'complete', status: 'ok',
        url: result.imageUrl || candidate.url,
        message: payload.label + ';stored=1;published=0',
        imageWidth: Number(result.width || image.width || 0),
        imageHeight: Number(result.height || image.height || 0),
        byteLength: image.byteLength
      });
      return Object.assign({}, result, {
        staged: true, imported: false, published: false,
        publicationState: 'pending_verified_promotion'
      });
    } catch (error) {
      pushTrace(trace, {
        stage: 'figure_stage', event: 'failed', status: 'failed',
        httpStatus: Number(error && error.httpStatus || 0),
        url: candidate.url,
        message: String(error && error.message || error)
      });
      throw error;
    }
  }

  async function uploadCapture(job, candidate, image, trace, token) {
    assertBoundCaptureJob(job, candidate.url);
    captureLiveUpdate(job,'uploading',{label:candidate.kind==='figure1'?'Figure 1 替代图':'TOC'});
    pushTrace(trace, {
      stage: 'r2_upload',
      event: 'start',
      status: 'start',
      url: candidate.url,
      candidateKind: candidate.kind,
      candidateSource: candidate.source,
      byteLength: image.byteLength
    });
    try {
      var result = await postAcquiredImage(job, candidate, image, trace, CAPTURE_ENDPOINT, {
        doi: job.doi,
      jobId: job.jobId,
      captureVersion: VERSION,
      pageDoi: normalizeDoi(job.doi),
        kind: candidate.kind,
        imageData: image.imageData,
        articleUrl: location.href,
        sourceUrl: candidate.url,
        caption: candidate.text || '',
        capturedAt: nowIso(),
        source: 'tampermonkey-toc-mainline'
      }, token, 'r2_upload');
      if (!result || result.stored !== true || normalizeDoi(result.doi) !== normalizeDoi(job.doi) || result.kind !== candidate.kind) throw new Error('toc_capture_receipt_invalid');
      assertBoundCaptureJob(job, candidate.url);
      pushTrace(trace, {
        stage: 'r2_upload',
        event: 'complete',
        status: 'ok',
        url: result.imageUrl || '',
        message: image.method,
        byteLength: image.byteLength
      });
      return result;
    } catch (error) {
      pushTrace(trace, {
        stage: 'r2_upload',
        event: 'failed',
        status: 'failed',
        httpStatus: Number(error && error.httpStatus || 0),
        url: candidate.url,
        message: String(error && error.message || error)
      });
      throw error;
    }
  }

  async function uploadReport(job, trace, status, reason, candidate, token) {
    GM_setValue(traceKey(job.doi), {
      doi: job.doi,
      status: status,
      reason: reason,
      trace: trace,
      finishedAt: nowIso()
    });
    try {
      await postJson(REPORT_ENDPOINT, {
        doi: job.doi,
        publisher: job.publisher,
        status: status,
        reason: reason,
        assetType: candidate && candidate.assetType || '',
        candidateKind: candidate && candidate.kind || '',
        candidateSource: candidate && candidate.source || '',
        articleUrl: location.href,
        sourceUrl: candidate && candidate.url || '',
        pageTitle: document.title || '',
        queueGeneratedAt: job.queueGeneratedAt || '',
        startedAt: job.startedAt || '',
        finishedAt: nowIso(),
        trace: trace
      }, token);
      return true;
    } catch (error) {
      pushTrace(trace, {
        stage: 'report_upload',
        event: 'failed',
        status: 'failed',
        httpStatus: Number(error && error.httpStatus || 0),
        message: String(error && error.message || error)
      });
      GM_setValue(traceKey(job.doi), {
        doi: job.doi,
        status: status,
        reason: reason,
        trace: trace,
        finishedAt: nowIso()
      });
      return false;
    }
  }

  function failureReason(trace, error) {
    var rev = trace.slice().reverse();
    var page = rev.find(function (x) { return x.stage === 'page' && x.event === 'state'; });
    if (page && page.status === 'challenge') return 'challenge_not_completed';
    if (page && page.status === 'auth') return 'auth_not_completed';
    var page403 = rev.find(function (x) { return x.stage === 'page_fetch' && x.httpStatus === 403; });
    var gm403 = rev.find(function (x) { return x.stage === 'gm_fetch' && x.httpStatus === 403; });
    var canvasFail = rev.find(function (x) { return x.stage === 'rendered_canvas' && x.event === 'failed'; });
    var figureNone = rev.find(function (x) { return x.stage === 'figure_discovery' && x.event === 'scan_complete' && x.status === 'none'; });
    var none = rev.find(function (x) { return x.stage === 'candidate_discovery' && x.event === 'scan_complete' && x.status === 'none'; });
    if ((page403 || gm403) && canvasFail) return 'image_403_and_rendered_canvas_unreadable';
    if (page403 || gm403) return 'image_http_403';
    if (canvasFail) return 'rendered_canvas_unreadable';
    var iframeSecurity = rev.find(function (x) { return x.stage === 'iframe_dom_scan' && x.event === 'inspect_failed' && /security/i.test(String(x.message || '')); });
    var iframeNone = rev.find(function (x) { return x.stage === 'iframe_dom_scan' && x.event === 'complete' && x.status === 'none'; });
    if (iframeSecurity) return 'iframe_cross_origin_or_auth_redirect';
    if (none && iframeNone) return 'no_toc_candidate_after_live_and_iframe_scan';
    if (none) return 'no_toc_candidate_in_live_dom';
    if (figureNone) return 'no_article_figure_candidate_in_live_dom';
    return String(error && error.message || error || 'unknown_failure').slice(0, 220);
  }

  async function runPublisherJob(job) {
    assertBoundCaptureJob(job);
    var token=writeToken(),trace=[],cache=new Map();
    var checkpoint=readCheckpoint(job.doi);checkpoint.figures=checkpoint.figures||{};
    if(checkpoint.toc&&checkpoint.toc.status==='stored'&&Date.now()-checkpoint.updatedAt<6*60*60*1000)job.captureToc=false;
    job.publisher=job.publisher||publisherForDoi(job.doi);
    job.captureDeadline=Date.now()+6*60*1000;
    var result={status:'failed',reason:'',toc:{status:job.captureToc===false?'already_available':'pending'},figures:{status:'pending',discovered:0,stored:0,failed:0,items:[]},fulltext:{status:evidenceCaptureEligible(job)?'pending':'not_requested'},figuresImported:0,figuresStaged:0,published:false};
    job._liveResult=result;
    autoReportJob=job;
    captureLiveUpdate(job,'discovering');
    pushTrace(trace,{stage:'job',event:'start',status:'running',url:location.href,message:'v'+VERSION+';paired_capture=1;need='+String(job.mediaNeed)});
    try {
      if (!token) throw new Error('write_token_missing');
      if(String(job.mediaNeed||'')==='evidence'){
        result.toc={status:'not_requested'};
        result.figures.status='not_requested';
        result.fulltext=await tryCaptureArticleEvidence(job,trace,token,8000);
        result.status=result.fulltext.status==='stored'?'success':/^(?:empty|invalid)$/.test(String(result.fulltext.status||''))?'partial':'failed';
        result.reason='evidence_capture;fulltext='+String(result.fulltext.status||'failed')+';published=0';
        pushTrace(trace,{stage:'evidence_result',event:'complete',status:result.status,message:result.reason});
        captureLiveUpdate(job,'finished',{error:result.status==='failed'?result.reason:''});
        return finishPairedJob(job,result,trace,token);
      }
      var discovered=await waitForPairedVisuals(job,trace);
      job._liveDiscoveryDone=true;
      result.figures.discovered=new Set(discovered.figures.map(function(c){return c.label;})).size;
      captureLiveUpdate(job,'discovering');
      if (job.captureToc!==false) {
        try {
          var officials=discovered.toc.filter(function(c){return c.kind==='official';});
          var candidates=officials.length?officials:discovered.toc;
          var best=await acquireBestVisual(job,candidates,trace,cache,'toc');
          if (best) {
            var receipt=await uploadCapture(job,best.candidate,best.image,trace,token);
            result.toc={status:'stored',kind:best.candidate.kind,quality:best.quality.quality,imageUrl:receipt.imageUrl};
            checkpoint.toc=result.toc;saveCheckpoint(job.doi,checkpoint);
            captureLiveUpdate(job,'saved',{label:best.candidate.kind==='figure1'?'Figure 1 替代图':'TOC'});
          } else result.toc={status:'not_found',reason:'no_usable_official_or_figure1'};
        } catch(error) {
          if (/doi_mismatch|stale|unbound|user_aborted/.test(String(error.message))) throw error;
          result.toc={status:'failed',reason:String(error.message)};
          captureLiveUpdate(job,'image_failed',{label:'TOC',error:error.message});
        }
      }
      var wantsFigures=String(job.mediaNeed||'').indexOf('figures')>=0;
      var groups=new Map();
      if(wantsFigures)discovered.figures.forEach(function(c){if(!groups.has(c.label))groups.set(c.label,[]);groups.get(c.label).push(c);});
      result.figures.discovered=groups.size;
      var labels=Array.from(groups.keys());
      // Twenty semantic figures per article, not twenty variants of the same image.
      var downloadedThisVisit=0;
      for (var i=0;i<labels.length;i+=1) {
        if (Date.now()>job.captureDeadline) {result.figures.limitReached=true;break;}
        var label=labels[i];job._liveLabel=label;
        var saved=checkpoint.figures[label];
        if(saved&&saved.contentHash&&saved.sourceUrl&&groups.get(label).some(function(c){return c.url===saved.sourceUrl;})) {
          result.figures.items.push(Object.assign({},saved,{status:'already_staged'}));result.figures.stored+=1;captureLiveUpdate(job,'reused',{label:label});continue;
        }
        if(downloadedThisVisit>=20){result.figures.limitReached=true;break;}
        downloadedThisVisit+=1;
        try {
          var chosen=await acquireBestVisual(job,groups.get(label),trace,cache,'figure');
          if (!chosen) throw new Error('no_usable_figure_variant');
          var stored=await uploadArticleFigure(job,chosen.candidate,chosen.image,trace,token,i);
          result.figures.items.push({label:label,status:'staged',quality:chosen.quality.quality,width:chosen.image.width,height:chosen.image.height,sourceUrl:chosen.candidate.url,contentHash:stored.contentHash});
          result.figures.stored+=1;result.figuresStaged+=1;
          checkpoint.figures[label]=result.figures.items[result.figures.items.length-1];saveCheckpoint(job.doi,checkpoint);
          captureLiveUpdate(job,'saved',{label:label,quality:chosen.quality.quality,width:chosen.image.width,height:chosen.image.height});
        } catch(error) {
          if (/doi_mismatch|stale|unbound|user_aborted/.test(String(error.message))) throw error;
          result.figures.failed+=1;
          result.figures.items.push({label:label,status:'failed',reason:String(error.message)});
          captureLiveUpdate(job,'image_failed',{label:label,error:error.message});
        }
      }
      if (result.figures.stored+result.figures.failed<labels.length) result.figures.limitReached=true;
      result.figures.status=!wantsFigures?'not_requested':!labels.length?'not_found':result.figures.failed||result.figures.limitReached?'partial':'staged';
      var tocOk=result.toc.status==='stored'||result.toc.status==='already_available';
      if(!wantsFigures){
        result.status=tocOk?'success':'failed';
        result.reason='toc_capture;toc='+result.toc.status+';figures=not_requested;published=0';
      }else{
        result.status=tocOk && result.figures.status==='staged'?'success':tocOk||result.figures.stored?'partial':'failed';
        result.reason='paired_capture;toc='+result.toc.status+';figures='+result.figures.stored+'/'+result.figures.discovered+';published=0';
      }
      // Evidence capture is deliberately downstream of media. Its failure never
      // changes TOC/body success, and TOC-only historical jobs never enter it.
      result.fulltext=await tryCaptureArticleEvidence(job,trace,token,0);
    } catch(error) {
      result.status=String(error.message)==='user_aborted'?'aborted':(result.figures.stored||result.toc.status==='stored'?'partial':'failed');
      result.reason=String(error.message);
    }
    pushTrace(trace,{stage:'paired_result',event:'complete',status:result.status,message:result.reason});
    captureLiveUpdate(job,'finished',{error:result.status==='failed'?result.reason:''});
    return finishPairedJob(job,result,trace,token);
  }

  function isGalleryPage() {
    var host = String(location.hostname || '').toLowerCase();
    var path = String(location.pathname || '/');
    if (host === GALLERY_HOST) return true;
    if (host === PAGES_GALLERY_HOST) return true;
    return host === LEGACY_GALLERY_HOST && path.indexOf(LEGACY_GALLERY_PATH) === 0;
  }

  function badge(text, color) {
    if (!isGalleryPage()) return;
    var node = document.getElementById('osg-toc-mainline-status');
    if (!node) {
      node = document.createElement('div');
      node.id = 'osg-toc-mainline-status';
      node.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;padding:8px 10px;background:#111827;color:#fff;border-radius:8px;font:12px/1.4 system-ui;box-shadow:0 2px 10px #0004;max-width:390px';
      document.body.appendChild(node);
    }
    node.textContent = text;
    node.style.background = color || '#111827';
  }

  async function acquireLease() {
    var now = Date.now();
    var lease = GM_getValue(LEASE_KEY, null);
    if (lease && Number(lease.expiresAt || 0) > now && lease.owner !== CONTROLLER_ID) return false;
    GM_setValue(LEASE_KEY, { owner: CONTROLLER_ID, expiresAt: now + 90000 });
    await sleep(250); // Let competing control pages settle before any dispatch.
    var confirmed = GM_getValue(LEASE_KEY, null);
    return Boolean(confirmed && confirmed.owner === CONTROLLER_ID);
  }

  function renewLease() {
    var lease = GM_getValue(LEASE_KEY, null);
    if (!lease || lease.owner !== CONTROLLER_ID) return false;
    GM_setValue(LEASE_KEY, { owner: CONTROLLER_ID, expiresAt: Date.now() + 90000 });
    return true;
  }

  async function uploadControllerReport(job, reason, progress, reportStatus) {
    var token = writeToken();
    if (!token || !job || !normalizeDoi(job.doi)) return false;
    var status = String(reportStatus || 'failed');
    var trace = [
      {
        seq: 1,
        at: nowIso(),
        stage: 'controller',
        event: status === 'aborted' ? 'job_aborted' : 'job_timeout_or_launch_failure',
        status: status,
        httpStatus: 0,
        contentType: '',
        url: String(progress && progress.url || articleUrl(job) || ''),
        message: String(reason || 'controller_failure'),
        candidateKind: '',
        candidateSource: '',
        candidateScore: 0,
        imageWidth: 0,
        imageHeight: 0,
        byteLength: 0
      }
    ];
    if (progress && progress.status) {
      trace.push({
        seq: 2,
        at: String(progress.at || nowIso()),
        stage: 'controller',
        event: 'last_progress',
        status: String(progress.status || ''),
        httpStatus: 0,
        contentType: '',
        url: String(progress.url || ''),
        message: 'last publisher-page progress visible to Gallery controller',
        candidateKind: '',
        candidateSource: '',
        candidateScore: 0,
        imageWidth: 0,
        imageHeight: 0,
        byteLength: 0
      });
    }
    try {
      await postJson(REPORT_ENDPOINT, {
        doi: job.doi,
        publisher: job.publisher || publisherForDoi(job.doi),
        status: status,
        reason: String(reason || 'controller_failure').slice(0, 220),
        assetType: '',
        candidateKind: '',
        candidateSource: 'gallery_controller',
        articleUrl: String(progress && progress.url || articleUrl(job) || ''),
        sourceUrl: '',
        pageTitle: 'Gallery TOC controller',
        queueGeneratedAt: job.queueGeneratedAt || '',
        startedAt: job.startedAt || '',
        finishedAt: nowIso(),
        trace: trace
      }, token);
      return true;
    } catch (error) {
      try { console.warn('[OSG TOC] controller diagnostic upload failed', error); } catch (_) {}
      return false;
    }
  }

  function completedPublisherResult(job) {
    var result=GM_getValue(resultKey(job.doi),null);
    return result&&result.jobId===job.jobId&&result.version===VERSION&&result.finishedAt?result:null;
  }

  function controllerFailureDisposition(reason) {
    reason=String(reason||'');
    if(/^(?:controller_lease_lost|another_task_still_active|capture_server_upgrade_pending)$/.test(reason))return 'stop';
    if(/^(?:task_tab_handle_unavailable|previous_task_tab_not_closed|bound_publisher_heartbeat_missing|controller_timeout)$/.test(reason))return 'skip';
    return 'record';
  }

  async function waitForResult(job,tab) {
    var started=Date.now(), timeoutMs=8*60*1000;
    while(true) {
      if(!renewLease())throw new Error('controller_lease_lost');
      if(isAbortRequested()||GM_getValue(ENABLED_KEY,true)===false) return {doi:job.doi,jobId:job.jobId,status:'aborted',reason:'user_aborted',finishedAt:nowIso()};

      // publisher final results over controller timeouts: always prefer a completed publisher result first.
      // Background-tab/browser suspension can advance Date.now() by many minutes
      // between two controller polls even though the publisher already finished.
      var result=completedPublisherResult(job);
      if(result) return result;

      var elapsed=Date.now()-started;
      if(elapsed>=timeoutMs) {
        // One short grace window covers a final result racing with controller wake-up.
        for(var grace=0;grace<4;grace+=1) {
          await sleep(250);
          result=completedPublisherResult(job);
          if(result) return result;
        }
        return {doi:job.doi,jobId:job.jobId,status:'failed',reason:'controller_timeout',finishedAt:nowIso()};
      }

      var hb=currentPublisherHeartbeat();
      if(elapsed>60000 && (!hb||hb.jobId!==job.jobId)) {
        // The publisher may have finished between heartbeat sampling and this branch.
        result=completedPublisherResult(job);
        if(result) return result;
        return {doi:job.doi,jobId:job.jobId,status:'failed',reason:'bound_publisher_heartbeat_missing',finishedAt:nowIso()};
      }
      var progress=GM_getValue(progressKey(job.doi),null);
      if(progress&&/auth_wait|challenge_wait/.test(progress.status))badge('等待出版社验证：'+job.doi,'#92400e');
      await sleep(1000);
    }
  }

  function clearOwnedJob(job) {
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
      if(caps.captureVersion!==VERSION||caps.mediaGeneration!==1790082000000||caps.mode!=='verified-staging'||caps.evidenceSchemaVersion!==EVIDENCE_SCHEMA_VERSION||String(caps.evidenceCaptureMinControllerRevision||'')!=='2.2.32')throw new Error('capture_server_upgrade_pending');
      var queue=await getJson(QUEUE_URL+'?ts='+Date.now());
      var media=await getJson('https://zhou526316-sys.github.io/organic-synthesis-gallery/media-index.json?ts='+Date.now());
      var evidenceInventory=null;
      try { evidenceInventory=await getPrivateJson(EVIDENCE_INVENTORY_ENDPOINT+'?ts='+Date.now(),writeToken()); }
      catch(error){ try{console.warn('[OSG TOC] evidence inventory unavailable; evidence-only backlog paused',String(error&&error.message||error));}catch(_){} }
      var mediaJobs=pairedJobs(queue,media);
      var evidenceJobs=evidenceInventory?evidenceBackfillJobs(queue,media,evidenceInventory):[];
      var generation=VERSION+':paired:'+String(queue.mediaGeneration);
      var evidenceGeneration=EVIDENCE_SCHEMA_VERSION+':'+CONTROLLER_REVISION+':'+String(queue.latestAddedDate||queue.generatedAt||'');
      function eligibleMedia(job) {
        var prior=GM_getValue(attemptKey(job.doi,generation,'figures'),null);
        // A scheduler failure is not a failed publisher/article capture.
        if(prior && prior.reason==='controller_lease_lost')return true;
        if (prior && prior.version===VERSION && prior.status==='success') return false;
        if (prior && !overnightRetryEligible(prior,Date.now())) return false;
        return true;
      }
      function eligibleEvidence(job) {
        var prior=GM_getValue(attemptKey(job.doi,evidenceGeneration,'evidence'),null);
        if(prior && prior.reason==='controller_lease_lost')return true;
        if(prior && prior.status==='success')return false;
        if(prior && !overnightRetryEligible(prior,Date.now()))return false;
        return true;
      }
      var latestAddedDate=String(queue.latestAddedDate||'');
      function availableJobs() {
        var mediaAvailable=mediaJobs.filter(eligibleMedia);
        var mediaDois=new Set(mediaAvailable.filter(function(job){return String(job.mediaNeed||'').indexOf('figures')>=0;}).map(function(job){return job.doi;}));
        var evidenceAvailable=evidenceJobs.filter(eligibleEvidence).filter(function(job){return !mediaDois.has(job.doi);});
        return mediaAvailable.concat(evidenceAvailable);
      }
      var available=availableJobs(),batch=selectBatchJobs(available,batchSize(),latestAddedDate);
      summary={version:VERSION,controllerRevision:CONTROLLER_REVISION,queueGeneratedAt:queue.generatedAt,latestAddedDate:latestAddedDate,queueTotal:mediaJobs.length+evidenceJobs.length,evidenceBacklog:evidenceJobs.length,total:batch.length,startedAt:nowIso(),success:0,partial:0,failed:0,aborted:0,skipped:0,lifecycleWarnings:0,tocStored:0,figuresStaged:0,evidenceStored:0,published:0,results:[]};
      GM_setValue(SUMMARY_KEY,summary);
      for (var i=0;i<batch.length;i+=1) {
        if(isAbortRequested()||GM_getValue(ENABLED_KEY,true)===false)break;
        // Fail before opening any page, and never dispatch after loss of ownership.
        if(!renewLease()) {stopReason='controller_lease_lost';break;}
        if(GM_getValue(ACTIVE_JOB_KEY,null)) {stopReason='another_task_still_active';break;}
        var evidenceOnly=String(batch[i].mediaNeed||'')==='evidence';
        var attemptGeneration=evidenceOnly?evidenceGeneration:generation;
        var attemptKind=evidenceOnly?'evidence':'figures';
        var priorAttempt=GM_getValue(attemptKey(batch[i].doi,attemptGeneration,attemptKind),null);
        var job=Object.assign({},batch[i],{jobId:crypto.randomUUID(),controllerId:CONTROLLER_ID,captureVersion:VERSION,startedAt:nowIso(),queueGeneratedAt:queue.generatedAt,retryCount:Number(priorAttempt&&priorAttempt.retryCount||0)+1});
        GM_deleteValue(resultKey(job.doi));GM_deleteValue(progressKey(job.doi));GM_deleteValue(HEARTBEAT_KEY);GM_setValue(ACTIVE_JOB_KEY,job);
        badge((evidenceOnly?'文字证据':'TOC＋正文图')+' '+(i+1)+'/'+batch.length+'：'+job.doi,'#1f2937');
        var tab=null,result=null,closed=true,skipReason='';
        try {
          if(!renewLease())throw new Error('controller_lease_lost');
          tab=await Promise.resolve(GM_openInTab(articleUrl(job)+'#osg-job='+encodeURIComponent(job.jobId),{active:job.publisher==='wiley',insert:true,setParent:true}));
          if(!tab || typeof tab.close!=='function')throw new Error('task_tab_handle_unavailable');
          result=await waitForResult(job,tab);
        } catch(error) {
          var controllerReason=String(error&&error.message||error);
          if(controllerFailureDisposition(controllerReason)==='stop')stopReason=controllerReason;
          else {
            if(controllerFailureDisposition(controllerReason)==='skip')skipReason=controllerReason;
            result={doi:job.doi,jobId:job.jobId,version:VERSION,status:'failed',reason:controllerReason,finishedAt:nowIso()};
          }
        } finally {
          // Invalidate this job before closing. A lingering old tab is harmless because all later writes are bound to the active jobId/DOI.
          clearOwnedJob(job);
          if(tab)closed=await closeTaskTab(tab);
          if(!closed)skipReason=skipReason||'previous_task_tab_not_closed';
        }
        if(result && controllerFailureDisposition(result.reason)==='skip')skipReason=skipReason||result.reason;
        if((result && !result.toc && result.status==='failed') || stopReason || skipReason) {
          var observed=currentPublisherHeartbeat();
          var observedUrl=observed&&observed.jobId===job.jobId?observed.href:'';
          var controllerEvent=stopReason?'stopped':skipReason?'skipped':'failed';
          var controllerMessage=stopReason||skipReason||(result&&result.reason)||'unknown_controller_failure';
          enqueueCaptureReport(job,[{at:nowIso(),stage:'controller',event:controllerEvent,status:'failed',message:controllerMessage,url:observedUrl}], 'controller_error',controllerMessage,true,observedUrl);
        }
        if(result && !stopReason) {
          result.version=VERSION;
          result.retryCount=Number(priorAttempt&&priorAttempt.reason!=='controller_lease_lost'&&priorAttempt.retryCount||0)+1;
          summary.results.push(result);summary[result.status]=(summary[result.status]||0)+1;
          summary.tocStored+=result.toc&&result.toc.status==='stored'?1:0;
          summary.figuresStaged+=Number(result.figuresStaged||0);
          summary.evidenceStored+=result.fulltext&&result.fulltext.status==='stored'?1:0;
          GM_setValue(attemptKey(job.doi,attemptGeneration,attemptKind),result);
          if(!evidenceOnly&&result.fulltext&&result.fulltext.status==='stored'){
            GM_setValue(attemptKey(job.doi,evidenceGeneration,'evidence'),{doi:job.doi,status:'success',version:VERSION,controllerRevision:CONTROLLER_REVISION,finishedAt:result.finishedAt||nowIso(),reason:'opportunistic_evidence_stored',retryCount:1});
          }
        }
        if(skipReason) {
          if(result && result.status!=='failed' && skipReason==='previous_task_tab_not_closed')summary.lifecycleWarnings+=1;
          else summary.skipped+=1;
          badge('已跳过 '+job.doi+'：'+skipReason+'；继续下一篇','#92400e');
        }
        if(stopReason){summary.stopReason=stopReason;GM_setValue(SUMMARY_KEY,summary);break;}
        GM_setValue(SUMMARY_KEY,summary);
        if(result && result.status==='aborted')break;
        await sleep(3500);
      }
      summary.finishedAt=nowIso();summary.stopReason=stopReason;GM_setValue(SUMMARY_KEY,summary);
      if(stopReason)badge('已停止开页：'+stopReason+'；请检查日志后再继续','#991b1b');
      else badge('本批：TOC '+summary.tocStored+'；正文图已暂存 '+summary.figuresStaged+'；文字证据 '+summary.evidenceStored+'；完整 '+summary.success+'，部分 '+summary.partial+'，失败 '+summary.failed+'，跳过 '+summary.skipped+'（媒体暂存不等于发布）','#374151');
      if(!stopReason&&availableJobs().length>0&&!isAbortRequested()&&GM_getValue(ENABLED_KEY,true)!==false) {
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
      if(/controller_lease_lost|another_task_still_active|capture_server_upgrade_pending/.test(stopReason)){CONTROLLER_STOP_REASON=stopReason;if(nextBatchTimer!==null){clearTimeout(nextBatchTimer);nextBatchTimer=null;}}
      globalThis.__OSG_PAIRED_CONTROLLER_BUSY__=false;
      var lease=GM_getValue(LEASE_KEY,null);
      if(lease&&lease.owner===CONTROLLER_ID)GM_deleteValue(LEASE_KEY);
    }
  }

  async function publisherBoot() {
    if (location.hostname === 'doi.org') return;
    var job = GM_getValue(ACTIVE_JOB_KEY, null);
    if (!job || !normalizeDoi(job.doi)) {
      return;
    }
    try {
      await bindPublisherCaptureJob(job);
    } catch (error) {
      // Do not complete or overwrite the active job from an unrelated tab.
      await uploadReport(job, [{ stage: 'page_doi_guard', event: 'rejected', status: 'failed', url: location.href, message: String(error.message) }], 'failed', String(error.message), null, writeToken());
      return;
    }
    writePublisherHeartbeat(job, 'active_job_seen');
    var started = Date.parse(job.startedAt || '');
    if (!Number.isFinite(started) || Date.now() - started > 12 * 60 * 1000) {
      writePublisherHeartbeat(job, 'active_job_stale');
      return;
    }
    GM_setValue(progressKey(job.doi), {
      status: 'publisher_script_started',
      at: nowIso(),
      url: location.href,
      version: VERSION,
      host: location.hostname
    });
    writePublisherHeartbeat(job, 'publisher_script_started');
    await sleep(900);
    await runPublisherJob(job);
  }

  function installMenu() {
    GM_registerMenuCommand('查看实时抓取进度', function () {
      if(isGalleryPage()){mountCaptureLivePanel();globalThis.__OSG_CAPTURE_LIVE_PANEL__.show();}
    });
    GM_registerMenuCommand('设置 R2 写入令牌', function () {
      var value = window.prompt('输入 BRIDGE_WRITE_TOKEN。只保存在本机 Tampermonkey 存储，不会写入 Git/R2 日志。', '');
      if (value === null) return;
      value = String(value || '').trim();
      if (!value) {
        GM_deleteValue(TOKEN_KEY);
        GM_deleteValue(LEGACY_TOKEN_KEY);
        window.alert('本机写入令牌已清除。');
      } else {
        GM_setValue(TOKEN_KEY, value);
        GM_setValue(LEGACY_TOKEN_KEY, value);
        window.alert('写入令牌已保存在本机 Tampermonkey。');
      }
    });
    GM_registerMenuCommand('设置每批抓取数量', function () {
      var current = batchSize();
      var value = window.prompt('每批处理 1–20 篇。建议 5–8 篇，避免出版社限流。', String(current));
      if (value === null) return;
      var parsed = Math.max(1, Math.min(20, Math.floor(Number(value) || current)));
      GM_setValue(BATCH_SIZE_KEY, parsed);
      window.alert('每批抓取数量已设为 ' + parsed + '。');
    });
    GM_registerMenuCommand('立即运行媒体抓取队列', requestControllerStart);
    GM_registerMenuCommand('中止当前媒体抓取批次', function () {
      GM_setValue(ABORT_KEY, { at: Date.now(), reason: 'user_aborted' });
      GM_setValue(ENABLED_KEY,false);
      if(nextBatchTimer!==null){clearTimeout(nextBatchTimer);nextBatchTimer=null;}
      window.alert('已请求中止当前媒体抓取批次。正在运行的出版社标签页会由控制器关闭；人工中止不会计入失败或失败冷却。');
    });
    GM_registerMenuCommand('继续媒体抓取主线', requestControllerStart);
    GM_registerMenuCommand('上传本地 TOC 日志', function () {
      uploadLocalDiagnostics().catch(function () {});
    });
    GM_registerMenuCommand('查看出版社脚本心跳', function () {
      var hb = currentPublisherHeartbeat();
      window.alert(hb ? JSON.stringify({
        doi: normalizeDoi(hb.doi || ''),
        publisher: String(hb.publisher || ''),
        host: String(hb.host || ''),
        version: String(hb.version || ''),
        state: String(hb.state || ''),
        atIso: String(hb.atIso || '')
      }, null, 2) : '尚未收到任何出版社页面脚本心跳。');
    });
    GM_registerMenuCommand('暂停/继续 TOC 自动运行', function () {
      var enabled = GM_getValue(ENABLED_KEY, true) !== false;
      GM_setValue(ENABLED_KEY, !enabled);
      window.alert(enabled ? '媒体抓取主线已暂停。' : '媒体抓取主线已继续。');
    });
    GM_registerMenuCommand('查看最近运行摘要', function () {
      var summary = GM_getValue(SUMMARY_KEY, {});
      window.alert(JSON.stringify({ runtimeVersion: VERSION, summaryIsCurrentVersion: summary.version === VERSION, activeJob: GM_getValue(ACTIVE_JOB_KEY, null), summary: summary }, null, 2));
    });
    GM_registerMenuCommand('清除 TOC 失败冷却并立即重试', function () {
      var queueKeys = [];
      try {
        if (typeof GM_listValues === 'function') queueKeys = GM_listValues();
      } catch (_) {}
      queueKeys.filter(function (key) { return String(key).indexOf(P + 'failure:') === 0; })
        .forEach(function (key) { try { GM_deleteValue(key); } catch (_) {} });
      window.alert('已清除当前脚本版本的失败冷却。返回 Gallery 后可立即重新运行媒体抓取队列。');
    });
    GM_registerMenuCommand('清除卡住任务/租约', function () {
      GM_setValue(ABORT_KEY,{at:Date.now(),reason:'user_aborted'});
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

  function visualScope(node) {
    if (!node || !node.closest) return null;
    if (node.closest('aside,nav,header,footer,[class*="recommend" i],[class*="related" i],[id*="related" i],[class*="reference" i]')) return null;
    var block = node.closest('figure,[role="figure"],.fig-section,.figure,.article-figure,.c-article-section__figure,[class*="graphical-abstract"],[class*="visual-abstract"],[id*="graphicalAbstract"]');
    if (!block) {
      var parent = node.parentElement;
      for (var depth = 0; parent && depth < 3; depth += 1, parent = parent.parentElement) {
        var captions = parent.querySelectorAll('figcaption,.caption,[class*="caption"]');
        if (captions.length === 1) { block = parent; break; }
      }
    }
    if (!block) return null;
    var caps = Array.from(block.querySelectorAll('figcaption,.caption,[class*="caption"],.figure-title'));
    var texts = caps.map(function (c) { return String(c.textContent || '').replace(/\s+/g, ' ').trim(); });
    var numbered = texts.filter(function (t) { return /^(?:Fig(?:ure)?\.?|Scheme|Chart)\s*\d+[a-z]?\b/i.test(t); });
    var labels = Array.from(new Set(numbered.map(function (t) { return articleFigureLabel(t, 0); })));
    if (labels.length > 1) return null; // Refuse a shared ancestor containing multiple Figures.
    var own = [node.getAttribute('alt'),node.getAttribute('title'),node.getAttribute('aria-label')].filter(Boolean).join(' ');
    var marker = [block.id, typeof block.className === 'string' ? block.className : '', texts[0] || '', own].join(' ');
    var label = labels[0] || (/^(?:Fig(?:ure)?\.?|Scheme|Chart)\s*\d+[a-z]?\b/i.test(own) ? articleFigureLabel(own, 0) : '');
    return { block: block, label: label, caption: (numbered[0] || texts[0] || own).slice(0, 600), official: !label && /graphical[\s_-]*abstract|visual[\s_-]*abstract|toc[\s_-]*(?:graphic|image)|abstract[\s_-]*image/i.test(marker) };
  }

  function visualUrls(node, block, baseUrl) {
    var urls = articleFigureImageUrls(node, baseUrl);
    if (block) {
      block.querySelectorAll('a[href],source').forEach(function (link) {
        var href = normalizeUrl(link.getAttribute('href') || '', baseUrl);
        if (/\.(?:svg|png|jpe?g|webp|gif)(?:\?|$)/i.test(href) && !/\/doi\//i.test(href)) urls.unshift(href);
        if (link.tagName.toLowerCase() === 'source') urls = articleFigureImageUrls(link, baseUrl).concat(urls);
      });
    }
    return Array.from(new Set(urls.filter(Boolean))).slice(0, 6);
  }

  function svgQuality(image) {
    if (image.contentType !== 'image/svg+xml') return null;
    try {
      var xml = atob(String(image.imageData).split(',')[1] || '');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return {usable:false,quality:'unsafe_svg',rank:0};
      var doc = new DOMParser().parseFromString(xml,'image/svg+xml');
      if (doc.querySelector('parsererror') || doc.documentElement.localName!=='svg') return {usable:false,quality:'invalid_svg',rank:0};
      var bad=false;
      doc.querySelectorAll('*').forEach(function(el) {
        if (/^(?:script|foreignObject|iframe|object|embed|animate|animateMotion|animateTransform|set)$/i.test(el.localName)) bad=true;
        Array.from(el.attributes).forEach(function(a) {
          if (/^on/i.test(a.name)) bad=true;
          if (/(?:^|:)href$/i.test(a.name) && !/^#/.test(a.value) && !/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(a.value)) bad=true;
        });
      });
      if (bad || /@import|url\(\s*["']?\s*(?:https?:|\/\/|data:)/i.test(xml)) return {usable:false,quality:'unsafe_svg',rank:0};
      var vector=doc.querySelector('path,polygon,polyline,line,rect,circle,ellipse,text,use');
      var embedded=Boolean(doc.querySelector('image'));
      if (vector && image.width>0 && image.height>0) return {usable:true,quality:embedded?'vector_mixed':'vector',rank:(embedded?15000000:30000000)+Math.min(image.width*image.height,10000000)};
      return null; // A raster-only SVG wrapper still has to pass raster thresholds.
    } catch (_) { return {usable:false,quality:'invalid_svg',rank:0}; }
  }

  function measuredQuality(image, role) {
    var svg=svgQuality(image);
    if (svg) return svg;
    var q=articleFigureResolution(image.width,image.height);
    if (role==='toc' && image.width>=200 && image.height>=90 && image.width*image.height>=24000) q={usable:true,quality:q.quality==='high'?'high':'usable'};
    return {usable:q.usable,quality:q.quality,rank:q.usable?image.width*image.height:0};
  }

  async function sameFigureCurrentSrcFallback(job, candidates, trace, cache, role) {
    if (role !== 'figure' || job.publisher !== 'acs') return null;
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i], element = candidate && candidate.element;
      if (!(element instanceof HTMLImageElement) || !element.complete || element.naturalWidth < 1) continue;
      var scope = visualScope(element);
      if (!scope || scope.official || scope.label !== candidate.label) continue;
      var current = normalizeUrl(element.currentSrc || element.src, location.href);
      if (!current) continue;
      var ids = embeddedJobDois(current);
      if (!ids.length || ids.some(function (doi) { return doi !== normalizeDoi(job.doi); })) continue;
      assertBoundCaptureJob(job,current);
      var fallback = Object.assign({},candidate,{url:current,source:'same_figure_current_src',element:element});
      var image = cache.get(current);
      if (image === undefined) { image = await acquireImage(fallback,trace); cache.set(current,image); }
      if (!image) continue;
      var quality = measuredQuality(image,role);
      pushTrace(trace,{stage:'same_figure_fallback',event:'measured',status:quality.quality,url:image.sourceUrl||current,
        imageWidth:image.width,imageHeight:image.height,message:'label='+candidate.label+';method='+image.method+';networkVariantsExhausted=1'});
      if (!quality.usable) continue;
      return {candidate:Object.assign({},fallback,{url:image.sourceUrl||current}),image:image,quality:quality};
    }
    return null;
  }

  async function acquireBestVisual(job, candidates, trace, cache, role) {
    var best=null;
    for (var i=0;i<Math.min(candidates.length,4);i+=1) {
      if (Date.now()>job.captureDeadline) break;
      if (isAbortRequested()) throw new Error('user_aborted');
      var candidate=candidates[i];
      assertBoundCaptureJob(job,candidate.url);
      captureLiveUpdate(job,'downloading',{label:role==='toc'?'TOC':candidate.label});
      try {
        var image=cache.get(candidate.url);
        if (image===undefined) { image=await acquireImage(candidate,trace); cache.set(candidate.url,image); }
        if (!image) continue;
        // Preserve the URL that actually supplied the bytes, including canvas and redirects.
        var actual=image.sourceUrl||candidate.url;
        assertBoundCaptureJob(job,actual);
        var quality=measuredQuality(image,role);
        captureLiveUpdate(job,'comparing',{label:role==='toc'?'TOC':candidate.label,quality:quality.quality,width:image.width,height:image.height});
        pushTrace(trace,{stage:'figure_quality',event:'measured',status:quality.quality,url:actual,imageWidth:image.width,imageHeight:image.height,message:role+';label='+(candidate.label||candidate.kind)+';method='+image.method});
        if (!quality.usable) continue;
        if (!best || quality.rank>best.quality.rank) best={candidate:Object.assign({},candidate,{url:actual}),image:image,quality:quality};
        if (quality.quality==='vector') break;
      } catch(error) {
        if (/doi_mismatch|job_.*(?:stale|mismatch)|unbound|user_aborted/.test(String(error.message))) throw error;
        pushTrace(trace,{stage:'quality_candidate',event:'failed',status:'failed',url:candidate.url,message:String(error.message)});
      }
    }
    if (!best) best = await sameFigureCurrentSrcFallback(job,candidates,trace,cache,role);
    return best;
  }

  function pairedDiscoveryReady(job, stable, tocCount, figureCount, elapsedMs, figureQuietMs) {
    if (stable < 2) return false;
    var wantsFigures = String(job && job.mediaNeed || '').indexOf('figures') >= 0;
    if (!wantsFigures) return Boolean(tocCount || elapsedMs >= 18000);
    // A TOC can appear several seconds before ACS lazy body figures. Do not let it
    // terminate a body job before the full-page scroll has had time to settle.
    if (!figureCount) return elapsedMs >= 18000;
    return elapsedMs >= 8000 && figureQuietMs >= 4000;
  }

  async function waitForPairedVisuals(job,trace) {
    var started=Date.now(),step=0,lastSignature='',stable=0,lastFigureSignature='',figureChangedAt=started;
    var toc=[],figures=[];
    while (Date.now()-started<90000 && Date.now()<job.captureDeadline) {
      if (isAbortRequested()) throw new Error('user_aborted');
      assertBoundCaptureJob(job);
      var state=pageState(job,trace);
      if (state.auth || state.challenge) {
        captureLiveUpdate(job,state.auth?'auth_wait':'challenge_wait');
        GM_setValue(progressKey(job.doi),{jobId:job.jobId,status:state.auth?'auth_wait':'challenge_wait',at:nowIso()});
        await sleep(2000); continue;
      }
      var wantsToc = job.captureToc !== false;
      var wantsFigures = String(job.mediaNeed || '').indexOf('figures') >= 0;
      toc=wantsToc?collectCandidates(job,trace,document,location.href,'paired_dom',true):[];
      figures=wantsFigures?collectArticleFigureCandidates(job,trace,document,location.href,'paired_dom'):[];
      var figureSignature=figures.map(function(x){return x.label+'|'+x.url;}).join('|');
      if (figureSignature!==lastFigureSignature) {lastFigureSignature=figureSignature;figureChangedAt=Date.now();}
      var signature=toc.map(function(x){return x.url;}).join('|')+'::'+figureSignature;
      stable=signature===lastSignature?stable+1:0;lastSignature=signature;
      if (step<5) {
        var h=Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0);
        try {window.scrollTo(0,Math.floor(h*step/4));}catch(_){}
        step+=1;stable=0;
      } else {
        var now=Date.now(),elapsed=now-started,figureQuiet=now-figureChangedAt;
        if (pairedDiscoveryReady(job,stable,toc.length,figures.length,elapsed,figureQuiet)) break;
      }
      await sleep(800);
    }
    return {toc:toc,figures:figures};
  }

  async function finishPairedJob(job,result,trace,token) {
    result.doi=job.doi;result.jobId=job.jobId;result.version=VERSION;result.finishedAt=nowIso();
    GM_setValue(traceKey(job.doi),{doi:job.doi,jobId:job.jobId,status:result.status,trace:trace,finishedAt:result.finishedAt});
    enqueueCaptureReport(job,trace,result.status,result.reason,true);
    // Durable local report is queued BEFORE the controller can close this publisher tab.
    GM_setValue(resultKey(job.doi),result);
    GM_deleteValue(progressKey(job.doi));
    // The persistent Gallery sender sends/acknowledges the report independently of this tab.
    autoReportJob=null;
    return result;
  }


  function overnightRetryEligible(prior, now) {
    if (!prior) return true;
    if (prior.status==='success') return false;
    var elapsed=now-Date.parse(prior.finishedAt||0);
    var count=Number(prior.retryCount||1);
    if (count>=3 && elapsed<12*60*60*1000) return false;
    if (prior.figures && prior.figures.status==='staged' && (prior.toc||{}).status!=='failed') return elapsed>=6*60*60*1000;
    return elapsed>=Math.min(count*30,180)*60*1000;
  }
  function checkpointKey(doi) { return P+'verified-capture:'+VERSION+':1790082000000:'+normalizeDoi(doi); }
  function readCheckpoint(doi) {
    var stored=GM_getValue(checkpointKey(doi),null);
    return stored&&stored.doi===normalizeDoi(doi)&&stored.version===VERSION?stored:{doi:normalizeDoi(doi),version:VERSION,figures:{}};
  }
  function saveCheckpoint(doi, value) {
    value.doi=normalizeDoi(doi);value.version=VERSION;value.updatedAt=Date.now();
    GM_setValue(checkpointKey(doi),value);
  }

  function pairedJobs(queue,media) {
    if (!Array.isArray(queue.articles) || queue.articles.length!==Number(queue.webpageDoiCount) || Number(queue.mediaGeneration)!==1790082000000) throw new Error('paired_queue_requires_current_complete_registry');
    var seen=new Set();
    var jobs=queue.articles.map(function(raw,index) {
      var doi=normalizeDoi(raw.doi);
      if (!doi||seen.has(doi)) throw new Error('paired_queue_invalid_or_duplicate_doi');seen.add(doi);
      var record=(media.items||{})[doi]||{};
      var toc=record.toc||{};
      var official=Boolean(toc.available && toc.imageUrl && !/fallback/i.test(toc.reason||''));
      var latestAddedDate=String(queue.latestAddedDate||'');
      var isLatest=Boolean(latestAddedDate && String(raw.addedDate||'')===latestAddedDate);
      var mediaNeed=isLatest?'toc+figures':official?'figures':'toc';
      return Object.assign({},raw,{doi:doi,publisher:publisherForDoi(doi),mediaNeed:mediaNeed,state:official?'figure_gap':'no_visual',captureToc:!official,allowFigureOne:isLatest&&!official,_queueIndex:index});
    });
    // Scheduler tiers: latest Gallery additions first, then historical missing official TOCs,
    // then historical body-figure backlog. Journal priority applies inside every tier.
    var latestAddedDate = String(queue.latestAddedDate || '');
    jobs.sort(function(a,b) {
      var delta = compareCaptureJobs(a,b,latestAddedDate);
      return delta || a._queueIndex-b._queueIndex;
    });
    return jobs.map(function(job){delete job._queueIndex;return job;});
  }

  function evidenceBackfillJobs(queue,media,evidenceInventory) {
    var existing=new Map();
    (evidenceInventory&&Array.isArray(evidenceInventory.items)?evidenceInventory.items:[]).forEach(function(row){
      var doi=normalizeDoi(row&&row.doi);
      if(doi&&row&&row.available!==false)existing.set(doi,row);
    });
    var latestAddedDate=String(queue&&queue.latestAddedDate||'');
    return (queue&&Array.isArray(queue.articles)?queue.articles:[]).map(function(raw,index){
      var doi=normalizeDoi(raw&&raw.doi);
      if(!doi)return null;
      var prior=existing.get(doi)||null;
      // Any valid stored evidence level is sufficient for the normal backlog.
      // Abstract-only/partial records may be upgraded later by a separate,
      // low-frequency upgrade policy, but must not be reopened every batch.
      if(prior)return null;
      var record=(media&&media.items||{})[doi]||{},toc=record.toc||{};
      var official=Boolean(toc.available&&toc.imageUrl&&!/fallback/i.test(toc.reason||''));
      var isLatest=Boolean(latestAddedDate&&String(raw.addedDate||'')===latestAddedDate);
      if(!isLatest&&!official)return null;
      return Object.assign({},raw,{
        doi:doi,
        publisher:publisherForDoi(doi),
        mediaNeed:'evidence',
        state:'evidence_gap',
        existingEvidenceLevel:'missing',
        captureToc:false,
        allowFigureOne:false,
        _queueIndex:index
      });
    }).filter(Boolean);
  }

  installMenu();

  if (isGalleryPage()) {
    mountCaptureLivePanel();
    startAutomaticCaptureReports();
    setTimeout(controllerRun, 1500);
    setInterval(function () {
      if (!GM_getValue(ACTIVE_JOB_KEY, null)) controllerRun();
    }, 30 * 60 * 1000);
  } else {
    publisherBoot();
  }
})();
