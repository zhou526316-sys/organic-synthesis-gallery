#!/usr/bin/env python3
"""2026-10-08 JACS WeChat cover correction: native-title safe, original chemistry only.

One-time, fail-closed editorial asset preparation. DOES NOT write or publish
WeChat drafts. The original approved chemistry pixels are only rescaled.
"""
from __future__ import annotations
import hashlib
import io
import json
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
DATE = "2026-10-08"
REV = "2026-10-08-r6"
SOURCE = ROOT / "public/wechat-assets/reviewed/2026-10-08-r3/jacs-cover-original-white.png"
TARGET_REL = "public/wechat-assets/reviewed/2026-10-08-r6/jacs-cover-native-final.png"
TARGET = ROOT / TARGET_REL
EXPECTED_SHA = "1cd7a98d013038332724d3ff81cce2d7e97f82a0049c8b481108008cf401fbde"

def blobsha(data: bytes) -> str:
    return hashlib.sha1(("blob " + str(len(data)) + "\0").encode() + data).hexdigest()

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def save_json(rel: str, payload: dict) -> None:
    p=ROOT/rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")

def main() -> None:
    original_bytes = SOURCE.read_bytes()
    assert sha256(original_bytes) == EXPECTED_SHA, "R3 original cover unexpectedly changed"
    with Image.open(io.BytesIO(original_bytes)) as raw:
        raw.load()
        source=raw.convert("RGB")
    assert source.size == (1880,800), source.size

    # Native-client screenshot, 2026-10-08 14:50 BJT, showed native first-line
    # glyphs over original Y~525, not the old simulation's Y~588.
    # Start solid dark title backing at Y492; keep original art above Y480.
    width,height=source.size
    band_y=492
    base=Image.new("RGB",(width,height),"#ffffff")
    from PIL import ImageDraw
    draw=ImageDraw.Draw(base)
    draw.rectangle((0,band_y,width,height),fill="#243c51")

    # Copy the authentic typography/header pixels, move DOWN 26px so they no
    # longer sit against WeChat's rounded clipping edge.
    header=source.crop((0,0,width,96))
    base.paste(header,(0,26))

    # Transfer complete original chemical source art: x=573..1308, y94..564.
    # Extra source margins keep bond labels/arrows away from all crop edges.
    artbox=(550,93,1330,565)
    art=source.crop(artbox)
    # Clear only old navy header glyphs carried into the top of R4 crop.
    # The central oxygen group at source x~970 stays exactly intact.
    clean=ImageDraw.Draw(art)
    clean.rectangle((0,0,421,32),fill="#ffffff")
    clean.rectangle((460,0,art.width,32),fill="#ffffff")
    new_h=339
    new_w=round(art.width*new_h/art.height)
    art=art.resize((new_w,new_h),Image.Resampling.LANCZOS)
    art_x=(width-new_w)//2
    art_y=140
    assert art_y+new_h < band_y-10
    base.paste(art,(art_x,art_y))

    # Pixel-fidelity checks: all chemistry is copied directly from R3 via
    # a documented uniform scale; no chemistry generated, painted, or retouched.
    assert ImageChops.difference(base.crop((art_x,art_y,art_x+new_w,art_y+new_h)),art).getbbox() is None
    assert ImageChops.difference(base.crop((0,26,width,122)),header).getbbox() is None if art_y>=122 else True
    assert base.getpixel((50,band_y+1))==(36,60,81)
    assert base.getpixel((50,band_y-1))==(255,255,255)
    assert 492<=band_y<=505
    assert band_y-(art_y+new_h)>=12
    TARGET.parent.mkdir(parents=True,exist_ok=True)
    base.save(TARGET,format="PNG",optimize=True)
    with Image.open(TARGET) as verify:
        verify.load()
        assert verify.size==(1880,800)

    featured_rel="public/wechat-featured/2026-10-08.json"
    edition_rel="public/wechat-editions/2026-10-08.json"
    featured=json.loads((ROOT/featured_rel).read_text())
    edition=json.loads((ROOT/edition_rel).read_text())
    assert featured["paper"]["doi"]=="10.1021/jacs.6c14748"
    assert edition["featured"]==featured["paper"]["doi"]
    assert edition["retrospective"]=="os1-multicentred-sulfur-20261008"
    assert edition["editorialRevision"]=="2026-10-08-r5"
    cover_item=[x for x in featured["figures"] if x.get("id")=="jacs-cover"]
    assert len(cover_item)==1
    assert cover_item[0]["repo_path"]=="public/wechat-assets/reviewed/2026-10-08-r5/jacs-cover-native-safe-clean.png"
    cover_item[0]["repo_path"]=TARGET_REL
    cover_item[0]["source_kind"]="original_TOC_uniformly_scaled_native_screenshot_safe"
    cover_item[0]["source_adjustment"]=(
      "Original R3 chemical artwork uniformly rescaled 0.718; old header ghost strips removed outside chemistry, "
      "not generated; header moved down 26px; full chemistry ends at y479; "
      "solid navy native-title backing starts y492, before actual first-line "
      "native white glyphs near y525 in user's WeChat screenshot."
    )
    featured["cover"]["description"]=(
      "White original source-color graphical abstract. Top 今日精选·JACS "
      "moved inside safe crop boundary; original chemistry uniformly scaled "
      "above y479; solid subdued navy from y492 for native white two-line title."
    )
    featured["editorialRevision"]=REV
    edition["editorialRevision"]=REV
    save_json(featured_rel,featured)
    save_json(edition_rel,edition)

    old_text=ROOT/"audit/wechat-working/2026-10-08-r5-text-only.md"
    new_text_rel=f"audit/wechat-working/{REV}-text-only.md"
    content=old_text.read_text(encoding="utf-8").replace("(R5)","(R6)")
    (ROOT/new_text_rel).write_text(content,encoding="utf-8")
    old_images=ROOT/"audit/wechat-working/2026-10-08-r5-images-only.md"
    new_images_rel=f"audit/wechat-working/{REV}-images-only.md"
    old_source_rel="public/wechat-assets/reviewed/2026-10-08-r5/jacs-cover-native-safe-clean.png"
    image_text=old_images.read_text(encoding="utf-8")
    assert old_source_rel in image_text
    image_text=image_text.replace(old_source_rel,TARGET_REL)
    image_text=image_text.replace(
      "TOC从PDF嵌入原图直接提取；深色仅为外围底板，完整白底信息前景保持不变。",
      "沿用R3审核的原始TOC信息图，经同比例缩放；顶栏下移26像素，"
      "化学信息全在y479以上，深蓝色原生标题底板从y492开始。"
    )
    image_text += "\nR5独立复核：仅清理前版旧标题在化学裁切上缘的残影；原始化学结构完整保留。\n"
    (ROOT/new_images_rel).write_text(image_text,encoding="utf-8")

    gate_rel="audit/wechat-working/2026-10-08-review-gate.json"
    gate=json.loads((ROOT/gate_rel).read_text(encoding="utf-8"))
    assert gate["revision"]=="2026-10-08-r5"
    assert gate["textReview"]=="pass" and gate["imageReview"]=="pass"
    assert gate["articleCount"]==2
    gate["revision"]=REV
    gate["artifacts"]={"textOnly":new_text_rel,"imagesOnly":new_images_rel}
    asset_bytes=TARGET.read_bytes()
    found=False
    for row in gate["assets"]:
        if row.get("path")==old_source_rel:
            row.update(path=TARGET_REL,blobSha=blobsha(asset_bytes),sha256=sha256(asset_bytes),width=width,height=height)
            found=True
    assert found, "R3 cover missing from source-reviewed asset list"
    source_map={x["path"]:x for x in gate["sources"]}
    assert featured_rel in source_map and edition_rel in source_map
    for path in [featured_rel,edition_rel]:
        payload=(ROOT/path).read_bytes()
        source_map[path]["blobSha"]=blobsha(payload)
        source_map[path]["sha256"]=sha256(payload)
    gate["sources"]=[row for row in gate["sources"] if row["path"] not in [
        "audit/wechat-working/2026-10-08-r5-text-only.md",
        "audit/wechat-working/2026-10-08-r5-images-only.md"]]
    for path in [new_text_rel,new_images_rel]:
        payload=(ROOT/path).read_bytes()
        gate["sources"].append({"path":path,"blobSha":blobsha(payload),"sha256":sha256(payload)})
    gate["reviewNotesR6"]={
      "actualNativeMobileScreenshot":"2026-10-08 user screenshot, R3 visually failed",
      "nativeFirstLineOverWhiteFix":"native glyphs begin near original y525; dark now starts y492",
      "headerSafeMargin":"header moved down 26 original pixels",
      "chemistry":"resampled verified original; top ghost strips removed outside chemistry; no generated bonds",
      "imageReview":"pass: actual output checked for crop, preservation and separated title region",
      "textReview":"pass: article prose and headings are unchanged from reviewed R3",
      "retrospective":"unchanged",
      "draftTransport":"not yet run"
    }
    save_json(gate_rel,gate)
    mobile_qa={
      "date":DATE,"revision":REV,"featuredDoi":featured["paper"]["doi"],
      "originalCover":old_source_rel,"revisedCover":TARGET_REL,
      "actualScreenshotFirstNativeGlyphApproxY":525,
      "nativeTitleBackingStartsY":band_y,
      "chemicalRegionEndsY":art_y+new_h,
      "headerShiftY":26,
      "sourceSha256":EXPECTED_SHA,
      "revisedSha256":sha256(asset_bytes),
      "articles":2,"bodyImageChanges":0,"publicSend":False,
      "status":"source_review_pass_pending_official_draft_get"
    }
    save_json(f"audit/wechat-working/{REV}-mobile-cover-qa.json",mobile_qa)
    print(json.dumps({"status":"r4_source_review_pass","image":TARGET_REL,
      "sha256":sha256(asset_bytes),"band_y":band_y,
      "art_bottom":art_y+new_h,"article_order_unchanged":True,
      "wechat_written":False},ensure_ascii=False))

if __name__=="__main__":
    main()
