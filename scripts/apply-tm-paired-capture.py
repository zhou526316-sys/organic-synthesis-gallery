"""Idempotent paired-capture patch on feature branch; no production or publisher requests."""
from pathlib import Path
import re
p=Path('public/toc-mainline.user.js');s=p.read_text()
assert "var VERSION = '6.2.20';" in s
source=Path('scripts/tm-paired-capture-functions.js').read_text()
parts=re.split(r'^// @function (\w+)\n',source,flags=re.M)
for i in range(1,len(parts),2):
 name,body=parts[i],parts[i+1].rstrip()+'\n'
 match=re.search(r'^  (?:async )?function '+re.escape(name)+r'\(',s,re.M)
 if match:
  next_fn=re.search(r'^  (?:async )?function \w+\(',s[match.end():],re.M)
  if not next_fn: raise ValueError('Patch function boundary missing:'+name)
  end=match.end()+next_fn.start();s=s[:match.start()]+body+'\n'+s[end:]
 else:
  anchor='  installMenu();'
  assert s.count(anchor)==1
  s=s.replace(anchor,body+'\n'+anchor,1)
# Source URLs and receipts describe the actual bytes, not the selected-but-unused URL.
if 'sourceUrl: response.url || requestUrl,' not in s:
 s=s.replace("        method: 'page_fetch'", "        sourceUrl: response.url || requestUrl,\n        method: 'page_fetch'",1)
 s=s.replace("        method: 'gm_fetch'", "        sourceUrl: response.finalUrl || requestUrl,\n        method: 'gm_fetch'",1)
 s=s.replace("        method: 'rendered_canvas'", "        sourceUrl: normalizeUrl(image.currentSrc || image.src, location.href),\n        method: 'rendered_canvas'",1)
 s=s.replace("        cache: 'force-cache',", "        cache: 'force-cache',\n        signal: AbortSignal.timeout(12000),",1)
 s=s.replace('        timeout: 35000,','        timeout: 12000,',1)
 s=s.replace('    var image = candidate.element;\n', "    var image = candidate.element;\n    if (image && normalizeUrl(image.currentSrc || image.src, location.href) !== candidate.url) return null;\n",1)
# Only a bound tab may publish a heartbeat for a task.
s=s.replace("    writePublisherHeartbeat(null, 'script_loaded');\n",'')
s=s.replace("      writePublisherHeartbeat(null, 'active_job_missing');\n",'')
start=s.index('  function writePublisherHeartbeat(');end=s.index('\n  function ',start+1)
fragment=s[start:end]
if 'jobId: job && job.jobId' not in fragment:
 fragment=fragment.replace('      doi: doi,','      doi: doi,\n      jobId: job && job.jobId || \'\',',1)
s=s[:start]+fragment+s[end:]
# A TOC HTTP 200 without the corresponding storage receipt is not success.
start=s.index('  async function uploadCapture(');end=s.index('\n  async function ',start+1);frag=s[start:end]
if 'toc_capture_receipt_invalid' not in frag:
 frag=frag.replace('      pushTrace(trace, {\n        stage:', "      if (!result || result.stored !== true || normalizeDoi(result.doi) !== normalizeDoi(job.doi) || result.kind !== candidate.kind) throw new Error('toc_capture_receipt_invalid');\n      assertBoundCaptureJob(job, candidate.url);\n      pushTrace(trace, {\n        stage:",1)
s=s[:start]+frag+s[end:]
# Keep role-specific state in the report trace even if diagnostics upload is interrupted.
p.write_text(s)
q=Path('cloudflare/scripts/build-live-toc-demand-queue.mjs');text=q.read_text()
if 'pairedCaptureRegistry' not in text:
 anchor='  const liveQueue = {\n    version: 2,'
 assert text.count(anchor)==1
 text=text.replace(anchor,"  const liveQueue = {\n    version: 3,\n    pairedCaptureRegistry: true,\n    mediaGeneration: 1790082000000,\n    articles: [...papers.values()].map(paper => ({...paper, publisher: publisherFor(paper.doi)})),",1)
 q.write_text(text)
print('PAIRED_CAPTURE_PATCH_APPLIED')
