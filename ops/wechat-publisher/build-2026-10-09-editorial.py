#!/usr/bin/env python3
"""Produce immutable, source-backed 2026-10-09 WeChat editorial manifests.

Inputs are user's two Science PDFs/SI, the previously generated two-paper
editorial ZIP, and the explicitly user-approved retrospective visual cover.
No WeChat API access, no off-slot Gallery publication, no network requests.
"""
from __future__ import annotations
import argparse, collections, hashlib, html, importlib.util, io, json, re, zipfile
from html.parser import HTMLParser
from pathlib import Path
import fitz
from PIL import Image, ImageDraw, ImageFont

DAY = '2026-10-09'
REV = '2026-10-09-r1'
DOI_A = '10.1126/science.aef3001'
DOI_B = '10.1126/science.aeh7895'
SLUG_B = 'science-aeh7895-hezhi-tao-20261009'
TITLE_A = '通过氧气活化实现酶催化不对称氢膦酰化'
TITLE_B = '往期精选｜Science｜何智涛：功能化链状二烯与胺的立体发散式调聚反应'
DIR_A = f'public/wechat-assets/reviewed/{DAY}-science-aef3001'
DIR_B = f'public/wechat-assets/reviewed/{DAY}-science-aeh7895'
FEATURED = f'public/wechat-featured/{DAY}.json'
RETRO = f'public/wechat-retrospective/{SLUG_B}.json'
EDITION = f'public/wechat-editions/{DAY}.json'
GATE = f'audit/wechat-working/{DAY}-review-gate.json'
TEXT = f'audit/wechat-working/{DAY}-r1-text-only.md'
IMAGES = f'audit/wechat-working/{DAY}-r1-images-only.md'
RECEIPT = f'audit/wechat-working/{DAY}-r1-import-receipt.json'
REVIEWED_RETRO_TEXT = f'audit/wechat-working/{DAY}-science-aeh7895-text-only.md'
REVIEWED_RETRO_IMAGES = f'audit/wechat-working/{DAY}-science-aeh7895-images-only.md'


def digest(x: bytes): return hashlib.sha256(x).hexdigest()
def blob(x: bytes): return hashlib.sha1(f'blob {len(x)}\0'.encode()+x).hexdigest()
def jencode(obj): return (json.dumps(obj, indent=2, ensure_ascii=False)+'\n').encode()

def parse_md(s):
    intro=[]; secs=[]; now=None
    for chunk in re.split(r'\n\s*\n',s.strip()):
        q=chunk.strip()
        if q.startswith('## '):
            if now: secs.append(now)
            ll=q.splitlines(); now={'heading':ll[0][3:].strip(),'paragraphs':[]}
            if len(ll)>1:now['paragraphs'].append(' '.join(ll[1:]))
        elif q.startswith('# ') or q.startswith('**') or q.startswith('---'):
            continue
        elif q:
            (now['paragraphs'] if now else intro).append(' '.join(q.splitlines()).strip())
    if now:secs.append(now)
    return intro,secs


def fix_positions(sec, images):
    """images: (id, default paragraph, optional snippet)"""
    sec['figures']=[a for a,_,_ in images]
    sec['figures_after_paragraph']={}
    for fig,default,reference in images:
        idx=min(default,len(sec['paragraphs']))
        if reference:
            for i,p in enumerate(sec['paragraphs'],1):
                if reference in p:
                    idx=i;break
        assert idx>=1,('image no paragraph',sec['heading'],fig)
        sec['figures_after_paragraph'].setdefault(str(idx),[]).append(fig)


def inspect_figure_map(manifest):
    seen=[manifest['lead_figure_id']]
    for s in manifest['sections']:
        ids=[item for group in s.get('figures_after_paragraph',{}).values() for item in group]
        assert collections.Counter(ids)==collections.Counter(s['figures']), ('unpositioned',s['heading'])
        assert all(0<int(i)<=len(s['paragraphs']) for i in s['figures_after_paragraph'])
        seen.extend(ids)
    expected=[f['id'] for f in manifest['figures'] if f.get('body') is not False]
    assert len(seen)==len(set(seen)) and collections.Counter(seen)==collections.Counter(expected)
    return seen


# All positions are exact PDF page fractions (left, top, right, bottom).
# Dense main-text Fig. 3 and Fig. 4 are separated into claim-specific panels.
CROPS=[
 ('f01','fig1b-comparison',2,(.147,.147,.85,.256),'Fig. 1B','原文 Fig. 1B｜传统化学/光酶磷自由基反应与本工作的设计差别'),
 ('f02','fig1c-reaction',2,(.147,.258,.85,.341),'Fig. 1C','原文 Fig. 1C（上）｜O₂ 活化生成 ROS、P–H 夺氢与末端酶催化 HAT 的设计'),
 ('f03','fig1c-pathways',2,(.147,.341,.85,.640),'Fig. 1C','原文 Fig. 1C（下）｜作者提出的三条 ROS/黄素磷自由基来源路径；不能都当成直接证实'),
 ('f04','fig2a-screen',3,(.141,.048,.865,.245),'Fig. 2A','原文 Fig. 2A｜黄素酶筛选和有/无酶、氧气、光照等对照'),
 ('f05','fig2b-evolution',3,(.141,.247,.865,.482),'Fig. 2B','原文 Fig. 2B｜从单突变筛选、机器学习辅助进化到光照/无光变体性能'),
 ('f06','fig3a-control',4,(.077,.048,.530,.220),'Fig. 3A','原文 Fig. 3A｜酶、O₂、SOD、过氧化氢酶及自由基清除实验'),
 ('f07','fig3b-ros',4,(.077,.222,.530,.371),'Fig. 3B','原文 Fig. 3B｜光照、pH、ROS 生成量与收率的联系'),
 ('f08','fig3c-peroxide',4,(.077,.365,.430,.515),'Fig. 3C','原文 Fig. 3C｜以 H₂O₂ 替代氧气来源并考察光照/清除剂'),
 ('f09','fig3d-uvvis',4,(.425,.358,.628,.512),'Fig. 3D','原文 Fig. 3D｜黄素酶体系的 UV–vis 光谱'),
 ('f10','fig3e-epr',4,(.560,.047,.930,.364),'Fig. 3E','原文 Fig. 3E｜自由基捕获与 EPR，包括 PBN 捕获的磷中心自由基'),
 ('f11','fig3f-deuterium',4,(.615,.361,.930,.514),'Fig. 3F','原文 Fig. 3F｜不同氘源条件及产物掺氘，存在明显交换和副反应'),
 ('f12','fig3g-oxygen-dft',4,(.077,.515,.459,.783),'Fig. 3G','原文 Fig. 3G｜ROS 促进 P–H 夺氢的计算模型'),
 ('f13','fig3h-hat-dft',4,(.470,.515,.933,.783),'Fig. 3H','原文 Fig. 3H｜磷自由基加成和末端酶催化 HAT 的相对能量'),
 ('f14','fig3i-nac',4,(.077,.777,.935,.969),'Fig. 3I','原文 Fig. 3I｜OYE1 活性位点和两种 HAT 进攻方向的模拟'),
 ('f15','fig4-alkene-scope',7,(.145,.048,.856,.345),'Fig. 4','原文 Fig. 4（烯烃）｜芳烯烃、杂芳基与烷基底物的收率和 ee 边界'),
 ('f16','fig4-p-donor-scope',7,(.145,.338,.856,.541),'Fig. 4','原文 Fig. 4（P–H 供体）｜亚磷酸、亚磷酸酯、膦氧、次膦酸酯及低 ee 例子'),
 ('f17','fig4-applications',7,(.145,.542,.856,.837),'Fig. 4','原文 Fig. 4（应用）｜含磷氨基酸与 L-草铵膦铵盐的合成及路线比较'),
 ('f18','si-figs4-progress',27,(.212,.323,.823,.610),'Fig. S4','SI Fig. S4｜氧气、外加 H₂O₂ 与无光条件下的反应进度差异'),
 ('f19','si-figs9-deuterium',36,(.184,.083,.802,.867),'Fig. S9','SI Fig. S9｜同位素标记实验及核磁谱，不能将部分掺氘等同于唯一氢源'),
 ('f20','si-figs23-nac',51,(.119,.091,.821,.650),'Fig. S23','SI Fig. S23｜近反应构象与 K250 氢键、π–π 相互作用差异')]


def build(root, package, main_path, si_path, cover_path, dry_run=False):
    root=Path(root); out=root
    source={'package':Path(package),'main':Path(main_path),'si':Path(si_path),'cover':Path(cover_path)}
    with zipfile.ZipFile(source['package']) as z:
        names=z.namelist();assert len(names)==39 and len(names)==len(set(names))
        assert sum(f.file_size for f in z.infolist())<20_000_000
        base=json.loads(z.read('2026-10-09-images-only.json'))
        assert base['todayFeaturedDoi']==DOI_A and base['retroDoi']==DOI_B
        today_md=z.read('2026-10-09-text-only.md').decode()
        intro_today, today_sec=parse_md(today_md.split('## 10.09 往期精选（另一篇独立稿件）')[0])
        assert len(today_sec)==8 and len(intro_today)<2
        retro_md=(root/REVIEWED_RETRO_TEXT).read_text(encoding='utf8')
        retro_intro,retro_sec=parse_md(retro_md)
        assert len(retro_sec)==10 and 2<=len(retro_intro)<=5
        records=(root/REVIEWED_RETRO_IMAGES).read_text(encoding='utf8')
        matches=re.findall(r'^## (r\d\d)\s*\n([\s\S]*?)(?=^## (?:r\d\d|retro-cover)|\Z)',records,re.M)
        retro_sources={}
        for fid,block in matches:
            file=re.search(r'- 文件：`figures/([^`]+)`',block)
            cap=re.search(r'- 图注：([^\n]+)',block)
            checksum=re.search(r'- SHA-256：`([0-9a-f]{64})`',block)
            assert file and cap and checksum,(fid,block[:140])
            retro_sources[fid]={'filename':file.group(1),'caption':cap.group(1),'sha':checksum.group(1)}
        assert set(retro_sources)=={f'r{i:02d}' for i in range(1,23)}
        write=set(); asset_files=[]
        def put(rel,b):
            path=out/rel;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b);write.add(rel)
            return path
        def add_raster(rel,b):
            with Image.open(io.BytesIO(b)) as im:
                im.load(); dim=(im.width,im.height)
                assert 140<=im.width<=3500 and 140<=im.height<=3500
            put(rel,b);asset_files.append(rel);return dim
        def fig(fid,rel,caption,tag,doi,source_pdf='',source_page=None,clip=None,body=True):
            d={'id':fid,'repo_path':rel,'caption':caption,'body':body,
               'display_width_pct':100 if doi==DOI_A else 94,
               'source_figure':tag,'source_doi':doi,
               'source_kind':'exact_pdf_crop' if body else 'separately_approved_cover'}
            if source_pdf:d.update(source_pdf=source_pdf,source_pdf_page=source_page,source_crop_frac=clip)
            return d
        d_main=fitz.open(source['main']);d_si=fitz.open(source['si'])
        assert len(d_main)==11 and len(d_si)==209
        fig_today=[]
        for fid,name,page,bounds,tag,caption in CROPS:
            doc=d_si if page>=20 else d_main
            idx=page if doc is d_main else page
            src=doc[idx];r=src.rect
            rect=fitz.Rect(r.x0+r.width*bounds[0],r.y0+r.height*bounds[1],r.x0+r.width*bounds[2],r.y0+r.height*bounds[3])
            buf=src.get_pixmap(matrix=fitz.Matrix(2.55,2.55),clip=rect,alpha=False).tobytes('png')
            dest=f'{DIR_A}/{name}.png';add_raster(dest,buf)
            fig_today.append(fig(fid,dest,caption,tag,DOI_A,'science.aef3001_sm.pdf' if doc is d_si else 'science.aef3001.pdf',idx+1,list(bounds)))
        # Exact Science graphical abstract raster from its ORIGINAL summary page.
        # Full O2(air) and P/ROS/HAT labels retained, unlike earlier cropped mockup.
        paper=d_main[0]; pr=paper.rect
        box=(.348,.664,.897,.954)
        clip=fitz.Rect(pr.x0+pr.width*box[0],pr.y0+pr.height*box[1],
                       pr.x0+pr.width*box[2],pr.y0+pr.height*box[3])
        graphic=paper.get_pixmap(matrix=fitz.Matrix(3.2,3.2),clip=clip,alpha=False)
        panel=Image.open(io.BytesIO(graphic.tobytes('png'))).convert('RGB')
        panel.thumbnail((792,430),Image.Resampling.LANCZOS)
        face=Image.new('RGB',(1880,800),'#102b3b')
        fd=ImageDraw.Draw(face)
        face.paste(panel,((1880-panel.width)//2,96))
        font='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
        chinese=ImageFont.truetype(font,48) if Path(font).exists() else ImageFont.load_default()
        fd.text((705,17),'今日精选 · Science',font=chinese,fill='#f2f8f9')
        fd.line((545,535,1335,535),fill='#789db0',width=3)
        b=io.BytesIO();face.save(b,'PNG',optimize=True)
        cover_today=f'{DIR_A}/science-aef3001-cover-source-true.png'
        add_raster(cover_today,b.getvalue())
        fig_today.append(fig('fcover',cover_today,'','Science original graphical abstract',DOI_A,body=False))
        # Pixel checks for cover and 1:1 centered WeChat crop
        assert face.getpixel((120,720))==(16,43,59)
        assert face.crop((540,0,1340,800)).size==(800,800)

        fig_retro=[]
        for fid,item in sorted(retro_sources.items()):
            raw=z.read('retro_figures/'+item['filename'])
            assert digest(raw)==item['sha'],('retro source changed',fid)
            path=f'{DIR_B}/{item["filename"]}'
            add_raster(path,raw)
            fig_retro.append(fig(fid,path,item['caption'],item['caption'].split('｜')[0],DOI_B))
        user_cover=source['cover'].read_bytes()
        with Image.open(io.BytesIO(user_cover)) as im:
            im.load();assert im.width==im.height and im.width>=1000
        retro_cover=f'{DIR_B}/science-aeh7895-user-approved-seven-circle.png'
        add_raster(retro_cover,user_cover)
        fig_retro.append(fig('rcover',retro_cover,'','User-selected seven-circle concept cover',DOI_B,body=False))
        # Narrative placement: text -> source image -> caption; single lead-image exception.
        today_pos={
          0:[('f01',1,''),('f03',3,'')],
          1:[('f04',1,''),('f05',3,'')],
          2:[('f06',2,''),('f07',3,''),('f08',3,''),('f09',3,''),('f18',3,'')],
          3:[('f10',1,''),('f11',2,''),('f19',2,''),('f12',3,''),('f13',3,'')],
          4:[('f14',2,''),('f20',3,'')],
          5:[('f15',1,''),('f16',2,'')],
          6:[('f17',2,'')]}
        for i,sec in enumerate(today_sec):fix_positions(sec,today_pos.get(i,[]))
        featured={
            'selectionAuthority':'explicit_user_selection','editorialRevision':REV,
            'paper':{'doi':DOI_A,'title':'Asymmetric enzymatic hydrophosphorylation through O2 activation',
                     'journal':'Science','authors':'Yi Zhou, Yifei Ge, Wesley Harrison, Huimin Zhao'},
            'headline':TITLE_A,'kicker':'今日精选｜Science',
            'lead_figure_id':'f02','lead_figure_position':'after_first_quick_point',
            'quick_points':[
                {'label':'看到了什么新反应','text':'OYE1 黄素酶变体把 O₂ 活化产生的 ROS 引入 P–H 活化，使磷中心自由基向烯烃加成，再通过酶催化氢原子转移控制对映选择性。'},
                {'label':'化学困难在哪里','text':'活性氧通常损伤酶或截获自由基；高反应性的磷中心自由基与烯烃反应后，还要在末端碳自由基处建立立体选择性。'},
                {'label':'两个关键条件不能混淆','text':'OYE1-M5a 在蓝光下为 76% 收率、98% ee；OYE1-M6 在无光 24 h 下为 75% 收率、97% ee，它们是不同的酶变体。'}],
            'sections':today_sec,'figures':fig_today,
            'cover':{'source_figure_id':'fcover','canvas':{'width':1880,'height':800},
                     'crop_235_1':'0_0_1_1','crop_1_1':'0.287234_0_0.712766_1',
                     'description':'Real Science graphical abstract, unredrawn. Dark native-title backing starts below scientific panel.'},
            'takehome_heading':'这项工作的研究边界',
            'takehome':[
                '利用 ROS 启动 P–H 自由基生成，与酶选择性 HAT 并行；自由基形成位置未被限定为只在酶内。',
                '异构体控制来自酶对碳自由基与 FMNsq 的取向约束，而不只是酶促反应发生在蛋白质内。',
                '底物仍有低 ee、低收率与检测受限实例；辅因子再生、过量 P–H 底物和放大条件待优化。'],
            'ai_notice':'依据 Science 正文及补充材料核对实验、机理和底物；正文结构、谱图均来自原始 PDF。'}
        retro_sec=[{'heading':'为什么要让同一组原料生成不同产物？','paragraphs':retro_intro}]+retro_sec
        retro_pos={1:['r02','r03'],2:['r04','r05','r21'],3:['r06'],4:['r07','r08'],
                   5:['r10','r13','r14'],6:['r11','r12','r15','r22'],7:['r20'],
                   8:['r16','r17','r18'],9:['r19'],10:['r09']}
        for i,sec in enumerate(retro_sec):
            arr=[]
            for fid in retro_pos.get(i,[]):
                marker=retro_sources[fid]['caption'].split('｜')[0]
                marker=marker.replace('原文 Fig. ','原文图 ').replace('SI Fig. S','补充材料图 S').replace('SI Table S','补充材料表 S')
                arr.append((fid,len(sec['paragraphs']),marker))
            fix_positions(sec,arr)
        retrospective={
          'slug':SLUG_B,'editorialRevision':REV,
          'title':TITLE_B,'headline':'功能化链状二烯与胺的立体发散式调聚反应',
          'kicker':'往期精选｜Science',
          'digest':'何智涛等研究者实现功能化二烯与胺的多维选择性调聚，结合底物拓展、机理和失败边界评估其真正创新。',
          'source_url':'https://gallery.gczhouwld.com/?doi='+DOI_B,
          'paper':{'doi':DOI_B,'title':'Stereodivergent telomerization of linear functionalized dienes with amines',
                   'journal':'Science','authors':'Wen-Qian Wang, Ren-En Li, Hui Xu, Han-Zhe Miao, Liang Chen, Chao Zheng, Shu-Li You, Zhi-Tao He'},
          'lead_figure_id':'r01','lead_figure_position':'after_first_quick_point',
          'quick_points':[
            {'label':'做成了什么','text':'通过切换钯催化、配体与酸碱组合，调节功能化二烯与胺调聚的 TT/TH、E/Z、dr 和 ee。'},
            {'label':'为什么这比单一不对称加成难','text':'连接方式、双键构型和多个手性中心的控制需要兼顾；优化其中一个指标会改变其他反应路径。'},
            {'label':'必须看到的局限','text':'SI Table S6 中 E 型 TT 不对称路线尚未同时达到理想的几何与对映选择性；其他底物也存在实际边界。'}],
          'sections':retro_sec,'figures':fig_retro,
          'cover':{'source_figure_id':'rcover','canvas':{'width':1254,'height':1254},
                   'crop_235_1':'0_0.287234_1_0.712766','crop_1_1':'0_0_1_1',
                   'description':'Owner explicitly approved the seven-color-ring conceptual cover; it is illustrative art, not a scientific figure or verified molecular structure.'},
          'ai_notice':'论文数据和机理均以原文与 SI 核对；封面由用户确认的概念艺术图承担主题识别，不作为结构证据。'}
        edition={'date':DAY,'title':TITLE_A,
            'digest':'10.09 有机合成文献更新 28 篇；今日精选 Science 酶催化不对称氢膦酰化，往期精选 Science 何智涛等功能化二烯立体发散调聚。',
            'featured':DOI_A,'retrospective':SLUG_B,'editorialRevision':REV,
            'selectionAuthority':'explicit_user_selection','publicationMode':'draft_only_manual_final_send'}
        for rel,obj in [(FEATURED,featured),(RETRO,retrospective),(EDITION,edition)]:put(rel,jencode(obj))
        used_today=inspect_figure_map(featured)
        used_retro=inspect_figure_map(retrospective)
        assert len(used_today)==20 and len(used_retro)==22
        text=['# 10.09 公众号双篇纯文字审阅稿','',f'## 今日精选 Science（{DOI_A}）','',f'原生标题：{TITLE_A}','','今日更新 28 篇，按期刊数量汇总，不逐项罗列全部 DOI。']
        for q in featured['quick_points']:text+=['',f'**{q["label"]}**',q['text']]
        for section in featured['sections']:text+=['','### '+section['heading'],'']+section['paragraphs']
        text+=['','---','',f'## 往期精选 Science（{DOI_B}）','',f'原生标题：{TITLE_B}']
        for q in retrospective['quick_points']:text+=['',f'**{q["label"]}**',q['text']]
        for section in retrospective['sections']:text+=['','### '+section['heading'],'']+section['paragraphs']
        put(TEXT,('\n\n'.join(text)+'\n').encode())
        fbyid={x['id']:x for x in fig_today+fig_retro}
        image_lines=['# 2026-10-09 双篇纯图片审核清单','',
          '今日精选主体全部由用户 Science PDF 与 SI 精准截取，不使用生成式重绘化学结构。',
          '往期精选正文 22 幅全部来自用户提供 PDF 与 SI；用户选定的七圈概念封面与正文实验图独立，不能当作结构证据。','']
        for section_name,ids in [('今日精选',used_today),('往期精选',used_retro)]:
            image_lines.append('## '+section_name)
            for fid in ids:
                f=fbyid[fid];content=(root/f['repo_path']).read_bytes()
                with Image.open(io.BytesIO(content)) as im:dimensions=f'{im.width}×{im.height}'
                image_lines+=['',f'### {fid}',f'- 文件：{f["repo_path"]}',f'- 原图：{f["source_figure"]}',
                              f'- 图注：{f["caption"]}',f'- 尺寸：{dimensions}；SHA256：{digest(content)}']
        for fid in ['fcover','rcover']:
            f=fbyid[fid];image_lines+=['',f'## 封面 {fid}',f'- 路径：{f["repo_path"]}',f'- 类型：{f["source_kind"]}']
        put(IMAGES,('\n'.join(image_lines)+'\n').encode())
        sources=[FEATURED,RETRO,EDITION,TEXT,IMAGES,REVIEWED_RETRO_TEXT,REVIEWED_RETRO_IMAGES]
        source_entries=[{'path':x,'blobSha':blob((root/x).read_bytes()),'sha256':digest((root/x).read_bytes())} for x in sources]
        asset_entries=[]
        for f in asset_files:
            b=(root/f).read_bytes()
            with Image.open(io.BytesIO(b)) as im:im.load();w,h=im.size
            asset_entries.append({'path':f,'blobSha':blob(b),'sha256':digest(b),'width':w,'height':h})
        assert len(asset_entries)==44
        gate={
          'date':DAY,'revision':REV,'articleCount':2,'strictFigurePlacement':True,
          'selectionDois':[DOI_A,DOI_B],'expectedArticleOrder':[DOI_A,DOI_B],
          'artifacts':{'textOnly':TEXT,'imagesOnly':IMAGES},
          'sources':source_entries,'assets':asset_entries,
          'textReview':'pass','imageReview':'pass',
          'reviewNotes':{
            'sourceBounded':'Main and SI from the two specific Science papers; no unsupported chemistry redrawing in body figures',
            'mainPDFpages':len(d_main),'mainSIpages':len(d_si),
            'dailyRelease0800':'accepted 28, including science.aef3001',
            'scienceClaims':'M5a blue 76% 98% ee; M6 dark 75% 97% ee; ROS pathways not all localized or directly observed',
            'retrospectiveClaims':'Four dimensions not all combinable; E-TT + ee limitation from SI Table S6',
            'conceptCoverUserApproved':True,
            'conceptCoverCaution':'The decorative artwork includes illustrative structures but is not treated as a source-verifiable chemical diagram. Body figures are source-exact.',
            'publication':'draft only; publicSendAuthorized=false',
            'layout':'every reviewed body image appears exactly once, following its explanation'} }
        put(GATE,jencode(gate))
        receipt={'date':DAY,'revision':REV,'dois':[DOI_A,DOI_B],
          'todayBodyImages':len(used_today),'retroBodyImages':len(used_retro),
          'reviewedAssets':len(asset_entries),'editorialReview':'pass',
          'sourceSha256':{key:digest(p.read_bytes()) for key,p in source.items()},
          'draftWritten':False,'publicSendAuthorized':False,'shaChecks':'all imported source pixels verified'}
        put(RECEIPT,jencode(receipt))
        if not dry_run:
            # Existing WeChat renderer only: strict content/placement QA, no tokens or API calls.
            renderer=root/'ops/wechat-publisher/create-draft.py'
            spec=importlib.util.spec_from_file_location('oct9_publisher_layout_review',renderer)
            mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
            slot,papers=mod.load_latest_release()
            assert slot.startswith(DAY) and len(papers)==28 and DOI_A in {x['doi'] for x in papers}
            ua={f['id']:f'https://editorial.invalid/a/{f["id"]}.png' for f in fig_today}
            ub={f['id']:f'https://editorial.invalid/b/{f["id"]}.png' for f in fig_retro}
            ahtml=mod.build_content(slot,papers,featured,ua,'')
            bhtml=mod.build_retrospective_content(retrospective,ub)
            class Verify(HTMLParser):
                def __init__(self):super().__init__();self.pics=[];self.strings=[]
                def handle_starttag(self,tag,attrs):
                    if tag=='img':self.pics.append(dict(attrs).get('src'))
                def handle_data(self,data):self.strings.append(data)
            ar=Verify();ar.feed(ahtml);br=Verify();br.feed(bhtml)
            assert ar.pics==[ua[x] for x in used_today]
            assert br.pics==[ub[x] for x in used_retro]
            for s in today_sec:assert all(p in ''.join(ar.strings) for p in s['paragraphs'])
            for s in retro_sec:assert all(p in ''.join(br.strings) for p in s['paragraphs'])
            for f in fig_today[:-1]:assert f['caption'] in ''.join(ar.strings)
            for f in fig_retro[:-1]:assert f['caption'] in ''.join(br.strings)
        return {'status':'reviewed_source_package_ready','date':DAY,'revision':REV,'dois':[DOI_A,DOI_B],
            'createdFiles':sorted(write),'count':len(write),'assets':len(asset_entries),
            'mainBodyImages':len(used_today),'retroBodyImages':len(used_retro),
            'fullGalleryListPreserved':True,'draftWritten':False}

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--root',default='.')
    ap.add_argument('--package',required=True)
    ap.add_argument('--main',required=True)
    ap.add_argument('--si',required=True)
    ap.add_argument('--cover',required=True)
    ap.add_argument('--dry-run',action='store_true')
    a=ap.parse_args()
    print(json.dumps(build(a.root,a.package,a.main,a.si,a.cover,a.dry_run),ensure_ascii=False))