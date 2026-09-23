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
      lastResult: (summary.results || []).length ? summary.results[summary.results.length - 1] : null,
      // Summary is committed after each paper. The active row is displayed separately, never added twice.
      publication: '已保存至 R2 暂存；未自动发布到文献卡片'
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
      batch: '已结束 ' + s.completed + '／' + s.total + ' 篇 · 主图回执 ' + s.batchToc + ' · 正文暂存回执 ' + s.batchStaged + ' · 失败 ' + s.batchFailed,
      last: s.lastAt ? new Date(s.lastAt).toLocaleTimeString() + ' · ' + s.ageSeconds + ' 秒前' : '尚无进度记录',
      stale: s.active && s.ageSeconds >= 45 ? '一段时间没有新进展：可能正在等待网络或页面验证，不等于抓取失败。' : '',
      error: lastError || '无', publication: s.publication
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
    ['stale','publication'].forEach(function (key) { var p = document.createElement('p'); p.id = key; fields[key] = p; main.appendChild(p); });
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
