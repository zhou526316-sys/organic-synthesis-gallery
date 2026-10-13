#!/usr/bin/env python3
"""Render two exact candidate WeChat article bodies offline. No credentials or WeChat API."""
import json,importlib.util,html,collections
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'audit/wechat-working/2026-10-13-r2-offline-preview'
OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('publisher',ROOT/'ops/wechat-publisher/create-draft.py')
pub=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pub)
featured=json.loads((ROOT/'public/wechat-featured/2026-10-13.json').read_text())
retro=json.loads((ROOT/'public/wechat-retrospective/oxetane-to-azetidine-skeletal-editing-20261013.json').read_text())
edition=json.loads((ROOT/'public/wechat-editions/2026-10-13.json').read_text())
assert edition['editorialRevision']==featured['editorialRevision']==retro['editorialRevision']=='2026-10-13-r2'
slot,papers=pub.load_latest_release()
assert slot=='2026-10-13T08:00:00+08:00' and len(papers)==12,(slot,len(papers))
assert featured['paper']['doi'] in {x['doi'] for x in papers}
assert len([x for x in featured['figures'] if x.get('body')])==12
assert len([x for x in retro['figures'] if x.get('body')])==10
refs={}
for m in (featured,retro):
    for fig in m['figures']:
        local=(ROOT/fig['repo_path']).resolve()
        assert local.is_file(),fig['repo_path']
        refs[fig['id']]=local.as_uri()
# Gallery mini-card is intentionally tested separately at real cloud draft/get.
body1=pub.build_content(slot,papers,featured,uploaded_urls=refs,gallery_qr_url='')
body2=pub.build_retrospective_content(retro,uploaded_urls=refs)
for code,body,title,coverkey in [
    ('today',body1,edition['title'],'NS_cover'),
    ('retro',body2,retro['title'],'NC_cover'),
]:
    cover_src=refs[coverkey]
    article='<div class="cover" style="margin:0 auto 10px;max-width:900px;"><img src="'+cover_src+'" style="width:100%;height:auto;object-fit:contain"></div>'+body
    page=("<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'>"
          "<meta name='viewport' content='width=device-width, initial-scale=1'>"
          "<style>body{background:#eef2f6;margin:0;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',Arial,sans-serif;}"
          "main{max-width:710px;margin:0 auto;padding:16px;background:white;color:#222;}"
          "img{object-fit:contain;height:auto!important}p{overflow-wrap:break-word;}</style>"
          "<title>"+html.escape(title)+"</title></head><body><main><h1 style='font-size:20px;line-height:1.55;'>"
          +html.escape(title)+"</h1>"+article+"</main></body></html>")
    (OUT/(code+'.html')).write_text(page,encoding='utf-8')
counts=collections.Counter(str(x.get('journal','')) for x in papers)
qa={'status':'offline_source_prose_generated_for_mobile_review','revision':'2026-10-13-r2',
    'date':'2026-10-13','slot':slot,'formalNewPaperCount':len(papers),'byJournal':dict(counts),
    'doiLinks':[
     'https://gallery.gczhouwld.com/?edition=2026-10-13&doi=10.1038%2Fs44160-026-01189-z&summary=0',
     'https://gallery.gczhouwld.com/?doi=10.1038%2Fs41557-026-02213-7&summary=0'],
    'sourceFigureCount':{'today':12,'retro':10},'covers':2,
    'draftWrite':False,'publicSend':False}
(OUT/'render-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(qa,ensure_ascii=False))
