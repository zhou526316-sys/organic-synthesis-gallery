  var CHEM_ELSEVIER_ROUTE_REVISION = '20261004-chem-cell-direct-v1';
  var CHEM_ELSEVIER_PII_CACHE_PREFIX = P + 'chem-elsevier-pii-v1:';

  function elsevierPiiFromValue(value) {
    var text = String(value || '');
    var match = text.match(/\b(S\d{16})\b/i);
    return match ? match[1].toUpperCase() : '';
  }

  function formatCellPii(value) {
    var raw = elsevierPiiFromValue(value);
    var match = raw.match(/^S(\d{4})(\d{4})(\d{2})(\d{5})(\d)$/);
    if (!match) return '';
    return 'S' + match[1] + '-' + match[2] + '(' + match[3] + ')' + match[4] + '-' + match[5];
  }

  function chemCellUrlFromPii(value) {
    var formatted = formatCellPii(value);
    return formatted ? 'https://www.cell.com/chem/fulltext/' + formatted : '';
  }

  async function resolveArticleUrl(job) {
    var fallback = articleUrl(job);
    var doi = normalizeDoi(job && job.doi);
    var publisher = String(job && job.publisher || publisherForDoi(doi));
    if (publisher !== 'elsevier' || !doi) return fallback;

    var cacheKey = CHEM_ELSEVIER_PII_CACHE_PREFIX + doi;
    var cached = GM_getValue(cacheKey, null);
    if (cached && cached.pii && Number(cached.at || 0) > Date.now() - 30 * 24 * 60 * 60 * 1000) {
      var cachedUrl = chemCellUrlFromPii(cached.pii);
      if (cachedUrl) return cachedUrl;
    }

    try {
      var response = await gmRequest({
        method: 'GET',
        url: 'https://doi.org/' + doi,
        timeout: 25000,
        headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' }
      });
      var pii = elsevierPiiFromValue(response && response.finalUrl || '')
        || elsevierPiiFromValue(response && response.responseText || '');
      var cellUrl = chemCellUrlFromPii(pii);
      if (cellUrl) {
        GM_setValue(cacheKey, { doi: doi, pii: pii, at: Date.now(), revision: CHEM_ELSEVIER_ROUTE_REVISION });
        return cellUrl;
      }
    } catch (_) {
      // Fail closed to the existing DOI route. The controller will report a
      // heartbeat/binding failure rather than inventing a publisher URL.
    }
    return fallback;
  }

  function chemGraphicalAbstractCandidates(job, scope, baseUrl) {
    if (String(job && job.publisher || '') !== 'elsevier' || !scope || !scope.querySelectorAll) return [];
    var rows = [], seen = new Set(), doi = normalizeDoi(job && job.doi);
    Array.from(scope.querySelectorAll('img')).forEach(function (image) {
      var signature = [
        image.getAttribute('alt') || '',
        image.getAttribute('title') || '',
        image.getAttribute('aria-label') || '',
        image.getAttribute('class') || '',
        image.getAttribute('id') || '',
        String(image.closest('section,figure,div')?.textContent || '').slice(0, 400)
      ].join(' ');
      articleFigureImageUrls(image, baseUrl || location.href).forEach(function (url, rank) {
        if (!url || seen.has(url) || !candidateBelongsToJob(url, job) || reject(signature, url)) return;
        var explicitGa = /\/main\.assets\/ga\d+\.(?:jpe?g|png|webp|svg)(?:[?#]|$)/i.test(url)
          || /\bgraphical\s+abstract\b/i.test(signature);
        if (!explicitGa) return;
        seen.add(url);
        rows.push({
          url: url,
          kind: 'official',
          assetType: 'graphical_abstract',
          score: 960 - rank,
          text: 'Chem graphical abstract',
          source: 'chem_cell_graphical_abstract',
          element: image
        });
      });
    });
    return rows.sort(function (a, b) { return b.score - a.score; });
  }
