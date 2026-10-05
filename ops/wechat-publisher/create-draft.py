#!/usr/bin/env python3
"""Create a WeChat Official Account draft from the latest verified Gallery release.

Secrets are read from /etc/osg-wechat-relay/env. The script never prints the
AppSecret or access_token. A preview URL is generated only after the actual
WeChat draft has been created/updated and successfully read back via draft/get.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import html
import json
import mimetypes
import tempfile
import time
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV = Path("/etc/osg-wechat-relay/env")
DEFAULT_COVER = ROOT / "public" / "share-default.png"
DEFAULT_CACHE = Path("/var/lib/osg-wechat-publisher/cover-media.json")
DEFAULT_STATE = Path("/var/lib/osg-wechat-publisher/draft-state.json")
DEFAULT_PUBLISH_STATE = Path("/var/lib/osg-wechat-publisher/publish-state.json")
PUBLISH_TRIGGER = ROOT / "audit" / "automation-triggers" / "wechat-publish-request.json"
RETROSPECTIVE_TRIGGER = ROOT / "audit" / "automation-triggers" / "wechat-retrospective-request.json"
RETROSPECTIVE_DIR = ROOT / "public" / "wechat-retrospective"
DEFAULT_RETROSPECTIVE_STATE = Path("/var/lib/osg-wechat-publisher/retrospective-state.json")
DEFAULT_RETROSPECTIVE_COVER_CACHE = Path("/var/lib/osg-wechat-publisher/retrospective-cover-media.json")
DEFAULT_PREVIEW_DIR = Path("/var/www/osg-wechat-preview")
DEFAULT_PREVIEW_BASE_URL = "https://relay.gczhouwld.com/wechat-preview"
DEFAULT_BODY_IMAGE_CACHE = Path("/var/lib/osg-wechat-publisher/body-images.json")
DEFAULT_PDF_CACHE_DIR = Path("/var/lib/osg-wechat-publisher/source-pdfs")
FEATURED_DIR = ROOT / "public" / "wechat-featured"
EDITION_DIR = ROOT / "public" / "wechat-editions"
DEFAULT_SOURCE_URL = "https://gallery.gczhouwld.com/"

SUPPLEMENT_FILES = (
    "rolling-supplement.json",
    "literature-supplement.json",
    "automation-supplement.json",
    "curated-supplement.json",
    "final-audit-supplement.json",
    "manual-supplement.json",
    "total-synthesis.json",
)

JOURNAL_ORDER = {
    "Nature": 0,
    "Science": 1,
    "Nature Catalysis": 2,
    "Nature Synthesis": 3,
    "Nature Chemistry": 4,
    "Nature Communications": 5,
    "Science Advances": 6,
    "JACS": 7,
    "Angew": 8,
    "Chem": 9,
    "ACS Catalysis": 10,
    "Chemical Science": 11,
    "CCS Chemistry": 12,
    "Green Chemistry": 13,
    "JOC": 14,
    "Organic Letters": 15,
}


def load_env(path: Path) -> None:
    if not path.exists():
        if os.environ.get("WECHAT_MP_APP_ID") and os.environ.get("WECHAT_MP_APP_SECRET"):
            return
        raise RuntimeError(f"env file not found: {path}")
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def json_request(url: str, *, method: str = "GET", payload=None, headers=None):
    data = None
    request_headers = {"Accept": "application/json"}
    if headers:
        request_headers.update(headers)
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=data, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            body = json.loads(raw.decode("utf-8", errors="replace"))
        except Exception:
            body = {"errcode": exc.code, "errmsg": "HTTP error"}
        return body
    return json.loads(raw.decode("utf-8"))


def get_access_token() -> str:
    app_id = os.environ.get("WECHAT_MP_APP_ID", "").strip()
    app_secret = os.environ.get("WECHAT_MP_APP_SECRET", "").strip()
    if not app_id or not app_secret:
        raise RuntimeError("WECHAT_MP_APP_ID / WECHAT_MP_APP_SECRET missing")
    query = urllib.parse.urlencode(
        {"grant_type": "client_credential", "appid": app_id, "secret": app_secret}
    )
    result = json_request("https://api.weixin.qq.com/cgi-bin/token?" + query)
    token = result.get("access_token")
    if not token:
        raise RuntimeError(
            "access_token failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )
    return str(token)


def normalize_doi(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().lower().replace("https://doi.org/", "").replace("doi:", "").strip()


def iter_papers(obj):
    if isinstance(obj, list):
        for item in obj:
            if isinstance(item, dict):
                yield item
        return
    if not isinstance(obj, dict):
        return
    for key in ("papers", "items", "records"):
        value = obj.get(key)
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    yield item


def load_translations() -> dict[str, str]:
    path = ROOT / "public" / "title-translations-zh.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    result: dict[str, str] = {}
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, str):
                result[normalize_doi(key)] = value.strip()
            elif isinstance(value, dict):
                title = value.get("titleZh") or value.get("zh") or value.get("title")
                if isinstance(title, str):
                    result[normalize_doi(key)] = title.strip()
    return result


def load_latest_release():
    state_path = ROOT / "audit" / "literature-update-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    release = state.get("lastPublication") or {}
    removed_after_release = {
        normalize_doi(x)
        for x in (
            ((state.get("lastWebsiteSync") or {}).get("verification") or {}).get(
                "removedDoisAbsent", []
            )
        )
        if normalize_doi(x)
    }
    dois = [
        normalize_doi(x)
        for x in release.get("publishedDois", [])
        if normalize_doi(x) and normalize_doi(x) not in removed_after_release
    ]
    slot = str(release.get("publicationSlot") or "")
    if not dois or not slot:
        raise RuntimeError("lastPublication is missing publicationSlot or publishedDois")
    if not slot.endswith("T08:00:00+08:00"):
        raise RuntimeError(
            "WeChat daily draft only accepts the 08:00 Asia/Shanghai literature release"
        )

    index: dict[str, dict] = {}
    for name in SUPPLEMENT_FILES:
        path = ROOT / "public" / name
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for paper in iter_papers(data):
            doi = normalize_doi(paper.get("doi"))
            if not doi:
                continue
            existing = index.setdefault(doi, {})
            for key, value in paper.items():
                if value not in (None, "", [], {}):
                    existing.setdefault(key, value)

    translations = load_translations()
    papers = []
    missing = []
    for doi in dois:
        paper = dict(index.get(doi) or {})
        paper["doi"] = doi
        if not paper.get("titleZh") and translations.get(doi):
            paper["titleZh"] = translations[doi]
        paper["authors"] = [
            str(x).strip()
            for x in (paper.get("authors") or [])
            if isinstance(x, str) and str(x).strip()
        ]
        needed = []
        if not paper.get("journal"):
            needed.append("journal")
        if not paper.get("title"):
            needed.append("title")
        if not paper.get("titleZh"):
            needed.append("titleZh")
        if not paper.get("authors"):
            needed.append("authors")
        if needed:
            missing.append({"doi": doi, "missing": needed})
        papers.append(paper)

    if missing:
        raise RuntimeError(
            "refusing to create incomplete draft: "
            + json.dumps(missing, ensure_ascii=False)
        )

    papers.sort(
        key=lambda p: (
            JOURNAL_ORDER.get(str(p.get("journal")), 100),
            str(p.get("journal")),
            str(p.get("title")),
        )
    )
    return slot, papers


def esc(value) -> str:
    return html.escape(str(value), quote=True)


def slot_label(slot: str) -> str:
    date = slot[:10] if len(slot) >= 10 else slot
    time = slot[11:16] if len(slot) >= 16 else ""
    return f"{date} {time}".strip()


def load_featured(date: str):
    path = FEATURED_DIR / f"{date}.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"invalid featured article data: {path}")
    return data


def load_edition(date: str) -> dict:
    path = EDITION_DIR / f"{date}.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"invalid WeChat edition data: {path}")
    return data


def load_retrospective_slug(slug: str) -> dict | None:
    slug = str(slug or "").strip()
    if not slug:
        return None
    path = RETROSPECTIVE_DIR / f"{slug}.json"
    if not path.exists():
        raise RuntimeError(f"retrospective manifest missing: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"invalid retrospective manifest: {path}")
    return data


def figure_html(fig_id: str, figures: dict[str, dict], uploaded_urls: dict[str, str]) -> str:
    fig = figures.get(fig_id)
    if not fig:
        return ""
    source = uploaded_urls.get(fig_id) or str(fig.get("source_url") or "")
    if not source:
        return ""
    caption = esc(fig.get("caption") or "")
    return (
        "<section style='margin:20px 0 24px;'>"
        f"<img src='{esc(source)}' style='display:block;width:100%;height:auto;margin:0;'/>"
        f"<p style='font-size:11px;color:#777;line-height:1.65;margin:7px 2px 0;'>{caption}</p>"
        "</section>"
    )


def build_content(slot: str, papers: list[dict], featured: dict | None = None, uploaded_urls: dict[str, str] | None = None) -> str:
    uploaded_urls = uploaded_urls or {}
    grouped: dict[str, list[dict]] = {}
    for paper in papers:
        grouped.setdefault(str(paper["journal"]), []).append(paper)

    parts = [
        "<section style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;color:#222;line-height:1.72;'>",
        "<p style='font-size:13px;color:#666;margin:0 0 14px;'>"
        f"今日新增 <strong>{len(papers)}</strong> 篇文献"
        "</p>",
    ]

    if len(papers) > 5:
        journal_counts = [
            f"{journal} {len(items)} 篇"
            for journal, items in grouped.items()
        ]
        parts.append(
            "<section style='background:#f7f8fa;border-radius:9px;padding:12px 14px;margin:0 0 18px;'>"
            "<p style='font-size:13px;color:#555;line-height:1.75;margin:0;'>"
            + esc(" · ".join(journal_counts))
            + "</p>"
            "<p style='font-size:11px;color:#999;line-height:1.6;margin:5px 0 0;'>完整标题与作者请点击文末“阅读原文”查看。</p>"
            "</section>"
        )
    else:
        for journal, items in grouped.items():
            parts.append(
                "<h2 style='font-size:17px;line-height:1.45;margin:22px 0 8px;"
                "padding-left:9px;border-left:3px solid #222;'>"
                f"{esc(journal)} <span style='font-size:11px;font-weight:400;color:#999;'>"
                f"{len(items)} 篇</span></h2>"
            )
            for paper in items:
                authors = ", ".join(paper["authors"])
                badge = ""
                if featured and normalize_doi(featured.get("paper", {}).get("doi")) == paper["doi"]:
                    badge = "<span style='display:inline-block;font-size:10px;color:#fff;background:#222;border-radius:9px;padding:1px 6px;margin-right:6px;'>今日精选</span>"
                parts.append(
                    "<section style='margin:0 0 14px;padding:0 0 13px;border-bottom:1px solid #eee;'>"
                    f"<div style='font-size:15px;font-weight:700;line-height:1.58;margin-bottom:3px;'>{badge}{esc(paper['titleZh'])}</div>"
                    f"<div style='font-size:12px;color:#666;line-height:1.55;margin-bottom:5px;'>{esc(paper['title'])}</div>"
                    f"<div style='font-size:11px;color:#999;line-height:1.5;'>{esc(authors)}</div>"
                    "</section>"
                )

    if featured:
        figures = {str(x.get("id")): x for x in featured.get("figures", []) if isinstance(x, dict)}
        paper = featured.get("paper") or {}
        parts.extend([
            "<p style='height:1px;background:#e8eaec;margin:28px 0;'></p>",
            "<p style='font-size:11px;letter-spacing:.12em;color:#32675f;font-weight:700;margin:0 0 6px;'>DAILY PICK · 01</p>",
            f"<h2 style='font-size:21px;line-height:1.5;margin:0 0 10px;'>{esc(featured.get('headline') or '')}</h2>",
            f"<p style='font-size:12px;color:#888;line-height:1.65;margin:0 0 18px;'>{esc(paper.get('authors') or '')} · {esc(paper.get('journal') or '')} · DOI {esc(paper.get('doi') or '')}</p>",
        ])

        for point_index, point in enumerate(featured.get("quick_points", [])):
            parts.append(
                "<section style='background:#f7f8fa;border-radius:8px;padding:11px 13px;margin:9px 0;'>"
                f"<strong style='font-size:14px;line-height:1.55;'>{esc(point.get('label') or '')}</strong>"
                f"<p style='font-size:14px;line-height:1.78;margin:4px 0 0;color:#444;text-align:justify;'>{esc(point.get('text') or '')}</p>"
                "</section>"
            )
            if point_index == 0:
                parts.append(figure_html("fig1", figures, uploaded_urls))

        for section in featured.get("sections", []):
            parts.append(
                f"<p style='font-size:11px;letter-spacing:.08em;color:#32675f;font-weight:700;margin:26px 0 5px;'>{esc(section.get('eyebrow') or '')}</p>"
                f"<h2 style='font-size:19px;line-height:1.55;margin:0 0 10px;'>{esc(section.get('heading') or '')}</h2>"
            )
            for paragraph in section.get("paragraphs", []):
                parts.append(
                    f"<p style='font-size:15px;line-height:1.88;margin:0 0 12px;text-align:justify;'>{esc(paragraph)}</p>"
                )
            for bullet in section.get("bullets", []):
                parts.append(
                    f"<p style='font-size:14px;line-height:1.8;margin:0 0 8px;padding-left:12px;border-left:2px solid #dfe3e5;'>{esc(bullet)}</p>"
                )
            if section.get("callout"):
                parts.append(
                    "<section style='background:#eef7f5;border-left:3px solid #32675f;padding:11px 13px;margin:14px 0;'>"
                    f"<p style='font-size:14px;line-height:1.8;margin:0;'>{esc(section['callout'])}</p></section>"
                )
            if section.get("warning"):
                parts.append(
                    "<section style='background:#fff7e7;border:1px solid #f0ddb0;border-radius:8px;padding:11px 13px;margin:14px 0;'>"
                    f"<p style='font-size:13px;line-height:1.78;margin:0;'>{esc(section['warning'])}</p></section>"
                )
            if section.get("review"):
                parts.append(
                    "<section style='background:#f4f0ff;border:1px solid #e2daf9;border-radius:8px;padding:11px 13px;margin:14px 0;'>"
                    f"<p style='font-size:13px;line-height:1.78;margin:0;'>{esc(section['review'])}</p></section>"
                )
            for fig_id in section.get("figures", []):
                parts.append(figure_html(str(fig_id), figures, uploaded_urls))

        takehome = featured.get("takehome", [])
        if takehome:
            parts.append("<section style='background:#202426;color:#fff;border-radius:10px;padding:15px 16px;margin:24px 0;'>")
            parts.append("<h3 style='font-size:16px;line-height:1.5;margin:0 0 8px;color:#fff;'>这篇论文最值得学什么？</h3>")
            for item in takehome:
                parts.append(f"<p style='font-size:13px;line-height:1.75;margin:0 0 7px;color:#f4f5f6;'>• {esc(item)}</p>")
            parts.append("</section>")

        notice = featured.get("ai_notice")
        if notice:
            parts.append(
                "<section style='border-top:1px solid #eee;margin-top:24px;padding-top:14px;'>"
                "<p style='font-size:11px;color:#888;line-height:1.7;margin:0;'><strong>创作说明：</strong>"
                f"{esc(notice)}</p></section>"
            )

    parts.append(
        "<section style='margin-top:12px;padding-top:12px;border-top:1px solid #eee;'>"
        "<p style='font-size:11px;color:#888;line-height:1.7;margin:0;'><strong>原创说明：</strong>"
        "本文由“化之岛”原创策划与整理，AI 辅助生成与校核；文献事实、化学结构和数据以论文原文为准。"
        "</p></section>"
    )
    parts.append("</section>")
    return "".join(parts)



def build_retrospective_content(data: dict, uploaded_urls: dict[str, str] | None = None) -> str:
    uploaded_urls = uploaded_urls or {}
    figures = {str(x.get("id")): x for x in data.get("figures", []) if isinstance(x, dict)}
    paper = data.get("paper") or {}
    parts = [
        "<section style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;color:#222;line-height:1.72;'>",
        "<p style='font-size:11px;letter-spacing:.14em;color:#32675f;font-weight:700;margin:0 0 7px;'>RETROSPECTIVE PICK · 往期精选</p>",
        f"<h2 style='font-size:22px;line-height:1.52;margin:0 0 10px;'>{esc(data.get('headline') or data.get('title') or '')}</h2>",
        f"<p style='font-size:12px;color:#888;line-height:1.65;margin:0 0 18px;'>{esc(paper.get('authors') or '')} · {esc(paper.get('journal') or '')} · DOI {esc(paper.get('doi') or '')}</p>",
    ]

    for point_index, point in enumerate(data.get("quick_points", [])):
        parts.append(
            "<section style='background:#f7f8fa;border-radius:8px;padding:11px 13px;margin:9px 0;'>"
            f"<strong style='font-size:14px;line-height:1.55;'>{esc(point.get('label') or '')}</strong>"
            f"<p style='font-size:14px;line-height:1.78;margin:4px 0 0;color:#444;text-align:justify;'>{esc(point.get('text') or '')}</p>"
            "</section>"
        )
        if point_index == 0:
            parts.append(figure_html("fig1", figures, uploaded_urls))

    for section in data.get("sections", []):
        parts.append(
            f"<p style='font-size:11px;letter-spacing:.08em;color:#32675f;font-weight:700;margin:27px 0 5px;'>{esc(section.get('eyebrow') or '')}</p>"
            f"<h2 style='font-size:19px;line-height:1.55;margin:0 0 10px;'>{esc(section.get('heading') or '')}</h2>"
        )
        for paragraph in section.get("paragraphs", []):
            parts.append(
                f"<p style='font-size:15px;line-height:1.88;margin:0 0 12px;text-align:justify;'>{esc(paragraph)}</p>"
            )
        for bullet in section.get("bullets", []):
            parts.append(
                f"<p style='font-size:14px;line-height:1.82;margin:0 0 8px;padding-left:12px;border-left:2px solid #dfe3e5;'>{esc(bullet)}</p>"
            )
        if section.get("callout"):
            parts.append(
                "<section style='background:#eef7f5;border-left:3px solid #32675f;padding:11px 13px;margin:14px 0;'>"
                f"<p style='font-size:14px;line-height:1.8;margin:0;'>{esc(section['callout'])}</p></section>"
            )
        if section.get("warning"):
            parts.append(
                "<section style='background:#fff7e7;border:1px solid #f0ddb0;border-radius:8px;padding:11px 13px;margin:14px 0;'>"
                f"<p style='font-size:13px;line-height:1.78;margin:0;'>{esc(section['warning'])}</p></section>"
            )
        if section.get("review"):
            parts.append(
                "<section style='background:#f4f0ff;border:1px solid #e2daf9;border-radius:8px;padding:11px 13px;margin:14px 0;'>"
                f"<p style='font-size:13px;line-height:1.78;margin:0;'>{esc(section['review'])}</p></section>"
            )
        for fig_id in section.get("figures", []):
            parts.append(figure_html(str(fig_id), figures, uploaded_urls))

    takehome = data.get("takehome", [])
    if takehome:
        parts.append("<section style='background:#202426;color:#fff;border-radius:10px;padding:15px 16px;margin:25px 0;'>")
        parts.append("<h3 style='font-size:16px;line-height:1.5;margin:0 0 8px;color:#fff;'>这篇论文最值得学什么？</h3>")
        for item in takehome:
            parts.append(f"<p style='font-size:13px;line-height:1.75;margin:0 0 7px;color:#f4f5f6;'>• {esc(item)}</p>")
        parts.append("</section>")

    notice = data.get("ai_notice")
    if notice:
        parts.append(
            "<section style='border-top:1px solid #eee;margin-top:24px;padding-top:14px;'>"
            "<p style='font-size:11px;color:#888;line-height:1.7;margin:0;'><strong>创作说明：</strong>"
            f"{esc(notice)}</p></section>"
        )
    parts.append(
        "<section style='margin-top:12px;padding-top:12px;border-top:1px solid #eee;'>"
        "<p style='font-size:11px;color:#888;line-height:1.7;margin:0;'><strong>原创说明：</strong>"
        "本文由“化之岛”原创策划与整理，AI 辅助生成与校核；文献事实、化学结构和数据以论文原文为准。"
        "</p></section>"
    )
    parts.append("</section>")
    return "".join(parts)


def prepare_cover_from_local(data: dict, local_images: dict[str, Path]) -> Path | None:
    cover = data.get("cover")
    if not isinstance(cover, dict):
        return None
    fig_id = str(cover.get("source_figure_id") or "").strip()
    source = local_images.get(fig_id) if fig_id else None
    if not source:
        return None
    portrait_id = str(cover.get("portrait_figure_id") or "").strip()
    portrait = local_images.get(portrait_id) if portrait_id else None
    try:
        from PIL import Image, ImageDraw, ImageOps
    except ImportError as exc:
        raise RuntimeError("cover composition requires Pillow") from exc

    canvas_spec = cover.get("canvas") if isinstance(cover.get("canvas"), dict) else {}
    width = int(canvas_spec.get("width") or 1880)
    height = int(canvas_spec.get("height") or 800)
    background_name = str(canvas_spec.get("background") or "white")
    crop_frac = cover.get("crop_frac")

    with Image.open(source) as image:
        image.load()
        image = image.convert("RGB")
        if isinstance(crop_frac, list) and len(crop_frac) == 4:
            x0, y0, x1, y1 = [float(v) for v in crop_frac]
            x0 = max(0.0, min(1.0, x0)); y0 = max(0.0, min(1.0, y0))
            x1 = max(x0 + 0.01, min(1.0, x1)); y1 = max(y0 + 0.01, min(1.0, y1))
            image = image.crop((
                int(image.width * x0), int(image.height * y0),
                int(image.width * x1), int(image.height * y1),
            ))

        canvas = Image.new("RGB", (width, height), background_name)

        if portrait:
            # Editorial cover: a clean MacMillan portrait on the left plus the
            # paper's original reaction artwork on the right. Chemical structures
            # are never redrawn; they remain pixels from the publisher figure.
            left_w = int(width * 0.34)
            with Image.open(portrait) as p:
                p.load()
                p = p.convert("RGB")
                p = ImageOps.fit(p, (left_w, height), method=Image.Resampling.LANCZOS, centering=(0.50, 0.42))
                canvas.paste(p, (0, 0))
            draw = ImageDraw.Draw(canvas)
            fade_w = max(120, int(width * 0.10))
            for i in range(fade_w):
                alpha = int(255 * (i / max(1, fade_w - 1)) ** 1.4)
                x = left_w - fade_w + i
                draw.line([(x, 0), (x, height)], fill=(255, 255, 255, alpha) if canvas.mode=="RGBA" else (255,255,255), width=1)
            right_x = int(width * 0.35)
            right_w = width - right_x - int(width * 0.025)
            right_h = int(height * 0.78)
            fitted = ImageOps.contain(image, (right_w, right_h), method=Image.Resampling.LANCZOS)
            px = right_x + (right_w - fitted.width)//2
            py = (height - fitted.height)//2
            canvas.paste(fitted, (px, py))
        else:
            scale = min(width / image.width, height / image.height)
            resized = image.resize(
                (max(1, int(image.width * scale)), max(1, int(image.height * scale))),
                Image.Resampling.LANCZOS,
            )
            canvas.paste(resized, ((width - resized.width)//2, (height - resized.height)//2))

    target = Path(tempfile.gettempdir()) / "osg-wechat-retrospective-cover.jpg"
    canvas.save(target, format="JPEG", quality=95, optimize=True, progressive=True, dpi=(300, 300))
    return target

def multipart_file(field: str, path: Path):
    boundary = "----osg" + uuid.uuid4().hex
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    content = path.read_bytes()
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field}"; filename="{path.name}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8")
    body = head + content + f"\r\n--{boundary}--\r\n".encode("utf-8")
    return boundary, body


def load_json_cache(path: Path):
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_json_cache(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def download_body_image(source_url: str, fig_id: str) -> Path:
    """Download and normalize a publisher figure to a real PNG for WeChat.

    This does not redraw or alter chemical structures. It only decodes the
    publisher-delivered image and re-encodes the same pixels as a standards-
    compliant PNG accepted by WeChat's article-body image endpoint.
    """
    raw_target = Path(tempfile.gettempdir()) / f"osg-wechat-{fig_id}-raw"
    png_target = Path(tempfile.gettempdir()) / f"osg-wechat-{fig_id}.png"

    req = urllib.request.Request(
        source_url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/154.0.0.0 Safari/537.36"
            ),
            # Force raster image delivery and avoid AVIF/WebP content negotiation.
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Referer": (
                "https://pubs.acs.org/"
                if "pubs.acs.org" in source_url
                else "https://gallery.gczhouwld.com/"
            ),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            payload = response.read()
            content_type = str(response.headers.get("Content-Type") or "").lower()
    except Exception as exc:
        raise RuntimeError(f"failed to download featured figure {fig_id}: {exc}") from exc

    if not payload:
        raise RuntimeError(f"empty featured figure download: {fig_id}")
    if "text/html" in content_type:
        raise RuntimeError(
            f"featured figure {fig_id} returned HTML instead of an image"
        )

    raw_target.write_bytes(payload)

    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError as exc:
        raise RuntimeError(
            "body image normalization requires Pillow; install with: "
            "sudo apt-get update && sudo apt-get install -y python3-pil"
        ) from exc

    try:
        with Image.open(raw_target) as image:
            image.load()
            # Keep original pixel dimensions. Convert palette/alpha safely to RGB
            # on white because chemistry figures use white backgrounds.
            if image.mode in ("RGBA", "LA"):
                background = Image.new("RGBA", image.size, "white")
                background.alpha_composite(image.convert("RGBA"))
                normalized = background.convert("RGB")
            elif image.mode == "P":
                normalized = image.convert("RGBA")
                background = Image.new("RGBA", image.size, "white")
                background.alpha_composite(normalized)
                normalized = background.convert("RGB")
            else:
                normalized = image.convert("RGB")

            normalized.save(
                png_target,
                format="PNG",
                optimize=False,
                compress_level=4,
                dpi=(300, 300),
            )
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise RuntimeError(
            f"featured figure {fig_id} is not a decodable raster image: "
            f"content_type={content_type or 'unknown'}, bytes={len(payload)}"
        ) from exc

    return png_target


def ensure_pdf_source(featured: dict, override_path: str = "") -> Path:
    if override_path:
        path = Path(override_path).expanduser().resolve()
        if not path.exists():
            raise RuntimeError(f"featured PDF not found: {path}")
        if not path.read_bytes()[:5] == b"%PDF-":
            raise RuntimeError(f"featured source is not a PDF: {path}")
        return path

    repo_path = str(featured.get("pdf_repo_path") or "").strip()
    if repo_path:
        path = (ROOT / repo_path).resolve()
        try:
            path.relative_to(ROOT.resolve())
        except ValueError as exc:
            raise RuntimeError(f"featured pdf_repo_path escapes repository: {repo_path}") from exc
        if not path.exists():
            raise RuntimeError(
                f"featured repository PDF is missing: {repo_path}. "
                "Run git pull --ff-only before publishing."
            )
        if path.read_bytes()[:5] != b"%PDF-":
            raise RuntimeError(f"featured repository source is not a PDF: {repo_path}")
        return path

    pdf_urls = []
    primary_pdf_url = str(featured.get("pdf_url") or "").strip()
    if primary_pdf_url:
        pdf_urls.append(primary_pdf_url)
    configured_pdf_urls = featured.get("pdf_urls")
    if isinstance(configured_pdf_urls, list):
        for value in configured_pdf_urls:
            value = str(value or "").strip()
            if value and value not in pdf_urls:
                pdf_urls.append(value)
    if not pdf_urls:
        raise RuntimeError(
            "featured article has pdf_render figures but neither pdf_repo_path nor pdf_url(s)"
        )

    DEFAULT_PDF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    errors = []
    for pdf_url in pdf_urls:
        url_hash = hashlib.sha256(pdf_url.encode("utf-8")).hexdigest()[:20]
        target = DEFAULT_PDF_CACHE_DIR / f"{url_hash}.pdf"
        if target.exists():
            try:
                if target.read_bytes()[:5] == b"%PDF-":
                    return target
            except OSError:
                pass

        req = urllib.request.Request(
            pdf_url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/154.0.0.0 Safari/537.36"
                ),
                "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.5",
                "Referer": "https://pubs.acs.org/",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                payload = response.read()
                content_type = str(response.headers.get("Content-Type") or "").lower()
        except Exception as exc:
            errors.append(f"{pdf_url}: {exc}")
            continue

        if not payload.startswith(b"%PDF-"):
            errors.append(
                f"{pdf_url}: non-PDF content_type={content_type or 'unknown'}, bytes={len(payload)}"
            )
            continue
        target.write_bytes(payload)
        return target

    raise RuntimeError(
        "failed to download featured PDF from all configured sources: "
        + " | ".join(errors[-3:])
    )


def render_figure_from_pdf(pdf_path: Path, fig: dict) -> Path:
    spec = fig.get("pdf_render")
    if not isinstance(spec, dict):
        raise RuntimeError(f"figure {fig.get('id')} has no pdf_render specification")

    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError(
            "PDF figure rendering requires PyMuPDF. Install once with: "
            "sudo apt-get update && sudo apt-get install -y python3-fitz"
        ) from exc

    fig_id = str(fig.get("id") or "figure")
    page_index = int(spec.get("page_index"))
    clip_values = spec.get("clip")
    zoom = float(spec.get("zoom") or 4.0)
    if not isinstance(clip_values, list) or len(clip_values) != 4:
        raise RuntimeError(f"invalid pdf_render clip for {fig_id}")

    doc = fitz.open(str(pdf_path))
    try:
        if page_index < 0 or page_index >= doc.page_count:
            raise RuntimeError(
                f"pdf_render page out of range for {fig_id}: "
                f"{page_index} / {doc.page_count}"
            )
        page = doc[page_index]
        clip = fitz.Rect(*[float(x) for x in clip_values])
        pix = page.get_pixmap(
            matrix=fitz.Matrix(zoom, zoom),
            clip=clip,
            alpha=False,
        )
        target = Path(tempfile.gettempdir()) / f"osg-wechat-{fig_id}-pdf.png"
        pix.save(str(target))
        return target
    finally:
        doc.close()


def prepare_featured_local_images(featured: dict | None, override_pdf: str = "") -> dict[str, Path]:
    if not featured:
        return {}
    figures = [x for x in featured.get("figures", []) if isinstance(x, dict)]

    prepared: dict[str, Path] = {}
    for fig in figures:
        fig_id = str(fig.get("id") or "").strip()
        if not fig_id:
            continue
        if isinstance(fig.get("pdf_render"), dict):
            source_spec = dict(featured)
            figure_pdf_url = str(fig.get("pdf_url") or "").strip()
            figure_pdf_repo = str(fig.get("pdf_repo_path") or "").strip()
            if figure_pdf_url or figure_pdf_repo:
                source_spec.pop("pdf_url", None)
                source_spec.pop("pdf_repo_path", None)
                if figure_pdf_url:
                    source_spec["pdf_url"] = figure_pdf_url
                if figure_pdf_repo:
                    source_spec["pdf_repo_path"] = figure_pdf_repo
            pdf_path = ensure_pdf_source(source_spec, override_pdf if not (figure_pdf_url or figure_pdf_repo) else "")
            prepared[fig_id] = render_figure_from_pdf(pdf_path, fig)
            continue
        source_url = str(fig.get("source_url") or "").strip()
        if not source_url:
            continue
        local = download_body_image(source_url, fig_id)

        # Publisher figures are often multi-panel. Allow a fractional crop so the
        # article can show only the exact evidentiary panel, without page chrome,
        # neighbouring panels, or unrelated text.
        crop_frac = fig.get("crop_frac")
        if isinstance(crop_frac, list) and len(crop_frac) == 4:
            try:
                from PIL import Image
            except ImportError as exc:
                raise RuntimeError("figure cropping requires Pillow") from exc
            x0, y0, x1, y1 = [float(v) for v in crop_frac]
            x0 = max(0.0, min(1.0, x0)); y0 = max(0.0, min(1.0, y0))
            x1 = max(x0 + 0.01, min(1.0, x1)); y1 = max(y0 + 0.01, min(1.0, y1))
            with Image.open(local) as image:
                image.load()
                image = image.convert("RGB")
                crop = image.crop((
                    int(image.width * x0), int(image.height * y0),
                    int(image.width * x1), int(image.height * y1),
                ))
                target = Path(tempfile.gettempdir()) / f"osg-wechat-{fig_id}-crop.png"
                crop.save(target, format="PNG", optimize=True, dpi=(300, 300))
                local = target
        prepared[fig_id] = local
    return prepared

def upload_local_body_image(token: str, local: Path, fig_id: str, cache_path: Path) -> str:
    payload = local.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    cache = load_json_cache(cache_path)
    cache_key = f"sha256:{digest}"
    cached = cache.get(cache_key)
    if isinstance(cached, dict) and cached.get("url"):
        return str(cached["url"])

    boundary, body = multipart_file("media", local)
    url = (
        "https://api.weixin.qq.com/cgi-bin/media/uploadimg?"
        + urllib.parse.urlencode({"access_token": token})
    )
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        result = json.loads(exc.read().decode("utf-8", errors="replace"))

    image_url = result.get("url")
    if not image_url:
        raise RuntimeError(
            "body image upload failed: "
            + json.dumps(
                {
                    "figure": fig_id,
                    "errcode": result.get("errcode"),
                    "errmsg": result.get("errmsg"),
                },
                ensure_ascii=False,
            )
        )
    cache[cache_key] = {
        "url": image_url,
        "figure": fig_id,
        "source": "pdf_render",
        "bytes": len(payload),
    }
    save_json_cache(cache_path, cache)
    return str(image_url)


def upload_body_image(token: str, source_url: str, fig_id: str, cache_path: Path) -> str:
    cache = load_json_cache(cache_path)
    key = hashlib.sha256(source_url.encode("utf-8")).hexdigest()
    cached = cache.get(key)
    if isinstance(cached, dict) and cached.get("url"):
        return str(cached["url"])

    local = download_body_image(source_url, fig_id)
    boundary, body = multipart_file("media", local)
    url = (
        "https://api.weixin.qq.com/cgi-bin/media/uploadimg?"
        + urllib.parse.urlencode({"access_token": token})
    )
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        result = json.loads(exc.read().decode("utf-8", errors="replace"))

    image_url = result.get("url")
    if not image_url:
        raise RuntimeError(
            "body image upload failed: "
            + json.dumps(
                {
                    "figure": fig_id,
                    "errcode": result.get("errcode"),
                    "errmsg": result.get("errmsg"),
                },
                ensure_ascii=False,
            )
        )

    cache[key] = {"url": image_url, "source_url": source_url, "figure": fig_id}
    save_json_cache(cache_path, cache)
    return str(image_url)


def upload_featured_images(token: str, featured: dict | None, override_pdf: str = ""):
    local_images = prepare_featured_local_images(featured, override_pdf)
    uploaded: dict[str, str] = {}
    for fig_id, local in local_images.items():
        uploaded[fig_id] = upload_local_body_image(
            token,
            local,
            fig_id,
            DEFAULT_BODY_IMAGE_CACHE,
        )
    return uploaded, local_images


def prepare_featured_cover(featured: dict | None, override_pdf: str = "") -> Path | None:
    if not featured:
        return None
    cover = featured.get("cover")
    if not isinstance(cover, dict):
        return None
    spec = cover.get("pdf_render")
    if not isinstance(spec, dict):
        return None

    pdf_path = ensure_pdf_source(featured, override_pdf)
    rendered = render_figure_from_pdf(
        pdf_path,
        {"id": "cover", "pdf_render": spec},
    )

    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(
            "cover composition requires Pillow; install with: "
            "sudo apt-get update && sudo apt-get install -y python3-pil"
        ) from exc

    canvas_spec = cover.get("canvas") if isinstance(cover.get("canvas"), dict) else {}
    width = int(canvas_spec.get("width") or 1880)
    height = int(canvas_spec.get("height") or 800)
    background_name = str(canvas_spec.get("background") or "white")

    with Image.open(rendered) as source:
        source.load()
        source = source.convert("RGB")
        scale = min(width / source.width, height / source.height)
        resized = source.resize(
            (max(1, int(source.width * scale)), max(1, int(source.height * scale))),
            Image.Resampling.LANCZOS,
        )
        canvas = Image.new("RGB", (width, height), background_name)
        x = (width - resized.width) // 2
        y = (height - resized.height) // 2
        canvas.paste(resized, (x, y))

    target = Path(tempfile.gettempdir()) / "osg-wechat-cover-235.jpg"
    canvas.save(
        target,
        format="JPEG",
        quality=94,
        optimize=True,
        progressive=True,
        dpi=(300, 300),
    )
    return target


def upload_permanent_image(token: str, image_path: Path, cache_path: Path) -> str:
    payload = image_path.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    cache = load_json_cache(cache_path)
    if (
        cache.get("sha256") == digest
        and cache.get("media_id")
        and cache.get("upload_type") == "image"
    ):
        return str(cache["media_id"])

    boundary, body = multipart_file("media", image_path)
    query = urllib.parse.urlencode({"access_token": token, "type": "image"})
    url = "https://api.weixin.qq.com/cgi-bin/material/add_material?" + query
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        result = json.loads(exc.read().decode("utf-8", errors="replace"))

    media_id = result.get("media_id")
    if not media_id:
        raise RuntimeError(
            "cover image upload failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )

    save_json_cache(
        cache_path,
        {
            "sha256": digest,
            "media_id": media_id,
            "cover": str(image_path),
            "upload_type": "image",
            "bytes": len(payload),
        },
    )
    return str(media_id)


def prepare_thumb_cover(cover: Path) -> Path:
    """Return a WeChat-compatible JPG thumbnail (<64 KiB).

    The integration test must not depend on the repository placeholder being
    decodable on every server. If the source image cannot be opened, generate a
    clean local JPG placeholder and continue the API test.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError
    except ImportError as exc:
        raise RuntimeError(
            "cover conversion requires Pillow; install with: "
            "sudo apt-get update && sudo apt-get install -y python3-pil"
        ) from exc

    target = Path(tempfile.gettempdir()) / "osg-wechat-cover-thumb.jpg"
    resampling = getattr(Image, "Resampling", Image)

    def save_under_limit(image):
        image = image.convert("RGB")
        image.thumbnail((900, 500), resampling.LANCZOS)
        for quality in (88, 82, 76, 70, 64, 58, 52, 46, 40):
            image.save(
                target,
                format="JPEG",
                quality=quality,
                optimize=True,
                progressive=True,
            )
            if target.stat().st_size < 64 * 1024:
                return target

        original = image
        for scale in (0.85, 0.72, 0.60, 0.50):
            width = max(320, int(original.width * scale))
            height = max(180, int(original.height * scale))
            reduced = original.resize((width, height), resampling.LANCZOS)
            reduced.save(
                target,
                format="JPEG",
                quality=55,
                optimize=True,
                progressive=True,
            )
            if target.stat().st_size < 64 * 1024:
                return target
        raise RuntimeError(
            f"converted cover is still too large for WeChat thumb: "
            f"{target.stat().st_size} bytes"
        )

    if cover.exists():
        try:
            with Image.open(cover) as source:
                source.load()
                return save_under_limit(source)
        except (UnidentifiedImageError, OSError, ValueError):
            pass

    # Fail-safe neutral cover. Production featured drafts normally use the first
    # original paper figure as the cover source; this is only a last-resort fallback.
    image = Image.new("RGB", (900, 383), "white")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((34, 34, 866, 349), radius=26, outline="#222222", width=3)
    try:
        title_font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 44
        )
        sub_font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 25
        )
    except OSError:
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()
    draw.text((74, 125), "Organic Synthesis Gallery", fill="#111111", font=title_font)
    draw.text((76, 205), "Daily Literature", fill="#555555", font=sub_font)
    return save_under_limit(image)


def upload_cover(token: str, cover: Path, cache_path: Path) -> str:
    thumb = prepare_thumb_cover(cover)
    digest = hashlib.sha256(thumb.read_bytes()).hexdigest()

    cache = {}
    if cache_path.exists():
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception:
            cache = {}
    if cache.get("sha256") == digest and cache.get("media_id"):
        return str(cache["media_id"])

    boundary, body = multipart_file("media", thumb)
    query = urllib.parse.urlencode({"access_token": token, "type": "thumb"})
    url = "https://api.weixin.qq.com/cgi-bin/material/add_material?" + query
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        result = json.loads(exc.read().decode("utf-8", errors="replace"))

    media_id = result.get("media_id")
    if not media_id:
        raise RuntimeError(
            "cover upload failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps(
            {"sha256": digest, "media_id": media_id, "cover": str(cover), "upload_type": "thumb"},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return str(media_id)


def submit_publish(token: str, media_id: str):
    url = (
        "https://api.weixin.qq.com/cgi-bin/freepublish/submit?"
        + urllib.parse.urlencode({"access_token": token})
    )
    result = json_request(url, method="POST", payload={"media_id": media_id})
    if result.get("errcode") not in (None, 0):
        raise RuntimeError(
            "freepublish/submit failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )
    publish_id = result.get("publish_id")
    if publish_id in (None, ""):
        raise RuntimeError("freepublish/submit returned no publish_id")
    return str(publish_id)


def get_publish_status(token: str, publish_id: str):
    url = (
        "https://api.weixin.qq.com/cgi-bin/freepublish/get?"
        + urllib.parse.urlencode({"access_token": token})
    )
    return json_request(url, method="POST", payload={"publish_id": publish_id})


def wait_for_publish(token: str, publish_id: str, timeout_seconds: int = 120):
    deadline = time.time() + timeout_seconds
    last = None
    while time.time() < deadline:
        last = get_publish_status(token, publish_id)
        if last.get("errcode") not in (None, 0):
            raise RuntimeError(
                "freepublish/get failed: "
                + json.dumps(
                    {"errcode": last.get("errcode"), "errmsg": last.get("errmsg")},
                    ensure_ascii=False,
                )
            )
        status = int(last.get("publish_status", -1))
        if status == 0:
            detail = last.get("article_detail") if isinstance(last.get("article_detail"), dict) else {}
            items = detail.get("item") if isinstance(detail, dict) else []
            article_url = ""
            if isinstance(items, list) and items:
                first = items[0] if isinstance(items[0], dict) else {}
                article_url = str(first.get("article_url") or "")
            return {
                "publish_status": status,
                "article_id": last.get("article_id"),
                "article_url": article_url,
            }
        if status in (2, 3, 4, 5, 6):
            labels = {
                2: "original_declaration_failed",
                3: "publish_failed",
                4: "platform_review_rejected",
                5: "deleted_after_publish",
                6: "banned_after_publish",
            }
            raise RuntimeError(
                f"publish failed: status={status} ({labels.get(status, 'unknown')}) "
                + json.dumps(last, ensure_ascii=False)
            )
        time.sleep(2)
    raise RuntimeError(
        "publish status timeout: "
        + json.dumps(last or {"publish_id": publish_id}, ensure_ascii=False)
    )


def create_draft(token: str, article: dict | list[dict]):
    url = (
        "https://api.weixin.qq.com/cgi-bin/draft/add?"
        + urllib.parse.urlencode({"access_token": token})
    )
    articles = article if isinstance(article, list) else [article]
    if not articles:
        raise RuntimeError("draft/add requires at least one article")
    result = json_request(url, method="POST", payload={"articles": articles})
    if result.get("errcode") not in (None, 0):
        raise RuntimeError(
            "draft/add failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )
    if not result.get("media_id"):
        raise RuntimeError("draft/add returned no media_id")
    return result


def update_draft(token: str, media_id: str, article: dict, index: int = 0):
    url = (
        "https://api.weixin.qq.com/cgi-bin/draft/update?"
        + urllib.parse.urlencode({"access_token": token})
    )
    result = json_request(
        url,
        method="POST",
        payload={"media_id": media_id, "index": int(index), "articles": article},
    )
    if result.get("errcode") not in (None, 0):
        raise RuntimeError(
            "draft/update failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )
    return result


def get_draft(token: str, media_id: str):
    url = (
        "https://api.weixin.qq.com/cgi-bin/draft/get?"
        + urllib.parse.urlencode({"access_token": token})
    )
    result = json_request(
        url,
        method="POST",
        payload={"media_id": media_id},
    )
    if result.get("errcode") not in (None, 0):
        raise RuntimeError(
            "draft/get failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )
    items = result.get("news_item")
    if not isinstance(items, list) or not items:
        raise RuntimeError("draft/get returned no news_item")
    return result


def preview_slug(media_id: str, draft: dict | None = None) -> str:
    key = os.environ.get("RELAY_SHARED_KEY", "").encode("utf-8")
    if not key:
        raise RuntimeError("RELAY_SHARED_KEY missing; cannot derive preview slug")

    version_basis = media_id
    if draft:
        items = draft.get("news_item") if isinstance(draft, dict) else None
        compact_items = []
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, dict):
                continue
            compact_items.append({
                "title": item.get("title"),
                "digest": item.get("digest"),
                "content": item.get("content"),
                "thumb_url": item.get("thumb_url"),
                "content_source_url": item.get("content_source_url"),
            })
        version_basis += "\n" + json.dumps(
            compact_items,
            ensure_ascii=False,
            sort_keys=True,
        )
    digest = hmac.new(key, version_basis.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest[:24]


def render_wechat_draft_preview(draft: dict, *, media_id: str) -> str:
    items = draft.get("news_item") if isinstance(draft, dict) else None
    if not isinstance(items, list) or not items:
        raise RuntimeError("draft preview requires news_item")

    title = str((items[0] or {}).get("title") or "")
    card_nav = []
    rendered = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        item_title = str(item.get("title") or "")
        author = str(item.get("author") or "")
        digest = str(item.get("digest") or "")
        content = str(item.get("content") or "")
        source_url = str(item.get("content_source_url") or "")
        thumb_url = str(item.get("thumb_url") or "")
        anchor = f"article-{idx + 1}"
        card_nav.append(
            "<a class='push-card' href='#" + anchor + "'>"
            + (f"<img src='{html.escape(thumb_url, quote=True)}'/>" if thumb_url else "")
            + "<span><b>" + html.escape(item_title) + "</b>"
            + (f"<small>{html.escape(digest)}</small>" if digest else "")
            + "</span></a>"
        )
        rendered.append(
            f"<article id='{anchor}' class='article-block'>"
            f"<p class='article-index'>{idx + 1:02d} / {len(items):02d}</p>"
            f"<h1>{html.escape(item_title)}</h1>"
            f"<div class='meta'>{html.escape(author)}</div>"
            f"<section class='wx-content'>{content}</section>"
            + (
                f"<a class='source-link' href='{html.escape(source_url, quote=True)}' "
                "target='_blank' rel='noreferrer'>阅读原文</a>"
                if source_url else ""
            )
            + "</article>"
        )

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>{html.escape(title)}</title>
<style>
*{{box-sizing:border-box}}
html,body{{margin:0;padding:0;background:#f5f6f7;color:#222;scroll-behavior:smooth}}
body{{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue","PingFang SC","Microsoft YaHei",Arial,sans-serif}}
.bundle{{max-width:720px;margin:0 auto;padding:16px 12px 48px}}
.bundle-head{{background:#fff;border-radius:14px;padding:14px;margin:0 0 14px;box-shadow:0 1px 8px rgba(0,0,0,.04)}}
.bundle-head>p{{font-size:11px;letter-spacing:.12em;color:#777;margin:0 0 10px}}
.push-card{{display:flex;gap:12px;align-items:center;padding:10px 0;text-decoration:none;color:#222;border-top:1px solid #eee}}
.push-card:first-of-type{{border-top:0}}
.push-card img{{width:112px;height:48px;object-fit:cover;border-radius:5px;background:#eee;flex:0 0 auto}}
.push-card span{{min-width:0;display:block}}
.push-card b{{display:block;font-size:14px;line-height:1.45}}
.push-card small{{display:block;color:#888;font-size:11px;line-height:1.45;margin-top:3px}}
.article-block{{max-width:677px;margin:0 auto 18px;background:#fff;padding:24px 20px 48px;border-radius:14px}}
.article-index{{font-size:10px;letter-spacing:.12em;color:#aaa;margin:0 0 8px}}
h1{{font-size:22px;line-height:1.45;font-weight:700;margin:0 0 12px}}
.meta{{font-size:14px;color:#888;line-height:1.6;margin-bottom:22px}}
.wx-content{{font-size:16px;line-height:1.75;word-break:break-word;overflow-wrap:anywhere}}
.wx-content img{{max-width:100%!important;height:auto!important}}
.wx-content *{{max-width:100%}}
.source-link{{display:block;margin-top:28px;padding-top:16px;border-top:1px solid #eee;color:#576b95;text-decoration:none;font-size:15px}}
@media(max-width:520px){{.bundle{{padding:10px 0 36px}}.bundle-head,.article-block{{border-radius:0}}.article-block{{padding:20px 17px 42px}}h1{{font-size:22px}}}}
</style>
</head>
<body>
<main class="bundle">
<section class="bundle-head">
<p>WECHAT PUSH PREVIEW · 共 {len(items)} 篇</p>
{''.join(card_nav)}
</section>
{''.join(rendered)}
<!-- Preview source: WeChat draft/get. version hash: {preview_slug(media_id, draft)} -->
</main>
</body>
</html>"""


def write_draft_preview(draft: dict, *, media_id: str, preview_dir: Path, base_url: str):
    slug = preview_slug(media_id, draft)
    preview_dir.mkdir(parents=True, exist_ok=True)
    path = preview_dir / f"{slug}.html"
    path.write_text(render_wechat_draft_preview(draft, media_id=media_id), encoding="utf-8")
    latest = preview_dir / "latest.html"
    latest.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return path, f"{base_url.rstrip('/')}/{slug}.html"


def load_state(path: Path):
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")



def pending_retrospective_request():
    if not RETROSPECTIVE_TRIGGER.exists():
        return None
    try:
        request = json.loads(RETROSPECTIVE_TRIGGER.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(request, dict) or str(request.get("action") or "") != "sync_retrospective_draft":
        return None
    request_id = str(request.get("requestId") or "").strip()
    manifest_rel = str(request.get("manifest") or "").strip()
    if not request_id or not manifest_rel:
        return None
    state = load_state(DEFAULT_RETROSPECTIVE_STATE)
    if str(state.get("lastRequestId") or "") == request_id:
        return None
    manifest_path = (ROOT / manifest_rel).resolve()
    try:
        manifest_path.relative_to(ROOT.resolve())
    except ValueError as exc:
        raise RuntimeError("retrospective manifest escapes repository") from exc
    if not manifest_path.exists():
        raise RuntimeError(f"retrospective manifest missing: {manifest_rel}")
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError("invalid retrospective manifest")
    return request, data


def pending_publish_request(publication_date: str):
    if not PUBLISH_TRIGGER.exists():
        return None
    try:
        request = json.loads(PUBLISH_TRIGGER.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(request, dict):
        return None
    if str(request.get("action") or "") != "publish_daily_draft":
        return None
    request_id = str(request.get("requestId") or "").strip()
    if not request_id:
        return None
    requested_date = str(request.get("publicationDate") or publication_date).strip()
    if requested_date != publication_date:
        return None

    state = load_state(DEFAULT_PUBLISH_STATE)
    if str(state.get("lastRequestId") or "") == request_id:
        return None
    return request


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--create", action="store_true", help="create or update the WeChat draft, then read it back and build the preview")
    parser.add_argument("--media-id", default="", help="adopt/update an existing WeChat draft media_id")
    parser.add_argument("--preview-dir", default=str(DEFAULT_PREVIEW_DIR))
    parser.add_argument("--preview-base-url", default=DEFAULT_PREVIEW_BASE_URL)
    parser.add_argument("--env-file", default=str(DEFAULT_ENV))
    parser.add_argument("--cover", default=str(DEFAULT_COVER))
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    parser.add_argument("--title-prefix", default="")
    parser.add_argument("--featured-pdf", default="", help="optional local PDF path used instead of downloading the featured paper PDF")
    parser.add_argument("--publish", action="store_true", help="submit the updated draft for publication and wait for final status")
    args = parser.parse_args()

    retrospective = pending_retrospective_request()
    if retrospective:
        request, data = retrospective
        slug = str(data.get("slug") or request.get("slug") or "retrospective").strip()
        title = str(data.get("title") or "").strip()
        digest = str(data.get("digest") or "").strip()
        source_url = str(data.get("source_url") or DEFAULT_SOURCE_URL).strip()
        if not title or not digest:
            raise RuntimeError("retrospective title/digest missing")

        if not args.create:
            print(json.dumps({
                "stage": "plan",
                "mode": "retrospective",
                "slug": slug,
                "title": title,
                "source_url": source_url,
                "note": "No preview URL is created before the WeChat draft is written.",
            }, ensure_ascii=False))
            return 0

        load_env(Path(args.env_file))
        token = get_access_token()
        uploaded_urls, local_images = upload_featured_images(token, data, args.featured_pdf)
        content = build_retrospective_content(data, uploaded_urls)
        cover_path = prepare_cover_from_local(data, local_images)
        if cover_path is not None:
            thumb_media_id = upload_permanent_image(token, cover_path, DEFAULT_RETROSPECTIVE_COVER_CACHE)
        else:
            fallback = next(iter(local_images.values()), Path(args.cover))
            thumb_media_id = upload_cover(token, fallback, DEFAULT_RETROSPECTIVE_COVER_CACHE)

        article = {
            "article_type": "news",
            "title": title,
            "author": "化之岛",
            "digest": digest,
            "content": content,
            "content_source_url": source_url,
            "thumb_media_id": thumb_media_id,
            "need_open_comment": 0,
            "only_fans_can_comment": 0,
        }
        cover = data.get("cover") if isinstance(data.get("cover"), dict) else {}
        if cover.get("crop_235_1"):
            article["pic_crop_235_1"] = str(cover["crop_235_1"])
        if cover.get("crop_1_1"):
            article["pic_crop_1_1"] = str(cover["crop_1_1"])

        state = load_state(DEFAULT_RETROSPECTIVE_STATE)
        drafts = state.get("drafts") if isinstance(state.get("drafts"), dict) else {}
        prior = drafts.get(slug) if isinstance(drafts.get(slug), dict) else {}
        media_id = str(prior.get("media_id") or "").strip()
        if media_id:
            result = update_draft(token, media_id, article)
            stage = "draft_update"
        else:
            result = create_draft(token, article)
            media_id = str(result.get("media_id") or "")
            stage = "draft_add"
        if not media_id:
            raise RuntimeError("retrospective draft write succeeded but no media_id is available")

        draft = get_draft(token, media_id)
        preview_path, preview_url = write_draft_preview(
            draft,
            media_id=media_id,
            preview_dir=Path(args.preview_dir),
            base_url=args.preview_base_url,
        )
        drafts[slug] = {
            "media_id": media_id,
            "title": title,
            "preview_url": preview_url,
            "updatedAt": int(time.time()),
        }
        save_state(DEFAULT_RETROSPECTIVE_STATE, {
            "lastRequestId": str(request.get("requestId") or ""),
            "drafts": drafts,
        })
        print(json.dumps({
            "stage": stage,
            "mode": "retrospective",
            "slug": slug,
            "errcode": result.get("errcode", 0),
            "errmsg": result.get("errmsg", "ok"),
            "media_id": media_id,
            "paper_count": 1,
            "publicationSlot": None,
            "draft_readback": "ok",
            "preview_path": str(preview_path),
            "preview_url": preview_url,
            "content_source_url": source_url,
            "title": title,
        }, ensure_ascii=False))
        return 0

    slot, papers = load_latest_release()
    publication_date = slot[:10]
    featured = load_featured(publication_date)
    edition = load_edition(publication_date)
    title = str(
        edition.get("title")
        or f"{args.title_prefix}有机合成文献日报｜{publication_date} · 每日精选"
    )
    digest = (
        str(edition.get("digest") or "").strip()
        or (
            f"今日新增{len(papers)}篇有机合成文献，并精选1篇进行由浅入深的深度解读。"
            if featured
            else f"今日新增{len(papers)}篇有机合成文献。"
        )
    )
    source_url = (
        f"https://gallery.gczhouwld.com/?edition={urllib.parse.quote(publication_date)}"
        if featured
        else args.source_url
    )
    retrospective_slug = str(edition.get("retrospective") or "").strip()

    if not args.create:
        print(json.dumps({
            "stage": "plan",
            "publicationSlot": slot,
            "paper_count": len(papers),
            "featured": bool(featured),
            "retrospective": retrospective_slug or None,
            "title": title,
            "dois": [x["doi"] for x in papers],
            "note": "No preview URL is created before the WeChat draft is written.",
        }, ensure_ascii=False))
        return 0

    load_env(Path(args.env_file))
    token = get_access_token()
    uploaded_urls, local_images = upload_featured_images(token, featured, args.featured_pdf)
    content = build_content(slot, papers, featured, uploaded_urls)

    highres_cover = prepare_featured_cover(featured, args.featured_pdf)
    if highres_cover is None and featured:
        highres_cover = prepare_cover_from_local(featured, local_images)
    if highres_cover is not None:
        thumb_media_id = upload_permanent_image(token, highres_cover, DEFAULT_CACHE)
    else:
        cover_path = Path(args.cover)
        if local_images.get("fig1"):
            cover_path = local_images["fig1"]
        thumb_media_id = upload_cover(token, cover_path, DEFAULT_CACHE)

    daily_article = {
        "article_type": "news",
        "title": title,
        "author": "化之岛",
        "digest": digest,
        "content": content,
        "content_source_url": source_url,
        "thumb_media_id": thumb_media_id,
        "need_open_comment": 0,
        "only_fans_can_comment": 0,
    }
    if featured and isinstance(featured.get("cover"), dict):
        cover = featured["cover"]
        if cover.get("crop_235_1"):
            daily_article["pic_crop_235_1"] = str(cover["crop_235_1"])
        if cover.get("crop_1_1"):
            daily_article["pic_crop_1_1"] = str(cover["crop_1_1"])

    articles = [daily_article]
    if retrospective_slug:
        retro = load_retrospective_slug(retrospective_slug)
        if retro:
            retro_uploaded, retro_local = upload_featured_images(token, retro, "")
            retro_content = build_retrospective_content(retro, retro_uploaded)
            retro_cover_path = prepare_cover_from_local(retro, retro_local)
            if retro_cover_path is not None:
                retro_thumb = upload_permanent_image(
                    token, retro_cover_path, DEFAULT_RETROSPECTIVE_COVER_CACHE
                )
            else:
                retro_fallback = next(iter(retro_local.values()), Path(args.cover))
                retro_thumb = upload_cover(
                    token, retro_fallback, DEFAULT_RETROSPECTIVE_COVER_CACHE
                )
            retro_article = {
                "article_type": "news",
                "title": str(retro.get("title") or "往期精选"),
                "author": "化之岛",
                "digest": str(retro.get("digest") or ""),
                "content": retro_content,
                "content_source_url": str(retro.get("source_url") or DEFAULT_SOURCE_URL),
                "thumb_media_id": retro_thumb,
                "need_open_comment": 0,
                "only_fans_can_comment": 0,
            }
            retro_cover = retro.get("cover") if isinstance(retro.get("cover"), dict) else {}
            if retro_cover.get("crop_235_1"):
                retro_article["pic_crop_235_1"] = str(retro_cover["crop_235_1"])
            if retro_cover.get("crop_1_1"):
                retro_article["pic_crop_1_1"] = str(retro_cover["crop_1_1"])
            articles.append(retro_article)

    state = load_state(DEFAULT_STATE)
    requested_media_id = str(args.media_id or "").strip()
    same_day_state = (
        isinstance(state, dict)
        and str(state.get("publicationDate") or "") == publication_date
        and str(state.get("media_id") or "").strip()
    )
    media_id = requested_media_id or (str(state.get("media_id")) if same_day_state else "")

    if media_id:
        existing = get_draft(token, media_id)
        existing_items = existing.get("news_item") if isinstance(existing, dict) else []
        if isinstance(existing_items, list) and len(existing_items) == len(articles):
            for index, item in enumerate(articles):
                update_draft(token, media_id, item, index=index)
            result = {"errcode": 0, "errmsg": "ok"}
            stage = "draft_update"
        else:
            result = create_draft(token, articles)
            media_id = str(result.get("media_id") or "")
            stage = "draft_add_bundle_replacement"
    else:
        result = create_draft(token, articles)
        media_id = str(result.get("media_id") or "")
        stage = "draft_add"

    if not media_id:
        raise RuntimeError("draft write succeeded but no media_id is available")

    save_state(
        DEFAULT_STATE,
        {
            "publicationDate": publication_date,
            "publicationSlot": slot,
            "media_id": media_id,
            "title": title,
            "articleCount": len(articles),
            "retrospective": retrospective_slug or None,
        },
    )

    draft = get_draft(token, media_id)
    preview_path, preview_url = write_draft_preview(
        draft,
        media_id=media_id,
        preview_dir=Path(args.preview_dir),
        base_url=args.preview_base_url,
    )

    output_payload = {
        "stage": stage,
        "errcode": result.get("errcode", 0),
        "errmsg": result.get("errmsg", "ok"),
        "media_id": media_id,
        "paper_count": len(papers),
        "article_count": len(articles),
        "retrospective": retrospective_slug or None,
        "publicationSlot": slot,
        "draft_readback": "ok",
        "preview_path": str(preview_path),
        "preview_url": preview_url,
        "content_source_url": source_url,
    }

    publish_request = pending_publish_request(slot[:10])
    should_publish = bool(args.publish or publish_request)
    if should_publish:
        publish_id = submit_publish(token, media_id)
        published = wait_for_publish(token, publish_id)
        output_payload.update({
            "stage": "published",
            "publish_id": publish_id,
            **published,
        })
        if publish_request:
            save_state(
                DEFAULT_PUBLISH_STATE,
                {
                    "lastRequestId": str(publish_request.get("requestId") or ""),
                    "publicationDate": slot[:10],
                    "publish_id": publish_id,
                    **published,
                },
            )

    print(json.dumps(output_payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(
            json.dumps(
                {"stage": "error", "error": str(exc)},
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        raise SystemExit(1)
