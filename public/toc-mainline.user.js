// ==UserScript==
// @name         Organic Synthesis Gallery TOC Mainline
// @namespace    https://zhou526316-sys.github.io/organic-synthesis-gallery/
// @version      6.2.16
// @description  Runs the live TOC backlog in the authenticated browser, uploads verified visuals to R2, and records per-DOI diagnostic traces.
// @author       Organic Synthesis Gallery
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
// @updateURL    https://zhou526316-sys.github.io/organic-synthesis-gallery/toc-mainline.user.js
// @downloadURL  https://zhou526316-sys.github.io/organic-synthesis-gallery/toc-mainline.user.js
// ==/UserScript==

(function () {
  'use strict';

  var VERSION = '6.2.16';
  var GALLERY_HOST = 'zhou526316-sys.github.io';
  var GALLERY_PATH = '/organic-synthesis-gallery/';
  var QUEUE_URL = 'https://zhou526316-sys.github.io/organic-synthesis-gallery/toc-demand-live.json';
  var WORKER = 'https://organic-synthesis-gallery.zhou526316.workers.dev';
  var CAPTURE_ENDPOINT = WORKER + '/api/media/local-capture/import';
  var FIGURE_IMPORT_ENDPOINT = WORKER + '/api/article-figures/import';
  var FIGURE_STAGE_ENDPOINT = WORKER + '/api/article-figures/stage';
  var CAPTURE_INDEX_URL = WORKER + '/api/media/local-capture-index';
  var REPORT_ENDPOINT = WORKER + '/api/media/tampermonkey-report/import';
  var DIAGNOSTICS_ENDPOINT = WORKER + '/api/media/local-diagnostics/import';
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
  var FAILURE_ENGINE_REVISION = VERSION + ':20260920-diagnostic-history';
  var DEFAULT_BATCH_SIZE = 8;
  var NEXT_BATCH_DELAY_MS = 12000;
  var nextBatchTimer = null;
  var CONTROLLER_ID = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  var MAX_TRACE = 150;

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

  function candidateBelongsToJob(url, job) {
    var doi = normalizeDoi(job && job.doi);
    if (!doi || publisherForDoi(doi) !== 'nature') return true;
    var embedded = embeddedNatureDoi(url);
    return !embedded || embedded === doi;
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
    var figureJob = jobKind(job) === 'figures';
    if (publisher === 'acs') return 'https://pubs.acs.org/doi/' + (figureJob ? 'full/' : '') + doi;
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
    return String(job && job.mediaNeed || '') === 'figures' || String(job && job.state || '') === 'figure_gap' ? 'figures' : 'toc';
  }
  function attemptKey(doi, generatedAt, kind) {
    var base = P + 'attempt:' + normalizeDoi(doi) + ':' + String(generatedAt || '');
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

  function selectBatchJobs(allJobs, limit) {
    var normalized = [];
    allJobs.forEach(function (raw) {
      var job = Object.assign({}, raw);
      job.doi = normalizeDoi(job.doi);
      if (!job.doi || isFailureCooling(job)) return;
      job.publisher = String(job.publisher || publisherForDoi(job.doi));
      normalized.push(job);
    });
    var dates = Array.from(new Set(normalized.map(function (job) {
      return String(job.date || '');
    }))).sort(function (a, b) {
      return String(b).localeCompare(String(a));
    });
    var out = [];
    for (var di = 0; di < dates.length && out.length < limit; di += 1) {
      var date = dates[di];
      var buckets = new Map();
      normalized.filter(function (job) {
        return String(job.date || '') === date;
      }).forEach(function (job) {
        if (!buckets.has(job.publisher)) buckets.set(job.publisher, []);
        buckets.get(job.publisher).push(job);
      });
      buckets.forEach(function (rows) {
        rows.sort(function (a, b) {
          if (String(a.state || '') === 'figure_gap' && String(b.state || '') === 'figure_gap') {
            var figureDelta = Math.max(0, Number(a.figureCount || 0)) - Math.max(0, Number(b.figureCount || 0));
            if (figureDelta) return figureDelta;
          }
          return String(a.doi).localeCompare(String(b.doi));
        });
      });
      var publishers = Array.from(buckets.keys()).sort();
      var index = 0;
      while (out.length < limit && publishers.length) {
        if (index >= publishers.length) index = 0;
        var publisher = publishers[index];
        var rows = buckets.get(publisher) || [];
        if (rows.length) out.push(rows.shift());
        if (!rows.length) publishers.splice(index, 1);
        else index += 1;
      }
    }
    return out;
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

  async function fetchPostJson(url, payload, token) {
    var response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });
    var text = await response.text();
    var body = {};
    try { body = JSON.parse(String(text || '{}')); } catch (_) {}
    if (!response.ok) {
      var error = new Error('fetch_upload_http_' + String(response.status || 0));
      error.httpStatus = Number(response.status || 0);
      throw error;
    }
    try { console.debug('[OSG TOC] Worker POST transport=fetch-fallback', url); } catch (_) {}
    return body;
  }

  async function postJson(url, payload, token) {
    var response;
    try {
      response = await gmRequest({
        method: 'POST',
        url: url,
        timeout: 45000,
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + token
        },
        data: JSON.stringify(payload)
      });
    } catch (gmError) {
      try { console.warn('[OSG TOC] GM POST failed; trying fetch fallback', String(gmError && gmError.message || gmError)); } catch (_) {}
      try {
        return await fetchPostJson(url, payload, token);
      } catch (fetchError) {
        var combined = new Error(
          'gm_then_fetch_failed:' +
          String(gmError && gmError.message || gmError) +
          ';' +
          String(fetchError && fetchError.message || fetchError)
        );
        combined.gmError = String(gmError && gmError.message || gmError);
        combined.fetchError = String(fetchError && fetchError.message || fetchError);
        throw combined;
      }
    }
    var body = {};
    try { body = JSON.parse(String(response.responseText || '{}')); } catch (_) {}
    var status = Number(response.status || 0);
    if (status < 200 || status >= 300) {
      var detail = String(body && (body.detail || body.error) || '').replace(/\s+/g, ' ').slice(0, 220);
      var error = new Error('upload_http_' + String(status) + (detail ? ':' + detail : ''));
      error.httpStatus = status;
      error.responseError = detail;
      throw error;
    }
    return body;
  }

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
    try { head = new TextDecoder().decode(bytes.slice(0, 512)).trimStart().toLowerCase(); } catch (_) {}
    if (head.indexOf('<?xml') === 0 || head.indexOf('<svg') === 0 || head.indexOf('<svg ') >= 0) return 'image/svg+xml';
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 12 && String.fromCharCode.apply(null, bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode.apply(null, bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
    if (bytes.length >= 6) {
      var gif = String.fromCharCode.apply(null, bytes.slice(0, 6));
      if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
    }
    var clean = String(declared || '').split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg');
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
    var live = candidate && candidate.element && candidate.element.currentSrc
      ? normalizeUrl(candidate.element.currentSrc, location.href)
      : '';
    return live || String(candidate && candidate.url || '');
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
    var scope = root || document;
    var pageUrl = baseUrl || location.href;
    var source = sourceName || 'live_dom';
    var rows = [];
    var seen = {};
    var blocks = Array.prototype.slice.call(scope.querySelectorAll([
      'figure',
      '[role="figure"]',
      '[data-figure]',
      '[class*="article-figure"]',
      '[class*="figure-viewer"]',
      '[class*="figure-wrap"]',
      '[class*="figure-container"]',
      '[class*="scheme"]',
      '[class*="chart"]',
      '[id*="figure"]',
      '[id*="scheme"]',
      '[id*="chart"]'
    ].join(',')));
    blocks.forEach(function (block, blockIndex) {
      var context = String(block.innerText || block.textContent || '').replace(/\s+/g, ' ').trim();
      if (/visual\s*abstract|graphical\s*abstract|toc\s*(?:graphic|image)|journal\s*cover|issue\s*cover/i.test(context.slice(0, 1400))) return;
      if (!/\b(?:Figure|Fig\.?|Scheme|Chart)\s*[A-Za-z]?\d+[A-Za-z]?\b/i.test(context.slice(0, 2200))) return;
      var label = articleFigureLabel(context, blockIndex);
      var caption = context.slice(0, 600);
      Array.prototype.slice.call(block.querySelectorAll('img,source')).forEach(function (node) {
        articleFigureImageUrls(node, pageUrl).forEach(function (url, variantRank) {
          if (!url || reject(context, url) || !candidateBelongsToJob(url, job)) return;
          var key = label.toLowerCase() + '::' + url;
          if (seen[key]) return;
          seen[key] = true;
          var img = node instanceof HTMLSourceElement ? (node.parentElement && node.parentElement.querySelector('img')) : node;
          rows.push({
            url: url,
            kind: 'article_figure',
            assetType: 'article_figure',
            label: label,
            text: caption,
            source: source + '_figure',
            score: (/^Figure 1$/i.test(label) ? 100 : /^Figure|^Scheme|^Chart/i.test(label) ? 90 : 70) - Math.min(variantRank, 8),
            width: Number(img && (img.naturalWidth || img.width) || 0),
            height: Number(img && (img.naturalHeight || img.height) || 0),
            element: img instanceof HTMLImageElement ? img : null
          });
        });
      });
    });
    if (rows.length < 2) {
      Array.prototype.slice.call(scope.querySelectorAll('img,source')).forEach(function (node, imageIndex) {
        var context = contextFor(node);
        if (!/(?:\b(?:Figure|Fig\.?|Scheme|Chart)\s*[A-Za-z]?\d+[A-Za-z]?\b|substrate\s+scope|reaction\s+scope|mechanis|catalytic\s+cycle|optimization|reaction\s+conditions)/i.test(context)) return;
        if (/visual\s*abstract|graphical\s*abstract|toc\s*(?:graphic|image)/i.test(context.slice(0, 1600))) return;
        var label = articleFigureLabel(context, imageIndex);
        articleFigureImageUrls(node, pageUrl).forEach(function (url, variantRank) {
          if (!url || reject(context, url) || !candidateBelongsToJob(url, job)) return;
          var key = label.toLowerCase() + '::' + url;
          if (seen[key]) return;
          seen[key] = true;
          var img = node instanceof HTMLSourceElement ? (node.parentElement && node.parentElement.querySelector('img')) : node;
          rows.push({
            url: url,
            kind: 'article_figure',
            assetType: 'article_figure',
            label: label,
            text: context.slice(0, 600),
            source: source + '_context_figure',
            score: (/^Figure 1$/i.test(label) ? 96 : /^Figure|^Scheme|^Chart/i.test(label) ? 86 : 66) - Math.min(variantRank, 8),
            width: Number(img && (img.naturalWidth || img.width) || 0),
            height: Number(img && (img.naturalHeight || img.height) || 0),
            element: img instanceof HTMLImageElement ? img : null
          });
        });
      });
    }

    rows.sort(function (a, b) { return b.score - a.score || String(a.label).localeCompare(String(b.label)); });
    var variantsPerLabel = {};
    var selected = rows.filter(function (row) {
      var key = String(row.label || '').toLowerCase();
      variantsPerLabel[key] = Number(variantsPerLabel[key] || 0) + 1;
      return variantsPerLabel[key] <= 3;
    }).slice(0, 24);
    pushTrace(trace, {
      stage: 'figure_discovery',
      event: 'scan_complete',
      status: selected.length ? 'found' : 'none',
      message: source + ';figures=' + String(selected.length)
    });
    return selected;
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

  function collectCandidates(job, trace, root, baseUrl, sourceName, quiet) {
    var scope = root || document;
    var pageUrl = baseUrl || location.href;
    var publisher = String(job.publisher || publisherForDoi(job.doi));
    var allowFigureOne = String(job.state || '') === 'no_visual';
    var source = sourceName || 'live_dom';
    var map = new Map();

    scope.querySelectorAll('img,source,object[type^="image"],svg image').forEach(function (node) {
      imageUrls(node, pageUrl).forEach(function (url) {
        var row = scoreCandidate(node, url, publisher, allowFigureOne, source);
        if (!row) return;
        var old = map.get(url);
        if (!old || row.score > old.score) map.set(url, row);
      });
    });

    scope.querySelectorAll('meta[name="citation_graphical_abstract"],meta[name="citation_visual_abstract"],meta[name="citation_toc_graphic"],meta[name="citation_abstract_image"],meta[name="graphical_abstract"],meta[property="citation_graphical_abstract"],meta[property="citation_visual_abstract"],meta[property="citation_toc_graphic"]').forEach(function (meta) {
      var url = normalizeUrl(meta.getAttribute('content') || '', pageUrl);
      if (!url || map.has(url) || reject('', url)) return;
      var key = String(meta.getAttribute('name') || meta.getAttribute('property') || '').toLowerCase();
      var type = key.indexOf('toc') >= 0 ? 'toc_graphic'
        : key.indexOf('abstract_image') >= 0 ? 'abstract_image'
        : 'graphical_abstract';
      map.set(url, {
        url: url,
        kind: 'official',
        assetType: type,
        score: 640,
        source: source + '_metadata',
        text: key || 'graphical abstract metadata',
        width: 0,
        height: 0,
        element: null
      });
    });

    var html = '';
    try {
      html = scope.documentElement ? scope.documentElement.innerHTML : (scope.outerHTML || '');
    } catch (_) {}
    var patterns = [
      /["']([^"']*(?:graphical[-_]?abstract|visual[-_]?abstract|toc[-_]?(?:graphic|image)|central[-_]?illustration)[^"']*\.(?:avif|webp|png|jpe?g|gif|svg)(?:\?[^"']*)?)["']/gi,
      /["']([^"']*(?:-gra-0*1|[\/_-](?:ga|fx)0*1)[^"']*\.(?:avif|webp|png|jpe?g|gif|svg)(?:\?[^"']*)?)["']/gi,
      /["']([^"']*(?:-fig-?0*1|[\/_-]fig(?:ure)?0*1|_fig0*1_html|[\/_-](?:f|gr)0*1)[^"']*\.(?:avif|webp|png|jpe?g|gif|svg)(?:\?[^"']*)?)["']/gi
    ];
    patterns.forEach(function (pattern) {
      var match;
      var count = 0;
      while ((match = pattern.exec(html)) !== null && count < 100) {
        count += 1;
        var raw = String(match[1] || '').replace(/\\u002f/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
        var url = normalizeUrl(raw, pageUrl);
        if (!url || map.has(url) || reject('', url)) continue;
        var type = officialType('', url, publisher);
        var kind = type ? 'official' : '';
        if (!kind && allowFigureOne && isFigureOne(url)) {
          kind = 'figure1';
          type = 'figure1_fallback';
        }
        if (!kind) continue;
        map.set(url, {
          url: url,
          kind: kind,
          assetType: type,
          score: kind === 'official' ? 380 : 220,
          source: source + '_raw_html',
          text: '',
          width: 0,
          height: 0,
          element: null
        });
      }
    });

    // ACS/Silverchair and some publisher pages use generic image filenames
    // (for example m_ol..._0007.svg) while the surrounding HTML says
    // "Visual Abstract". Recover those images from semantic windows instead
    // of requiring the filename itself to contain toc/graphical/visual.
    var strongSemantic = /toc\s*(?:and\s*abstract\s*)?(?:graphic|image)|graphical\s*abstract|visual\s*abstract|graphical\s*(?:summary|synopsis)|visual\s*summary|abstract\s*(?:graphic|image)|table\s*of\s*contents\s*(?:graphic|image)|first\s+page\s+image/gi;
    var semanticMatch;
    var semanticWindows = 0;
    while ((semanticMatch = strongSemantic.exec(html)) !== null && semanticWindows < 30) {
      semanticWindows += 1;
      var fragment = html.slice(semanticMatch.index, Math.min(html.length, semanticMatch.index + 7000));
      var semanticContext = htmlText(fragment).slice(0, 2600);
      var semanticType = officialType(semanticContext, '', publisher);
      if (!semanticType) continue;
      var tags = String(fragment).match(/<(?:img|source)\b[^>]*>/gi) || [];
      for (var ti = 0; ti < Math.min(tags.length, 12); ti += 1) {
        var parsed = rawTagImageUrls(tags[ti], pageUrl);
        var ownMarker = [
          parsed.attrs.alt, parsed.attrs.title, parsed.attrs.id, parsed.attrs.class, parsed.attrs['aria-label']
        ].filter(Boolean).join(' ');
        var ownType = officialType(ownMarker, '', publisher);
        if (!ownType && ti > 0) continue;
        if (!ownType && isFigureOne(ownMarker)) continue;
        parsed.urls.forEach(function (url) {
          if (!url || reject(ownMarker + ' ' + semanticContext, url)) return;
          var old = map.get(url);
          var row = {
            url: url,
            kind: 'official',
            assetType: ownType || semanticType,
            score: ownType ? 610 : 540,
            source: source + '_semantic_window',
            text: (ownMarker + ' ' + semanticContext).replace(/\s+/g, ' ').trim().slice(0, 1000),
            width: Number(parsed.attrs.width || 0),
            height: Number(parsed.attrs.height || 0),
            element: findLiveImageElement(scope, url, pageUrl)
          };
          if (!old || row.score > old.score) map.set(url, row);
        });
      }
    }

    var allRows = Array.from(map.values());
    var rows = allRows.filter(function (row) {
      return candidateBelongsToJob(row.url, job);
    }).sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === 'official' ? -1 : 1;
      return b.score - a.score;
    });
    if (!quiet && allRows.length !== rows.length) {
      pushTrace(trace, {
        stage: 'candidate_discovery',
        event: 'cross_doi_rejected',
        status: 'filtered',
        message: source + ';rejected=' + String(allRows.length - rows.length)
      });
    }
    if (!quiet) {
      pushTrace(trace, {
        stage: 'candidate_discovery',
        event: 'scan_complete',
        status: rows.length ? 'found' : 'none',
        message: source + ';official=' + rows.filter(function (x) { return x.kind === 'official'; }).length + ';figure1=' + rows.filter(function (x) { return x.kind === 'figure1'; }).length
      });
      rows.slice(0, 10).forEach(function (row) {
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
    }
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
    try {
      var response = await fetch(requestUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'force-cache',
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
        url: requestUrl
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
        method: 'page_fetch'
      };
    } catch (error) {
      pushTrace(trace, {
        stage: 'page_fetch',
        event: 'failed',
        status: 'failed',
        url: requestUrl,
        message: String(error && error.message || error)
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
    try {
      var response = await gmRequest({
        method: 'GET',
        url: requestUrl,
        responseType: 'arraybuffer',
        timeout: 35000,
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
        url: requestUrl,
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
    if (!image) image = await gmFetchCandidate(candidate, trace);
    if (!image) image = await canvasCandidate(candidate, trace);
    if (!image) return null;
    var measured = await measureImageData(image.imageData);
    image.width = Number(measured.width || 0);
    image.height = Number(measured.height || 0);
    return image;
  }

  async function uploadArticleFigure(job, candidate, image, trace, token, order) {
    var payload = {
      doi: job.doi,
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
      stage: 'figure_upload',
      event: 'start',
      status: 'start',
      url: candidate.url,
      message: candidate.label || '',
      byteLength: image.byteLength
    });
    try {
      var result = await postJson(FIGURE_IMPORT_ENDPOINT, payload, token);
      pushTrace(trace, {
        stage: 'figure_upload',
        event: 'complete',
        status: 'ok',
        url: candidate.url,
        message: candidate.label || '',
        byteLength: image.byteLength
      });
      return Object.assign({}, result || {}, { staged: false });
    } catch (error) {
      pushTrace(trace, {
        stage: 'figure_upload',
        event: 'failed',
        status: 'failed',
        httpStatus: Number(error && error.httpStatus || 0),
        url: candidate.url,
        message: String(error && error.message || error)
      });
      var status = Number(error && error.httpStatus || 0);
      if (status < 500) throw error;
      pushTrace(trace, {
        stage: 'figure_stage',
        event: 'start',
        status: 'start',
        url: candidate.url,
        message: 'D1 import unavailable; preserving figure in R2',
        byteLength: image.byteLength
      });
      try {
        var staged = await postJson(FIGURE_STAGE_ENDPOINT, payload, token);
        pushTrace(trace, {
          stage: 'figure_stage',
          event: 'complete',
          status: 'ok',
          url: staged && staged.imageUrl || candidate.url,
          message: candidate.label || '',
          imageWidth: Number(image.width || 0),
          imageHeight: Number(image.height || 0),
          byteLength: image.byteLength
        });
        return Object.assign({}, staged || {}, { staged: true });
      } catch (stageError) {
        pushTrace(trace, {
          stage: 'figure_stage',
          event: 'failed',
          status: 'failed',
          httpStatus: Number(stageError && stageError.httpStatus || 0),
          url: candidate.url,
          message: String(stageError && stageError.message || stageError)
        });
        throw stageError;
      }
    }
  }

  async function uploadCapture(job, candidate, image, trace, token) {
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
      var result = await postJson(CAPTURE_ENDPOINT, {
        doi: job.doi,
        kind: candidate.kind,
        imageData: image.imageData,
        articleUrl: location.href,
        sourceUrl: candidate.url,
        caption: candidate.text || '',
        capturedAt: nowIso(),
        source: 'tampermonkey-toc-mainline'
      }, token);
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
    var trace = [];
    var token = writeToken();
    job.publisher = String(job.publisher || publisherForDoi(job.doi));
    job.startedAt = job.startedAt || nowIso();
    var mediaNeed = String(job.mediaNeed || (String(job.state || '') === 'figure_gap' ? 'figures' : 'toc'));
    var needFigures = mediaNeed.indexOf('figures') >= 0;
    var needToc = mediaNeed !== 'figures';
    pushTrace(trace, {
      stage: 'job',
      event: 'start',
      status: 'running',
      url: location.href,
      message: 'v' + VERSION + ';state=' + String(job.state || '') + ';need=' + mediaNeed
    });

    if (!token) {
      pushTrace(trace, { stage: 'config', event: 'write_token', status: 'missing', message: 'configure token from Tampermonkey menu' });
      GM_setValue(resultKey(job.doi), { doi: job.doi, status: 'failed', reason: 'write_token_missing', finishedAt: nowIso() });
      GM_setValue(traceKey(job.doi), { doi: job.doi, status: 'failed', reason: 'write_token_missing', trace: trace, finishedAt: nowIso() });
      return;
    }

    try {
      var figuresImported = 0;
      var figuresStaged = 0;
      var figureCandidateForReport = null;
      var figureError = null;

      if (needFigures) {
        var figureCandidates = await waitForArticleFigures(job, trace);
        if (!figureCandidates.length) {
          figureError = new Error('no_article_figure_candidate_in_live_dom');
        } else {
          var importedFigureLabels = {};
          for (var fi = 0; fi < Math.min(18, figureCandidates.length); fi += 1) {
            if (isAbortRequested()) throw new Error('user_aborted');
            var figureCandidate = figureCandidates[fi];
            var figureLabelKey = String(figureCandidate.label || '').toLowerCase();
            if (importedFigureLabels[figureLabelKey]) continue;
            try {
              var figureImage = await acquireImage(figureCandidate, trace);
              if (!figureImage) {
                figureError = new Error('article_figure_image_unreadable');
                continue;
              }
              var resolution = articleFigureResolution(figureImage.width, figureImage.height);
              pushTrace(trace, {
                stage: 'figure_quality',
                event: 'measured',
                status: resolution.quality,
                url: figureCandidate.url,
                message: String(figureImage.width || 0) + 'x' + String(figureImage.height || 0) + ';label=' + String(figureCandidate.label || ''),
                imageWidth: Number(figureImage.width || 0),
                imageHeight: Number(figureImage.height || 0)
              });
              if (!resolution.usable) {
                figureError = new Error('article_figure_resolution_' + resolution.quality);
                continue;
              }
              var figureStored = await uploadArticleFigure(job, figureCandidate, figureImage, trace, token, figuresImported + figuresStaged);
              importedFigureLabels[figureLabelKey] = true;
              figureCandidateForReport = figureCandidateForReport || figureCandidate;
              if (figureStored && figureStored.staged) figuresStaged += 1;
              else figuresImported += 1;
              if (figuresImported + figuresStaged >= 5) break;
            } catch (oneFigureError) {
              figureError = oneFigureError;
              pushTrace(trace, {
                stage: 'figure_candidate',
                event: 'failed',
                status: 'failed',
                url: figureCandidate.url,
                message: String(oneFigureError && oneFigureError.message || oneFigureError)
              });
            }
          }
        }
      }

      var tocStored = null;
      var tocCandidateForReport = null;
      var tocMethod = '';

      if (needToc) {
        var candidates = await waitForCandidates(job, trace);
        if (!candidates.length) throw new Error('no_toc_candidate_in_live_dom');
        var lastError = null;
        for (var i = 0; i < Math.min(10, candidates.length); i += 1) {
          if (isAbortRequested()) throw new Error('user_aborted');
          var candidate = candidates[i];
          try {
            var image = await acquireImage(candidate, trace);
            if (!image) {
              lastError = new Error('candidate_image_unreadable');
              continue;
            }
            tocStored = await uploadCapture(job, candidate, image, trace, token);
            tocCandidateForReport = candidate;
            tocMethod = image.method;
            break;
          } catch (candidateError) {
            lastError = candidateError;
            pushTrace(trace, {
              stage: 'candidate',
              event: 'failed',
              status: 'failed',
              url: candidate.url,
              candidateKind: candidate.kind,
              candidateSource: candidate.source,
              candidateScore: candidate.score,
              message: String(candidateError && candidateError.message || candidateError)
            });
          }
        }
        if (!tocStored) throw lastError || new Error('all_candidates_failed');
      }

      if (needFigures && figuresImported + figuresStaged < 1) {
        throw figureError || new Error('article_figure_capture_failed');
      }

      var figureTotal = figuresImported + figuresStaged;
      var reason = needToc
        ? 'captured_' + tocMethod + (needFigures ? ';figures=' + String(figureTotal) + ';imported=' + String(figuresImported) + ';staged=' + String(figuresStaged) : '')
        : figuresStaged > 0
          ? 'captured_article_figures:' + String(figureTotal) + ';imported=' + String(figuresImported) + ';staged=' + String(figuresStaged)
          : 'captured_article_figures:' + String(figuresImported);
      var reportCandidate = tocCandidateForReport || figureCandidateForReport;
      await uploadReport(job, trace, 'success', reason, reportCandidate, token);
      GM_setValue(resultKey(job.doi), {
        doi: job.doi,
        status: 'success',
        reason: reason,
        kind: tocCandidateForReport && tocCandidateForReport.kind || (figureTotal ? 'article_figure' : ''),
        assetType: tocCandidateForReport && tocCandidateForReport.assetType || (figureTotal ? 'article_figure' : ''),
        imageUrl: tocStored && tocStored.imageUrl || '',
        figuresImported: figuresImported,
        figuresStaged: figuresStaged,
        finishedAt: nowIso()
      });
      GM_deleteValue(progressKey(job.doi));
      return;
    } catch (error) {
      if (String(error && error.message || error) === 'user_aborted') {
        pushTrace(trace, { stage: 'job', event: 'aborted', status: 'aborted', message: 'user_aborted' });
        await uploadReport(job, trace, 'aborted', 'user_aborted', null, token);
        GM_setValue(resultKey(job.doi), { doi: job.doi, status: 'aborted', reason: 'user_aborted', finishedAt: nowIso() });
        GM_setValue(traceKey(job.doi), { doi: job.doi, status: 'aborted', reason: 'user_aborted', trace: trace, finishedAt: nowIso() });
        GM_deleteValue(progressKey(job.doi));
        return;
      }
      var reason = failureReason(trace, error);
      pushTrace(trace, { stage: 'job', event: 'failed', status: 'failed', message: reason });
      await uploadReport(job, trace, 'failed', reason, null, token);
      GM_setValue(resultKey(job.doi), { doi: job.doi, status: 'failed', reason: reason, finishedAt: nowIso() });
      GM_deleteValue(progressKey(job.doi));
    }
  }

  function isGalleryPage() {
    return (location.hostname === GALLERY_HOST && location.pathname.indexOf(GALLERY_PATH) === 0)
      || location.hostname === 'organic-synthesis-gallery-public.pages.dev';
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

  function acquireLease() {
    var now = Date.now();
    var lease = GM_getValue(LEASE_KEY, null);
    if (lease && Number(lease.expiresAt || 0) > now && lease.owner !== CONTROLLER_ID) return false;
    GM_setValue(LEASE_KEY, { owner: CONTROLLER_ID, expiresAt: now + 90000 });
    return true;
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

  async function waitForResult(job, tab) {
    var timeout = job.publisher === 'wiley' ? 9 * 60 * 1000 : 180000;
    var started = Date.now();
    var heartbeatDeadlineMs = 35000;
    var heartbeatValidated = false;
    while (Date.now() - started < timeout) {
      renewLease();

      if (!heartbeatValidated) {
        var hb = currentPublisherHeartbeat();
        var elapsedForHeartbeat = Date.now() - started;
        if (hb && Number(hb.at || 0) >= started - 2000) {
          var hbDoi = normalizeDoi(hb.doi || '');
          if (hbDoi === normalizeDoi(job.doi) && String(hb.version || '')) {
            heartbeatValidated = true;
            GM_setValue(progressKey(job.doi), {
              status: 'publisher_heartbeat_ok',
              at: nowIso(),
              url: String(hb.href || ''),
              version: String(hb.version || ''),
              host: String(hb.host || '')
            });
          } else if (elapsedForHeartbeat >= heartbeatDeadlineMs) {
            var mismatchReason = 'publisher_userscript_running_job_not_seen';
            await uploadControllerReport(job, mismatchReason, {
              status: String(hb.state || 'script_loaded'),
              at: String(hb.atIso || nowIso()),
              url: String(hb.href || ''),
              version: String(hb.version || ''),
              host: String(hb.host || '')
            }, 'failed');
            try { if (tab && tab.close) tab.close(); } catch (_) {}
            return {
              doi: job.doi,
              status: 'failed',
              reason: mismatchReason,
              diagnosticUploaded: true,
              publisherHeartbeat: hb,
              finishedAt: nowIso()
            };
          }
        } else if (elapsedForHeartbeat >= heartbeatDeadlineMs) {
          var noHeartbeatReason = 'publisher_userscript_not_running';
          await uploadControllerReport(job, noHeartbeatReason, null, 'failed');
          try { if (tab && tab.close) tab.close(); } catch (_) {}
          return {
            doi: job.doi,
            status: 'failed',
            reason: noHeartbeatReason,
            diagnosticUploaded: true,
            finishedAt: nowIso()
          };
        }
      }
      if (isAbortRequested()) {
        var abortProgress = GM_getValue(progressKey(job.doi), null);
        await uploadControllerReport(job, 'user_aborted', abortProgress, 'aborted');
        try { if (tab && tab.close) tab.close(); } catch (_) {}
        return { doi: job.doi, status: 'aborted', reason: 'user_aborted', diagnosticUploaded: true, finishedAt: nowIso() };
      }
      var result = GM_getValue(resultKey(job.doi), null);
      if (result && result.finishedAt) {
        try { if (tab && tab.close) tab.close(); } catch (_) {}
        return result;
      }
      var progress = GM_getValue(progressKey(job.doi), null);
      if (progress && (progress.status === 'auth_wait' || progress.status === 'challenge_wait')) {
        badge((jobKind(job) === 'figures' ? '正文图' : 'TOC') + '：等待认证 ' + job.doi + '，请完成出版社页面验证', '#92400e');
      } else {
        badge((jobKind(job) === 'figures' ? '正文图' : 'TOC') + '：正在抓取 ' + job.doi, '#1f2937');
      }
      await sleep(1200);
    }
    var lastProgress = GM_getValue(progressKey(job.doi), null);
    await uploadControllerReport(job, 'controller_timeout', lastProgress, 'failed');
    try { if (tab && tab.close) tab.close(); } catch (_) {}
    return {
      doi: job.doi,
      status: 'failed',
      reason: 'controller_timeout',
      diagnosticUploaded: true,
      lastProgress: lastProgress && lastProgress.status || '',
      finishedAt: nowIso()
    };
  }

  function currentGalleryDoiAuthority() {
    var registry = document.getElementById('gallery-literature-doi-registry');
    if (registry) {
      try {
        var payload = JSON.parse(String(registry.textContent || '{}'));
        var registryDois = Array.isArray(payload && payload.dois) ? payload.dois : [];
        var registrySet = new Set(registryDois.map(normalizeDoi).filter(Boolean));
        if (registrySet.size) return { source: 'registry', dois: registrySet, count: registrySet.size };
      } catch (_) {}
    }

    var fallbackSet = new Set();
    Array.prototype.slice.call(document.querySelectorAll('article.card:not(.bridge-staging-card) .toc-slot[data-doi]')).forEach(function (node) {
      var doi = normalizeDoi(node.getAttribute('data-doi'));
      if (doi) fallbackSet.add(doi);
    });
    if (fallbackSet.size) return { source: 'rendered_cards', dois: fallbackSet, count: fallbackSet.size };
    return null;
  }

  async function waitForGalleryDoiAuthority() {
    for (var attempt = 0; attempt < 30; attempt += 1) {
      var authority = currentGalleryDoiAuthority();
      if (authority && authority.count > 0) return authority;
      await sleep(250);
    }
    return null;
  }

  function filterJobsByGalleryAuthority(rows, authority) {
    if (!authority || !authority.dois) return [];
    return (rows || []).filter(function (job) {
      var doi = normalizeDoi(job && job.doi);
      return doi && authority.dois.has(doi);
    });
  }

  async function controllerRun() {
    if (!isGalleryPage()) return;
    if (GM_getValue(ENABLED_KEY, true) === false) {
      badge('媒体抓取主线已暂停', '#6b7280');
      return;
    }
    if (isAbortRequested()) {
      badge('媒体抓取本批已中止；可从 Tampermonkey 菜单继续', '#6b7280');
      return;
    }
    var token = writeToken();
    if (!token) {
      badge('媒体抓取：请先从 Tampermonkey 菜单设置 R2 写入令牌', '#991b1b');
      return;
    }
    if (!acquireLease()) {
      badge('媒体抓取：另一个 Gallery 标签正在执行', '#374151');
      return;
    }

    var queue;
    try {
      badge('媒体抓取：读取 TOC + 正文图缺口队列…', '#1f2937');
      queue = await getJson(QUEUE_URL + '?ts=' + Date.now());
    } catch (error) {
      badge('媒体队列读取失败：' + String(error && error.message || error), '#991b1b');
      return;
    }

    var authority = await waitForGalleryDoiAuthority();
    if (!authority) {
      badge('媒体抓取：等待当前 Gallery 文献清单，未打开任何出版社页面', '#92400e');
      GM_deleteValue(LEASE_KEY);
      return;
    }

    var rawVisible = Array.isArray(queue.visibleGaps) ? queue.visibleGaps : [];
    var rawUpgrades = Array.isArray(queue.officialUpgrades) ? queue.officialUpgrades : [];
    var visible = filterJobsByGalleryAuthority(rawVisible, authority);
    var upgrades = filterJobsByGalleryAuthority(rawUpgrades, authority);
    var queueGeneratedAt = String(queue.generatedAt || '');
    var filteredNotOnPage = (rawVisible.length - visible.length) + (rawUpgrades.length - upgrades.length);
    var liveCaptures = await readLiveCaptureKinds();
    var reconciled = reconcileQueueWithLiveCaptures(visible, upgrades, liveCaptures);
    visible = reconciled.visible;
    upgrades = reconciled.upgrades;
    var rawQueuedFigures = Array.isArray(queue.figureGaps) ? queue.figureGaps.map(function (raw) {
      var job = Object.assign({}, raw);
      job.doi = normalizeDoi(job.doi);
      job.publisher = String(job.publisher || publisherForDoi(job.doi));
      job.state = 'figure_gap';
      job.mediaNeed = 'figures';
      job.existingReason = String(job.existingReason || 'live_article_figure_gap');
      job.figureCount = Math.max(0, Number(job.figureCount || 0));
      return job;
    }).filter(function (job) { return Boolean(job.doi); }) : stagedFigureJobs();
    var queuedFigures = filterJobsByGalleryAuthority(rawQueuedFigures, authority);
    filteredNotOnPage += rawQueuedFigures.length - queuedFigures.length;
    var figureOnly = queuedFigures.slice();
    var allJobs = visible.concat(upgrades, figureOnly);
    visible = executableJobs(visible, queueGeneratedAt);
    upgrades = executableJobs(upgrades, queueGeneratedAt);
    figureOnly = executableJobs(figureOnly, queueGeneratedAt);
    var limit = batchSize();

    // Priority:
    // 1) newest papers with no visual/TOC
    // 2) remaining no-visual TOC gaps
    // 3) article figures
    // 4) fallback-only official TOC upgrades (including Figure 1)
    var jobs = selectBatchJobs(visible, limit);
    var selectedDois = {};
    jobs.forEach(function (job) {
      var doi = normalizeDoi(job && job.doi);
      if (doi) selectedDois[doi] = true;
    });

    if (jobs.length < limit) {
      var figureCandidates = figureOnly.filter(function (job) {
        return !selectedDois[normalizeDoi(job && job.doi)];
      });
      var selectedFigures = selectBatchJobs(figureCandidates, limit - jobs.length);
      jobs = jobs.concat(selectedFigures);
      selectedFigures.forEach(function (job) {
        var doi = normalizeDoi(job && job.doi);
        if (doi) selectedDois[doi] = true;
      });
    }

    if (jobs.length < limit) {
      var delayedUpgrades = upgrades.filter(function (job) {
        return !selectedDois[normalizeDoi(job && job.doi)];
      });
      jobs = jobs.concat(selectBatchJobs(delayedUpgrades, limit - jobs.length));
    }
    var cooling = allJobs.filter(function (queued) {
      var doi = normalizeDoi(queued && queued.doi);
      return doi ? isFailureCooling(queued) : false;
    });
    var cooldownSkipped = cooling.length;
    var summary = {
      version: VERSION,
      queueGeneratedAt: queueGeneratedAt,
      startedAt: nowIso(),
      queueTotal: allJobs.length,
      batchSize: limit,
      total: jobs.length,
      visible: visible.length,
      upgrades: upgrades.length,
      figureGaps: queuedFigures.length,
      figureOnly: figureOnly.length,
      tocVisiblePriority: visible.length,
      delayedTocUpgrades: upgrades.length,
      cooldownSkipped: cooldownSkipped,
      filteredByLiveR2: Number(reconciled.filteredByR2 || 0),
      galleryAuthoritySource: authority.source,
      galleryAuthorityCount: authority.count,
      filteredNotOnPage: filteredNotOnPage,
      success: 0,
      failed: 0,
      skipped: 0,
      aborted: 0,
      results: []
    };

    for (var i = 0; i < jobs.length; i += 1) {
      if (GM_getValue(ENABLED_KEY, true) === false || isAbortRequested()) break;
      var job = Object.assign({}, jobs[i]);
      job.doi = normalizeDoi(job.doi);
      if (!job.doi) continue;

      var liveAuthority = currentGalleryDoiAuthority();
      if (!liveAuthority || !liveAuthority.dois.has(job.doi)) {
        summary.skipped += 1;
        summary.filteredNotOnPage += 1;
        continue;
      }

      job.publisher = String(job.publisher || publisherForDoi(job.doi));
      job.queueGeneratedAt = queueGeneratedAt;
      job.startedAt = nowIso();

      var taskKind = jobKind(job);
      var prior = GM_getValue(attemptKey(job.doi, job.queueGeneratedAt, taskKind), null);
      if (prior && prior.status === 'success') {
        summary.skipped += 1;
        continue;
      }

      GM_deleteValue(resultKey(job.doi));
      GM_deleteValue(progressKey(job.doi));
      GM_deleteValue(HEARTBEAT_KEY);
      GM_setValue(ACTIVE_JOB_KEY, job);
      badge((jobKind(job) === 'figures' ? '正文图' : 'TOC') + ' ' + String(i + 1) + '/' + String(jobs.length) + '：' + job.doi, '#1f2937');

      var tab = null;
      var result = null;
      try {
        tab = GM_openInTab(articleUrl(job), {
          active: job.publisher === 'wiley',
          insert: true,
          setParent: true
        });
        result = await waitForResult(job, tab);
      } catch (openError) {
        var openReason = 'controller_tab_launch_failed:' + String(openError && openError.message || openError).slice(0, 160);
        await uploadControllerReport(job, openReason, null, 'failed');
        result = { doi: job.doi, status: 'failed', reason: openReason, diagnosticUploaded: true, finishedAt: nowIso() };
      }
      summary.results.push(result);
      GM_setValue(attemptKey(job.doi, job.queueGeneratedAt, taskKind), result);
      if (result.status === 'success') {
        summary.success += 1;
        GM_deleteValue(failureKey(job.doi, taskKind));
      } else if (result.status === 'aborted') {
        summary.aborted += 1;
      } else {
        summary.failed += 1;
        GM_setValue(failureKey(job.doi, taskKind), {
          at: Date.now(),
          reason: String(result.reason || 'failed').slice(0, 220),
          engineRevision: FAILURE_ENGINE_REVISION
        });
      }
      GM_deleteValue(ACTIVE_JOB_KEY);
      if (result.status === 'aborted' || isAbortRequested()) break;
      await sleep(3500);
    }

    summary.finishedAt = nowIso();
    GM_setValue(SUMMARY_KEY, summary);
    GM_deleteValue(ACTIVE_JOB_KEY);

    var remaining = executableJobs(allJobs, queueGeneratedAt);
    if (summary.aborted || isAbortRequested()) {
      badge('媒体抓取本批已中止：成功 ' + summary.success + '，失败 ' + summary.failed + '，中止 ' + summary.aborted, '#6b7280');
    } else if (remaining.length > 0) {
      badge('媒体抓取本批完成：' + summary.total + '/' + summary.queueTotal + '；成功 ' + summary.success + '，失败 ' + summary.failed + '；约 12 秒后自动继续，剩余 ' + remaining.length, summary.failed ? '#92400e' : '#065f46');
      if (nextBatchTimer !== null) clearTimeout(nextBatchTimer);
      nextBatchTimer = window.setTimeout(function () {
        nextBatchTimer = null;
        if (GM_getValue(ENABLED_KEY, true) !== false && !isAbortRequested()) controllerRun();
      }, NEXT_BATCH_DELAY_MS);
    } else {
      badge('媒体抓取当前可执行队列已完成：成功 ' + summary.success + '，失败 ' + summary.failed + '，冷却跳过 ' + summary.cooldownSkipped, summary.failed ? '#92400e' : '#065f46');
    }
  }

  async function publisherBoot() {
    if (location.hostname === 'doi.org') return;
    writePublisherHeartbeat(null, 'script_loaded');
    var job = GM_getValue(ACTIVE_JOB_KEY, null);
    if (!job || !normalizeDoi(job.doi)) {
      writePublisherHeartbeat(null, 'active_job_missing');
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
    GM_registerMenuCommand('立即运行媒体抓取队列', function () {
      GM_deleteValue(ABORT_KEY);
      GM_setValue(ENABLED_KEY, true);
      GM_deleteValue(LEASE_KEY);
      if (isGalleryPage()) controllerRun();
      else window.open('https://' + GALLERY_HOST + GALLERY_PATH, '_blank');
    });
    GM_registerMenuCommand('中止当前媒体抓取批次', function () {
      GM_setValue(ABORT_KEY, { at: Date.now(), reason: 'user_aborted' });
      window.alert('已请求中止当前媒体抓取批次。正在运行的出版社标签页会由控制器关闭；人工中止不会计入失败或失败冷却。');
    });
    GM_registerMenuCommand('继续媒体抓取主线', function () {
      GM_deleteValue(ABORT_KEY);
      GM_setValue(ENABLED_KEY, true);
      GM_deleteValue(LEASE_KEY);
      if (isGalleryPage()) {
        setTimeout(controllerRun, 100);
      } else {
        window.open('https://' + GALLERY_HOST + GALLERY_PATH, '_blank');
      }
    });
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
      window.alert(JSON.stringify(GM_getValue(SUMMARY_KEY, {}), null, 2));
    });
    GM_registerMenuCommand('清除 TOC 失败冷却并立即重试', function () {
      var queueKeys = [];
      try {
        if (typeof GM_listValues === 'function') queueKeys = GM_listValues();
      } catch (_) {}
      queueKeys.filter(function (key) { return String(key).indexOf(P + 'failure:') === 0; })
        .forEach(function (key) { try { GM_deleteValue(key); } catch (_) {} });
      GM_deleteValue(LEASE_KEY);
      window.alert('已清除当前脚本版本的失败冷却。返回 Gallery 后可立即重新运行媒体抓取队列。');
    });
    GM_registerMenuCommand('清除卡住任务/租约', function () {
      var job = GM_getValue(ACTIVE_JOB_KEY, null);
      if (job && job.doi) {
        GM_deleteValue(resultKey(job.doi));
        GM_deleteValue(progressKey(job.doi));
      }
      GM_deleteValue(ACTIVE_JOB_KEY);
      GM_deleteValue(LEASE_KEY);
      window.alert('已清除当前任务和控制器租约。');
    });
  }

  installMenu();

  if (isGalleryPage()) {
    setTimeout(controllerRun, 1500);
    setInterval(function () {
      if (!GM_getValue(ACTIVE_JOB_KEY, null)) controllerRun();
    }, 30 * 60 * 1000);
  } else {
    publisherBoot();
  }
})();
