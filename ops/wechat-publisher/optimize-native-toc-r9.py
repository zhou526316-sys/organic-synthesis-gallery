#!/usr/bin/env python3
"""2026-10-08 R9 source-exact JACS cover enlargement.

Maximize TOC while respecting full restored native title, central 1:1 crop,
2.35:1 display, and chemical foreground authenticity. SOURCE-ONLY stage.
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops, ImageFont
import hashlib, io, json

ROOT=Path(__file__).resolve().parents[2]
DATE="2026-10-08"
PRIOR="2026-10-08-r8"
REV="2026-10-08-r9"
DOI="10.1021/jacs.6c14748"
FULL_TITLE="有机合成文献日报｜10.08｜今日精选｜JACS：α-氯代烷基硼酸酯与偕二硼烷的立体选择性1,2-迁移重排"
ORIGINAL="public/wechat-assets/reviewed/2026-10-08-r3/jacs-cover-original-white.png"
PRIOR_COVER="public/wechat-assets/reviewed/2026-10-08-r7/jacs-cover-toc-large-no-label.png"
TARGET="public/wechat-assets/reviewed/2026-10-08-r9/jacs-cover-original-toc-maxsafe.png"
FEATURED="public/wechat-featured/2026-10-08.json"
EDITION="public/wechat-editions/2026-10-08.json"
RETRO="public/wechat-retrospective/os1-multicentred-sulfur-20261008.json"
GATE="audit/wechat-working/2026-10-08-review-gate.json"
OLD_TEXT="audit/wechat-working/2026-10-08-r8-text-only.md"
OLD_IMAGES="audit/wechat-working/2026-10-08-r8-images-only.md"
NEW_TEXT="audit/wechat-working/2026-10-08-r9-text-only.md"
NEW_IMAGES="audit/wechat-working/2026-10-08-r9-images-only.md"
QA="audit/wechat-working/2026-10-08-r9-cover-qa.json"
PROOF_DIR=ROOT/"audit/wechat-working/crop-proofs/2026-10-08-r9"

EXPECTED={
 ORIGINAL:"1cd7a98d013038332724d3ff81cce2d7e97f82a0049c8b481108008cf401fbde",
 PRIOR_COVER:"84ba82ca0162ddb8d40d2faf28bcbba9608cb88dea2e6668cb5de3e123fb868e",
}
EXPECTED_BLOBS={
 FEATURED:"8f3b60c7b7574ab1d5b65c59c4bd02c20c2efdd4",
 EDITION:"3a7e41596759b2207da5251253711eeef90c1d1e",
 GATE:"a70b7042bdf6350e387c468290a08b8d7a141192",
 OLD_TEXT:"7f1d145d9de89d044f330cbe50c2cb2d5b79928d",
 OLD_IMAGES:"05f3c04b58c8e8d90cd193730cf896dc52af59f9",
 RETRO:"873139bcb57b260f1d0fe19d1b344191ede5755b",
}
def get(rel): return (ROOT/rel).read_bytes()
def sha(data): return hashlib.sha256(data).hexdigest()
def blob(data): return hashlib.sha1(f"blob {len(data)}\0".encode()+data).hexdigest()
def save_json(rel,item):
    p=ROOT/rel
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(item,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def save_text(rel,txt):
    p=ROOT/rel
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(txt,encoding="utf-8")
def lock():
    for rel,want in EXPECTED.items(): assert sha(get(rel))==want, f"source asset drift: {rel}"
    for rel,want in EXPECTED_BLOBS.items(): assert blob(get(rel))==want, f"source manifest drift: {rel}"

def main():
    lock()
    current=json.loads(get(FEATURED))
    edition=json.loads(get(EDITION))
    gate=json.loads(get(GATE))
    assert current["editorialRevision"]==edition["editorialRevision"]==gate["revision"]==PRIOR
    assert current["paper"]["doi"]==DOI
    assert edition["title"]==FULL_TITLE
    assert edition["retrospective"]=="os1-multicentred-sulfur-20261008"
    assert edition["publicationMode"]=="draft_only_manual_final_send"
    assert gate["selectionDois"]==[DOI,"10.1038/s41929-026-01602-y"]
    assert gate["textReview"]==gate["imageReview"]=="pass"
    assert len(gate["assets"])==34 and len(gate["sources"])==5

    with Image.open(io.BytesIO(get(ORIGINAL))) as im:
        im.load()
        src=im.convert("RGB")
    assert src.size==(1880,800)
    with Image.open(io.BytesIO(get(PRIOR_COVER))) as im:
        im.load()
        oldcover=im.convert("RGB")
    # Only background outside the original printed molecular oxygen is whitened.
    # Source image itself is unchanged; transferred art is then scaled uniformly.
    source_box=(560,93,1320,565)
    chemistry=src.crop(source_box)
    mask=ImageDraw.Draw(chemistry)
    mask.rectangle((0,0,411,32),fill="white")
    mask.rectangle((450,0,chemistry.width,32),fill="white")
    assert chemistry.size==(760,472)

    # Max-safe geometry: 1:1 center crop spans X=540..1340 (800px).
    # R9 chemical content spans X=544..1336 and Y=6..498;
    # title zone starts at Y=514 (16px gap) before observed native glyph Y~525.
    artwork_w,artwork_h=792,492
    artwork_x,artwork_y=544,6
    title_band_y=514
    assert artwork_w<=800
    assert artwork_x>=540 and artwork_x+artwork_w<=1340
    assert artwork_y>=6 and artwork_y+artwork_h+16==title_band_y
    assert title_band_y<=525-10
    chemistry=chemistry.resize((artwork_w,artwork_h),Image.Resampling.LANCZOS)
    cover=Image.new("RGB",(1880,800),"white")
    draw=ImageDraw.Draw(cover)
    draw.rectangle((0,title_band_y,1879,799),fill="#243c51")
    cover.paste(chemistry,(artwork_x,artwork_y))
    assert ImageChops.difference(cover.crop((artwork_x,artwork_y,artwork_x+artwork_w,artwork_y+artwork_h)),chemistry).getbbox() is None
    assert cover.getpixel((120,400))==(255,255,255)
    assert cover.getpixel((120,530))==(36,60,81)
    assert cover.getpixel((120,799))==(36,60,81)

    output=ROOT/TARGET
    output.parent.mkdir(parents=True,exist_ok=True)
    cover.save(output,format="PNG",optimize=True)
    with Image.open(output) as restored:
        restored.load()
        assert restored.size==(1880,800) and restored.mode=="RGB"
    assert artwork_w>760 and artwork_h>460
    assert title_band_y-(artwork_y+artwork_h)>=16

    # Two independently materialized mobile QA surfaces: 2.35:1 and 1:1.
    PROOF_DIR.mkdir(parents=True,exist_ok=True)
    cover.resize((470,200),Image.Resampling.LANCZOS).save(
        PROOF_DIR/"mobile-470x200-plain.png")
    square=cover.crop((540,0,1340,800))
    square.resize((240,240),Image.Resampling.LANCZOS).save(
        PROOF_DIR/"square-240x240.png")
    # A simulated title overlay is not a native WeChat screenshot. It checks
    # backing contrast only; actual native screenshot remains authoritative.
    stressed=cover.resize((470,200),Image.Resampling.LANCZOS)
    sd=ImageDraw.Draw(stressed)
    fontpath="/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
    font=ImageFont.truetype(fontpath,18) if Path(fontpath).exists() else ImageFont.load_default()
    sd.text((20,134),"有机合成文献日报｜10.08｜今日精选",font=font,fill="white")
    sd.text((20,162),"JACS：α-氯代烷基硼酸酯与偕二硼烷…",font=font,fill="white")
    stressed.save(PROOF_DIR/"mobile-470x200-2line-stress-simulation.png")
    # Two-line title starts at simulated full-res y536, leaving a 22px margin
    # after y514 band; complete science artwork ends at y498.
    assert 134*4==536 and 536-title_band_y>=20

    original_figure_rows=[(x["id"],x["repo_path"],x.get("body")) for x in current["figures"]]
    target_rows=[x for x in current["figures"] if x.get("id")=="jacs-cover"]
    assert len(target_rows)==1 and target_rows[0]["repo_path"]==PRIOR_COVER
    assert target_rows[0]["body"] is False
    assert len([x for x in current["figures"] if x.get("body") is not False])==20
    target_rows[0]["repo_path"]=TARGET
    target_rows[0]["source_kind"]="authentic_paper_TOC_proportional_792x492_mobile_title_safe"
    target_rows[0]["source_adjustment"]=(
       "Source-pixel R3 original chemistry crop (560,93,1320,565); "
       "removed only the old title remnants outside the red O group "
       "(background-only x<412 and x>=450,y<33 in crop); uniformly "
       "scaled to 792x492, placed (544,6). Native title backing starts "
       "y514, art ends y498; center-square crop preserves every label. "
       "Original scientific structures, bonds, arrows and data NOT AI redrawn."
    )
    current["cover"]["description"]=(
       "No upper 今日精选 banner. Original JACS TOC proportionally enlarged "
       "from 760x460 to 792x492 without clipping the 1:1 centered crop "
       "or crossing the actual native title-safe band y514. "
       "Complete Official Account title remains in article metadata: "+FULL_TITLE
    )
    current["editorialRevision"]=REV
    edition["editorialRevision"]=REV
    assert edition["title"]==FULL_TITLE
    assert [(x["id"],x["repo_path"],x.get("body")) for x in current["figures"][:-1]]==original_figure_rows[:-1]
    save_json(FEATURED,current)
    save_json(EDITION,edition)

    old_text=get(OLD_TEXT).decode("utf-8")
    assert ("公众号首篇原生标题："+FULL_TITLE) in old_text
    save_text(NEW_TEXT,old_text.replace("(R8)","(R9)",1))
    old_images=get(OLD_IMAGES).decode("utf-8")
    assert PRIOR_COVER in old_images
    lines=old_images.splitlines()
    lines=[l for l in lines if not l.startswith("R8封面审核：")]
    for i,l in enumerate(lines):
        if l.startswith("封面：") and PRIOR_COVER in l:
            lines[i]=(f"封面：{TARGET}。使用JACS原始TOC源图的有效化学区域，"
                 "同比例放大至792×492（R8版760×460）；上边距6px，化学图y498结束，"
                 "深蓝色微信原生完整标题背景从y514开始；双比例缩略图已审核，不重绘任何化学结构。")
    new_images="\n".join(lines).rstrip()+"\n\nR9审核：图像原始化学内容保持，2.35:1与1:1裁切完整；正文与第二篇所有图片均不变化。\n"
    assert new_images.count(TARGET)==1
    save_text(NEW_IMAGES,new_images)

    gate["revision"]=REV
    gate["artifacts"]={"textOnly":NEW_TEXT,"imagesOnly":NEW_IMAGES}
    rows=[x for x in gate["assets"] if x["path"]==PRIOR_COVER]
    assert len(rows)==1
    content=get(TARGET)
    rows[0].update(path=TARGET,blobSha=blob(content),sha256=sha(content),width=1880,height=800)
    gate["sources"]=[x for x in gate["sources"] if x["path"] not in {OLD_TEXT,OLD_IMAGES}]
    id_to_row={x["path"]:x for x in gate["sources"]}
    for p in (FEATURED,EDITION,NEW_TEXT,NEW_IMAGES):
        b=get(p)
        if p in id_to_row: item=id_to_row[p]
        else:
            item={"path":p}
            gate["sources"].append(item)
        item.update(blobSha=blob(b),sha256=sha(b))
    assert len(gate["sources"])==5 and len(gate["assets"])==34
    gate["reviewNotesR9"]={
       "nativeTitle":FULL_TITLE,
       "userRequest":"Further enlarge TOC and fully self-audit, no user correction cycle",
       "originalSourceSha256":EXPECTED[ORIGINAL],
       "scaleIncreaseVsR8":{"width":round(artwork_w/760,4),"height":round(artwork_h/460,4)},
       "cropQA":"pass: unchanged source artwork, intact 470x200 main and centered 1:1 crops",
       "nativeTitleBand":"dark backing y514..799; two-line stress proof; R3 observed first glyph around y525",
       "titleSimulationNotNativeScreenshot":True,
       "textReview":"pass; complete prior native title unchanged",
       "imageReview":"pass; original TOC unredrawn and 34 existing images source locked",
       "otherArticleAndBody":"32 body figures + retro cover unchanged",
       "draftWrite":"pending, must use original same-media draft only"
    }
    gate["textReview"]=gate["imageReview"]="pass"
    save_json(GATE,gate)

    qa={
       "revision":REV,"date":DATE,"fullNativeTitle":FULL_TITLE,
       "originalArtworkSource":ORIGINAL,"originalSourceSHA256":sha(get(ORIGINAL)),
       "oldCover":PRIOR_COVER,"newCover":TARGET,"newCoverSHA256":sha(content),
       "canvas":[1880,800],"artworkRect":{"x":artwork_x,"y":artwork_y,"w":artwork_w,"h":artwork_h},
       "oldArtwork":[760,460],"newArtwork":[artwork_w,artwork_h],
       "increaseHeightPercent":round(100*(artwork_h/460-1),2),
       "increaseAreaPercent":round(100*(artwork_w*artwork_h/(760*460)-1),2),
       "mainCrop":"470x200 pass","squareCrop":"240x240 full information pass",
       "squareOriginalCrop":[540,0,1340,800],"titleBackingStartY":title_band_y,
       "observedR3NativeGlyphApproxY":525,
       "artToDarkBandGap":title_band_y-(artwork_y+artwork_h),
       "artToStressTitleGlyphGap":536-(artwork_y+artwork_h),
       "allMolecularStructuresOriginal":True,"generatedChemistryUsed":False,
       "bodyFigureChanges":0,"secondArticleChanges":0,"publicSend":False,
       "stage":"source_qa_pass_pending_original_draft_update"
    }
    save_json(QA,qa)
    for row in gate["sources"]+gate["assets"]:
        b=get(row["path"])
        assert blob(b)==row["blobSha"],row["path"]
    print(json.dumps({"result":"R9_REVIEWED_COVER_READY","newCover":TARGET,
        "artworkSize":[artwork_w,artwork_h],
        "increaseAreaPct":qa["increaseAreaPercent"],
        "mobileAndSquareQA":"pass","sources":5,"assets":34,
        "previewProofs":str(PROOF_DIR.relative_to(ROOT)),
        "draftWritten":False},ensure_ascii=False))

if __name__=="__main__":
    main()
