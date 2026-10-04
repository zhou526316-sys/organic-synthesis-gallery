  // CCS Chemistry publishes the official "key image" on its TOC/Ahead-of-Print
  // listing. The article page can expose Figure 1 without exposing that official
  // key image, so Figure 1 must never be promoted to official CCS TOC.
  function ccsTocIndexUrls(job, doc, baseUrl) {
    if (String(job && job.publisher || publisherForDoi(normalizeDoi(job && job.doi))) !== 'ccs') return [];
    var origin;
    try { origin = new URL(baseUrl || location.href).origin; } catch (_) { origin = 'https://www.chinesechemsoc.org'; }
    var urls = [origin + '/toc/ccschem/0/0', origin + '/toc/ccschem/0/ja'];
    try {
      var scope = doc || document;
      var volume = String((scope.querySelector('meta[name="citation_volume"]') || {}).content || '').trim();
      var issue = String((scope.querySelector('meta[name="citation_issue"]') || {}).content || '').trim();
      if (/^\d+$/.test(volume) && /^\d+$/.test(issue)) urls.push(origin + '/toc/ccschem/' + volume + '/' + issue);
    } catch (_) {}
    return Array.from(new Set(urls));
  }

  function ccsDoiFromTextOrHref(value) {
    var text = String(value || '').toLowerCase();
    var match = text.match(/10\.31635\/ccschem\.[a-z0-9.]+/i);
    return match ? normalizeDoi(match[0]) : '';
  }

  function ccsCardForDoiAnchor(anchor, doi) {
    var node = anchor && anchor.parentElement;
    for (var depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      var images = node.querySelectorAll ? node.querySelectorAll('img,picture,source,object[type^="image"]') : [];
      if (!images.length) continue;
      var found = new Set();
      Array.from(node.querySelectorAll('a[href]')).forEach(function (link) {
        var value = ccsDoiFromTextOrHref((link.getAttribute('href') || '') + ' ' + (link.textContent || ''));
        if (value) found.add(value);
      });
      if (found.size === 1 && found.has(doi)) return node;
      if (found.size > 1) return null;
    }
    return null;
  }

  function ccsKeyImageSignal(node, card) {
    var values = [];
    var current = node;
    for (var depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
      if (current.getAttribute) {
        ['alt','title','aria-label','class','id'].forEach(function (name) {
          var value = current.getAttribute(name);
          if (value) values.push(value);
        });
      }
      if (current !== node) {
        var text = String(current.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) values.push(text.slice(0, 320));
      }
      if (current === card) break;
    }
    return /\bkey\s*image\b|\btable\s+of\s+contents\s*(?:graphic|image)\b|\btoc\s*(?:graphic|image)\b|\bgraphical\s+abstract\b|\bvisual\s+abstract\b/i.test(values.join(' '));
  }

  function ccsTocIndexCandidatesFromDocument(job, doc, baseUrl) {
    if (!doc || String(job && job.publisher || '') !== 'ccs') return [];
    var doi = normalizeDoi(job && job.doi);
    if (!doi) return [];
    var anchors = Array.from(doc.querySelectorAll('a[href]')).filter(function (anchor) {
      var bound = ccsDoiFromTextOrHref((anchor.getAttribute('href') || '') + ' ' + (anchor.textContent || ''));
      return bound === doi;
    });
    var rows = [], seen = new Set();
    anchors.forEach(function (anchor) {
      var card = ccsCardForDoiAnchor(anchor, doi);
      if (!card) return;
      Array.from(card.querySelectorAll('img')).forEach(function (image) {
        if (!ccsKeyImageSignal(image, card)) return;
        articleFigureImageUrls(image, baseUrl || location.href).forEach(function (url, rank) {
          if (!url || seen.has(url) || reject('CCS Chemistry key image', url)) return;
          seen.add(url);
          rows.push({
            url: url,
            kind: 'official',
            assetType: 'toc_graphic',
            score: 980 - rank,
            text: 'CCS Chemistry key image',
            source: 'ccs_toc_index_key_image',
            element: null
          });
        });
      });
    });
    return rows.sort(function (a,b) { return b.score - a.score; });
  }
