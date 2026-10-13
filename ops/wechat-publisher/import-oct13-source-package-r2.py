#!/usr/bin/env python3
"""Import the user's SHA-pinned Nature main/SI figure crops into an isolated R2 review branch.
This script never contacts WeChat and never marks the final review gate as approved.
It will not persist publisher PDF bytes or embed generated chemistry."""
import os,json,hashlib,zipfile,shutil,re
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
OUT=Path('/tmp/wechat-oct13-r2-reviewed-tree')
SOURCE=Path('/tmp/wechat-oct13-r2-source.zip')
REV='2026-10-13-r2'
DOCS=OUT/'audit/wechat-working'
MEDIA=OUT/'public/wechat-assets/reviewed'/REV
assert SOURCE.is_file()
trigger=json.loads((ROOT/'audit/automation-triggers/wechat-oct13-import-request.json').read_text())
assert trigger['action']=='stage_source_authentic_media_for_science_and_visual_review'
assert trigger['date']=='2026-10-13' and trigger['revision']==REV
assert trigger['wechatWriteAuthorized'] is False and trigger['publicSendAuthorized'] is False
expectedZip=trigger['sourcePackageSHA256']
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==expectedZip
OUT.mkdir(parents=True,exist_ok=True)
MEDIA.mkdir(parents=True,exist_ok=True)
DOCS.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(SOURCE) as z:
    names=set(z.namelist())
    required={'NS_manifest.json','NC_manifest.json','edition.json','source_asset_qa.json'}
    assert required<=names
    assert len([x for x in names if x.startswith('figures/') and x.endswith('.png')])==24
    assert all(not x.startswith('/') and '..' not in Path(x).parts for x in names)
    sourceqa=json.loads(z.read('source_asset_qa.json'))
    specs=sourceqa['files']
    assert len(specs)==24 and len({x['name'] for x in specs})==24
    for item in specs:
        key='figures/'+item['name'];assert key in names
        payload=z.read(key)
        assert hashlib.sha256(payload).hexdigest()==item['sha256']
        target=MEDIA/item['name'];target.write_bytes(payload)
        with Image.open(target) as im:
            im.load();assert list(im.size)==item['dimensions']
            assert im.width>500 and im.height>120
        assert len(payload)>15000
    NS=json.loads(z.read('NS_manifest.json'))
    NC=json.loads(z.read('NC_manifest.json'))
    ed=json.loads(z.read('edition.json'))
    assert [NS['paper']['doi'],NC['paper']['doi']]==trigger['dois']
    assert ed['featured']==trigger['dois'][0] and ed['retrospective']==NC['slug']
    assert ed['editorialRevision']==NS['editorialRevision']==NC['editorialRevision']==REV
    for m,bodyN in [(NS,12),(NC,10)]:
        ids=[x['id'] for x in m['figures'] if x.get('body')]
        assert len(ids)==bodyN and len(set(ids))==bodyN
        for f in m['figures']:
            path=str(f['repo_path']);assert path.startswith('public/wechat-assets/reviewed/'+REV+'/')
            assert (OUT/path).is_file() and path.endswith('.png')
            assert f['display_width_pct']>=80 and f['display_width_pct']<=100
        seen=[]
        for sec in m['sections']:
            assert len(sec['paragraphs'])>=1
            for k,assigned in sec['figures_after_paragraph'].items():
                assert 1<=int(k)<=len(sec['paragraphs'])
                seen.extend(assigned)
        assert len(seen)==len(set(seen))==bodyN and set(ids)==set(seen)
    assert sourceqa['source_original_paper_dois']==trigger['dois']
    for path,data in {
      OUT/'public/wechat-featured/2026-10-13.json':NS,
      OUT/'public/wechat-retrospective'/ (NC['slug']+'.json'):NC,
      OUT/'public/wechat-editions/2026-10-13.json':ed,
      DOCS/(REV+'-source-image-qa.json'):sourceqa
    }.items():
       path.parent.mkdir(parents=True,exist_ok=True)
       path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    for key,m in [('NS',NS),('NC',NC)]:
       n='nature-synthesis' if key=='NS' else 'nature-chemistry'
       reviewtitle=f'# 10月13日'+('今日精选' if key=='NS' else '往期精选')+'｜'+m['headline']
       p=[reviewtitle,f'期刊：{m["paper"]["journal"]}；DOI：{m["paper"]["doi"]}','']
       images=[reviewtitle,'','每张图均直接取自上传原文与SI，结构、数据未生成式重画；逐图使用原始比例且可点击查看原图。','']
       idmap={f['id']:f for f in m['figures']}
       for s in m['sections']:
          p.extend(['## '+s['heading'],''])
          images.extend(['## '+s['heading'],''])
          for idx,paragraph in enumerate(s['paragraphs'],1):
             p.extend([paragraph,''])
             for fid in s['figures_after_paragraph'].get(str(idx),[]):
                f=idmap[fid]
                p.extend(['[第 '+str(idx)+' 段后原文证据图：'+f['caption']+']',''])
                images.extend([f'- 第{idx}段后：{fid}｜{f["repo_path"]}｜宽度{f["display_width_pct"]}%｜原文页{f["source_pdf_page"]}｜{f["caption"]}'])
          images.append('')
       (DOCS/(REV+'-'+n+'-text-only.md')).write_text('\n'.join(p).strip()+'\n',encoding='utf-8')
       (DOCS/(REV+'-'+n+'-images-only.md')).write_text('\n'.join(images).strip()+'\n',encoding='utf-8')
    # Record staging provenance, leave imageReview pending until independent pixel audit.
    science={
      'date':'2026-10-13','revision':REV,
      'status':'science_text_source_checked_pending_independent_final_pixel_review',
      'paperSources':trigger['dois'],'NS_mainFigures':8,'NS_SI_figures':4,
      'NC_mainFiguresAndTables':6,'NC_SI_figures':4,
      'NS_chars':sum(len(p) for s in NS['sections'] for p in s['paragraphs']),
      'NC_chars':sum(len(p) for s in NC['sections'] for p in s['paragraphs']),
      'evidenceHierarchy':'Main/SI data, established controls, authors mechanism, calculations and unresolved hypothesis carefully separated in prose.',
      'scientificSpecifics':{
        'NS':'In-catalyzed thiourea cascade, stereoinversion and labelled oxygen found in urea, calculated opening 27.0 vs 46.7 kcal/mol, failure of 2,2-disubstituted oxetanes.',
        'NC':'Isolated aminoalcohol, borane versus Yb oxophilicity for amines, BEHT triflate enables Mitsunobu-type closure, multiple negative controls and photoredox comparison.'
      },
      'safety':{'draftWrite':False,'publicSend':False}
    }
    (DOCS/(REV+'-science-review.json')).write_text(json.dumps(science,ensure_ascii=False,indent=2)+'\n')
    gate={
      'date':'2026-10-13','revision':REV,'articleCount':2,
      'selectionDois':trigger['dois'],'textReview':'pass','imageReview':'pending',
      'sources':[],'assets':[],
      'artifacts':{
       'textOnly':str((DOCS/(REV+'-nature-synthesis-text-only.md')).relative_to(OUT)),
       'imagesOnly':str((DOCS/(REV+'-nature-synthesis-images-only.md')).relative_to(OUT)),
       'retrospectiveTextOnly':str((DOCS/(REV+'-nature-chemistry-text-only.md')).relative_to(OUT)),
       'retrospectiveImagesOnly':str((DOCS/(REV+'-nature-chemistry-images-only.md')).relative_to(OUT)),
       'scienceQA':str((DOCS/(REV+'-science-review.json')).relative_to(OUT))
      },
      'publicSendAuthorized':False,
      'status':'blocked_until_separate_mobile_and_image_review',
      'notes':'Direct source-only chemistry. This gate intentionally blocks any WeChat draft write until mobile and original-pixel review.'
    }
    (DOCS/'2026-10-13-review-gate.json').write_text(json.dumps(gate,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'stage':'source_import_review_staging_only','sourceFileCount':24,'mainFig':14,'SI':8,
      'articles':[NS['headline'],NC['headline']],'characters':[science['NS_chars'],science['NC_chars']],
      'draftWrite':False,'publicSend':False},ensure_ascii=False))
