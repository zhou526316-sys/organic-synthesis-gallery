#!/usr/bin/env python3
"""Apply the explicitly requested Oct-7 two-article revision. Never calls WeChat."""
import hashlib, html, importlib.util, io, json, os, re, shutil, subprocess, tempfile, urllib.request, zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image

ROOT = Path.cwd()
REQ = 'audit/automation-triggers/wechat-revision-r9.json'
AN = 'public/wechat-featured/2026-10-07.json'
NC = 'public/wechat-retrospective/phoenix1-structural-regeneration.json'
ED = 'public/wechat-editions/2026-10-07.json'
GATE = 'audit/wechat-working/2026-10-07-review-gate.json'
PUB = 'ops/wechat-publisher/create-draft.py'
PREFIX = 'audit/wechat-working/2026-10-07-r9'

def blob(b):
    return hashlib.sha1(f'blob {len(b)}\0'.encode() + b).hexdigest()

def dump(obj):
    return (json.dumps(obj, ensure_ascii=False, indent=2) + '\n').encode()

def run(*args):
    subprocess.run(args, check=True, timeout=45)

req = json.loads((ROOT / REQ).read_text())
if req.get('action') != 'apply_editorial_revision_only' or req.get('revision') != '2026-10-07-r9':
    raise RuntimeError('Explicit import-only r9 request required')
url = req['packageUrl']
if not url.startswith('https://at.adobe.com/'):
    raise RuntimeError('Unapproved package host')
with urllib.request.urlopen(url, timeout=30) as response:
    raw = response.read(8_000_001)
if len(raw) > 8_000_000 or hashlib.sha256(raw).hexdigest() != req['packageSha256']:
    raise RuntimeError('Package fingerprint mismatch')
archive = zipfile.ZipFile(io.BytesIO(raw))
if len(archive.namelist()) != 5 or sum(x.file_size for x in archive.infolist()) > 12_000_000:
    raise RuntimeError('Unexpected package contents')
patch = json.loads(archive.read('patch.json'))
if set(patch['expected']) != {AN, NC, ED, GATE, PUB}:
    raise RuntimeError('Unexpected baseline scope')
for rel, expected in patch['expected'].items():
    if blob((ROOT / rel).read_bytes()) != expected:
        raise RuntimeError('Baseline changed: ' + rel)
old_gate = json.loads((ROOT / GATE).read_text())
if old_gate.get('textReview') != 'pass' or old_gate.get('imageReview') != 'pass':
    raise RuntimeError('Baseline review is not approved')
for row in old_gate['assets']:
    if blob((ROOT / row['path']).read_bytes()) != row['blobSha']:
        raise RuntimeError('Previously reviewed asset changed: ' + row['path'])

changed = {}
for asset in patch['newAssets']:
    rel = asset['path']
    if rel != 'public/wechat-assets/reviewed/2026-10-07-r9/' + asset['file'] or not re.fullmatch(r'[a-z0-9-]+\.png', asset['file']):
        raise RuntimeError('Unexpected asset destination')
    data = archive.read('assets/' + asset['file'])
    if hashlib.sha256(data).hexdigest() != asset['sha256']:
        raise RuntimeError('Image fingerprint mismatch')
    with Image.open(io.BytesIO(data)) as im:
        im.load()
        if im.size != (asset['width'], asset['height']):
            raise RuntimeError('Image dimensions changed')
    changed[rel] = data
an = json.loads((ROOT / AN).read_text())
nc = json.loads((ROOT / NC).read_text())
if an['paper']['doi'] != '10.1002/anie.3699223' or nc['paper']['doi'] != '10.1038/s41929-026-01593-w':
    raise RuntimeError('Selection changed')
heads = [s['heading'] for s in an['sections']]
if heads.count(patch['angew']['insertBefore']) != 1:
    raise RuntimeError('Angew insertion target changed')
an['sections'].insert(heads.index(patch['angew']['insertBefore']), patch['angew']['section'])
replacements = patch['natcat']['replaceSections']
insertions = {x['heading']: x['sections'] for x in patch['natcat']['insertAfter']}
original_heads = [s['heading'] for s in nc['sections']]
for key in set(replacements) | set(insertions):
    if original_heads.count(key) != 1:
        raise RuntimeError('Nature Catalysis target changed: ' + key)
new_sections = []
for s in nc['sections']:
    heading = s['heading']
    new_sections.append(replacements.get(heading, s))
    new_sections.extend(insertions.get(heading, []))
nc['sections'] = new_sections + [patch['natcat']['appendSection']]
nc['figures'].extend(patch['natcat']['newFigures'])
for paper, config, cover_id, size in [(an, patch['angew'], 'an-cover', (1880,800)), (nc, patch['natcat'], 'nc-cover', (1334,1334))]:
    matches = [f for f in paper['figures'] if f['id'] == cover_id]
    if len(matches) != 1:
        raise RuntimeError('Cover figure missing')
    matches[0]['repo_path'] = config['coverPath']
    paper['cover']['canvas'] = {'width':size[0], 'height':size[1], 'background':'#102438'}
    paper['cover']['preserve_existing_thumb'] = False
    paper['cover'].pop('crop_frac', None)
    paper['editorialRevision'] = '2026-10-07-r9'
    if cover_id == 'an-cover':
        paper['cover']['description'] = 'Original Fig.2a enlarged across the entire upper cover; lower title-overlay band reserved.'
    else:
        paper['cover']['crop_1_1'] = '0_0_1_1'
        paper['cover']['description'] = 'Entire approved transparent-background phoenix artwork; contained without cropping any artwork, not a screenshot or inset.'
    order = [paper['lead_figure_id']]
    for s in paper['sections']:
        positions = s.get('figures_after_paragraph', {})
        placed = []
        for i in range(1, len(s.get('paragraphs',[]))+1):
            v = positions.get(str(i), [])
            placed.extend([v] if isinstance(v,str) else v)
        if set(placed) != set(s.get('figures',[])):
            raise RuntimeError('Incomplete placement: ' + s['heading'])
        order.extend(placed)
    body = [f['id'] for f in paper['figures'] if f.get('body') is not False]
    if Counter(order) != Counter(body) or len(order) != len(set(order)):
        raise RuntimeError('Duplicate or missing body image')
changed[AN], changed[NC] = dump(an), dump(nc)
changed[PREFIX + '-patch.json'] = dump(patch)

# Persist independent complete text and image review artifacts, not only the delta.
for label, paper in [('angew', an), ('natcat', nc)]:
    text = ['# ' + paper['headline'], paper['kicker'], str(paper['paper'])]
    for q in paper.get('quick_points',[]):
        text += [q['label'],q['text']]
    for s in paper['sections']:
        text += ['## ' + s['heading']] + s.get('paragraphs',[])
    text += [paper.get('ai_notice',''), '本文由“化之岛”原创策划与整理，AI 辅助生成与校核；文献事实、化学结构和数据以论文原文为准。']
    changed[PREFIX+'-'+label+'-text-only.md'] = ('\n\n'.join(text)+'\n').encode()
    images = ['# Image-only review / ' + label, json.dumps(paper['cover'],ensure_ascii=False)]
    for f in paper['figures']:
        images += ['## '+f['id'], f['repo_path'], f.get('caption','')]
    images += [json.dumps({'lead':paper['lead_figure_id'],'positions':[{'heading':s['heading'],'positions':s.get('figures_after_paragraph',{})} for s in paper['sections']]},ensure_ascii=False)]
    changed[PREFIX+'-'+label+'-images-only.md'] = ('\n\n'.join(images)+'\n').encode()

stage = Path(tempfile.mkdtemp(prefix='wechat-r9-stage-'))
for rel, data in changed.items():
    target = ROOT/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data)
assets=[]
for rel in sorted({f['repo_path'] for p in (an,nc) for f in p['figures']}):
    data=(ROOT/rel).read_bytes()
    with Image.open(io.BytesIO(data)) as im:
        im.load(); width,height=im.size
    assets.append({'path':rel,'blobSha':blob(data),'sha256':hashlib.sha256(data).hexdigest(),'width':width,'height':height})
gate = {'publicationDate':'2026-10-07','editorialRevision':'2026-10-07-r9','reviewedAt':datetime.now(timezone.utc).isoformat(),
        'reviewer':'AI source-grounded editorial review; no claim of human review',
        'textReview':'pass','imageReview':'pending','individualImageReview':'pass','combinedVisualReview':'pending',
        'artifacts':{'textOnly':PREFIX+'-angew-text-only.md','imagesOnly':PREFIX+'-angew-images-only.md',
                     'additionalTextOnly':[PREFIX+'-natcat-text-only.md'],'additionalImagesOnly':[PREFIX+'-natcat-images-only.md']},
        'sources':[{'path':p,'blobSha':blob((ROOT/p).read_bytes())} for p in (ED,AN,NC)],'assets':assets,
        'materializedCropReviewRequired':True,'strictFigurePlacement':True,'reviewNotes':patch['reviewNotes'],
        'draftReadback':'not_run','publicSendAuthorized':False}
changed[GATE] = dump(gate)
(ROOT/GATE).write_bytes(changed[GATE])

# Exact existing renderers, without credentials, uploads, or publisher calls.
spec=importlib.util.spec_from_file_location('editorial_publisher',ROOT/PUB)
publisher=importlib.util.module_from_spec(spec);spec.loader.exec_module(publisher)
slot,papers=publisher.load_latest_release()
if slot != '2026-10-07T08:00:00+08:00':
    raise RuntimeError('Edition slot changed')
qa=ROOT/'r9-review';qa.mkdir(exist_ok=True)
urls=lambda p:{f['id']:(ROOT/f['repo_path']).as_uri() for f in p['figures']}
content_an=publisher.build_content(slot,papers,an,urls(an))
content_nc=publisher.build_retrospective_content(nc,urls(nc))
for label,p,content in [('angew',an,content_an),('natcat',nc,content_nc)]:
    for s in p['sections']:
        for paragraph in s.get('paragraphs',[]):
            if html.escape(paragraph,quote=True) not in content:
                raise RuntimeError('Renderer omitted paragraph')
    cover=next(f for f in p['figures'] if f['id']==p['cover']['source_figure_id'])
    page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:white;font-family:"Noto Sans CJK SC",sans-serif}main{max-width:677px;margin:auto;padding:20px 17px}img{max-width:100%;height:auto}p{overflow-wrap:anywhere}</style><main><p>INTERNAL EDITORIAL ASSEMBLY — NOT A WECHAT DRAFT</p><img src="'+(ROOT/cover['repo_path']).as_uri()+'">'+content+'</main></html>'
    (qa/(label+'.html')).write_text(page)

from playwright.sync_api import sync_playwright
qa_rows=[]
with sync_playwright() as pw:
    chrome='/usr/bin/google-chrome'
    browser=pw.chromium.launch(executable_path=chrome,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':900},device_scale_factor=1)
    for label,expected_count in [('angew',15),('natcat',17)]:
        page.goto((qa/(label+'.html')).as_uri(),wait_until='load',timeout=30000)
        page.evaluate('document.fonts.ready')
        values=page.evaluate('''() => ({width:document.documentElement.scrollWidth, images:document.images.length,broken:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).length})''')
        if values['width']>390 or values['broken'] or values['images']!=expected_count:
            raise RuntimeError('Assembly layout failed: '+str(values))
        qa_rows.append({'article':label,**values})
        page.screenshot(path=str(qa/(label+'-opening.png')))
        page.screenshot(path=str(qa/(label+'-full.png')),full_page=True)
        targets=['证据追问：哪些结论已经建立，哪些仍要分开看'] if label=='angew' else ['补充背景：常规光氧化还原怎样传递电子','溶剂笼与溶剂化电子：不要把空间关系当成同一种物种','换成反应所用的光源，电子相关线索还在吗','审稿人究竟追问了什么，作者又补了什么']
        for i,heading in enumerate(targets):
            loc=page.get_by_role('heading',name=heading,exact=True)
            loc.scroll_into_view_if_needed()
            y=loc.bounding_box()['y'];page.evaluate('(y)=>window.scrollBy(0,y-24)',y)
            page.screenshot(path=str(qa/(label+'-changed-'+str(i)+'.png')))
    browser.close()
receipt={'revision':'2026-10-07-r9','runId':os.environ.get('GITHUB_RUN_ID'),'stage':'source_revision_and_internal_QA','completedAt':datetime.now(timezone.utc).isoformat(),'sources':gate['sources'],'assetsVerified':len(assets),'bodyImages':30,'assemblyChecks':qa_rows,'textReview':'pass','individualImageReview':'pass','combinedVisualReview':'pending','draftWritten':False,'publisherTriggered':False}
receipt_rel=PREFIX+'-assembly-receipt.json';changed[receipt_rel]=dump(receipt)
(ROOT/receipt_rel).write_bytes(changed[receipt_rel]);(qa/'assembly-receipt.json').write_bytes(changed[receipt_rel]);(qa/'review-gate.json').write_bytes(changed[GATE])
for rel,data in changed.items():
    target=stage/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
run('git','config','user.name','github-actions[bot]');run('git','config','user.email','41898282+github-actions[bot]@users.noreply.github.com')
for attempt in range(3):
    run('git','fetch','origin','main');run('git','reset','--hard','origin/main')
    if json.loads((ROOT/REQ).read_text()).get('requestId')!=req['requestId']:
        raise RuntimeError('Superseded revision request')
    for rel,expected in patch['expected'].items():
        if blob((ROOT/rel).read_bytes())!=expected:
            raise RuntimeError('Concurrent baseline edit: '+rel)
    for rel,data in changed.items():
        target=ROOT/rel
        if rel not in patch['expected'] and target.exists() and target.read_bytes()!=data:
            raise RuntimeError('Conflicting new artifact: '+rel)
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    run('git','add','--',*changed)
    run('git','commit','-m','editorial: apply requested r9 cover, electron-evidence and review revisions; hold draft for visual QA')
    result=subprocess.run(['git','push','origin','HEAD:main'],timeout=45)
    if result.returncode==0:break
else:raise RuntimeError('Concurrent push did not succeed')
print(json.dumps(receipt,ensure_ascii=False))
