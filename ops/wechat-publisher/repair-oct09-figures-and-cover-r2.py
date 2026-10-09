#!/usr/bin/env python3
"""Source-only 2026-10-09 R2 editorial correction; no WeChat/network writes.

Fixes all 22 retrospective paragraph/figure placements, moves Fig.4B to
its original evidence paragraph, and restores the full daily native title.
The new enlarged cover is built ONLY from the previously source-verified
Science graphical abstract pixels, with zero molecular redrawing.
"""
from __future__ import annotations
import hashlib, importlib.util, io, json, re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

ROOT=Path(__file__).resolve().parents[2]
DATE="2026-10-09"
OLD="2026-10-09-r1"
NEW="2026-10-09-r2"
DA="10.1126/science.aef3001"
RE="10.1126/science.aeh7895"
FEATURED="public/wechat-featured/2026-10-09.json"
RETRO="public/wechat-retrospective/science-aeh7895-hezhi-tao-20261009.json"
EDITION="public/wechat-editions/2026-10-09.json"
GATE="audit/wechat-working/2026-10-09-review-gate.json"
OLD_TEXT="audit/wechat-working/2026-10-09-r1-text-only.md"
OLD_IMAGES="audit/wechat-working/2026-10-09-r1-images-only.md"
NEW_TEXT="audit/wechat-working/2026-10-09-r2-text-only.md"
NEW_IMAGES="audit/wechat-working/2026-10-09-r2-images-only.md"
QA="audit/wechat-working/2026-10-09-r2-correction-qa.json"
OLD_COVER="public/wechat-assets/reviewed/2026-10-09-science-aef3001/science-aef3001-cover-source-true.png"
NEW_COVER="public/wechat-assets/reviewed/2026-10-09-r2/science-aef3001-cover-source-authentic-full-title.png"
FULL_TITLE="有机合成文献日报｜10.09｜今日精选｜Science：通过氧气活化实现酶催化不对称氢膦酰化"
ORIGINAL_TITLE="通过氧气活化实现酶催化不对称氢膦酰化"
SOURCE_SHA256="845e423aad090e75da8228124043d22e38dcfe7d18bd4f3687761839408c87fb"
REVIEWED_NEW_COVER_SHA256="b053a1cf071a824fc983c4c939d4455f6c82da4984ff5aba604f04ac92efcf24"
EXPECTED={
  FEATURED:"38ee768951715801ee3b0074c9c6a662f8c13442",
  RETRO:"45e3117fdd8e7f18a8c1e6d42e4e7a6c68f6faf3",
  EDITION:"eaf1cc82f970756352e849cafa15b2a4c4ed39f5",
  GATE:"6d06d0aeb36cae6e048f4cf12ad702f7e72d1755",
  OLD_TEXT:"5b83c8039ef7708361c911ec189ee940341b5286",
  OLD_IMAGES:"7516f4e87ea9ea3a60c73e1a01afded5f0c48735"
}

def read(rel): return (ROOT/rel).read_bytes()
def sha(x): return hashlib.sha256(x).hexdigest()
def blob(x): return hashlib.sha1(f"blob {len(x)}\0".encode()+x).hexdigest()
def put(rel,data):
    target=ROOT/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data)
def jwrite(rel,obj):
    put(rel,(json.dumps(obj,ensure_ascii=False,indent=2)+"\n").encode("utf-8"))
def source_lock():
    for path,expected in EXPECTED.items():
        got=blob(read(path))
        assert got==expected,f"R1 source drift {path}: {got}"
    assert sha(read(OLD_COVER))==SOURCE_SHA256

def cover():
    with Image.open(io.BytesIO(read(OLD_COVER))) as src:
        src.load()
        assert src.size==(1880,800)
        exact=src.convert("RGB").crop((620,96,1260,526))
    assert exact.size==(640,430)
    art=exact.resize((760,511),Image.Resampling.LANCZOS)
    output=Image.new("RGB",(1880,800),"white")
    draw=ImageDraw.Draw(output)
    draw.rectangle((0,514,1879,799),fill="#21374A")
    output.paste(art,(560,0))
    assert ImageChops.difference(output.crop((560,0,1320,511)),art).getbbox() is None
    assert output.getpixel((60,30))==(255,255,255)
    assert output.getpixel((60,530))==(33,55,74)
    assert 560>=540 and 1320<=1340
    buff=io.BytesIO()
    output.save(buff,format="PNG",optimize=True)
    data=buff.getvalue()
    assert sha(data)==REVIEWED_NEW_COVER_SHA256,f"Exact science cover hash changed: {sha(data)}"
    put(NEW_COVER,data)
    return data

# Indexed by exact zero-based article chapter; every figure is mapped to a
# paragraph that references the source figure or supports its specific claim.
RETRO_MAP={
  0:{},
  1:{"2":["r02"],"3":["r03"]},
  2:{},
  3:{"1":["r04"],"2":["r05"]},
  4:{"2":["r06"]},
  5:{"1":["r07"],"2":["r08"]},
  6:{"1":["r10"],"2":["r13","r14"],"3":["r11","r22"],
     "4":["r15"],"5":["r12"]},
  7:{"3":["r09"]},
  8:{"1":["r16"],"2":["r17","r18"]},
  9:{"1":["r19"],"2":["r20"],"3":["r21"]},
  10:{}
}
OLD_FIG4B_PARA=("作者还在原文图 4B 展示了调聚与后续烯烃异构化的串联。"
"这里需要区分步骤：DBU 介导的后续异构化将原始调聚产物转变为不同位置的 1,7-二烯骨架，"
"不能把这类新双键位置全部描述为钯催化调聚一步直接决定的结果。对于合成研究者，"
"这提示的是另一种组合思路——先在复杂网络里控制骨架与手性，再利用剩余官能团选择性地扩展结构空间。")
NEW_FIG4B_PARA=("原文图 4B 将钯催化调聚与后续 DBU 促进的烯烃异构化衔接起来。"
"依次采用图中注明的标准调聚条件、再加入 DBU/DCM 后，分别得到 1,7-二烯 6a（64% 收率）、"
"6b（94% 收率）和 (S)-6a（85% 收率、83% ee）。这些是串联操作后的结果，"
"不能把最终双键位置的改变全部归因于钯催化调聚这一步。"
"它说明前一阶段选择性构建的碳骨架，还可以借助后续异构化拓展到另一类有用的二烯产物。")

def entries_in_render_order(manifest):
    figure_map={x["id"]:x for x in manifest["figures"]}
    ordered=[]
    lead=manifest.get("lead_figure_id")
    if lead:ordered.append(lead)
    for i,section in enumerate(manifest.get("sections") or []):
        placements=section.get("figures_after_paragraph") or {}
        assert len(section.get("paragraphs") or [])>0,("empty section",i)
        inserted=[]
        for index,_ in enumerate(section["paragraphs"],1):
            ids=placements.get(str(index),[])
            assert isinstance(ids,list)
            inserted.extend(ids)
            ordered.extend(ids)
        assert Counter(inserted)==Counter(section.get("figures") or []),(i,section.get("heading"))
    body=[x["id"] for x in manifest["figures"] if x.get("body") is not False]
    assert len(ordered)==len(body) and Counter(ordered)==Counter(body)
    assert len(set(ordered))==len(ordered)
    assert all(x in figure_map for x in ordered)
    return ordered

def make_images_source(featured,retro,old_gate):
    old_rows={x["path"]:x for x in old_gate["assets"]}
    lines=[f"# {DATE} 双篇纯图片审核清单（R2）","",
      "本清单按正文实际出现顺序重建，含每张源图、段落位置及 SHA-256。",
      "今日精选封面：原论文图形摘要像素拷贝及等比例放大，顶部不印栏目字；底部只提供微信原生标题承托带。",
      "往期精选封面：使用用户已确认的七圈概念图，不将封面当作实验结构证据。",
      ""]
    for label,manifest in (("今日精选",featured),("往期精选",retro)):
        figures={x["id"]:x for x in manifest["figures"]}
        order=entries_in_render_order(manifest)
        lines.extend(["## "+label,""])
        for fid in order:
            fig=figures[fid];path=fig["repo_path"];b=read(path)
            with Image.open(io.BytesIO(b)) as image:
                image.load();dim=f"{image.width}×{image.height}"
            placements=[f"{section['heading']} 第{idx}段"
                for section in manifest["sections"]
                for idx,ids in (section.get("figures_after_paragraph") or {}).items()
                if fid in ids]
            loc=placements[0] if placements else "开篇核心图"
            lines.extend([f"### {fid} · {loc}",f"- 图：{path}",f"- 源：{fig.get('source_figure') or ''}",
              f"- 图注：{fig.get('caption') or ''}",f"- 像素：{dim}",f"- SHA-256：{sha(b)}",""])
        lines.append("")
    for manifest in (featured,retro):
        for fig in manifest["figures"]:
            if fig.get("body") is False:
                path=fig["repo_path"]
                lines.append(f"封面：{path} · SHA256 {sha(read(path))} · 源图与正文图区分")
    lines.extend(["","Fig. 4B（r09）仅出现在往期精选“底物适用范围”第3段之后，不在结语。",
       "Fig. 2A/2B、3A/3B、4A、5A–C 与 SI 图均逐段定位，不存在仅按图号推入相邻章节的情况。"])
    return "\n".join(lines)+"\n"

def main():
    source_lock()
    feat=json.loads(read(FEATURED))
    retro=json.loads(read(RETRO))
    edition=json.loads(read(EDITION))
    gate=json.loads(read(GATE))
    assert feat["editorialRevision"]==retro["editorialRevision"]==edition["editorialRevision"]==gate["revision"]==OLD
    assert feat["paper"]["doi"]==DA and retro["paper"]["doi"]==RE
    assert edition["featured"]==DA and edition["retrospective"]==retro["slug"]
    assert gate["textReview"]==gate["imageReview"]=="pass"
    assert gate["selectionDois"]==[DA,RE] and len(gate["assets"])==44 and len(gate["sources"])==7
    assert edition["title"]==ORIGINAL_TITLE
    assert retro["sections"][10]["figures"]==["r09"]
    assert OLD_FIG4B_PARA==retro["sections"][7]["paragraphs"][2]
    original_figpaths={x["id"]:x["repo_path"] for x in retro["figures"]}
    original_retro_cover=next(x["repo_path"] for x in retro["figures"] if x.get("body") is False)
    old_featuring={x["id"]:x["repo_path"] for x in feat["figures"]}
    old_retro_body_count=len([x for x in retro["figures"] if x.get("body") is not False])
    assert old_retro_body_count==22 and len([x for x in feat["figures"] if x.get("body") is not False])==20
    cover_bytes=cover()
    coverfig=next(x for x in feat["figures"] if x["id"]=="fcover")
    assert coverfig["repo_path"]==OLD_COVER and coverfig["body"] is False
    coverfig["repo_path"]=NEW_COVER
    coverfig["source_kind"]="source_pixel_exact_graphical_abstract_relayout_no_chemistry_redrawing"
    coverfig["source_adjustment"]=(
       "Reviewed October-9 Science original cover crop x620..1260 y96..526 "
       "resized proportionally to 760x511 and placed at x560,y0; "
       "white upper field, native-text-only navy lower field starting y514. "
       "No image-printed title, no altered chemistry, no redrawn bonds."
    )
    feat["cover"]["canvas"]={"width":1880,"height":800,"background":"#FFFFFF"}
    feat["cover"]["description"]=(
       "No top text label; original Science graphical abstract enlarged 18.75%. "
       "Native WeChat title appears in the lower navy backing. "
       "Both 2.35:1 and central square crop contain all scientific source pixels."
    )
    feat["editorialRevision"]=NEW
    edition["title"]=FULL_TITLE
    edition["editorialRevision"]=NEW
    assert edition["publicationMode"]=="draft_only_manual_final_send"
    retro["editorialRevision"]=NEW
    retro["sections"][7]["paragraphs"][2]=NEW_FIG4B_PARA
    for idx,positions in RETRO_MAP.items():
        section=retro["sections"][idx]
        assert max([int(k) for k in positions] or [0])<=len(section["paragraphs"])
        section["figures_after_paragraph"]=positions
        section["figures"]=[v for ids in positions.values() for v in ids]
    assert original_figpaths=={x["id"]:x["repo_path"] for x in retro["figures"]}
    assert original_retro_cover==next(x["repo_path"] for x in retro["figures"] if x.get("body") is False)
    assert retro["sections"][7]["figures"]==["r09"]
    assert retro["sections"][7]["figures_after_paragraph"]=={"3":["r09"]}
    assert retro["sections"][10]["figures"]==[]
    assert original_figpaths["r09"]==next(x["repo_path"] for x in retro["figures"] if x["id"]=="r09")
    assert len(entries_in_render_order(retro))==22
    assert len(entries_in_render_order(feat))==20
    assert [x["repo_path"] for x in feat["figures"] if x["id"]!="fcover"]==[
       path for fid,path in old_featuring.items() if fid!="fcover"
    ]
    jwrite(FEATURED,feat)
    jwrite(RETRO,retro)
    jwrite(EDITION,edition)

    original_text=read(OLD_TEXT).decode("utf-8")
    assert original_text.count("原生标题："+ORIGINAL_TITLE)==1
    assert original_text.count(OLD_FIG4B_PARA)==1
    revised_text=original_text.replace("原生标题："+ORIGINAL_TITLE,"原生标题："+FULL_TITLE,1).replace(
        OLD_FIG4B_PARA,NEW_FIG4B_PARA,1)
    revised_text=revised_text.replace("纯文字审阅稿","纯文字审阅稿 R2",1)
    assert revised_text.count(NEW_FIG4B_PARA)==1
    put(NEW_TEXT,revised_text.encode("utf-8"))
    put(NEW_IMAGES,make_images_source(feat,retro,gate).encode("utf-8"))

    # Independently exercise live publisher HTML assembly without WeChat tokens.
    pub=ROOT/"ops/wechat-publisher/create-draft.py"
    spec=importlib.util.spec_from_file_location("wechat_oct09_r2_review",pub)
    renderer=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    preview_urls={x["id"]:"https://review.invalid/"+x["id"]+".png" for x in retro["figures"]}
    page=renderer.build_retrospective_content(retro,preview_urls)
    class Inspect(HTMLParser):
        def __init__(self):super().__init__();self.imgs=[]
        def handle_starttag(self,tag,attrs):
            if tag=="img":self.imgs.append(dict(attrs).get("src"))
    inspector=Inspect()
    inspector.feed(page)
    ordered=entries_in_render_order(retro)
    assert inspector.imgs==[preview_urls[x] for x in ordered],"Renderer changed Fig.4B ordering"
    assert ordered.index("r09")<ordered.index("r19")
    assert "原文图 4B 将钯催化调聚" in page
    assert "6a（64% 收率）" in page
    assert len(ordered)==22

    gate["revision"]=NEW
    gate["artifacts"]={"textOnly":NEW_TEXT,"imagesOnly":NEW_IMAGES}
    rows=[x for x in gate["assets"] if x["path"]==OLD_COVER]
    assert len(rows)==1
    rows[0].update(path=NEW_COVER,blobSha=blob(cover_bytes),sha256=sha(cover_bytes),width=1880,height=800)
    gate["sources"]=[x for x in gate["sources"] if x["path"] not in {OLD_TEXT,OLD_IMAGES}]
    srcrows={x["path"]:x for x in gate["sources"]}
    for path in (FEATURED,RETRO,EDITION,NEW_TEXT,NEW_IMAGES):
        b=read(path)
        if path in srcrows:row=srcrows[path]
        else:
            row={"path":path}
            gate["sources"].append(row)
        row.update(blobSha=blob(b),sha256=sha(b))
    gate["reviewNotesR2"]={
      "trigger":"User spotted misplaced Fig.4B and daily native-title/cover error",
      "retrospective":"22 original body images mapped to their evidence paragraphs; Fig.4B r09 exactly after scope paragraph 3",
      "fig4bScience":"Source Fig.4B reports 6a 64%, 6b 94%, (S)-6a 85%, 83% ee under standard conditions then DBU/DCM",
      "featuredCover":"source-authentic chemistry; 760x511 from 640x430, header-free white top + navy native title region",
      "featuredNativeTitle":FULL_TITLE,
      "originalImageBytesExceptFeaturedCover":"unchanged",
      "secondArticleSelectedCoverBytes":"unchanged",
      "textReview":"pass: original paragraph preserved elsewhere and Fig.4B source-derived discussion expanded",
      "imageReview":"pass: 44 decoded assets, 42 referenced images, unique placement and HTML dry-run",
      "draftStatus":"review_ready_not_yet_written",
      "publicSendAuthorized":False
    }
    assert len(gate["assets"])==44 and len(gate["sources"])==7
    for row in gate["assets"]+gate["sources"]:
        data=read(row["path"])
        assert blob(data)==row["blobSha"],row["path"]
        if row.get("sha256"):assert sha(data)==row["sha256"],row["path"]
        if row in gate["assets"]:
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                assert (image.width,image.height)==(row["width"],row["height"])
    gate["textReview"]=gate["imageReview"]="pass"
    jwrite(GATE,gate)

    qa={
       "revision":NEW,"date":DATE,"originalMediaUpdateRequired":True,
       "selectedDois":[DA,RE],"originalReleaseCount":28,"fullNativeTitle":FULL_TITLE,
       "coverPath":NEW_COVER,"coverSHA256":sha(cover_bytes),
       "coverSourceSha256":SOURCE_SHA256,"coverNativeBackingY":514,
       "coverArtRect":[560,0,1320,511],"originalChemistryRedrawn":False,
       "squareCropPreservesArt":True,"artWidthGrowthPct":18.75,
       "oldCoverHeaderRemoved":True,"retrospectiveFigureCount":22,
       "featuredFigureCount":20,"reviewedRasterCount":44,
       "fig4bPlacedAfter":{"section":"底物适用范围","paragraph":3},
       "fig4bNoLongerAtConclusion":True,
       "otherMisplacedFiguresRepaired":True,"htmlAssembly":"pass",
       "draftWritten":False,"officialDraftReadback":"pending",
       "publicSendAuthorized":False}
    jwrite(QA,qa)
    print(json.dumps({"status":"review_pass","revision":NEW,
      "cover":NEW_COVER,"reviewAssets":44,"featuredBody":20,
      "retroBody":22,"fig4bSection":7,"fig4bParagraph":3,
      "title":FULL_TITLE,"draftWritten":False},ensure_ascii=False))

if __name__=="__main__":
    main()
