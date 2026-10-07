#!/usr/bin/env python3
"""R10 source/actual-preview review. Artifacts only; no WeChat API or Git writes.

Request action: source_preview_only or verify_actual_draft_readonly.
Actual mode additionally requires receiptTimestamp/previewUrl/mediaId and a
matching, reviewed gate.finalSourcePreview sourceSnapshot from source mode.
"""
from __future__ import annotations

import hashlib
import html
import importlib.util
import json
import os
import re
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
REVISION = "2026-10-07-r10"
SLOT = "2026-10-07T08:00:00+08:00"
OUT = ROOT / "r10-review"
REQUEST = ROOT / "audit/automation-triggers/wechat-r10-review.json"
GATE = ROOT / "audit/wechat-working/2026-10-07-review-gate.json"
PATHS = {
    "angew": "public/wechat-featured/2026-10-07.json",
    "natcat": "public/wechat-retrospective/phoenix1-structural-regeneration.json",
}
DOIS = {"angew": "10.1002/anie.3699223", "natcat": "10.1038/s41929-026-01593-w"}
CONCEPTS = ("ncx1", "ncx2", "ncx3")
VIEWPORTS = (390, 690)
MIN_CONCEPT_WIDTH = 1200
# The actual R10 draft/get image service returns 1080 px body renditions from
# the pinned 2000 px masters (observed run 37583473584). Keep source quality
# separate from provider transport dimensions; visual inspection is mandatory.
MIN_ACTUAL_CONCEPT_WIDTH = 1080


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


def verify_locks(gate, manifests):
    require(gate.get("editorialRevision") == REVISION, "Wrong gate revision")
    require(gate.get("textReview") == "pass", "Source text review is not pass")
    source_paths = {row["path"] for row in gate.get("sources", [])}
    require(set(PATHS.values()) | {"public/wechat-editions/2026-10-07.json"} <= source_paths,
            "Gate is missing a required source")
    for row in gate["sources"]:
        require(blob(local(row["path"]).read_bytes()) == row["blobSha"], "Source hash mismatch: " + row["path"])
    assets = {row["path"]: row for row in gate.get("assets", [])}
    require(bool(assets), "No locked assets")
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
        ids = [f["id"] for f in manifest["figures"]]
        require(len(ids) == len(set(ids)), "Duplicate figure IDs: " + label)
        for figure in manifest["figures"]:
            require(figure.get("repo_path") in assets, "Unpinned figure: " + figure["id"])
        require(manifest["cover"]["source_figure_id"] in ids, "Missing cover: " + label)
    require(set(CONCEPTS) <= {f["id"] for f in body_figures(manifests["natcat"])}, "Missing R10 concept figures")
    pinned = {"sources": sorted(gate["sources"], key=lambda x: x["path"]),
              "assets": sorted(gate["assets"], key=lambda x: x["path"]),
              "publisherBlobSha": blob(local("ops/wechat-publisher/create-draft.py").read_bytes())}
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
    spec = importlib.util.spec_from_file_location("r10_publisher", ROOT / "ops/wechat-publisher/create-draft.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_documents(manifests):
    publisher = publisher_module()
    slot, papers = publisher.load_latest_release()
    require(slot == SLOT, "Release slot changed; stop source review")
    documents = {}
    for label, manifest in manifests.items():
        urls = {f["id"]: local(f["repo_path"]).as_uri() for f in manifest["figures"]}
        content = (publisher.build_content(slot, papers, manifest, urls) if label == "angew"
                   else publisher.build_retrospective_content(manifest, urls))
        for section in manifest["sections"]:
            for paragraph in section.get("paragraphs", []):
                require(html.escape(paragraph, quote=True) in content, "Renderer dropped paragraph: " + section["heading"])
        parser = ImageSources()
        parser.feed(content)
        expected = [urls[f["id"]] for f in body_figures(manifest)]
        require(sorted(parser.sources) == sorted(expected), "Renderer body figure set mismatch: " + label)
        cover_url = urls[manifest["cover"]["source_figure_id"]]
        doc = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
               '<meta name="viewport" content="width=device-width,initial-scale=1">'
               '<style>*{box-sizing:border-box}body{margin:0;background:#fff;font-family:"Noto Sans CJK SC",sans-serif}'
               'main{max-width:677px;margin:auto;padding:20px 17px}img{max-width:100%;height:auto}p{overflow-wrap:anywhere}'
               '</style><main><p>INTERNAL SOURCE REVIEW — NOT A WECHAT DRAFT</p>'
               '<img id="source-cover" src="' + cover_url + '"><article id="source-article">' + content + '</article></main></html>')
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
    expected = len(body_figures(manifest)) + (1 if actual and label == "angew" else 0)
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
            "figureImageMap": figures, "concepts": concepts}


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
    rows, covers, errors = [], [], []
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
            "rows": rows, "covers": covers, "pageErrors": errors,
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
