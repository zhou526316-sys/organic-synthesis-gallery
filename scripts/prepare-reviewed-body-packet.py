#!/usr/bin/env python3
"""Expand human-reviewed, archive-bound decisions; never discover or auto-approve images.
Only GitHub evidence ZIP is read. No publisher requests, R2 writes, or production publish.
"""
import hashlib,io,json,os,pathlib,re,subprocess,sys,urllib.parse,urllib.request,zipfile
class BoundRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        result=super().redirect_request(req,fp,code,msg,headers,newurl)
        if result is not None and urllib.parse.urlsplit(req.full_url).netloc!=urllib.parse.urlsplit(newurl).netloc:result.remove_header('Authorization')
        return result

def main():
    assert len(sys.argv)==2
    packetpath=pathlib.Path(sys.argv[1]);assert re.fullmatch(r'audit/media-recovery/body-review-packets/[a-z0-9-]+\.json',packetpath.as_posix())
    packet=json.loads(packetpath.read_text());assert packet['schemaVersion']==1 and packet['decision']=='individually_reviewed' and packet['mediaGeneration']==1790082000000
    assert re.fullmatch(r'[a-z0-9-]{8,90}',packet['packetId'])
    decisions=packet['decisions'];assert 1<=len(decisions)<=20 and len({x['doi'] for x in decisions})==len(decisions)
    wanted={}
    for article in decisions:
        assert 1<=len(article['images'])<=10
        for reviewid,imageid,note in article['images']:
            assert reviewid not in wanted and re.fullmatch(r'next-\d{3}',reviewid) and re.fullmatch(r'(figure|scheme|chart)-\d+',imageid) and len(note)>=20
            wanted[reviewid]=(article['doi'],imageid,note)
    assert len(wanted)==packet['approvedCount'] and len(wanted)<=150
    artifact=int(packet['evidenceArtifactId']);assert artifact>0 and re.fullmatch(r'[a-f0-9]{64}',packet['evidenceArchiveSha256'])
    req=urllib.request.Request(f'https://api.github.com/repos/zhou526316-sys/organic-synthesis-gallery/actions/artifacts/{artifact}/zip',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'})
    with urllib.request.build_opener(BoundRedirect()).open(req,timeout=45) as res:archive=res.read(100000001)
    assert len(archive)<=100000000 and hashlib.sha256(archive).hexdigest()==packet['evidenceArchiveSha256'],'frozen_evidence_changed'
    z=zipfile.ZipFile(io.BytesIO(archive));e=json.loads(z.read('evidence.json'));assert not e['errors']
    rows={r['reviewId']:r for r in e['images']};assert len(rows)==len(e['images']) and set(wanted)<=set(rows)
    batches=[];current=[];articlecount=0
    for article in decisions:
        if current and (articlecount==5 or len(current)+len(article['images'])>30):batches.append(current);current=[];articlecount=0
        for reviewid,imageid,note in article['images']:
            r=rows[reviewid];assert (r['doi'],r['id'])==(article['doi'],imageid) and r.get('hashVerified') and not r.get('error')
            assert re.fullmatch(r'images/next-\d{3}\.(svg|png|webp)',r['file'])
            raw=z.read(r['file']);sha=hashlib.sha256(raw).hexdigest();assert sha==r['sha256'] and sha.startswith(r['contentHash']) and len(raw)==r['byteLength']==r['actualBytes']
            asset=f'audit/media-recovery/body-batches/assets/{sha}'+pathlib.PurePosixPath(r['file']).suffix
            path=pathlib.Path(asset);path.parent.mkdir(parents=True,exist_ok=True)
            if path.exists():assert path.read_bytes()==raw
            else:path.write_bytes(raw)
            item={k:r[k] for k in ['doi','id','label','caption','articleUrl','sourceUrl','captureVersion','pageDoi','jobId','mediaGeneration','contentHash','sha256','byteLength','contentType','width','height']}
            item.update(approved=True,role='article_figure',reviewId=reviewid,originalUpdatedAt=r['updatedAt'],originalR2Key=r['r2Key'],order=r['sortOrder'],assetPath=asset,quality='vector_or_mixed_svg' if r['contentType']=='image/svg+xml' else f'captured_raster_{r["width"]}px',review={'decision':'approved','reviewedAt':packet['reviewedAt'],'note':note+' Exact frozen bytes, owning caption, source and page DOI independently verified. Source packet '+packet['packetId']+'.'})
            current.append(item)
        articlecount+=1
    if current:batches.append(current)
    assert len(batches)<=5
    paths=[]
    for i,items in enumerate(batches,1):
        name=f'audit/media-recovery/body-batches/{packet["packetId"]}-{i:02d}.json'
        assert not pathlib.Path(name).exists(),'approval manifests are immutable'
        batch={'schemaVersion':1,'batchId':packet['packetId']+f'-{i:02d}','mediaGeneration':1790082000000,'approvedCount':len(items),'evidenceArtifactId':artifact,'evidenceArchiveSha256':packet['evidenceArchiveSha256'],'reviewPacket':packetpath.as_posix(),'items':items}
        pathlib.Path(name).write_text(json.dumps(batch,ensure_ascii=False,indent=2)+'\n');paths.append(name)
    listpath=pathlib.Path(os.environ['RUNNER_TEMP'])/'body-manifests.txt';listpath.write_text('\n'.join(paths)+'\n')
    # Canonical evidence fingerprint comes from the existing shared mainline implementation.
    subprocess.run(['node','--input-type=module','-e',r'''
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {evidenceDigest,verifyApprovedBodyItem} from './cloudflare/scripts/merge-approved-body-batches.mjs';
const paths=(await readFile(process.env.RUNNER_TEMP+'/body-manifests.txt','utf8')).trim().split('\n');let n=0;
for(const p of paths){const b=JSON.parse(await readFile(p));for(const i of b.items){i.review.evidenceSha256=evidenceDigest(i);const bytes=await readFile(i.assetPath);verifyApprovedBodyItem(i,bytes);assert.throws(()=>verifyApprovedBodyItem({...i,caption:i.caption+' altered'},bytes),/evidence_changed/);n++;}await writeFile(p,JSON.stringify(b,null,2)+'\n');}
console.log('EXACT_REVIEW_PACKET_VERIFIED '+JSON.stringify({files:n,manifests:paths.length,captionMutationRejected:n,productionWrites:0}));
'''],check=True)
    print(json.dumps({'packet':packet['packetId'],'approved':len(wanted),'articles':len(decisions),'manifests':paths,'r2Writes':0,'publisherRequests':0}))
if __name__=='__main__':main()
