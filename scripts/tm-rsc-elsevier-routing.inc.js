  // Publisher routing v9: keep DOI identity strict while avoiding known
  // redirect gaps on Elsevier and using the RSC page that matches the task.
  function rscRouteInfo(job) {
    var doi = normalizeDoi(job && job.doi);
    var suffix = doi.split('/')[1] || '';
    var match = /^([a-z])(\d)([a-z]{2})/i.exec(suffix);
    if (!match) return null;
    return {
      doi: doi,
      suffix: suffix.toLowerCase(),
      year: String(2020 + Number(match[2])),
      journalCode: match[3].toLowerCase()
    };
  }

  function rscArticleRoute(job, full) {
    var info = rscRouteInfo(job);
    if (!info) return '';
    return 'https://pubs.rsc.org/en/content/' + (full ? 'articlehtml' : 'articlelanding')
      + '/' + info.year + '/' + info.journalCode + '/' + info.suffix;
  }

  function elsevierSearchRoute(job) {
    var doi = normalizeDoi(job && job.doi);
    return doi ? 'https://www.sciencedirect.com/search?qs=' + encodeURIComponent(doi) : '';
  }

  function bindPublisherTabJobOnly(job) {
    var match = String(location.hash || '').match(/(?:^#|&)osg-job=([a-z0-9-]{16,80})(?:&|$)/i);
    var binding = '';
    try {
      if (match) sessionStorage.setItem(P + 'tab-job-binding', match[1]);
      binding = sessionStorage.getItem(P + 'tab-job-binding') || '';
    } catch (_) {}
    if (!job || !job.jobId || !currentCaptureJob(job) || binding !== job.jobId) {
      throw new Error('capture_tab_job_mismatch');
    }
    return binding;
  }

  function isElsevierSearchRoute(job) {
    if (!job || String(job.publisher || publisherForDoi(normalizeDoi(job.doi))) !== 'elsevier') return false;
    if (!/(?:^|\.)sciencedirect\.com$/i.test(String(location.hostname || ''))) return false;
    if (!/^\/search(?:\/|$)/i.test(String(location.pathname || ''))) return false;
    try {
      return normalizeDoi(new URL(location.href).searchParams.get('qs') || '') === normalizeDoi(job.doi);
    } catch (_) {
      return false;
    }
  }

  function elsevierPiiArticleLinks(doc, baseUrl) {
    var rows = [], seen = new Set();
    Array.from((doc || document).querySelectorAll('a[href]')).forEach(function (anchor) {
      var href = normalizeUrl(anchor.getAttribute('href') || '', baseUrl || location.href);
      if (!href || seen.has(href)) return;
      try {
        var url = new URL(href);
        if (!/(?:^|\.)sciencedirect\.com$/i.test(url.hostname)) return;
        if (!/^\/science\/article\/pii\/[a-z0-9]+/i.test(url.pathname)) return;
      } catch (_) { return; }
      seen.add(href);
      rows.push({ anchor: anchor, url: href });
    });
    return rows;
  }

  function elsevierSearchTargetFromDocument(job, doc, baseUrl) {
    var doi = normalizeDoi(job && job.doi);
    if (!doi || !doc) return '';
    var rows = elsevierPiiArticleLinks(doc, baseUrl);
    if (!rows.length) return '';

    // Strong path: the result card itself contains the exact DOI and exactly
    // one ScienceDirect article target.
    for (var i = 0; i < rows.length; i += 1) {
      var node = rows[i].anchor;
      for (var depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
        var text = String(node.textContent || '').replace(/\s+/g, ' ').toLowerCase();
        if (text.indexOf(doi) < 0) continue;
        var local = elsevierPiiArticleLinks(node, baseUrl);
        if (local.length === 1) return local[0].url;
        if (local.length > 1) break;
      }
    }

    // Exact-query fallback: the controller itself created a search for one DOI.
    // Accept only one unique PII target; ambiguity remains a hard failure.
    try {
      var current = new URL(baseUrl || location.href);
      var exactQuery = normalizeDoi(current.searchParams.get('qs') || '');
      if (exactQuery === doi && rows.length === 1) return rows[0].url;
    } catch (_) {}
    return '';
  }

  async function resolveElsevierSearchRoute(job) {
    if (!isElsevierSearchRoute(job)) return false;
    bindPublisherTabJobOnly(job);
    writePublisherHeartbeat(job, 'elsevier_search_started');
    GM_setValue(progressKey(job.doi), {
      status: 'elsevier_route_lookup',
      at: nowIso(),
      url: location.href,
      version: VERSION,
      host: location.hostname
    });

    var started = Date.now(), target = '';
    while (Date.now() - started < 15000) {
      if (!currentCaptureJob(job)) throw new Error('capture_job_stale_or_unbound');
      target = elsevierSearchTargetFromDocument(job, document, location.href);
      if (target) break;
      if (Date.now() - started > 3500) {
        try { window.scrollTo(0, Math.min(document.documentElement.scrollHeight || 0, 1800)); } catch (_) {}
      }
      await sleep(500);
    }
    if (!target) {
      var reason = 'elsevier_exact_doi_search_result_not_found';
      var finishedAt = nowIso();
      var result = { doi:job.doi, jobId:job.jobId, version:VERSION, controllerRevision:CONTROLLER_REVISION,
        status:'failed', reason:reason, finishedAt:finishedAt };
      GM_setValue(traceKey(job.doi), {doi:job.doi,jobId:job.jobId,status:'failed',trace:[{
        at:finishedAt,stage:'elsevier_route',event:'search_result_missing',status:'failed',url:location.href,message:reason
      }],finishedAt:finishedAt});
      enqueueCaptureReport(job,[{at:finishedAt,stage:'elsevier_route',event:'search_result_missing',status:'failed',url:location.href,message:reason}],
        'failed',reason,true,location.href);
      GM_setValue(resultKey(job.doi),result);
      GM_deleteValue(progressKey(job.doi));
      writePublisherHeartbeat(job, 'elsevier_search_failed');
      return true;
    }

    writePublisherHeartbeat(job, 'elsevier_article_route_found');
    var next = target + (target.indexOf('#') >= 0 ? '&' : '#') + 'osg-job=' + encodeURIComponent(job.jobId);
    location.replace(next);
    return true;
  }
