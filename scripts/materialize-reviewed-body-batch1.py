"""Materialize an explicitly reviewed frozen subset. Never mutate R2, D1, or literature."""
import hashlib,io,json,os,pathlib,re,urllib.parse,urllib.request,zipfile
ARTIFACT=10731188935
DIGEST='6d174c60e77bf53ca51398f079272f644b1de4d824853ba6c9f849bacca191c6'
APPROVED={f'body-{n:03d}' for n in range(1,33)}
class BoundRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  out=super().redirect_request(req,fp,code,msg,headers,newurl)
  if out is not None and urllib.parse.urlsplit(req.full_url).netloc!=urllib.parse.urlsplit(newurl).netloc:out.remove_header('Authorization')
  return out
opener=urllib.request.build_opener(BoundRedirect())
req=urllib.request.Request(f'https://api.github.com/repos/zhou526316-sys/organic-synthesis-gallery/actions/artifacts/{ARTIFACT}/zip',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'})
with opener.open(req,timeout=35) as res:raw=res.read(12000001)
assert len(raw)<=12000000 and hashlib.sha256(raw).hexdigest()==DIGEST,'evidence_archive_changed'
z=zipfile.ZipFile(io.BytesIO(raw));ev=json.loads(z.read('evidence.json'));rows=[r for r in ev['images'] if r['reviewId'] in APPROVED]
assert len(rows)==32 and {r['reviewId'] for r in rows}==APPROVED
# The read workflow failed only on its independent capabilities GET, not on selected files or inventory.
assert ev['errors']==[{'kind':'capabilities','error':'HTTPError'}]
root=pathlib.Path('audit/media-recovery/body-batch1');(root/'assets').mkdir(parents=True,exist_ok=True)
items=[]
for r in rows:
 assert r.get('hashVerified') is True and not r.get('error')
 assert r['captureVersion']=='6.2.20' and r['pageDoi']==r['doi'] and r['mediaGeneration']==1790082000000 and r['updatedAt']>=1790082000000
 assert re.fullmatch(r'[a-zA-Z0-9-]{16,80}',r['jobId'])
 b=z.read(r['file']);h=hashlib.sha256(b).hexdigest();assert h==r['sha256'] and h.startswith(r['contentHash']) and len(b)==r['actualBytes']==r['byteLength']
 ext=pathlib.PurePosixPath(r['file']).suffix;assert ext in ('.svg','.png','.webp')
 p=root/'assets'/(h+ext);p.write_bytes(b)
 quality='vector_or_mixed_svg' if ext=='.svg' else 'captured_raster_'+str(r['width'])+'px'
 items.append({'reviewId':r['reviewId'],'approved':True,'role':'article_figure','doi':r['doi'],'id':r['id'],'label':r['label'],'caption':r['caption'],'articleUrl':r['articleUrl'],'sourceUrl':r['sourceUrl'],'captureVersion':r['captureVersion'],'pageDoi':r['pageDoi'],'jobId':r['jobId'],'mediaGeneration':r['mediaGeneration'],'originalUpdatedAt':r['updatedAt'],'originalR2Key':r['r2Key'],'contentHash':r['contentHash'],'sha256':h,'byteLength':len(b),'contentType':r['contentType'],'width':r['width'],'height':r['height'],'order':int(r['sortOrder']),'assetPath':p.as_posix(),'quality':quality,'reviewBasis':'exact bytes and full digest; task/page/source DOI consistency; current bound-generation intake; labelled individual image and chemistry/title/caption visual review'})
manifest={'publicationId':'reviewed-body-batch1-20260923','cutoverMs':1790082000000,'approvedCount':32,'sourceArtifact':ARTIFACT,'sourceArchiveSha256':DIGEST,'readAt':ev['readAt'],'readCompletedAt':ev['readCompletedAt'],'scope':'Specific reviewed Figure/Scheme files only. Never declare all body figures complete; retain existing published Figure 1 and all TOCs. No automatic stage promotion.','evidenceReadLimitation':'Capabilities GET HTTPError; all 32 selected image files, hashes and stage inventory were retrieved. This is not a Worker health acceptance.','items':items}
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(root/'review.md').write_text('''# Body figure review, batch one

All 32 numbered images in frozen artifact 10731188935 were independently rehashed, raster-decoded or SVG-parsed/rendered, and viewed on eight four-image sheets. The five titles and individual captions match the visible chemistry: quinolinium divergent reductions (8 Schemes); imidazopyridine-fused azocinoindoles (2 Figures, 7 Schemes); Sadphos Pd asymmetric annulation (1 Figure, 5 Schemes); aldehyde triple-carbonylation (3 Figures); multi-helical nanographenes (6 Figures).

Both article/source paths encode the exact owning DOI. Current-generation job/page/protocol fields and content-addressed object identities are checked on every build. The 32 rows are a manually approved subset, not automatic approval of all staging data. ACS numeric asset suffixes are not assumed to equal Scheme numbers: Figure/Scheme numbers are preserved from their individual captions and reviewed visible content. All supplied bytes are kept unchanged.

Nature raster captures are 685px wide, not claimed to be publisher maximum resolution. Existing published Figure 1 images are retained instead of being overwritten by these smaller copies. The 32 includes two such overlap candidates; actual additions are reported after production merge. No full-publisher-original recrawl or proof of complete article inventory is claimed.

The evidence workflow's independent capabilities read returned HTTPError. Its 32 selected file reads, byte/hash checks, complete stage-index read and saved publication-source snapshot succeeded. No unavailable health response is used as positive evidence. Production live index, image hashes and browser display still require separate acceptance.
''')
p=pathlib.Path('cloudflare/scripts/merge-curated-pages.mjs');text=p.read_text()
assert 'await mergeReviewedToc();' in text and 'await mergeSealedMediaBatch2();' in text
if 'await mergeReviewedBody();' not in text:
 text+='\n// Reviewed current-generation body files only; keep Worker promotion and quarantine unchanged.\nconst {mergeReviewedBody}=await import(\'./merge-reviewed-body.mjs\');\nawait mergeReviewedBody();\n';p.write_text(text)
print('MATERIALIZED_REVIEWED_BODY '+json.dumps({'approved':32,'bytes':sum(x['byteLength'] for x in items),'mediaWrites':0,'literatureWrites':0}))
