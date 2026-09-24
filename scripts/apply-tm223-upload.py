"""Deterministic feature-branch patch. Does not contact publishers or mutate media."""
from pathlib import Path

def once(s,a,b):
 if s.count(a)!=1:raise RuntimeError('Expected one anchor: '+a[:120])
 return s.replace(a,b,1)
def save(name,s):Path(name).write_text(s)

p='public/toc-mainline.user.js';s=Path(p).read_text()
if 'BEGIN OSG_UPLOAD_EVIDENCE_V1' not in s:
 s=once(s,"var CONTROLLER_REVISION = '2.2.22';","var CONTROLLER_REVISION = '2.2.23';")
 a=s.index('  async function fetchPostJson(');b=s.index('  function headerValue(',a)
 s=s[:a]+Path('scripts/tm-upload-evidence.fragment.js').read_text()+'\n'+s[b:]
 s=once(s,'var result = await postJson(FIGURE_STAGE_ENDPOINT, payload, token);',"var result = await postAcquiredImage(job, candidate, image, trace, FIGURE_STAGE_ENDPOINT, payload, token, 'figure_stage');")
 a=s.index('  async function uploadCapture(');b=s.index('  async function uploadReport(',a);f=s[a:b]
 f=once(f,'var result = await postJson(CAPTURE_ENDPOINT, {', 'var result = await postAcquiredImage(job, candidate, image, trace, CAPTURE_ENDPOINT, {')
 f=once(f,'      }, token);',"      }, token, 'r2_upload');")
 s=s[:a]+f+s[b:]
 save(p,s)
else:assert any("var CONTROLLER_REVISION = '"+v+"';" in s for v in ('2.2.23','2.2.24','2.2.25','2.2.26','2.2.27','2.2.28','2.2.29','2.2.30'))

p='cloudflare/worker/src/local-captures.js';s=Path(p).read_text()
if "from './stage-storage.js'" not in s:
 s="import { storeVerifiedStage } from './stage-storage.js';\n"+s
 a=s.index("  const identity = doi + '|' + sourceId;",s.index('export async function importStagedArticleFigure('))
 b=s.index('\nexport async function getStagedArticleFigures(',a)
 replacement="""  const key = ARTICLE_FIGURE_STAGE_PREFIX + doiHash.slice(0, 24) + '/' +
    sourceId + '-' + hash.slice(0, 16) + '.' + extensionFor(image.contentType);
  const entry = {doi, id: sourceId, label, caption, articleUrl, sourceUrl, r2Key: key,
    contentHash, contentType: image.contentType, byteLength: image.bytes.byteLength,
    width, height, sortOrder, jobId: payload.jobId, captureVersion: payload.captureVersion,
    pageDoi: payload.pageDoi, mediaGeneration: MEDIA_REBUILD_EPOCH};
  return storeVerifiedStage(request, env, entry, image.bytes, hash, previous =>
    previous.doi === doi && previous.id === sourceId && previous.captureVersion === '6.2.20' &&
    previous.pageDoi === doi && captureBelongsToDoi(previous, doi));
}
"""
 s=s[:a]+replacement+s[b:];save(p,s)
p='cloudflare/worker/src/index.js';s=Path(p).read_text()
if 'STAGE_STORAGE_REVISION' not in s:
 s="import { STAGE_STORAGE_REVISION } from './stage-storage.js';\n"+s
 s=once(s,'return json(result.body, { status: result.status || 200, headers });','return json(result.body, { status: result.status || 200, headers: { ...(result.headers || {}), ...headers } });')
 s=once(s,"'access-control-max-age': '86400',","'access-control-max-age': '86400',\n    'access-control-expose-headers': 'retry-after, cf-ray, content-type',")
 s=once(s,"maxFiguresPerVisit:20,publishedAutomatically:false}","maxFiguresPerVisit:20,publishedAutomatically:false,stageStorageRevision:STAGE_STORAGE_REVISION}")
 save(p,s)
# This is a forward installer revision, not a checkpoint/capture-protocol migration.
for p in ['cloudflare/scripts/build-bridge-loader.mjs','scripts/validate-tm220-artifacts.mjs','scripts/test-tm221-window-guard.mjs']:
 s=Path(p).read_text();save(p,s.replace('2.2.22','2.2.23'))
# Keep earlier idempotent application checks, but allow the explicitly verified forward release.
p='scripts/apply-tm222-live-progress.py';s=Path(p).read_text();s=s.replace('assert "var CONTROLLER_REVISION = \'2.2.22\';" in s','assert any("var CONTROLLER_REVISION = \'"+v+"\';" in s for v in (\'2.2.22\',\'2.2.23\'))');save(p,s)
p='scripts/patch-tm221-window-guard.py';s=Path(p).read_text();s=s.replace('if "var CONTROLLER_REVISION = \'2.2.22\';" in s:', 'if any("var CONTROLLER_REVISION = \'"+v+"\';" in s for v in (\'2.2.22\',\'2.2.23\')):');save(p,s)
p='scripts/test-tm-stage-first.mjs';s=Path(p).read_text()
if 'UPLOAD_EVIDENCE_V1' not in s:
 s=once(s,'    captureLiveUpdate: () => {},','    sleep: async () => {},\n    captureLiveUpdate: () => {},')
 s=once(s,'  vm.runInContext(fn, ctx);',"  // Test the actual upload-only retry wrapper, not a replacement stub.\n  if (source.includes('BEGIN OSG_UPLOAD_EVIDENCE_V1')) vm.runInContext(source.slice(source.indexOf('  function retryableImageUpload('), source.indexOf('  // END OSG_UPLOAD_EVIDENCE_V1')), ctx);\n  vm.runInContext(fn, ctx);")
 save(p,s)
# Existing public live acceptance must identify the newly published installer, not an obsolete version.
p='.github/workflows/tm222-live-acceptance.yml';s=Path(p).read_text().replace('2\\.2\\.22','2\\.2\\.23').replace("bridgeVersion:'2.2.22'","bridgeVersion:'2.2.23'")
if "'BEGIN OSG_UPLOAD_EVIDENCE_V1'" not in s:
 s=s.replace("['BEGIN OSG_LIVE_PROGRESS_V1'","['BEGIN OSG_UPLOAD_EVIDENCE_V1','postAcquiredImage','same_acquired_image','response_without_worker_error_code','BEGIN OSG_LIVE_PROGRESS_V1'")
save(p,s)
print('TM223_PATCH_APPLIED: upload retries/evidence only; capture protocol 6.2.20; no automatic publication')
