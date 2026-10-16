#!/usr/bin/env python3
"""Verify the exact October 16 source, native renderer, real catalogue and locked rasters."""
from pathlib import Path
import json, sys, importlib.util, hashlib
from collections import Counter
R=Path(__file__).resolve().parents[1]
O=R/'ops/wechat-publisher';sys.path.insert(0,str(O))
spec=importlib.util.spec_from_file_location('pub16',O/'create-draft.py');pub=importlib.util.module_from_spec(spec);sys.modules['pub16']=pub;spec.loader.exec_module(pub)
A=R/'audit/wechat-working/2026-10-16-r2-review'
gate=json.loads((R/'audit/wechat-working/2026-10-16-review-gate.json').read_text())
for row in gate['sources']+gate['assets']:
 p=R/row['path'];assert p.is_file() and pub.git_blob_sha(p)==row['blobSha'],row['path']
required=[R/'public/wechat-editions/2026-10-16.json',R/'public/wechat-featured/2026-10-16.json',R/'public/wechat-retrospective/levin-isoxazole-pyrrole-edit-20261016.json']
pub.require_editorial_review_gate(R/'audit/wechat-working/2026-10-16-review-gate.json',required)
if '--offline' in sys.argv:
 papers=json.loads((A/'daily-papers-local-snapshot.json').read_text());papers.sort(key=lambda p:(pub.JOURNAL_ORDER.get(p['journal'],100),p['journal'],p['title']));slot='2026-10-16T08:00:00+08:00'
else:
 slot,papers=pub.load_latest_release()
assert slot=='2026-10-16T08:00:00+08:00'
today=pub.load_featured('2026-10-16');retro=pub.load_retrospective_slug('levin-isoxazole-pyrrole-edit-20261016')
assert [today['paper']['doi'],retro['paper']['doi']]==gate['selectionDois']
from reviewed_gallery_entry import validate
validate(pub,'2026-10-16',papers,today)
urls={f['id']:'ASSET:'+f['repo_path'] for f in today['figures']}
texts=[pub.build_content(slot,papers,today,urls,gallery_qr_url=urls['gallery_qr']),pub.build_retrospective_content(retro,{f['id']:'ASSET:'+f['repo_path'] for f in retro['figures']})]
for tag,text,man in zip(['today','retro'],texts,[today,retro]):
 assert text==(A/(tag+'-assembled-symbolic.html')).read_text(),tag+' renderer changed'
 images=pub.prepare_featured_local_images(man)
 assert len(images)==len(man['figures'])
 for s in man['sections']:
  for p in s['paragraphs']:assert pub.esc(p) in text
assert not pub.pending_publish_request('2026-10-16'),'unrelated public publication request is active'
print(json.dumps({'status':'actual_main_catalogue_and_reviewed_renderer_pass' if '--offline' not in sys.argv else 'offline_reviewed_renderer_pass','date':'2026-10-16','papers':len(papers),'journals':dict(Counter(p['journal'] for p in papers)),'sources':len(gate['sources']),'assets':len(gate['assets']),'bodyFigures':[20,18],'noWeChatMutation':True},ensure_ascii=False))
