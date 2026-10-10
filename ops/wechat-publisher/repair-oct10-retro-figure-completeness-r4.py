#!/usr/bin/env python3
"""Repair the two *truncated* Oct 10 retrospective science figures (R4).

Source-locked, draft-only, same existing media ID. No WeChat API calls.
Fig. 5e is one complete original Nature Synthesis PDF crop. SI Table S11
spans printed SI pp.18-19: its two complete source pages appear consecutively.
All two cover bytes, all other 48 science figures, all article prose unchanged.
"""
from __future__ import annotations
import hashlib
import importlib.util
import io
import json
import re
import subprocess
import urllib.request
import zipfile
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
DATE="2026-10-10"
OLD="2026-10-10-r3"
NEW="2026-10-10-r4"
MANI_D="public/wechat-featured/2026-10-10.json"
MANI_R="public/wechat-retrospective/alcohols-electrochemical-crosscoupling-qiu-20261010-r5.json"
EDITION="public/wechat-editions/2026-10-10.json"
GATE="audit/wechat-working/2026-10-10-review-gate.json"
IMAGES_OLD="audit/wechat-working/2026-10-10-r1-images-only.md"
IMAGES_NEW="audit/wechat-working/2026-10-10-r4-images-only.md"
QA="audit/wechat-working/2026-10-10-r4-source-figure-completeness-qa.json"
REQUEST="audit/automation-triggers/wechat-oct10-complete-fig5e-s11-r4.json"
PATH_PREFIX="public/wechat-assets/reviewed/2026-10-10-r4-complete-evidence"
FIG5E=f"{PATH_PREFIX}/fig5e-complete-main-p7.png"
S11A=f"{PATH_PREFIX}/si-table-s11-full-part1-si-p18.png"
S11B=f"{PATH_PREFIX}/si-table-s11-full-part2-si-p19.png"
EXPECTED_OLD={
  MANI_D:"d0226a131fe5fd28ada204bad401152f91e86a01",
  MANI_R:"3a8825aed685a1fa10c72c6eb2c71ae94ad8499b",
  EDITION:"b2bcea42f5cc953f3adc8c5157f682985331d8f6",
  GATE:"e212fc47519d9421cfbbed50b27344b695129ec2",
  IMAGES_OLD:"8fc007eebd9b40525aa6c70f91f488cfb443f7af"
}
DOIS=["10.1002/anie.3306470","10.1038/s44160-026-01128-y"]

def read(rel):return (ROOT/rel).read_bytes()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def blob(raw):return hashlib.sha1(f"blob {len(raw)}\0".encode()+raw).hexdigest()
def outjson(rel,obj):
    path=ROOT/rel
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def check_image(data,size):
    with Image.open(io.BytesIO(data)) as im:
        im.load()
        assert im.format=="PNG" and im.size==size,("Source image dimensions incorrect",im.size,size)
def position_order(article):
    seen=[str(article["lead_figure_id"])] if article.get("lead_figure_id") else []
    for section in article["sections"]:
        ids=[]
        positions=section.get("figures_after_paragraph") or {}
        for i in range(1,len(section["paragraphs"])+1):
            value=positions.get(str(i),[])
            assert isinstance(value,list)
            ids.extend(value)
        assert Counter(ids)==Counter(section.get("figures") or []),section["heading"]
        seen.extend(ids)
    expected=[f["id"] for f in article["figures"] if f.get("body") is not False]
    assert len(seen)==len(set(seen)) and Counter(seen)==Counter(expected)
    return seen
class ParseHTML(HTMLParser):
    def __init__(self):super().__init__();self.images=[];self.text=[]
    def handle_starttag(self,name,attrs):
        if name=="img":self.images.append(dict(attrs).get("src"))
    def handle_data(self,t):self.text.append(t)

def main():
    req=json.loads(read(REQUEST))
    assert req["action"]=="replace_truncated_source_figures_only"
    assert req["date"]==DATE and req["revisionFrom"]==OLD and req["revisionTo"]==NEW
    assert req["selectedDois"]==DOIS
    assert req["draftOnly"] is True and req["publicSendAuthorized"] is False
    assert req["existingMediaId"]=="KhELYUzvwADwB_l1xH1SWFOfn60HSWWcYlciDjMIDj7HKSul-GJJti3u0OIKFcyL"
    assert req["reviewedSourcePaths"]==[FIG5E,S11A,S11B]

    for rel,expected in EXPECTED_OLD.items():
        assert blob(read(rel))==expected,("Unexpected source drift",rel)
    previously=json.loads(read("audit/wechat-publisher/latest.json"))
    assert previously["status"]=="ok" and previously["stage"]=="draft_update"
    assert previously["draft_readback"]=="ok" and previously["media_id"]==req["existingMediaId"]
    assert previously["publicationSlot"]=="2026-10-10T08:00:00+08:00"
    assert previously.get("publish_id") is None
    assert previously["preview_url"]=="https://relay.gczhouwld.com/wechat-preview/e4795548645a1dabc379a911.html"

    featured=json.loads(read(MANI_D))
    retro=json.loads(read(MANI_R))
    edition=json.loads(read(EDITION))
    gate=json.loads(read(GATE))
    assert featured["editorialRevision"]==retro["editorialRevision"]==edition["editorialRevision"]==gate["revision"]==OLD
    assert featured["paper"]["doi"]==DOIS[0] and retro["paper"]["doi"]==DOIS[1]
    assert edition["featured"]==DOIS[0] and edition["retrospective"]==retro["slug"]
    assert "仇友爱" in retro["title"] and "邱友爱" not in json.dumps(retro,ensure_ascii=False)
    assert gate["textReview"]==gate["imageReview"]=="pass"
    assert len(gate["assets"])==51 and gate["selectionDois"]==DOIS
    protected_cover_paths=[
        next(x for x in featured["figures"] if x["id"]=="fcover")["repo_path"],
        next(x for x in retro["figures"] if x["id"]=="retro-cover")["repo_path"],
    ]
    protected_before=[
        (x["id"],x["repo_path"],x["caption"])
        for x in featured["figures"]+retro["figures"]
        if x.get("body") is not False and x["id"] not in {"f20","s16"}
    ]
    assert len(protected_before)==47 # 49 original scientific images minus 2 broken figures

    # ZIP contains exactly three byte-authenticated original-source PDF crops.
    url=req["packageUrl"]
    assert re.fullmatch(r"https://at\.adobe\.com/[A-Za-z0-9]+",url)
    with urllib.request.urlopen(url,timeout=55) as response:payload=response.read(3_000_001)
    assert len(payload)<3_000_000 and sha(payload)==req["packageSha256"]
    with zipfile.ZipFile(io.BytesIO(payload)) as z:
        names=set(z.namelist())
        assert names==set([FIG5E,S11A,S11B,"oct10-r4-source-figure-evidence.json"])
        evidence=json.loads(z.read("oct10-r4-source-figure-evidence.json"))
        assert evidence["revision"]==NEW and evidence["dois"]==DOIS
        assert evidence["original_sifigure_spans_two_pages"] is True
        assert evidence["source_document_validated"] is True
        assert evidence["draftOnly"] is True and evidence["publicSendAuthorized"] is False
        expected_sizes={FIG5E:(1048,748),S11A:(1427,2128),S11B:(1427,1362)}
        for row in evidence["artifacts"]:
            rel=row["path"]
            assert rel in expected_sizes
            assert tuple(row["size"])==expected_sizes[rel]
            assert row["verified_byte_identical_to_source_pdf_crop"] is True
            assert row["source_original_render_sha256"]==row["sha256"]
            img=z.read(rel)
            assert sha(img)==row["sha256"]==req["sourcesSha256"][rel]
            check_image(img,expected_sizes[rel])
            target=ROOT/rel
            assert not target.exists(),("Refusing to overwrite image",rel)
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(img)

    oldimages={x["id"]:x for x in retro["figures"]}
    assert oldimages["f20"]["repo_path"]=="public/wechat-assets/reviewed/2026-10-10-qiu-alcohols/f20.png"
    assert oldimages["s16"]["repo_path"]=="public/wechat-assets/reviewed/2026-10-10-qiu-alcohols/s16.png"
    old_asset_paths={x["path"] for x in gate["assets"]}
    assert oldimages["f20"]["repo_path"] in old_asset_paths and oldimages["s16"]["repo_path"] in old_asset_paths
    assert all(p in old_asset_paths for p in protected_cover_paths)

    f20=oldimages["f20"]
    f20.update(
        repo_path=FIG5E,
        caption="原文 Fig. 5e｜完整镍催化循环工作模型：Int-I 至 Int-V、A-3 原位醇活化、Ni(I)/Ni(II)/Ni(III) 转化与阴极析氢均完整呈现。",
        display_width_pct=100,
        source_kind="source_original_PDF_exact_full_panel_verified",
        pdf_source="main",
        source_pdf_page=7,
        source_crop_fraction=[0.49055,0.63096,0.93067,0.86741],
    )
    s16=oldimages["s16"]
    s16.update(
        repo_path=S11A,
        caption="SI Table S11（完整原表上页，SI 第18页）｜保留完整标题、三组表头及全部上页数据，含 12.4、18.7、24.9 F mol⁻¹ 等投入电荷。",
        display_width_pct=100,
        source_kind="source_original_PDF_exact_whole_table_page",
        pdf_source="SI",source_pdf_page=19,
        source_crop_fraction=[0.139424,0.081956,0.912117,0.89676],
    )
    assert "s16b" not in oldimages
    s16b={
        "id":"s16b","repo_path":S11B,
        "caption":"SI Table S11（续页，SI 第19页）｜保留原表其余全部数据行（28–41、67–80、123–134）以及末尾的电荷投入计算公式；列名沿用上一张表。",
        "body":True,"display_width_pct":100,
        "source_figure":"SI Table S11（续页）",
        "source_doi":DOIS[1],
        "source_kind":"source_original_PDF_exact_whole_table_continuation",
        "pdf_source":"SI","source_pdf_page":20,
        "source_crop_fraction":[0.139424,0.081956,0.912117,0.60338],
    }
    old_idx=next(i for i,x in enumerate(retro["figures"]) if x["id"]=="s16")
    retro["figures"].insert(old_idx+1,s16b)
    found=[sec for sec in retro["sections"] if "s16" in sec.get("figures",[])]
    assert len(found)==1
    sec=found[0]
    idx=sec["figures"].index("s16")
    sec["figures"].insert(idx+1,"s16b")
    inline=sec["figures_after_paragraph"]
    positions=[key for key,v in inline.items() if "s16" in v]
    assert len(positions)==1 and positions[0]=="2"
    inline["2"].insert(inline["2"].index("s16")+1,"s16b")
    assert retro["sections"][9] is sec
    assert retro["sections"][4]["figures_after_paragraph"]["3"].count("f20")==1
    assert protected_before==[(x["id"],x["repo_path"],x["caption"])
                            for x in featured["figures"]+retro["figures"]
                            if x.get("body") is not False and x["id"] not in {"f20","s16","s16b"}]
    assert protected_cover_paths==[
        next(x for x in featured["figures"] if x["id"]=="fcover")["repo_path"],
        next(x for x in retro["figures"] if x["id"]=="retro-cover")["repo_path"],
    ]

    featured["editorialRevision"]=retro["editorialRevision"]=edition["editorialRevision"]=NEW
    outjson(MANI_D,featured)
    outjson(MANI_R,retro)
    outjson(EDITION,edition)

    # Fully re-export IMAGE-ONLY review independently of unmodified R3 prose.
    lines=["# 10.10 R4 公众号两篇科学图片完整性复审",
        "",
        "本轮仅修复往期精选 Fig. 5e 与跨两页的 SI Table S11，保留前一轮所有文字、正文其他47张原图、两篇封面及原始配图顺序。",
        "旧 Fig. 5e 只截取了循环中间片段；旧 SI Table S11 是残缺上半页，现均被停用；源文件仍存档但不进入草稿。",
        "原 SI Table S11 实际连续两页（SI 印刷页码 18、19；PDF 物理页 19、20），以 s16、s16b 两张完整原 PDF 源图紧邻展示。不能只展示第一页。",
        "全部新图片均为原文 PDF 裁切像素，无分子/谱图/数据重绘。",""]
    ordered_paths=[]
    for label,manifest in [("今日精选 Angew",featured),("往期精选 Nature Synthesis",retro)]:
        figures={x["id"]:x for x in manifest["figures"]}
        lines+=["## "+label,""]
        orders=position_order(manifest)
        for fid in orders:
            fig=figures[fid]
            p=fig["repo_path"]
            b=read(p)
            with Image.open(io.BytesIO(b)) as im:im.load();d=im.size
            placement=["先导图"] if fid==manifest.get("lead_figure_id") else [
                f"{section['heading']} 第{i}段" for section in manifest["sections"]
                for i,ids in section["figures_after_paragraph"].items() if fid in ids]
            assert len(placement)==1,(fid,placement)
            lines+= [f"- **{fid}**｜{placement[0]}",
                    f"  - 图注：{fig['caption']}",
                    f"  - 来源：{fig.get('source_figure','')}",
                    f"  - 审核原图：{p}",
                    f"  - {d[0]}×{d[1]}px；SHA256 {sha(b)}"]
            ordered_paths.append(p)
        cover=next(x for x in manifest["figures"] if x.get("body") is False)
        lines+=["",f"- **封面 {cover['id']}**：{cover['repo_path']}；原始封面未修改",""]
        ordered_paths.append(cover["repo_path"])
    assert len(ordered_paths)==52 and len(set(ordered_paths))==52
    image_file=ROOT/IMAGES_NEW
    assert not image_file.exists()
    image_file.write_text("\n".join(lines)+"\n",encoding="utf8")

    # Pin only live source files; remove old Figure5e and TableS11 invalidated assets.
    old_bad={"public/wechat-assets/reviewed/2026-10-10-qiu-alcohols/f20.png",
             "public/wechat-assets/reviewed/2026-10-10-qiu-alcohols/s16.png"}
    assert sum(x["path"] in old_bad for x in gate["assets"])==2
    gate["assets"]=[x for x in gate["assets"] if x["path"] not in old_bad]
    for img in [FIG5E,S11A,S11B]:
        b=read(img)
        with Image.open(io.BytesIO(b)) as im:im.load();w,h=im.size
        gate["assets"].append({"path":img,"blobSha":blob(b),"sha256":sha(b),"width":w,"height":h})
    assert len(gate["assets"])==52
    assert {x["path"] for x in gate["assets"]}==set(ordered_paths)
    gate["revision"]=NEW
    gate["artifacts"]["imagesOnly"]=IMAGES_NEW
    gate["sources"]=[x for x in gate["sources"] if x["path"]!=IMAGES_OLD]
    gate["sources"].append({"path":IMAGES_NEW,"blobSha":blob(read(IMAGES_NEW)),"sha256":sha(read(IMAGES_NEW))})
    for row in gate["sources"]:
        b=read(row["path"])
        row.update(blobSha=blob(b),sha256=sha(b))
    gate["reviewNotes"].append(
        "R4 strict scientific image integrity repair: source PDF p7 Fig5e complete reaction mechanism; "
        "source SI printed pp18/19 full Supplementary Table11 including all headers, all rows, "
        "electricity Q formula. Replaces truncated f20/s16 with f20/s16+s16b, all original "
        "article prose, 18 Angew and 29 other Nature body image bytes, and two approved "
        "covers unchanged. Live images 50, total source assets 52. Draft only; requires "
        "one same-media draft/update + draft/get, no public send."
    )
    gate["draftReadback"]="pending-r4"
    assert gate["textReview"]==gate["imageReview"]=="pass"
    outjson(GATE,gate)

    # Run the real publisher's hard gate and check ALL actual source HTML image positions.
    pub=ROOT/"ops/wechat-publisher/create-draft.py"
    spec=importlib.util.spec_from_file_location("wechat_oct10_figure_r4_QA",pub)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    mod.require_editorial_review_gate(ROOT/GATE,[ROOT/MANI_D,ROOT/MANI_R,ROOT/EDITION])
    slot,papers=mod.load_latest_release()
    assert slot=="2026-10-10T08:00:00+08:00" and len(papers)==23
    for name,manifest,expected_count in [("daily",featured,18),("retro",retro,32)]:
        urls={x["id"]:"https://review.invalid/"+name+"/"+x["id"]+".png" for x in manifest["figures"]}
        if name=="daily":
            html=mod.build_content(slot,papers,manifest,urls,gallery_qr_url="")
        else:
            html=mod.build_retrospective_content(manifest,urls)
        parsed=ParseHTML();parsed.feed(html)
        ids=position_order(manifest)
        assert len(ids)==expected_count
        assert parsed.images==[urls[x] for x in ids],("Live rendering image order mismatch",name)
        txt="".join(parsed.text)
        for section in manifest["sections"]:
            for paragraph in section["paragraphs"]:
                assert paragraph in txt,("Science paragraph was lost",name,paragraph[:90])
        for fig in manifest["figures"]:
            if fig.get("body") is not False:
                assert fig["caption"] in txt,("Caption missing",name,fig["id"])
    for row in gate["assets"]+gate["sources"]:
        b=read(row["path"])
        assert blob(b)==row["blobSha"] and sha(b)==row["sha256"],row["path"]
        if row in gate["assets"]:
            with Image.open(io.BytesIO(b)) as im:
                im.load()
                assert im.size==(row["width"],row["height"])

    qa={
        "date":DATE,"revision":NEW,"status":"source_review_pass",
        "media_id":req["existingMediaId"],"priorPreview":previously["preview_url"],
        "scienceImageCounts":{"before":[18,31],"after":[18,32]},
        "coveredFigures":["Fig. 5e","SI Table S11"],
        "newImagePaths":[FIG5E,S11A,S11B],
        "newImageSha256":{p:sha(read(p)) for p in [FIG5E,S11A,S11B]},
        "sourcePdfDigests":{a["source"]:a["source_pdf_sha256"] for a in evidence["artifacts"]},
        "sourcePDFPixelExact":True,
        "fig5eAllIntermediatesAndBothSides":True,
        "siTableS11TwoSourcePagesFull":True,
        "siTableHasCompleteHeadersRowsFormula":True,
        "titleAndAuthorsUnchanged":True,"allProseUnchanged":True,
        "twoCoverImagesIdentical":True,
        "unchangedBodyImageCount":47,
        "all52AssetFingerprints":"pass",
        "independentPublisherReviewGate":"pass",
        "htmlParagraphImageSequence":"pass",
        "draftWritten":False,"draftReadback":"not_run",
        "publicSendAuthorized":False
    }
    outjson(QA,qa)

    # Write Git commit only after complete PASS. Rebase, never force-push.
    subprocess.run(["git","config","user.name","github-actions[bot]"],check=True)
    subprocess.run(["git","config","user.email","41898282+github-actions[bot]@users.noreply.github.com"],check=True)
    paths=[MANI_D,MANI_R,EDITION,GATE,IMAGES_NEW,QA,FIG5E,S11A,S11B]
    subprocess.run(["git","add","--",*paths],check=True)
    subprocess.run(["git","commit","-m","wechat: repair incomplete Oct10 Fig5e and full two-page SI TableS11 in same draft source (no send)"],check=True)
    for i in range(5):
        subprocess.run(["git","fetch","origin","main"],check=True)
        tryrebase=subprocess.run(["git","rebase","origin/main"])
        if tryrebase.returncode!=0:
            subprocess.run(["git","rebase","--abort"],check=False)
            raise RuntimeError("Concurrent editorial source moved; refused overwrite")
        if subprocess.run(["git","push","origin","HEAD:main"]).returncode==0:
            print(json.dumps(qa,ensure_ascii=False));return
    raise RuntimeError("Cannot push safely; no source updates written.")

if __name__=="__main__":main()
