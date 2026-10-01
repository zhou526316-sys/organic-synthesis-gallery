"""Targeted, idempotent hotfix; keep Bridge 2.2.39/protocol 6.2.20 and receipts."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
paths = ['public/toc-mainline.user.js', 'cloudflare/worker/src/index.js', 'cloudflare/worker/src/article-summary.js']
texts = {p: (ROOT / p).read_text() for p in paths}
p = paths[0]
s = texts[p]
marker = '20261001-newest-retry-v1'
if marker in s:
    print('Hotfix already materialized; no changes.')
    raise SystemExit(0)

def replace(text, before, after, label):
    if text.count(before) != 1:
        raise RuntimeError(f'{label}: expected one exact anchor, found {text.count(before)}')
    return text.replace(before, after, 1)

s = replace(s, "  var CONTROLLER_REVISION = '2.2.39';", "  var CONTROLLER_REVISION = '2.2.39';\n  var CAPTURE_HOTFIX_REVISION = '20261001-newest-retry-v1';", 'hotfix marker')
s = replace(s, '// @match        https://www.ccspublishing.org.cn/*', '// @match        https://www.chinesechemsoc.org/*\n// @match        https://chinesechemsoc.org/*\n// @match        https://www.ccspublishing.org.cn/*', 'CCS injection')
s = replace(s, "    if (publisher === 'rsc') {", "    if (publisher === 'ccs') return 'https://www.chinesechemsoc.org/doi/' + (figureJob ? 'full/' : '') + doi;\n    if (publisher === 'rsc') {", 'CCS bound landing')
start = s.index('  function captureQueueTier(')
end = s.index('  function compareCaptureJobs(', start)
s = s[:start] + '''  function captureQueueTier(job, latestAddedDate) {
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

''' + s[end:]
# Keep existing, conservative historical policy; specialize transient failures only.
s = replace(s, "    var elapsed=now-Date.parse(prior.finishedAt||0);\n    var count=Number(prior.retryCount||1);", """    var elapsed=now-Date.parse(prior.finishedAt||0);
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
    if (/gm_request|gm_then_fetch|Failed to fetch|NetworkError|timeout|heartbeat_missing|upload_http_50[234]|queue_http_50[234]|signal is aborted/i.test(detail)) {
      return elapsed>=Math.max([5,15,30,60][Math.min(count-1,3)]*60*1000,Number(prior.retryAfterMs||0));
    }""", 'classified retry')
s = replace(s, '          result.version=VERSION;\n          result.retryCount=', '          result.version=VERSION;\n          result.retryPolicyRevision=CAPTURE_HOTFIX_REVISION;\n          result.retryCount=', 'save policy revision')
# Preserve Retry-After across article attempts as well as within an upload.
s = replace(s, "          result.toc={status:'failed',reason:String(error.message)};", "          result.toc={status:'failed',reason:String(error.message)};\n          result.retryAfterMs=Math.max(Number(result.retryAfterMs||0),Number(error.retryAfterMs||0));", 'TOC retry hint')
s = replace(s, "          result.figures.failed+=1;", "          result.figures.failed+=1;\n          result.retryAfterMs=Math.max(Number(result.retryAfterMs||0),Number(error.retryAfterMs||0));", 'figure retry hint')
s = replace(s, "      return {status:'failed',reason:String(error&&error.message||error).slice(0,240)};", "      return {status:'failed',reason:String(error&&error.message||error).slice(0,240),retryAfterMs:Number(error&&error.retryAfterMs||0)};", 'evidence retry hint')
s = replace(s, "  async function finishPairedJob(job,result,trace,token) {", "  async function finishPairedJob(job,result,trace,token) {\n    result.retryAfterMs=Math.max(Number(result.retryAfterMs||0),Number((result.fulltext||{}).retryAfterMs||0));", 'persist retry hint')

# Poll a changed corpus between articles, never abort a bound capture or steal its lease.
s = replace(s, "      var queue=await getJson(QUEUE_URL+'?ts='+Date.now());", "      var queue=await getJson(QUEUE_URL+'?ts='+Date.now());\n      var queueCheckedAt=Date.now();", 'queue checkpoint')
s = replace(s, "        if(!renewLease()) {stopReason='controller_lease_lost';break;}\n        if (publisherAccessCooling(batch[i]))", """        if(!renewLease()) {stopReason='controller_lease_lost';break;}
        if (i>0 && Date.now()-queueCheckedAt>=60000) {
          try {
            var refreshedQueue=await getJson(QUEUE_URL+'?ts='+Date.now());
            queueCheckedAt=Date.now();
            if (!Array.isArray(refreshedQueue.articles) || refreshedQueue.articles.length!==Number(refreshedQueue.webpageDoiCount)
                || Number(refreshedQueue.mediaGeneration)!==1790082000000) throw new Error('invalid_queue_refresh');
            if (queueRegistryChanged(queue,refreshedQueue)) {
              summary.refreshPending=true;
              badge('检测到文献队列更新；当前篇已保存，重新按最新上架排序','#374151');
              break;
            }
          } catch(queueError) {
            summary.refreshPending=true;
            summary.queueRefreshError=String(queueError.message||queueError).slice(0,120);
            break; // Do not open possibly removed DOI from an unverifiable old registry.
          }
        }
        if (publisherAccessCooling(batch[i]))""", 'mid-batch refresh')
s = replace(s, '(remainingAvailable.length>0||urgentEvidencePending)', '(summary.refreshPending||remainingAvailable.length>0||urgentEvidencePending)', 'refresh scheduling')
s = replace(s, 'var nextDelay=remainingAvailable.length>0?NEXT_BATCH_DELAY_MS:60*1000;', 'var nextDelay=summary.queueRefreshError?60*1000:summary.refreshPending?1500:remainingAvailable.length>0?NEXT_BATCH_DELAY_MS:60*1000;', 'refresh delay')
s = replace(s, '    }, 30 * 60 * 1000);', '    }, 60 * 1000);', 'idle queue discovery')
s = replace(s, '  function compareCaptureJobs(', '''  function queueRegistryChanged(a,b) {
    if (String(a.latestAddedDate||'')!==String(b.latestAddedDate||'')) return true;
    function identity(q) {
      return (q.articles||[]).map(function(x){return normalizeDoi(x.doi)+'|'+String(x.addedDate||'')+'|'+String(x.date||'')+'|'+String(x.journal||'');}).sort().join('\\n');
    }
    return identity(a)!==identity(b);
  }

  function compareCaptureJobs(''', 'registry comparison')
# Never evade an explicit extension denial, and never duplicate native fallback chains.
s = replace(s, '        if (settled) return;\n        var canFallback = controllerTransportUrl', "        if (settled) return;\n        if (/Request was blocked by the user|Refused to connect.*blocked/i.test(String(gmError && gmError.message || ''))) { rejectOnce(gmError); return; }\n        var canFallback = controllerTransportUrl", 'respect extension denial')
s = replace(s, '          rejectOnce(new Error(\n            \'gm_then_fetch_failed:\' +', "          var failure = new Error(\n            'gm_then_fetch_failed:' +", 'single fallback start')
s = replace(s, "String(fetchError && fetchError.message || fetchError || 'unknown')\n          ));", "String(fetchError && fetchError.message || fetchError || 'unknown')\n          );\n          failure.controllerFallbackTried=true;\n          rejectOnce(failure);", 'single fallback end')
s = replace(s, '    } catch (gmError) {\n      // Do not route around', '    } catch (gmError) {\n      if (gmError && gmError.controllerFallbackTried) throw gmError;\n      // Do not route around', 'no repeated fallback')
s = replace(s, "    if (status < 200 || status >= 300) throw uploadResponseError(status, body, raw, function (h) { return headerValue(response.responseHeaders, h); }, 'gm_request');", """    if (shouldNativeRetryUpload(response,url)) {
      // Same endpoint, same bytes and idempotent receipt validation. Only retry a
      // gateway markup error; never bypass 401/403/429, JSON errors or Retry-After.
      return await fetchPostJson(url,payload,token);
    }
    if (status < 200 || status >= 300) throw uploadResponseError(status, body, raw, function (h) { return headerValue(response.responseHeaders, h); }, 'gm_request');""", 'gateway response fallback')
s = replace(s, '  function retryableImageUpload(error) {', '''  function shouldNativeRetryUpload(response,url) {
    var status=Number(response && response.status || 0);
    var raw=String(response && response.responseText || '').trim();
    var target; try { target=new URL(url); } catch (_) { return false; }
    var owned=target.protocol==='https:' && ['api.gczhouwld.com','organic-synthesis-gallery.zhou526316.workers.dev'].indexOf(target.hostname)>=0;
    return owned && [502,503,504].indexOf(status)>=0
      && /^(?:<!doctype\\s+html|<html|<head|<body)/i.test(raw)
      && !headerValue(response.responseHeaders,'retry-after');
  }

  function retryableImageUpload(error) {''', 'gateway retry classifier')
# ACS view-large is an HTML viewer even when its path ends in .svg.
s = replace(s, '  async function acquireImage(candidate, trace) {', '''  function isAcsImageViewerUrl(value) {
    try { var u=new URL(value,location.href); return u.hostname==='pubs.acs.org' && /^\\/view-large\\/figure\\//i.test(u.pathname); }
    catch (_) { return false; }
  }

  async function acquireImage(candidate, trace) {
    if (isAcsImageViewerUrl(candidate && candidate.url)) {
      pushTrace(trace,{stage:'image_route',event:'skip_html_viewer',status:'skipped',url:candidate.url,message:'ACS viewer is not image bytes; retain same-figure DOM/CDN candidates'});
      return null;
    }''', 'ACS viewer classification')
texts[p] = s
p = paths[1]
texts[p] = replace(texts[p], "    'https://www.ccspublishing.org.cn',", "    'https://www.ccspublishing.org.cn',\n    'https://www.chinesechemsoc.org',\n    'https://chinesechemsoc.org',", 'CCS authenticated CORS')
p = paths[2]
texts[p] = replace(texts[p], "if (publisher === 'ccs') return hostMatches(host, 'ccspublishing.org.cn');", "if (publisher === 'ccs') return hostMatches(host, 'ccspublishing.org.cn') || host === 'www.chinesechemsoc.org' || host === 'chinesechemsoc.org';", 'CCS evidence origin')
# Write only after every anchor succeeds. No version, credentials, receipts, corpus or schedule mutation.
for name, text in texts.items():
    (ROOT / name).write_text(text)
    print('Patched '+name)
