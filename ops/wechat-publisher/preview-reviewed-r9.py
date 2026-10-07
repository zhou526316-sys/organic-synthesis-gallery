#!/usr/bin/env python3
"""Render the already edited R9 manifests for review; never writes WeChat or Git."""
import hashlib, html, importlib.util, json, os
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

root=Path.cwd()
gate=json.loads((root/'audit/wechat-working/2026-10-07-review-gate.json').read_text())
request=json.loads((root/'audit/automation-triggers/wechat-r9-final-source-preview.json').read_text())
assert request['action']=='preview_reviewed_sources_only'
assert gate['editorialRevision']==request['revision']=='2026-10-07-r9'
assert gate['textReview']=='pass'
def blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
for source in gate['sources']:
    assert blob((root/source['path']).read_bytes())==source['blobSha'],source['path']
for a in gate['assets']:
    p=root/a['path'];data=p.read_bytes()
    assert blob(data)==a['blobSha'] and hashlib.sha256(data).hexdigest()==a['sha256'],a['path']
    with Image.open(p) as im:
        im.load();assert list(im.size)==[a['width'],a['height']]
spec=importlib.util.spec_from_file_location('editorial_renderer',root/'ops/wechat-publisher/create-draft.py')
publisher=importlib.util.module_from_spec(spec);spec.loader.exec_module(publisher)
slot,papers=publisher.load_latest_release()
assert slot=='2026-10-07T08:00:00+08:00'
out=root/'r9-final-source-preview';out.mkdir(exist_ok=True)
paths={'angew':'public/wechat-featured/2026-10-07.json','natcat':'public/wechat-retrospective/phoenix1-structural-regeneration.json'}
rows=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':900},device_scale_factor=1)
    for label,path in paths.items():
        paper=json.loads((root/path).read_text())
        assert paper['editorialRevision']=='2026-10-07-r9'
        urls={f['id']:(root/f['repo_path']).as_uri() for f in paper['figures']}
        content=publisher.build_content(slot,papers,paper,urls) if label=='angew' else publisher.build_retrospective_content(paper,urls)
        for s in paper['sections']:
            for paragraph in s.get('paragraphs',[]):assert html.escape(paragraph,quote=True) in content
        cover=next(f for f in paper['figures'] if f['id']==paper['cover']['source_figure_id'])
        doc='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:white;font-family:"Noto Sans CJK SC",sans-serif}main{max-width:677px;margin:auto;padding:20px 17px}img{max-width:100%;height:auto}p{overflow-wrap:anywhere}</style><main><p>INTERNAL SOURCE REVIEW — NOT A WECHAT DRAFT</p><img src="'+(root/cover['repo_path']).as_uri()+'">'+content+'</main></html>'
        target=out/(label+'.html');target.write_text(doc)
        page.goto(target.as_uri(),wait_until='load',timeout=30000)
        page.evaluate('document.fonts.ready')
        values=page.evaluate('''() => ({width:document.documentElement.scrollWidth,images:document.images.length,broken:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).length})''')
        assert values['width']<=390 and values['broken']==0
        assert values['images']==(15 if label=='angew' else 17)
        page.screenshot(path=str(out/(label+'-opening.png')))
        page.screenshot(path=str(out/(label+'-full.png')),full_page=True)
        heads=['证据追问：哪些结论已经建立，哪些仍要分开看'] if label=='angew' else ['补充背景：常规光氧化还原怎样传递电子','溶剂笼与溶剂化电子：不要把空间关系当成同一种物种']
        for i,heading in enumerate(heads):
            loc=page.get_by_role('heading',name=heading,exact=True);loc.scroll_into_view_if_needed()
            page.evaluate('(y)=>window.scrollBy(0,y-24)',loc.bounding_box()['y'])
            page.screenshot(path=str(out/(label+'-changed-'+str(i)+'.png')))
        rows.append({'article':label,**values})
    browser.close()
result={'revision':'2026-10-07-r9','runId':os.environ.get('GITHUB_RUN_ID'),'checkedAt':datetime.now(timezone.utc).isoformat(),'sources':gate['sources'],'assetsVerified':len(gate['assets']),'rows':rows,'status':'pass','scope':'source preview only; visual review still required','draftWritten':False,'publisherTriggered':False}
(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
