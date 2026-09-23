"""Apply bounded source changes and preserve explicitly reviewed bytes; no R2/D1 writes."""
import hashlib,io,json,os,pathlib,re,urllib.parse,urllib.request,zipfile
ARTIFACT=10735114169
SHA='d8074cacdbdea81f483b947fc2ea4568859e239781c033150538c8734d3979eb'
class BoundRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  out=super().redirect_request(req,fp,code,msg,headers,newurl)
  if out is not None and urllib.parse.urlsplit(req.full_url).netloc!=urllib.parse.urlsplit(newurl).netloc:out.remove_header('Authorization')
  return out
req=urllib.request.Request(f'https://api.github.com/repos/zhou526316-sys/organic-synthesis-gallery/actions/artifacts/{ARTIFACT}/zip',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'})
with urllib.request.build_opener(BoundRedirect()).open(req,timeout=45) as res:raw=res.read(32000001)
assert len(raw)<=32000000 and hashlib.sha256(raw).hexdigest()==SHA,'frozen_evidence_changed'
z=zipfile.ZipFile(io.BytesIO(raw));ev=json.loads(z.read('evidence.json'));assert ev['errors']==[]
# Individually viewed next-001..031; next-032..035 are held for corpus-scope review.
rows=[r for r in ev['images'] if r['reviewId'] in {f'next-{n:03d}' for n in range(1,32)}]
assert len(rows)==31
root=pathlib.Path('audit/media-recovery/body-batch2');(root/'assets').mkdir(parents=True,exist_ok=True);items=[]
for r in rows:
 assert r.get('hashVerified') and not r.get('error') and r['pageDoi']==r['doi'] and r['captureVersion']=='6.2.20' and r['mediaGeneration']==1790082000000
 b=z.read(r['file']);h=hashlib.sha256(b).hexdigest();assert h==r['sha256'] and h.startswith(r['contentHash']) and len(b)==r['actualBytes']==r['byteLength']
 ext=pathlib.PurePosixPath(r['file']).suffix;assert ext in ('.svg','.png','.webp')
 p=root/'assets'/(h+ext);p.write_bytes(b)
 items.append({'reviewId':r['reviewId'],'approved':True,'role':'article_figure','doi':r['doi'],'id':r['id'],'label':r['label'],'caption':r['caption'],'articleUrl':r['articleUrl'],'sourceUrl':r['sourceUrl'],'captureVersion':r['captureVersion'],'pageDoi':r['pageDoi'],'jobId':r['jobId'],'mediaGeneration':r['mediaGeneration'],'originalUpdatedAt':r['updatedAt'],'originalR2Key':r['r2Key'],'contentHash':r['contentHash'],'sha256':h,'byteLength':len(b),'contentType':r['contentType'],'width':r['width'],'height':r['height'],'order':int(r['sortOrder']),'assetPath':p.as_posix(),'quality':'vector_or_mixed_svg' if ext=='.svg' else 'captured_raster_'+str(r['width'])+'px','reviewBasis':'exact bytes, current job/page/source identity, full hash and cross-DOI duplicate check; individual diagram/caption/title visual review'})
manifest={'publicationId':'reviewed-body-batch2-20260923','cutoverMs':1790082000000,'approvedCount':31,'sourceArtifact':ARTIFACT,'sourceArchiveSha256':SHA,'readAt':ev['readAt'],'readCompletedAt':ev['readCompletedAt'],'scope':'31 specific body files only; no TOC replacement, no full-article completeness claim, no automatic staging promotion.','held':[{'doi':'10.1021/jacs.6c13641','reason':'polymerization scope recheck, not a contamination finding or permanent exclusion','reviewIds':['next-032','next-033','next-034','next-035']}],'items':items}
text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n';(root/'manifest.json').write_text(text)
registry={'version':1,'scope':'Explicit reviewed incremental body batches; unlisted staging is never published.','releases':[{'publicationId':manifest['publicationId'],'manifestPath':(root/'manifest.json').as_posix(),'manifestSha256':hashlib.sha256(text.encode()).hexdigest(),'approvedCount':31,'statusFile':'body-publication-batch2-status.json'}]}
pathlib.Path('audit/media-recovery/body-releases.json').write_text(json.dumps(registry,indent=2)+'\n')

def patch(name,old,new):
 p=pathlib.Path(name);t=p.read_text()
 if new in t:return
 assert t.count(old)==1,(name,old[:90],t.count(old))
 p.write_text(t.replace(old,new,1))
patch('cloudflare/worker/src/stage-storage.js','// Storage only:',"import { buildBodyReviewMarker } from './body-review-marker.js';\n// Storage only:")
patch('cloudflare/worker/src/stage-storage.js','requestId, storageRetryCount: retryCount, ...extra','requestId, storageRetryCount: retryCount, fullSha256: record.fullSha256 || null, review: record.review || null, ...extra')
patch('cloudflare/worker/src/stage-storage.js','const record = {...entry, updatedAt: now(), stageStorageRevision: STAGE_STORAGE_REVISION};','const record = {...entry, updatedAt: now(), stageStorageRevision: STAGE_STORAGE_REVISION, fullSha256: fullHash, review: await buildBodyReviewMarker(entry, fullHash)};')
patch('cloudflare/worker/src/index.js','publishedAutomatically:false,stageStorageRevision:STAGE_STORAGE_REVISION','publishedAutomatically:false,bodyReviewMarkers:\'body-review-v1\',stageStorageRevision:STAGE_STORAGE_REVISION')
patch('cloudflare/scripts/merge-reviewed-body.mjs',"import {createHash} from 'node:crypto';","import {createHash} from 'node:crypto';\nimport {buildBodyReviewMarker} from '../worker/src/body-review-marker.js';")
patch('cloudflare/scripts/merge-reviewed-body.mjs',"export async function mergeReviewedBody(root=process.cwd()){\n const plan=JSON.parse(await readFile(path.join(root,'audit/media-recovery/body-batch1/manifest.json'),'utf8'));\n demand(plan.publicationId===ID&&plan.cutoverMs===CUTOVER&&plan.approvedCount===32&&plan.items.length===32,'invalid_body_review_plan');", "export async function mergeReviewedBody(root=process.cwd(), release=null){\n const ID=release?.publicationId || 'reviewed-body-batch1-20260923';\n const count=release?.approvedCount || 32;\n const manifestPath=release?.manifestPath || 'audit/media-recovery/body-batch1/manifest.json';\n const statusFile=release?.statusFile || 'body-publication-status.json';\n demand(/^reviewed-body-batch[0-9]+-[0-9]{8}$/.test(ID)&&Number.isInteger(count)&&count>0&&count<=100,'invalid_body_release');\n demand(/^audit\\/media-recovery\\/body-batch[0-9]+\\/manifest\\.json$/.test(manifestPath)&&/^body-publication(?:-[a-z0-9-]+)?-status\\.json$/.test(statusFile),'invalid_body_release_path');\n const plan=JSON.parse(await readFile(path.join(root,manifestPath),'utf8'));\n demand(plan.publicationId===ID&&plan.cutoverMs===CUTOVER&&plan.approvedCount===count&&plan.items.length===count,'invalid_body_review_plan');")
patch('cloudflare/scripts/merge-reviewed-body.mjs',r'body-batch1\/assets\/',r'body-batch[0-9]+\/assets\/')
patch('cloudflare/scripts/merge-reviewed-body.mjs',"  const figure={id:item.id,label:item.label", "  const reviewMarker=await buildBodyReviewMarker(item,item.sha256);\n  const figure={reviewEvidenceKey:reviewMarker.evidenceKey,id:item.id,label:item.label")
patch('cloudflare/scripts/merge-reviewed-body.mjs',"path.join(root,'public/body-publication-status.json')","path.join(root,'public',statusFile)")
patch('cloudflare/scripts/merge-curated-pages.mjs','await mergeReviewedBody();',"await mergeReviewedBody();\n// Incremental explicitly approved batches; this never reads unreviewed stage objects.\nconst {mergeReviewedBodyReleases}=await import('./merge-reviewed-body-releases.mjs');\nawait mergeReviewedBodyReleases();")
print('BODY_REVIEW_BATCH2 '+json.dumps({'approved':len(items),'dois':len(set(r['doi'] for r in items)),'bytes':sum(r['byteLength'] for r in items),'r2Writes':0,'literatureWrites':0,'captureVersionUnchanged':'6.2.20'}))
