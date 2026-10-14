#!/usr/bin/env python3
"""Proportional resizing/padding of the two explicitly selected original PNGs.
Creates separate full-content 2.35:1 and 1:1 crops in an atlas. No drawing/text.
"""
from pathlib import Path
import hashlib, io, json, os, urllib.request, zipfile
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'public/wechat-assets/reviewed/2026-10-14-owner-selected'
DEST.mkdir(parents=True,exist_ok=True)
SOURCE_SHA={
 'today_original.png':'84bc27066f1ff233fa6f3e8ad1923862e11ee8ceeb5f6b25f207205f5aa9c3a9',
 'retro_original.png':'e8b8af1362a0e5acee8848420768a6750b3fb38508c09ef24e4f06fefced4a8b'}
req=urllib.request.Request(os.environ['SOURCE_ARCHIVE'],headers={'User-Agent':'Mozilla/5.0','Accept':'application/zip'})
with urllib.request.urlopen(req,timeout=45) as response: raw=response.read(4_000_000)
assert hashlib.sha256(raw).hexdigest()=='0afb039b2d582f1779ab3db7f24bbc1003229b526ca84ad9e9359a52d3e199ec','Unexpected original source archive'
z=zipfile.ZipFile(io.BytesIO(raw))
for name,expected in SOURCE_SHA.items():
    data=z.read(name)
    assert hashlib.sha256(data).hexdigest()==expected,'Not the exact user supplied source'
    image=Image.open(io.BytesIO(data)); image.load()
    assert image.size==((920,337) if name.startswith('today') else (433,236))
    (DEST/name).write_bytes(data)

def original(name):
    im=Image.open(DEST/name).convert('RGBA')
    white=Image.new('RGBA',im.size,'white'); white.alpha_composite(im)
    return white.convert('RGB')

def fit(im,size,width_limit,align):
    w,h=size
    factor=min(width_limit/im.width,h/im.height)
    scaled=im.resize((round(im.width*factor),round(im.height*factor)),Image.Resampling.LANCZOS)
    x=(w-scaled.width)//2
    y=0 if align=='top' else (h-scaled.height)//2
    canvas=Image.new('RGB',(w,h),'white');canvas.paste(scaled,(x,y))
    # All source content survives; outside rectangle is pure white padding.
    assert canvas.crop((x,y,x+scaled.width,y+scaled.height)).tobytes()==scaled.tobytes()
    return canvas,{'canvas_size':list(size),'resize_size':list(scaled.size),'paste_box':[x,y,x+scaled.width,y+scaled.height],'alignment':align}

rows=[]
for kind in ('today','retro'):
    im=original(kind+'_original.png')
    align='top' if kind=='today' else 'center'
    wide,wmeta=fit(im,(1880,800),1840,align)
    square,smeta=fit(im,(800,800),780,align)
    wide.save(DEST/(kind+'_wide.png'),format='PNG',compress_level=6)
    square.save(DEST/(kind+'_square.png'),format='PNG',compress_level=6)
    primary,meta=(wide,wmeta) if kind=='today' else (square,smeta)
    primary.save(DEST/(kind+'_cover.png'),format='PNG',compress_level=6)
    atlas=Image.new('RGB',(2680,800),'white')
    atlas.paste(wide,(0,0));atlas.paste(square,(1880,0))
    atlas_name=kind+'_wechat_atlas.png'
    atlas.save(DEST/atlas_name,format='PNG',compress_level=6)
    assert atlas.crop((0,0,1880,800)).tobytes()==wide.tobytes()
    assert atlas.crop((1880,0,2680,800)).tobytes()==square.tobytes()
    rows.append({'article':kind,'source':kind+'_original.png','source_sha256':SOURCE_SHA[kind+'_original.png'],
      'cover':kind+'_cover.png','cover_sha256':hashlib.sha256((DEST/(kind+'_cover.png')).read_bytes()).hexdigest(),
      **meta,'wide':wmeta,'square':smeta,'atlas':atlas_name,
      'atlas_sha256':hashlib.sha256((DEST/atlas_name).read_bytes()).hexdigest(),
      'crop_235_1':'0_0_0.701492537313_1','crop_1_1':'0.701492537313_0_1_1'})
assert rows[0]['paste_box'][1]==0
assert abs(rows[1]['paste_box'][1]-(800-rows[1]['paste_box'][3]))<=1
new_title='往期精选｜JACS｜Benjamin List：手性 IDPi 催化香叶基衍生物的不对称阳离子环化'
info={'date':'2026-10-14','scope':'only_original_image_proportional_resize_and_white_padding','textAdded':False,'structuresRedrawn':False,'userLatestAlignment':{'today':'top, added vertical white space below','retro':'horizontally and vertically centered'},'newRetrospectiveTitle':new_title,'covers':rows}
(DEST/'cover_sources.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
fields=[
 ('10.1021/jacs.6c17662','有机合成文献日报｜10.14｜今日精选｜JACS：铁氢催化烯烃迁移氢胺化','https://gallery.gczhouwld.com/?edition=2026-10-14&doi=10.1021%2Fjacs.6c17662&summary=0'),
 ('10.1021/jacs.6c08353','有机合成文献日报｜10.14｜往期精选｜JACS：手性 IDPi 催化香叶基衍生物的不对称阳离子环化','https://gallery.gczhouwld.com/?doi=10.1021%2Fjacs.6c08353&summary=0')]
plan={'scopeApproval':'pass_covers_and_native_title_only','bodyApprovalGranted':False,'date':'2026-10-14','expectedExistingMediaId':'KhELYUzvwADwB_l1xH1SWK0GEUwdJcrzZUnUqTu1MZdQpaEILGEgEcWC4qU-DSzy','sources':list(SOURCE_SHA.values()),'articles':[],
      'note':'Latest owner instruction: today original top aligned, retrospective original CENTERED. No text, band, structure redraw, body change, new draft or publication. Native retrospective title only drops daily prefix and adds Benjamin List.'}
for row,(doi,title,url) in zip(rows,fields):
    plan['articles'].append({'doi':doi,'expectedTitle':title,'newTitle':new_title if row['article']=='retro' else title,
      'sourceUrl':url,'assetPath':str((DEST/row['atlas']).relative_to(ROOT)), 'assetSha256':row['atlas_sha256'],
      'crop235':row['crop_235_1'],'crop11':row['crop_1_1'],'primarySize':row['canvas_size'],'primaryAlignment':row['alignment']})
output=ROOT/'audit/wechat-working/2026-10-14-user-images-cover-title-plan.json'
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
source=ROOT/'ops/wechat-publisher/create-draft.py';text=source.read_text()
anchor='    args = parser.parse_args()\n\n    retrospective = pending_retrospective_request()'
replacement='''    args = parser.parse_args()

    # Owner-authorized metadata-only edits preserve all body fields and their editorial hold.
    metadata_request_path = ROOT / "audit/automation-triggers/wechat-publisher-request.json"
    if metadata_request_path.exists():
        metadata_request = json.loads(metadata_request_path.read_text(encoding="utf-8"))
        if isinstance(metadata_request, dict) and metadata_request.get("action") == "update_covers_title_only":
            from cover_title_patch import run as run_cover_title_patch
            return run_cover_title_patch(sys.modules[__name__], args, metadata_request)

    retrospective = pending_retrospective_request()'''
assert text.count(anchor)==1,'Entrypoint changed; do not guess how to patch'
source.write_text(text.replace(anchor,replacement),encoding='utf8')
print(json.dumps({'sourcePixelsVerified':2,'alignments':[r['alignment'] for r in rows],'primaryPasteBoxes':[r['paste_box'] for r in rows],'newTitle':new_title,'planSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bodyGateModified':False},ensure_ascii=False))
