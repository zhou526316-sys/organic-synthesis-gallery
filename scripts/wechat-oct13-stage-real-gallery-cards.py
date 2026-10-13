#!/usr/bin/env python3
"""Stage ONLY real Gallery media images for the four mini-cards actually shown in Oct13 WeChat.
Never redraw structures; all output from site's R2 official/primary media verified on every DOI.
No WeChat API use, no gallery write, no changes to selected scientific figures."""
import json,hashlib,urllib.request,urllib.parse,io,sys,importlib.util
from pathlib import Path
from PIL import Image,ImageOps,UnidentifiedImageError
ROOT=Path(__file__).resolve().parents[1]
featured=json.loads((ROOT/'public/wechat-featured/2026-10-13.json').read_text())
state=json.loads((ROOT/'audit/literature-update-state.json').read_text())['lastPublication']
assert state['publicationSlot']=='2026-10-13T08:00:00+08:00'
pkg=importlib.util.spec_from_file_location('wp',ROOT/'ops/wechat-publisher/create-draft.py')
wp=importlib.util.module_from_spec(pkg);pkg.loader.exec_module(wp)
slot,papers=wp.load_latest_release()
assert len(papers)==12
featured_doi=featured['paper']['doi'].lower()
ordered=sorted(papers,key=lambda p:(
  0 if wp.normalize_doi(p.get('doi'))==featured_doi else 1,
  wp.JOURNAL_ORDER.get(str(p.get('journal')),100),
  str(p.get('titleZh') or p.get('title') or '')
))
shown=[wp.normalize_doi(p['doi']) for p in ordered[:4]]
assert shown[0]==featured_doi and len(set(shown))==4
api='https://api.gczhouwld.com/api/media/batch'
req=urllib.request.Request(api,method='POST',data=json.dumps({'dois':shown}).encode(),
 headers={'Content-Type':'application/json','Accept':'application/json','User-Agent':'Mozilla/5.0 OSG-Oct13-card-image-QA'})
with urllib.request.urlopen(req,timeout=50) as r:
    assert r.status==200
    d=json.load(r)
items={x['doi'].lower():x for x in d.get('items',[])}
assert set(shown)<=items.keys()
out=Path('/tmp/wechat-oct13-gallery-card-candidates')
out.mkdir(parents=True,exist_ok=True)
audit={'date':'2026-10-13','publicationSlot':slot,'revision':'2026-10-13-r2-card-visual-repair',
       'origin':'read-only real Gallery media/batch per DOI','sourceDois':shown,'items':[],
       'draftUpdated':False,'massSent':False,'graphicsGenerated':False}
for doi in shown:
    item=items[doi]
    toc=item.get('toc') or {}
    assert toc.get('available') is True and isinstance(toc.get('imageUrl'),str) and toc['imageUrl'].startswith('https://')
    url=toc['imageUrl']
    host=urllib.parse.urlparse(url).hostname
    assert host in ('api.gczhouwld.com','gallery.gczhouwld.com'),(doi,host)
    def fetch(url):
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (Organic Synthesis Gallery WeChat original media verifier)','Accept':'image/png,image/jpeg,image/webp,image/*;q=0.8'})
        with urllib.request.urlopen(req,timeout=45) as rr:
            return rr.status,rr.headers.get('content-type',''),rr.read(7000000)
    try:
        http,ctype,raw=fetch(url)
    except Exception as e:
        print('MEDIA_SOURCE_FETCH_FAILED',doi,str(e)[:240],flush=True)
        raise
    assert http==200 and 1000<len(raw)<7000000 and 'text/html' not in ctype
    try:
        with Image.open(io.BytesIO(raw)) as im:
            im.load()
            assert im.width>=150 and im.height>=100
            im=ImageOps.exif_transpose(im)
            if im.mode in ('RGBA','LA') or (im.mode=='P' and 'transparency' in im.info):
                canvas=Image.new('RGB',im.size,'white')
                canvas.paste(im.convert('RGBA'),mask=im.convert('RGBA').getchannel('A'))
                im=canvas
            else: im=im.convert('RGB')
            original=[im.width,im.height]
            im.thumbnail((1100,1100),Image.Resampling.LANCZOS)
            safe=hashlib.sha256(doi.encode()).hexdigest()[:12]
            basename='gallery-card-'+safe+'.jpg'
            fp=out/basename
            im.save(fp,format='JPEG',quality=94,optimize=True,subsampling=0)
            dimensions=[im.width,im.height]
    except (UnidentifiedImageError,OSError) as e:
        raise RuntimeError('Real source image decoding failed '+doi+': '+str(e))
    rec={'doi':doi,'kind':toc.get('reason'),'sourceUrl':url,
         'originalSha256':hashlib.sha256(raw).hexdigest(),'originalSize':len(raw),
         'originalDimensions':original,'reviewedFile':basename,
         'reviewedSha256':hashlib.sha256(fp.read_bytes()).hexdigest(),
         'reviewedDimensions':dimensions,'reviewedBytes':fp.stat().st_size,
         'sourceValid':True,'redrawn':False,'crop':False}
    audit['items'].append(rec)
    print('STAGED_REAL_GALLERY_VISUAL',doi,rec['kind'],rec['originalDimensions'],rec['reviewedDimensions'],rec['reviewedBytes'],flush=True)
assert len(audit['items'])==4
(out/'gallery-card-source-audit.json').write_text(json.dumps(audit,indent=2,ensure_ascii=False)+'\n')
print('PASS_REAL_ORIGINALS_4_OF_4_NO_DRAFT_WRITE',flush=True)
