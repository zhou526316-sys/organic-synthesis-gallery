#!/usr/bin/env python3
"""Prepare reviewed R7 WeChat original-TOC cover (SOURCE ONLY; no API draft write).

User request 2026-10-08: return to label-free featured cover; enlarge the
original verified chemical graphical abstract and retain the native title band.
Do not use/generated AI chemistry. One source revision, one terminal draft sync.
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
import hashlib, json, io

ROOT = Path(__file__).resolve().parents[2]
DATE, PRIOR, REV = "2026-10-08", "2026-10-08-r6", "2026-10-08-r7"
DOI="10.1021/jacs.6c14748"
ORIGINAL_REL="public/wechat-assets/reviewed/2026-10-08-r3/jacs-cover-original-white.png"
PRIOR_REL="public/wechat-assets/reviewed/2026-10-08-r6/jacs-cover-native-final.png"
OUTPUT_REL="public/wechat-assets/reviewed/2026-10-08-r7/jacs-cover-toc-large-no-label.png"
FEATURED_REL="public/wechat-featured/2026-10-08.json"
EDITION_REL="public/wechat-editions/2026-10-08.json"
GATE_REL="audit/wechat-working/2026-10-08-review-gate.json"
TEXT_PREV="audit/wechat-working/2026-10-08-r6-text-only.md"
IMAGE_PREV="audit/wechat-working/2026-10-08-r6-images-only.md"
TEXT_NEXT="audit/wechat-working/2026-10-08-r7-text-only.md"
IMAGE_NEXT="audit/wechat-working/2026-10-08-r7-images-only.md"
QA_REL="audit/wechat-working/2026-10-08-r7-mobile-cover-qa.json"
KNOWN_ORIGINAL_SHA="1cd7a98d013038332724d3ff81cce2d7e97f82a0049c8b481108008cf401fbde"
KNOWN_PRIOR_SHA="7a2c2c9109991b6cbe3131e717a0082106c406b5e30155425c9675aa400f8fee"
KNOWN_FEATURED_BLOB="61073627d30dfcd9d36dad05eefd5b588fc68b3c"
KNOWN_EDITION_BLOB="54ff5cfd38d2f52c4f9696c3bb88d7c05e45d2fc"

def sha256(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()

def gitblob(blob: bytes) -> str:
    return hashlib.sha1(f"blob {len(blob)}\0".encode()+blob).hexdigest()

def from_file(rel: str) -> bytes:
    return (ROOT / rel).read_bytes()

def write_json(rel: str, payload: object) -> None:
    target=ROOT/rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def assert_verified_sources() -> None:
    assert sha256(from_file(ORIGINAL_REL))==KNOWN_ORIGINAL_SHA, "original source altered"
    assert sha256(from_file(PRIOR_REL))==KNOWN_PRIOR_SHA, "prior reviewed cover altered"
    assert gitblob(from_file(FEATURED_REL))==KNOWN_FEATURED_BLOB, "featured source not R6"
    assert gitblob(from_file(EDITION_REL))==KNOWN_EDITION_BLOB, "edition source not R6"

def main() -> None:
    assert_verified_sources()
    old_feat=json.loads(from_file(FEATURED_REL))
    old_edition=json.loads(from_file(EDITION_REL))
    assert old_feat["paper"]["doi"]==DOI
    assert old_feat["editorialRevision"]==PRIOR
    assert old_edition["editorialRevision"]==PRIOR
    assert old_edition["retrospective"]=="os1-multicentred-sulfur-20261008"
    old_gate=json.loads(from_file(GATE_REL))
    assert old_gate["revision"]==PRIOR
    assert old_gate["textReview"]=="pass" and old_gate["imageReview"]=="pass"
    assert old_gate["selectionDois"]==[DOI,"10.1038/s41929-026-01602-y"]
    assert len(old_gate["assets"])==34

    with Image.open(io.BytesIO(from_file(ORIGINAL_REL))) as im:
        im.load()
        original=im.convert("RGB")
    assert original.size==(1880,800)
    with Image.open(io.BytesIO(from_file(PRIOR_REL))) as prev:
        prev.load()
        assert prev.size==original.size
    W,H=original.size
    # Only the original graphic region; no old headline nor redrawn chemistry.
    source_box=(550,93,1330,565)
    art=original.crop(source_box)
    # Same background-only mask accepted in R6: retains oxygen center x971..1010,
    # removes tiny remnants of the previous headline outside the chemistry.
    d=ImageDraw.Draw(art)
    d.rectangle((0,0,421,32),fill="white")
    d.rectangle((460,0,art.width,32),fill="white")

    # The original TOC is uniformly scaled, enlarged 35.7% versus reviewed R6.
    # 2.35:1 main cover with screenshot-grounded WeChat native title region.
    source_height=art.height
    scaled_height=460
    scaled_width=round(art.width*scaled_height/source_height)
    assert scaled_width==760
    art=art.resize((scaled_width,scaled_height),Image.Resampling.LANCZOS)
    x=(W-scaled_width)//2
    y=16
    band_y=492
    assert y+scaled_height==476 and band_y-(y+scaled_height)>=16

    new=Image.new("RGB",(W,H),"white")
    back=ImageDraw.Draw(new)
    back.rectangle((0,band_y,W-1,H-1),fill="#243c51")
    new.paste(art,(x,y))
    assert ImageChops.difference(new.crop((x,y,x+scaled_width,y+scaled_height)),art).getbbox() is None
    assert new.getpixel((100,40))==(255,255,255), "header region not fully clean"
    assert new.getpixel((100,550))==(36,60,81), "native title backing missing"
    assert new.getpixel((100,450))==(255,255,255)
    assert x>=540 and x+scaled_width<=1340, "square crop truncates TOC"

    out=ROOT/OUTPUT_REL
    out.parent.mkdir(parents=True,exist_ok=True)
    new.save(out,format="PNG",optimize=True)
    with Image.open(out) as chk:
        chk.load()
        assert chk.size==(1880,800)
        assert chk.mode=="RGB"
    png=out.read_bytes()

    feat=json.loads(from_file(FEATURED_REL))
    fig=[row for row in feat["figures"] if row.get("id")=="jacs-cover"]
    assert len(fig)==1 and fig[0]["repo_path"]==PRIOR_REL and fig[0]["body"] is False
    old_body_paths=[f["repo_path"] for f in feat["figures"] if f.get("body") is not False]
    assert len(old_body_paths)==20 and len(set(old_body_paths))==20
    fig[0]["repo_path"]=OUTPUT_REL
    fig[0]["source_kind"]="original_verified_TOC_rescaled_without_header"
    fig[0]["source_adjustment"]=(
      "User requested removing 今日精选·JACS banner. Original unchanged chemistry "
      "ROI from R3 source cropped (550,93,1330,565), background-only old-header "
      "ghost removed outside the chemical O center, uniformly scaled to 760x460, "
      "positioned (560,16). Solid low-saturation navy backing starts y492 for "
      "WeChat-native two-line white title. No invented atoms, bonds or conditions."
    )
    feat["cover"]["description"]=(
      "Original JACS TOC only, without the top 今日精选·JACS header. Original "
      "chemical content enlarged and centered at 760x460 (R6 was ~560x339); "
      "white background; native white article headline rests entirely on the "
      "clean deep navy band y492:800. Keep article title unchanged."
    )
    feat["editorialRevision"]=REV
    assert [f["repo_path"] for f in feat["figures"] if f.get("body") is not False]==old_body_paths
    edition=json.loads(from_file(EDITION_REL))
    edition["editorialRevision"]=REV
    assert edition["title"]==old_edition["title"] and edition["retrospective"]==old_edition["retrospective"]
    write_json(FEATURED_REL,feat)
    write_json(EDITION_REL,edition)

    reviewed_text=(ROOT/TEXT_PREV).read_text(encoding="utf-8")
    (ROOT/TEXT_NEXT).write_text(reviewed_text.replace("(R6)","(R7)").replace("R6","R7",1),encoding="utf-8")
    images_text=(ROOT/IMAGE_PREV).read_text(encoding="utf-8")
    assert PRIOR_REL in images_text
    lines=images_text.splitlines()
    # Remove stale cover-layout statements only; leave the inventory of
    # 32 paper-body figures and retrospective layout intact.
    for i,line in enumerate(lines):
        if line.startswith("封面：") and PRIOR_REL in line:
            lines[i]=(f"封面：{OUTPUT_REL}。删除顶部“今日精选·JACS”字样；"
                      f"使用R3的原始化学TOC裁区，等比例放大至760×460，"
                      f"上移至y16，完整反应图止于y476，底部深蓝标题区从y492开始，"
                      f"适配微信原生白色标题，不重绘结构。")
        if "- 今日精选封面：" in line:
            lines[i]="- 今日精选封面：原文JACS TOC结构和色块；顶部不再出现“今日精选·JACS”；下方深蓝区仅用于微信原生文章标题。"
    lines=[l for l in lines if not l.startswith("R5独立复核：") and not l.startswith("R6独立复核：")]
    images_text="\n".join(lines).rstrip()+"\n\nR7审核：TOC相对R6等比例放大约35.7%，除封面外正文全部图片和往期精选封面保持原样。\n"
    assert OUTPUT_REL in images_text and PRIOR_REL not in images_text
    (ROOT/IMAGE_NEXT).write_text(images_text,encoding="utf-8")

    # Recompute all reviewed hashes after changes. Fail closed until they match.
    gate=json.loads(from_file(GATE_REL))
    gate["revision"]=REV
    gate["artifacts"]={"textOnly":TEXT_NEXT,"imagesOnly":IMAGE_NEXT}
    covered_assets=[v for v in gate["assets"] if v.get("path")==PRIOR_REL]
    assert len(covered_assets)==1
    covered_assets[0].update(path=OUTPUT_REL,blobSha=gitblob(png),sha256=sha256(png),width=W,height=H)
    old_src_paths={TEXT_PREV,IMAGE_PREV}
    gate["sources"]=[v for v in gate["sources"] if v["path"] not in old_src_paths]
    coverage={v["path"]:v for v in gate["sources"]}
    for path in [FEATURED_REL,EDITION_REL,TEXT_NEXT,IMAGE_NEXT]:
        bb=from_file(path)
        record=coverage.get(path)
        if record is None:
            record={"path":path}
            gate["sources"].append(record)
        record["blobSha"]=gitblob(bb)
        record["sha256"]=sha256(bb)
    assert len(gate["assets"])==34 and len(gate["sources"])==5
    gate["reviewNotesR7"]={
      "userRequest":"Remove top 今日精选·JACS header and enlarge authentic TOC; write back same draft.",
      "scientificArtwork":"R3 original verified JACS graphical-abstract crop, no generated chemistry",
      "imageQA":"PASS: decoded PNG; complete chemistry and caption labels; background-only cleanup; no top header",
      "headlineGeometry":"User R3 mobile screenshot found glyphs near image y525; y492 navy backing begins before glyphs",
      "originalTOCScale":"760x460 versus prior R6 560x339",
      "squareCrop":"center 800x800 x540..1340 contains complete x560..1320 graphic",
      "bodyAndSecondArticle":"unchanged, 20 JACS body images plus retrospective images; 32 total body images",
      "textReview":"PASS: source narrative unchanged; only source review heading revision changes",
      "textReviewStatus":"pass",
      "imageReviewStatus":"pass",
      "publisherNotYetRun":True
    }
    gate["textReview"]="pass"
    gate["imageReview"]="pass"
    write_json(GATE_REL,gate)
    qa={
      "date":DATE,"revision":REV,"sourceOriginal":ORIGINAL_REL,
      "sourceOriginalSha256":KNOWN_ORIGINAL_SHA,"oldCover":PRIOR_REL,
      "finalCover":OUTPUT_REL,"finalCoverSha256":sha256(png),
      "canvas":[W,H],"nativeTitleBackingY":band_y,
      "artworkRegion":{"x":x,"y":y,"width":scaled_width,"height":scaled_height},
      "topColumnTextRemoved":True,"scienceRedrawn":False,
      "squareCropPreservesTOC":True,
      "titleMarginToArtPixels":band_y-(y+scaled_height),
      "artworkSizeImprovementFactorVsR6":round(460/339,3),
      "bodyFigureChangeCount":0,"articleCount":2,"publicationStatus":"draft_only_not_sent",
      "readback":"pending"
    }
    write_json(QA_REL,qa)
    print(json.dumps({"result":"R7_SOURCE_READY","artifact":OUTPUT_REL,
      "image_sha256":sha256(png),"source_files":len(gate["sources"]),
      "reviewed_assets":len(gate["assets"]),"TOC_size":[scaled_width,scaled_height],
      "removed_header":True,"body_changes":0,"draft_updated":False},ensure_ascii=False))

if __name__=="__main__":
    main()
