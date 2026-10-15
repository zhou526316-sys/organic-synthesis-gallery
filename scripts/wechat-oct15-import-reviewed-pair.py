#!/usr/bin/env python3
"""Import the owner's reviewed package. No credentials or WeChat mutations.

Only the 33 reviewed image PNGs and review artifacts are imported; never PDFs.
Final source-image approval is deliberately withheld for a visual check.
"""
from __future__ import annotations
import base64, collections, hashlib, html, importlib.util, io, json, os, pathlib, re, urllib.request, zipfile
from datetime import datetime, timezone, timedelta
from PIL import Image, ImageOps

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATE='2026-10-15'
REV=DATE+'-r1'
ASSETS=pathlib.Path('public/wechat-assets/reviewed')/REV
AUDIT=pathlib.Path('audit/wechat-working')/(REV+'-nature-science')
ZIP_SHA='464fb906fdace7fee02dc54e12bdae3df33a0bf4187421f8df9449b804bda033'
EXPECTED=['10.1038/s41586-026-11242-8','10.1126/science.aec6298']
RETRO_SLUG='kf-catalytic-appel-fluorination-20261015'


def sha(data): return hashlib.sha256(data).hexdigest()
def gitsha(path):
    b=(ROOT/path).read_bytes()
    return hashlib.sha1(('blob '+str(len(b))).encode()+bytes([0])+b).hexdigest()
def save(path,value):
    p=ROOT/path;p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def plain(s):return re.sub(r'\*\*(.*?)\*\*',r'\1',s)
def caption(s):
    s=s.replace('原文图 ', '原文 Fig. ').replace('SI 图 ', 'SI Fig. ').replace('SI 表 ', 'SI Table ')
    return ('SI Scheme｜'+s) if re.match(r'^SI S\d',s) else s


def build(article,image_map,cover):
    paragraphs=[b for b in article['intro'] if b['type']=='p']
    lead=[b['id'] for b in article['intro'] if b['type']=='figure']
    assert len(lead)==1 and len(paragraphs)==2
    sections=[];used=[lead[0]];evidence=[]
    for original in article['sections']:
        para=[];ids=[];positions={}
        for block in original['blocks']:
            if block['type']=='p':
                para.append(plain(block['text']))
                evidence.append({'section':original['title'],'paragraph':len(para),
                                 'level':block.get('level'),'source':block.get('evidence')})
            elif block['type']=='figure':
                assert para,'No unintroduced figure outside the opening'
                ids.append(block['id']);used.append(block['id'])
                positions.setdefault(str(len(para)),[]).append(block['id'])
            else:raise AssertionError('Unsupported reviewed block')
        sections.append({'eyebrow':original['eyebrow'],'heading':original['title'],
                         'paragraphs':para,'figures':ids,'figures_after_paragraph':positions})
    assert len(set(used))==len(used)
    figs=[]
    for fid in used:
        f=image_map[fid]
        figs.append({'id':fid,'repo_path':str(ASSETS/f['filename']),
                     'source_doi':article['doi'],'source_figure':f['caption'].split('｜')[0],
                     'source_kind':'original_main_or_SI_source_pixels',
                     'source_rectangles':f['source_rectangles'],'sha256':f['sha256'],
                     'body':True,'caption':caption(f['caption']),
                     'display_width_pct':f['display_width_pct']})
    figs.append({'id':cover['source_figure_id'],'repo_path':str(ASSETS/cover['filename']),
                 'body':False,'source_doi':article['doi'],'source_figure':'Original main Fig. 1B',
                 'source_kind':'original_lead_uniform_resize_white_padding_only',
                 'caption':'原文反应图，等比例缩放与补白，无新增文字或结构。'})
    m={'date':DATE,'editorialRevision':REV,'headline':article['headline'],
       'title':article['native_title'],'kicker':article['column']+'｜'+article['journal'],
       'selectionAuthority':'owner_selected_source_papers_and_explicit_draft_write_request',
       'paper':{'doi':article['doi'],'journal':article['journal'],'title':article['paper_title'],
                'authors':article['authors'],'corresponding':article['corresponding']},
       'source_note':article['note'],'lead_figure_id':lead[0],
       'lead_figure_position':'after_first_quick_point',
       'quick_points':[{'label':'先看懂这项反应','text':plain(paragraphs[0]['text'])},
                       {'label':'研究问题','text':plain(paragraphs[1]['text'])}],
       'sections':sections,'figures':figs,'cover':cover,
       'paragraph_evidence':evidence,
       'editorialIntent':'Preserve all reviewed scientific prose and original figure order; source data/model/editorial-inference distinctions remain. No new scientific claims.'}
    if article['id']=='science':
        m.update({'slug':RETRO_SLUG,'source_url':'https://gallery.gczhouwld.com/?doi=10.1126%2Fscience.aec6298&summary=0',
                  'digest':'新戊氧基膦鎓试剂与氢键相转移催化协同，以 KF 实现醇的 Appel 氟化。'})
    actual=[p['text'] for p in m['quick_points']]+[p for s in sections for p in s['paragraphs']]
    before=[plain(b['text']) for b in article['intro'] if b['type']=='p']+[plain(b['text']) for s in article['sections'] for b in s['blocks'] if b['type']=='p']
    assert actual==before,'Reviewed science text was changed during conversion'
    return m


def main():
    req=urllib.request.Request(os.environ['REVIEWED_PACKAGE_URL'],headers={'User-Agent':'Mozilla/5.0','Accept':'application/zip'})
    with urllib.request.urlopen(req,timeout=50) as r:raw=r.read(15_000_000)
    assert sha(raw)==ZIP_SHA,'Review ZIP SHA-256 mismatch'
    z=zipfile.ZipFile(io.BytesIO(raw))
    prefix='Nature_Science_正文审阅/'
    def jread(name):return json.loads(z.read(prefix+'review/'+name))
    images=jread('image_manifest.json');assert len(images)==33
    articles=[jread('nature_article.json'),jread('science_article.json')]
    assert [a['doi'] for a in articles]==EXPECTED
    prior=jread('review_status.json')
    assert prior['article_figures']=={'nature':15,'science':18}
    assert prior['generated_molecular_structures'] is False
    assert not prior['local_chromium']['horizontal_overflow']
    assert prior['local_chromium']['decoded']==[15,18]
    for f in images:
        b=z.read(prefix+'figures/'+f['filename']);assert sha(b)==f['sha256'],f['filename']
        im=Image.open(io.BytesIO(b));im.load();assert list(im.size)==f['size']
        p=ROOT/ASSETS/f['filename'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
    review_names=['nature_article.json','science_article.json','nature_text_only.md','science_text_only.md',
        'nature_evidence_map.json','science_evidence_map.json','image_manifest.json',
        'review_status.json','local_browser_qa.json','source_files.json','科学审稿与放行记录.md']
    for name in review_names:
        p=ROOT/AUDIT/'supplied-review'/name;p.parent.mkdir(parents=True,exist_ok=True)
        p.write_bytes(z.read(prefix+'review/'+name))
    # The latest explicit cover instruction: original screenshots, no added text.
    # Nature: top-aligned with remaining space below. Science: centered square.
    covers=[]
    for fid,size,align,name in [('N_lead',(940,400),'top','cover_nature.png'),('S_lead',(800,800),'center','cover_science.png')]:
        source=Image.open(ROOT/ASSETS/(fid+'.png')).convert('RGB')
        fitted=ImageOps.contain(source,(size[0]-16,size[1]-16),method=Image.Resampling.LANCZOS)
        canvas=Image.new('RGB',size,'white')
        x=(size[0]-fitted.width)//2;y=8 if align=='top' else (size[1]-fitted.height)//2
        canvas.paste(fitted,(x,y));target=ROOT/ASSETS/name;canvas.save(target,format='PNG')
        covers.append({'source_figure_id':name[:-4],'filename':name,
            'production_cover_image':'user_selected','pixel_equivalence':'exact_source_bytes',
            'delivery_image_sha256':sha(target.read_bytes()),
            'canvas':{'width':size[0],'height':size[1],'background':'#FFFFFF'},
            'crop_235_1':'0_0_1_1' if align=='top' else '0_0.287234_1_0.712766',
            'crop_1_1':'0.287234_0_0.712766_1' if align=='top' else '0_0_1_1',
            'source_placement':{'x':x,'y':y,'width':fitted.width,'height':fitted.height},
            'description':'Original Fig.1B only. Uniform resize and white padding; no new type, colored bar, or drawn chemical structures.'})
    spec=importlib.util.spec_from_file_location('wechat_publisher',ROOT/'ops/wechat-publisher/create-draft.py')
    pub=importlib.util.module_from_spec(spec);spec.loader.exec_module(pub)
    slot,papers=pub.load_latest_release()
    assert slot==DATE+'T08:00:00+08:00',('wrong daily edition',slot)
    assert EXPECTED[0] in [p['doi'] for p in papers],'Featured paper not formally released'
    counts=dict(collections.Counter(p['journal'] for p in papers))
    assert len(papers)==len(set(p['doi'] for p in papers))
    image_map={i['id']:i for i in images}
    featured,retro=[build(a,image_map,c) for a,c in zip(articles,covers)]
    assert [len(m['figures'])-1 for m in [featured,retro]]==[15,18]
    edition={'date':DATE,'editorialRevision':REV,'title':articles[0]['native_title'],
             'featured':EXPECTED[0],'retrospective':RETRO_SLUG,'publicationMode':'draft_only',
             'selectionAuthority':'owner_explicitly_requested_this_reviewed_Nature_Science_pair',
             'digest':'今日更新按正式目录统计；今日精选解读单碳转移螺环拼接，往期精选解析 KF 参与的催化 Appel 氟化。',
             'dailyReleaseSnapshot':{'slot':slot,'count':len(papers),'journals':counts,'dois':[p['doi'] for p in papers]}}
    paths=['public/wechat-featured/'+DATE+'.json','public/wechat-retrospective/'+RETRO_SLUG+'.json','public/wechat-editions/'+DATE+'.json']
    for p,m in zip(paths,[featured,retro,edition]):
        assert not (ROOT/p).exists(),'A same-date manifest already exists; stop to reconcile'
        save(pathlib.Path(p),m)
    textpaths=[]
    for a,m in zip(articles,[featured,retro]):
        lines=['# '+m['title'],'',a['paper_title'],'DOI: '+a['doi'],'作者：'+a['authors'],'']
        if a['id']=='nature':lines+=['今日新增：'+str(len(papers))+' 篇。'+'；'.join(k+' '+str(v)+' 篇' for k,v in counts.items()),'']
        for q in m['quick_points']:lines+=['## '+q['label'],q['text'],'']
        for s in m['sections']:lines+=['## '+s['heading'],'']+[p+'\n' for p in s['paragraphs']]
        p=AUDIT/(a['id']+'-text-only.md');(ROOT/p).write_text('\n'.join(lines),encoding='utf-8');textpaths.append(str(p))
    imreview={'date':DATE,'revision':REV,'covers':covers,'body_source_sha256':images,
              'layout':[{'doi':m['paper']['doi'],'lead':m['lead_figure_id'],
                         'sections':[{'heading':s['heading'],'positions':s['figures_after_paragraph']} for s in m['sections']]} for m in [featured,retro]]}
    save(AUDIT/'images-only.json',imreview)
    report={'date':DATE,'revision':REV,'sourcePackageSHA256':ZIP_SHA,
            'status':'import_verified_pending_visual_approval','reviewedTextPreserved':True,
            'bodyFigures':[15,18],'coverImages':2,'molecularRedraw':False,
            'currentDaily':{'count':len(papers),'journals':counts,'slot':slot},
            'sameDateOldDraftExists':False,'previousDateDraftMustRemainUnchanged':True,
            'cloudWritePerformed':False,'publicSendAuthorized':False}
    save(AUDIT/'production-review.json',report)
    sources=paths+textpaths+[str(AUDIT/'images-only.json'),str(AUDIT/'production-review.json')]
    assets=[]
    for m in [featured,retro]:
        for f in m['figures']:
            p=pathlib.Path(f['repo_path']);im=Image.open(ROOT/p);im.load()
            assets.append({'path':str(p),'blobSha':gitsha(p),'sha256':sha((ROOT/p).read_bytes()),'width':im.width,'height':im.height})
    gate={'date':DATE,'revision':REV,'articleCount':2,'selectionDois':EXPECTED,
          'textReview':'pass','imageReview':'pending_visual_approval',
          'materializedCropReviewRequired':True,'strictFigurePlacement':True,
          'sources':[{'path':p,'blobSha':gitsha(pathlib.Path(p))} for p in sources],
          'assets':assets,'expectedJournalTotal':len(papers),'journalCounts':counts,
          'artifacts':{'textOnly':textpaths[0],'retrospectiveTextOnly':textpaths[1],
                       'imagesOnly':str(AUDIT/'images-only.json'),'scienceReview':str(AUDIT/'production-review.json')},
          'exactReadOriginal':[pub.gallery_original_url(EXPECTED[0],DATE),pub.gallery_original_url(EXPECTED[1])],
          'draftWriteAuthorized':False,'publicSendAuthorized':False,
          'reviewNotes':'Draft write is authorized by owner, but source image/layout approval must be completed first. No old Oct14 material is altered.'}
    save(pathlib.Path('audit/wechat-working')/(DATE+'-review-gate.json'),gate)
    # Render using the actual production renderer, not a surrogate template.
    preview=ROOT/AUDIT/'production-preview';preview.mkdir(exist_ok=True)
    for key,m in [('nature',featured),('science',retro)]:
        urls={f['id']:'/'+f['repo_path'] for f in m['figures']}
        body=pub.build_content(slot,papers,m,urls) if key=='nature' else pub.build_retrospective_content(m,urls)
        doc='<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f5f5"><main style="box-sizing:border-box;max-width:720px;margin:auto;padding:22px;background:white">'+body+'</main></body></html>'
        (preview/(key+'.html')).write_text(doc,encoding='utf-8')
    print(json.dumps({'date':DATE,'sourceImages':33,'covers':2,'count':len(papers),'journals':counts,
          'textsUnchanged':True,'gate':'pending_visual_approval','coversInfo':covers,'manifestPaths':paths},ensure_ascii=False))

if __name__=='__main__':main()
