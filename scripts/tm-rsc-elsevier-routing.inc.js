  // RSC routes are deterministic from the DOI suffix. Use the landing page for
  // official graphical-abstract/TOC discovery and articlehtml for body/evidence.
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
