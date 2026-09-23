"""Materialize frozen reviewed evidence onto a feature branch. No media service writes."""
import hashlib,io,json,os,pathlib,re,urllib.parse,urllib.request,zipfile
ROOT=pathlib.Path('.');DEST=ROOT/'audit/media-recovery/batch2';(DEST/'assets').mkdir(parents=True,exist_ok=True);(DEST/'proofs').mkdir(exist_ok=True)
APPROVED_WILEY={'10.1002/anie.'+x for x in ['3092581','4084841','5852828','6992524','8911828','1537547','5796773','8651160','2218878','5041475','8789956','5070160','3574678','8290035','3685338','9519061','7101768']}
class SafeRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  out=super().redirect_request(req,fp,code,msg,headers,newurl)
  if out and urllib.parse.urlsplit(req.full_url).netloc!=urllib.parse.urlsplit(newurl).netloc:out.remove_header('Authorization')
  return out
opener=urllib.request.build_opener(SafeRedirect())
def artifact(id,digest):
 req=urllib.request.Request('https://api.github.com/repos/zhou526316-sys/organic-synthesis-gallery/actions/artifacts/'+str(id)+'/zip',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'})
 with opener.open(req,timeout=40) as r:raw=r.read(18000001)
 assert len(raw)<=18000000 and hashlib.sha256(raw).hexdigest()==digest,'Frozen artifact hash changed'
 return zipfile.ZipFile(io.BytesIO(raw))
z=artifact(10730400413,'edb744283dec586e5a738e399fdee19ebf9e6913887bb7bf36a9422f0f8621b1');e=json.loads(z.read('evidence.json'));items=[]
def save(raw,ext):
 h=hashlib.sha256(raw).hexdigest();p=DEST/'assets'/(h+'.'+ext);p.write_bytes(raw);return h,p.as_posix()
for r in e['assets']:
 if r['doi'] not in APPROVED_WILEY:continue
 raw=z.read(r['file']);h,p=save(raw,r['file'].rsplit('.',1)[1]);assert h==r['sha256'] and h.startswith(r['contentHash'])
 # Retain the immutable report that binds exact page, source URL and successful stored object.
 proof=r['matchingReports'][0];pr=(json.dumps(proof,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode();ph=hashlib.sha256(pr).hexdigest();pp=DEST/'proofs'/(ph+'.json');pp.write_bytes(pr)
 items.append({'doi':r['doi'],'kind':'official','roleEvidence':'wiley_graphical_abstract_receipt','articleUrl':r['articleUrl'],'sourceUrl':r['sourceUrl'],'originalR2Key':r['r2Key'],'originalUpdatedAt':r['updatedAt'],'contentHash':r['contentHash'],'sha256':h,'byteLength':len(raw),'assetPath':p,'contentType':'image/jpeg','caption':'Graphical abstract','approved':True,'proofPath':pp.as_posix(),'proofSha256':ph})
assert len(items)==17
old=artifact(10699805219,'2fccf89bc0b92f6f0fbe933630fd80cd78024f820be5710314454dba8fa41b09')
for r in json.loads(old.read('verification.json'))['images']:
 if r['reviewId'] not in ['image-063','image-064','image-092']:continue
 raw=old.read(r['file']);h,p=save(raw,r['actualType']);assert h==r['computedSha256'] and h.startswith(r['contentHash'])
 kind='official' if r['reviewId']=='image-092' else 'figure1'
 caption='Graphical abstract' if kind=='official' else ('Figure 1. Overview of 3-oxa/aza-bicyclo[3.1.1]heptanes.' if r['reviewId']=='image-063' else 'Figure 1. Glycopeptides and manganese-catalysed peptide glycosylation.')
 items.append({'doi':r['doi'],'kind':kind,'roleEvidence':'dual_doi_reviewed_'+kind,'reviewId':r['reviewId'],'articleUrl':r['articleUrl'],'sourceUrl':r['sourceUrl'],'originalR2Key':r['r2Key'],'originalUpdatedAt':r['updatedAt'],'contentHash':r['contentHash'],'sha256':h,'byteLength':len(raw),'assetPath':p,'contentType':'image/svg+xml' if r['actualType']=='svg' else 'image/png','caption':caption,'approved':True})
assert len(items)==20
plan={'version':1,'recoveryId':'sealed-media-batch2-20260923','cutoverMs':1790082000000,'approvedCount':20,'reviewedOfficialToc':18,'reviewedFigure1':2,'evidenceArtifacts':[10730400413,10699805219],'deferred':['10.1002/anie.5617321: sealed gra-0002 image visually resembles optimization/ligand table, not accepted as TOC','19 ACS issue-page URL aliases lack independently verified page identity in this batch','Three prior ACS Catalysis Scheme/Figure role conflicts remain quarantined'],'items':items}
(DEST/'manifest.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
p=ROOT/'cloudflare/scripts/merge-reviewed-toc.mjs';s=p.read_text()
if 'export async function readPapers(root)' not in s:
 assert s.count('async function readPapers(root)')==1;s=s.replace('async function readPapers(root)','export async function readPapers(root)',1);p.write_text(s)
p=ROOT/'cloudflare/scripts/merge-curated-pages.mjs';s=p.read_text()
if 'await mergeSealedMediaBatch2();' not in s:
 assert s.count('await mergeReviewedToc();')==1;s+='\n// Exact asset allowlist only; original quarantine and first recovery stay unchanged.\nconst {mergeSealedMediaBatch2}=await import(\'./merge-sealed-media-batch2.mjs\');\nawait mergeSealedMediaBatch2();\n';p.write_text(s)
print('SEALED_MATERIALIZED '+json.dumps({'assets':20,'official':18,'figure1':2,'productionMediaWrites':0}))
