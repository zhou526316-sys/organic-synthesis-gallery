from pathlib import Path
import hashlib,re,subprocess
PIN='9feda06c2a014623c0b19b822929ce8d4bae54dc'
BASE={
 'public/toc-mainline.user.js':'3ea13121198fe315061e01d6654adbc44d84e8ca4add3016f7ead8e1114376c6',
 'cloudflare/worker/src/local-captures.js':'8a91b31a12e34692eecd8c42dd4b1eadeec1e70d4b66a6bc0c2e3dd949c6529c',
 'cloudflare/worker/src/media.js':'0802478a7e4cf3048c836081bad5c4d84009a00557eee4e060a8e0f0d1c53517',
 'cloudflare/worker/src/media-write.js':'8331a295aeada137af7d063459e354e414f855430753f600d6d478107987dc1e',
 'cloudflare/scripts/build-bridge-loader.mjs':'f9fb2caa1f4866336c3b2660f93f6676e3dd6c2b32bc6638e4ab4139d6a4fb36'}
if "var VERSION = '6.2.19';" not in Path('public/toc-mainline.user.js').read_text():
 raise SystemExit('Already assembled or concurrent media update; do not blindly reapply')
for path,digest in BASE.items():
 assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest, 'Concurrent source change: '+path
for path in [*BASE,'scripts/test-media-identity-v220.mjs','scripts/test-tm-stage-first.mjs']:
 Path(path).write_bytes(subprocess.check_output(['git','show',PIN+':'+path]))

p=Path('public/toc-mainline.user.js');s=p.read_text();bundle=Path('scripts/tm-capability-functions.js').read_text()
for name in re.findall(r'^  (?:async )?function (\w+)\(',bundle,re.M):
 m=re.search(r'^  (?:async )?function '+name+r'\(',s,re.M)
 if m:
  n=re.search(r'^  (?:async )?function \w+\(',s[m.end():],re.M);assert n,name
  s=s[:m.start()]+s[m.end()+n.start():]
s=s.replace('  function installMenu() {',bundle+'\n  function installMenu() {')
s=s.replace("return P + 'result:' + normalizeDoi(doi);", "return P + 'result:6.2.20:' + normalizeDoi(doi) + ':' + String(jobId || '');").replace('function resultKey(doi) {','function resultKey(doi, jobId) {')
s=s.replace('resultKey(job.doi)', 'resultKey(job.doi,job.jobId)')
s=s.replace("var base = P + 'attempt:'", "var base = P + 'attempt:6.2.20:'")
s=s.replace("var figureJob = jobKind(job) === 'figures';", "var figureJob = String(job.mediaNeed || '').indexOf('figures') >= 0;")
s=s.replace("return String(job && job.mediaNeed || '') === 'figures'", "return String(job && job.mediaNeed || '').indexOf('figures') >= 0")
s=s.replace("var timeout = job.publisher === 'wiley' ? 9 * 60 * 1000 : 180000;", "var timeout = 12 * 60 * 1000;")
s=s.replace("if (result && result.finishedAt) {", "if (result && result.jobId === job.jobId && result.version === VERSION && result.finishedAt && (!result.reportPending || Date.now()-Date.parse(result.finishedAt)>25000)) {")
s=s.replace("      doi: doi,\n      publisher: publisher || '',", "      doi: doi,\n      jobId: job && job.jobId || '',\n      publisher: publisher || '',")
s=s.replace("hbDoi === normalizeDoi(job.doi) && String(hb.version || '')", "hbDoi === normalizeDoi(job.doi) && hb.jobId === job.jobId && hb.version === VERSION")
a=s.index('    var visible = Array.isArray(queue.visibleGaps)');b=s.index('    var cooling = allJobs.filter',a)
s=s[:a]+'''    var manifest, staged;
    try {
      manifest = await getJson(new URL('media-index.json?ts='+Date.now(),QUEUE_URL).href);
      staged = await getJson(WORKER+'/api/article-figures/staged?ts='+Date.now());
      var allJobs = buildRecoveryJobs(queue,manifest,staged);
    } catch(error) {
      badge('媒体清单尚未就绪：'+String(error.message),'#991b1b');
      return;
    }
    var queueGeneratedAt = String(queue.corpusVersion || queue.generatedAt || '');
    var visible=allJobs.filter(function(j){return j.state==='no_visual';});
    var upgrades=allJobs.filter(function(j){return j.state==='fallback_only';});
    var figureOnly=allJobs.filter(function(j){return j.state==='figure_gap';});
    var queuedFigures=allJobs.filter(function(j){return j.mediaNeed.indexOf('figures')>=0;});
    var reconciled={filteredByR2:queue.allPapers.length-allJobs.length};
    var limit=batchSize();
    var jobs=selectBatchJobs(executableJobs(allJobs,queueGeneratedAt),limit);
''' + s[b:]
s=s.replace("      summary.results.push(result);", "      summary.results.push(result);\n      GM_setValue(SUMMARY_KEY,summary);")
s=s.replace("      } else if (result.status === 'aborted') {", "      } else if (result.status === 'partial') {\n        summary.partial = Number(summary.partial || 0)+1;\n        GM_setValue(failureKey(job.doi,taskKind),{at:Date.now(),reason:result.reason,engineRevision:FAILURE_ENGINE_REVISION});\n      } else if (result.status === 'aborted') {")
s=s.replace("var FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000;", "var FAILURE_COOLDOWN_MS = 30 * 60 * 1000;")
s=s.replace("        method: 'page_fetch'", "        sourceUrl: response.url || requestUrl,\n        method: 'page_fetch'")
s=s.replace("        method: 'gm_fetch'", "        sourceUrl: response.finalUrl || requestUrl,\n        method: 'gm_fetch'")
s=s.replace("        method: 'rendered_canvas'", "        sourceUrl: image.currentSrc || image.src,\n        method: 'rendered_canvas'")
s=s.replace("if (!image || !image.complete || image.naturalWidth < 1)", "if (!image || !image.complete || image.naturalWidth < 1 || mediaUrlIdentity(candidate.url,location.href) !== mediaUrlIdentity(image.currentSrc || image.src,location.href))")
s=s.replace("        referrer: location.href\n", "        referrer: location.href,\n        signal: AbortSignal.timeout(18000)\n")
s=s.replace("    var link = node.closest && node.closest('a[href]');", "    var block=node.closest&&node.closest('figure,.figure,.fig-section,.fig-group,[role=figure]');\n    if(block)block.querySelectorAll('a[href]').forEach(function(a){if(/full.size|large|download/i.test(a.textContent||a.title||'')||/\\.(svg|png|jpe?g|webp)([?#]|$)/i.test(a.href))add(a.href);});\n    var link = node.closest && node.closest('a[href]');")
s=s.replace("        staged: true, imported: false, published: false,\n        publicationState: 'pending_verified_promotion'", "        staged: true, imported: result.indexed === true, published: false,\n        publicationState: result.indexed === true ? 'indexed_live_api' : 'pending_verified_promotion'")
s=s.replace("        sourceUrl: candidate.url,\n        caption:","        sourceUrl: image.sourceUrl || candidate.url,\n        caption:")
s=s.replace("    return image;\n  }\n\n  async function uploadArticleFigure", "    if(image.sourceUrl && candidate.doi && !candidateBelongsToJob(image.sourceUrl,{doi:candidate.doi}))return null;\n    return image;\n  }\n\n  async function uploadArticleFigure")
s=s.replace("    writePublisherHeartbeat(null, 'script_loaded');",'').replace("      writePublisherHeartbeat(null, 'active_job_missing');",'')
s=s.replace("  function captureContext(node) {\n", "  function captureContext(node) {\n    for(var a=node;a&&a!==document.body;a=a.parentElement){if(/^(ASIDE|NAV|FOOTER)$/.test(a.tagName||'')||/recommend|related[-_ ]|references|ref-list|sidebar/i.test(String(a.id||'')+' '+String(a.className||'')))return '';}\n")
s=s.replace("return Boolean(prior && prior.status === 'success');", "return Boolean(prior && prior.version === VERSION && prior.status === 'success' && Date.now()-Date.parse(prior.finishedAt||'') < 6*60*60*1000);")
s=s.replace("if (prior && prior.status === 'success') {", "if (alreadySucceeded(job,job.queueGeneratedAt)) {")
s=s.replace("    return live || String(candidate && candidate.url || '');", "    return String(candidate && candidate.url || '') || live;")
s=s.replace("    if(!/\\/figures\\/\\d+(?:[?#]|$)|\\/view-large\\//i.test(candidate.url))return [candidate];", "    if(/\\.(?:svg|png|jpe?g|webp)(?:[?#]|$)/i.test(candidate.url))return [candidate];\n    if(!/\\/figures\\/\\d+(?:[?#]|$)|\\/view-large\\//i.test(candidate.url))return [candidate];")
s=s.replace("replace(/^fig\\.?\\s*/, 'figure ')", "replace(/^fig(?:\\.\\s*|\\s+)/, 'figure ')")
p.write_text(s)

p=Path('cloudflare/worker/src/media-write.js');s=p.read_text();s="import { safeSvgInfo } from './safe-svg.js';\n"+s
s=s.replace('(?:png|jpe?g|gif|webp)', '(?:png|jpe?g|gif|webp|svg\\+xml)')
s=s.replace('  return { contentType, bytes };\n}',"  if (contentType === 'image/svg+xml' && !safeSvgInfo(bytes)) return null;\n  return { contentType, bytes };\n}",1)
s=s.replace('function imageDimensions(bytes, contentType) {',"function imageDimensions(bytes, contentType) {\n  if (contentType === 'image/svg+xml') return safeSvgInfo(bytes);")
s=s.replace('function extensionForContentType(contentType) {',"function extensionForContentType(contentType) {\n  if (contentType === 'image/svg+xml') return 'svg';")
s=s.replace('`toc-cache/images/${token}.${extensionForContentType(image.contentType)}`','`toc-cache/images/${token}/${fullHash}.${extensionForContentType(image.contentType)}`')
s=s.replace('`figure-cache/images/${token}/${sourceId}.${extensionForContentType(image.contentType)}`','`figure-cache/images/${token}/${sourceId}-${fullHash.slice(0,32)}.${extensionForContentType(image.contentType)}`')
s=s.replace("COALESCE(figure_assets.width, 0) = 0", "COALESCE(figure_assets.updated_at, 0) < 1790082000000\n         OR COALESCE(figure_assets.width, 0) = 0")
s=s.replace("httpMetadata: { contentType: image.contentType }", "httpMetadata: { contentType: image.contentType }, customMetadata: { doi, contentHash, articleUrl, sourceUrl: String(payload.sourceUrl || '').slice(0,1500), captureVersion: String(payload.captureVersion || '') }")
p.write_text(s)
p=Path('cloudflare/worker/src/local-captures.js');s=p.read_text().replace("import { importFigure }", "import { importFigure, importToc }");s="import { safeSvgInfo } from './safe-svg.js';\n"+s
s=s.replace('  return { bytes, contentType };', "  if (contentType === 'image/svg+xml' && !safeSvgInfo(bytes)) return null;\n  return { bytes, contentType };")
helper='''async function indexBoundCapture(request, env, payload, hash, role) {
  if (!env.DB) return false;
  try {
    const result = role === 'official'
      ? await importToc(request, env, {...payload, replace: true})
      : await importFigure(request, env, payload);
    if (result.status !== 200) return false;
    const row = role === 'official'
      ? await env.DB.prepare('SELECT content_hash FROM toc_assets WHERE doi = ? AND available = 1').bind(payload.doi).first()
      : await env.DB.prepare('SELECT content_hash FROM figure_assets WHERE doi = ? AND source_id = ?').bind(payload.doi, payload.id).first();
    return row?.content_hash === hash;
  } catch (error) { console.warn('BOUND_CAPTURE_INDEX_PENDING', String(error?.message || error).slice(0,120)); return false; }
}

'''
s=s.replace('function sniffImageType(',helper+'function sniffImageType(')
s=s.replace("    .filter(([, item]) => !requestedDoi", "    .filter(([, item]) => !captureIntakeError(item, item?.doi))\n    .filter(([, item]) => !item.indexed)\n    .filter(([, item]) => !requestedDoi")
s=s.replace("      const contentType = item.contentType", "      if ((await sha256Hex(bytes)).slice(0,32) !== item.contentHash) throw new Error('staged_hash_mismatch');\n      const contentType = item.contentType")
s=s.replace("        doi: item.doi,\n        articleUrl:","        ...item,\n        doi: item.doi,\n        articleUrl:")
s=s.replace("      delete index.items[identity];\n      indexChanged = true;\n      try { await env.MEDIA.delete(item.r2Key); } catch {}", "      item.indexed = true;\n      item.indexedAt = Date.now();\n      indexChanged = true;")
a=s.index('export async function importStagedArticleFigure');b=s.index('export async function getStagedArticleFigures',a);f=s[a:b]
f=f.replace('  return {\n    status: 200,\n    body: {\n      stored: true,','  const indexed = await indexBoundCapture(request, env, {...payload, id: sourceId}, contentHash, \'figure\');\n  return {\n    status: 200,\n    body: {\n      indexed,\n      stored: true,',1);s=s[:a]+f+s[b:]
a=s.index('export async function importLocalCapture');b=s.index('\nexport async function ',a+10);f=s[a:b]
f=f.replace('  return {\n    status: 200,\n    body: {\n      stored: true,',"  const indexed = kind === 'official' && await indexBoundCapture(request, env, payload, hash.slice(0,32), 'official');\n  return {\n    status: 200,\n    body: {\n      indexed,\n      stored: true,",1);s=s[:a]+f+s[b:]
s=s.replace("if (previous && Number(previous.updatedAt", "if (previous && previous.captureVersion === '6.2.20' && previous.pageDoi === doi && Number(previous.updatedAt")
p.write_text(s)
p=Path('cloudflare/worker/src/media.js');s=p.read_text().replace("  headers.set('etag', object.httpEtag);", "  headers.set('etag', object.httpEtag);\n  headers.set('x-content-type-options', 'nosniff');\n  headers.set('content-security-policy', \"sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'\");");p.write_text(s)
p=Path('cloudflare/scripts/merge-curated-pages.mjs');s=p.read_text();assert 'mergeReviewedToc' in s, 'Must retain recovered TOCs'
s+="\nconst { writeRecoveryQueue } = await import('./build-tm-recovery-queue.mjs');\nawait writeRecoveryQueue();\n";p.write_text(s)

# Prepare explicit workflow edits under ordinary source paths; the authorized connector applies them.
# The Actions token never edits workflows or bypasses their authorization job.
out=Path('audit/tm620-release-contracts');out.mkdir(parents=True,exist_ok=True)
for name in ['github-pages.yml','toc-publisher-adapters-ci.yml']:
 t=Path('.github/workflows/'+name).read_text().replace('6.2.19','6.2.20').replace('2.2.19','2.2.20')
 for old,new in [
 ("var figureJob = jobKind(job) === 'figures';", "var figureJob = String(job.mediaNeed || '').indexOf('figures') >= 0;"),
 ('_semantic_window','_bounded_semantics'),
 ('var delayedUpgrades = upgrades.filter','var jobs=selectBatchJobs(executableJobs(allJobs,queueGeneratedAt),limit)'),
 ('D1 import unavailable; preserving figure in R2','indexed_live_api'),
 ('queue.figureGaps','queue.allPapers')]:t=t.replace(old,new)
 (out/name).write_text(t)
print('TM620_ASSEMBLED_WITH_QUARANTINE_AND_RELEASE_GATES_INTACT')
