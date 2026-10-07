#!/usr/bin/env python3
"""R17 source/actual-preview review. Artifacts only; no WeChat API or Git writes.

Request action: source_preview_only or verify_actual_draft_readonly.
Actual mode additionally requires receiptTimestamp/previewUrl/mediaId and a
matching, reviewed gate.finalSourcePreview sourceSnapshot from source mode.

Cover layout checks concern only our explicitly labelled relay layout demonstration.
The full title remains in the draft and article; CSS limits the demonstration
card to two visible lines. This does not verify any native WeChat client layout.
Native reference checks project the unchanged R16 artwork geometry onto the user's observed R15
screenshot; they do not represent a newly captured native R17 screenshot.
R17 only removes the requested basic quenching-cycle background and ncx1.
"""
from __future__ import annotations

import hashlib
import html
import importlib.util
import io
import json
import os
import re
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
REVISION = "2026-10-07-r17"
SLOT = "2026-10-07T08:00:00+08:00"
OUT = ROOT / "r17-review"
REQUEST = ROOT / "audit/automation-triggers/wechat-r17-review.json"
GATE = ROOT / "audit/wechat-working/2026-10-07-review-gate.json"
NATIVE_REFERENCE = ROOT / "audit/wechat-working/2026-10-07-r17-native-cover-reference.json"
COVER_SOURCE_REVIEW = ROOT / "audit/wechat-working/2026-10-07-r17-source-review.json"
PATHS = {
    "angew": "public/wechat-featured/2026-10-07.json",
    "natcat": "public/wechat-retrospective/phoenix1-structural-regeneration.json",
}
DOIS = {"angew": "10.1002/anie.3699223", "natcat": "10.1038/s41929-026-01593-w"}
CONCEPTS = ("ncx2", "ncx3")
EXPECTED_BODY_FIGURES = {"angew": 14, "natcat": 18}
EXPECTED_ASSET_COUNT = 34
VIEWPORTS = (390, 690)
MIN_CONCEPT_WIDTH = 1200
# The actual R12 draft/get image service returns 1080 px body renditions from
# the pinned 2000 px masters (observed run 37583473584). Keep source quality
# separate from provider transport dimensions; visual inspection is mandatory.
MIN_ACTUAL_CONCEPT_WIDTH = 1080
# Geometry of our labelled cover layout demonstration, not native client UI.
BLUE_BAND_START = None  # Loaded from the locked native-reference geometry at run time.
MIN_TITLE_CLEARANCE_PX = 4
COVER_IMAGE_BYTES = {}

# Deletion request: one shallow quenching-cycle section and its sole figure.
# Preserve original image IDs for the two retained concepts; displayed numbering
# follows the new order. The old files may remain in historical revisions.
REMOVED_SECTION_TEXTS = ['补充背景：常规光氧化还原怎样传递电子', '先把前文原文 Fig. 1a–b中的两类淬灭循环说清楚。以下用初始电中性的光催化剂PC、电子给体D和电子受体A作简化记号；实际带电催化剂应相应调整电荷。“氧化淬灭/还原淬灭”说的是激发态催化剂在首次电子转移中被氧化还是被还原，并不是直接按最终产物被氧化或还原命名。', '氧化淬灭：PC*把电子交给A，形成PC•⁺与A•⁻；随后D向PC•⁺供电子，使催化剂回到PC。还原淬灭：PC*先从D接受电子，形成PC•⁻与D•⁺；再由PC•⁻把电子交给A并恢复PC。两种路径都能把供电子端与受电子端接入循环，但先被活化的伙伴和承担后续转移的催化剂状态不同。自制拓展图1（Fig. E1）将两条路径并列，橙色文字标出每一步电子的去向。', '前文原文 Fig. 1c讨论的连续光诱导电子转移（conPET）进一步让还原后的催化剂再次吸光，以获得更强的分子光还原能力；这仍不能仅凭“两次吸光”判断是否生成了溶剂化电子。能量转移主要传递激发能，不等于净电子转移；质子耦合电子转移（PCET）则把质子与电子过程耦合。不能把不同活化模式都压缩成同一个SET箭头。', '这一背景有助于定位phoenix1的差别：作者不是简单给固定染料增加一个更强的激发态，而是提出先光电离、再由生成的5受光完成氧化端，最终通过结构重组再生。5*氧化底物2这一段仍属于分子间SET；本体系不是所有步骤都由溶剂化电子包办。', '自制拓展图1（Fig. E1）｜氧化淬灭与还原淬灭的简化循环。以初始电中性的PC、D、A为记号，逐步标出电子方向；依据原文 Fig. 1a–b及通用光氧化还原循环整理，不表示phoenix1的完整反应网络。']
REMOVED_ASSET_PATH = 'public/wechat-assets/reviewed/2026-10-07-r10/ncx1-quenching-cycles.png'
REMOVED_ACTUAL_URLS = ['https://mmbiz.qpic.cn/sz_mmbiz_png/uSicOxt5gIGyZeiccLA2u88vogbo27D29biabaBMqZ4kezhju070SHpj0Htkl0icwrMudzfywV3ouN42oWL0BpqekTEPTaH70KQDJQD2KzDBwzs/640?from=appmsg']
# Existing artwork is deliberately R16 (Angew) and R9 (NatCat), unchanged.
PRESERVED_COVERS = {'angew': {'path': 'public/wechat-assets/reviewed/2026-10-07-r16/an-cover-white-toc-fitted-band-r16.png', 'blobSha': '6772f53e606cfdbce3b7b0cccd905af490b483b0', 'sha256': '1c879631fe724bf8d84f36e1cb56aba2a2c023229e57d77fb123ae739d6dfa4d', 'width': 1880, 'height': 800}, 'natcat': {'path': 'public/wechat-assets/reviewed/2026-10-07-r9/nc-cover-full-r9.png', 'blobSha': '55517a90d817e52580e2a662fe70dab2a06ab2c3', 'sha256': '9fde3dd169ea4fdee9f494f097d89c965715752033d0ffded2b95b28ca50484f', 'width': 1334, 'height': 1334}}
CONCEPT_CAPTION_PREFIXES = {"ncx2": "自制拓展图1（Fig. E1）", "ncx3": "自制拓展图2（Fig. E2）"}



def require(value, message):
    if not value:
        raise RuntimeError(message)


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def stamp():
    return datetime.now(timezone.utc).isoformat()


def norm(text):
    return re.sub(r"\s+", "", text)


def local(path):
    resolved = (ROOT / path).resolve()
    require(resolved.is_relative_to(ROOT.resolve()), "Path escapes repository: " + path)
    return resolved


def blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def removed_content_absent(text, sources=(), scope=""):
    """Reject the deleted text and old figure in source or returned HTML."""
    decoded = html.unescape(text)
    normalized = norm(decoded)
    for value in REMOVED_SECTION_TEXTS:
        require(norm(value) not in normalized, "Deleted content remains in " + scope + ": " + value[:90])
    forbidden_paths = [REMOVED_ASSET_PATH, Path(REMOVED_ASSET_PATH).name,
                       Path(REMOVED_ASSET_PATH).with_suffix(".svg").name]
    for path in forbidden_paths:
        require(path not in decoded, "Deleted figure source remains in " + scope + ": " + path)
    source_urls = [html.unescape(value) for value in sources]
    for old_url in REMOVED_ACTUAL_URLS:
        old_path = urlparse(old_url).path.rsplit("/", 1)[0]
        # Compare the opaque CDN asset path independently of query parameters.
        require(old_path not in decoded and all(not urlparse(value).path.startswith(old_path + "/") for value in source_urls),
                "Deleted ncx1 CDN image remains in " + scope)
    return {"status": "pass", "scope": scope, "removedHeading": REMOVED_SECTION_TEXTS[0],
            "removedFigureId": "ncx1", "sourcePathAbsent": True,
            "priorReturnedCdnImageAbsent": True, "allRemovedParagraphsAndCaptionAbsent": True}


def native_reference_checks():
    """Recheck unchanged R16 artwork geometry against the real R15 screenshot."""
    reference = read(NATIVE_REFERENCE)
    source_review = read(COVER_SOURCE_REVIEW)
    require(reference.get("observedRevision") == "r15", "Native reference is not the user-observed R15 screenshot")
    require(reference.get("masterSize") == [1880, 800], "Native-reference master size changed")
    require(re.fullmatch(r"[a-fA-F0-9]{64}", str(reference.get("referenceImageSha256", ""))),
            "Native reference must identify the observed screenshot by SHA256")
    require(isinstance(reference.get("scope"), str) and reference["scope"].strip(), "Native reference scope is missing")
    cover = reference.get("coverBounds")
    ink = reference.get("titleInkBounds")
    require(isinstance(cover, list) and len(cover) == 4 and isinstance(ink, list) and len(ink) == 4,
            "Native reference bounds must each contain four coordinates")
    require(all(isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) < 1000000
                for v in cover + ink), "Native reference has invalid coordinates")
    x, y, width, height = cover
    left, top, right, bottom = ink
    require(width > 0 and height > 0 and left < right and top < bottom,
            "Native reference bounds have empty dimensions")
    require(y <= top < bottom <= y + height, "Observed title ink is outside the measured cover")
    band_top = reference.get("blueBandMasterTop")
    minimum = reference.get("requiredNativeTopClearancePx")
    require(isinstance(band_top, (int, float)) and not isinstance(band_top, bool)
            and 0 < band_top < 800, "Invalid blue band master top")
    require(isinstance(minimum, (int, float)) and not isinstance(minimum, bool)
            and 6 <= minimum < height, "Native projection must require at least 6px top clearance")
    ratio = band_top / reference["masterSize"][1]
    projected_band_top = y + height * ratio
    clearance = top - projected_band_top
    require(clearance >= minimum,
            f"R17 projection onto observed R15 geometry lacks {minimum}px clearance: {clearance:.3f}px")
    require(source_review.get("revision") == REVISION, "Cover source review revision mismatch")
    toc = source_review.get("tocBounds")
    band = source_review.get("blueTitleBand")
    require(isinstance(toc, list) and len(toc) == 4 and isinstance(band, list) and len(band) == 4,
            "Cover source review lacks TOC/blue-band rectangle bounds")
    require(all(isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) < 1000000
                for v in toc + band), "Cover source review has invalid coordinates")
    require(0 <= toc[0] < toc[2] <= 1880 and 0 <= toc[1] < toc[3] <= 800,
            "TOC lies outside the master image")
    require(band[0] == 0 and band[2:] == [1880, 800] and abs(band[1] - band_top) < 0.001,
            "Source blue band differs from the reference projection geometry")
    require(toc[3] < band[1], "TOC bottom touches or crosses the blue title band")
    return {"status": "pass", "observedRevision": "r15", "projectedRevision": REVISION,
            "referenceImageSha256": reference["referenceImageSha256"],
            "referenceFile": str(NATIVE_REFERENCE.relative_to(ROOT)),
            "referenceScope": reference["scope"], "masterSize": reference["masterSize"],
            "coverBounds": cover, "titleInkBounds": ink,
            "blueBandMasterTop": band_top, "blueBandStartRatio": ratio,
            "projectedBlueBandTopInReferencePx": projected_band_top,
            "projectedNativeTopClearancePx": clearance,
            "requiredNativeTopClearancePx": minimum,
            "tocBounds": toc, "blueTitleBand": band,
            "tocBlueBandGapMasterPx": band[1] - toc[3],
            "nativeClientVerified": False, "nativeR16ScreenshotCaptured": False, "nativeR17ScreenshotCaptured": False,
            "coverArtworkRevision": "2026-10-07-r16",
            "scope": "Unchanged R16 cover artwork geometry, verified for R17 and projected onto the user's real observed R15 screenshot; this is not a newly captured R17 native-client screenshot or validation of native-client CSS. Relay two-line CSS checks remain a separate web demonstration."}


def verify_locks(gate, manifests):
    require(gate.get("editorialRevision") == REVISION, "Wrong gate revision")
    require(gate.get("textReview") == "pass", "Source text review is not pass")
    source_paths = {row["path"] for row in gate.get("sources", [])}
    require(set(PATHS.values()) | {"public/wechat-editions/2026-10-07.json"} <= source_paths,
            "Gate is missing a required source")
    for row in gate["sources"]:
        require(blob(local(row["path"]).read_bytes()) == row["blobSha"], "Source hash mismatch: " + row["path"])
    assets = {row["path"]: row for row in gate.get("assets", [])}
    require(len(assets) == EXPECTED_ASSET_COUNT and len(gate.get("assets", [])) == EXPECTED_ASSET_COUNT,
            f"Expected exactly {EXPECTED_ASSET_COUNT} uniquely locked assets")
    require(REMOVED_ASSET_PATH not in assets, "Deleted ncx1 remains in current asset locks")
    for row in assets.values():
        path = local(row["path"])
        data = path.read_bytes()
        require(blob(data) == row["blobSha"], "Asset blob mismatch: " + row["path"])
        require(hashlib.sha256(data).hexdigest() == row["sha256"], "Asset SHA256 mismatch: " + row["path"])
        with Image.open(path) as image:
            image.load()
            require(list(image.size) == [row["width"], row["height"]], "Asset dimensions changed: " + row["path"])
    for label, manifest in manifests.items():
        require(manifest.get("editorialRevision") == REVISION, "Wrong source revision: " + label)
        require(manifest["paper"]["doi"].lower() == DOIS[label], "Wrong DOI: " + label)
        require(len(body_figures(manifest)) == EXPECTED_BODY_FIGURES[label],
                "Unexpected source body figure count: " + label)
        ids = [f["id"] for f in manifest["figures"]]
        require(len(ids) == len(set(ids)), "Duplicate figure IDs: " + label)
        for figure in manifest["figures"]:
            require(figure.get("repo_path") in assets, "Unpinned figure: " + figure["id"])
        require(manifest["cover"]["source_figure_id"] in ids, "Missing cover: " + label)
        cover = next(f for f in manifest["figures"] if f["id"] == manifest["cover"]["source_figure_id"])
        preserved = PRESERVED_COVERS[label]
        require(cover["repo_path"] == preserved["path"], "Cover path changed in deletion-only edit: " + label)
        require(all(assets[preserved["path"]].get(key) == preserved[key]
                    for key in ("blobSha", "sha256", "width", "height")),
                "Cover bytes or dimensions changed in deletion-only edit: " + label)
    natcat = manifests["natcat"]
    require(set(CONCEPTS) <= {f["id"] for f in body_figures(natcat)}, "Missing required concept figures")
    require("ncx1" not in {f["id"] for f in natcat["figures"]}, "Removed figure ID remains in manifest")
    removed_content_absent(json.dumps(natcat, ensure_ascii=False), scope="NatCat source manifest")
    for figure in body_figures(natcat):
        if figure["id"] in CONCEPT_CAPTION_PREFIXES:
            require(figure["caption"].startswith(CONCEPT_CAPTION_PREFIXES[figure["id"]]),
                    "Retained concept caption numbering is stale: " + figure["id"])
    displayed = "\n".join([p for section in natcat["sections"] for p in section.get("paragraphs", [])]
                           + [f["caption"] for f in body_figures(natcat)])
    require("自制拓展图3" not in displayed and "Fig. E3" not in displayed,
            "Deleted concept left stale displayed E3 numbering")
    pinned = {"sources": sorted(gate["sources"], key=lambda x: x["path"]),
              "assets": sorted(gate["assets"], key=lambda x: x["path"]),
              "publisherBlobSha": blob(local("ops/wechat-publisher/create-draft.py").read_bytes()),
              "nativeReferenceBlobSha": blob(NATIVE_REFERENCE.read_bytes()),
              "coverGeometry": {key: read(COVER_SOURCE_REVIEW).get(key)
                                for key in ("revision", "tocBounds", "blueTitleBand")}}
    return hashlib.sha256(json.dumps(pinned, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def body_figures(manifest):
    return [f for f in manifest["figures"] if f.get("body") is not False]


class ImageSources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        if tag == "img":
            self.sources.append(dict(attrs).get("src", ""))


def publisher_module():
    spec = importlib.util.spec_from_file_location("r17_publisher", ROOT / "ops/wechat-publisher/create-draft.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_documents(manifests):
    publisher = publisher_module()
    slot, papers = publisher.load_latest_release()
    require(slot == SLOT, "Release slot changed; stop source review")
    documents = {}
    edition_title = read(ROOT / "public/wechat-editions/2026-10-07.json")["title"]
    for label, manifest in manifests.items():
        urls = {f["id"]: local(f["repo_path"]).as_uri() for f in manifest["figures"]}
        content = (publisher.build_content(slot, papers, manifest, urls) if label == "angew"
                   else publisher.build_retrospective_content(manifest, urls))
        for section in manifest["sections"]:
            for paragraph in section.get("paragraphs", []):
                require(html.escape(paragraph, quote=True) in content, "Renderer dropped paragraph: " + section["heading"])
        parser = ImageSources()
        parser.feed(content)
        if label == "natcat":
            removed_content_absent(content, parser.sources, scope="NatCat source HTML")
        expected = [urls[f["id"]] for f in body_figures(manifest)]
        require(sorted(parser.sources) == sorted(expected), "Renderer body figure set mismatch: " + label)
        cover_url = urls[manifest["cover"]["source_figure_id"]]
        escaped_title = html.escape(edition_title, quote=True)
        cover_markup = ('<div class="cover-frame" aria-label="' + escaped_title + '" title="' + escaped_title + '">'
                        '<img id="source-cover" src="' + cover_url + '">'
                        '<b class="cover-title">' + escaped_title + '</b></div>'
                        '<h1 id="source-edition-title">' + escaped_title + '</h1>' if label == "angew" else
                        '<img id="source-cover" src="' + cover_url + '">')
        doc = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
               '<meta name="viewport" content="width=device-width,initial-scale=1">'
               '<style>*{box-sizing:border-box}body{margin:0;background:#fff;font-family:"Noto Sans CJK SC",sans-serif}'
               'main{max-width:677px;margin:auto;padding:20px 17px}img{max-width:100%;height:auto}p{overflow-wrap:anywhere}'
               '.cover-frame{position:relative;container-type:inline-size;width:100%;overflow:hidden}'
               '.cover-frame>img{display:block;width:100%;aspect-ratio:2.35/1;object-fit:cover}'
               '.cover-title{position:absolute;left:3.5%;right:3.5%;bottom:1.5%;color:#fff;'
               'font-family:"Noto Sans CJK SC",Arial,sans-serif;font-size:4.4198895cqw;line-height:1.0625;'
               'font-weight:500;max-height:2.125em;display:-webkit-box;-webkit-box-orient:vertical;'
               '-webkit-line-clamp:2;overflow:hidden;word-break:break-all;margin:0;padding:0}'
               '</style><main><p>INTERNAL SOURCE REVIEW — NOT A WECHAT DRAFT</p><p>封面排版示意</p>'
               + cover_markup + '<article id="source-article">' + content + '</article></main></html>')
        path = OUT / (label + ".html")
        path.write_text(doc, encoding="utf-8")
        documents[label] = path
    return documents


def settled(page):
    page.evaluate("document.fonts.ready")
    page.wait_for_function("Array.from(document.images).every(i=>i.complete)", timeout=20000)


def dimensions(locator):
    return locator.evaluate_all("""a => a.map(i=>({src:i.currentSrc||i.src,
        naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,
        loaded:i.complete&&i.naturalWidth>0,displayWidth:i.getBoundingClientRect().width}))""")


def at_top(page, locator):
    locator.scroll_into_view_if_needed()
    # The actual preview inherits scroll-behavior:smooth. An explicit instant
    # scroll avoids capturing a transitional viewport in the review artifact.
    locator.evaluate("el=>window.scrollTo({top:window.scrollY+el.getBoundingClientRect().top-20,behavior:'instant'})")


def caption_image(article, figure):
    caption = article.get_by_text(figure["caption"], exact=True)
    require(caption.count() == 1, "Figure caption is not unique: " + figure["id"])
    # WeChat may wrap the caption text in a span, or the image in a p/link.
    # Bind to its nearest caption paragraph and its immediately preceding
    # sibling only, so a distant image cannot satisfy adjacency accidentally.
    paragraph = caption.locator("xpath=ancestor-or-self::*[self::p or self::figcaption][1]")
    require(paragraph.count() == 1, "Figure caption lacks paragraph: " + figure["id"])
    image = paragraph.locator("xpath=preceding-sibling::*[1][self::img] | preceding-sibling::*[1]//img")
    require(image.count() == 1, "Figure image/caption adjacency failed: " + figure["id"])
    return image


def check_article(page, article, manifest, label, width, actual):
    stored = norm(article.inner_text())
    missing = []
    for section in manifest["sections"]:
        if norm(section["heading"]) not in stored:
            missing.append(section["heading"] + " / heading")
        for paragraph in section.get("paragraphs", []):
            if norm(paragraph) not in stored:
                missing.append(section["heading"] + " / paragraph")
        for bullet in section.get("bullets", []):
            if norm(bullet) not in stored:
                missing.append(section["heading"] + " / bullet")
        for key in ("callout", "warning", "review"):
            if section.get(key) and norm(section[key]) not in stored:
                missing.append(section["heading"] + " / " + key)
    for index, point in enumerate(manifest.get("quick_points", []), start=1):
        for key in ("label", "text"):
            if point.get(key) and norm(point[key]) not in stored:
                missing.append(f"quick point {index} / {key}")
    for item in manifest.get("takehome", []):
        if norm(item) not in stored:
            missing.append("takehome")
    for key in ("headline", "ai_notice"):
        if manifest.get(key) and norm(manifest[key]) not in stored:
            missing.append(key)
    for figure in body_figures(manifest):
        require(bool(figure.get("caption")), "Missing source caption: " + figure["id"])
        if norm(figure["caption"]) not in stored:
            missing.append(figure["id"] + " / caption")
    require(not missing, "Missing actual/source text: " + json.dumps(missing, ensure_ascii=False))
    images = dimensions(article.locator("img"))
    deletion_check = (removed_content_absent(article.inner_text() + "\n" + article.inner_html(), [row["src"] for row in images],
                     scope=("actual" if actual else "source") + f" NatCat HTML at {width}px")
                     if label == "natcat" else None)
    expected = EXPECTED_BODY_FIGURES[label] + (1 if actual and label == "angew" else 0)
    require(len(images) == expected, f"{label}: expected {expected} images, found {len(images)}")
    require(all(x["loaded"] for x in images), "Broken body images: " + label)
    figures = [{"id": figure["id"], **dimensions(caption_image(article, figure))[0]}
               for figure in body_figures(manifest)]
    at_top(page, article)
    page.screenshot(path=str(OUT / f"{label}-{width}-opening.png"))
    concepts = []
    if label == "natcat":
        index = {f["id"]: f for f in body_figures(manifest)}
        for figure_id in CONCEPTS:
            figure = index[figure_id]
            image = caption_image(article, figure)
            row = dimensions(image)[0]
            image.screenshot(path=str(OUT / f"{figure_id}-{width}-image.png"))
            (OUT / f"{figure_id}-{width}-dimensions.json").write_text(json.dumps(row, ensure_ascii=False, indent=2))
            min_width = MIN_ACTUAL_CONCEPT_WIDTH if actual else MIN_CONCEPT_WIDTH
            require(row["loaded"] and row["naturalWidth"] >= min_width,
                    f"{figure_id}: naturalWidth {row['naturalWidth']} is below {min_width}")
            section = next((s for s in manifest["sections"] if figure_id in s.get("figures", [])
                            or any(figure_id in values for values in s.get("figures_after_paragraph", {}).values())), None)
            require(section is not None, "Concept has no section placement: " + figure_id)
            heading = article.get_by_role("heading", name=section["heading"], exact=True)
            at_top(page, heading)
            page.screenshot(path=str(OUT / f"{figure_id}-{width}-context.png"))
            # Capture the immediate explanatory paragraph as well as the
            # section heading, including cases where a section is long.
            before_figure = image.locator("xpath=ancestor::section[1]/preceding-sibling::*[1]")
            if before_figure.count() == 1:
                at_top(page, before_figure)
                page.screenshot(path=str(OUT / f"{figure_id}-{width}-adjacent.png"))
            concepts.append({"id": figure_id, **row})
    return {"article": label, "doi": manifest["paper"]["doi"], "viewportWidth": width,
            "allParagraphsAndCaptionsPresent": True, "expectedImages": expected,
            "loadedImages": len(images), "brokenImages": 0, "images": images,
            "figureImageMap": figures, "concepts": concepts, "deletedSectionChecks": deletion_check}


def title_glyph_diagnostic(frame, viewport):
    """Reveal actual glyph pixels on black, retaining layout and restoring styles.

    The frame screenshot includes glyphs outside the CSS line box. White-on-white
    pixels cannot disappear into the original cover background in this diagnostic.
    This checks the relay demonstration, never a native WeChat client.
    """
    snapshot_js = """el=>{
      const images=Array.from(el.querySelectorAll('img'));
      const title=el.querySelector('.cover-title');
      const origin=el.getBoundingClientRect();
      const nodes=[el,...images,title];
      return {inline:{frame:el.getAttribute('style'),images:images.map(i=>i.getAttribute('style')),title:title.getAttribute('style')},
        appearance:nodes.map(n=>{const s=getComputedStyle(n);return Object.fromEntries(Array.from(s).map(k=>[k,s.getPropertyValue(k)]));}),
        geometry:nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.x-origin.x,y:b.y-origin.y,width:b.width,height:b.height};})};
    }"""
    saved = frame.evaluate(snapshot_js)
    diagnostic_path = OUT / f"angew-title-glyph-mask-{viewport}.png"
    try:
        frame.evaluate("""el=>{
          el.style.background='#000';el.style.borderRadius='0';
          el.style.boxShadow='none';el.style.outline='none';
          for(const im of el.querySelectorAll('img'))im.style.visibility='hidden';
          const t=el.querySelector('.cover-title');
          t.style.color='#fff';t.style.background='transparent';
          t.style.textShadow='none';t.style.boxShadow='none';t.style.outline='none';
        }""")
        box = frame.bounding_box()
        require(box and box['width'] > 0 and box['height'] > 0, "Glyph diagnostic frame is invisible")
        frame.screenshot(path=str(diagnostic_path))
    finally:
        frame.evaluate("""(el,s)=>{
          const restore=(n,v)=>v===null?n.removeAttribute('style'):n.setAttribute('style',v);
          restore(el,s.frame);
          Array.from(el.querySelectorAll('img')).forEach((im,i)=>restore(im,s.images[i]));
          restore(el.querySelector('.cover-title'),s.title);
        }""", saved["inline"])
    restored = frame.evaluate(snapshot_js)
    # Attribute serialization may normalize absent style to an empty string.
    # Verify the real computed presentation and frame-relative geometry instead.
    style_differences = []
    for index, (before, after) in enumerate(zip(saved["appearance"], restored["appearance"])):
        for key in sorted(set(before) | set(after)):
            if before.get(key) != after.get(key):
                style_differences.append({"node": index, "property": key,
                                          "before": before.get(key), "after": after.get(key)})
                if len(style_differences) == 5:
                    break
        if len(style_differences) == 5:
            break
    require(restored["appearance"] == saved["appearance"],
            "Glyph diagnostic changed computed styles after restoration: " +
            json.dumps({"differences": style_differences,
                        "nodeCounts": [len(saved["appearance"]), len(restored["appearance"])]}, ensure_ascii=False))
    require(len(restored["geometry"]) == len(saved["geometry"]) and
            all(abs(after[key]-before[key]) <= .25
                for before,after in zip(saved["geometry"],restored["geometry"])
                for key in ("x","y","width","height")),
            "Glyph diagnostic changed geometry after restoration")
    def normalized_inline(row):
        return {"frame": row["frame"] or "", "images": [v or "" for v in row["images"]], "title": row["title"] or ""}
    inline_equal = normalized_inline(restored["inline"]) == normalized_inline(saved["inline"])
    with Image.open(diagnostic_path) as raster:
        pixel_width, pixel_height = raster.size
        mask = raster.convert('L').point(lambda value: 255 if value >= 32 else 0)
        # Whole-pixel screenshot bounds can include a partial page-background
        # edge. Exclude 1px; title insets keep actual glyphs away from that edge.
        interior_bounds = mask.crop((1, 1, pixel_width-1, pixel_height-1)).getbbox()
        bounds = tuple(value + 1 for value in interior_bounds) if interior_bounds else None
    require(bounds is not None, "Glyph diagnostic found no visible title pixels")
    scale_x, scale_y = pixel_width / box['width'], pixel_height / box['height']
    css_bounds = {'left': bounds[0] / scale_x, 'top': bounds[1] / scale_y,
                  'right': bounds[2] / scale_x, 'bottom': bounds[3] / scale_y}
    clearance = css_bounds['top'] - box['height'] * BLUE_BAND_START
    require(clearance >= 2, f"Actual title glyphs lack 2px blue-strip clearance: {clearance:.2f}px")
    return {'titleGlyphBounds': {'pixelBounds': list(bounds), 'cssBoundsRelativeToFrame': css_bounds},
            'titleGlyphClearancePx': clearance, 'highestGlyphPixelY': bounds[1],
            'minimumGlyphClearancePx': 2, 'threshold': 32, 'edgeGuardPixels': 1,
            'diagnosticImage': diagnostic_path.name, 'inlineStylesRestored': inline_equal,
            'computedStylesRestored': True, 'frameRelativeGeometryRestored': True,
            'inlineAttributeSerializationChanged': restored['inline'] != saved['inline'],
            'scope': 'Black-background full-frame diagnostic of this relay demonstration only; layout and title unchanged; not native WeChat client verification'}


def cover_layout_review(page, cover, viewport, actual):
    """Inspect our labelled two-line card, without claiming native-client proof.

    Actual mode reads the existing relay DOM without constructing a replacement
    overlay. Source mode inspects the same CSS in the local source document.
    Only presentation is clamped; title text, attributes and article h1 stay full.
    """
    title = read(ROOT / "public/wechat-editions/2026-10-07.json")["title"]
    require("封面排版示意" in page.locator("body").inner_text(), "Cover layout is not labelled as a demonstration")
    if actual:
        card = page.locator(".push-card-main")
        require(card.count() == 1, "Expected one main relay card")
        frame = card.locator(".cover-frame")
        article_title = page.locator(".article-block").first.locator("h1").first
    else:
        card = page.locator(".cover-frame")
        frame = card
        article_title = page.locator("#source-edition-title")
    require(frame.count() == 1, "Expected one cover frame")
    title_node = frame.locator(".cover-title")
    require(title_node.count() == 1, "Expected one cover title")
    require(title_node.text_content() == title, "Card title DOM no longer contains the full original title")
    require(article_title.count() == 1 and article_title.text_content() == title,
            "Article h1 no longer contains the full original title")
    for attribute in ("aria-label", "title"):
        require(any(node.get_attribute(attribute) == title for node in (card, frame, title_node)),
                "Full title missing from " + attribute + " attribute")
    frame_box = frame.bounding_box()
    image_box = cover.bounding_box()
    text_box = title_node.bounding_box()
    require(frame_box and image_box and text_box, "Cover layout has an invisible element")
    width, height = frame_box["width"], frame_box["height"]
    require(abs(height - width * 800 / 1880) <= 1, "Cover frame aspect ratio changed")
    require(all(abs(frame_box[k] - image_box[k]) <= 1 for k in ("x", "y", "width", "height")),
            "Cover image does not fill the cover frame")
    css = title_node.evaluate("""el=>{const s=getComputedStyle(el);return {
      color:s.color,fontSize:parseFloat(s.fontSize),lineHeight:parseFloat(s.lineHeight),
      maxHeight:parseFloat(s.maxHeight),lineClamp:s.getPropertyValue('-webkit-line-clamp'),
      overflow:s.overflow,wordBreak:s.wordBreak,display:s.display,
      clientHeight:el.clientHeight,scrollHeight:el.scrollHeight
    }}""")
    expected_font = width * 16 / 362
    expected_leading = expected_font * 17 / 16
    require(css["color"] in ("rgb(255, 255, 255)", "rgba(255, 255, 255, 1)"), "Cover title is not white")
    require(css["lineClamp"] == "2" and css["overflow"] == "hidden", "Demonstration title does not clamp to two visible lines")
    require(css["wordBreak"] == "break-all", "Demonstration title wrapping changed")
    require(abs(css["fontSize"] - expected_font) <= .2, "Demonstration title font scale changed")
    require(abs(css["lineHeight"] - expected_leading) <= .25, "Demonstration title line-height scale changed")
    require(abs(css["maxHeight"] - expected_leading * 2) <= .5, "Demonstration title max-height changed")
    require(text_box["height"] <= expected_leading * 2 + .5, "Demonstration title exceeds its two-line box")
    clearance = text_box["y"] - frame_box["y"] - height * BLUE_BAND_START
    bottom_clearance = frame_box["y"] + height - text_box["y"] - text_box["height"]
    require(clearance >= MIN_TITLE_CLEARANCE_PX, f"Demonstration title reaches above the blue strip: {clearance:.2f}px")
    require(bottom_clearance >= 0 and abs(bottom_clearance - height * .015) <= .75,
            "Demonstration title bottom inset changed")
    require(abs(text_box["x"] - frame_box["x"] - width * .035) <= .75
            and abs(text_box["width"] - width * .93) <= 1,
            "Demonstration title horizontal insets changed")
    # Read the image itself, not a screenshot that already includes the title.
    # These are read-only image GETs; no native client or WeChat API is called.
    src = cover.evaluate("i=>i.currentSrc||i.src")
    if actual:
        parsed = urlparse(src)
        require(parsed.scheme == "https" and parsed.hostname != "api.weixin.qq.com", "Unexpected cover image URL")
        if src not in COVER_IMAGE_BYTES:
            response = page.request.get(src, timeout=20000)
            require(response.ok, "Could not read returned cover image pixels")
            COVER_IMAGE_BYTES[src] = response.body()
        image_bytes = COVER_IMAGE_BYTES[src]
    else:
        manifest = read(ROOT / PATHS["angew"])
        source_id = manifest["cover"]["source_figure_id"]
        figure = next(f for f in manifest["figures"] if f["id"] == source_id)
        image_bytes = local(figure["repo_path"]).read_bytes()
    with Image.open(io.BytesIO(image_bytes)) as decoded:
        decoded.load()
        raster = decoded.convert("RGB")
    w, h = raster.size
    raster.save(OUT / f"angew-cover-source-pixels-{viewport}.png")
    margin = max(2, int(w * .035))
    dark = raster.crop((margin, int(h * BLUE_BAND_START) + 2, w-margin, h-2))
    def luminance(rgb):
        channels = [(v/255/12.92 if v/255 <= .04045 else ((v/255+.055)/1.055)**2.4) for v in rgb]
        return sum(a*b for a,b in zip(channels, (.2126,.7152,.0722)))
    worst = max(luminance(rgb) for rgb in dark.getdata())
    contrast = 1.05 / (worst + .05)
    require(contrast >= 7, f"White demonstration title contrast is insufficient: {contrast:.2f}:1")
    glyph_diagnostic = title_glyph_diagnostic(frame, viewport)
    # All original inline styles have been restored before the normal screenshot.
    frame.screenshot(path=str(OUT / f"angew-cover-layout-demonstration-{viewport}.png"))
    return [{"viewport": viewport, "scenario": "labelled relay cover layout demonstration",
             "fontSize": css["fontSize"], "lineHeight": css["lineHeight"],
             "titleClearancePx": clearance, "bottomClearancePx": bottom_clearance,
             "titleGlyphBounds": glyph_diagnostic["titleGlyphBounds"],
             "titleGlyphClearancePx": glyph_diagnostic["titleGlyphClearancePx"],
             "titleGlyphDiagnostic": glyph_diagnostic,
             "minimumWhiteContrast": contrast, "blueBandStartRatio": BLUE_BAND_START,
             "fullTitleDomVerified": True, "fullTitleAttributesVerified": True,
             "fullArticleTitleVerified": True, "renderedTitle": title,
             "visibleLineLimit": 2, "css": css,
             "coverFrameBounds": frame_box, "visibleTitleBounds": text_box,
             "coverImageSha256": hashlib.sha256(image_bytes).hexdigest(),
             "coverSource": "actual draft/get cover URL, fetched read-only" if actual else "locked source cover",
             "scope": "Our explicitly labelled relay card demonstration only; CSS limits visible text, not the full draft title; no native WeChat client layout claim"}]


def verify_receipt(request, gate, snapshot):
    receipt_path = ROOT / "audit/wechat-publisher/latest.json"
    receipt = read(receipt_path)
    require(receipt.get("generatedAt") == request.get("receiptTimestamp") and bool(request.get("receiptTimestamp")), "Receipt timestamp mismatch")
    require(receipt.get("draft_readback") == "ok" and receipt.get("status") == "ok", "Latest is not a verified successful draft")
    require(receipt.get("stage") in ("draft_update", "draft_create"), "Unexpected receipt stage")
    require(receipt.get("publicationSlot") == SLOT, "Receipt slot mismatch")
    require(receipt.get("media_id") == request.get("mediaId") and bool(request.get("mediaId")), "Media ID mismatch")
    require(receipt.get("preview_url") == request.get("previewUrl") and bool(request.get("previewUrl")), "Preview URL mismatch")
    require(re.fullmatch(r"https://relay\.gczhouwld\.com/wechat-preview/[a-f0-9]{24}\.html", request["previewUrl"]), "Unapproved actual preview URL")
    for key in ("textReview", "imageReview", "individualImageReview", "combinedVisualReview"):
        require(gate.get(key) == "pass", "Gate is not pass: " + key)
    preview = gate.get("finalSourcePreview", {})
    require(preview.get("status") == "pass" and preview.get("revision") == REVISION
            and preview.get("sourceSnapshot") == snapshot, "Missing or stale successful source preview")
    return receipt


def run():
    global BLUE_BAND_START
    native_checks = native_reference_checks()
    BLUE_BAND_START = native_checks["blueBandStartRatio"]
    request = read(REQUEST)
    require(request.get("revision") == REVISION, "Wrong request revision")
    action = request.get("action")
    require(action in ("source_preview_only", "verify_actual_draft_readonly"), "Unsupported action")
    actual = action == "verify_actual_draft_readonly"
    gate = read(GATE)
    manifests = {label: read(ROOT / path) for label, path in PATHS.items()}
    snapshot = verify_locks(gate, manifests)
    receipt = verify_receipt(request, gate, snapshot) if actual else None
    documents = {} if actual else source_documents(manifests)
    rows, covers, errors, overlays = [], [], [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get("CHROME_PATH", "/usr/bin/google-chrome"), args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 390, "height": 900}, device_scale_factor=1)
        page.set_default_timeout(12000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        # Only public read-only preview/image GETs are needed. Never let page code
        # mutate any endpoint or invoke the WeChat API.
        page.route("**/*", lambda route: route.continue_() if route.request.method in ("GET", "HEAD")
                   and "api.weixin.qq.com" not in route.request.url else route.abort())
        for width in VIEWPORTS:
            page.set_viewport_size({"width": width, "height": 900})
            if actual:
                response = page.goto(request["previewUrl"], wait_until="load", timeout=30000)
                require(response is not None and response.status == 200, "Actual preview HTTP failure")
                require(page.url == request["previewUrl"], "Preview redirected away from exact receipt URL")
                slug = request["previewUrl"].rsplit("/", 1)[1].removesuffix(".html")
                require("Preview source: WeChat draft/get. version hash: " + slug in page.content(),
                        "Actual page is missing matching draft/get provenance")
                settled(page)
                require(page.locator(".article-block").count() == 2, "Actual bundle must contain two articles")
                at_top(page, page.locator(".push-card").first)
                page.screenshot(path=str(OUT / f"actual-cards-{width}.png"))
                cover_rows = dimensions(page.locator(".push-card img"))
                require(len(cover_rows) == 2 and all(x["loaded"] for x in cover_rows), "Actual covers missing or broken")
                covers.append({"viewportWidth": width, "images": cover_rows})
                for i, label in enumerate(PATHS):
                    page.locator(".push-card img").nth(i).screenshot(path=str(OUT / f"{label}-cover-{width}.png"))
                    if label == "angew":
                        overlays.extend(cover_layout_review(page, page.locator(".push-card img").nth(i), width, True))
                    rows.append(check_article(page, page.locator(".article-block").nth(i), manifests[label], label, width, True))
                require(page.evaluate("document.documentElement.scrollWidth") <= width, "Actual page horizontal overflow")
            else:
                for label, path in documents.items():
                    page.goto(path.as_uri(), wait_until="load", timeout=20000)
                    settled(page)
                    cover_rows = dimensions(page.locator("#source-cover"))
                    require(len(cover_rows) == 1 and cover_rows[0]["loaded"], "Source cover missing or broken")
                    covers.append({"article": label, "viewportWidth": width, "images": cover_rows})
                    page.locator("#source-cover").screenshot(path=str(OUT / f"{label}-cover-{width}.png"))
                    page.screenshot(path=str(OUT / f"{label}-cover-opening-{width}.png"))
                    if label == "angew":
                        overlays.extend(cover_layout_review(page, page.locator("#source-cover"), width, False))
                    rows.append(check_article(page, page.locator("#source-article"), manifests[label], label, width, False))
                    require(page.evaluate("document.documentElement.scrollWidth") <= width, "Source horizontal overflow: " + label)
        browser.close()
    require(not errors, "Page JavaScript errors: " + json.dumps(errors))
    # Guard against local inputs being replaced during a run.
    require(verify_locks(read(GATE), {label: read(ROOT / path) for label, path in PATHS.items()}) == snapshot, "Sources changed during review")
    if actual:
        require(read(ROOT / "audit/wechat-publisher/latest.json") == receipt, "Receipt changed during review")
    return {"revision": REVISION, "action": action, "checkedAt": stamp(),
            "runId": os.environ.get("GITHUB_RUN_ID"), "commit": os.environ.get("GITHUB_SHA"),
            "status": "pass", "sourceSnapshot": snapshot, "sources": gate["sources"],
            "assetsVerified": len(gate["assets"]), "viewports": list(VIEWPORTS),
            "rows": rows, "covers": covers, "pageErrors": errors, "coverLayoutChecks": overlays,
            "nativeReferenceChecks": native_checks, "nativeClientVerified": False,
            "previewUrl": request.get("previewUrl"), "mediaId": request.get("mediaId"),
            "receiptTimestamp": request.get("receiptTimestamp"),
            "scope": "actual draft/get-derived read-only preview" if actual else "locked source preview only",
            "visualReview": "pending external screenshot review; never auto-approved",
            "draftWritten": False, "publisherTriggered": False, "repositoryWritten": False, "publicSend": False}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        result = run()
    except Exception as error:
        result = {"revision": REVISION, "checkedAt": stamp(), "runId": os.environ.get("GITHUB_RUN_ID"),
                  "status": "fail", "error": str(error), "visualReview": "not approved",
                  "draftWritten": False, "publisherTriggered": False, "repositoryWritten": False, "publicSend": False}
        (OUT / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    (OUT / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in ("rows", "covers")}, ensure_ascii=False))
