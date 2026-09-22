"""Apply a scoped release on a fresh mainline branch. Does not deploy or touch production media."""
import hashlib,pathlib,re,subprocess
P=pathlib.Path
TESTED='4746f9edb970995039e95dfa21a4da442b843733'
EXPECTED={
'public/toc-mainline.user.js':'3ea13121198fe315061e01d6654adbc44d84e8ca4add3016f7ead8e1114376c6',
'cloudflare/scripts/build-bridge-loader.mjs':'f9fb2caa1f4866336c3b2660f93f6676e3dd6c2b32bc6638e4ab4139d6a4fb36',
'cloudflare/scripts/build-live-toc-demand-queue.mjs':'73c99902477547006384a63c5f483c056b8bf92288275ec3843efaebfba04e30',
'cloudflare/worker/src/local-captures.js':'8a91b31a12e34692eecd8c42dd4b1eadeec1e70d4b66a6bc0c2e3dd949c6529c',
'cloudflare/worker/src/media-write.js':'8331a295aeada137af7d063459e354e414f855430753f600d6d478107987dc1e',
'cloudflare/worker/src/media.js':'0802478a7e4cf3048c836081bad5c4d84009a00557eee4e060a8e0f0d1c53517'}

def once(s,a,b):
 if s.count(a)!=1:raise RuntimeError('patch anchor count '+str(s.count(a))+': '+a[:100])
 return s.replace(a,b,1)
def replace_fn(s,name,value):
 m=re.search(r'(?m)^  (?:async )?function '+re.escape(name)+r'\(',s)
 if not m:return s.replace('  installMenu();',value.rstrip()+'\n\n  installMenu();',1)
 e=re.search(r'(?m)^  (?:async )?function ',s[m.end():]);end=m.end()+e.start() if e else len(s)
 return s[:m.start()]+value.rstrip()+'\n\n'+s[end:]

# Refuse unrelated parallel edits. On rerun, start from the exact reviewed core again.
for path,expected in EXPECTED.items():
 current=P(path).read_bytes()
 if 'NIGHT_RELEASE_V220' not in P('public/toc-mainline.user.js').read_text() and hashlib.sha256(current).hexdigest()!=expected:
  raise RuntimeError('parallel media edit requires reconciliation: '+path)
for path in EXPECTED:
 P(path).write_bytes(subprocess.check_output(['git','show',TESTED+':'+path]))
for path in ['scripts/test-media-identity-v220.mjs','scripts/test-tm-stage-first.mjs','scripts/test-tm-paired-capture.mjs']:
 P(path).write_bytes(subprocess.check_output(['git','show',TESTED+':'+path]))

path=P('public/toc-mainline.user.js');s=path.read_text()
s=s.replace("var VERSION = '6.2.20';","var VERSION = '6.2.20';\n  // NIGHT_RELEASE_V220: paired, checkpointed, serial browser capture.",1)
s=once(s,'// @grant        GM_listValues\n','// @grant        GM_listValues\n// @grant        GM_getTab\n// @grant        GM_saveTab\n')
parts=P('scripts/tm-night-controller.part.js').read_text()
starts=list(re.finditer(r'(?m)^  (?:async )?function (\w+)\(',parts))
for i,m in enumerate(starts):
 part=parts[m.start():starts[i+1].start() if i+1<len(starts) else len(parts)]
 s=replace_fn(s,m[1],part)
s=s.replace('expiresAt: now + 90000','expiresAt: now + 300000').replace('expiresAt: Date.now() + 90000','expiresAt: Date.now() + 300000')
s=once(s,"  installMenu();", "  if(isGalleryPage() && location.pathname.endsWith('/capture-launch.html')) { launchBoundPublisherTab().catch(function(e){document.body.textContent='任务未启动：'+String(e.message);}); return; }\n\n  installMenu();")
s=once(s,"  function installMenu() {", "  function installMenu() {\n    GM_registerMenuCommand('启动夜间连续抓取（TOC＋正文图）',function(){GM_setValue(P+'night-mode',true);GM_deleteValue(ABORT_KEY);GM_setValue(ENABLED_KEY,true);if(isGalleryPage())controllerRun();else window.open('https://'+GALLERY_HOST+GALLERY_PATH,'_blank');});")
s=s.replace('      GM_deleteValue(LEASE_KEY);\n      if (isGalleryPage()) controllerRun();','      if (isGalleryPage()) controllerRun();')
s=s.replace('      GM_deleteValue(LEASE_KEY);\n      if (isGalleryPage()) {','      if (isGalleryPage()) {')
s=once(s,"    job.captureDeadline=Date.now()+6*60*1000;", "    job.captureDeadline=Date.now()+6*60*1000;\n    var checkpoint=readCaptureCheckpoint(job.doi);\n    if(checkpoint.toc&&checkpoint.toc.kind==='official')job.captureToc=false;")
s=once(s,"result.toc={status:'stored',kind:best.candidate.kind,quality:best.quality.quality,imageUrl:receipt.imageUrl};", "result.toc={status:'stored',kind:best.candidate.kind,quality:best.quality.quality,imageUrl:receipt.imageUrl,apiAvailable:receipt.apiAvailable===true};\n            checkpoint.toc={kind:best.candidate.kind,contentHash:receipt.contentHash,sourceUrl:best.candidate.url};saveCaptureCheckpoint(job.doi,checkpoint);")
s=once(s,'      for (var i=0;i<Math.min(labels.length,20);i+=1) {','      var newlyProcessed=0;\n      for (var i=0;i<labels.length;i+=1) {\n        if(checkpoint.figures[labels[i]]){result.figures.resumed=(result.figures.resumed||0)+1;continue;}\n        if(newlyProcessed>=20){result.figures.limitReached=true;break;}\n        newlyProcessed+=1;')
s=once(s,'          result.figures.stored+=1;result.figuresStaged+=1;',"          result.figures.stored+=1;result.figuresStaged+=1;result.figuresImported+=stored.apiAvailable===true?1:0;\n          checkpoint.figures[label]={contentHash:stored.contentHash,sourceUrl:chosen.candidate.url,apiAvailable:stored.apiAvailable===true};saveCaptureCheckpoint(job.doi,checkpoint);")
s=once(s,'      if (labels.length>20) result.figures.limitReached=true;', '      if(labels.some(function(label){return !checkpoint.figures[label];}))result.figures.limitReached=true;')
s=once(s,"        await sleep(2000); continue;", "        if(Date.now()-started>20000)throw new Error(state.auth?'publisher_login_required':'publisher_challenge_required');\n        await sleep(2000); continue;")
s=once(s,"        staged: true, imported: false, published: false,\n        publicationState: 'pending_verified_promotion'", "        staged: true, imported: result.apiAvailable===true, published: false,\n        publicationState: result.apiAvailable===true?'api_available':'pending_verified_promotion'")
s=once(s,"      // Do not complete or overwrite the active job from an unrelated tab.\n      await uploadReport(job, [{ stage: 'page_doi_guard', event: 'rejected', status: 'failed', url: location.href, message: String(error.message) }], 'failed', String(error.message), null, writeToken());", "      // A stale/manual tab cannot overwrite the current task's report or receipt.\n      GM_setValue(P+'last-guard-rejection',{at:nowIso(),reason:String(error.message),page:sanitizeDiagnosticUrl(location.href)});")
# Leave imported unpublished until a positive API receipt, never promote success counters alone.
path.write_text(s)
P('public/capture-launch.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Gallery 抓取任务</title><body>正在绑定本标签页与文献任务。若停留不动，请确认新版 Tampermonkey 已启用。</body></html>\n')
p=P('cloudflare/scripts/build-bridge-loader.mjs');s=p.read_text();s=once(s,'// @grant        GM_listValues\n','// @grant        GM_listValues\n// @grant        GM_getTab\n// @grant        GM_saveTab\n');p.write_text(s)

# Verify and formally index newly accepted capture bytes, including safe SVG and WebP.
p=P('cloudflare/worker/src/local-captures.js');s=p.read_text()
s="import { inspectBrowserImage, publishVerifiedBrowserMedia, fullDigest } from './verified-browser-media.js';\n"+s
s=once(s,'  return { bytes, contentType };','  if(!inspectBrowserImage(bytes,contentType))return null;\n  return { bytes, contentType };')
s=s.replace('previous && Number(previous.updatedAt || 0) >= MEDIA_REBUILD_EPOCH', "previous && previous.captureVersion==='6.2.20' && Number(previous.updatedAt || 0) >= MEDIA_REBUILD_EPOCH")
s=once(s,'  if (previous?.r2Key && previous.r2Key !== key) {\n    try { await env.MEDIA.delete(previous.r2Key); } catch {}\n  }','  // Never delete an immutable image referenced by a formal D1 record.')
s=s.replace('    mediaGeneration: MEDIA_REBUILD_EPOCH,','    mediaGeneration: MEDIA_REBUILD_EPOCH,\n    sha256: hash,')
# Stage receipt is returned only after independent formal readback (or marked pending).
a=s.index('export async function importStagedArticleFigure(');b=s.index('\nexport async function getStagedArticleFigures',a);f=s[a:b]
f=once(f,'  return {\n    status: 200,\n    body: {\n      stored: true,\n      staged: true,', '  const publication=await publishVerifiedBrowserMedia(env,index.items[identity],image.bytes);\n  return {\n    status: 200,\n    body: {\n      ...publication,\n      stored: true,\n      staged: true,')
# Disable the early higher-resolution shortcut: formal SQL independently preserves quality.
f=f.replace("  if (previous && previous.captureVersion==='6.2.20'", "  if (false && previous && previous.captureVersion==='6.2.20'",1)
s=s[:a]+f+s[b:]
a=s.index('export async function importLocalCapture(');b=s.index('\nexport async function getLocalCaptureIndex',a);f=s[a:b]
f=once(f,'  return {\n    status: 200,\n    body: {\n      stored: true,', '  const publication=await publishVerifiedBrowserMedia(env,index.items[identity],image.bytes);\n  return {\n    status: 200,\n    body: {\n      ...publication,\n      stored: true,')
s=s[:a]+f+s[b:]
a=s.index('export async function promoteStagedArticleFigures(');b=s.index('\nexport async function importLocalCapture',a)
s=s[:a]+'''export async function promoteStagedArticleFigures(request,env,payload={}) {
  if(!env?.MEDIA||!env?.DB)return {status:503,body:{error:'Media bindings unavailable'}};
  const index=await readArticleFigureStageIndex(env);
  const selected=Object.values(index.items||{}).filter(item=>item.captureVersion==='6.2.20'&&item.sha256&&Number(item.updatedAt)>=MEDIA_REBUILD_EPOCH&&captureBelongsToDoi(item,item.doi)&&(!payload.doi||item.doi===normalizeDoi(payload.doi))).slice(0,Math.min(100,Number(payload.limit||25)));
  const results=[];
  for(const item of selected)results.push({doi:item.doi,id:item.id,...await publishVerifiedBrowserMedia(env,item)});
  // Do not mutate the shared staging index or delete R2 evidence while a browser is capturing.
  return {status:200,body:{requested:selected.length,promoted:results.filter(r=>r.apiAvailable).length,failed:results.filter(r=>!r.apiAvailable).length,retainedEvidence:true,results}};
}
''' +s[b:]
a=s.index('export async function getLocalCaptureIndex(');b=s.index('\nexport async function ',a+1);f=s[a:b]
f=once(f,'      version: Number(index.version || 1),', "      captureVersion: '6.2.20',\n      verifiedPublication: true,\n      mediaGeneration: MEDIA_REBUILD_EPOCH,\n      version: Number(index.version || 1),")
s=s[:a]+f+s[b:];p.write_text(s)

# SVG objects are indexed under their exact content-addressed keys. Static mirroring preserves MIME.
p=P('cloudflare/scripts/merge-worker-media.mjs');s=p.read_text();s=once(s,"  if (type === 'image/png') return 'png';","  if (type === 'image/svg+xml') return 'svg';\n  if (type === 'image/png') return 'png';");s=s.replace('.slice(0, 10);','.slice(0, 24);');p.write_text(s)
p=P('cloudflare/worker/src/index.js');s=p.read_text();s=s.replace('purgeCrossDoiMedia(env, { dryRun: false })','purgeCrossDoiMedia(env, { dryRun: true })').replace('purgeCrossDoiLocalMedia(env, { dryRun: false })','purgeCrossDoiLocalMedia(env, { dryRun: true })').replace("console.warn('CROSS_DOI_MEDIA_PURGED'","console.warn('CROSS_DOI_MEDIA_AUDIT_ONLY'");p.write_text(s)

# Actual browser test scenarios are independent; add an explicit resume test separately.
p=P('scripts/test-tm-paired-capture.mjs');s=p.read_text();s=once(s," await page.evaluate(()=>document.querySelector('#graphicalAbstract').remove());", " await page.evaluate(()=>{document.querySelector('#graphicalAbstract').remove();Object.keys(__gm).filter(k=>k.includes('checkpoint:')).forEach(k=>delete __gm[k]);});");p.write_text(s)
# Original VM tests strip imports; provide real helpers through context in the new integration test.
p=P('scripts/test-media-identity-v220.mjs');s=p.read_text();s=s.replace("import { webcrypto } from 'node:crypto';", "import { webcrypto } from 'node:crypto';\nimport {inspectBrowserImage,publishVerifiedBrowserMedia,fullDigest} from '../cloudflare/worker/src/verified-browser-media.js';");s=s.replace('console, normalizeDoi });','console, normalizeDoi, inspectBrowserImage,publishVerifiedBrowserMedia,fullDigest });');p.write_text(s)
print('NIGHT_RELEASE_APPLIED; tested core='+TESTED+'; no production writes')
