"""Materialize an already semantically reviewed staged-body batch from one frozen Actions artifact.

This script never contacts publishers and never writes R2/D1. The decision file is approval;
the capture marker is only an immutable evidence identity used to bind that approval.
"""
import hashlib, io, json, os, pathlib, re, urllib.parse, urllib.request, zipfile

REPO='zhou526316-sys/organic-synthesis-gallery'
CUTOVER=1790082000000
DECISION_PATH=os.environ.get('BODY_REVIEW_DECISION','audit/media-recovery/body-review-decisions/body-batch2-20260923-1420.json')

def sha256(data): return hashlib.sha256(data).hexdigest()
def norm(v):
    s=str(v or '').strip().lower();s=re.sub(r'^https?://(?:dx\.)?doi\.org/','',s);s=re.sub(r'^doi:\s*','',s);return s

def evidence_payload(r, full):
    return ['body-capture-evidence-v1',str(r.get('doi') or ''),str(r.get('id') or ''),str(r.get('label') or ''),str(r.get('caption') or ''),str(r.get('articleUrl') or ''),str(r.get('sourceUrl') or ''),str(r.get('pageDoi') or ''),str(r.get('jobId') or ''),str(r.get('captureVersion') or ''),int(r.get('mediaGeneration') or 0),str(r.get('r2Key') or ''),str(r.get('contentHash') or ''),str(full or ''),int(r.get('byteLength') or 0),int(r.get('width') or 0),int(r.get('height') or 0),int(r.get('sortOrder') or 0)]

def evidence_fingerprint(r,full):
    raw=json.dumps(evidence_payload(r,full),ensure_ascii=False,separators=(',',':')).encode()
    return sha256(raw)

class BoundRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        out=super().redirect_request(req,fp,code,msg,headers,newurl)
        if out is not None and urllib.parse.urlsplit(req.full_url).netloc!=urllib.parse.urlsplit(newurl).netloc:
            out.remove_header('Authorization')
        return out

def download_artifact(artifact_id):
    token=os.environ['GH_TOKEN']
    req=urllib.request.Request(f'https://api.github.com/repos/{REPO}/actions/artifacts/{artifact_id}/zip',headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','User-Agent':'Gallery-reviewed-body-materializer/1'})
    with urllib.request.build_opener(BoundRedirect()).open(req,timeout=45) as res: raw=res.read(16000001)
    assert len(raw)<=16000000,'evidence artifact too large'
    return raw

decision=json.loads(pathlib.Path(DECISION_PATH).read_text())
assert re.fullmatch(r'body-batch[0-9]+-[A-Za-z0-9-]+',decision['batchId'])
assert re.fullmatch(r'reviewed-body-batch[0-9]+-[A-Za-z0-9-]+',decision['publicationId'])
assert decision['cutoverMs']==CUTOVER
approved=[x for x in decision['items'] if x.get('approved') is True]
assert 1<=len(approved)<=30 and decision['approvedCount']==len(approved)
assert decision.get('heldCount',0)>=0
assert len({(norm(x['doi']),x['id']) for x in approved})==len(approved)
for x in approved:
    assert re.fullmatch(r'[a-f0-9]{64}',x['sha256']) and re.fullmatch(r'[a-f0-9]{64}',x['evidenceFingerprint'])
    assert x.get('semanticReview') and x.get('quality')
raw=download_artifact(int(decision['sourceEvidenceArtifactId']))
assert sha256(raw)==decision['sourceEvidenceArchiveSha256'],'frozen evidence ZIP changed'
z=zipfile.ZipFile(io.BytesIO(raw));evidence=json.loads(z.read('evidence.json'))
assert evidence.get('semanticApproval') is False
assert evidence.get('captureEvidenceSchema')=='body-capture-evidence-v1'
assert evidence.get('cutoverMs')==CUTOVER
assert evidence.get('baseSha')==decision['sourceReadHead']
by_review={r['reviewId']:r for r in evidence['images']}
outdir=pathlib.Path('audit/media-recovery/body-batches')/decision['batchId'];assets=outdir/'assets';assets.mkdir(parents=True,exist_ok=True)
manifest_items=[]
for approval in approved:
    r=by_review.get(approval['reviewId']);assert r,'approved reviewId missing from frozen evidence'
    assert r.get('hashVerified') is True and not r.get('error')
    assert norm(r['doi'])==norm(approval['doi']) and r['id']==approval['id'] and r['label']==approval['label']
    assert norm(r['pageDoi'])==norm(r['doi']) and int(r['mediaGeneration'])==CUTOVER and int(r['updatedAt'])>=CUTOVER
    assert re.fullmatch(r'[A-Za-z0-9-]{16,80}',str(r['jobId'])) and r['captureVersion']=='6.2.20'
    file=r['file'];data=z.read(file);full=sha256(data)
    assert full==r['sha256']==approval['sha256'] and full.startswith(r['contentHash'])
    assert len(data)==int(r['actualBytes'])==int(r['byteLength']) and 100<=len(data)<=4000000
    fp=evidence_fingerprint(r,full);assert fp==r['evidenceFingerprint']==approval['evidenceFingerprint']
    ext=pathlib.PurePosixPath(file).suffix.lower();assert ext in ('.svg','.png','.webp')
    dest=assets/(full+ext);dest.write_bytes(data)
    manifest_items.append({
        'reviewId':approval['reviewId'],'approved':True,'role':'article_figure','doi':norm(r['doi']),'id':r['id'],'label':r['label'],'caption':r['caption'],
        'articleUrl':r['articleUrl'],'sourceUrl':r['sourceUrl'],'captureVersion':r['captureVersion'],'pageDoi':norm(r['pageDoi']),'jobId':r['jobId'],'mediaGeneration':int(r['mediaGeneration']),
        'originalUpdatedAt':int(r['updatedAt']),'originalR2Key':r['r2Key'],'contentHash':r['contentHash'],'sha256':full,'evidenceFingerprint':fp,'evidenceSchema':'body-capture-evidence-v1',
        'byteLength':len(data),'contentType':r['contentType'],'width':int(r['width']),'height':int(r['height']),'order':int(r['sortOrder']),'assetPath':dest.as_posix(),
        'quality':approval['quality'],'semanticReview':approval['semanticReview'],'reviewBasis':'exact bytes/full SHA256 + DOI/page/source/figure identity + frozen capture evidence fingerprint + individual visual semantic review; capture marker alone is not approval'
    })
manifest={
    'batchId':decision['batchId'],'publicationId':decision['publicationId'],'cutoverMs':CUTOVER,'approvedCount':len(manifest_items),'heldCount':decision.get('heldCount',0),
    'sourceEvidenceArtifactId':decision['sourceEvidenceArtifactId'],'sourceEvidenceArchiveSha256':decision['sourceEvidenceArchiveSha256'],'sourceReadRun':decision['sourceReadRun'],'sourceReadHead':decision['sourceReadHead'],'sourceReadAt':decision['sourceReadAt'],'reviewedAt':decision['reviewedAt'],
    'captureEvidenceSchema':'body-capture-evidence-v1','semanticApproval':True,'completeArticleInventoryVerified':False,'resolutionBoundary':decision['resolutionBoundary'],'approvalDecision':DECISION_PATH,
    'items':manifest_items
}
(outdir/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(outdir/'review.md').write_text(f"""# {decision['publicationId']}\n\nApproved {len(manifest_items)} body images across {len(set(x['doi'] for x in manifest_items))} current-corpus DOI. The capture evidence marker binds DOI/id/label/caption/source/job/file SHA and other intake fields; it is not semantic approval. Every approved record was separately viewed against its paper title and independent caption. No TOC/recommendation/cross-DOI contamination was observed in this batch.\n\nResolution boundary: {decision['resolutionBoundary']}\n\nFrozen evidence: Actions artifact {decision['sourceEvidenceArtifactId']}, ZIP SHA256 `{decision['sourceEvidenceArchiveSha256']}`. Source objects and timestamps remain unchanged; no R2/D1/publisher writes were performed.\n""")
print('MATERIALIZED_REVIEWED_BODY '+json.dumps({'batchId':decision['batchId'],'approved':len(manifest_items),'dois':len(set(x['doi'] for x in manifest_items)),'bytes':sum(x['byteLength'] for x in manifest_items),'mediaWrites':0,'publisherDownloads':0,'semanticApproval':True}))
