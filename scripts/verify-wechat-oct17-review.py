#!/usr/bin/env python3
"""Read-only check of the exact Oct17 reviewed pair, images and actual 08:00 catalogue."""
from pathlib import Path
import json,sys,importlib.util,hashlib
from collections import Counter
R=Path(__file__).resolve().parents[1];O=R/'ops/wechat-publisher';sys.path.insert(0,str(O))
s=importlib.util.spec_from_file_location('pub_oct17',O/'create-draft.py');pub=importlib.util.module_from_spec(s);sys.modules['pub_oct17']=pub;s.loader.exec_module(pub)
D='2026-10-17';A=R/'audit/wechat-working/2026-10-17-r1-review';G=R/'audit/wechat-working/2026-10-17-review-gate.json';g=json.loads(G.read_text())
for row in g['sources']+g['assets']:
 p=R/row['path'];assert p.is_file() and pub.git_blob_sha(p)==row['blobSha'],row['path']
required=[R/'public/wechat-editions/2026-10-17.json',R/'public/wechat-featured/2026-10-17.json',R/'public/wechat-retrospective/xu-phosphine-orthogonal-hydrogenation-20261017.json']
pub.require_editorial_review_gate(G,required)
slot,papers=pub.load_latest_release();assert slot==D+'T08:00:00+08:00' and len(papers)==20
ms=[pub.load_featured(D),pub.load_retrospective_slug('xu-phosphine-orthogonal-hydrogenation-20261017')]
assert [m['paper']['doi'] for m in ms]==g['selectionDois']
from reviewed_gallery_entry import validate
validate(pub,D,papers,ms[0])
urls=[{f['id']:'ASSET:'+f['repo_path'] for f in m['figures']} for m in ms]
cs=[pub.build_content(slot,papers,ms[0],urls[0],gallery_qr_url=urls[0]['gallery_qr']),pub.build_retrospective_content(ms[1],urls[1])]
for tag,m,c in zip(['today','retro'],ms,cs):
 assert c==(A/(tag+'-assembled-symbolic.html')).read_text(),tag+' actual renderer changed'
 assert len(pub.prepare_featured_local_images(m))==len(m['figures'])
 for sec in m['sections']:
  for text in sec['paragraphs']:assert pub.esc(text) in c
assert not pub.pending_publish_request(D),'public publish is not authorized'
print(json.dumps({'status':'actual_catalogue_and_reviewed_renderer_pass','date':D,'articleCount':2,'papers':len(papers),'journals':dict(Counter(p['journal'] for p in papers)),'assets':len(g['assets']),'scienceFigures':[20,19],'bodyImageTags':[22,19],'readOnly':True,'draftWritePerformed':False,'publicSendAuthorized':False},ensure_ascii=False))
