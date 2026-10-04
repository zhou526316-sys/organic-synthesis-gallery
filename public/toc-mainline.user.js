// ==UserScript==
// @name         Organic Synthesis Gallery TOC Mainline
// @namespace    https://zhou526316-sys.github.io/organic-synthesis-gallery/
// @version      6.2.22
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
// @match        https://www.chinesechemsoc.org/*
// @match        https://chinesechemsoc.org/*
// @match        https://www.ccspublishing.org.cn/*
// @match        https://*.ccspublishing.org.cn/*
// @match        https://doi.org/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
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
  var CONTROLLER_REVISION = '2.2.39';
  var CAPTURE_HOTFIX_REVISION = '20261001-newest-retry-v1';
  var CONTROLLER_LIFECYCLE_REVISION = '20261001-controller-recovery-v2';
  var controllerResumeTimer = null;
  var IMMEDIATE_RESTART_REVISION = '20261001-immediate-restart-v3';
  var MISSING_CAPTURE_REVISION = '20261002-missing-only-v4';
  var QUEUE_COVERAGE_REVISION = '20261003-queue-coverage-v6';
  var PUBLISHER_MEDIA_REVISION = '20261004-publisher-sources-v7';
  var ARCHITECTURE_MEMBERSHIP_REVISION = '20261004-membership-active-v2';
  var MANUAL_RUN_KEY = 'osg-toc-v6:manual-from-head-v3';
  var manualExecution = null;
  var ownedTaskHandle = null;
  var CONTROLLER_STOP_REASON = '';
  var GALLERY_HOST = 'gallery.gczhouwld.com';
  var GALLERY_PATH = '/';
  var LEGACY_GALLERY_HOST = 'zhou526316-sys.github.io';
  var LEGACY_GALLERY_PATH = '/organic-synthesis-gallery/';
  var PAGES_GALLERY_HOST = 'organic-synthesis-gallery-public.pages.dev';
  // Prefer the canonical custom domains. Some Chrome/Tampermonkey profiles can
  // fail GM_xmlhttpRequest against workers.dev even while the Gallery and the
  // same Worker are reachable through the custom domains.
  var QUEUE_URL = 'https://gallery.gczhouwld.com/toc-demand-live.json';
  var ARCHITECTURE_DELIVERY_URL = 'https://gallery.gczhouwld.com/release-delivery.json';
  var ARCHITECTURE_RELEASE_URL = 'https://gallery.gczhouwld.com/architecture-v1/release.json';
  var WORKER = 'https://api.gczhouwld.com';
  var CAPTURE_ENDPOINT = WORKER + '/api/media/local-capture/import';
  var FIGURE_IMPORT_ENDPOINT = WORKER + '/api/article-figures/import';
  var FIGURE_STAGE_ENDPOINT = WORKER + '/api/article-figures/stage';
  var CAPTURE_INDEX_URL = WORKER + '/api/media/local-capture-index';
  var MEDIA_INVENTORY_ENDPOINT = WORKER + '/api/media/inventory';
  var REPORT_ENDPOINT = WORKER + '/api/media/tampermonkey-report/import';
  var DIAGNOSTICS_ENDPOINT = WORKER + '/api/media/local-diagnostics/import';
  var EVIDENCE_ENDPOINT = WORKER + '/api/article-summary/fulltext/import';
  var EVIDENCE_INVENTORY_ENDPOINT = WORKER + '/api/article-summary/evidence-inventory';
  var EVIDENCE_SCHEMA_VERSION = 'article-evidence-v2';
  var P = 'osg-toc-v6:';
  var ARCHITECTURE_MEMBERSHIP_STATE_KEY = P + 'architecture-membership-shadow-v1';
  var TOKEN_KEY = P + 'write-token';
  var LEGACY_TOKEN_KEY = 'osg-toc-v5:write-token';
  var ENABLED_KEY = P + 'enabled';
  var ACTIVE_JOB_KEY = P + 'active-job';
  var LEASE_KEY = P + 'controller-lease';
  var RESUME_REQUEST_KEY = P + 'controller-resume-request-v2';
  var SUMMARY_KEY = P + 'last-run-summary';
  var BATCH_SIZE_KEY = P + 'batch-size';
  var ABORT_KEY = P + 'abort-request';
  var HEARTBEAT_KEY = P + 'publisher-heartbeat';
  var PUBLISHER_ACCESS_COOLDOWN_PREFIX = P + 'publisher-access-cooldown:';
  var PUBLISHER_ACCESS_COOLDOWN_MS = 30 * 60 * 1000;
  var PUBLISHER_LAST_DISPATCH_PREFIX = P + 'publisher-last-dispatch:';
  var SCIENCE_MIN_DISPATCH_GAP_MS = 90 * 1000;
  var FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  var NATURE_NO_TOC_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  var SUMMARY_EVIDENCE_SLA_MS = 60 * 60 * 1000;
  var SUMMARY_EVIDENCE_RETRY_BASE_MS = 5 * 60 * 1000;
  var FAILURE_ENGINE_REVISION = VERSION + ':20260928-science-access-prevention';
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
        lifecycleRevision:typeof CONTROLLER_LIFECYCLE_REVISION==='string'?CONTROLLER_LIFECYCLE_REVISION:'', captureProtocol: VERSION, phase: String(phase || 'working').slice(0, 40),
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
    if(paused&&typeof controllerLifecycleSnapshot==='function'&&controllerLifecycleSnapshot().resumePending)state='resume_wait';
    else if (!state) state = summary.finishedAt ? 'between_batches' : 'idle';
    // Startup/auth progress is a separate local source; do not fabricate fresh activity.
    if (active && !paused && progress && /^(auth_wait|challenge_wait)$/.test(progress.status) &&
        progress.jobId === active.jobId && (!row || Date.parse(progress.at) > row.at)) state = progress.status;
    var last = row ? Number(row.at) : active ? Date.parse(active.startedAt || '') : Date.parse(summary.finishedAt || summary.startedAt || '');
    return {
      coverageRevision:summary.queueCoverageRevision||'',fullyResolved:Number(summary.fullyResolved||0),unresolvedCount:Number(summary.unresolvedCount||0),blockedCount:Number(summary.blockedCount||0),attemptCount:Number(summary.attemptCount||0),blockedPreview:summary.blockedPreview||[],
      phase:summary.phase||'',missingOnly:summary.mode==='missing_only',need:active?captureNeedText(active):'—',activeJob:active,
      pendingMissing:Number(summary.pendingMissing||0),remainingNeeds:summary.remainingNeeds||{},inventoryUnknown:Number(summary.inventoryUnknown||0),inventoryErrors:summary.inventoryErrors||[],pendingPreview:summary.pendingPreview||[],
      state: state, active: Boolean(active), doi: active ? normalizeDoi(active.doi) : '',
      journal: active ? String(active.journal || '').slice(0, 80) : '',
      row: row, ageSeconds: Number.isFinite(last) ? Math.max(0, Math.floor((now - last) / 1000)) : null,
      lastAt: Number.isFinite(last) ? last : null,
      completed: summary.queueCoverageRevision?Number(summary.visitedCount||0):(summary.results || []).length, total: Math.max(0, Number(summary.total || 0)),
      batchToc: Math.max(0, Number(summary.tocStored || 0)),
      batchStaged: Math.max(0, Number(summary.figuresStaged || 0)),
      batchFailed: Math.max(0, Number(summary.failed || 0)),
      batchSkipped: Math.max(0, Number(summary.skipped || 0)),
      batchPartial: Math.max(0, Number(summary.partial || 0)),
      lastResult: (summary.results || []).length ? summary.results[summary.results.length - 1] : null,
      // Summary is committed after each paper. The active row is displayed separately, never added twice.
      publication: '已保存至 R2 暂存；符合站点增量发布规则的新 ACS 正文图会后续发布，当前是否上线以网页与发布账本为准'
    };
  }

  function captureLiveText(s) {
    var phaseNames = {
      retry_wait:'等待必要访问间隔，随后自动继续', inventory_retry:'库存连接恢复中，待办未丢弃', blocked_remaining:'已遍历待办，仍有未补齐或未确认项', all_resolved:'本轮已确认缺项全部补齐', page_loading:'等待出版社页面加载', evidence_capture:'读取文章文本', resume_wait:'等待旧任务收尾后自动恢复', idle:'等待启动', paused:'已暂停', pausing:'正在停止当前任务', between_batches:'本批结束／等待下一批或重试',
      awaiting_publisher:'已开任务页，等待出版社脚本', discovering:'识别 TOC 和正文图',
      auth_wait:'等待出版社登录', challenge_wait:'等待出版社验证', downloading:'获取图片候选',
      comparing:'比较清晰度／矢量结构', uploading:'上传并等待存储回执', saved:'已收到存储回执',
      reused:'复用已保存图片', image_failed:'该图片失败，保留其他结果', finished:'本篇处理结束'
    };
    var tocNames = {pending:'待处理',already_available:'保留已有 TOC',stored:'已保存',not_found:'未找到可用主图',not_requested:'本次无需补抓',failed:'失败'};
    var r = s.row;
    var quality = {vector:'矢量',vector_mixed:'混合矢量／位图',high:'高分辨率',usable:'可用分辨率',low:'低分辨率'};
    var toc = r ? (tocNames[r.tocStatus] || r.tocStatus) : '等待本篇数据';
    if (r && r.tocStatus === 'stored' && r.tocKind === 'figure1') toc += '（Figure 1 替代图，非官方 TOC）';
    var lastError = r ? r.lastError : s.lastResult && s.lastResult.status !== 'success' ? captureLiveError(s.lastResult.reason) : '';
    return {
      state: s.coverageRevision&&!s.active&&phaseNames[s.phase]?phaseNames[s.phase]:s.missingOnly&&!s.active&&s.phase==='starting'?'正在生成缺项队列':s.missingOnly&&!s.active&&s.phase==='inventory_partial'?'缺项队列已结束，部分库存未确认':phaseNames[s.state] || ('已停止：' + captureLiveError(s.state)),
      needs:s.need||'—',
      working:s.active?(s.row&&/全文|Abstract|文本/.test(s.row.label)?'文本':s.row&&s.row.label?s.row.label:s.need||'加载文章'):'—',
      evidence:s.activeJob&&s.activeJob.captureEvidence?'本次补抓文本':s.activeJob&&s.activeJob.existingEvidenceLevel?captureEvidenceLevelText(s.activeJob.existingEvidenceLevel)+'，本次不重抓':'—',
      gaps:s.coverageRevision&&s.phase!=='starting'?'未补齐 '+s.unresolvedCount+' 篇（待执行 '+s.pendingMissing+'／受阻 '+s.blockedCount+'）；TOC '+Number(s.remainingNeeds.toc||0)+'／正文图 '+Number(s.remainingNeeds.figures||0)+'／文本 '+Number(s.remainingNeeds.evidence||0):s.missingOnly?(s.phase==='starting'?'正在读取缺项库存…':'待处理 '+s.pendingMissing+' 篇；TOC '+Number(s.remainingNeeds.toc||0)+'／正文图 '+Number(s.remainingNeeds.figures||0)+'／文本 '+Number(s.remainingNeeds.evidence||0)+'（分项可重叠）'):'—',
      blocked:(s.blockedPreview||[]).map(function(r){return r.doi+' · '+r.need+' · '+r.reason;}).join('\n'),
      inventory:s.inventoryUnknown?'另有 '+s.inventoryUnknown+' 篇存在未确认项，不冒充已齐全或全部缺失'+(s.inventoryErrors.length?'；'+s.inventoryErrors.join('；'):''):'',
      queue:(s.pendingPreview||[]).map(function(j){return j.addedDate+' · '+j.journal+' · '+j.need+'\n'+j.doi;}).join('\n\n'),
      doi: s.doi || '当前没有任务页', journal: s.journal,
      label: r && r.label || '—', toc: toc,
      figures: r ? '已保存 ' + r.stored + '／' + (r.discoveryDone ? r.discovered : '识别中') + ' · 失败 ' + r.failed : '等待本篇数据',
      receipts: r ? '本次暂存回执 ' + r.stagedReceipts + ' · 断点复用 ' + r.reused : '—',
      quality: r ? (quality[r.quality] || '尚未测量') + (r.width && r.height ? ' · ' + r.width + '×' + r.height : '') : '—',
      batch: s.coverageRevision&&s.phase!=='starting'?'已遍历 '+s.completed+'／'+s.total+' 篇 · 确认补齐 '+s.fullyResolved+' 篇 · 尝试 '+s.attemptCount+' 次 · 新主图 '+s.batchToc+' · 新正文图 '+s.batchStaged:s.missingOnly&&s.phase==='starting'?'正在生成缺项队列…':(s.missingOnly?'缺项任务已结束 ':'已结束 ') + s.completed + '／' + s.total + ' 篇 · 主图回执 ' + s.batchToc + ' · 正文暂存回执 ' + s.batchStaged + ' · 部分完成 ' + Number(s.batchPartial||0) + ' · 失败 ' + s.batchFailed + ' · 跳过 ' + s.batchSkipped,
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
    heading.textContent = '抓取实时进度 · ' + CONTROLLER_REVISION + ' · 全队列补缺6 · 图源适配7';
    details.appendChild(heading);
    var main = document.createElement('main');
    var immediate = document.createElement('button');
    immediate.id='osg-immediate-start';immediate.textContent='立即开始任务（只补缺项）';
    immediate.addEventListener('click',forceStartFromHead);main.appendChild(immediate);
    var dl = document.createElement('dl');
    var fields = {};
    [['state','状态'],['doi','当前 DOI'],['journal','期刊'],['needs','本篇缺项'],['working','正在补抓'],['evidence','文本情况'],['label','当前图片'],['toc','主图'],['figures','正文图片'],['receipts','保存记录'],['quality','清晰度'],['gaps','剩余缺项'],['batch','本轮累计'],['last','最后进展'],['error','最近问题']].forEach(function (pair) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = pair[1]; dd.id = pair[0]; fields[pair[0]] = dd; dl.appendChild(dt); dl.appendChild(dd);
    });
    main.appendChild(dl);
    ['stale','inventory','blocked','publication','delivery'].forEach(function (key) { var p = document.createElement('p'); p.id = key; fields[key] = p; main.appendChild(p); });
    var queueDetails=document.createElement('details'),queueTitle=document.createElement('summary'),queueText=document.createElement('p');
    queueTitle.textContent='接下来补什么（最多显示 12 篇）';queueText.style.whiteSpace='pre-wrap';queueText.id='queue';fields.queue=queueText;
    queueDetails.appendChild(queueTitle);queueDetails.appendChild(queueText);main.appendChild(queueDetails);
    var note = document.createElement('small');
    note.textContent = '分母仅为本轮缺项文献；抓取已保存不等于网页已发布。正文图数量为已识别图数，文本完整度如实显示。';
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
      var metadata={eventId:job.jobId+(final?':final':':checkpoint')+':'+revision,jobId:job.jobId,controllerRevision:CONTROLLER_REVISION,publisherMediaRevision:typeof PUBLISHER_MEDIA_REVISION==='string'?PUBLISHER_MEDIA_REVISION:'',queueCoverageRevision:typeof QUEUE_COVERAGE_REVISION==='string'?QUEUE_COVERAGE_REVISION:'',missingRevision:typeof MISSING_CAPTURE_REVISION==='string'?MISSING_CAPTURE_REVISION:'',requestedNeeds:typeof captureNeedText==='function'?captureNeedText(job):'',lifecycleRevision:typeof CONTROLLER_LIFECYCLE_REVISION==='string'?CONTROLLER_LIFECYCLE_REVISION:'',controllerState:typeof controllerLifecycleSnapshot==='function'?controllerLifecycleSnapshot():null,captureVersion:VERSION,kind:final?'final_result':'failure_checkpoint',retryCount:Number(job.retryCount||0),pageDois:embeddedJobDois(page),httpStatusKnown:Number(last.httpStatus||0)>0};
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

  function currentCaptureJob(job) {
    var active=GM_getValue(ACTIVE_JOB_KEY,null),manual=GM_getValue(MANUAL_RUN_KEY,null);
    return Boolean(job&&active&&job.jobId===active.jobId&&job.doi===active.doi
      && (!manual || manual.completedAt || job.manualRunId===manual.id));
  }

  function assertBoundCaptureJob(job, sourceUrl) {
    var live = GM_getValue(ACTIVE_JOB_KEY, null);
    if (!currentCaptureJob(job) || !job.jobId || !live || live.jobId !== job.jobId || live.doi !== job.doi || job.captureVersion !== VERSION) {
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
    var figureJob = Boolean(job && (job.captureFigures === true || job.captureEvidence === true))
      || String(job && job.mediaNeed || '').indexOf('figures') >= 0
      || String(job && job.mediaNeed || '') === 'evidence'
      || String(job && job.state || '') === 'figure_gap';
    if (publisher === 'acs') return 'https://pubs.acs.org/doi/' + (figureJob ? 'full/' : '') + doi;
    if (publisher === 'wiley') return 'https://onlinelibrary.wiley.com/doi/' + (figureJob ? 'full/' : '') + doi;
    if (publisher === 'nature') return 'https://www.nature.com/articles/' + suffix;
    if (publisher === 'science') {
      // Missing-TOC work must stay on the public article landing route. The paired
      // scheduler may opportunistically want figures too, but forcing /doi/full/
      // for a TOC gap needlessly hits AAAS access control.
      return 'https://www.science.org/doi/' + (job && job.captureToc === true ? '' : (figureJob ? 'full/' : '')) + doi;
    }
    if (publisher === 'ccs') return 'https://www.chinesechemsoc.org/doi/' + (figureJob ? 'full/' : '') + doi;
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
  function summaryEvidenceUrgencyKey(doi) {
    return P + 'summary-evidence-urgent:' + normalizeDoi(doi);
  }
  function summaryEvidenceUrgency(doi) {
    var value=GM_getValue(summaryEvidenceUrgencyKey(doi),null);
    if(!value)return null;
    if(Number(value.expiresAt||0)<=Date.now()){
      GM_deleteValue(summaryEvidenceUrgencyKey(doi));
      return null;
    }
    return value;
  }
  function markSummaryEvidenceUrgency(doi) {
    var now=Date.now(), prior=summaryEvidenceUrgency(doi);
    GM_setValue(summaryEvidenceUrgencyKey(doi),{
      doi:normalizeDoi(doi),
      tocCapturedAt:Number(prior&&prior.tocCapturedAt||now),
      expiresAt:Number(prior&&prior.expiresAt||now+SUMMARY_EVIDENCE_SLA_MS)
    });
  }
  function clearSummaryEvidenceUrgency(doi) {
    GM_deleteValue(summaryEvidenceUrgencyKey(doi));
  }
  function hasActiveSummaryEvidenceUrgency() {
    try {
      var prefix=P+'summary-evidence-urgent:';
      return GM_listValues().some(function(key){
        key=String(key||'');
        if(key.indexOf(prefix)!==0)return false;
        return Boolean(summaryEvidenceUrgency(key.slice(prefix.length)));
      });
    } catch (_) {
      return false;
    }
  }
  function urgentEvidenceRetryEligible(prior, now) {
    if(!prior)return true;
    if(prior.status==='success')return false;
    var elapsed=now-Date.parse(prior.finishedAt||0);
    var count=Math.max(1,Number(prior.retryCount||1));
    if(count>=4)return false;
    return elapsed>=Math.min(20,count*5)*60*1000;
  }
  function publisherAccessCooldownKey(publisher) {
    return PUBLISHER_ACCESS_COOLDOWN_PREFIX + String(publisher || '').toLowerCase();
  }

  function markPublisherAccessCooldown(job, reason) {
    var publisher = String(job && job.publisher || publisherForDoi(normalizeDoi(job && job.doi))).toLowerCase();
    if (!publisher) return null;
    var row = {
      publisher: publisher,
      doi: normalizeDoi(job && job.doi),
      reason: String(reason || 'publisher_access_gate').slice(0,80),
      at: Date.now(),
      until: Date.now() + PUBLISHER_ACCESS_COOLDOWN_MS
    };
    GM_setValue(publisherAccessCooldownKey(publisher), row);
    return row;
  }

  function publisherAccessCooling(job) {
    var publisher = String(job && job.publisher || publisherForDoi(normalizeDoi(job && job.doi))).toLowerCase();
    if (!publisher) return false;
    var key = publisherAccessCooldownKey(publisher);
    var row = GM_getValue(key, null);
    if (!row || Number(row.until || 0) <= Date.now()) {
      if (row) GM_deleteValue(key);
      return false;
    }
    return true;
  }

  function publisherDispatchKey(publisher) {
    return PUBLISHER_LAST_DISPATCH_PREFIX + String(publisher || '').toLowerCase();
  }

  function markPublisherDispatch(job) {
    var publisher = String(job && job.publisher || publisherForDoi(normalizeDoi(job && job.doi))).toLowerCase();
    if (!publisher) return;
    GM_setValue(publisherDispatchKey(publisher), { at: Date.now(), doi: normalizeDoi(job && job.doi) });
  }

  function publisherPacingCooling(job) {
    var publisher = String(job && job.publisher || publisherForDoi(normalizeDoi(job && job.doi))).toLowerCase();
    if (publisher !== 'science') return false;
    var last = GM_getValue(publisherDispatchKey(publisher), null);
    return Boolean(last && Number(last.at || 0) > 0 && Date.now() - Number(last.at) < SCIENCE_MIN_DISPATCH_GAP_MS);
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
    if(job && job.summaryUrgent===true)return false;
    var failed = GM_getValue(failureKey(doi, jobKind(job)), null);
    if (!failed || Number(failed.at || 0) <= 0) return false;
    if (String(failed.engineRevision || '') !== FAILURE_ENGINE_REVISION) return false;
    var reason = String(failed.reason || '');
    var publisher = String(job && job.publisher || publisherForDoi(doi));
    // 2.2.33 fixes Wiley GA discovery. Do not preserve a stale pre-fix no-TOC cooldown.
    if (publisher === 'wiley' && jobKind(job) === 'toc' && /(?:no_toc|toc.*not_found|not_found)/i.test(reason)) return false;
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
      controllerState:controllerLifecycleSnapshot(),
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
    if (!currentCaptureJob(job)) return null;
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

  function isNatureScienceFamilyJob(job) {
    var journal = String(job && job.journal || '').trim();
    return journal === 'Nature' || journal === 'Science'
      || /^Nature\s+/i.test(journal) || /^Science\s+/i.test(journal);
  }

  function captureQueueTier(job, latestAddedDate) {
    var isLatest = Boolean(latestAddedDate && String(job && job.addedDate || '') === String(latestAddedDate));
    // The latest Gallery additions are an article cohort, not only a TOC class.
    // Their missing figures/evidence must not be displaced by historical TOCs.
    if (isLatest) return -4;
    if (job && job.captureToc === true) {
      if (isNatureScienceFamilyJob(job)) return -3;
      return -2;
    }
    if (job && job.summaryUrgent === true) return -1;
    if (job && (String(job.state || '') === 'figure_gap' || String(job.mediaNeed || '') === 'figures')) return 2;
    if (String(job && job.mediaNeed || '') === 'evidence') return 3;
    return 4;
  }

  function queueRegistryChanged(a,b) {
    if (String(a.latestAddedDate||'')!==String(b.latestAddedDate||'')) return true;
    function identity(q) {
      return (q.articles||[]).map(function(x){return normalizeDoi(x.doi)+'|'+String(x.addedDate||'')+'|'+String(x.date||'')+'|'+String(x.journal||'');}).sort().join('\n');
    }
    return identity(a)!==identity(b);
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
      if (publisherAccessCooling(job) || publisherPacingCooling(job)) return;
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

  function controllerTransportUrl(value) {
    try {
      var host = new URL(String(value || ''), location.href).hostname.toLowerCase();
      return host === 'api.gczhouwld.com'
        || host === 'organic-synthesis-gallery.zhou526316.workers.dev'
        || host === 'gallery.gczhouwld.com'
        || host === 'zhou526316-sys.github.io';
    } catch (_) { return false; }
  }

  async function nativeControllerRequest(options) {
    var abort = new AbortController();
    var timeoutMs = Math.max(1000, Number(options && options.timeout || 45000));
    var timer = setTimeout(function () { abort.abort(); }, timeoutMs);
    try {
      var method = String(options && options.method || 'GET').toUpperCase();
      var headers = Object.assign({}, options && options.headers || {});
      // cache-control/pragma are not needed for native fetch (cache:'no-store'
      // already covers that) and would force a CORS preflight header that the
      // Worker intentionally does not allow.
      Object.keys(headers).forEach(function (key) {
        var lower = String(key).toLowerCase();
        if (lower === 'cache-control' || lower === 'pragma') delete headers[key];
      });
      var init = {
        method: method,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: abort.signal,
        headers: headers
      };
      if (method !== 'GET' && method !== 'HEAD' && options && options.data != null) init.body = options.data;
      var response = await fetch(String(options.url), init);
      var responseText = await response.text();
      var responseHeaders = '';
      try {
        response.headers.forEach(function (value, key) { responseHeaders += key + ': ' + value + '\r\n'; });
      } catch (_) {}
      return {
        status: response.status,
        statusText: response.statusText,
        responseText: responseText,
        response: responseText,
        responseHeaders: responseHeaders,
        finalUrl: response.url || String(options.url)
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function gmRequest(options) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function rejectOnce(error) {
        if (settled) return;
        settled = true;
        reject(error);
      }
      function resolveOnce(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      function fallbackOrReject(gmError) {
        if (settled) return;
        if (/Request was blocked by the user|Refused to connect.*blocked/i.test(String(gmError && gmError.message || ''))) { rejectOnce(gmError); return; }
        var canFallback = controllerTransportUrl(options && options.url)
          && !(options && options.responseType && options.responseType !== 'text');
        if (!canFallback) {
          rejectOnce(gmError);
          return;
        }
        // Controller/API traffic may use normal fetch when the extension transport
        // is unavailable. Publisher image acquisition remains GM-only.
        nativeControllerRequest(options).then(resolveOnce).catch(function (fetchError) {
          var failure = new Error(
            'gm_then_fetch_failed:' +
            String(gmError && gmError.message || gmError || 'gm_unknown') +
            ';fetch:' + String(fetchError && fetchError.message || fetchError || 'unknown')
          );
          failure.controllerFallbackTried=true;
          rejectOnce(failure);
        });
      }
      try {
        GM_xmlhttpRequest(Object.assign({}, options, {
          onload: resolveOnce,
          onerror: function (error) {
            fallbackOrReject(new Error('gm_request_error:' + String(error && (error.error || error.statusText || error.status) || 'unknown')));
          },
          ontimeout: function () { fallbackOrReject(new Error('gm_request_timeout')); },
          onabort: function () { rejectOnce(new Error('gm_request_aborted')); }
        }));
      } catch (error) {
        fallbackOrReject(new Error('gm_request_exception:' + String(error && error.message || error || 'unknown')));
      }
    });
  }

  async function metadataJson(options,prefix) {
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

  // BEGIN ARCHITECTURE MEMBERSHIP CORE v1
  function architectureStable(value) {
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(architectureStable).join(',')+']';
    return '{'+Object.keys(value).sort().map(function(key){return JSON.stringify(key)+':'+architectureStable(value[key]);}).join(',')+'}';
  }
  async function architectureSha256(text) {
    if(!globalThis.crypto||!globalThis.crypto.subtle)throw new Error('architecture_crypto_unavailable');
    var bytes=new TextEncoder().encode(String(text));
    var hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(hash)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');
  }
  function architectureRefValid(ref) {
    return Boolean(ref&&typeof ref.path==='string'&&/^[A-Za-z0-9_./-]+$/.test(ref.path)&&ref.path.indexOf('..')<0
      &&/^[a-f0-9]{64}$/.test(String(ref.sha256||''))&&Number.isSafeInteger(Number(ref.bytes))&&Number(ref.bytes)>=0);
  }
  function architectureSetEqual(a,b) {
    if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
    var left=new Set(a),right=new Set(b);
    return left.size===a.length&&right.size===b.length&&a.every(function(x){return right.has(x);});
  }
  function architectureParseDate(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    var p=value.split('-').map(Number),year=p[0],month=p[1],day=p[2];
    var leap=year%4===0&&(year%100!==0||year%400===0);
    var days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    return year>=1&&month>=1&&month<=12&&day>=1&&day<=days[month-1]?{year:year,month:month,day:day}:null;
  }
  function architectureFormatDate(year,month,day) {
    return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  }
  function architectureCutoff(asOfDate) {
    var p=architectureParseDate(asOfDate);
    if(!p)throw new Error('architecture_invalid_as_of_date');
    var index=p.year*12+p.month-1-3,year=Math.floor(index/12),month=index%12+1,day=p.day;
    if(year<1)throw new Error('architecture_unsupported_date');
    while(!architectureParseDate(architectureFormatDate(year,month,day)))day--;
    return architectureFormatDate(year,month,day);
  }
  function architectureShiftDays(value,offset) {
    var p=architectureParseDate(value);
    if(!p||!Number.isSafeInteger(offset))throw new Error('architecture_invalid_day_shift');
    var d=new Date(0);d.setUTCFullYear(p.year,p.month-1,p.day);d.setUTCHours(12,0,0,0);d.setUTCDate(d.getUTCDate()+offset);
    return d.toISOString().slice(0,10);
  }
  function architectureBeijingDate(epochMs) {
    if(!Number.isFinite(epochMs))throw new Error('architecture_trusted_time_required');
    return new Date(epochMs+8*3600000).toISOString().slice(0,10);
  }
  function architectureAcquisitionReason(row,asOfDate) {
    if(!row||row.datePrecision!=='day'||!architectureParseDate(row.firstOnlineDate))return 'date_review_required';
    if(row.firstOnlineDate>asOfDate)return 'future';
    if(row.firstOnlineDate>=architectureCutoff(asOfDate))return 'hot';
    var recent=architectureShiftDays(asOfDate,-6);
    if(architectureParseDate(row.addedDate)&&row.addedDate>=recent&&row.addedDate<=asOfDate)return 'archive_recent_addition';
    return 'archive_idle';
  }
  async function verifyArchitectureMembershipPayload(queue,delivery,releaseText,membershipText,currentText,lifecycleText,acquisitionText,trustedEpochMs) {
    if(!queue||!Array.isArray(queue.articles)||queue.articles.length!==Number(queue.webpageDoiCount))throw new Error('architecture_queue_registry_incomplete');
    if(!delivery||Number(delivery.schemaVersion)<2||!delivery.files||!delivery.architectureObjects
      ||typeof delivery.architectureCatalogId!=='string')throw new Error('architecture_delivery_v2_required');
    var releaseHash=await architectureSha256(releaseText);
    if(delivery.files['architecture-v1/release.json']!==releaseHash)throw new Error('architecture_release_delivery_hash_mismatch');
    var release=JSON.parse(releaseText);
    if(release.schema!=='gallery-architecture-public-v1'||release.productionActivation!==false
      ||release.sourceCommit!==delivery.sourceCommit||release.publicationSlot!==delivery.publicationSlot
      ||release.datasetSha256!==delivery.datasetSha256||release.catalogId!==delivery.architectureCatalogId
      ||release.recordCount!==Number(delivery.productionCards))throw new Error('architecture_release_identity_mismatch');
    if(!architectureRefValid(release.membership)||!architectureRefValid(release.catalogCurrent)
      ||!architectureRefValid(release.acquisitionBasis))throw new Error('architecture_release_reference_invalid');
    if(await architectureSha256(membershipText)!==release.membership.sha256
      ||new TextEncoder().encode(membershipText).byteLength!==Number(release.membership.bytes))throw new Error('architecture_membership_hash_mismatch');
    if(await architectureSha256(currentText)!==release.catalogCurrent.sha256
      ||new TextEncoder().encode(currentText).byteLength!==Number(release.catalogCurrent.bytes))throw new Error('architecture_current_hash_mismatch');
    if(await architectureSha256(acquisitionText)!==release.acquisitionBasis.sha256
      ||new TextEncoder().encode(acquisitionText).byteLength!==Number(release.acquisitionBasis.bytes))throw new Error('architecture_acquisition_hash_mismatch');
    var membership=JSON.parse(membershipText),current=JSON.parse(currentText),acquisition=JSON.parse(acquisitionText);
    if(membership.schema!=='gallery-published-membership-v1'||membership.scope!=='all-time'||membership.complete!==true
      ||membership.catalogId!==release.catalogId||membership.doiSetHash!==release.doiSetHash
      ||membership.publicationSlot!==release.publicationSlot||membership.sourceCommit!==release.sourceCommit
      ||Number(membership.count)!==release.recordCount||!membership.members||Array.isArray(membership.members))throw new Error('architecture_membership_identity_mismatch');
    if(acquisition.schema!=='gallery-acquisition-basis-v1'||acquisition.catalogId!==release.catalogId
      ||acquisition.doiSetHash!==release.doiSetHash||acquisition.publicationSlot!==release.publicationSlot
      ||Number(acquisition.count)!==release.recordCount||!Array.isArray(acquisition.records))throw new Error('architecture_acquisition_identity_mismatch');
    if(current.schema!=='gallery-shadow-catalog-v1'||current.mode!=='shadow'||current.productionActivation!==false
      ||!architectureRefValid(current.lifecycle))throw new Error('architecture_current_identity_mismatch');
    if(await architectureSha256(lifecycleText)!==current.lifecycle.sha256
      ||new TextEncoder().encode(lifecycleText).byteLength!==Number(current.lifecycle.bytes))throw new Error('architecture_lifecycle_hash_mismatch');
    var lifecycle=JSON.parse(lifecycleText);
    if(lifecycle.schema!=='gallery-shadow-catalog-v1'||lifecycle.catalog!==current.catalog.path
      ||typeof lifecycle.asOfDate!=='string'||!lifecycle.partitions)throw new Error('architecture_lifecycle_identity_mismatch');
    var queueDois=queue.articles.map(function(row){return normalizeDoi(row&&row.doi);});
    var memberDois=Object.keys(membership.members).map(normalizeDoi);
    if(queueDois.some(function(x){return !x;})||memberDois.some(function(x){return !x;})
      ||!architectureSetEqual(queueDois,memberDois))throw new Error('architecture_membership_queue_mismatch');
    var partitionNames=['hot','archive','date_unknown','date_invalid','future'],partitionDois=[];
    partitionNames.forEach(function(name){
      var rows=lifecycle.partitions[name];
      if(!Array.isArray(rows))throw new Error('architecture_lifecycle_partition_missing:'+name);
      rows.forEach(function(doi){partitionDois.push(normalizeDoi(doi));});
    });
    if(partitionDois.some(function(x){return !x;})||!architectureSetEqual(memberDois,partitionDois))throw new Error('architecture_lifecycle_partition_mismatch');
    var acquisitionDois=[],seen=new Set(),active=[],liveHot=[],recent=[],archiveIdle=[],dateReview=[];
    var liveAsOfDate=architectureBeijingDate(Number(trustedEpochMs)),liveCutoff=architectureCutoff(liveAsOfDate);
    if(lifecycle.asOfDate>liveAsOfDate)throw new Error('architecture_lifecycle_from_future');
    acquisition.records.forEach(function(row){
      var doi=normalizeDoi(row&&row.doi);
      if(!doi||seen.has(doi)||membership.members[doi]!==row.revision)throw new Error('architecture_acquisition_member_mismatch');
      seen.add(doi);acquisitionDois.push(doi);
      var reason=architectureAcquisitionReason(row,liveAsOfDate);
      if(reason==='hot'){active.push(doi);liveHot.push(doi);}
      else if(reason==='archive_recent_addition'){active.push(doi);recent.push(doi);}
      else if(reason==='archive_idle')archiveIdle.push(doi);
      else dateReview.push(doi);
    });
    if(!architectureSetEqual(memberDois,acquisitionDois))throw new Error('architecture_acquisition_set_mismatch');
    var hot=new Set((lifecycle.partitions.hot||[]).map(normalizeDoi));
    var archive=new Set((lifecycle.partitions.archive||[]).map(normalizeDoi));
    if(lifecycle.asOfDate===liveAsOfDate&&!architectureSetEqual(Array.from(hot),liveHot))throw new Error('architecture_live_hot_snapshot_mismatch');
    return {
      ok:true,revision:ARCHITECTURE_MEMBERSHIP_REVISION,serial:Number(membership.serial||0),
      publicationSlot:membership.publicationSlot,catalogId:membership.catalogId,membershipSha256:release.membership.sha256,
      asOfDate:lifecycle.asOfDate,cutoff:lifecycle.cutoff||'',liveAsOfDate:liveAsOfDate,liveCutoff:liveCutoff,memberCount:memberDois.length,
      hotCount:hot.size,archiveCount:archive.size,hotDois:Array.from(hot),archiveDois:Array.from(archive),
      activeCount:active.length,archiveIdleCount:archiveIdle.length,recentAdditionCount:recent.length,dateReviewCount:dateReview.length,
      activeDois:active,recentAdditionDois:recent,archiveIdleDois:archiveIdle,dateReviewDois:dateReview,
      withdrawn:Array.isArray(membership.withdrawn)?membership.withdrawn.map(normalizeDoi).filter(Boolean):[]
    };
  }
  // END ARCHITECTURE MEMBERSHIP CORE v1

  async function architectureGetDocument(url,prefix) {
    var response=await gmRequest({method:'GET',url:url,timeout:30000,headers:{'cache-control':'no-cache',pragma:'no-cache'}});
    if(shouldNativeRetryUpload(response,url))response=await nativeControllerRequest({method:'GET',url:url,timeout:30000,headers:{'cache-control':'no-cache',pragma:'no-cache'}});
    var status=Number(response.status||0);
    if(status<200||status>=300)throw new Error(prefix+'_http_'+status);
    var finalUrl=String(response.finalUrl||url),host='';
    try{host=new URL(finalUrl,location.href).hostname.toLowerCase();}catch(_){}
    if(host!==GALLERY_HOST&&host!==LEGACY_GALLERY_HOST)throw new Error(prefix+'_unexpected_origin');
    var serverDate=Date.parse(headerValue(response.responseHeaders,'date')||'');
    return {text:String(response.responseText||''),serverDate:Number.isFinite(serverDate)?serverDate:null};
  }
  async function architectureGetText(url,prefix) {
    return (await architectureGetDocument(url,prefix)).text;
  }
  function architectureObjectUrl(pathname) {
    if(typeof pathname!=='string'||!/^[A-Za-z0-9_./-]+$/.test(pathname)||pathname.indexOf('..')>=0)throw new Error('architecture_object_path_invalid');
    return 'https://'+GALLERY_HOST+'/architecture-v1/'+pathname;
  }
  function architectureMembershipSummary(result) {
    return result&&result.ok?{
      ok:true,revision:result.revision,serial:result.serial,publicationSlot:result.publicationSlot,catalogId:result.catalogId,
      liveAsOfDate:result.liveAsOfDate,liveCutoff:result.liveCutoff,memberCount:result.memberCount,
      hotCount:result.hotCount,archiveCount:result.archiveCount,activeCount:result.activeCount,
      archiveIdleCount:result.archiveIdleCount,recentAdditionCount:result.recentAdditionCount,dateReviewCount:result.dateReviewCount
    }:{ok:false,revision:ARCHITECTURE_MEMBERSHIP_REVISION,error:String(result&&result.error||'architecture_membership_unverified').slice(0,180)};
  }
  function architectureActiveSet(result) {
    if(!result||result.ok!==true||!Array.isArray(result.activeDois))throw new Error('architecture_active_work_unverified');
    return new Set(result.activeDois.map(normalizeDoi).filter(Boolean));
  }
  function architectureActiveSetChanged(a,b) {
    if(!a||!b||a.ok!==true||b.ok!==true)return true;
    if(a.catalogId!==b.catalogId||a.liveAsOfDate!==b.liveAsOfDate||Number(a.activeCount)!==Number(b.activeCount))return true;
    return !architectureSetEqual(a.activeDois||[],b.activeDois||[]);
  }
  function rememberArchitectureMembership(result) {
    var prior=GM_getValue(ARCHITECTURE_MEMBERSHIP_STATE_KEY,null);
    if(prior&&Number(prior.serial||0)>Number(result.serial||0))throw new Error('architecture_membership_serial_rollback');
    if(prior&&Number(prior.serial||0)===Number(result.serial||0)
      && prior.membershipSha256&&prior.membershipSha256!==result.membershipSha256)throw new Error('architecture_membership_serial_conflict');
    var sticky=new Set((prior&&Array.isArray(prior.withdrawn)?prior.withdrawn:[]).concat(result.withdrawn||[]).map(normalizeDoi).filter(Boolean));
    (result.hotDois||[]).concat(result.archiveDois||[]).forEach(function(doi){
      if(sticky.has(doi))throw new Error('architecture_withdrawn_doi_resurrection');
    });
    GM_setValue(ARCHITECTURE_MEMBERSHIP_STATE_KEY,{
      revision:ARCHITECTURE_MEMBERSHIP_REVISION,serial:Number(result.serial||0),publicationSlot:result.publicationSlot||'',
      catalogId:result.catalogId||'',membershipSha256:result.membershipSha256||'',asOfDate:result.asOfDate||'',
      liveAsOfDate:result.liveAsOfDate||'',liveCutoff:result.liveCutoff||'',memberCount:Number(result.memberCount||0),
      hotCount:Number(result.hotCount||0),archiveCount:Number(result.archiveCount||0),activeCount:Number(result.activeCount||0),
      archiveIdleCount:Number(result.archiveIdleCount||0),recentAdditionCount:Number(result.recentAdditionCount||0),
      dateReviewCount:Number(result.dateReviewCount||0),withdrawn:Array.from(sticky).sort(),verifiedAt:Date.now()
    });
  }
  async function observeArchitectureMembership(queue) {
    try {
      var deliveryDocument=await architectureGetDocument(ARCHITECTURE_DELIVERY_URL+'?architecture-membership='+Date.now(),'architecture_delivery');
      if(!Number.isFinite(deliveryDocument.serverDate))throw new Error('architecture_server_date_missing');
      var delivery=JSON.parse(deliveryDocument.text);
      var releaseText=await architectureGetText(ARCHITECTURE_RELEASE_URL+'?architecture-membership='+Date.now(),'architecture_release');
      var release=JSON.parse(releaseText);
      if(!architectureRefValid(release.membership)||!architectureRefValid(release.catalogCurrent)
        ||!architectureRefValid(release.acquisitionBasis))throw new Error('architecture_release_reference_invalid');
      var membershipText=await architectureGetText(architectureObjectUrl(release.membership.path)+'?architecture-membership='+Date.now(),'architecture_membership');
      var acquisitionText=await architectureGetText(architectureObjectUrl(release.acquisitionBasis.path)+'?architecture-membership='+Date.now(),'architecture_acquisition');
      var currentText=await architectureGetText(architectureObjectUrl(release.catalogCurrent.path)+'?architecture-membership='+Date.now(),'architecture_current');
      var current=JSON.parse(currentText);
      if(!architectureRefValid(current.lifecycle))throw new Error('architecture_lifecycle_reference_invalid');
      var lifecycleText=await architectureGetText(architectureObjectUrl(current.lifecycle.path)+'?architecture-membership='+Date.now(),'architecture_lifecycle');
      var result=await verifyArchitectureMembershipPayload(queue,delivery,releaseText,membershipText,currentText,lifecycleText,acquisitionText,deliveryDocument.serverDate);
      rememberArchitectureMembership(result);
      return result;
    } catch(error) {
      return {ok:false,revision:ARCHITECTURE_MEMBERSHIP_REVISION,error:String(error&&error.message||error).slice(0,180)};
    }
  }

  async function getPrivateJson(url,token) {
    return metadataJson({method:'GET',url:url,timeout:30000,headers:{'cache-control':'no-cache',pragma:'no-cache',authorization:'Bearer '+String(token||'')}},'private');
  }
  async function postReadJson(url,payload) {
    return metadataJson({method:'POST',url:url,timeout:45000,headers:{'content-type':'application/json','cache-control':'no-cache',pragma:'no-cache'},data:JSON.stringify(payload||{})},'inventory');
  }

  function productionMediaSnapshot(inventory) {
    var items={};
    (inventory&&Array.isArray(inventory.items)?inventory.items:[]).forEach(function(row){
      var doi=normalizeDoi(row&&row.doi);
      if(!doi)return;
      var primaryKind=String(row&&row.primaryKind||'').toLowerCase();
      var largeSource=String(row&&row.largeSource||'').toLowerCase();
      var officialPrimary=primaryKind==='official_visual';
      // Worker /api/toc serves a verified Nature/Science Figure 1 as the card
      // fallback even when there is no toc_assets row. Mirror that authority here
      // so the scheduler does not reopen an already-covered historical paper forever.
      var figureOneFallback=primaryKind==='figure1'
        || (Boolean(row&&row.figureOneStored) && largeSource==='figure1');
      var visualAvailable=Boolean(row&&row.tocStored)||officialPrimary||figureOneFallback;
      var visualReason=figureOneFallback
        ? 'figure1_fallback'
        : officialPrimary
          ? 'primary_official_visual'
          : String(row&&row.tocReason||'');
      items[doi]={
        doi:doi,
        toc:{
          available:visualAvailable,
          imageUrl:visualAvailable?'production_visual_present':'',
          reason:visualReason
        },
        figures:{available:Number(row&&row.figureCount||0)>0,figures:[]},
        primaryKind:primaryKind,
        largeSource:largeSource,
        inventory:row
      };
    });
    return {version:3,generatedAt:Number(inventory&&inventory.generatedAt||Date.now()),source:'worker_production_inventory',items:items};
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
      if (gmError && gmError.controllerFallbackTried) throw gmError;
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
    if (shouldNativeRetryUpload(response,url)) {
      // Same endpoint, same bytes and idempotent receipt validation. Only retry a
      // gateway markup error; never bypass 401/403/429, JSON errors or Retry-After.
      return await fetchPostJson(url,payload,token);
    }
    if (status < 200 || status >= 300) throw uploadResponseError(status, body, raw, function (h) { return headerValue(response.responseHeaders, h); }, 'gm_request');
    return body;
  }

  function shouldNativeRetryUpload(response,url) {
    var status=Number(response && response.status || 0);
    var raw=String(response && response.responseText || '').trim();
    var target; try { target=new URL(url); } catch (_) { return false; }
    var owned=target.protocol==='https:' && ['api.gczhouwld.com','organic-synthesis-gallery.zhou526316.workers.dev'].indexOf(target.hostname)>=0;
    return owned && [502,503,504].indexOf(status)>=0
      && /^(?:<!doctype\s+html|<html|<head|<body)/i.test(raw)
      && !headerValue(response.responseHeaders,'retry-after');
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
      assertBoundCaptureJob(job, candidate.url);
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
      if(job.publisher==='wiley')context=wileyBodyFigureContext(node,context);
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
    if(job.publisher==='wiley'&&!rows.length)pushTrace(trace,{stage:'figure_discovery',event:'wiley_dom_shape',status:'none',message:'images='+scope.querySelectorAll('img,object[type^="image"]').length+';figureBlocks='+scope.querySelectorAll('figure,[role="figure"],.article-section__figure').length+';numberedHeadings='+Array.from(scope.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')).filter(function(n){return /^(?:Fig(?:ure)?\.?|Scheme|Chart)\s*\d+[a-z]?\b/i.test(String(n.textContent||'').trim());}).length});
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

  function wileyGaHeadingText(value) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    return /^(?:graphical|visual)\s+abstract(?:\s*[:\-–—].*)?$/i.test(text)
      || /^table\s+of\s+contents(?:\s+(?:graphic|image))?(?:\s*[:\-–—].*)?$/i.test(text);
  }

  function wileyGaUrlSignal(value) {
    return /-gra-\d+(?:[-_.]|$)|graphical[-_\s]*abstract|visual[-_\s]*abstract|(?:^|[\/_-])(?:ga|fx)0*1(?:[-_.]|$)/i.test(String(value || ''));
  }

  function wileyAssetHostAllowed(value) {
    try {
      var host = new URL(String(value || ''), location.href).hostname.toLowerCase();
      return host === 'wiley.com' || host.endsWith('.wiley.com')
        || host === 'wiley.com.cn' || host.endsWith('.wiley.com.cn');
    } catch (_) {
      return false;
    }
  }

  function wileyGraphicalAbstractCandidates(job, root, baseUrl) {
    if (String(job && job.publisher || publisherForDoi(normalizeDoi(job && job.doi))) !== 'wiley') return [];
    var scope = root || document;
    var base = baseUrl || location.href;
    var rows = [], seen = new Map();

    function excluded(node) {
      return Boolean(node && node.closest && node.closest(
        'aside,nav,header,footer,[class*="recommend" i],[class*="related" i],[id*="related" i],[class*="reference" i],[class*="citation" i],[class*="advert" i]'
      ));
    }

    function add(url, node, source, score, text) {
      url = normalizeUrl(url, base);
      if (!url || !wileyAssetHostAllowed(url) || !candidateBelongsToJob(url, job) || reject(text, url)) return;
      var row = {
        url: url,
        kind: 'official',
        assetType: 'graphical_abstract',
        score: score,
        text: String(text || 'Graphical Abstract').slice(0, 1000),
        source: source,
        element: node && node.tagName && node.tagName.toLowerCase() === 'img' ? node : null
      };
      var old = seen.get(mediaUrlIdentity(url, base));
      if (!old || row.score > old.score) seen.set(mediaUrlIdentity(url, base), row);
    }

    function urlsFor(node) {
      return Array.from(new Set(
        articleFigureImageUrls(node, base).concat(imageUrls(node, base))
      )).filter(Boolean);
    }

    function scanExactContainer(container, headingText) {
      if (!container || excluded(container) || !container.querySelectorAll) return;
      var nodes = Array.from(container.querySelectorAll('img,source,object[type^="image"]')).filter(function(node) {
        return !excluded(node);
      });
      var strong = [];
      var all = [];
      nodes.forEach(function(node) {
        urlsFor(node).forEach(function(url) {
          if (!/\.(?:svg|png|jpe?g|webp|gif)(?:[?#]|$)/i.test(url)) return;
          if (!wileyAssetHostAllowed(url) || !candidateBelongsToJob(url, job)) return;
          all.push({url:url,node:node});
          if (wileyGaUrlSignal(url)) strong.push({url:url,node:node});
        });
      });
      if (strong.length) {
        strong.forEach(function(item, index) {
          add(item.url, item.node, 'wiley_ga_labeled_section_url', 940 - index, headingText);
        });
        return;
      }
      var byIdentity = new Map();
      all.forEach(function(item) {
        var key = mediaUrlIdentity(item.url, base);
        if (key && !byIdentity.has(key)) byIdentity.set(key, item);
      });
      if (byIdentity.size === 1) {
        var only = Array.from(byIdentity.values())[0];
        add(only.url, only.node, 'wiley_ga_labeled_section_single_image', 900, headingText);
      }
    }

    if (scope.querySelectorAll) {
      scope.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],.article-section__title,.section__title').forEach(function(heading) {
        var headingText = String(heading.textContent || '').replace(/\s+/g, ' ').trim();
        if (!wileyGaHeadingText(headingText) || excluded(heading)) return;
        var container = heading.closest('section,[class*="article-section"],[class*="graphical"],[class*="abstract"]') || heading.parentElement;
        scanExactContainer(container, headingText);
        var sibling = heading.nextElementSibling;
        for (var i = 0; sibling && i < 2; i += 1, sibling = sibling.nextElementSibling) {
          if (/^H[1-6]$/.test(String(sibling.tagName || ''))) break;
          scanExactContainer(sibling, headingText);
        }
      });

      var articleScope = scope.querySelector('article,[role="main"],main') || scope;
      if (articleScope && articleScope.querySelectorAll) {
        articleScope.querySelectorAll('img,source,object[type^="image"]').forEach(function(node) {
          if (excluded(node)) return;
          urlsFor(node).forEach(function(url, index) {
            if (!wileyGaUrlSignal(url)) return;
            add(url, node, 'wiley_ga_strong_asset_url', 820 - index, 'Graphical Abstract');
          });
        });
      }
    }

    // Wiley sometimes keeps the GA only in article-scoped embedded JSON rather than
    // a rendered <img>. Scan only script payloads that also contain the active DOI
    // (or its suffix), and still require an explicit -gra- / graphical-abstract URL
    // on an official Wiley host. This avoids inheriting GA images from related cards.
    var activeDoi = normalizeDoi(job && job.doi);
    var activeSuffix = activeDoi ? activeDoi.split('/').pop() : '';
    if (scope.querySelectorAll && activeDoi) {
      scope.querySelectorAll('script').forEach(function(script) {
        var raw = String(script.textContent || '');
        if (!raw || raw.length > 2000000) return;
        var decoded = raw.replace(/\\u002f/gi,'/').replace(/\\\//g,'/');
        var lower = decoded.toLowerCase();
        if (lower.indexOf(activeDoi) < 0 && (!activeSuffix || lower.indexOf(activeSuffix) < 0)) return;
        var matches = [];
        var absolutePattern = /https?:\/\/[^"'<>\s]+/gi;
        var absolute;
        while ((absolute = absolutePattern.exec(decoded))) {
          var absoluteUrl = normalizeUrl(absolute[0], base);
          if (!absoluteUrl || !wileyAssetHostAllowed(absoluteUrl)) continue;
          try { if (new URL(absoluteUrl).pathname.indexOf('/cms/asset/') < 0) continue; } catch (_) { continue; }
          matches.push({raw:absolute[0],url:absoluteUrl,index:absolute.index,end:absolutePattern.lastIndex});
        }
        var relativePattern = /(?:^|[^A-Za-z0-9._~:\/-])(\/cms\/asset\/[^"'<>\s]+)/gi;
        var relative;
        while ((relative = relativePattern.exec(decoded))) {
          var relativeUrl = normalizeUrl(relative[1], base);
          if (!relativeUrl || !wileyAssetHostAllowed(relativeUrl)) continue;
          matches.push({raw:relative[1],url:relativeUrl,index:relative.index,end:relativePattern.lastIndex});
        }
        matches.forEach(function(match) {
          var candidateUrl = match.url;
          if (!wileyGaUrlSignal(candidateUrl)) return;
          var context = decoded.slice(Math.max(0, match.index - 2200), Math.min(decoded.length, match.end + 2200));
          var contextLower = context.toLowerCase();
          if (contextLower.indexOf(activeDoi) < 0 && (!activeSuffix || contextLower.indexOf(activeSuffix) < 0)) return;
          add(candidateUrl, null, 'wiley_ga_embedded_article_data', 880, 'Graphical Abstract');
        });
      });
    }

    rows = Array.from(seen.values()).sort(function(a, b) { return b.score - a.score; });
    return rows;
  }

  function natureDeterministicFigureOneCandidates(job) {
    if (String(job && job.publisher || '') !== 'nature' || job.allowFigureOne === false) return [];
    var doi = normalizeDoi(job && job.doi);
    var m = /^10\.1038\/s(\d+)-(\d{3})-(\d+)-[a-z0-9]+$/i.exec(doi);
    if (!m) return [];
    var journalId = m[1], year = 2000 + Number(m[2]), articleId = String(Number(m[3]));
    if (!journalId || !year || !articleId) return [];
    var stem = 'springer-static/image/art%3A10.1038%2F' + encodeURIComponent(doi.split('/')[1])
      + '/MediaObjects/' + journalId + '_' + year + '_' + articleId + '_Fig1_HTML.png';
    return [
      'https://media.springernature.com/lw685/' + stem,
      'https://media.springernature.com/full/' + stem,
      'https://media.springernature.com/m685/' + stem
    ].map(function(url,index){
      return {url:url,kind:'figure1',assetType:'figure1_fallback',score:145-index,text:'Figure 1',source:'nature_deterministic_figure1',element:null};
    });
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
    if (String(job && job.publisher || '') === 'wiley') {
      wileyGraphicalAbstractCandidates(job, scope, baseUrl || location.href).forEach(add);
    }
    if (String(job && job.publisher || '') === 'nature') {
      natureDeterministicFigureOneCandidates(job).forEach(add);
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
      // Deliberately no hidden Science iframe fallbacks. They duplicate document
      // requests and have not recovered TOCs in current diagnostics.
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
    var citation = String((document.querySelector('meta[name="citation_doi"]') || {}).content || '').toLowerCase();
    var canonical = String((document.querySelector('link[rel="canonical"]') || {}).href || '').toLowerCase();
    var doi = normalizeDoi(job.doi);
    var suffix = doi.split('/').pop() || doi;
    var doiMatch = citation.indexOf(doi) >= 0 || canonical.indexOf(doi) >= 0 || href.toLowerCase().indexOf(suffix.toLowerCase()) >= 0;
    var meaningfulArticle = doiMatch && text.length >= 900;
    var gateText = title + '\n' + text.slice(0, 16000);
    // Science/AAAS may expose some article text behind an explicit "Check access"
    // overlay. That gate must win over text length; otherwise the page looks loaded
    // and the controller repeatedly scans a document that cannot expose its media.
    var accessGate = /\b(?:check|checking|verify|verifying)\s+(?:your\s+)?access\b|\baccess\s+(?:check|verification)\b|please\s+(?:wait|stand by).{0,80}(?:access|verification)/i.test(gateText);
    // Publisher article pages often retain generic sign-in strings in navigation or
    // hidden DOM after access is already granted. Only explicit access gates remain
    // authoritative when a DOI-bound article body is otherwise meaningful.
    var challengeSignal = accessGate || /captcha|verify you are human|security check|access denied|challenge-platform|just a moment|unusual traffic|checking your browser/i.test(gateText);
    var authUrl = /(?:login|signin|sign-in|shibboleth|saml|openathens|wayf|\/idp\/)/i.test(href);
    var authText = /select (?:your )?institution|sign in via (?:your )?institution|log in via (?:your )?institution|access through (?:your )?institution|institutional login/i.test(gateText);
    var challenge = accessGate || (challengeSignal && !meaningfulArticle);
    var auth = authUrl || (authText && !meaningfulArticle);
    var shell = doiMatch && !challenge && !auth && text.length < 500;
    pushTrace(trace, {
      stage: 'page',
      event: 'state',
      status: challenge ? (accessGate ? 'access_gate' : 'challenge') : auth ? 'auth' : shell ? 'shell' : 'loaded',
      url: href,
      message: 'doiMatch=' + String(doiMatch) + ';textLength=' + String(text.length) + ';accessGate=' + String(accessGate)
    });
    return { challenge: challenge, accessGate: accessGate, auth: auth, shell: shell, doiMatch: doiMatch, textLength: text.length };
  }


  function evidenceCaptureEligible(job) {
    if (job && typeof job.captureEvidence === 'boolean') return job.captureEvidence;
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

  function evidenceArticleUrl(job) {
    // Evidence identity must use a DOI-bearing canonical URL. ACS Silverchair
    // article routes can be fully loaded while omitting the DOI from location.href.
    return articleUrl(job);
  }

  function evidenceSourceUrl() {
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
    var articleUrl = evidenceArticleUrl(job);
    var sourceUrl = evidenceSourceUrl();
    return {
      schemaVersion:EVIDENCE_SCHEMA_VERSION,
      doi:pageDoi,
      pageDoi:pageDoi,
      title:evidenceNormalizeText(job.title || (document.querySelector('h1')||{}).textContent || document.title || ''),
      journal:evidenceNormalizeText(job.journal || ''),
      publisher:job.publisher || publisherForDoi(pageDoi),
      articleUrl:articleUrl,
      sourceUrl:sourceUrl,
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
      captureLiveUpdate(job,'evidence_capture',{label:'文本'});
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
      var summaryReviewQueued=receipt.summaryReviewQueued===true;
      var summaryReviewQueueReason=String(receipt.summaryReviewQueueReason||'');
      pushTrace(trace,{stage:'evidence_capture',event:'stored',status:'success',url:location.href,message:'level='+level+';chars='+String(receipt.chars||packet._metrics.chars)+';sections='+String(receipt.sections||packet._metrics.sections)+';summaryQueued='+(summaryReviewQueued?'1':'0')+(summaryReviewQueueReason?';summaryReason='+summaryReviewQueueReason:'')});
      return {status:'stored',evidenceLevel:level,chars:Number(receipt.chars||packet._metrics.chars),sections:Number(receipt.sections||packet._metrics.sections),sourceHash:String(receipt.sourceHash||''),evidencePacketHash:String(receipt.evidencePacketHash||''),summaryReviewQueued:summaryReviewQueued,summaryReviewQueueReason:summaryReviewQueueReason};
    } catch (error) {
      pushTrace(trace,{stage:'evidence_capture',event:'failed',status:'failed',url:location.href,httpStatus:Number(error&&error.httpStatus||0),message:String(error&&error.message||error).slice(0,240)});
      return {status:'failed',reason:String(error&&error.message||error).slice(0,240),retryAfterMs:Number(error&&error.retryAfterMs||0)};
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
      if (!iframeAttempted && elapsed > iframeThreshold && (job.publisher === 'acs' || job.publisher === 'wiley')) {
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

  function isAcsImageViewerUrl(value) {
    try { var u=new URL(value,location.href); return u.hostname==='pubs.acs.org' && /^\/view-large\/figure\//i.test(u.pathname); }
    catch (_) { return false; }
  }

  async function acquireImage(candidate, trace) {
    if (isAcsImageViewerUrl(candidate && candidate.url)) {
      pushTrace(trace,{stage:'image_route',event:'skip_html_viewer',status:'skipped',url:candidate.url,message:'ACS viewer is not image bytes; retain same-figure DOM/CDN candidates'});
      return null;
    }
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
        width: Number(image.width || 0) || undefined,
        height: Number(image.height || 0) || undefined,
        capturedAt: nowIso(),
        source: 'tampermonkey-toc-mainline'
      }, token, 'r2_upload');
      if (!result || result.stored !== true || normalizeDoi(result.doi) !== normalizeDoi(job.doi) || result.kind !== candidate.kind) throw new Error('toc_capture_receipt_invalid');
      if (candidate.kind === 'official' && result.productionTocStored !== true) throw new Error('toc_production_promotion_missing');
      if (candidate.kind === 'figure1' && isNatureScienceFamilyJob(job) && result.productionFallbackStored !== true) throw new Error('figure1_production_fallback_missing');
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
    if(job.missingOnly)Object.keys(job.capturedFigures||{}).forEach(function(k){var f=job.capturedFigures[k];if(validReceiptForDoi(f,normalizeDoi(job.doi)))checkpoint.figures[k]=f;});
    if(!job.recaptureFromHead&&checkpoint.toc&&checkpoint.toc.status==='stored'&&checkpoint.toc.productionTocStored===true&&Date.now()-checkpoint.updatedAt<6*60*60*1000)job.captureToc=false;
    job.publisher=job.publisher||publisherForDoi(job.doi);
    job.captureDeadline=Date.now()+6*60*1000;
    var wantsToc=job.captureToc===true;
    var wantsFigures=job && typeof job.captureFigures==='boolean' ? job.captureFigures : String(job.mediaNeed||'').indexOf('figures')>=0;
    var wantsEvidence=evidenceCaptureEligible(job);
    var result={status:'failed',reason:'',toc:{status:wantsToc?'pending':'already_available'},figures:{status:wantsFigures?'pending':'not_requested',discovered:0,stored:0,failed:0,items:[]},fulltext:{status:wantsEvidence?'pending':'not_requested'},figuresImported:0,figuresStaged:0,published:false};
    job._liveResult=result;
    autoReportJob=job;
    captureLiveUpdate(job,'discovering');
    pushTrace(trace,{stage:'job',event:'start',status:'running',url:location.href,message:'v'+VERSION+';paired_capture=1;need='+String(job.mediaNeed)});
    try {
      if (!token) throw new Error('write_token_missing');
      if(!wantsToc && !wantsFigures && wantsEvidence){
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
      if (wantsToc) {
        try {
          var officials=discovered.toc.filter(function(c){return c.kind==='official';});
          var candidates=officials.length?officials:discovered.toc;
          var best=await acquireBestVisual(job,candidates,trace,cache,'toc');
          if (best) {
            var receipt=await uploadCapture(job,best.candidate,best.image,trace,token);
            result.toc={status:'stored',kind:best.candidate.kind,quality:best.quality.quality,imageUrl:receipt.imageUrl,productionTocStored:best.candidate.kind==='official'?receipt.productionTocStored===true:false,productionFallbackStored:best.candidate.kind==='figure1'?receipt.productionFallbackStored===true:false};
            checkpoint.toc=result.toc;saveCheckpoint(job.doi,checkpoint,job);
            captureLiveUpdate(job,'saved',{label:best.candidate.kind==='figure1'?'Figure 1 替代图':'TOC'});
          } else result.toc={status:'not_found',reason:'no_usable_official_or_figure1'};
        } catch(error) {
          if (/doi_mismatch|stale|unbound|user_aborted/.test(String(error.message))) throw error;
          result.toc={status:'failed',reason:String(error.message)};
          result.retryAfterMs=Math.max(Number(result.retryAfterMs||0),Number(error.retryAfterMs||0));
          captureLiveUpdate(job,'image_failed',{label:'TOC',error:error.message});
        }
      }
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
        if(!job.recaptureFromHead&&saved&&(!job.missingOnly||validReceiptForDoi(saved,normalizeDoi(job.doi)))&&saved.contentHash&&saved.sourceUrl&&groups.get(label).some(function(c){return mediaUrlIdentity(c.url)===mediaUrlIdentity(saved.sourceUrl);})) {
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
          checkpoint.figures[label]=result.figures.items[result.figures.items.length-1];saveCheckpoint(job.doi,checkpoint,job);
          captureLiveUpdate(job,'saved',{label:label,quality:chosen.quality.quality,width:chosen.image.width,height:chosen.image.height});
        } catch(error) {
          if (/doi_mismatch|stale|unbound|user_aborted/.test(String(error.message))) throw error;
          result.figures.failed+=1;
          result.retryAfterMs=Math.max(Number(result.retryAfterMs||0),Number(error.retryAfterMs||0));
          result.figures.items.push({label:label,status:'failed',reason:String(error.message)});
          captureLiveUpdate(job,'image_failed',{label:label,error:error.message});
        }
      }
      if (result.figures.stored+result.figures.failed<labels.length) result.figures.limitReached=true;
      result.figures.status=!wantsFigures?'not_requested':!labels.length?'not_found':result.figures.failed||result.figures.limitReached?'partial':'staged';
      var tocOk=!wantsToc||result.toc.status==='stored'||result.toc.status==='already_available';
      var figuresOk=!wantsFigures||result.figures.status==='staged';
      if(!wantsFigures){
        result.status=tocOk?'success':'failed';
      }else{
        result.status=tocOk&&figuresOk?'success':tocOk||result.figures.stored?'partial':'failed';
      }
      result.reason='combined_capture;toc='+result.toc.status
        +';figures='+(wantsFigures?(result.figures.stored+'/'+result.figures.discovered):'not_requested')
        +';evidence='+(wantsEvidence?'pending':'not_requested')+';published=0';
      // Evidence capture is downstream of media and opportunistic. Its failure never
      // downgrades successful TOC/body capture, but a visit with missing evidence must
      // attempt it before the tab closes.
      result.fulltext=await tryCaptureArticleEvidence(job,trace,token,wantsEvidence?5000:0);
      result.reason='combined_capture;toc='+result.toc.status
        +';figures='+(wantsFigures?(result.figures.stored+'/'+result.figures.discovered):'not_requested')
        +';evidence='+(wantsEvidence?String(result.fulltext.status||'failed'):'not_requested')+';published=0';
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

  function controllerPaused() {
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
    if(manualRunBlocksAutomatic())return false;
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

  function reconcileActiveJobBeforeDispatch() {
    var active = GM_getValue(ACTIVE_JOB_KEY,null);
    if (!active) return {busy:false,cleared:false,reason:'none'};
    var doi = normalizeDoi(active.doi);
    if (!doi || !active.jobId) {
      GM_deleteValue(ACTIVE_JOB_KEY);
      return {busy:false,cleared:true,reason:'invalid_active_job'};
    }

    var completed = completedPublisherResult(active);
    if (completed) {
      GM_deleteValue(ACTIVE_JOB_KEY);
      var completedProgress = GM_getValue(progressKey(doi),null);
      if (!completedProgress || !completedProgress.jobId || completedProgress.jobId===active.jobId) GM_deleteValue(progressKey(doi));
      var completedHb = currentPublisherHeartbeat();
      if (completedHb && completedHb.jobId===active.jobId) GM_deleteValue(HEARTBEAT_KEY);
      return {busy:false,cleared:true,reason:'completed_active_job'};
    }

    var now = Date.now();
    var hb = currentPublisherHeartbeat();
    var hbFresh = Boolean(hb && hb.jobId===active.jobId && now-Number(hb.at||0) < 60000);
    var progress = GM_getValue(progressKey(doi),null);
    var progressAt = progress && progress.jobId===active.jobId ? Date.parse(progress.at||'') : NaN;
    var progressFresh = Number.isFinite(progressAt) && now-progressAt < 60000;
    var startedAt = Date.parse(active.startedAt||'');
    var ageMs = Number.isFinite(startedAt) ? now-startedAt : Infinity;

    if (hbFresh || progressFresh) {
      return {busy:true,cleared:false,reason:'active_job_fresh',doi:doi,ageMs:ageMs};
    }

    // Normal publisher work is bounded by an 8-minute controller timeout. Give
    // another two minutes of safety margin before treating a job as orphaned.
    if (ageMs >= 10*60*1000) {
      GM_deleteValue(ACTIVE_JOB_KEY);
      if (!progress || !progress.jobId || progress.jobId===active.jobId) GM_deleteValue(progressKey(doi));
      if (hb && hb.jobId===active.jobId) GM_deleteValue(HEARTBEAT_KEY);
      return {busy:false,cleared:true,reason:'stale_active_job',doi:doi,ageMs:ageMs};
    }

    return {busy:true,cleared:false,reason:'active_job_grace',doi:doi,ageMs:ageMs};
  }

  function controllerFailureDisposition(reason) {
    reason=String(reason||'');
    if(/^(?:controller_lease_lost|capture_server_upgrade_pending)$/.test(reason))return 'stop';
    if(/^(?:another_task_still_active|task_tab_handle_unavailable|previous_task_tab_not_closed|bound_publisher_heartbeat_missing|controller_timeout|publisher_task_tab_closed)$/.test(reason))return 'skip';
    return 'record';
  }

  async function waitForResult(job,tab) {
    var started=Date.now(), timeoutMs=8*60*1000;
    while(true) {
      var completed=completedPublisherResult(job);
      if(completed)return completed;
      if(isAbortRequested()||GM_getValue(ENABLED_KEY,true)===false) return {doi:job.doi,jobId:job.jobId,status:'aborted',reason:'user_aborted',finishedAt:nowIso()};
      if(!renewLease())throw new Error('controller_lease_lost');

      // publisher final results over controller timeouts: always prefer a completed publisher result first.
      // Background-tab/browser suspension can advance Date.now() by many minutes
      // between two controller polls even though the publisher already finished.
      var result=completedPublisherResult(job);
      if(result) return result;

      var elapsed=Date.now()-started;
      if(elapsed>=timeoutMs) {
        // One short grace window covers a final result racing with controller wake-up.
        var graceDeadline=Date.now()+1000;
        for(var grace=0;grace<4&&Date.now()<graceDeadline;grace+=1) {
          await sleep(250);
          result=completedPublisherResult(job);
          if(result) return result;
        }
        return {doi:job.doi,jobId:job.jobId,status:'failed',reason:'controller_timeout',finishedAt:nowIso()};
      }

      if(tab&&tab.closed===true){
        await sleep(250);
        result=completedPublisherResult(job);if(result)return result;
        return {doi:job.doi,jobId:job.jobId,status:'failed',reason:'publisher_task_tab_closed',finishedAt:nowIso()};
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
    var closeDeadline=Date.now()+3000;
    for(var i=0;i<30&&Date.now()<closeDeadline;i+=1) {
      if(tab.closed===true) return true;
      await sleep(100);
    }
    return tab.closed===true;
  }

  // Explicit user control. Unlike graceful Continue, Start invalidates old work
  // synchronously and creates a fresh, independently fenced article pass.
  function manualRunBlocksAutomatic() {
    var m=GM_getValue(MANUAL_RUN_KEY,null);
    return Boolean(m); // A completed explicit pass must not fall back to the old all-corpus scheduler.
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
      controllerRevision:CONTROLLER_REVISION,version:VERSION,mode:'missing_only',missingRevision:MISSING_CAPTURE_REVISION,
      startedAt:run.startedAt,total:0,success:0,partial:0,failed:0,aborted:0,skipped:0,
      tocStored:0,figuresStaged:0,evidenceStored:0,results:[],phase:'starting'};
    GM_setValue(SUMMARY_KEY,run.summary);
    badge('已立即重新开始：旧任务已作废，正在生成最新文献缺项队列','#175cd3');
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

  // Acquisition inventory, never a publication receipt or a count of the whole corpus.
  function captureNeedText(job) {
    if(!job)return '—';
    var parts=[];
    if(job.captureToc)parts.push(job.existingTocKind==='figure1'?'官方 TOC（已有 Figure 1）':'TOC');
    if(job.captureFigures)parts.push('正文图'+(job.figureCoverageUnconfirmed?'（核对图数，复用已存图片）':job.missingFigureCount>0?'（缺 '+job.missingFigureCount+' 张）':''));
    if(job.captureEvidence)parts.push('文本（全文／摘要）');
    return parts.length?parts.join('＋'):'已齐全';
  }
  function captureEvidenceLevelText(level) {
    return ({complete:'完整正文',partial:'部分正文',abstract_only:'仅摘要'})[level]||'已有文本，完整度未确认';
  }
  function captureBatchDate(job) {
    // Site addition date first; original publication date is only the legacy fallback.
    return String(job.addedDate||job.date||'');
  }
  function compareMissingCaptureJobs(a,b) {
    return captureBatchDate(b).localeCompare(captureBatchDate(a))
      ||journalPriority(a)-journalPriority(b)
      ||String(b.date||'').localeCompare(String(a.date||''))
      ||String(a.doi).localeCompare(String(b.doi));
  }
  function validCapturedFigure(f) {
    if(!f||!f.label||!f.contentHash||!f.sourceUrl)return false;
    if(/^(?:high|usable|vector|vector_mixed)$/.test(String(f.quality||'')))return true;
    return articleFigureResolution(Number(f.width),Number(f.height)).usable;
  }
  function validReceiptForDoi(f,doi) {
    return validCapturedFigure(f)&&embeddedJobDois(f.sourceUrl).every(function(d){return d===doi;});
  }
  function mapCaptureRows(payload) {
    var out=new Map();
    if(payload&&Array.isArray(payload.items))payload.items.forEach(function(r){var d=normalizeDoi(r&&r.doi);if(d)out.set(d,r);});
    return out;
  }
  async function readMissingCaptureInventory(queue,run) {
    // These are metadata reads to select work, not a scan of publisher pages or old locks.
    var errors=[],mediaRows=[];
    var cache=run?(run.inventoryCache||(run.inventoryCache=new Map())):new Map();
    async function safe(name,request,valid,key){
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
    if(!run||!(run.activeDois instanceof Set))throw new Error('architecture_active_work_required');
    var dois=queue.articles.map(function(x){return normalizeDoi(x.doi);}).filter(function(doi){return run.activeDois.has(doi);});
    var chunks=[];for(var i=0;i<dois.length;i+=250)chunks.push(dois.slice(i,i+250));
    async function readMedia(){
      // Bound concurrency and never exceed the Worker's 1200-DOI cap.
      for(var i=0;i<chunks.length;i+=2){
        if(run&&!manualExecutionCurrent(run))return null;
        var batches=await Promise.all(chunks.slice(i,i+2).map(function(ds){return safe('媒体库存',function(){return postReadJson(MEDIA_INVENTORY_ENDPOINT+'?ts='+Date.now(),{dois:ds,readOnly:true});},function(x){return x&&Array.isArray(x.items)&&x.items.length===ds.length&&new Set(x.items.map(function(r){return normalizeDoi(r.doi);})).size===ds.length&&x.items.every(function(r){return ds.indexOf(normalizeDoi(r.doi))>=0;});},'media:'+ds.join('|'));}));
        batches.forEach(function(x){if(x)mediaRows=mediaRows.concat(x.items);});
      }
      return {items:mediaRows};
    }
    var all=await Promise.all([
      readMedia(),
      safe('TOC库存',function(){return getJson(CAPTURE_INDEX_URL+'?ts='+Date.now());},function(x){return x&&Array.isArray(x.items)&&x.items.length===Number(x.count);}),
      safe('正文图库存',function(){return getJson(WORKER+'/api/article-figures/staged?inventory=1&ts='+Date.now());},function(x){return x&&x.schemaVersion==='capture-inventory-v1'&&x.complete===true&&Array.isArray(x.items)&&x.items.length===Number(x.count);}),
      safe('文本库存',function(){return getPrivateJson(EVIDENCE_INVENTORY_ENDPOINT+'?ts='+Date.now(),writeToken());},function(x){return x&&Array.isArray(x.items)&&x.items.length===Number(x.count)&&x.truncated!==true;})
    ]);
    return {media:all[0],tocs:all[1],figures:all[2],evidence:all[3],errors:errors,readAt:nowIso()};
  }
  function missingCaptureDecision(raw,inventory) {
    var doi=normalizeDoi(raw.doi),media=inventory.mediaMap.get(doi),stage=inventory.figureMap.get(doi)||{};
    var cp=readCheckpoint(doi),figs={},unknown=[];
    var latestLocal=GM_getValue(resultKey(doi),null);
    var prior=GM_getValue(attemptKey(doi,VERSION+':paired:1790082000000','figures'),null);
    [cp.figures||{},stage.figures||{},media&&media.capturedFigures||[]].forEach(function(group){Object.keys(group).forEach(function(k){var f=group[k];if(validReceiptForDoi(f,doi))figs[f.label]=f;});});
    var localResults=[latestLocal,prior].filter(function(r){return r&&r.version===VERSION&&r.doi===doi&&Date.parse(r.finishedAt||'')>=1790082000000;});
    var expected=Math.max(0,Number(stage.expectedFigureCount||0),Number(cp.figureCoverage&&cp.figureCoverage.expected||0));
    localResults.forEach(function(r){expected=Math.max(expected,Number(r.figures&&r.figures.discovered||0));});
    var stagedCount=Object.keys(figs).length;
    var productionCount=media?Math.max(0,Number(media.figureCount||0)):0;
    var usableProduction=media?Math.max(0,productionCount-Number(media.lowQualityFigureCount||0)-Number(media.unknownQualityFigureCount||0)):0;
    var knownCount=stagedCount; // Per-label union, not an invalid sum/max of disjoint inventories.
    if(!media||!Array.isArray(media.capturedFigures))knownCount=Math.max(knownCount,usableProduction);
    var tocRows=inventory.tocMap.get(doi)||[];
    var official=tocRows.some(function(t){return t.kind==='official'&&t.imageUrl&&t.contentHash;})||Boolean(media&&((media.tocStored&&!/fallback/i.test(media.tocReason||''))||media.primaryKind==='official_visual'));
    var fallback=tocRows.some(function(t){return t.kind==='figure1'&&t.imageUrl;})||Boolean(media&&(media.primaryKind==='figure1'||media.figureOneStored));
    var tocKnown=official||Boolean(media&&inventory.tocsKnown);
    var figureKnown=expected>0||Boolean(media&&inventory.figuresKnown);
    var inspectFigures=Boolean(figureKnown&&expected===0&&knownCount>0);
    // A nonzero figure count alone is NOT proof that all body figures were captured.
    var needFigures=figureKnown&&(expected>0?knownCount<expected:true);
    var text=inventory.evidenceMap.get(doi);
    var textLevel=text&&text.available!==false?String(text.evidenceLevel||'unknown'):'';
    if(!textLevel){
      var localText=localResults.find(function(r){return r.fulltext&&r.fulltext.status==='stored'&&r.fulltext.evidencePacketHash;});
      if(localText)textLevel=String(localText.fulltext.evidenceLevel||'unknown');
    }
    if(!tocKnown)unknown.push('TOC');if(!figureKnown)unknown.push('正文图完整度');if(!inventory.evidenceKnown&&!textLevel)unknown.push('文本');
    var job=Object.assign({},raw,{doi:doi,publisher:publisherForDoi(doi),missingOnly:true,recaptureFromHead:false,
      captureToc:tocKnown&&!official,captureFigures:needFigures,captureEvidence:inventory.evidenceKnown&&!textLevel,
      expectedFigureCount:expected,figureCoverageUnconfirmed:inspectFigures,missingFigureCount:expected>0?Math.max(0,expected-knownCount):0,
      capturedFigures:figs,existingEvidenceLevel:textLevel,existingTocKind:official?'official':fallback?'figure1':'',
      unknownNeeds:unknown,allowFigureOne:!official&&!fallback&&isNatureScienceFamilyJob(raw)});
    job.mediaNeed=[job.captureToc?'toc':'',job.captureFigures?'figures':'',job.captureEvidence?'evidence':''].filter(Boolean).join('+');
    job.state=job.captureToc?'no_visual':job.captureFigures?'figure_gap':'evidence_gap';
    return job;
  }
  function buildMissingCaptureJobs(queue,run,rawInventory) {
    // Reuse complete registry validation, but don't reuse its historical TOC-first tiers.
    if(!run||!(run.activeDois instanceof Set))throw new Error('architecture_active_work_required');
    var rows=pairedJobs(queue,{items:{}}).filter(function(raw){return run.activeDois.has(normalizeDoi(raw.doi));}), inv=rawInventory||{};
    var inventory={mediaMap:mapCaptureRows(inv.media),tocMap:new Map(),figureMap:mapCaptureRows(inv.figures),evidenceMap:mapCaptureRows(inv.evidence),
      tocsKnown:Boolean(inv.tocs),figuresKnown:Boolean(inv.figures&&inv.figures.complete),evidenceKnown:Boolean(inv.evidence)};
    ((inv.tocs||{}).items||[]).forEach(function(t){var d=normalizeDoi(t.doi);if(!d||Number(t.mediaGeneration)!==1790082000000)return;var a=inventory.tocMap.get(d)||[];a.push(t);inventory.tocMap.set(d,a);});
    var jobs=[],unknownDois=0,unknownLayers={toc:0,figures:0,evidence:0};
    rows.forEach(function(raw){var job=missingCaptureDecision(raw,inventory);if(job.unknownNeeds.length)unknownDois++;
      job.unknownNeeds.forEach(function(n){unknownLayers[n==='TOC'?'toc':n==='文本'?'evidence':'figures']++;});
      if(job.mediaNeed){job.manualRunId=run.id;jobs.push(job);}
    });
    jobs.sort(compareMissingCaptureJobs);
    if(run.summary){run.summary.inventoryUnknown=unknownDois;run.summary.inventoryUnknownLayers=unknownLayers;run.summary.inventoryErrors=(inv.errors||[]).slice();run.summary.inventoryReadAt=inv.readAt||'';}
    return jobs;
  }
  function updateMissingQueueSummary(run,pending) {
    var s=run.summary;
    s.total=s.results.length+pending.length;
    s.pendingMissing=pending.length;
    s.remainingNeeds={toc:0,figures:0,evidence:0};
    pending.forEach(function(j){if(j.captureToc)s.remainingNeeds.toc++;if(j.captureFigures)s.remainingNeeds.figures++;if(j.captureEvidence)s.remainingNeeds.evidence++;});
    s.pendingPreview=pending.slice(0,12).map(function(j){return {doi:j.doi,journal:j.journal,addedDate:captureBatchDate(j),need:captureNeedText(j)};});
  }

  function manualCaptureJobs(queue,run) { return buildMissingCaptureJobs(queue,run,run.inventory); }

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

  // Queue coverage is per DOI and per requested layer; an attempt is not completion.
  function coverageHasNeeds(job) {
    return Boolean(job && (job.captureToc || job.captureFigures || job.captureEvidence));
  }
  function coverageNeedKey(job) {
    return [Boolean(job.captureToc),Boolean(job.captureFigures),Boolean(job.captureEvidence)].join('|');
  }
  function coverageTransient(reason) {
    return /(?:http_50[234]|timeout|page_not_ready|heartbeat_missing|NetworkError|Failed to fetch|gm_request|gm_then_fetch)/i.test(String(reason||''))
      && !/doi_mismatch|receipt_invalid|unbound|401|403|429|blocked by the user|Refused to connect|auth_|challenge_|access_gate/i.test(String(reason||''));
  }
  function coverageReason(result) {
    return [result.reason,(result.toc||{}).reason,(result.fulltext||{}).reason]
      .concat(((result.figures||{}).items||[]).filter(function(f){return f.status==='failed';}).map(function(f){return f.reason;})).filter(Boolean).join(';');
  }
  function coverageJobNeeds(job) {
    job.mediaNeed=[job.captureToc?'toc':'',job.captureFigures?'figures':'',job.captureEvidence?'evidence':''].filter(Boolean).join('+');
    return job;
  }
  function coverageMergePlan(run,jobs) {
    if(!run.coverage)run.coverage=new Map();
    (jobs||[]).forEach(function(raw){
      var old=run.coverage.get(raw.doi);
      if(!old){run.coverage.set(raw.doi,{job:Object.assign({},raw),attempts:0,done:{},noProgress:0,state:'pending',retryAt:0});return;}
      // Retain unresolved obligations on a partial inventory read; never replace
      // a known gap with a missing response. Positive current receipts still win.
      var j=Object.assign({},old.job,raw);
      ['captureToc','captureFigures','captureEvidence'].forEach(function(k){j[k]=!old.done[k]&&Boolean(old.job[k]||raw[k]);});
      j.capturedFigures=Object.assign({},old.job.capturedFigures||{},raw.capturedFigures||{});
      old.job=coverageJobNeeds(j);
      if(old.state==='resolved'&&coverageHasNeeds(old.job)){old.state='pending';old.retryAt=0;}
    });
  }
  function coverageRemaining(run,job,result) {
    var row=run.coverage.get(job.doi),next=Object.assign({},job),before=Object.keys(job.capturedFigures||{}).length;
    row.attempts++;row.lastReason=coverageReason(result);row.lastResult=result;
    var gained=0,figures=result.figures||{},toc=result.toc||{},text=result.fulltext||{};
    if(job.captureToc && (toc.status==='already_available'||toc.status==='stored'&&toc.kind!=='figure1')){
      next.captureToc=false;row.done.captureToc=true;gained++;
    }
    if(job.captureEvidence && text.status==='stored'){
      next.captureEvidence=false;next.existingEvidenceLevel=text.evidenceLevel||'unknown';row.done.captureEvidence=true;gained++;
    }
    var cp=readCheckpoint(job.doi);next.capturedFigures=Object.assign({},job.capturedFigures||{});
    Object.keys(cp.figures||{}).forEach(function(label){var f=cp.figures[label];if(validReceiptForDoi(f,job.doi))next.capturedFigures[label]=f;});
    (figures.items||[]).forEach(function(f){if(validReceiptForDoi(f,job.doi)&&/^(?:staged|already_staged|stored|reused)$/.test(f.status||''))next.capturedFigures[f.label]=f;});
    next.expectedFigureCount=Math.max(Number(job.expectedFigureCount||0),Number(figures.discovered||0));
    var saved=Math.max(Object.keys(next.capturedFigures).length,Number(figures.stored||0));
    next.missingFigureCount=Math.max(0,next.expectedFigureCount-saved);
    gained+=Math.max(0,Object.keys(next.capturedFigures).length-before);
    // Only proof of completion clears an image obligation, not partial/failed.
    if(job.captureFigures && figures.discovered>0 && figures.stored>=figures.discovered && Number(figures.failed||0)===0 && saved>=next.expectedFigureCount){
      next.captureFigures=false;row.done.captureFigures=true;gained++;
    }
    row.job=coverageJobNeeds(next);
    if(!coverageHasNeeds(next)){row.state='resolved';row.retryAt=0;return;}
    var retryAfter=Math.max(0,Number(result.retryAfterMs||0));
    if(result.status==='aborted'){row.state='paused';return;}
    if(/doi_mismatch|receipt_invalid|stale|unbound|401|403|429|auth_|challenge_|access_gate|permission|blocked by the user|Refused to connect/i.test(row.lastReason)){
      row.state='blocked';row.retryAt=0;return;
    }
    // Positive new receipts permit another continuation in this same run. A
    // failed figure/source gets only one no-progress transient retry, never a loop.
    row.noProgress=gained?0:row.noProgress+1;
    if(gained || coverageTransient(row.lastReason)&&row.noProgress<=1){
      row.state='pending';row.retryAt=Date.now()+Math.max(retryAfter,gained?3500:15000);
    }else{row.state='blocked';row.retryAt=0;}
  }
  function coveragePending(run) {
    return Array.from(run.coverage.values()).filter(function(r){return r.state==='pending'&&coverageHasNeeds(r.job);})
      .sort(function(a,b){return captureBatchDate(b.job).localeCompare(captureBatchDate(a.job))||journalPriority(a.job)-journalPriority(b.job)||Number(a.attempts>0)-Number(b.attempts>0)||compareMissingCaptureJobs(a.job,b.job);});
  }
  function coverageStats(run) {
    var s=run.summary,rows=Array.from(run.coverage.values()),left=rows.filter(function(r){return coverageHasNeeds(r.job)&&r.state!=='removed'&&r.state!=='retired';});
    s.total=rows.filter(function(r){return r.state!=='removed'&&r.state!=='retired';}).length;
    s.visitedCount=rows.filter(function(r){return r.attempts>0&&r.state!=='removed'&&r.state!=='retired';}).length;
    s.attemptCount=s.results.length;s.fullyResolved=rows.filter(function(r){return r.state==='resolved';}).length;
    s.unresolvedCount=left.length;s.blockedCount=left.filter(function(r){return r.state==='blocked';}).length;
    s.pendingMissing=left.filter(function(r){return r.state==='pending'||r.state==='active';}).length;
    s.remainingNeeds={toc:0,figures:0,evidence:0};
    left.forEach(function(r){if(r.job.captureToc)s.remainingNeeds.toc++;if(r.job.captureFigures)s.remainingNeeds.figures++;if(r.job.captureEvidence)s.remainingNeeds.evidence++;});
    s.pendingPreview=coveragePending(run).slice(0,12).map(function(r){var j=r.job;return {doi:j.doi,journal:j.journal,addedDate:captureBatchDate(j),need:captureNeedText(j)};});
    s.blockedPreview=left.filter(function(r){return r.state==='blocked';}).slice(0,12).map(function(r){return {doi:r.job.doi,need:captureNeedText(r.job),reason:captureLiveError(r.lastReason||'本次没有新进展')};});
    return s;
  }
  async function coverageWait(run,until) {
    while(Date.now()<until&&manualExecutionCurrent(run)&&!controllerPaused()){
      renewManualLease(run);await sleep(Math.min(1000,Math.max(1,until-Date.now())));
    }
  }
  async function runManualFromHead(run) {
    var s=run.summary;run.coverage=new Map();s.queueCoverageRevision=QUEUE_COVERAGE_REVISION;
    run.renewTimer=setInterval(function(){renewManualLease(run);},15000);
    try{
      var loaded=await Promise.all([getJson(QUEUE_URL+'?ts='+Date.now()),getJson(WORKER+'/api/media/capture-capabilities')]);
      if(!manualExecutionCurrent(run)||controllerPaused())return;
      var queue=loaded[0],caps=loaded[1];
      if(caps.captureVersion!==VERSION||caps.mediaGeneration!==1790082000000||caps.mode!=='verified-staging'||caps.evidenceSchemaVersion!==EVIDENCE_SCHEMA_VERSION||String(caps.mediaControllerRevision)!==CONTROLLER_REVISION)throw new Error('capture_server_upgrade_pending');
      var checkedAt=0,endRefresh=false,inventoryRecovery=0;
      async function refresh(){
        pairedJobs(queue,{items:{}});
        var architectureMembership=await observeArchitectureMembership(queue);
        if(!architectureMembership.ok)throw new Error('architecture_active_work_unverified:'+String(architectureMembership.error||'unknown'));
        run.architectureMembership=architectureMembership;run.activeDois=architectureActiveSet(architectureMembership);
        s.architectureMembership=architectureMembershipSummary(architectureMembership);
        var next=await readMissingCaptureInventory(queue,run);
        if(!manualExecutionCurrent(run)||controllerPaused())return false;
        run.inventory=next;coverageMergePlan(run,manualCaptureJobs(queue,run));
        var currentDois=new Set(queue.articles.map(function(a){return normalizeDoi(a.doi);}));
        run.coverage.forEach(function(r,doi){
          if(!currentDois.has(doi)){r.state='removed';return;}
          if(!run.activeDois.has(doi)){r.state='retired';return;}
          if(r.state==='retired'&&coverageHasNeeds(r.job)){r.state='pending';r.retryAt=0;}
        });
        checkedAt=Date.now();s.queueGeneratedAt=queue.generatedAt;s.latestAddedDate=queue.latestAddedDate;
        coverageStats(run);manualSummary(run);return true;
      }
      if(!await refresh())return;s.phase='running';
      while(manualExecutionCurrent(run)&&!controllerPaused()){
        if(!renewManualLease(run))throw new Error('manual_run_superseded');
        var candidates=coveragePending(run),row=null;
        for(var i=0;i<candidates.length;i++){
          var candidate=candidates[i],job=candidate.job;
          if(publisherAccessCooling(job)){
            candidate.state='blocked';candidate.lastReason='publisher_access_or_rate_limit';s.skipped++;continue;
          }
          if(candidate.retryAt<=Date.now()&&!publisherPacingCooling(job)){row=candidate;break;}
        }
        if(!row){
          candidates=coveragePending(run);
          if(candidates.length){
            s.phase='retry_wait';coverageStats(run);manualSummary(run);
            await coverageWait(run,Date.now()+1000);continue;
          }
          if(!endRefresh || (s.inventoryErrors||[]).length&&inventoryRecovery<2){
            if(endRefresh){inventoryRecovery++;s.phase='inventory_retry';manualSummary(run);await coverageWait(run,Date.now()+15000);}
            if(!manualExecutionCurrent(run)||controllerPaused())break;
            queue=await getJson(QUEUE_URL+'?ts='+Date.now());
            if(!await refresh())return;endRefresh=true;continue;
          }
          break;
        }
        s.phase='running';row.state='active';
        var job=Object.assign({},row.job,{jobId:crypto.randomUUID(),controllerId:manualLeaseOwner(run),captureVersion:VERSION,startedAt:nowIso(),queueGeneratedAt:queue.generatedAt,retryCount:row.attempts+1});
        coverageStats(run);manualSummary(run);
        GM_deleteValue(resultKey(job.doi));GM_deleteValue(progressKey(job.doi));GM_deleteValue(HEARTBEAT_KEY);
        GM_setValue(ACTIVE_JOB_KEY,job);markPublisherDispatch(job);
        badge('连续补缺 · '+captureNeedText(job)+'：'+job.doi,'#175cd3');
        var result;
        try{
          run.tab=await Promise.resolve(GM_openInTab(articleUrl(job)+'#osg-job='+encodeURIComponent(job.jobId),{active:job.publisher==='wiley',insert:true,setParent:true}));
          if(!manualExecutionCurrent(run))return;
          if(!run.tab||typeof run.tab.close!=='function')throw new Error('task_tab_handle_unavailable');
          result=await waitManualResult(job,run.tab,run);
        }catch(error){if(!manualExecutionCurrent(run))return;result={doi:job.doi,jobId:job.jobId,status:'failed',reason:String(error.message||error),finishedAt:nowIso()};}
        finally{
          var active=GM_getValue(ACTIVE_JOB_KEY,null);
          if(active&&active.jobId===job.jobId&&active.manualRunId===run.id)GM_deleteValue(ACTIVE_JOB_KEY);
          try{if(run.tab)run.tab.close();}catch(_){}run.tab=null;
        }
        if(!manualExecutionCurrent(run))return;
        result.version=VERSION;result.controllerRevision=CONTROLLER_REVISION;result.manualRunId=run.id;result.requestedNeeds=captureNeedText(job);
        coverageRemaining(run,job,result);
        if(result.status==='success'&&coverageHasNeeds(row.job))result.status='partial';
        s.results.push(result);s[result.status]=(s[result.status]||0)+1;
        s.tocStored+=result.toc&&result.toc.status==='stored'?1:0;s.figuresStaged+=Number(result.figuresStaged||0);s.evidenceStored+=result.fulltext&&result.fulltext.status==='stored'?1:0;
        GM_setValue(attemptKey(job.doi,'manual:'+run.id,'figures'),result);
        if(row.state==='resolved')GM_setValue(attemptKey(job.doi,VERSION+':paired:1790082000000','figures'),result);
        if(!result.toc)enqueueCaptureReport(job,[{stage:'controller',event:'coverage_capture_result',status:result.status,message:result.reason,at:nowIso()}],result.status,result.reason,true,'');
        coverageStats(run);manualSummary(run);
        if(controllerPaused()||result.status==='aborted')break;
        await coverageWait(run,Date.now()+3500);
        if(!manualExecutionCurrent(run)||controllerPaused())break;
        if(Date.now()-checkedAt>=60000){queue=await getJson(QUEUE_URL+'?ts='+Date.now());if(!await refresh())return;}
      }
      if(manualExecutionCurrent(run)){
        coverageStats(run);s.finishedAt=nowIso();s.phase=controllerPaused()?'paused':s.unresolvedCount||s.inventoryUnknown?'blocked_remaining':'all_resolved';manualSummary(run);
        var stored=GM_getValue(MANUAL_RUN_KEY,null);if(stored&&stored.id===run.id){stored.completedAt=s.finishedAt;GM_setValue(MANUAL_RUN_KEY,stored);}
        badge(controllerPaused()?'已暂停':'已遍历全部待办：补齐 '+s.fullyResolved+' 篇；未补齐 '+s.unresolvedCount+' 篇；库存未确认 '+Number(s.inventoryUnknown||0)+' 篇','#374151');
      }
    }catch(error){
      if(manualExecutionCurrent(run)){coverageStats(run);s.finishedAt=nowIso();s.stopReason=String(error.message||error);s.phase='blocked_remaining';manualSummary(run);badge('抓取受阻，未完成项已保留：'+captureLiveError(s.stopReason),'#991b1b');}
    }finally{
      clearInterval(run.renewTimer);var lease=GM_getValue(LEASE_KEY,null);
      if(lease&&lease.owner===manualLeaseOwner(run))GM_deleteValue(LEASE_KEY);
    }
  }

  function completeControllerResume() {
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
    if(GM_getValue(MANUAL_RUN_KEY,null))return forceStartFromHead();
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

  async function controllerRun() {
    if(manualRunBlocksAutomatic())return;
    if (!isGalleryPage() || globalThis.__OSG_PAIRED_CONTROLLER_BUSY__) return;
    if(CONTROLLER_STOP_REASON){badge('已停止开页：'+CONTROLLER_STOP_REASON,'#991b1b');return;}
    if (GM_getValue(ENABLED_KEY,true)===false||isAbortRequested()) {badge('媒体抓取已暂停','#6b7280');return;}
    if (!writeToken()) {badge('请保留并配置原有 R2 写入令牌','#991b1b');return;}
    globalThis.__OSG_PAIRED_CONTROLLER_BUSY__=true;
    var renew=null,summary=null,stopReason='';
    try {
      if(!await acquireLease()) {badge(controllerPaused()?'媒体抓取已暂停':'另一个 Gallery 控制页正在运行','#6b7280');return;}
      renew=setInterval(renewLease,15000);
      var caps=await getJson(WORKER+'/api/media/capture-capabilities');
      if(caps.captureVersion!==VERSION||caps.mediaGeneration!==1790082000000||caps.mode!=='verified-staging'||caps.evidenceSchemaVersion!==EVIDENCE_SCHEMA_VERSION||String(caps.evidenceCaptureMinControllerRevision||'')!=='2.2.35'||String(caps.mediaControllerRevision||'')!=='2.2.39')throw new Error('capture_server_upgrade_pending');
      var queue=await getJson(QUEUE_URL+'?ts='+Date.now());
      var architectureMembership=await observeArchitectureMembership(queue);
      if(!architectureMembership.ok)throw new Error('architecture_active_work_unverified:'+String(architectureMembership.error||'unknown'));
      var activeDois=architectureActiveSet(architectureMembership);
      var queueCheckedAt=Date.now();
      var productionInventory=await postReadJson(MEDIA_INVENTORY_ENDPOINT+'?ts='+Date.now(),{dois:queue.articles.map(function(row){return normalizeDoi(row&&row.doi);}).filter(function(doi){return doi&&activeDois.has(doi);}),readOnly:true});
      var media=productionMediaSnapshot(productionInventory);
      var evidenceInventory=null;
      try { evidenceInventory=await getPrivateJson(EVIDENCE_INVENTORY_ENDPOINT+'?ts='+Date.now(),writeToken()); }
      catch(error){ try{console.warn('[OSG TOC] evidence inventory unavailable; evidence-only backlog paused',String(error&&error.message||error));}catch(_){} }
      var mediaJobs=pairedJobs(queue,media).filter(function(job){return activeDois.has(normalizeDoi(job.doi));});
      var evidenceJobs=evidenceInventory?evidenceBackfillJobs(queue,media,evidenceInventory).filter(function(job){return activeDois.has(normalizeDoi(job.doi));}):[];
      var generation=VERSION+':paired:'+String(queue.mediaGeneration);
      var evidenceGeneration=EVIDENCE_SCHEMA_VERSION+':'+CONTROLLER_REVISION+':'+String(queue.latestAddedDate||queue.generatedAt||'');
      function eligibleMedia(job) {
        var prior=GM_getValue(attemptKey(job.doi,generation,'figures'),null);
        // A scheduler failure is not a failed publisher/article capture.
        if(prior && prior.reason==='controller_lease_lost')return true;
        // 2.2.35 switched the authority from the stale static media-index to current
        // production D1. A Wiley DOI that production still says is missing must get
        // one immediate post-upgrade retry even if an older controller logged stored/
        // already_available/not_found and would otherwise be held by overnight retry.
        if(job.publisher==='wiley'&&job.captureToc===true&&prior&&String(prior.controllerRevision||'')!==CONTROLLER_REVISION)return true;
        // 2.2.36 changes Nature/Science-family visual semantics: reopen one time so a
        // verified Figure 1 can become an explicit production fallback when no official
        // TOC/graphical abstract exists.
        if(isNatureScienceFamilyJob(job)&&job.captureToc===true&&prior&&String(prior.controllerRevision||'')!==CONTROLLER_REVISION)return true;
        if (prior && prior.version===VERSION && prior.status==='success') {
          // 2.2.32 could record a TOC-only visit as media success. Reopen only those
          // legacy successes that never requested figures; genuine paired successes stay done.
          if (job.captureFigures===true && (!prior.figures || prior.figures.status==='not_requested')) return true;
          return false;
        }
        if (prior && !overnightRetryEligible(prior,Date.now())) return false;
        return true;
      }
      function eligibleEvidence(job) {
        var prior=GM_getValue(attemptKey(job.doi,evidenceGeneration,'evidence'),null);
        if(prior && prior.reason==='controller_lease_lost')return true;
        if(prior && prior.status==='success'){clearSummaryEvidenceUrgency(job.doi);return false;}
        if(summaryEvidenceUrgency(job.doi)){
          job.summaryUrgent=true;
          var urgentEligible=urgentEvidenceRetryEligible(prior,Date.now());
          if(!urgentEligible&&prior&&Number(prior.retryCount||1)>=4)clearSummaryEvidenceUrgency(job.doi);
          return urgentEligible;
        }
        if(prior && !overnightRetryEligible(prior,Date.now()))return false;
        return true;
      }
      var latestAddedDate=String(queue.latestAddedDate||'');
      function availableJobs() {
        var mediaAvailable=mediaJobs.filter(eligibleMedia);
        var evidenceAvailable=evidenceJobs.filter(eligibleEvidence);
        var evidenceMissing=new Set(evidenceAvailable.map(function(job){return normalizeDoi(job.doi);}));
        var merged=new Map();
        mediaAvailable.forEach(function(raw){
          var job=Object.assign({},raw);
          job.captureEvidence=evidenceMissing.has(normalizeDoi(job.doi));
          merged.set(normalizeDoi(job.doi),job);
        });
        evidenceAvailable.forEach(function(raw){
          var doi=normalizeDoi(raw.doi);
          if(merged.has(doi)){
            merged.get(doi).captureEvidence=true;
            return;
          }
          merged.set(doi,Object.assign({},raw,{captureToc:false,captureFigures:false,captureEvidence:true}));
        });
        return Array.from(merged.values());
      }
      if(controllerPaused())return;
      if(!renewLease())throw new Error('controller_lease_lost');
      if(manualRunBlocksAutomatic())return;
      var available=availableJobs(),batch=selectBatchJobs(available,batchSize(),latestAddedDate);
      summary={controllerRunId:CONTROLLER_ID+':'+Date.now(),lifecycleRevision:CONTROLLER_LIFECYCLE_REVISION,architectureMembershipRevision:ARCHITECTURE_MEMBERSHIP_REVISION,architectureMembership:architectureMembershipSummary(architectureMembership),version:VERSION,controllerRevision:CONTROLLER_REVISION,queueGeneratedAt:queue.generatedAt,latestAddedDate:latestAddedDate,queueTotal:mediaJobs.length+evidenceJobs.length,evidenceBacklog:evidenceJobs.length,total:batch.length,startedAt:nowIso(),success:0,partial:0,failed:0,aborted:0,skipped:0,lifecycleWarnings:0,tocStored:0,figuresStaged:0,evidenceStored:0,published:0,results:[]};
      persistControllerSummary(summary,true);
      for (var i=0;i<batch.length;i+=1) {
        if(isAbortRequested()||GM_getValue(ENABLED_KEY,true)===false)break;
        // Fail before opening any page, and never dispatch after loss of ownership.
        if(!renewLease()) {stopReason='controller_lease_lost';break;}
        if (i>0 && Date.now()-queueCheckedAt>=60000) {
          try {
            var refreshedQueue=await getJson(QUEUE_URL+'?ts='+Date.now());
            var refreshedMembership=await observeArchitectureMembership(refreshedQueue);
            queueCheckedAt=Date.now();
            if (!Array.isArray(refreshedQueue.articles) || refreshedQueue.articles.length!==Number(refreshedQueue.webpageDoiCount)
                || Number(refreshedQueue.mediaGeneration)!==1790082000000) throw new Error('invalid_queue_refresh');
            if(!refreshedMembership.ok)throw new Error('architecture_active_work_unverified:'+String(refreshedMembership.error||'unknown'));
            if (queueRegistryChanged(queue,refreshedQueue)||architectureActiveSetChanged(architectureMembership,refreshedMembership)) {
              summary.refreshPending=true;
              summary.activeWorkRefreshPending=architectureActiveSetChanged(architectureMembership,refreshedMembership);
              badge(summary.activeWorkRefreshPending?'检测到三个月热区／目录变化；当前篇已保存，重新按最新资格排队':'检测到文献队列更新；当前篇已保存，重新按最新上架排序','#374151');
              break;
            }
            architectureMembership=refreshedMembership;activeDois=architectureActiveSet(refreshedMembership);
            summary.architectureMembership=architectureMembershipSummary(refreshedMembership);
          } catch(queueError) {
            summary.refreshPending=true;
            summary.queueRefreshError=String(queueError.message||queueError).slice(0,120);
            break; // Do not open possibly removed DOI from an unverifiable old registry.
          }
        }
        if (publisherAccessCooling(batch[i])) {
          summary.skipped+=1;
          badge('出版社访问验证冷却，已跳过 '+batch[i].doi+'；继续其他来源','#92400e');
          continue;
        }
        var activeState = reconcileActiveJobBeforeDispatch();
        if(activeState.cleared) {
          badge('已自动清理旧任务：'+String(activeState.doi||'')+'；继续抓取','#374151');
        }
        if(activeState.busy) {
          stopReason='active_task_wait';
          badge('已有任务仍在处理：'+String(activeState.doi||'')+'；15 秒后自动复查','#374151');
          break;
        }
        if(manualRunBlocksAutomatic())return;
        var evidenceOnly=batch[i].captureToc!==true && batch[i].captureFigures!==true && batch[i].captureEvidence===true;
        var attemptGeneration=evidenceOnly?evidenceGeneration:generation;
        var attemptKind=evidenceOnly?'evidence':'figures';
        var priorAttempt=GM_getValue(attemptKey(batch[i].doi,attemptGeneration,attemptKind),null);
        var job=Object.assign({},batch[i],{jobId:crypto.randomUUID(),controllerId:CONTROLLER_ID,captureVersion:VERSION,startedAt:nowIso(),queueGeneratedAt:queue.generatedAt,retryCount:Number(priorAttempt&&priorAttempt.retryCount||0)+1});
        GM_deleteValue(resultKey(job.doi));GM_deleteValue(progressKey(job.doi));GM_deleteValue(HEARTBEAT_KEY);GM_setValue(ACTIVE_JOB_KEY,job);
        markPublisherDispatch(job);
        var taskParts=[];
        if(job.captureToc===true)taskParts.push('TOC');
        if(job.captureFigures===true)taskParts.push('正文图');
        if(job.captureEvidence===true)taskParts.push('文字证据');
        badge((taskParts.join('＋')||'媒体检查')+' '+(i+1)+'/'+batch.length+'：'+job.doi,'#1f2937');
        var tab=null,result=null,closed=true,skipReason='';
        try {
          if(!renewLease())throw new Error('controller_lease_lost');
          tab=await Promise.resolve(GM_openInTab(articleUrl(job)+'#osg-job='+encodeURIComponent(job.jobId),{active:job.publisher==='wiley',insert:true,setParent:true}));
          if(manualRunBlocksAutomatic()){try{if(tab)tab.close();}catch(_){}return;}
          ownedTaskHandle=tab;
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
          releaseIdlePausedLease();
          if(tab)closed=await closeTaskTab(tab);
          if(!closed)skipReason=skipReason||'previous_task_tab_not_closed';
        }
        if(manualRunBlocksAutomatic())return;
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
          result.retryPolicyRevision=CAPTURE_HOTFIX_REVISION;
          result.retryCount=Number(priorAttempt&&priorAttempt.reason!=='controller_lease_lost'&&priorAttempt.retryCount||0)+1;
          summary.results.push(result);summary[result.status]=(summary[result.status]||0)+1;
          summary.tocStored+=result.toc&&result.toc.status==='stored'?1:0;
          summary.figuresStaged+=Number(result.figuresStaged||0);
          summary.evidenceStored+=result.fulltext&&result.fulltext.status==='stored'?1:0;
          GM_setValue(attemptKey(job.doi,attemptGeneration,attemptKind),result);
          if(result.fulltext&&result.fulltext.status==='stored'){
            clearSummaryEvidenceUrgency(job.doi);
          }else if(result.toc&&result.toc.status==='stored'){
            markSummaryEvidenceUrgency(job.doi);
          }
          if(!evidenceOnly&&result.fulltext&&result.fulltext.status==='stored'){
            GM_setValue(attemptKey(job.doi,evidenceGeneration,'evidence'),{doi:job.doi,status:'success',version:VERSION,controllerRevision:CONTROLLER_REVISION,finishedAt:result.finishedAt||nowIso(),reason:'opportunistic_evidence_stored',retryCount:1});
          }
        }
        if(skipReason) {
          if(result && result.status!=='failed' && skipReason==='previous_task_tab_not_closed')summary.lifecycleWarnings+=1;
          else summary.skipped+=1;
          badge('已跳过 '+job.doi+'：'+skipReason+'；继续下一篇','#92400e');
        }
        if(stopReason){summary.stopReason=stopReason;persistControllerSummary(summary,false);break;}
        persistControllerSummary(summary,false);
        if(result && result.status==='aborted')break;
        await sleep(3500);
      }
      if(manualRunBlocksAutomatic())return;
      summary.finishedAt=nowIso();summary.stopReason=stopReason;persistControllerSummary(summary,false);
      if(stopReason==='active_task_wait') {
        badge('已有任务仍在处理；15 秒后自动复查，不会永久停止','#374151');
      } else if(stopReason) {
        badge('已停止开页：'+stopReason+'；请检查日志后再继续','#991b1b');
      } else {
        badge('本批：TOC '+summary.tocStored+'；正文图已暂存 '+summary.figuresStaged+'；文字证据 '+summary.evidenceStored+'；完整 '+summary.success+'，部分 '+summary.partial+'，失败 '+summary.failed+'，跳过 '+summary.skipped+'（媒体暂存不等于发布）','#374151');
      }
      var remainingAvailable=!stopReason?availableJobs():[];
      var urgentEvidencePending=!stopReason&&hasActiveSummaryEvidenceUrgency();
      if(stopReason==='active_task_wait' && !isAbortRequested() && GM_getValue(ENABLED_KEY,true)!==false) {
        if(nextBatchTimer!==null)clearTimeout(nextBatchTimer);
        nextBatchTimer=setTimeout(function(){nextBatchTimer=null;controllerRun();},15000);
      } else if(!stopReason&&(summary.refreshPending||remainingAvailable.length>0||urgentEvidencePending)&&!isAbortRequested()&&GM_getValue(ENABLED_KEY,true)!==false) {
        if(nextBatchTimer!==null)clearTimeout(nextBatchTimer);
        var nextDelay=summary.queueRefreshError?60*1000:summary.refreshPending?1500:remainingAvailable.length>0?NEXT_BATCH_DELAY_MS:60*1000;
        nextBatchTimer=setTimeout(function(){nextBatchTimer=null;controllerRun();},nextDelay);
      }
    } catch(error) {
      if(manualRunBlocksAutomatic())return;
      stopReason=String(error.message);
      if(controllerPaused()){stopReason='user_paused';badge('媒体抓取已暂停','#6b7280');}
      else if(!renewLease() || /capture_server_upgrade_pending/.test(stopReason))badge('媒体主线已停止：'+stopReason,'#991b1b');
      else {
        badge('媒体主线暂缓：'+stopReason+'；60 秒后检查重连','#991b1b');
        if(!isAbortRequested()&&GM_getValue(ENABLED_KEY,true)!==false) {clearTimeout(nextBatchTimer);nextBatchTimer=setTimeout(controllerRun,60000);}
      }
    } finally {
      clearInterval(renew);
      if(!manualRunBlocksAutomatic()&&/controller_lease_lost|capture_server_upgrade_pending/.test(stopReason)){CONTROLLER_STOP_REASON=stopReason;if(nextBatchTimer!==null){clearTimeout(nextBatchTimer);nextBatchTimer=null;}}
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
    GM_registerMenuCommand('立即开始任务（从头重抓）', forceStartFromHead);
    GM_registerMenuCommand('立即运行媒体抓取队列', forceStartFromHead);
    GM_registerMenuCommand('中止当前媒体抓取批次', function () {
      requestControllerPause();
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
      if(enabled){requestControllerPause();window.alert('媒体抓取主线已暂停。');}
      else requestControllerStart();
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
      requestControllerPause();
      var lease=GM_getValue(LEASE_KEY,null);
      if(lease && Number(lease.expiresAt)>Date.now()) {
        window.alert('已请求暂停。当前控制器退出后再清理；不会抢占运行中的任务锁。');return;
      }
      GM_deleteValue(ACTIVE_JOB_KEY);
      GM_deleteValue(LEASE_KEY);
      window.alert('已清除过期任务和租约，保持暂停。关闭旧任务页后可继续。');
    });
  }

  // Only a visibly numbered heading within this figure may recover a missing
  // caption label. No filename-number guessing and no shared-article captions.
  function wileyBodyFigureContext(node, original) {
    if (!node || !node.closest || original && (original.label || original.official)) return original;
    if (node.closest('aside,nav,header,footer,[class*="recommend" i],[class*="related" i],[id*="related" i],[class*="reference" i]')) return null;
    var block=original&&original.block || node.closest('figure,[role="figure"],.article-section__figure');
    if(!block || !block.contains(node))return null;
    var captions=Array.from(block.querySelectorAll('figcaption,.caption,[class*="caption"],.figure-title,.figure__title,[role="heading"],h1,h2,h3,h4,h5,h6'));
    [node,block].forEach(function(el){
      ['aria-labelledby','aria-describedby'].forEach(function(attr){
        String(el.getAttribute(attr)||'').split(/\s+/).filter(Boolean).forEach(function(id){
          var target=el.ownerDocument.getElementById(id);
          if(target&&block.contains(target)&&captions.indexOf(target)<0)captions.push(target);
        });
      });
    });
    var texts=captions.map(function(c){return String(c.textContent||'').replace(/\s+/g,' ').trim();}).filter(Boolean);
    var own=[node.getAttribute('alt'),node.getAttribute('title'),node.getAttribute('aria-label')].filter(Boolean).join(' ');
    var numbered=texts.concat(own).filter(function(t){return /^(?:Fig(?:ure)?\.?|Scheme|Chart)\s*\d+[a-z]?\b/i.test(t);});
    var labels=Array.from(new Set(numbered.map(function(t){return articleFigureLabel(t,0);})));
    if(labels.length!==1)return null;
    var descendants=Array.from(block.querySelectorAll('figure,[role="figure"],.article-section__figure'));
    if(descendants.some(function(other){return other!==block&&!other.contains(node);}))return null;
    return {block:block,label:labels[0],caption:(numbered[0]+' '+texts.filter(function(t){return t!==numbered[0];}).join(' ')).slice(0,600),official:false};
  }

  function orderedFigureCandidates(job,candidates,role) {
    if(job.publisher!=='acs'||role!=='figure')return candidates.slice(0,4);
    // These are all links already supplied by the same isolated figure DOM.
    // Prefer real vector files before HTML viewers and preview raster variants.
    var unique=[],seen=new Set();
    candidates.forEach(function(c){if(c&&c.url&&!seen.has(c.url)){seen.add(c.url);unique.push(c);}});
    return unique.map(function(c,i){return {c:c,i:i,vector:/\.svg(?:[?#]|$)/i.test(c.url)&&!isAcsImageViewerUrl(c.url)};})
      .sort(function(a,b){return Number(b.vector)-Number(a.vector)||a.i-b.i;})
      .slice(0,6).map(function(x){return x.c;});
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
    var seenFallback=new Set();
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i], element = candidate && candidate.element;
      if (!(element instanceof HTMLImageElement) || !element.complete || element.naturalWidth < 1) continue;
      var scope = visualScope(element);
      if (!scope || scope.official || scope.label !== candidate.label) continue;
      var current = normalizeUrl(element.currentSrc || element.src, location.href);
      if (!current || seenFallback.has(candidate.label+'|'+current)) continue;
      seenFallback.add(candidate.label+'|'+current);
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
    candidates=orderedFigureCandidates(job,candidates,role);
    for (var i=0;i<candidates.length;i+=1) {
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
    var wantsFigures = job && typeof job.captureFigures === 'boolean'
      ? job.captureFigures
      : String(job && job.mediaNeed || '').indexOf('figures') >= 0;
    if (!wantsFigures) return Boolean(tocCount || elapsedMs >= 18000);
    // A TOC can appear several seconds before ACS lazy body figures. Do not let it
    // terminate a body job before the full-page scroll has had time to settle.
    if (!figureCount) return elapsedMs >= 18000;
    return elapsedMs >= 8000 && figureQuietMs >= 4000;
  }

  async function waitForPairedVisuals(job,trace) {
    var started=Date.now(),step=0,lastSignature='',stable=0,lastFigureSignature='',figureChangedAt=started,iframeAttempted=false,accessGateStarted=0;
    var toc=[],figures=[];
    while (Date.now()-started<90000 && Date.now()<job.captureDeadline) {
      if (isAbortRequested()) throw new Error('user_aborted');
      assertBoundCaptureJob(job);
      var state=pageState(job,trace);
      if (state.auth || state.challenge) {
        if (!accessGateStarted) accessGateStarted=Date.now();
        var waitState=state.auth?'auth_wait':'challenge_wait';
        captureLiveUpdate(job,waitState);
        GM_setValue(progressKey(job.doi),{jobId:job.jobId,status:waitState,at:nowIso(),url:location.href,version:VERSION,host:location.hostname});
        if (state.accessGate && Date.now()-accessGateStarted >= 12000) {
          var cooldown=markPublisherAccessCooldown(job,'publisher_access_gate');
          pushTrace(trace,{stage:'publisher_access',event:'cooldown',status:'skipped',url:location.href,
            message:'publisher='+String(job.publisher||'')+';cooldownMs='+String(PUBLISHER_ACCESS_COOLDOWN_MS)+';until='+String(cooldown&&cooldown.until||0)});
          throw new Error('publisher_access_gate');
        }
        await sleep(1500); continue;
      }
      accessGateStarted=0;
      var gateProgress = GM_getValue(progressKey(job.doi),null);
      if (gateProgress && /^(?:auth_wait|challenge_wait)$/.test(String(gateProgress.status||''))) {
        GM_setValue(progressKey(job.doi),{jobId:job.jobId,status:'publisher_verified',at:nowIso(),url:location.href,version:VERSION,host:location.hostname});
        captureLiveUpdate(job,'discovering');
      }
      var wantsToc = job.captureToc === true;
      var wantsFigures = job && typeof job.captureFigures === 'boolean'
        ? job.captureFigures
        : String(job.mediaNeed || '').indexOf('figures') >= 0;
      toc=wantsToc?collectCandidates(job,trace,document,location.href,'paired_dom',true):[];
      figures=wantsFigures?collectArticleFigureCandidates(job,trace,document,location.href,'paired_dom'):[];
      var now=Date.now(),elapsed=now-started;
      if(state.shell&&!toc.length&&!figures.length){
        captureLiveUpdate(job,'page_loading');
        if(elapsed>=30000)throw new Error('publisher_page_not_ready');
        await sleep(800);continue;
      }
      if (wantsToc && !toc.length && !iframeAttempted && elapsed>7000 &&
          (job.publisher==='acs'||job.publisher==='wiley')) {
        iframeAttempted=true;
        var iframeRows=await iframeCandidates(job,trace);
        toc=iframeRows.filter(function(row){return row&&row.kind==='official';});
        if(toc.length) pushTrace(trace,{stage:'paired_toc_fallback',event:'iframe_recovery',status:'found',message:'official='+String(toc.length)});
      }
      var figureSignature=figures.map(function(x){return x.label+'|'+x.url;}).join('|');
      if (figureSignature!==lastFigureSignature) {lastFigureSignature=figureSignature;figureChangedAt=Date.now();}
      var signature=toc.map(function(x){return x.url;}).join('|')+'::'+figureSignature;
      stable=signature===lastSignature?stable+1:0;lastSignature=signature;
      if (step<5) {
        var h=Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0);
        try {window.scrollTo(0,Math.floor(h*step/4));}catch(_){}
        step+=1;stable=0;
      } else {
        var figureQuiet=now-figureChangedAt;
        if (pairedDiscoveryReady(job,stable,toc.length,figures.length,elapsed,figureQuiet)) break;
      }
      await sleep(800);
    }
    return {toc:toc,figures:figures};
  }

  async function finishPairedJob(job,result,trace,token) {
    if(!currentCaptureJob(job))return Object.assign({},result,{status:'aborted',reason:'manual_run_superseded'});
    if(job.missingOnly&&result.figures&&result.figures.discovered>0){var cp=readCheckpoint(job.doi);cp.figureCoverage={expected:Math.max(Number(cp.figureCoverage&&cp.figureCoverage.expected||0),Number(result.figures.discovered)),observedAt:Date.now()};saveCheckpoint(job.doi,cp,job);}
    result.retryAfterMs=Math.max(Number(result.retryAfterMs||0),Number((result.fulltext||{}).retryAfterMs||0));
    result.doi=job.doi;result.jobId=job.jobId;result.version=VERSION;result.controllerRevision=CONTROLLER_REVISION;result.finishedAt=nowIso();
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
    var count=Math.max(1,Number(prior.retryCount||1));
    var detail=[prior.reason,(prior.toc||{}).reason,(prior.fulltext||{}).reason]
      .concat(((prior.figures||{}).items||[]).filter(function(x){return x.status==='failed';}).map(function(x){return x.reason;})).join(';');
    if (/doi_mismatch|receipt_invalid|stale_or_unbound/i.test(detail)) {
      return elapsed>=Math.max(6*60*60*1000,Number(prior.retryAfterMs||0));
    }
    if (/permission|blocked by the user|Refused to connect|(?:http_|status[=:])(401|403|429)|auth_|challenge_|publisher_access_gate/i.test(detail)) {
      return elapsed>=Math.max(30*60*1000,Number(prior.retryAfterMs||0));
    }
    // One retry of CCS's old missing-injection failure after this exact host fix.
    if (String(prior.doi||'').indexOf('10.31635/')===0 && prior.reason==='bound_publisher_heartbeat_missing'
        && prior.retryPolicyRevision!==CAPTURE_HOTFIX_REVISION) return true;
    if (/gm_request|gm_then_fetch|Failed to fetch|NetworkError|timeout|heartbeat_missing|upload_http_50[234]|queue_http_50[234]|signal is aborted|publisher_page_not_ready/i.test(detail)) {
      return elapsed>=Math.max([5,15,30,60][Math.min(count-1,3)]*60*1000,Number(prior.retryAfterMs||0));
    }
    if (count>=3 && elapsed<12*60*60*1000) return false;
    if (prior.figures && prior.figures.status==='staged' && (prior.toc||{}).status!=='failed') return elapsed>=6*60*60*1000;
    return elapsed>=Math.min(count*30,180)*60*1000;
  }
  function checkpointKey(doi) { return P+'verified-capture:'+VERSION+':1790082000000:'+normalizeDoi(doi); }
  function readCheckpoint(doi) {
    var stored=GM_getValue(checkpointKey(doi),null);
    return stored&&stored.doi===normalizeDoi(doi)&&stored.version===VERSION?stored:{doi:normalizeDoi(doi),version:VERSION,figures:{}};
  }
  function saveCheckpoint(doi, value, job) {
    if(job&&!currentCaptureJob(job))return false;
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
      var hasVisual=Boolean(toc.available && toc.imageUrl);
      var official=Boolean(hasVisual && !/fallback/i.test(toc.reason||''));
      var natureScienceFamily=isNatureScienceFamilyJob(raw);
      var acceptedFallback=Boolean(hasVisual && /fallback/i.test(toc.reason||'') && natureScienceFamily);
      var visualSatisfied=official||acceptedFallback;
      var latestAddedDate=String(queue.latestAddedDate||'');
      var isLatest=Boolean(latestAddedDate && String(raw.addedDate||'')===latestAddedDate);
      var mediaNeed=isLatest?(visualSatisfied?'figures':'toc+figures'):visualSatisfied?'figures':'toc';
      // mediaNeed is only the scheduler trigger. Once the article is open, fill every
      // still-relevant media layer in the same bound visit instead of reopening it.
      // A Nature/Science Figure 1 remains a fallback, never an official TOC, but it
      // satisfies the card-visual gap until a higher-rank official visual appears.
      return Object.assign({},raw,{
        doi:doi,
        publisher:publisherForDoi(doi),
        mediaNeed:mediaNeed,
        state:visualSatisfied?'figure_gap':'no_visual',
        captureToc:!visualSatisfied,
        captureFigures:true,
        captureEvidence:false,
        allowFigureOne:!official&&(isLatest||natureScienceFamily),
        _queueIndex:index
      });
    });
    // Scheduler tiers: latest Gallery additions first; while no new additions are waiting,
    // Nature/Science-family visual gaps are cleared before other historical TOCs, then body
    // figures and evidence. Journal priority applies inside every tier.
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
      // Missing evidence is a real backlog independent of TOC state. If a media visit
      // for this DOI is already scheduled it will be merged into that visit; otherwise
      // it remains a lower-priority evidence-only job.
      return Object.assign({},raw,{
        doi:doi,
        publisher:publisherForDoi(doi),
        mediaNeed:'evidence',
        state:'evidence_gap',
        existingEvidenceLevel:'missing',
        captureToc:false,
        captureFigures:false,
        captureEvidence:true,
        allowFigureOne:false,
        summaryUrgent:Boolean(summaryEvidenceUrgency(doi)),
        _queueIndex:index
      });
    }).filter(Boolean);
  }

  installManualRestartListener();
  installMenu();

  if (isGalleryPage()) {
    mountCaptureLivePanel();
    startAutomaticCaptureReports();
    if(location.hash==='#osg-start-from-head'){
      try{history.replaceState(null,'',location.pathname+location.search);}catch(_){}
      forceStartFromHead();
    }else setTimeout(controllerRun, 1500);
    setInterval(function () {
      if (!GM_getValue(ACTIVE_JOB_KEY, null)) controllerRun();
    }, 60 * 1000);
  } else {
    publisherBoot();
  }
})();
