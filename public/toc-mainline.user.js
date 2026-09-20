// ==UserScript==
// @name         Organic Synthesis Gallery TOC Mainline
// @namespace    https://zhou526316-sys.github.io/organic-synthesis-gallery/
// @version      6.2.0
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
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      *
// @updateURL    https://zhou526316-sys.github.io/organic-synthesis-gallery/toc-mainline.user.js
// @downloadURL  https://zhou526316-sys.github.io/organic-synthesis-gallery/toc-mainline.user.js
// ==/UserScript==

(function () {
  'use strict';

  var VERSION = '6.2.0';
  var GALLERY_HOST = 'zhou526316-sys.github.io';
  var GALLERY_PATH = '/organic-synthesis-gallery/';
  var QUEUE_URL = 'https://zhou526316-sys.github.io/organic-synthesis-gallery/toc-demand-live.json';
  var WORKER = 'https://organic-synthesis-gallery.zhou526316.workers.dev';
  var CAPTURE_ENDPOINT = WORKER + '/api/media/local-capture/import';
  var REPORT_ENDPOINT = WORKER + '/api/media/tampermonkey-report/import';
  var P = 'osg-toc-v6:';
  var TOKEN_KEY = P + 'write-token';
  var LEGACY_TOKEN_KEY = 'osg-toc-v5:write-token';
  var ENABLED_KEY = P + 'enabled';
  var ACTIVE_JOB_KEY = P + 'active-job';
  var LEASE_KEY = P + 'controller-lease';
  var SUMMARY_KEY = P + 'last-run-summary';
  var BATCH_SIZE_KEY = P + 'batch-size';
  var FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  var DEFAULT_BATCH_SIZE = 8;
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
    if (publisher === 'acs') return 'https://pubs.acs.org/doi/' + doi;
    if (publisher === 'wiley') return 'https://onlinelibrary.wiley.com/doi/' + doi;
    if (publisher === 'nature') return 'https://www.nature.com/articles/' + suffix;
    if (publisher === 'science') return 'https://www.science.org/doi/' + doi;
    if (publisher === 'rsc') {
      var rsc = /^([a-z])(\d)([a-z]{2})/i.exec(suffix);
      if (rsc) return 'https://pubs.rsc.org/en/content/articlelanding/' + String(2020 + Number(rsc[2])) + '/' + rsc[3].toLowerCase() + '/' + suffix.toLowerCase();
    }
    return 'https://doi.org/' + doi;
  }

  function resultKey(doi) { return P + 'result:' + normalizeDoi(doi); }
  function progressKey(doi) { return P + 'progress:' + normalizeDoi(doi); }
  function traceKey(doi) { return P + 'trace:' + normalizeDoi(doi); }
  function attemptKey(doi, generatedAt) { return P + 'attempt:' + normalizeDoi(doi) + ':' + String(generatedAt || ''); }
  function failureKey(doi) { return P + 'failure:' + normalizeDoi(doi); }
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
  function selectBatchJobs(allJobs, limit) {
    var buckets = new Map();
    allJobs.forEach(function (raw) {
      var job = Object.assign({}, raw);
      job.doi = normalizeDoi(job.doi);
      if (!job.doi) return;
      job.publisher = String(job.publisher || publisherForDoi(job.doi));
      if (!buckets.has(job.publisher)) buckets.set(job.publisher, []);
      buckets.get(job.publisher).push(job);
    });
    buckets.forEach(function (rows) {
      rows.sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || '')) || String(a.doi).localeCompare(String(b.doi));
      });
    });
    var publishers = Array.from(buckets.keys()).sort();
    var out = [];
    var index = 0;
    while (out.length < limit && publishers.length) {
      if (index >= publishers.length) index = 0;
      var publisher = publishers[index];
      var rows = buckets.get(publisher) || [];
      while (rows.length) {
        var candidate = rows.shift();
        var failed = GM_getValue(failureKey(candidate.doi), null);
        if (failed && Number(failed.at || 0) > 0 && Date.now() - Number(failed.at) < FAILURE_COOLDOWN_MS) continue;
        out.push(candidate);
        break;
      }
      if (!rows.length) publishers.splice(index, 1);
      else index += 1;
    }
    return out;
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

  async function postJson(url, payload, token) {
    var response = await gmRequest({
      method: 'POST',
      url: url,
      timeout: 45000,
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + token
      },
      data: JSON.stringify(payload)
    });
    var body = {};
    try { body = JSON.parse(String(response.responseText || '{}')); } catch (_) {}
    var status = Number(response.status || 0);
    if (status < 200 || status >= 300) {
      var error = new Error('upload_http_' + String(status));
      error.httpStatus = status;
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

    var rows = Array.from(map.values()).sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === 'official' ? -1 : 1;
      return b.score - a.score;
    });
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
    if (publisher === 'wiley' && location.hostname.endsWith('onlinelibrary.wiley.com')) {
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
    pushTrace(trace, {
      stage: 'page',
      event: 'state',
      status: challenge ? 'challenge' : auth ? 'auth' : 'loaded',
      url: href,
      message: 'doiMatch=' + String(doiMatch) + ';textLength=' + String(text.length)
    });
    return { challenge: challenge, auth: auth, doiMatch: doiMatch, textLength: text.length };
  }

  async function waitForCandidates(job, trace) {
    var maxMs = job.publisher === 'wiley' ? 8 * 60 * 1000 : 90 * 1000;
    var started = Date.now();
    var lastWait = 0;
    var iframeAttempted = false;
    while (Date.now() - started < maxMs) {
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
      if (candidates.length) return candidates;

      var elapsed = Date.now() - started;
      if (!iframeAttempted && elapsed > 7000 && (job.publisher === 'wiley' || job.publisher === 'science')) {
        iframeAttempted = true;
        var iframeRows = await iframeCandidates(job, trace);
        if (iframeRows.length) {
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
          return iframeRows;
        }
      }

      if (elapsed > 22000 && state.textLength > 2000) return [];
      await waitForDomMutation(1500);
    }
    throw new Error('page_wait_timeout');
  }

  async function pageFetchCandidate(candidate, trace) {
    pushTrace(trace, {
      stage: 'page_fetch',
      event: 'request_start',
      status: 'start',
      url: candidate.url,
      candidateKind: candidate.kind,
      candidateSource: candidate.source,
      candidateScore: candidate.score
    });
    try {
      var response = await fetch(candidate.url, {
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
        url: candidate.url
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
        url: candidate.url,
        message: String(error && error.message || error)
      });
      return null;
    }
  }

  async function gmFetchCandidate(candidate, trace) {
    pushTrace(trace, {
      stage: 'gm_fetch',
      event: 'request_start',
      status: 'start',
      url: candidate.url,
      candidateKind: candidate.kind,
      candidateSource: candidate.source,
      candidateScore: candidate.score
    });
    try {
      var response = await gmRequest({
        method: 'GET',
        url: candidate.url,
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
        url: candidate.url,
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
        url: candidate.url,
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

  async function acquireImage(candidate, trace) {
    var image = await pageFetchCandidate(candidate, trace);
    if (image) return image;
    image = await gmFetchCandidate(candidate, trace);
    if (image) return image;
    return canvasCandidate(candidate, trace);
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
    var none = rev.find(function (x) { return x.stage === 'candidate_discovery' && x.event === 'scan_complete' && x.status === 'none'; });
    if ((page403 || gm403) && canvasFail) return 'image_403_and_rendered_canvas_unreadable';
    if (page403 || gm403) return 'image_http_403';
    if (canvasFail) return 'rendered_canvas_unreadable';
    var iframeSecurity = rev.find(function (x) { return x.stage === 'iframe_dom_scan' && x.event === 'inspect_failed' && /security/i.test(String(x.message || '')); });
    var iframeNone = rev.find(function (x) { return x.stage === 'iframe_dom_scan' && x.event === 'complete' && x.status === 'none'; });
    if (iframeSecurity) return 'iframe_cross_origin_or_auth_redirect';
    if (none && iframeNone) return 'no_toc_candidate_after_live_and_iframe_scan';
    if (none) return 'no_toc_candidate_in_live_dom';
    return String(error && error.message || error || 'unknown_failure').slice(0, 220);
  }

  async function runPublisherJob(job) {
    var trace = [];
    var token = writeToken();
    job.publisher = String(job.publisher || publisherForDoi(job.doi));
    job.startedAt = job.startedAt || nowIso();
    pushTrace(trace, { stage: 'job', event: 'start', status: 'running', url: location.href, message: 'v' + VERSION + ';state=' + String(job.state || '') });

    if (!token) {
      pushTrace(trace, { stage: 'config', event: 'write_token', status: 'missing', message: 'configure token from Tampermonkey menu' });
      GM_setValue(resultKey(job.doi), { doi: job.doi, status: 'failed', reason: 'write_token_missing', finishedAt: nowIso() });
      GM_setValue(traceKey(job.doi), { doi: job.doi, status: 'failed', reason: 'write_token_missing', trace: trace, finishedAt: nowIso() });
      return;
    }

    try {
      var candidates = await waitForCandidates(job, trace);
      if (!candidates.length) throw new Error('no_toc_candidate_in_live_dom');
      var lastError = null;
      for (var i = 0; i < Math.min(10, candidates.length); i += 1) {
        var candidate = candidates[i];
        try {
          var image = await acquireImage(candidate, trace);
          if (!image) {
            lastError = new Error('candidate_image_unreadable');
            continue;
          }
          var stored = await uploadCapture(job, candidate, image, trace, token);
          var reason = 'captured_' + image.method;
          await uploadReport(job, trace, 'success', reason, candidate, token);
          GM_setValue(resultKey(job.doi), {
            doi: job.doi,
            status: 'success',
            reason: reason,
            kind: candidate.kind,
            assetType: candidate.assetType,
            imageUrl: stored && stored.imageUrl || '',
            finishedAt: nowIso()
          });
          GM_deleteValue(progressKey(job.doi));
          return;
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
      throw lastError || new Error('all_candidates_failed');
    } catch (error) {
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

  async function waitForResult(job, tab) {
    var timeout = job.publisher === 'wiley' ? 9 * 60 * 1000 : 180000;
    var started = Date.now();
    while (Date.now() - started < timeout) {
      renewLease();
      var result = GM_getValue(resultKey(job.doi), null);
      if (result && result.finishedAt) {
        try { if (tab && tab.close) tab.close(); } catch (_) {}
        return result;
      }
      var progress = GM_getValue(progressKey(job.doi), null);
      if (progress && (progress.status === 'auth_wait' || progress.status === 'challenge_wait')) {
        badge('TOC：等待认证 ' + job.doi + '，请完成出版社页面验证', '#92400e');
      } else {
        badge('TOC：正在抓取 ' + job.doi, '#1f2937');
      }
      await sleep(1200);
    }
    try { if (tab && tab.close) tab.close(); } catch (_) {}
    return { doi: job.doi, status: 'failed', reason: 'controller_timeout', finishedAt: nowIso() };
  }

  async function controllerRun() {
    if (!isGalleryPage()) return;
    if (GM_getValue(ENABLED_KEY, true) === false) {
      badge('TOC 主线已暂停', '#6b7280');
      return;
    }
    var token = writeToken();
    if (!token) {
      badge('TOC 主线：请先从 Tampermonkey 菜单设置 R2 写入令牌', '#991b1b');
      return;
    }
    if (!acquireLease()) {
      badge('TOC 主线：另一个 Gallery 标签正在执行', '#374151');
      return;
    }

    var queue;
    try {
      badge('TOC 主线：读取实时缺口队列…', '#1f2937');
      queue = await getJson(QUEUE_URL + '?ts=' + Date.now());
    } catch (error) {
      badge('TOC 队列读取失败：' + String(error && error.message || error), '#991b1b');
      return;
    }

    var visible = Array.isArray(queue.visibleGaps) ? queue.visibleGaps : [];
    var upgrades = Array.isArray(queue.officialUpgrades) ? queue.officialUpgrades : [];
    var allJobs = visible.concat(upgrades);
    var limit = batchSize();
    var jobs = selectBatchJobs(allJobs, limit);
    var cooling = allJobs.filter(function (queued) {
      var doi = normalizeDoi(queued && queued.doi);
      if (!doi) return false;
      var failed = GM_getValue(failureKey(doi), null);
      return failed && Number(failed.at || 0) > 0 && Date.now() - Number(failed.at) < FAILURE_COOLDOWN_MS;
    });
    var cooldownSkipped = cooling.length;
    var summary = {
      version: VERSION,
      queueGeneratedAt: queue.generatedAt || '',
      startedAt: nowIso(),
      queueTotal: allJobs.length,
      batchSize: limit,
      total: jobs.length,
      visible: visible.length,
      upgrades: upgrades.length,
      cooldownSkipped: cooldownSkipped,
      success: 0,
      failed: 0,
      skipped: 0,
      results: []
    };

    for (var i = 0; i < jobs.length; i += 1) {
      if (GM_getValue(ENABLED_KEY, true) === false) break;
      var job = Object.assign({}, jobs[i]);
      job.doi = normalizeDoi(job.doi);
      if (!job.doi) continue;
      job.publisher = String(job.publisher || publisherForDoi(job.doi));
      job.queueGeneratedAt = queue.generatedAt || '';
      job.startedAt = nowIso();

      var prior = GM_getValue(attemptKey(job.doi, job.queueGeneratedAt), null);
      if (prior && prior.status === 'success') {
        summary.skipped += 1;
        continue;
      }

      GM_deleteValue(resultKey(job.doi));
      GM_deleteValue(progressKey(job.doi));
      GM_setValue(ACTIVE_JOB_KEY, job);
      badge('TOC ' + String(i + 1) + '/' + String(jobs.length) + '：' + job.doi, '#1f2937');

      var tab = GM_openInTab(articleUrl(job), {
        active: job.publisher === 'wiley',
        insert: true,
        setParent: true
      });
      var result = await waitForResult(job, tab);
      summary.results.push(result);
      GM_setValue(attemptKey(job.doi, job.queueGeneratedAt), result);
      if (result.status === 'success') {
        summary.success += 1;
        GM_deleteValue(failureKey(job.doi));
      } else {
        summary.failed += 1;
        GM_setValue(failureKey(job.doi), { at: Date.now(), reason: String(result.reason || 'failed').slice(0, 220) });
      }
      GM_deleteValue(ACTIVE_JOB_KEY);
      await sleep(3500);
    }

    summary.finishedAt = nowIso();
    GM_setValue(SUMMARY_KEY, summary);
    GM_deleteValue(ACTIVE_JOB_KEY);
    badge('TOC 本批完成：' + summary.total + '/' + summary.queueTotal + '；成功 ' + summary.success + '，失败 ' + summary.failed + '，冷却跳过 ' + summary.cooldownSkipped, summary.failed ? '#92400e' : '#065f46');
  }

  async function publisherBoot() {
    if (location.hostname === 'doi.org') return;
    var job = GM_getValue(ACTIVE_JOB_KEY, null);
    if (!job || !normalizeDoi(job.doi)) return;
    var started = Date.parse(job.startedAt || '');
    if (!Number.isFinite(started) || Date.now() - started > 12 * 60 * 1000) return;
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
    GM_registerMenuCommand('立即运行实时 TOC 队列', function () {
      GM_setValue(ENABLED_KEY, true);
      GM_deleteValue(LEASE_KEY);
      if (isGalleryPage()) controllerRun();
      else window.open('https://' + GALLERY_HOST + GALLERY_PATH, '_blank');
    });
    GM_registerMenuCommand('暂停/继续 TOC 主线', function () {
      var enabled = GM_getValue(ENABLED_KEY, true) !== false;
      GM_setValue(ENABLED_KEY, !enabled);
      window.alert(enabled ? 'TOC 主线已暂停。' : 'TOC 主线已继续。');
    });
    GM_registerMenuCommand('查看最近运行摘要', function () {
      window.alert(JSON.stringify(GM_getValue(SUMMARY_KEY, {}), null, 2));
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
