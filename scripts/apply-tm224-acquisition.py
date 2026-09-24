"""Deterministic 2.2.24 client-only patch. No publisher or media writes."""
from pathlib import Path

def once(s,a,b):
    if s.count(a)!=1: raise RuntimeError("Expected one anchor: "+a[:120])
    return s.replace(a,b,1)
def save(p,s): Path(p).write_text(s)

p='public/toc-mainline.user.js'; s=Path(p).read_text()
if any("var CONTROLLER_REVISION = '"+v+"';" in s for v in ('2.2.25','2.2.26','2.2.27','2.2.28','2.2.29')):
    assert "sameFigureCurrentSrcFallback" in s
    assert "if (publisher === 'acs') return 'https://pubs.acs.org/doi/' + doi;" in s
    print('TM224_ALREADY_APPLIED_IN_CURRENT: retained TIFF/currentSrc fallback and canonical ACS route')
    raise SystemExit(0)
s=once(s,"var CONTROLLER_REVISION = '2.2.23';","var CONTROLLER_REVISION = '2.2.24';")
s=once(s,"publication: '已保存至 R2 暂存；未自动发布到文献卡片'",
       "publication: '已保存至 R2 暂存；符合站点增量发布规则的新 ACS 正文图会后续发布，当前是否上线以网页与发布账本为准'")

old="""  function sniffContentType(buffer, declared) {
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
  }"""
new="""  function sniffContentType(buffer, declared) {
    var bytes = new Uint8Array(buffer || new ArrayBuffer(0));
    var head = '';
    try { head = new TextDecoder().decode(bytes.slice(0, 1024)).replace(/^\\uFEFF/, '').trimStart().toLowerCase(); } catch (_) {}
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
  }"""
s=once(s,old,new)

old="""  async function acquireImage(candidate, trace) {
    var image = await pageFetchCandidate(candidate, trace);
    if (!image) image = await gmFetchCandidate(candidate, trace);
    if (!image) image = await canvasCandidate(candidate, trace);
    if (!image) return null;
    var measured = await measureImageData(image.imageData);
    image.width = Number(measured.width || 0);
    image.height = Number(measured.height || 0);
    return image;
  }"""
new="""  async function acquireImage(candidate, trace) {
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
  }"""
s=once(s,old,new)

anchor="""  async function acquireBestVisual(job, candidates, trace, cache, role) {
    var best=null;"""
replacement="""  async function sameFigureCurrentSrcFallback(job, candidates, trace, cache, role) {
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
    var best=null;"""
s=once(s,anchor,replacement)

old="""    return best;
  }

  async function waitForPairedVisuals"""
new="""    if (!best) best = await sameFigureCurrentSrcFallback(job,candidates,trace,cache,role);
    return best;
  }

  async function waitForPairedVisuals"""
s=once(s,old,new)

old="""  function pairedJobs(queue,media) {
    if (!Array.isArray(queue.articles) || queue.articles.length!==Number(queue.webpageDoiCount) || Number(queue.mediaGeneration)!==1790082000000) throw new Error('paired_queue_requires_current_complete_registry');
    var seen=new Set();
    return queue.articles.map(function(raw) {
      var doi=normalizeDoi(raw.doi);
      if (!doi||seen.has(doi)) throw new Error('paired_queue_invalid_or_duplicate_doi');seen.add(doi);
      var record=(media.items||{})[doi]||{};
      var toc=record.toc||{};
      var official=Boolean(toc.available && toc.imageUrl && !/fallback/i.test(toc.reason||''));
      return Object.assign({},raw,{doi:doi,publisher:publisherForDoi(doi),mediaNeed:'toc+figures',state:official?'figure_gap':'no_visual',captureToc:!official,allowFigureOne:!official});
    });
  }"""
new="""  function pairedJobs(queue,media) {
    if (!Array.isArray(queue.articles) || queue.articles.length!==Number(queue.webpageDoiCount) || Number(queue.mediaGeneration)!==1790082000000) throw new Error('paired_queue_requires_current_complete_registry');
    var seen=new Set();
    var jobs=queue.articles.map(function(raw,index) {
      var doi=normalizeDoi(raw.doi);
      if (!doi||seen.has(doi)) throw new Error('paired_queue_invalid_or_duplicate_doi');seen.add(doi);
      var record=(media.items||{})[doi]||{};
      var toc=record.toc||{};
      var official=Boolean(toc.available && toc.imageUrl && !/fallback/i.test(toc.reason||''));
      return Object.assign({},raw,{doi:doi,publisher:publisherForDoi(doi),mediaNeed:'toc+figures',state:official?'figure_gap':'no_visual',captureToc:!official,allowFigureOne:!official,_queueIndex:index});
    });
    // Newest first. Within the same date, missing official TOC comes first; then JACS.
    // Stable original registry order remains the final tie-breaker.
    jobs.sort(function(a,b) {
      var date=String(b.date||'').localeCompare(String(a.date||''));
      if (date) return date;
      if (a.captureToc!==b.captureToc) return a.captureToc ? -1 : 1;
      var aj=/^10\\.1021\\/jacs\\./.test(a.doi), bj=/^10\\.1021\\/jacs\\./.test(b.doi);
      if (aj!==bj) return aj ? -1 : 1;
      return a._queueIndex-b._queueIndex;
    });
    return jobs.map(function(job){delete job._queueIndex;return job;});
  }"""
s=once(s,old,new)
save(p,s)

for p in ['cloudflare/scripts/build-bridge-loader.mjs','scripts/validate-tm220-artifacts.mjs','scripts/test-tm221-window-guard.mjs']:
    s=Path(p).read_text()
    s=s.replace("2.2.23","2.2.24")
    save(p,s)
print('TM224_PATCH_APPLIED: controller 2.2.24; capture protocol remains 6.2.20; no Worker contract change')
